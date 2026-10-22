// English -> Persian synopsis translation via Vercel AI Gateway.
// Server-side only (api/index.js / server/index.js). Call sites persist the
// result as the Persian half of the bilingual synopsis, so import (single +
// bulk), refresh and re-import all fill Persian automatically; manual admin
// edits keep authorship and are never overwritten.
//
// Auth: AI_GATEWAY_API_KEY works anywhere; on a Vercel deployment the OIDC
// token (VERCEL_OIDC_TOKEN) authenticates with zero configuration. Without
// either credential the module is disabled and callers fall back silently —
// an English-only row stays importable instead of failing.
const GATEWAY_URL = () => process.env.TRANSLATE_URL || 'https://ai-gateway.vercel.sh/v1/chat/completions';
const MODEL = () => process.env.TRANSLATE_MODEL || 'google/gemini-3.1-flash-lite';
const TIMEOUT_MS = 30_000;

const credential = () => process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || '';

export const translationEnabled = () => credential() !== '';

// Credits lines the source vendors append — never part of a clean translation.
const SOURCE_NOISE = /\s*\((?:Source:\s*[^)]+|Written by MAL Rewrite)\s*\)/gi;

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

export const translateSynopsis = async (text) => {
  const source = String(text || '').trim();
  if (!source) throw new Error('Synopsis text is empty');
  if (!translationEnabled()) throw new Error('No AI Gateway credential (set AI_GATEWAY_API_KEY)');

  const response = await fetch(GATEWAY_URL(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${credential()}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: MODEL(),
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
        { role: 'user', content: source.replace(SOURCE_NOISE, '').trim() || source },
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
