# Anitale Project Rules & Architecture

## Tech Stack & Deployment
- **Frontend:** React + Vite + Tailwind CSS (src/), bilingual Persian (RTL) and English (LTR) managed via src/i18n.js.
- **Backend:** Node.js + Express + SQLite (etter-sqlite3) in server/.
- **Production:** Ubuntu VPS (1 vCPU, 1 GB RAM) behind ArvanCloud CDN. Keep memory footprint low and use proper HTTP Cache-Control / ETag headers.

## Code Safety & Modularity (CRITICAL)
- Do NOT rewrite or truncate large files (server/app.js, src/App.jsx). Prefer creating small modular files (e.g., server/page-route.js) and importing them cleanly.
- Never modify server/.env or SQLite database files directly during tests.
- Always keep UI strings bilingual by adding keys to both a and en sections in src/i18n.js.
- Before finishing any task, verify syntax and run 
pm run build to ensure zero build errors.

## Workflow Rule
- ALWAYS present a brief step-by-step plan listing the files you intend to modify and wait for my explicit approval before editing any files.

## Automated Commit & Deploy
- When I ask you to commit and deploy (or finish an approved task with deploy), first check `git diff --stat` to ensure no unintended deletions, then run: `powershell -ExecutionPolicy Bypass -File .\deploy.ps1 "<conventional commit message>"`.
