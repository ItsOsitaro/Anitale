// Tiny fixed-parallelism mapper. Runs `worker` over `items` with at most
// `concurrency` work items in flight and resolves results in the original
// order. A rejecting worker fences the whole call like Promise.all — bulk
// callers convert per-item failures into gentle warnings, so nothing is
// expected to reject mid-flight.
export const mapPool = async (items, concurrency, worker) => {
  const results = new Array(items.length);
  if (items.length === 0) return results;
  let next = 0;
  const slots = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: slots }, async () => {
    for (;;) {
      if (next >= items.length) return;
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
};
