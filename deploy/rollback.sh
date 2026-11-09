#!/usr/bin/env bash
# Go back to the version that was running before the last  deploy/update.sh. Run as root on the server:
#   bash deploy/rollback.sh              -> previous commit + previous build (saved by update.sh)
#   bash deploy/rollback.sh <commit>     -> a specific commit (rebuilds it, takes about 2 minutes)
# It never touches server/.env, the database or the covers. After a rollback the code is on an older commit: the next
# "git pull" brings the newer one back, so fix the problem on your PC and push before updating again.
set -u
APP_DIR=/var/www/anitale
SERVICE=anitale
PORT=3000
STATE=/root/.anitale-deploy
say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf '\033[31m!! %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" = 0 ] || die "Run as root (sudo -i first)."
cd "$APP_DIR" || die "Cannot open $APP_DIR"
TARGET="${1:-}"
[ -n "$TARGET" ] || { [ -f "$STATE/prev-commit" ] && TARGET=$(cat "$STATE/prev-commit"); }
[ -n "$TARGET" ] || die "No previous version is recorded. Give a commit:  bash deploy/rollback.sh <commit>"
git cat-file -e "$TARGET^{commit}" 2>/dev/null || die "Unknown commit: $TARGET"

say "Going back to $(git log --oneline -1 "$TARGET")"
git checkout -- public/data 2>/dev/null
git reset --hard "$TARGET" -q || die "git reset failed"

if [ -z "${1:-}" ] && [ -d "$STATE/dist-prev" ]; then
  say "Restoring the previous build"
  mkdir -p dist && rm -rf dist/* && cp -a "$STATE/dist-prev/." dist/
else
  say "Building that commit"
  npx vite build --outDir /tmp/anitale-rollback-build --emptyOutDir >/tmp/anitale-build.log 2>&1 || { tail -20 /tmp/anitale-build.log; die "Build failed"; }
  mkdir -p dist && rm -rf dist/* && cp -a /tmp/anitale-rollback-build/. dist/ && rm -rf /tmp/anitale-rollback-build
fi

systemctl restart "$SERVICE"
say "Checking the site"
for i in $(seq 1 30); do
  [ "$(curl -s -o /dev/null -m 15 -w '%{http_code}' "http://127.0.0.1:$PORT/")" = 200 ] && { printf '\n\033[32mRolled back to %s and the site answers.\033[0m\n' "$(git log --oneline -1)"; echo "Next: clear the Arvan cache, then Ctrl+Shift+R."; exit 0; }
  sleep 1
done
die "The site is not answering after the rollback: check  journalctl -u $SERVICE -n 50"
