// English -> Persian synopsis translation. Fully local by default: the
// engine chain is —
//   1. Local NLLB-200 600M (ONNX, quantized, bundled in models/): runs on the
//      server itself, zero external calls at translate time. Set up once with
//      `npm run setup:model`; TRANSLATE_MODELS_DIR overrides its root.
//      TRANSLATE_FALLBACK_REMOTE=0 forbids every remote engine outright.
//   2. (fallback only, when the model is absent or errors) Google Translate
//      (unofficial gtx endpoint, keyless) -> MyMemory (keyless) -> optional
//      AI Gateway (only with AI_GATEWAY_API_KEY, or TRANSLATE_PROVIDER=ai
//      with Vercel OIDC — the best Persian, needs billing).
// TRANSLATE_PROVIDER pins one remote provider strictly: 'google'|'mymemory'|'ai'.
// Call sites persist the result as the Persian half of the bilingual synopsis,
// so import (single + bulk), refresh and re-import all fill Persian
// automatically; a provider failure falls through the chain, and exhaustion
// leaves the row English-only instead of failing the enclosing flow.
import fs from 'node:fs';
import path from 'node:path';

const NLLB_ID = 'Xenova/nllb-200-distilled-600M';
const NLLB_MODEL_DIR = path.join('Xenova', 'nllb-200-distilled-600M');
const AI_GATEWAY_URL = () => process.env.AI_GATEWAY_URL || 'https://ai-gateway.vercel.sh/v1/chat/completions';
const AI_MODEL = () => process.env.TRANSLATE_MODEL || 'google/gemini-3.1-flash-lite';
const REQUEST_TIMEOUT_MS = 20_000;
const MYMEMORY_CHUNK = 450;
// English chars per chunk fed to the local model: each piece stays well under
// the NLLB 1024-token context window, leaving room for the Persian output.
const LOCAL_CHUNK = 1100;

// Credits lines the source vendors append — never part of a clean translation.
const SOURCE_NOISE = /\s*\((?:Source:\s*[^)]+|Written by MAL Rewrite)\s*\)/gi;

const pinnedProvider = () => String(process.env.TRANSLATE_PROVIDER || '').trim().toLowerCase();

const cleanSource = (text) =>
  String(text || '').replace(SOURCE_NOISE, '').replace(/\s+/g, ' ').trim();

// Split into sentence-ish pieces under a byte budget, so every vendor's URL /
// query limit is respected while paragraphs still translate in order.
const chunkSource = (text, max) => {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if (!current) { current = sentence; continue; }
    if (Buffer.byteLength(`${current} ${sentence}`, 'utf8') <= max) current = `${current} ${sentence}`;
    else { chunks.push(current); current = sentence; }
  }
  if (current) chunks.push(current);
  // A single resume-length sentence can still overflow — break it on words.
  for (let i = 0; i < chunks.length; i += 1) {
    if (Buffer.byteLength(chunks[i], 'utf8') <= max) continue;
    const words = chunks[i].split(/\s+/);
    const pieces = [];
    let rebuilt = '';
    for (const word of words) {
      const candidate = rebuilt ? `${rebuilt} ${word}` : word;
      if (Buffer.byteLength(candidate, 'utf8') <= max) rebuilt = candidate;
      else { pieces.push(rebuilt); rebuilt = word; }
    }
    pieces.push(rebuilt);
    chunks.splice(i, 1, ...pieces);
  }
  return chunks;
};

const aiCredential = () => process.env.AI_GATEWAY_API_KEY || (pinnedProvider() === 'ai' ? process.env.VERCEL_OIDC_TOKEN || '' : '');

// ---- engine 0: local NLLB-600M (the default, no network) --------------------
// Weights ship in models/Xenova/nllb-200-distilled-600M (fetch once via
// scripts/fetch-model.mjs). The model loads lazily and is memoized per
// process; translations serialize through a promise chain so the in-process
// CPU cost stays bounded. allowRemoteModels = false guarantees translate
// time never phones home.
const modelsRoot = () => process.env.TRANSLATE_MODELS_DIR || path.resolve('models');

// Cheap probe used by import wiring: bulk import defers its Persian filling
// to the backfill job while the heavy local engine is what is in charge.
export const localEngineActive = () => fs.existsSync(path.join(modelsRoot(), NLLB_MODEL_DIR, 'config.json'));

