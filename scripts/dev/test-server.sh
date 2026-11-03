#!/usr/bin/env bash
# راه‌اندازی محیط تست: mock Tenrai (4010) + سرور روی DB کپی‌شده (3057).
# استفاده:  bash scripts/dev/test-server.sh path/to/source.db     (برای توقف: fuser -k 4010/tcp 3057/tcp)
set -e
SRC="${1:?مسیر یک فایل data.db برای کپی بده}"
T=/tmp/anitale-test.db; cp "$SRC" "$T"
fuser -k 4010/tcp 3057/tcp 2>/dev/null || true
nohup node scripts/dev/mocktenrai.mjs >/tmp/mock.log 2>&1 &
HASH=$(node -e "console.log(require('bcryptjs').hashSync('testpw123',4))")
DB_FILE=$T TENRAI_BASE_URL=http://127.0.0.1:4010/v1 EXTRAS_IMG_PREFIX=http://127.0.0.1:4010/img/ \
NODE_ENV=production PORT=3057 ADMIN_USER=admin ADMIN_PASSWORD_HASH="$HASH" SESSION_SECRET=x \
nohup node server/index.js >/tmp/server-test.log 2>&1 &
sleep 4; echo "آماده: http://127.0.0.1:3057  (ادمین: admin / testpw123) — لاگ: /tmp/server-test.log"
