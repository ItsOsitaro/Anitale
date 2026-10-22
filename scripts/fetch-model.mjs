// One-time model setup for the local NLLB translation engine (dev + the
// CLI production upload both read these gitignored files). Downloads the
// quantized NLLB-600M weights from Hugging Face into the layout
//   models/Xenova/nllb-200-distilled-600M/…
// Translators.js expects its `env.localModelPath` root to contain
// <org>/<modelId>/ subfolders. Downloads are resumable (Range requests), so
// interrupted runs continue where they left off instead of restarting.
import { createWriteStream, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://huggingface.co/Xenova/nllb-200-distilled-600M/resolve/main';

// Remote uses the historical “tokenzier” misspelling; fall back to the
// correct name in case the repo gaines a properly spelled file later.
const FILES = [
  'config.json',
  'generation_config.json',
  'tokenizer.json',
  'tokenizer_config.json|tokenzier_config.json',
  'special_tokens_map.json',
  'quantize_config.json',
  'sentencepiece.bpe.model',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];

const targetDir = path.join(ROOT, 'models', 'Xenova', 'nllb-200-distilled-600M');
mkdirSync(path.join(targetDir, 'onnx'), { recursive: true });
console.log(`Fetching NLLB-600M (quantized) into ${targetDir}`);

for (const entry of FILES) {
  const [remote, fallback = remote] = entry.split('|');
  const dest = path.join(targetDir, ...remote.split('/'));
  await download(`${BASE}/${remote}`, dest) || await download(`${BASE}/${fallback}`, dest);
}
// Older fetch-model runs saved the tokenizer config under the repo's
// historical misspelling; transformers.js only reads the correct name.
const stale = path.join(targetDir, 'tokenzier_config.json');
if (existsSync(stale) && existsSync(path.join(targetDir, 'tokenizer_config.json'))) {
  rmSync(stale);
  console.log('✓ removed stale tokenzier_config.json');
}
console.log('Model setup complete.');

async function download(url, dest) {
  // Resume: continue an existing partial file instead of redownloading.
  let have = 0;
  try { have = statSync(dest).size; } catch { have = 0; }
  const head = await fetch(url, { method: 'HEAD' });
  if (!head.ok) return false;
  const total = Number(head.headers.get('content-length') || 0);
  if (total && have === total) {
    console.log(`✓ ${path.relative(ROOT, dest)} (${mb(total)}) — already complete`);
    return true;
  }
  const headers = have > 0 ? { range: `bytes=${have}-` } : {};
  const response = await fetch(url, { headers, redirect: 'follow' });
  if (!response.ok) return false;
  const resumable = response.status === 206 && have > 0;
  const flags = resumable ? 'a' : 'w';
  const start = resumable ? have : 0;
  const file = createWriteStream(dest, { flags });
  await pipeline(Readable.fromWeb(response.body), file);
  console.log(`✓ ${path.relative(ROOT, dest)} (${mb(start + (Number(response.headers.get('content-length') || 0)))})${resumable ? ' — resumed' : ''}`);
  return true;
}

function mb(bytes) { return `${(bytes / 1048576).toFixed(1)} MB`; }

