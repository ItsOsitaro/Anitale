import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR, SERVER_DIR } from './db.js';

// On Vercel the bundle is read-only; covers live in a writable /tmp mirror that
// lazy-stages files from the bundled public/covers folder. Locally nothing changes.
const VERCEL = process.env.VERCEL === '1';
export const BLOB_MODE = VERCEL && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
export const COVERS_DIR = VERCEL ? '/tmp/anitale-covers' : path.join(ROOT_DIR, 'public', 'covers');
export const TMP_DIR = VERCEL ? '/tmp/anitale-tmp' : path.join(SERVER_DIR, 'tmp');
const BUNDLED_COVERS = path.join(ROOT_DIR, 'public', 'covers');

// Blob SDK is loaded lazily: the sqlite/local path never touches @vercel/blob.
let blobClient = null;
const blob = async () => {
  if (!blobClient) blobClient = await import('@vercel/blob');
  return blobClient;
};

// The public base URL of the Blob store (https://<store>.public.blob.vercel-
// storage.com) is not plain configuration — resolve it once per instance from
// an existing blob's URL; a fresh store resolves itself on the first cover put.
let blobBase = null;
export const blobPublicBase = async () => {
  if (blobBase) return blobBase;
  const { list } = await blob();
  const { blobs } = await list({ limit: 1 });
  blobBase = blobs[0]?.url?.match(/^(https:\/\/[^/]+)/)?.[1] ?? null;
  return blobBase;
};

// Called once at serverless boot: mirror the committed cover files into the
// writable dir (missing-only copies, so warm instances stay cheap). Skipped in
// Blob mode — bundled covers are served statically and runtime covers redirect
// to the store, so the mirror is just cold-start latency.
export const stageBundledCovers = () => {
  if (!VERCEL || BLOB_MODE || !fs.existsSync(BUNDLED_COVERS)) return 0;
  fs.mkdirSync(COVERS_DIR, { recursive: true });
  let staged = 0;
  for (const name of fs.readdirSync(BUNDLED_COVERS)) {
    const dest = path.join(COVERS_DIR, name);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(path.join(BUNDLED_COVERS, name), dest);
      staged += 1;
    }
  }
  return staged;
};

fs.mkdirSync(COVERS_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Detect the real image type from magic bytes (never trust the client's MIME type or filename).
export const detectImageExt = (buf) => {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
};

// Which extension actually exists on disk for a slug? Search/offline
// fallbacks use this instead of blindly guessing .png.
export const coverUrlFor = (slug) => {
  for (const ext of ['jpg', 'png', 'webp']) {
    if (fs.existsSync(path.join(COVERS_DIR, `${slug}.${ext}`))) return `/covers/${slug}.${ext}`;
  }
  return '';
};

export const removeCoversForSlug = (slug, keep) => {
  const names = [];
  for (const ext of ['jpg', 'png', 'webp']) {
    const name = `${slug}.${ext}`;
    if (name !== keep) {
      fs.rmSync(path.join(COVERS_DIR, name), { force: true });
      names.push(name);
    }
  }
  // Durable copies also leave the store (fire-and-forget: the row is already
  // committed, and missing blobs simply resolve to nothing).
  if (BLOB_MODE && names.length) {
    blob().then(({ del }) => del(names.map((name) => `covers/${name}`)))
      .catch(() => { /* store copies may not exist */ });
  }
};

export const saveCoverBuffer = (slug, buf) => {
  const ext = detectImageExt(buf);
  if (!ext) throw Object.assign(new Error('Cover must be a PNG, JPG or WebP image'), { status: 400 });
  if (buf.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('Cover is larger than 2 MB'), { status: 400 });
  const name = `${slug}.${ext}`;
  fs.writeFileSync(path.join(COVERS_DIR, name), buf);
  removeCoversForSlug(slug, name);
  // Blob mode: the /tmp write above keeps same-instance reads instant; the
  // durable copy lands asynchronously, and cold instances serve it via the
  // /covers redirect (see handleCoverRequest in app.js).
  if (BLOB_MODE) {
    blob().then(async ({ put }) => {
      const saved = await put(`covers/${name}`, buf, { access: 'public', addRandomSuffix: false });
      if (!blobBase) blobBase = saved.url.match(/^(https:\/\/[^/]+)/)?.[1] ?? null;
    }).catch((error) => console.error(`[blob] durable cover copy failed (${name}):`, error.message));
  }
  return name;
};

export const saveTempCover = (buf) => {
  const ext = detectImageExt(buf);
  if (!ext) throw new Error('Downloaded file is not a supported image');
  const token = `${[...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('')}.${ext}`;
  fs.writeFileSync(path.join(TMP_DIR, token), buf);
  return token;
};

export const promoteTempCover = (slug, token) => {
  const file = path.join(TMP_DIR, path.basename(token));
  if (!fs.existsSync(file)) return null;
  const name = saveCoverBuffer(slug, fs.readFileSync(file));
  fs.rmSync(file, { force: true });
  return name;
};

// Durable-store bookkeeping for a slug rename: copy the renamed file up and
// clear the store copy under the old name (best-effort, fire-and-forget).
export const renameBlobCover = (fromName, toName) => {
  if (!BLOB_MODE || fromName === toName) return;
  blob().then(async ({ put, del }) => {
    await put(`covers/${toName}`, fs.readFileSync(path.join(COVERS_DIR, toName)), { access: 'public', addRandomSuffix: false });
    await del(`covers/${fromName}`).catch(() => { /* old copy may not exist */ });
  }).catch((error) => console.error(`[blob] cover rename (${toName}):`, error.message));
};

export const cleanupTemp = (maxAgeMs = 60 * 60 * 1000) => {
  for (const file of fs.readdirSync(TMP_DIR)) {
    const full = path.join(TMP_DIR, file);
    try { if (Date.now() - fs.statSync(full).mtimeMs > maxAgeMs) fs.rmSync(full, { force: true }); } catch { /* ignore */ }
  }
};

// Cover request on the deployment (Blob mode): when the file is mirrored in
// this warm instance, stream it; otherwise redirect to the durable Blob copy.
// Bundled covers never reach this handler on Vercel (static files win before
// rewrites), and locally BLOB_MODE is off — only the deployment uses this.
export const handleCoverRequest = async (req, res) => {
  const name = path.basename(String(req.url || '').split('?')[0]);
  if (!/^[\w.-]+\.(jpg|png|webp)$/.test(name)) {
    res.status(404).end();
    return;
  }
  try {
    const file = path.join(COVERS_DIR, name);
    if (fs.existsSync(file)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.sendFile(file);
      return;
    }
    const base = await blobPublicBase();
    if (base) {
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      res.redirect(302, `${base}/covers/${name}`);
      return;
    }
  } catch (error) {
    console.error(`[covers] ${name}:`, error.message);
  }
  res.status(404).end();
};
