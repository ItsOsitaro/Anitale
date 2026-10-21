// temp: diagnose AniList 403 — direct vs local proxy, with browser-like headers
import { fetch, ProxyAgent } from 'undici';
import fs from 'node:fs';

const QUERY = 'query { Page(perPage: 1) { media(idMal: 16498, type: ANIME) { idMal title { romaji } } } }';
const url = /^PROXY_URL=(.*)$/m.exec(fs.readFileSync('server/.env', 'utf8'))?.[1]?.trim() || '';

const tries = [
  { name: 'direct', dispatcher: undefined },
  ...(url ? [{ name: `proxy ${url}`, dispatcher: new ProxyAgent(url) }] : []),
  { name: 'proxy 127.0.0.1:10809 (README hint)', dispatcher: new ProxyAgent('http://127.0.0.1:10809') },
  { name: 'proxy 127.0.0.1:7890 (clash default)', dispatcher: new ProxyAgent('http://127.0.0.1:7890') },
];

for (const attempt of tries) {
  try {
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ query: QUERY }),
      dispatcher: attempt.dispatcher,
      signal: AbortSignal.timeout(8000),
    });
    const body = await response.text();
    console.log(`${attempt.name}: ${response.status} — ${body.slice(0, 120)}`);
  } catch (error) {
    console.log(`${attempt.name}: FAIL ${error.cause?.code ?? error.message}`);
  }
}
