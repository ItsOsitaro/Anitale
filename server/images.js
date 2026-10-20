import fs from 'node:fs';
import path from 'node:path';
import { COVERS_DIR, TMP_DIR } from './db.js';

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

export const removeCoversForSlug = (slug, keep) => {
  for (const ext of ['jpg', 'png', 'webp']) {
    const name = `${slug}.${ext}`;
    if (name !== keep) fs.rmSync(path.join(COVERS_DIR, name), { force: true });
  }
};

export const saveCoverBuffer = (slug, buf) => {
  const ext = detectImageExt(buf);
  if (!ext) throw Object.assign(new Error('Cover must be a PNG, JPG or WebP image'), { status: 400 });
  if (buf.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('Cover is larger than 2 MB'), { status: 400 });
  const name = `${slug}.${ext}`;
  fs.writeFileSync(path.join(COVERS_DIR, name), buf);
  removeCoversForSlug(slug, name);
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

export const cleanupTemp = (maxAgeMs = 60 * 60 * 1000) => {
  for (const file of fs.readdirSync(TMP_DIR)) {
    const full = path.join(TMP_DIR, file);
    try { if (Date.now() - fs.statSync(full).mtimeMs > maxAgeMs) fs.rmSync(full, { force: true }); } catch { /* ignore */ }
  }
};
