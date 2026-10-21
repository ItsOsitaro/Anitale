// Owner of the Postgres connection, running inside a worker thread. The main
// thread must call the database synchronously (node:sqlite semantics — 90+
// call sites consume .all()/.get()/.run() results inline, and express route
// handlers are sync), so this worker executes each query and signals the main
// thread back through a SharedArrayBuffer mailbox; the main thread blocks on
// Atomics.wait until the response lands.
//
// Single-slot protocol (the caller always blocks, so requests never overlap):
//   flags[0] reqSeq  — bumped by main when a request is ready
//   flags[1] resSeq  — bumped by worker when the response is ready
//   flags[2] reqLen  — request byte length
//   flags[3] resLen  — response byte length
//   flags[4] err     — 0 ok, 1 error (payload holds the message)
import { workerData } from 'node:worker_threads';
import postgres from 'postgres';

const { control, req, res, url } = workerData;
const flags = new Int32Array(control);

const client = postgres(url, {
  max: 5,
  idle_timeout: 60,
  connect_timeout: 15,
  prepare: false, // pgbouncer transaction mode has no named prepared statements
  onnotice: () => {},
  types: {
    // int8 -> Number: ids/count values must arrive as JS numbers like sqlite gave.
    int8: { to: 20, from: [20], serialize: (x) => String(x), parse: (x) => Number(x) },
  },
});

const reply = (bytes, isError) => {
  if (bytes.byteLength > res.byteLength) {
    const too = Buffer.from('[pg] response payload too large');
    new Uint8Array(res).set(too, 0);
    flags[3] = too.byteLength;
    flags[4] = 1;
  } else {
    new Uint8Array(res).set(bytes, 0);
    flags[3] = bytes.byteLength;
    flags[4] = isError ? 1 : 0;
  }
};

let seen = 0;
for (;;) {
  Atomics.wait(flags, 0, seen);
  seen = Atomics.load(flags, 0);
  const reqLen = Atomics.load(flags, 2);
  let body;
  try {
    body = JSON.parse(Buffer.from(new Uint8Array(req, 0, reqLen)).toString('utf8'));
  } catch (error) {
    reply(Buffer.from(`bad request envelope: ${error.message}`), true);
    Atomics.store(flags, 1, seen);
    Atomics.notify(flags, 1);
    continue;
  }
  try {
    const rows = await client.unsafe(body.sqlText, body.values ?? []);
    reply(Buffer.from(JSON.stringify({ rows: [...rows], count: rows.count ?? null })), false);
  } catch (error) {
    reply(Buffer.from(String(error?.message ?? error)), true);
  }
  Atomics.store(flags, 1, seen);
  Atomics.notify(flags, 1);
}
