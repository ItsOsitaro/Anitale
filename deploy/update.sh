#!/usr/bin/env bash
# Anitale update in one command. Run as root on the server:
#   bash deploy/update.sh            -> pull the new code, build it safely, restart, check the site
#   bash deploy/update.sh --force    -> do all of it even if there is nothing new to pull
#
# What makes it safer than doing the steps by hand:
#   - the site is built into a temporary folder first; if the build fails, the running site is not touched
#     and the code goes back to the previous commit
#   - package-lock.json is only reinstalled (npm ci) when it actually changed
#   - after the restart it opens the main pages; if any of them fails, it puts the previous code and build back
#     by itself and restarts again
#   - the previous commit and build are kept in /root/.anitale-deploy, so  bash deploy/rollback.sh  can go back later
# It never touches server/.env, the database or the covers.
set -u
APP_DIR=/var/www/anitale
SERVICE=anitale
PORT=3000
STATE=/root/.anitale-deploy
BUILD=/tmp/anitale-build-$$
say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf '\033[31m!! %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" = 0 ] || die "Run as root (sudo -i first)."
cd "$APP_DIR" || die "Cannot open $APP_DIR"
mkdir -p "$STATE"

code() { curl -s -o /dev/null -m 15 -w '%{http_code}' "http://127.0.0.1:$PORT$1" 2>/dev/null; }

wait_for_site() {
  local i
  for i in $(seq 1 30); do
    [ "$(code /)" = 200 ] && return 0
    sleep 1
  done
  return 1
}

site_ok() {
  local path
  for path in / /schedule /api/anime?lite=1 /api/landing; do
    [ "$(code "$path")" = 200 ] || { echo "  failed: $path -> $(code "$path")"; return 1; }
  done
  return 0
}

restore_previous() {
  say "Putting the previous version back"
  git reset --hard "$PREV" -q
  if [ -d "$STATE/dist-prev" ]; then rm -rf dist/* && cp -a "$STATE/dist-prev/." dist/; fi
  systemctl restart "$SERVICE"
  wait_for_site && echo "  previous version is running again ($PREV)" || echo "  !! the site is still not answering: check  journalctl -u $SERVICE -n 50"
}

say "Pulling"
PREV=$(git rev-parse HEAD)
git checkout -- public/data 2>/dev/null   # files the site rewrites by itself; the committed ones are the right ones
git pull --ff-only -q || die "git pull failed (local changes or a diverged branch). Nothing was changed."
NEW=$(git rev-parse HEAD)
if [ "$PREV" = "$NEW" ] && [ "${1:-}" != "--force" ]; then
  echo "Already up to date ($NEW). Use --force to rebuild anyway."
  exit 0
fi
echo "  $PREV -> $NEW"

if ! git diff --quiet "$PREV" "$NEW" -- package-lock.json; then
  say "package-lock.json changed: installing dependencies (the site may answer 502 for a minute)"
  npm ci --ignore-scripts --registry https://mirror-npm.runflare.com >/tmp/anitale-npm.log 2>&1 || { tail -15 /tmp/anitale-npm.log; git reset --hard "$PREV" -q; die "npm ci failed; code put back to $PREV. Check node_modules."; }
fi

say "Building (the running site is not touched yet)"
if ! npx vite build --outDir "$BUILD" --emptyOutDir >/tmp/anitale-build.log 2>&1; then
  tail -20 /tmp/anitale-build.log
  git reset --hard "$PREV" -q
  rm -rf "$BUILD"
  die "Build failed; code put back to $PREV and the site keeps running the old version."
fi

say "Switching"
echo "$PREV" > "$STATE/prev-commit"
rm -rf "$STATE/dist-prev"
[ -d dist ] && cp -a dist "$STATE/dist-prev"
mkdir -p dist
rm -rf dist/*
cp -a "$BUILD/." dist/
rm -rf "$BUILD"
systemctl restart "$SERVICE"

say "Checking the site"
if wait_for_site && site_ok; then
  echo "  everything answers (200)."
  printf '\n\033[32mDeployed %s\033[0m\n' "$(git log --oneline -1)"
  echo "Next: clear the Arvan cache, then press Ctrl+Shift+R in the browser."
else
  restore_previous
  die "The new version did not pass the check, so the previous one was put back."
fi
