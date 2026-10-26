// English -> Persian synopsis translation. Default engine = keyless remote
// machine translation (no AI, no card):
//   Gemini API (GEMINI_API_KEY, free tier via aistudio.google.com — the best
//   Persian; placed first in the chain when the key exists)
//   -> Google Translate (unofficial gtx endpoint, keyless)
//   -> MyMemory (keyless)
//   -> optional AI Gateway (only with AI_GATEWAY_API_KEY, or TRANSLATE_PROVIDER=ai
//   with Vercel OIDC — needs billing).
// A fully-local NLLB-600M engine ALSO ships in this module (gitignored
// models/, fetched via `npm run setup:model`) but is opt-in only:
//   TRANSLATE_ENGINE=nllb → strictly local, zero network calls at translate
//   time. With the default TRANSLATE_ENGINE=remote the model files are simply
//   ignored, so a dev machine with fetched models never silently drifts away
//   from the remote chain.
// TRANSLATE_PROVIDER pins one remote provider strictly: 'google'|'mymemory'|'ai'.
// On top of every engine the anime glossary layer runs (see
// translate-glossary.mjs): protected terms/names are swapped to their
// established Persian forms before the engine ever sees the text, so the
// fandom-recognized spelling always wins over whatever the engine guesses.
// Call sites persist the result as the Persian half of the bilingual synopsis,
// so import (single + bulk), refresh and re-import all fill Persian
// automatically; a provider failure falls through the chain, and exhaustion
// leaves the row English-only instead of failing the enclosing flow.
import fs from 'node:fs';
import path from 'node:path';
import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { glossaryNames, glossaryTerms } from './translate-glossary.mjs';
import { getSetting } from './settings.js';

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

// ---- anime glossary layer (deterministic domain rules) -----------------------
// An ordinary MT endpoint cannot be prompted, so the rules become code: every
// glossary key present in the source is swapped IN PLACE for its established
// Persian form before the translate call (verified against gtx: embedded
// Persian words pass through the en->fa pipeline untouched while the sentence
// grammar adapts around them — «joins the گیلد» -> «به گیلد می‌پیوندد»).
// Wrapping keys in opaque tokens instead turned out fragile: gtx mangles dense
// brackets (⟧ -> ⧡, duplicated tokens, dropped sentence parts).
const GLOSSARY_RULES = Object.entries({ ...glossaryTerms, ...glossaryNames })
  // Longest keys first: "tailed beasts" must win over a partial "beast"...
  // and "Attack on Titan" over a bare "Titan".
  .sort((a, b) => b[0].length - a[0].length)
  .map(([key, persian]) => ({
    persian,
    regex: new RegExp(makeWordBoundary(key), 'gi'),
  }));

// Escape then word-boundary the key; keys are fandom spellings, plain
// alphanumeric words and optional spaces/hyphens — escape everything else.
function makeWordBoundary(key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `\\b${escaped}\\b`;
}

const prepareSource = (source) => {
  let text = source;
  for (const rule of GLOSSARY_RULES) {
    text = text.replace(rule.regex, rule.persian);
  }
  return text;
};

// Engine-level Persian fixes: the Arabic glyphs gtx sometimes mixes in
// (ی/ک), doubled spaces around punctuation, and stray padding.
const persianFixes = (fa) => fa
  .replace(/\u064A/g, 'ی')
  .replace(/\u0643/g, 'ک')
  .replace(/\s+([،؛؟!.])/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();

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

// The specifier is built at runtime on purpose: a literal dynamic import would
// be statically traced by the serverless bundler and pulled the ~300MB
// transformers/onnxruntime dependency into EVERY production function bundle —
// even while the engine stays 'remote' and never touches it.
const TRANSFORMERS_SPECIFIER = '@huggingface' + '/transformers';

const getLocalTranslator = () => {
  if (localTranslatorPromise) return localTranslatorPromise;
  if (!localEngineActive()) throw new Error('Local NLLB model is missing — run `npm run setup:model` once');
  localTranslatorPromise = (async () => {
    const { pipeline, env } = await import(TRANSFORMERS_SPECIFIER);
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

// ---- provider: Google Gemini API (needs GEMINI_API_KEY) ----------------------
// A consumer "Google AI Pro" subscription does NOT include API access — the
// key comes from AI Studio (https://aistudio.google.com/apikey) and has a
// generous free tier. The strongest Persian; best anime-domain quality. The
// glossary substitution already runs upstream, and the prompt pins the rest.
// Regional blocks (e.g. the Iranian exit IP) are routed through PROXY_URL via
// undici's ProxyAgent with HTTP/2 disabled — the v2Ray-class local proxies
// close undici's h2 tunnel mid-request, while plain h1.1 CONNECT passes.

const GEMINI_MODEL = () => process.env.GEMINI_MODEL || 'gemini-flash-latest';
// gemini-flash-latest occasionally answers 503 "high demand"; the lite alias
// is the immediately-available sibling and serves as the fallback shot.
const GEMINI_FALLBACK_MODEL = 'gemini-flash-lite-latest';

let geminiProxyAgent = null;
const geminiDispatcher = () => {
  const proxy = String(process.env.PROXY_URL || '').trim();
  if (!proxy) return undefined;
  if (!geminiProxyAgent) geminiProxyAgent = new ProxyAgent({ uri: proxy, connect: { allowH2: false } });
  return geminiProxyAgent;
};

const geminiAttempt = async (model, text, key) => {
  const dispatcher = geminiDispatcher();
  const backend = dispatcher ? undiciFetch : fetch;
  const response = await backend(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS * 3),
    ...(dispatcher ? { dispatcher } : {}),
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                'Translate the anime/manga synopsis below into natural, fluent Persian (فارسی) for a Persian streaming/library site.',
                'Rules: translate faithfully — no summarizing, no additions, no omissions.',
                'Persian words already present in the text are fixed anime-glossary terms — keep them EXACTLY as they stand.',
                'Render remaining character and place names as their established Persian transliteration.',
                'Strip source-credit lines such as "Source: Crunchyroll" or "Written by MAL Rewrite".',
                'Return ONLY the translated Persian text — no quotes, no notes, no explanation.',
              ].join('\n'),
            },
            { text },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2500 },
    }),
  });
  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    const reason = (() => { try { return JSON.parse(errBody)?.error?.message || errBody.slice(0, 160); } catch { return errBody.slice(0, 160); } })();
    throw new Error(`Gemini ${response.status}: ${reason}`);
  }
  const data = await response.json();
  const translated = (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
  if (!translated) throw new Error('Gemini returned an empty translation');
  return translated;
};