let localTranslatorPromise = null;
let localChain = Promise.resolve();

const getLocalTranslator = () => {
  if (localTranslatorPromise) return localTranslatorPromise;
  if (!localEngineActive()) throw new Error('Local NLLB model is missing — run `npm run setup:model` once');
  localTranslatorPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.localModelPath = modelsRoot();
    env.allowRemoteModels = false; // strictly offline at translate time
    // Session trim: 2 ORT threads + CPU mem arena disabled keep the resident
    // footprint ~1.8GB (the unrestricted arena climbs to ~2.9GB and OOMs the
    // serverless memory cap). Serial translations queue above through
    // localChain, so stripping threads costs latency only, not throughput.
    return pipeline('translation', NLLB_ID, {
      dtype: 'q8',
      session_options: { intra_op_num_threads: 2, enableCpuMemArena: false },
    });
  })();
  return localTranslatorPromise;
};

const localTranslate = async (text) => {
  const translator = await getLocalTranslator();
  const chunks = chunkSource(text, LOCAL_CHUNK);
  const parts = [];
  for (const chunk of chunks) {
    const [output] = await translator(chunk, {
      src_lang: 'eng_Latn',
      tgt_lang: 'pes_Arab',
      max_new_tokens: 480,
      // Counterweight to quantization noise: the untuned q8 run sometimes
      // doubles words (e.g. «دانشجو دانشجو») — a light repetition penalty
      // plus an n-gram block removes those artifacts while real repeated
      // content words survive.
      repetition_penalty: 1.15,
      no_repeat_ngram_size: 4,
    });
    const piece = String(output?.translation_text || '').trim();
    if (!piece) throw new Error('Local NLLB returned empty text');
    parts.push(piece);
  }
  return parts.join(' ');
};

// Serialized facade: concurrent callers wait instead of racing the tokenizer /
// ORT session (CPU-bound anyway).
const localTranslateQueued = (text) => {
  const run = localChain.then(() => localTranslate(text));
  localChain = run.then(() => undefined, () => undefined); // queue survives errors
  return run;
};

// ---- provider 1: Google Translate (gtx) -----------------------------------
const googleTranslate = async (text) => {
  const parts = [];
  for (const chunk of chunkSource(text, 460)) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fa&dt=t&q=${encodeURIComponent(chunk)}`;
    const response = await fetch(url, {
      headers: {
        accept: 'application/json, text/javascript',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Google translate ${response.status}`);
    const data = await response.json();
    const piece = Array.isArray(data) && Array.isArray(data[0])
      ? data[0].map((segment) => (Array.isArray(segment) ? segment[0] : '')).join(' ').replace(/\s+/g, ' ').trim()
      : '';
    if (!piece) throw new Error('Google translate returned empty text');
    parts.push(piece);
  }
  return parts.join(' ');
};

// ---- provider 2: MyMemory --------------------------------------------------
const myMemoryTranslate = async (text) => {
  const email = String(process.env.MYMEMORY_EMAIL || '').trim();
  const parts = [];
  for (const chunk of chunkSource(text, MYMEMORY_CHUNK)) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|fa${email ? `&de=${encodeURIComponent(email)}` : ''}`;
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`MyMemory ${response.status}`);
    const data = await response.json();
    const translated = String(data?.responseData?.translatedText || '').trim();
    if (!translated || translated.toUpperCase().startsWith('MYMEMORY WARNING')) {
      throw new Error(`MyMemory rejected the request${data?.responseDetails ? `: ${String(data.responseDetails).slice(0, 80)}` : ''}`);
    }
    parts.push(translated);
  }
  return parts.join(' ');
};

// ---- provider 3 (optional): AI Gateway --------------------------------------
const aiGatewayTranslate = async (text) => {
  if (!aiCredential()) throw new Error('No AI Gateway credential (set AI_GATEWAY_API_KEY)');
  const response = await fetch(AI_GATEWAY_URL(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${aiCredential()}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS * 2),
    body: JSON.stringify({
      model: AI_MODEL(),
      temperature: 0,
      max_tokens: 2500,
      messages: [
        {
          role: 'system',
          content: [
            'You translate anime/manga synopses from English into natural, fluent Persian (فارسی) for a Persian streaming/library site.',
            'Rules: translate faithfully — no summarizing, no additions, no omissions.',
            'Render character and place names as their established Persian transliteration.',
            'Strip source-credit lines such as "Source: Crunchyroll" or "Written by MAL Rewrite".',
            'Return ONLY the translated Persian text — no quotes, no notes, no explanation.',
          ].join(' '),
        },
        { role: 'user', content: text },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`AI Gateway ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = await response.json();
  const translated = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!translated) throw new Error('AI Gateway returned an empty translation');
  return translated;
};

