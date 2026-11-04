# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Primary: general public, Persian speakers.** People interested in anime and manga who want to find titles in Persian, keep a personal watch/read list, rate and review, and get recommendations. Mostly on phones, often on Iranian internet (slow, filtered, CDN in front).
- **Secondary: content admins** (the owner and any helpers) who import titles, translate synopses, approve user edit suggestions, and moderate reviews and recommendations through the admin panel (`/admin`). Their tool-like workflows matter as much as the public site.

## Product Purpose
Anitale (انی‌تیل) is a MyAnimeList-style anime and manga catalog in Persian (RTL first, English secondary) at anitale.itsositaro.ir. It lets members keep personal lists with statuses, scores and progress, read community reviews and recommendations, follow other users, build title stacks, and browse by genre, season, studio, ranking and schedule. Success is people using it as their daily list and discovery tool instead of an English-only site.

## Positioning
Persian and right-to-left from the foundation, with a Persian-speaking community (reviews, recommendations, stacks, edit suggestions) and a public read-only API. Its catalog comes from MyAnimeList data through the Tenrai API, but the language, community and privacy model are its own and cannot be copied by pointing at an English site.

## Operating Context
- Single independent developer-owner (Mehrdad, Iran); a beginner at server administration, so changes ship in small, tested, deployable steps.
- React 19 + Vite 7 SPA, Express 5 API, built-in SQLite. Runs on one small Linux server (1 vCPU, 1–2 GB RAM) behind the Arvan CDN; the project folder is synced with Syncthing; `.git` is not synced.
- Data source: Tenrai API (MAL data), AniList as fallback; Persian titles and synopses are translated semi-automatically and by user suggestions.
- Separate mobile UI at 820px and below (`src/components/mobile`); desktop and mobile share data and i18n.

## Capabilities and Constraints
- Personal lists (anime and manga) with five statuses, score, progress, tags, dates, priority; MAL XML/CSV/JSON import and export.
- Catalog, advanced search, genre/theme/demographic grouping, studio/producer/magazine pages, rankings (Bayesian, source score only), seasonal and weekly schedule, characters and people pages, episodes/videos/pictures.
- Community: reviews with helpful votes, "if you liked this" recommendations, favorites, taste match, about-me markup, follows, stacks, edit suggestions with admin approval.
- Public API `/api/v1`: read-only, no key, 60 requests/minute per IP, sensitive titles always removed. `/llms.txt` exists.
- Sensitive content (Ecchi/Erotica/Hentai genres or Rx rating) is hidden by default, with a per-device toggle; a user's own list is never filtered.
- Privacy per list (public/friends/private); "friends" are the people the list owner follows.
- Decided against, for now: forum, clubs, private messages, raw custom CSS, OAuth API.
- No new dependencies without the owner's approval. All user-visible text lives in i18n dictionaries (`src/i18n.js`, `src/admin/i18n.js`) in both Persian and English; logical CSS properties for RTL; only existing CSS tokens, no hard-coded colors.

## Brand Commitments
- The name "Anitale" / «انی‌تیل» and the current logo (`public/logo.svg`, `public/logo-mark.svg`) stay as they are.
- Persian is the primary language and voice; Vazirmatn Variable is the site font.

## Evidence on Hand
- A live site with real data (about 1,500 anime and 30 manga titles), real accounts, and a working admin panel.
- Lighthouse on the live site: accessibility, best practices, SEO and agentic browsing all 100 on mobile and desktop (2026-11-04); LCP about 1 second on throttled mobile, CLS 0.
- No testimonials, press, or user numbers are recorded; none should be invented.

## Product Principles
1. Persian and RTL are the default, never an afterthought; English follows.
2. Every user's list is theirs: privacy choices are respected everywhere, and sensitive content is opt-in to view.
3. Fast and light on a small server and on Iranian mobile networks; heavy work runs in the background and is cached.
4. Ship small and verified; anything depending on Tenrai is checked on the live server, not only against the mock.
5. Reuse what exists (tokens, i18n keys, shared components) before adding anything new.

## Accessibility & Inclusion
- Keep Lighthouse accessibility at 100: labels that match visible text, touch targets of at least 24px, valid markup, single page-level h1, keyboard and screen-reader access.
- Persian digits and RTL layout throughout; respect reduced motion.
