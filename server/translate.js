// English -> Persian synopsis translation. No card, no AI required: the
// pipeline rides ordinary machine-translation services, in a fixed fallback
// chain —
//   1. Google Translate (unofficial gtx endpoint): free, keyless, the default.
//      Unofficial = no SLA; heavy datacenter traffic may hit 429s, in which
//      case the chain moves on.
//   2. MyMemory: keyless (larger daily quota with MYMEMORY_EMAIL set), TM-based
//      quality, needs chunked requests (~500-byte caps).
//   3. AI Gateway (optional, off by default): only enabled when a translate
//      provider env (AI_GATEWAY_API_KEY, or TRANSLATE_PROVIDER=ai with Vercel
//      OIDC on a deployment) says so — the best Persian, needs billing.
// TRANSLATE_PROVIDER pins one provider strictly: 'google' | 'mymemory' | 'ai'.
// Call sites persist the result as the Persian half of the bilingual synopsis,
// so import (single + bulk), refresh and re-import all fill Persian
// automatically; a provider failure falls through the chain, and exhaustion
// leaves the row English-only instead of failing the enclosing flow.
const AI_GATEWAY_URL = () => process.env.AI_GATEWAY_URL || 'https://ai-gateway.vercel.sh/v1/chat/completions';
const AI_MODEL = () => process.env.TRANSLATE_MODEL || 'google/gemini-3.1-flash-lite';
const REQUEST_TIMEOUT_MS = 20_000;
const MYMEMORY_CHUNK = 450;

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
  google: googleTranslate,
  mymemory: myMemoryTranslate,
  ai: aiGatewayTranslate,
};

// Default chain: keyless machine translation first; the paid AI provider gets
// a shot only if the deployment carries an explicit gateway key.
const defaultChain = () => {
  const chain = ['google', 'mymemory'];
  if (process.env.AI_GATEWAY_API_KEY) chain.push('ai');
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
      const translated = await PROVIDERS[name](source);
      if (translated) return translated;
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
export const planPersian = async (freshEn, stored) => {
  const obj = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : null;
  const storedFa = obj ? (obj.fa || '') : '';
  const storedEn = obj ? (obj.en || '') : (stored || '');
  const storedAuto = !!(obj && obj.auto);
  const source = String(freshEn || '').trim();
  if (storedFa && !storedAuto) return { fa: storedFa, auto: false };
  if (storedFa && storedAuto && (!source || source === storedEn)) return { fa: storedFa, auto: true };
  if (source) {
    try {
      return { fa: await translateSynopsis(source), auto: true };
    } catch (error) {
      console.error(`[translate] Persian synopsis failed: ${error.message}`);
      if (storedFa) return { fa: storedFa, auto: true };
    }
  }
  return { fa: '', auto: false };
};

// Freshly-imported entries only (no stored row yet): attach an auto Persian
// synopsis to a provider draft, mutating it with `synopsisFa`.
export const draftPersian = async (draft) => {
  if (!draft?.synopsis) return;
  try { draft.synopsisFa = await translateSynopsis(draft.synopsis); }
  catch (error) { console.error(`[translate] Persian synopsis failed: ${error.message}`); }
};
