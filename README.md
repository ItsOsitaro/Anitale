# Anitale

A MyAnimeList-style anime site (React + Vite) with a small local CMS: Express + SQLite backend and a bilingual (Persian / English) admin panel.

## First-time setup

```bash
npm install
npm run setup-admin        # asks for an admin username + password, creates server/.env
```

## Run (development)

```bash
npm start                  # API on :3000 + site on http://127.0.0.1:5173
```

- Site: http://127.0.0.1:5173
- Admin panel: http://127.0.0.1:5173/admin

The first start creates `server/data.db` and imports the titles from `public/data/*.json`.

## Run (production-style, one process)

```bash
npm run serve              # builds the site, then serves site + API on http://127.0.0.1:3000
```

## Adding anime

1. Open `/admin`, sign in, press **Add anime**.
2. Either import from MyAnimeList (search by name, or paste a MAL link / ID), review the filled form, press **Save**;
   or fill the form by hand and upload a cover.
3. Covers are stored in `public/covers/`, data in `server/data.db` (back these two up).

Refreshing an existing entry works the same way: in the edit form, search or paste the MAL link / ID and press
**Refresh form** to overwrite every field with the latest source data (Jikan, or AniList when Jikan is unreachable).
The current slug and airing day are kept, and nothing is written until you press **Save**.

Shortcuts for entries that already have a MyAnimeList id stored:

- **Admin list:** a **به‌روزرسانی / Refresh** button on each row and a **به‌روزرسانی همه / Refresh all** button in the
  toolbar re-fetch and update those entries server-side, then re-export `public/data/*.json`.
- **Edit form:** the import box is pre-filled with the entry's MAL link, so one click on **Search** refreshes the form.

### Weekly schedule & manga catalog

- The weekly airing schedule shown on the site (sidebar panel, seasonal lists) comes from the
  **Airing day** field in the admin form (`anime.airing_day` in the database) — nothing is hardcoded anymore.
- The manga catalog lives in the `manga` table (seeded from `public/data/manga.json` on first start) and is
  served by `GET /api/manga`. Editing manga from the admin panel is planned; for now its seed file is the source.

### Keeping `public/data/*.json` in sync

Every admin create/update/delete automatically rewrites `public/data/anime.json` + `anime-details.json` from the
database, so the site's offline fallback and the empty-database seed never drift. You can also run it manually:

```bash
npm run export:data
```


### If MyAnimeList / Jikan is blocked

Importing prefers `api.jikan.moe` (needs `cdn.myanimelist.net` for covers). If Jikan is unreachable, the server
automatically falls back to the AniList GraphQL API (`graphql.anilist.co`) for both search and import — same draft
shape, no configuration needed (scores come from AniList, so they can differ slightly from MAL). With a VPN you can
instead point the server at its local proxy by setting `PROXY_URL` in `server/.env`, e.g.
`PROXY_URL=http://127.0.0.1:10809`, then restart, to use genuine Jikan data. Manual entry works offline.

## Notes

- If the API is not running, the public site falls back to the static files in `public/data/`.
- The server listens on 127.0.0.1 only (not reachable from other devices).
- Scripts: `npm run seed` (re-import JSON, skips existing), `npm run hash-password -- <pw>`.
- Stack: React 19, react-router, Vite 7, Express 5, Node built-in SQLite (needs Node >= 22.13), zod, multer, bcryptjs.