const geminiTranslate = async (text) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  const models = [...new Set([GEMINI_MODEL(), GEMINI_FALLBACK_MODEL])];
  let lastError = null;
  for (const model of models) {
    try {
      return await geminiAttempt(model, text, key);
    } catch (error) {
      lastError = error;
      console.error(`[translate] gemini/${model}: ${error.message}`);
    }
  }
  throw lastError || new Error('Gemini translation failed');
};

const PROVIDERS = {
  local: localTranslateQueued,
  google: googleTranslate,
  mymemory: myMemoryTranslate,
  gemini: geminiTranslate,
  ai: aiGatewayTranslate,
};

// Engine selection: TRANSLATE_ENGINE defaults to 'remote' — the keyless Google
// chain owns every translation. 'nllb' opts the deployment into the bundled
// local model: strictly local, zero network calls at translate time (the model
// must exist in models/ or every translation fails and the row stays
// English-only).
const engineMode = () =>
  (String(process.env.TRANSLATE_ENGINE || '').trim().toLowerCase() || 'remote');

// Bulk-import wiring probe: with the heavy local engine in charge, import
// batches defer their Persian filling to the backfill job; remote engines are
// fast enough to stay inline.
export const inlinePersianEnabled = () => engineMode() !== 'nllb';

// Admin Settings page choice, persisted in the settings table. Values other
// than 'auto'/empty become the PRIMARY provider; the rest of the default chain
// follows as resilience fallback so a bad pick can never stall imports.
const adminPreferredProvider = () => {
  const raw = String(getSetting('translate_provider', '')).trim().toLowerCase();
  return raw && raw !== 'auto' && PROVIDERS[raw] ? raw : '';
};

// Runtime state handed to GET /api/admin/settings: what the admin UI shows as
// the current pick plus which engines are actually usable on this deployment.
export const translatorState = () => ({
  chosen: getSetting('translate_provider', '') || 'auto',
  engine: engineMode(),
  geminiKey: Boolean(process.env.GEMINI_API_KEY),
  gatewayKey: Boolean(process.env.AI_GATEWAY_API_KEY),
  nllbReady: localEngineActive(),
});

// Engine order: when the remote mode owns translation the local engine is
// never consulted (models on disk stay inert); the paid AI provider gets a
// shot only if the deployment carries an explicit gateway key.
const defaultChain = () => {
  if (engineMode() === 'nllb') return ['local'];
  const chain = [];
  if (process.env.GEMINI_API_KEY) chain.push('gemini');
  chain.push('google', 'mymemory');
  if (process.env.AI_GATEWAY_API_KEY) chain.push('ai');
  return chain;
};

export const translateSynopsis = async (text) => {
  const source = cleanSource(text);
  if (!source) throw new Error('Synopsis text is empty');
  // Glossary in place: swap protected terms to their Persian forms before any
  // engine sees the text.
  const prepared = prepareSource(source);
  const strictPin = engineMode() === 'nllb' ? 'local' : (PROVIDERS[pinnedProvider()] ? pinnedProvider() : null);
  const adminPin = strictPin ? '' : adminPreferredProvider();
  const baseline = strictPin ? [strictPin] : defaultChain();
  // Admin pick (admin Settings) leads the chain; the rest of the baseline stays
  // behind as resilience so one dead provider can never stall imports.
  const chain = adminPin ? [adminPin, ...baseline.filter((name) => name !== adminPin)] : baseline;
  let lastError = null;
  for (const name of chain) {
    try {
      const startedAt = Date.now();
      const raw = await PROVIDERS[name](prepared);
      if (!raw) throw new Error(`${name} returned empty text`);
      const translated = persianFixes(raw);
      if (!translated) throw new Error(`${name} returned empty text after cleanup`);
      console.log(`[translate] ${name} ${Date.now() - startedAt}ms (${Buffer.byteLength(source)}B en)`);
      return translated;
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
