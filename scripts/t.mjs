import '../server/config.js';
import { fetch, ProxyAgent } from 'undici';
const key = process.env.GEMINI_API_KEY;
const text = 'Translate to fluent Persian, return ONLY the translation: Light Yagami and a shinigami join a dungeon party.';
const body = JSON.stringify({
  contents: [{ role: 'user', parts: [{ text }] }],
  generationConfig: { temperature: 0.2 },
});
const attempts = [
  ['header+noH2', () => new ProxyAgent({ uri: 'http://127.0.0.1:10809', connect: { allowH2: false } }), `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`, { 'content-type': 'application/json', 'x-goog-api-key': key }],
  ['query+noH2', () => new ProxyAgent({ uri: 'http://127.0.0.1:10809', connect: { allowH2: false } }), `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${encodeURIComponent(key)}`, { 'content-type': 'application/json' }],
];
for (const [label, mk, url, headers] of attempts) {
  try {
    const r = await fetch(url, { method: 'POST', headers, body, dispatcher: mk() });
    const d = await r.json();
    console.log(label, '->', r.status, r.ok ? (d?.candidates?.[0]?.content?.parts || []).map((p) => p.text).join('') : JSON.stringify(d).slice(0, 200));
  } catch (e) { console.log(label, '-> FAIL:', e.cause?.code || e.message); }
}
process.exit(0);