const PROVIDERS = {
  local: localTranslateQueued,
  google: googleTranslate,
  mymemory: myMemoryTranslate,
  ai: aiGatewayTranslate,
};

// Engine order: the bundled NLLB model owns every translation; the remote
// providers exist as error fallbacks while the model is absent or mid-setup.
// TRANSLATE_FALLBACK_REMOTE=0 makes the chain strictly local.
const remoteFallbackAllowed = () => String(process.env.TRANSLATE_FALLBACK_REMOTE || '') !== '0';

const defaultChain = () => {
  const chain = [];
  if (localEngineActive()) chain.push('local');
  else console.error('[translate] local NLLB model missing — falling back to remote providers (run `npm run setup:model`); TRANSLATE_FALLBACK_REMOTE=0 forbids this');
  if (!localEngineActive() || remoteFallbackAllowed()) {
    chain.push('google', 'mymemory');
    if (process.env.AI_GATEWAY_API_KEY) chain.push('ai');
  }
  return chain;
};

export const translateSynopsis = async (text) => {
  const source = cleanSource(text);
  if (!source) throw new Error('Synopsis text is empty');
  const pinned = pinnedProvider();
  const chain = PROVIDERS[pinned] ? [pinned] : defaultChain();
  let lastError = null;
  for (const name of chain) {
    try {
      const startedAt = Date.now();
      const translated = await PROVIDERS[name](source);
      if (translated) {
        console.log(`[translate] ${name} ${Date.now() - startedAt}ms (${Buffer.byteLength(source)}B en)`);
        return translated;
      }
      throw new Error(`${name} returned empty text`);
    } catch (error) {
      lastError = error;
      console.error(`[translate] ${name}: ${error.message}`);
    }
  }
  throw lastError || new Error('All translation providers failed');
};

// Persian synopsis policy for rows receiving fresh source English text.
// manual fa (no auto flag) -> preserved verbatim; pipeline fa -> refreshed only
// when the source actually changed; empty -> translated from the source. A
// translation failure never fails the enclosing flow — the row lands with the
// best Persian it has (its previous auto text, or none).
// `stored` is the row's current synopsis: object { fa, en, auto? } or plain text.
// `defer` (used by refresh-all when the local engine owns translation): skip
// every inline translation — rows land with whatever fa they already had; the
// backfill job fills the gaps afterwards at its own pace.
export const planPersian = async (freshEn, stored, { defer = false } = {}) => {
  const obj = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : null;
  const storedFa = obj ? (obj.fa || '') : '';
  const storedEn = obj ? (obj.en || '') : (stored || '');
  const storedAuto = !!(obj && obj.auto);
  const source = String(freshEn || '').trim();
  if (storedFa && !storedAuto) return { fa: storedFa, auto: false };
  if (storedFa && storedAuto && (!source || source === storedEn)) return { fa: storedFa, auto: true };
  if (source && !defer) {
    try {
      return { fa: await translateSynopsis(source), auto: true };
    } catch (error) {
      console.error(`[translate] Persian synopsis failed: ${error.message}`);
      if (storedFa) return { fa: storedFa, auto: true };
    }
  }
  if (storedFa) return { fa: storedFa, auto: true };
  return { fa: '', auto: false };
};

// Freshly-imported entries only (no stored row yet): attach an auto Persian
// synopsis to a provider draft, mutating it with `synopsisFa`.
export const draftPersian = async (draft) => {
  if (!draft?.synopsis) return;
  try { draft.synopsisFa = await translateSynopsis(draft.synopsis); }
  catch (error) { console.error(`[translate] Persian synopsis failed: ${error.message}`); }
};
