# AGENTS.md

Anitale — a MyAnimeList-style anime/manga site: React 19 + Vite 7 SPA (`src/`), Express 5 API (`server/`), bilingual Persian (primary, RTL) / English. No TypeScript, no test framework, no lint config.

## Commands

- Requires **Node >= 22.13** (`engines` in package.json): the backend uses Node's built-in `node:sqlite`.
- First-time setup: `npm run setup-admin` — writes `server/.env` with `ADMIN_PASSWORD_HASH`. Until it exists, admin login returns 503.
- `npm start` — the dev loop: API on :3000 (`node --watch` server) + Vite site on http://127.0.0.1:5173 via `concurrently`. Admin at `/admin`.
- `npm run serve` — production-style single process (`vite build` + Express serves site and API on :3000).
- `npm run export:data` — re-exports `public/data/*.json` from the DB.
- Verification = `npm run build` + the smoke script. There is no `npm test`, no typecheck, no lint.
  - Smoke test (server must already be running):
    `SMOKE_ADMIN_USER=<user> SMOKE_ADMIN_PASS=<plaintext> node scripts/smoke.mjs [baseUrl]`
  - Credentials are passed **only on the command line** — `server/.env` stores only the
    password hash, never the plaintext. The script adds an Origin header for every write.
- Commit messages follow conventional commits with scopes, e.g. `feat(translate): …`, `fix(server): …`.

## Environment files

- `server/config.js` loads `server/.env` at the top of every server entrypoint — any new server-side env var must be read after that import.
- `server/.env` (gitignored): `ADMIN_USER`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `PORT`, provider tuning (`PROXY_URL`, `PROVIDER`, `JIKAN_DISABLED`, `GEMINI_API_KEY`, …). See `server/.env.example`.
- `.env.local` (repo root, gitignored): `POSTGRES_URL` for Neon — read by `scripts/pg-migrate.mjs` and supplied by Vercel as a linked integration.

## Data layer — the dual-engine constraint

- `server/db.js` exposes **one synchronous db handle shared by two engines**: Node built-in SQLite (`server/data.db`, WAL journal) locally; Neon Postgres on Vercel when `POSTGRES_URL`/`DATABASE_URL` is set. `server/pg.js` bridges Postgres into `node:sqlite`'s `prepare().all/get/run` API in a worker thread, translating the dialect.
- All SQL in `repo.js` / `users.js` / `auth.js` / `app.js` must stay in the subset that works on **both engines** — never raw sqlite-only or Postgres-only syntax.
- Arrays/stored objects are `TEXT` columns holding JSON (`genres`, `alt_synonyms`, …), round-tripped in `shape.js` / `repo.js`.
- First server start auto-seeds `data.db` from `public/data/*.json` (`server/seed.js`). Deployments seed the same way (`api/index.js`).
- `public/data/*.json` (tracked) is **generated**, never hand-edit: it is rewritten by `export-data.js` after every admin create/update/delete, and is also the offline fallback + seed source.

## Covers

- Locally: `public/covers/` (untracked — files exist on your machine, not in git).
- On Vercel the bundle is read-only: `server/images.js` stages covers into `/tmp/anitale-covers` and mirrors writes into Vercel Blob (store `anitale-covers`, `BLOB_READ_WRITE_TOKEN`). `/covers/:name` serves the warm-instance copy first, else redirects to the Blob CDN. Temp uploads go through `server/tmp/`.
- Slug changes rename cover files (copy, not move — the old file may still be referenced by static fallback data).

## Deployment (Vercel)

- `vercel.json`: `npm run build` → `dist`, `/api/*` and `/covers/*` → the `api/index.js` function, everything else → `/index.html` (SPA). `includeFiles` bundles `server/*.js`, `server/data.db*`, `public/data/**`, `public/covers/**`.
- **`.vercelignore` overrides `.gitignore` for what gets uploaded** — that's how the gitignored `data.db` snapshot and covers ride along; secrets (`server/.env`, `.env*`, `models/`) still stay out.
- Without Neon attached (`VERCEL=1`, no `POSTGRES_URL`): `api/index.js` copies `data.db` to a writable `/tmp` before `db.js` evaluates (it reads `DB_FILE` at import time) — SQLite writes live only for one warm instance.
- `node scripts/pg-migrate.mjs` — idempotent one-off DB migration SQLite → Neon (reads `.env.local`).

## Local server / Vite gotchas

- Vite dev proxies `/api` → 127.0.0.1:3000 and forwards the browser's `x-forwarded-host`; the API's CSRF guard (`sameOriginOnly`) and rate limiting require it (plus `TRUST_PROXY=1` behind Vercel's proxy).
- `auth.js` writes are cookie-session based; any script hitting the API must send a same-origin `Origin` header with state-changing requests.
- The Vite watcher ignores `public/data/**` and `public/covers/**` on purpose (export rewrites + uploads happen mid-dev-server; a reload would kill long-running admin sessions). A custom middleware (`live-public-covers` in `vite.config.js`) serves `/covers` straight from disk so freshly imported covers appear without restart.
- Server binds 127.0.0.1 by default; `HOST=0.0.0.0` in `server/.env` shares it on the LAN.

## Translation pipeline

- Imports/refresh auto-fill the Persian half of the bilingual synopsis (`server/translate.js`) unless provided. Default remote chain: Gemini (`GEMINI_API_KEY`) → keyless Google gtx → MyMemory → AI Gateway (only when keyed). A failure falls through the chain; total exhaustion leaves the row English-only.
- NLLB-600M local engine is opt-in: `TRANSLATE_ENGINE=nllb`; fetch weights with `npm run setup:model` into gitignored `models/`.
- `server/translate-glossary.mjs` pre-substitutes established Persian spellings (races, franchises, terms) before any engine runs — extend the glossary there, not per-engine.

## Frontend conventions

- Plain JSX (`checkJs` off, no tests) — correctness relies on smoke tests and the browser, not a compiler.
- Path alias `@` → `src/` (vite.config.js + jsconfig.json).
- Tailwind v4 via `@tailwindcss/vite`, styles in `src/tailwind.css`; shadcn-style components per `components.json` (FarsiUI schema, `rtl: true`, no `.tsx`).
- UI text goes through the i18n dictionaries (`src/i18n.js` public site, `src/admin/i18n.js` admin panel) — titles/synopses are bilingual data fields (fa + en), persisted in the DB.

## Repo notes

- `FEATURE-QUEUES.md` (Persian) is the feature roadmap; phases 1–2 (queues 1–28) are all done ✅ — check it before building something already shipped.
- `.opencode/instructions/INSTRUCTIONS.md` (loaded via `opencode.json`) holds generic coding-style rules from the ECC setup; the ECC "80% test coverage" mandate does not apply here — there is no test infra.
- Back up `server/data.db` and `public/covers/` — both are untracked working files, not in git.

## Mobile UI redesign rules
- The full design spec is in docs/mobile-ui-spec.md. Always read the relevant section before coding.
- NEVER change the desktop UI. All new styles apply only at max-width: 820px, and mobile components live in src/components/mobile/.
- Use only existing CSS tokens (--primary, --card, --border, --secondary, --accent, --muted-foreground...). No hard-coded colors.
- The site is RTL (dir="rtl"). Use logical properties (margin-inline-start, inset-inline-end, padding-inline). Font is Vazirmatn Variable.
- Do not add new dependencies unless I approve them.
- After every task run the build/typecheck and fix errors before reporting done.
## Project facts
- Stack: React 19 + Vite 7, plain JSX (NO TypeScript), react-router-dom, Tailwind v4 (only for src/components/ui/* and tokens in src/tailwind.css) plus a large plain CSS file style.css at the repo root.
- Almost everything lives in src/App.jsx (~1456 lines): SiteHeader (~line 76), HomePage (~629), SectionPage (catalog, ~974), DetailPage (~1122), AnimePage (~1396), AppRoutes (~1444).
- Legacy mobile CSS is in style.css (media queries at 1100, 900, 820, 520, 700px). It is abandoned: never edit style.css; the new mobile UI replaces it.
- New mobile code goes in: src/hooks/use-is-mobile.js (named export useIsMobile, matchMedia "(max-width: 820px)"), src/components/mobile/*.jsx and one stylesheet src/components/mobile/mobile.css.
- Switching desktop/mobile is done with the useIsMobile hook in AppRoutes (render MobileShell on mobile). Never make big edits to src/App.jsx; only small, targeted ones. Never move or rewrite desktop code.
- server/settings.js is a local file; never commit it.
