# HANDOFF — انی‌تیل (Anitale)

این سند برای نشست جدید Claude Code نوشته شده تا بدون دیدن چت‌های قبلی، پروژه و تصمیم‌ها را کامل بفهمد.
AGENTS.md دستورها/env/لایه داده را دارد؛ این فایل **تاریخچه، تصمیم‌ها، معماری قابلیت‌های اخیر، تست و چک‌لیست** را دارد.

## 1. پروژه و مالک
- سایت: **anitale.itsositaro.ir** — کاتالوگ انیمه/مانگا به فارسی (RTL) با لیست شخصی، شبیه MAL.
- Stack: React 19، Vite 7، Express 5، `node:sqlite` (بدون ORM). فرانت در `src/`، سرور در `server/`.
- مالک: مهرداد، ایران، فارسی‌زبان. سرور را تازه یاد می‌گیرد؛ دستورها باید کپی‌پیست و مرحله‌ای باشند.
- منبع داده اصلی: **Tenrai API** (`api.tenrai.org/v1`، حدود 4 درخواست در ثانیه، circuit breaker). جایگزین: AniList. ترجمه فارسی عنوان/خلاصه دستی/نیمه‌خودکار از پنل ادمین (`server/translate.js`، `translate-glossary.mjs`).
- از سندباکس/شبکه ایران نمی‌توان به Tenrai واقعی وصل شد؛ تست با mock انجام می‌شود (بخش 6).

## 2. نقشه کد
**سرور (`server/`)**: `index` (راه‌اندازی)، `app` (همه routeهای Express، `requireAdmin`، `writeLimiter`، jobهای bulk)، `auth`، `users`، `db` (schema + migrate)، `repo` (کوئری‌ها)، `shape` (تبدیل ردیف→آیتم، `foldTitle`)، `schemas` (zod)، `settings`، `search` (ایندکس حافظه‌ای + `addWeighted` برای رتبه)، `sensitive`، `seo` (sitemap/meta، noindex)، `tenrai`، `anilist`، `extras` (شخصیت/عوامل/روابط/پیشنهاد/ویدیو/تم)، `people` (صفحه شخصیت و فرد)، `images`/`cover-resize`/`/api/ximg` (پروکسی و کش تصویر در `server/xcache/`)، `auto-import`، `missing-titles`، `reviews`، `notifications`، `mailer`، `health`، `export-data`، `seed`، `vpn`/`proxy`/`xray-config`، `pool`.
**جدول‌های DB**: settings، anime، manga، users، user_entries (user_id, media_type, slug, status ∈ watching/completed/on_hold/dropped/planned, note, rating, progress, created_at, updated_at)، follows، auth_tokens، title_extras، people_cache، missing_titles، missing_requests، notifications، notification_state، reviews (یکی برای هر کاربر در هر عنوان؛ body، spoiler).
**فرانت (`src/`)**: `App.jsx` (routeها: `/`، `/search`، `/anime/:idOrSlug`، `/manga/:idOrSlug`، `/character/:id`، `/person/:id`، `/dashboard`، `/user/:username`، `/import-list`، `/account`، صفحات auth، `/admin/*`)، `catalog-context.jsx`، `lib/catalog-rules.js` (قوانین رتبه/فیلتر کلاینت)، `lib/mal-xml.js`، `components/` (و `components/mobile/` برای MobileShell ≤820px)، `admin/*` (AnimeList، MangaList، AutoImport، BulkImport، HealthPage، MissingTitles، ReviewQueue، Schedule، SiteUsers، Translation، UserReviews، VpnPage، TitleImport، QuickAdd …)، `i18n.js` (fa/en) و `admin/i18n.js` (بلوک‌های جفتی en/fa). متن جدید UI را همیشه در هر دو زبان اضافه کن.
**ماژول‌های جدید (B8–C8) و routeهای تازه: بخش 11.**
**مستندات دیگر**: `AGENTS.md`، `README.md`، `FEATURE-QUEUES.md` (صف 1–28 همه ✅)، `docs/mobile-ui-spec.md`.

## 3. تاریخچه کار (به ترتیب)
1. صف‌های 1–28 (جستجو، داشبورد، برنامه پخش، ایمپورت گروهی، مانگا، کش کلاینت …) — در `FEATURE-QUEUES.md`.
2. **صفحات کشف** (discovery) و **برنامه پخش** (schedule) + رفع باگ schedule.
3. **title extras**: شخصیت‌ها، عوامل، روابط، پیشنهادها، ویدیو/تم در صفحه جزئیات؛ کش در `title_extras` با `EXTRAS_VERSION=3`؛ تصویرها از `/api/ximg`.
4. **سخت‌سازی سرور**: `deploy/real-ip.sh` (IP واقعی از X-Forwarded-For آروان در nginx)، `deploy/harden.sh` (ufw، fail2ban، محدودیت systemd، swap).
5. **ایمپورت MAL XML** (`/api/user/import-mal`) و **اکسپورت** (`/api/user/export`: XML سازگار با MAL، CSV، JSON). عنوان‌هایی که در سایت نیستند در `missing_titles` ثبت و در ادمین («عنوان‌های درخواستی») دیده می‌شوند.
6. **پاک‌سازی + صفحه شخصیت/فرد + پنل سلامت ادمین** (`server/health.js`, `HealthPage.jsx`: حافظه/swap/دیسک/لود، سرویس‌های بیرونی با probe، خطاهای اخیر، هر 15 ثانیه).
7. بررسی PDF کاتالوگ ویژگی‌های MAL که مالک ساخت → چک‌لیست (بخش 8).
8. **Refresh-all ادمین به job پس‌زمینه** تبدیل شد (قبلاً بعد از چند ثانیه «Error !» می‌داد چون CDN درخواست طولانی را قطع می‌کرد).
9. **فیلتر محتوای حساس** + **رتبه‌بندی بیزی** (A5, A1).
10. بقیه‌ی فاز 1 و 2 (A2–A8، B1–B7): آمار جامعه، فیلدهای لیست، جستجوی پیشرفته، ژانر/تم/مخاطب، نقد و واکنش «مفید بود» و غیره (جزئیات در بخش 8).
11. فاز 3 و بقیه‌ی فاز 2: B8، B9، C1، C2، C6، C7، C8 — نقشه‌ی ماژول‌ها در بخش 11.

## 4. معماری قابلیت‌های اخیر (باید هماهنگ بمانند)
### فیلتر حساس
- عنوان حساس است اگر ژانرش Ecchi/Erotica/Hentai باشد یا رده سنی Rx داشته باشد.
- **دو پیاده‌سازی که باید sync بمانند**: `server/sensitive.js` و `src/lib/catalog-rules.js`.
- پیش‌فرض: **روشن** (حساس‌ها پنهان). انتخاب کاربر در `localStorage` با کلید `anitale.showSensitive` (هر دستگاه جدا) با کامپوننت `SensitiveToggle`.
- جستجوی سرور با `sfw=1`؛ حساس‌ها از sitemap بیرون و با هدر `X-Robots-Tag: noindex`.
- صفحات کشف از `useVisibleCatalog()` / `useVisibleMangaCatalog()` استفاده می‌کنند؛ **لیست شخصی کاربر از کاتالوگ کامل** (چیزی که کاربر خودش اضافه کرده پنهان نشود).
- `publicNames` در `server/tenrai.js` باید ژانرهای Ecchi/Erotica/Hentai را نگه دارد (قبلاً حذف می‌شدند و فیلتر کور بود). عنوان‌های قدیمی برای گرفتن ژانر نیاز به «بروزرسانی همه» در ادمین دارند. `seasonalAnimeIds` در auto-import هنوز hentai/erotica را رد می‌کند.
### رتبه‌بندی بیزی
`WR = v/(v+m)·S + m/(v+m)·C` با `MIN_VOTES = m = 1000`. v = تعداد رأی‌دهنده (scored-by)، وگرنه تعداد اعضا، وگرنه m؛ S = امتیاز منبع؛ C = میانگین کاتالوگ. در `rankCatalog`/`rankKey` (کلاینت) و `addWeighted` در `server/search.js` (سرور). **فقط روی امتیاز منبع** است (تصمیم مالک)، نه امتیاز کاربران خودمان. اعداد PDF (m=50، C=6.87، «قانون 20%») تأییدنشده‌اند.
### Bulk refresh
`startBulk(kind, rows, runRow, onFinish)` در `server/app.js`، Map درون‌حافظه‌ای `bulkJobs` (با ریستارت از بین می‌رود). `POST /api/admin/{anime|manga}/refresh-all` شروع/پیوستن؛ `GET` وضعیت. کلاینت: `runBulkJob(start,status,onProgress)` در `src/admin/api.js` (poll هر 2 ثانیه، تحمل 8 شکست پیاپی). بعد از پایان انیمه `exportData()` اجرا می‌شود. مسیر مانگا با تست جدا تأیید نشده (همان کد).
### extras و people
`server/extras.js` + `people.js`: اولین بازدید از Tenrai می‌گیرد و در SQLite کش می‌کند؛ با بالا بردن `EXTRAS_VERSION` همه کش‌ها باطل می‌شوند. UI: `components/TitleExtras.jsx`، `peoplePages.jsx`.

## 5. دیپلوی و تله‌ها
- **Syncthing**: پوشه پروژه روی سرور همگام می‌شود (فایل‌ها `syncthing:www-data`). یک بار exec bit فایل‌های `node_modules/.bin/*` از بین رفت → `vite: Permission denied`. راه‌حل ماندگار: `.stignore` با `node_modules` و `dist` در **هر دو دستگاه**، بعد `rm -rf node_modules && npm ci`. قبل از ثبت ignore هیچ پوشه همگام‌شده‌ای را حذف نکن (حذف به PC مالک هم می‌رسد). مالک این را اجرا کرده؛ هنوز تأیید نشده `.stignore` روی PC هم درست است.
- `chmod -R u+rwX` به فایل‌ها x نمی‌دهد؛ `chmod +x node_modules/.bin/*`.
- **هرگز فایل پروژه را روی سرور حذف نکن**: حذف از طریق Syncthing به PC هم می‌رسد (یک بار `src/lib/genre-kinds.js` همین‌طور پاک شد و build شکست خورد؛ با ارسال دوباره‌ی فایل درست شد).
- اگر `git pull` روی سرور بگوید «local changes would be overwritten» (چون Syncthing فایل‌ها را زودتر رسانده)، راه‌حل: `git checkout -- <همان فایل‌ها>` (فقط فایل‌های ردیابی‌شده)، نه حذف فایل.
- ایران بعضی mirrorهای apt را می‌بندد؛ نصب بسته ممکن است شکست بخورد.
- `git pull` → «Already up to date» یعنی هنوز push نشده.
- بعد از هر دیپلوی: پاک‌کردن کش آروان.

- **ورود فایل‌های Syncthing به گیت (2026-11-03)**: فایل‌های `*.sync-conflict-*` و `.stfolder` به‌اشتباه commit شدند (از جمله کپی `server/.sync-conflict-…env`). از ریپو برداشته و در `.gitignore` ثبت شد، ولی در تاریخچه گیت مانده؛ مالک تصمیم گرفت رمزها را فعلاً عوض نکند (باید مطمئن بود ریپو خصوصی است). فایل‌های conflict داخل `dist/` سرور پاک شدند.
- **(2026-11-03) .git و Syncthing**: `.git` همگام می‌شد و ریپوی سرور خراب شد (`bad object HEAD`). `.git` حالا در `.stignore` هر دو دستگاه است؛ ریپوی سرور مرمت شد (پشتیبان: `/root/backup/git-dir-*.tar.gz`)، فایل‌های `~syncthing~*.tmp` از گیت خارج و در `.gitignore` آمدند. روی سرور `core.autocrlf=input` و `.stignore` با `skip-worktree` است (CRLF در `.stignore` الگوها را خراب می‌کند؛ باید LF بماند). دیپلوی ۲۰۲۶-۱۱-۰۳ (B2 ادمین، فیلتر ژانر موبایل، جزئیات مهمان) با دسترسی کلید SSH انجام شد.
- **(2026-11-03) چک سایت زنده + دسترسی‌پذیری**: همهٔ قابلیت‌های وابسته به Tenrai روی سرور واقعی کار کردند (قسمت‌ها/ویدیو/تصاویر C1، ترتیب تماشا B7، برترین شخصیت‌ها B8، extras، جستجوی افراد، `/api/v1`، مجله‌ی مانگا C2: ۲۹ از ۳۰). Lighthouse محلی: دسترسی‌پذیری ۱۰۰ در موبایل و دسکتاپ، SEO و Best Practices هر دو ۱۰۰. اصلاح‌ها: `aria-label` اضافی کارت هیرو حذف شد (فقط h1 اولی h1 است)، نقطه‌های هیرو هدف لمسی ۲۴px گرفتند، دکمه‌ی ورود سایدبار از `button>a` نامعتبر به `render={<Link/>}` تغییر کرد، صفحه‌ی ۴۰۴ با کد، لینک خانه و جستجو. (llms.txt و تست سرعت بعداً انجام شد: خط بعدی.) یادآوری: سرور تولید `index.html` را هنگام استارت می‌خواند؛ بعد از هر build حتماً restart.
- **(2026-11-04)**: بخش «ادامه‌ی تماشا» از خانه (دسکتاپ و موبایل) حذف شد (کامپوننت `ContinueWatching`، CSS و کلید i18n پاک شدند؛ دکمه‌ی +۱ قسمت `QuickEpisode` در صفحه‌ی عنوان و نوار پایین موبایل می‌ماند). `/llms.txt` اضافه شد (route پویا در `server/seo.js`، با دامنه‌ی واقعی). تست سرعت (Lighthouse/trace موبایل با Fast 4G و CPU ×۴، سرور محلی): LCP ≈ ۰٫۹–۱٫۱ ثانیه، CLS = ۰؛ تصویر اول هیرو `fetchPriority=high` گرفت. تأخیر باقی‌مانده‌ی LCP به‌خاطر رندر سمت کلاینت کاتالوگ است (تصویر هیرو بعد از آمدن داده کشف می‌شود) و عمداً دست نخورد.
- **(2026-11-06) critique/distill صفحه‌ی اصلی دسکتاپ**: نمره‌ی critique ۲۰/۳۲ (ذخیره در `.impeccable/critique/`). نوار معرفی `IntroStrip` برای کاربر واردنشده (دسکتاپ و موبایل). distill: بخش تکراری «سریال‌های منتخب» و سه `CompactRanking` سایدبار چپ حذف شد (کامپوننت، CSS و کلیدهای i18n `featuredSeries/upcomingRanking/popularRanking` هم)، برنامه‌ی پخش سایدبار حداکثر ۸ ردیف با امروز در اول، و سایدبار «کشف کنید» ۵ لینک اصلی + «بخش‌های بیشتر» (`<details>`؛ ۵ لینک دیگر همچنان در دسترس‌اند). لینک‌های صفحه از ~۲۰۲ به ~۱۶۱ رسید. باز: `audit` (متن ریز ۹–۱۰٫۵px و متن کم‌رنگ موبایل ۲٫۵:۱)، `typeset` (عنوان فارسی؛ وابسته به `title_fa`).
- **(2026-11-06) audit متن ریز**: همه‌ی `font-size` زیر ۱۱px در `style.css` (۳۰ مورد) و `mobile.css` (۲ مورد) به ۱۱px رسید؛ روی خانه‌ی دسکتاپ و موبایل متن زیر ۱۱px و سرریز افقی نمانده. «کنتراست ۲٫۵:۱ متن کم‌رنگ موبایل» که overlay گزارش کرده بود در حالت ثابت دیده نشد (رنگ `#ba95a7` روی صفحه نیست؛ احتمالاً نمونه‌برداری وسط انیمیشن fade) و تغییری نگرفت. صفحه‌های دیگر (جزئیات، داشبورد، ادمین) بعد از این افزایش فونت با چشم دیده نشدند.
- **(2026-11-06) critique دوم (۲۱/۳۲) + distill سایدبار**: سایدبار «کشف کنید» دسکتاپ حالا فقط مقصدهایی را نشان می‌دهد که در هدر (`primaryNavigation`) نیستند (برترین مانگا، شخصیت‌ها، استک‌ها، API، مانگای انیمه‌شده)؛ بخش `<details>` قبلی («بخش‌های بیشتر») و کلید `sideMore` و CSS آن حذف شد. داده‌ی `sidebarSections` دست نخورد، پس شیت موبایل و `section-rail` صفحه‌های دیگر همه‌ی لینک‌ها را دارند. باز از critique: ریتم ریل‌ها (`layout`)، عنوان فارسی (`typeset`، وابسته به `title_fa`)، کنتراست مرزی ۴٫۲–۴٫۴:۱ و اعداد شیب‌دار رتبه (`quieter`).
- **(2026-11-06) critique سوم (۲۰/۳۲، روند ۲۰→۲۱→۲۰) + distill فهرست پخش**: فهرست «برترین‌های در حال پخش» دسکتاپ از ۳۱ ردیف (ترتیب روزهای هفته) به ۱۰ ردیف با بهترین امتیاز رسید (`topAiring` در `selectHomePicks`؛ `airingAnime` برای موبایل می‌ماند). ارتفاع صفحه ۶۹۱۳ → ۴۷۲۹px. باز از critique: پوستر خالی آبی MAL در `public/covers/placeholder.svg` (`colorize`)، دو دعوت یکسان به ثبت‌نام در دسکتاپ (`clarify`)، ارقام/عنوان فارسی (`typeset`)، حرکت بی‌پایان `poster-flow` (`quieter`). نکته‌ی تست: روی ویندوز سرورهای قدیمی تست ممکن است روی همان پورت بمانند؛ هر بار پورت تازه بگیر و هش `index-*.js` سرو‌شده را با `dist/` مقایسه کن.
- **دیتابیس**: `server/data.db` (SQLite، WAL) فقط روی سرور است و **در `.stignore` هر دو دستگاه** قرار گرفت (همگام‌سازی زنده SQLite خطرناک است). پشتیبان شبانه: `/usr/local/bin/anitale-backup.sh` با cron در `/etc/cron.d/anitale-backup` (VACUUM INTO در `/root/backup`، نگهداری 14 روز). برای تست محلی با داده واقعی: نسخه پشتیبان را دستی روی PC کپی کنید؛ هرگز از PC به سرور برنگردانید. فایل‌های Vercel/Postgres در ریپو (`api/`, `server/pg*.js`, `vercel.json`) توسط این نشست‌ها دیده/استفاده نشده‌اند؛ دیتابیس واقعی SQLite روی سرور است.
- **npm روی سرور**: `registry.npmjs.org` و `registry.npmmirror.com` از سرور بسته‌اند؛ `https://mirror-npm.runflare.com` کار می‌کند. نصب: `npm config set registry https://mirror-npm.runflare.com && npm ci --ignore-scripts` (اسکریپت نصب `onnxruntime-node` از سایت دیگری دانلود می‌کند و شکست می‌خورد؛ ترجمه محلی با مدل بدون آن کار نمی‌کند، بقیه سایت مشکلی ندارد) سپس `npm config delete registry`.
- هنگام `npm ci` سایت 502 می‌دهد (node_modules نیست).

## 6. تست (چطور من تست می‌کردم)
سندباکس به Tenrai/AniList دسترسی ندارد، پس:
1. `node scripts/dev/mocktenrai.mjs` (پورت 4010؛ `PORT=` قابل تغییر؛ `/__mode?v={json}` برای شبیه‌سازی خطا مثل 429/403/garbage؛ `/__hits` شمارنده).
2. سرور تست روی DB کپی‌شده:
   `DB_FILE=/tmp/t.db TENRAI_BASE_URL=http://127.0.0.1:4010/v1 EXTRAS_IMG_PREFIX=http://127.0.0.1:4010/img/ NODE_ENV=production PORT=3055 node server/index.js`
3. برای ورود ادمین: `ADMIN_USER=admin`، `ADMIN_PASSWORD_HASH` (هش bcryptjs از `testpw123`)، `SESSION_SECRET`.
4. اسکریپت‌های Playwright (chromium از قبل نصب) روی `http://127.0.0.1:3055`؛ هر اجرا DB تازه کپی کن (کاربر تستی `expa` فقط یک بار ساخته می‌شود؛ عنوان 9301 باید وجود داشته باشد).
5. همیشه `npx vite build` و `node -e "import('./server/app.js')"`.
6. `exportData()` در تست `public/data/*.json` را بازنویسی می‌کند — آن‌ها را **کامیت نکن** (`git checkout public/data`).
7. پورت: `fuser -k PORT/tcp`، نه `pkill -f`.
8. **DB پایه‌ی تست**: یک کپی از دیتابیس (مثلاً از پشتیبان `/root/backup` یا `server/data.db` روی PC) را به‌عنوان `/tmp/t.db` کپی کن؛ هرگز روی `data.db` زنده تست نزن. کاتالوگ از DB خوانده می‌شود، نه از `public/data`؛ فیکسچر تست را با SQL روی DB تست عوض کن (مثلاً `UPDATE anime SET genres=… WHERE slug=…`). `scripts/dev/test-server.sh` همین کار را می‌کند.
9. **کاربر تستی**: از `/register` بساز (`#auth-username`، `#auth-email`، `#auth-password`؛ نام‌کاربری حرف+عدد و رمز حداقل ~۱۰ کاراکتر مثل `longenough1`). تماس‌های API در Playwright را با `page.evaluate(fetch…)` از صفحه‌ی واردشده بزن؛ `ctx.request` ساده به‌خاطر بررسی هم‌مبدأ (`sameOriginOnly`) رد می‌شود، و در ابزارهای دیگر برای نوشتن هدر `Origin` هم‌مبدأ بفرست.
10. موبایل: viewport ‏390×844؛ تب‌های جزئیات موبایل: خلاصه/نظرات/اطلاعات/تولید/مرتبط (+ رسانه)؛ تب‌های پروفایل موبایل: فهرست/فعالیت/درباره.
11. `scripts/smoke.mjs` تست دودی API است (بخش «Commands» در AGENTS.md).

## 7. تصمیم‌های مالک (باز نکن)
- فیلتر حساس: پیش‌فرض روشن + سوئیچ کاربر. ✔
- رتبه: فقط امتیاز منبع با فرمول بیزی. ✔
- **فعلاً نه**: فروم، کلاب‌ها، پیام خصوصی (C3–C5)، CSS دلخواه خام (به‌جایش چند تم رنگی آماده)، OAuth API.
- تم پروفایل = چند تم رنگی از پیش‌تعریف‌شده.
- **جزئیات تصمیم‌های هر قابلیت (مالک جواب داده؛ دوباره نپرس):**
  - A5/A1: فیلتر حساس برای هر دستگاه جدا (`localStorage`)؛ رتبه فقط امتیاز منبع.
  - B1 نقد: فقط واکنش «مفید بود»؛ حداقل طول نقد ۱۰ کاراکتر؛ مرتب‌سازی: جدیدترین (پیش‌فرض)، مفیدترین، بالاترین امتیاز، پایین‌ترین امتیاز.
  - B2 پیشنهاد «اگر این را دوست داشتی»: زیر نقدها در صفحه‌ی عنوان؛ هر کاربر برای هر جفت عنوان فقط یکی؛ متن ۱۰–۳۰۰ کاراکتر؛ رأی «مفید بود». هنوز UI مدیریت ادمین ندارد (فقط API).
  - B3 علاقه‌مندی‌ها: ۱۰ مورد برای هر دسته (انیمه، مانگا، شخصیت، فرد)؛ دکمه‌ی قلب در هر صفحه؛ عمومی.
  - B4 حریم خصوصی: «دوستان» = کسانی که **صاحب فهرست** دنبال می‌کند؛ حریم فهرست انیمه و مانگا جدا؛ چیزی از فهرست خصوصی عمومی نمی‌ماند (آمار ناشناس جامعه ماند).
  - B5 شباهت سلیقه: روش اختلاف امتیاز، حداقل ۸ عنوان مشترکِ امتیازدار، نمایش در پروفایل و مرتب‌سازی فهرست دنبال‌شده‌ها.
  - B6 درباره‌ی من: مجاز: **درشت**، *کج*، لینک، تیتر کوچک، فهرست، اسپویلر؛ بدون تصویر و HTML خام؛ تا ۲۰۰۰ کاراکتر؛ فرم ساده با پیش‌نمایش زنده.
  - B7 ترتیب تماشا: هنگام باز کردن صفحه و در صورت نبودن کش ساخته می‌شود؛ فهرست مرتب با سال و نوع؛ در بخش «مرتبط».
  - B8: فقط منبع MAL (نه علاقه‌مندی کاربران خودمان)؛ ۵۰ برتر با صفحه‌بندی؛ صفحه‌ی جدا + لینک در «کشف کنید» و تب موبایل.
  - B9: «محبوب‌ترین» فقط بر اساس members؛ «به‌زودی» = فصل بعد به ترتیب محبوبیت؛ دکمه‌ی +۱ هم در خانه هم در صفحه‌ی عنوان.
  - C1: تب‌ها: قسمت‌ها، ویدیو، تصاویر؛ ویدیو فقط با کلیک بارگذاری شود.
  - C2: صفحه‌ی استودیو + تهیه‌کننده/ناشر + مجله‌ی مانگا؛ فقط عنوان‌های موجود در انی‌تیل؛ نام‌ها در «اطلاعات» لینک شوند.
  - C6: مجموعه با نام و توضیح؛ ۱۰ استک برای هر کاربر، ۵۰ عنوان در هر استک؛ عمومی/خصوصی + پسند؛ «افزودن مستقیم از صفحه‌ی عنوان» انتخاب نشد.
  - C7: چهار نوع (خلاصه، عنوان، ژانر، گزارش)؛ هر کاربر واردشده؛ حداکثر ۵ در روز؛ صف ادمین با تفاوت قدیم/جدید، تأیید (اعمال خودکار) یا رد با دلیل.
  - C8: داده: فهرست و جزئیات انیمه/مانگا، جستجو، برنامه پخش و برترین‌ها (نه آمار جامعه/نقدها)؛ بدون کلید؛ ۶۰ درخواست در دقیقه برای هر IP؛ حساس همیشه حذف.
  - حساب کاربری: ثبت‌نام و بازیابی رمز با ایمیل (کد بازیابی رد شد؛ `server/mailer.js`، متغیرهای `SMTP_*`).
  - جریان کار مالک: اول روی PC تست می‌کند، بعد روی سرور؛ هر قابلیت را جدا تأیید می‌کند. دلخواه او: نسخه‌ی PC و سرور (حتی دیتابیس) هم‌گام بماند؛ ولی تصمیم فنی فعلی این است که `data.db` همگام نشود (در `.stignore`، بخش 5).
  - **قراردادهای محتوا**: هر عنوان حساس باید در APIهای عمومی/لیست‌ها حذف شود مگر در فهرست شخصی خود کاربر.

## 8. چک‌لیست بهبود (از PDF کاتالوگ MAL)
**انجام‌شده**: A1 رتبه بیزی، A5 فیلتر حساس، A3 فیلدهای لیست (تاریخ شروع/پایان خودکار+دستی، دفعات تماشای مجدد، اولویت فقط برای «برای بعد»، برچسب آزاد؛ ایمپورت/اکسپورت XML/CSV/JSON؛ فیلتر برچسب و ترتیب اولویت در داشبورد دسکتاپ؛ در موبایل فقط داخل شیت ویرایش).
**فاز 1**
- ~~A2~~ انجام شد: `communityStats` (server/reviews.js) حالا `statuses` (تعداد اعضا در هر وضعیت) و `listed` دارد؛ `StatusCounts` در `CommunitySection.jsx` (دسکتاپ و موبایل). توزیع امتیاز از قبل بود.
- ~~A3~~ انجام شد (بالا). فیلتر برچسب موبایل هم انجام شد. جزئیات A3 حالا در localStorage مهمان هم نگه داشته می‌شود (بعد از خروج حفظ، و هنگام ورود همراه ایمپورت لیست به حساب منتقل می‌شود؛ فقط مقدارهای پرشده فرستاده می‌شود تا جزئیات موجود حساب پاک نشود). UI جزئیات فقط داخل داشبورد است که ورود می‌خواهد؛ فقط با build بررسی شد، نه در مرورگر.
- ~~A4~~ انجام شد: «روز تماشا» در `profileInsights` (`watchedMinutes`: قسمت‌های دیده‌شده یا همه قسمت‌های عنوان تمام‌شده بدون progress + دفعات rewatch، × مدت قسمت از ردیف Duration؛ عنوان‌های بدون Duration رد می‌شوند و عدد با ≈ نشان داده می‌شود). تاریخ عضویت از قبل بود.
- ~~A6~~ انجام شد: `/api/search/full` با `genre` (چندتایی، AND)، `xgenre` (حذف)، `from`/`to` (بازه سال؛ `year` قدیمی هنوز کار می‌کند)، `status` (airing/finished/upcoming/other از ردیف Status)، `studio`، `rating` (کد قبل از « - » در ردیف Rating)، `letter` (A–Z یا #)، مرتب‌سازی `pop`/`votes`/`eps`؛ نمایه‌ها در `factsOf` داخل `server/search.js`؛ UI در `src/searchPage.jsx` (چیپ‌های سه‌حالته ژانر). استودیو و رده سنی فقط انیمه.
- ~~A7~~ انجام شد: `src/lib/genre-kinds.js` (مجموعه‌های ثابت MAL برای تم و مخاطب؛ هر چیز ناشناخته = ژانر)؛ `splitInfoRows` ردیف Genres را به Genres/Themes/Demographic می‌شکند (App.jsx)، چیپ‌های موبایل (MobileDetailPage)، پنل ژانر جستجو و optgroup فیلتر کاتالوگ. در `tenrai.js` ردیف Demographic انیمه هم اضافه شد (عنوان‌های قبلی با refresh پر می‌شوند، تقسیم‌بندی بدون refresh کار می‌کند). فیلتر موبایل (FilterSheet) هنوز گروه‌بندی نشده.
- ~~A8~~ انجام شد: نرمال‌سازی فارسی و کاربران از قبل بود؛ جستجوی شخصیت/فرد اضافه شد: `GET /api/search/people?q=` در `server/people.js` (Tenrai `/characters` و `/people`، کش حافظه ۱ ساعت، محدودیت ۲۰ در دقیقه؛ اگر Tenrai در دسترس نباشد از `people_cache` محلی جواب می‌دهد، `local:true`). UI: بخش‌های «شخصیت‌ها» و «افراد» در `searchPage.jsx` زیر کاربران. جستجوی هدر (combobox) فقط عنوان و کاربر دارد.
**فاز 2**: ~~B1~~ انجام شد (واکنش «مفید بود» تک‌نوعی در جدول `review_votes`، PUT/DELETE `/api/user/reviews/:id/helpful`، نه روی نقد خود؛ مرتب‌سازی `sort=new|helpful|high|low` در `/api/community`؛ حداقل طول همان ۱۰ ماند) · ~~B2~~ انجام شد (`server/recs.js`: جدول `recs` با جفت بدون‌جهت، write-once، دلیل ۱۰–۳۰۰ حرف، رأی «مفید بود» در `rec_votes`؛ API: GET `/api/recs/:type/:slug`، POST `/api/user/recs`، PUT/DELETE `/api/user/recs/:id/helpful`، ادمین: GET/DELETE `/api/admin/recs` (جستجو `q` + صفحه‌بندی `page`) با صفحه‌ی `/admin/recs` («پیشنهادهای کاربران»، `src/admin/UserRecs.jsx`)؛ کلاینت `components/Recommendations.jsx` زیر نقدها) · ~~B3~~ انجام شد (`server/favorites.js`: جدول `favorites`، سقف ۱۰ در هر دسته، شخصیت/فرد با snapshot نام و عکس از `people_cache` — فقط چیزی که قبلاً صفحه‌اش باز شده قابل افزودن است؛ API: GET `/api/favorites/:kind/:ref` (count+mine)، PUT/DELETE `/api/user/favorites/:kind/:ref`؛ `favorites` در `/api/users/:username`؛ UI در `components/Favorites.jsx`: دکمه قلب روی صفحه عنوان دسکتاپ/موبایل و صفحه شخصیت/فرد + بخش علاقه‌مندی‌ها در پروفایل؛ عمومی) · ~~B4~~ انجام شد (ستون‌های `users.privacy_anime/privacy_manga` = public|friends|private؛ «دوستان» = کسانی که **مالک** دنبالشان می‌کند؛ `canSeeList`/`VISIBLE_ENTRY_SQL` در `server/users.js`؛ اعمال‌شده روی `/api/users/:name` (+`hidden`)، `/api/users` (شمارش فقط لیست‌های عمومی)، فید، common-lists، امتیاز کنار نقد (`reviews.js`)، SEO پروفایل؛ آمار ناشناس عنوان (میانگین/شمارش وضعیت) عمداً می‌ماند؛ تنظیم در صفحه `/account` و `PUT /api/user/me {privacy}`) · ~~B5~~ انجام شد (`tasteSimilarity` در `server/users.js`: ۱ − میانگین اختلاف امتیاز/۹ روی عنوان‌های مشترکِ امتیازدار، فقط لیست‌هایی که بیننده اجازه دیدنشان را دارد؛ حداقل ۸ عنوان وگرنه `percent:null`؛ در `/api/users/:name` و followers/following (۱۰۰ نفر اول) برای کاربر واردشده؛ UI: `components/TasteMatch.jsx` روی پروفایل، درصد + دکمه مرتب‌سازی در `FollowListSheet`) · ~~B6~~ انجام شد (ستون `users.about` تا ۲۰۰۰ حرف؛ `PUT /api/user/me {about}`؛ فقط در `/api/users/:name` و `ownUser` می‌آید، نه در لیست‌ها؛ نمایش با رندر React بدون HTML خام در `src/lib/safe-markup.jsx` — **bold**, *italic*, [متن](https://…) فقط http/https با `rel=nofollow noopener noreferrer ugc`, `## تیتر`, لیست `- `/`1. `, اسپویلر `||…||`؛ ویرایشگر با نوار ابزار و پیش‌نمایش زنده در `components/AboutEditor.jsx`، داخل داشبورد دسکتاپ و `EditProfileSheet` موبایل؛ بیوی ۳۰۰ حرفی جداست) · ~~B7~~ انجام شد (`server/franchise.js`: `GET /api/franchise/:type/:malId` — در پس‌زمینه از Tenrai `/full` هر عنوان (فاکت‌ها + روابط) را یکی‌یکی می‌گیرد (حداکثر ۲۵ عنوان، فقط Prequel/Sequel/Parent story/Full story/Side story/Spin-off و فقط همان نوع انیمه/مانگا)، بر اساس تاریخ شروع مرتب می‌کند و در `franchise_cache` برای همهٔ اعضا ذخیره می‌کند (۳۰ روز)؛ کلاینت poll می‌کند؛ UI: `components/WatchOrder.jsx` داخل بخش «مرتبط» دسکتاپ و موبایل؛ گراف شاخه‌ای ساخته نشد، فهرست مرتب‌شده است) · B8 برترین شخصیت‌ها · B9 خانه: محبوب‌ترین، به‌زودی، آپدیت سریع +1 قسمت.
**فاز 3**: C1، C2، C6، C7، C8 همه انجام شد (زیر). C3–C5 عمداً کنار گذاشته شد (بخش 7).
- ~~B8 برترین شخصیت‌ها~~ انجام شد: `server/topchars.js` (`GET /api/top/characters?page=1|2`, کش ۲۴ ساعته در جدول `top_cache`، در خطا نسخه‌ی قدیمی), صفحه‌ی `src/topCharactersPage.jsx` در `/top/characters` (۵۰ تا، ۲۵ تا در هر صفحه), لینک در `sidebarSections` و تب سوم در `MobileRankingPage`, ورودی SEO.
- ~~B9 خانه~~ انجام شد: «محبوب‌ترین» با تعداد members (`membersOf` در `catalog-rules.js`)، «به‌زودی» = انیمه‌های فصل بعد یا Not yet aired مرتب با members (`selectUpcoming` در `home-data.js`، بخش خالی مخفی می‌شود)، دکمه‌ی +۱ قسمت (`components/QuickEpisode.jsx`) روی «ادامه‌ی تماشا» در خانه و صفحه‌ی هر انیمه (دسکتاپ و نوار پایین موبایل)؛ رسیدن به قسمت آخر خودکار «کامل‌شده» می‌کند.
- ~~C1 تب قسمت‌ها/ویدیو/تصاویر~~ انجام شد: `server/media.js` (`GET /api/media/:type/:malId/:kind` با kind=episodes|videos|pictures، کش ۱۲ ساعته در `media_cache`، قسمت‌ها صفحه‌ای ۱۰۰تایی)، `src/components/MediaTabs.jsx` (دسکتاپ: بخش «رسانه»؛ موبایل: تب «رسانه»). علامت «دیده‌ام» progress فهرست کاربر را عوض می‌کند (دوباره زدن روی همان قسمت = برداشتن)؛ ویدیو با کلیک بارگذاری می‌شود؛ تصاویر در نمایشگر تمام‌صفحه (Esc/فلش). مانگا فقط تصاویر دارد.
- ~~C2 استودیو/تهیه‌کننده/مجله~~ انجام شد: صفحه‌های `/studio/:name`، `/producer/:name`، `/magazine/:name` (`src/companyPage.jsx`؛ فهرست عنوان‌های انی‌تیل با مرتب‌سازی محبوب/امتیاز/جدیدترین و صفحه‌بندی ۲۴تایی، همه سمت کاربر از کاتالوگ). نام‌ها در بخش اطلاعات لینک شدند. اطلاعات مجله‌ی مانگا در جدول جدید `manga_serial` است که `server/magazines.js` در پس‌زمینه (هر ۲۰ دقیقه ۲۵ عنوان، بعد از ۹۰ ثانیه از استارت) از Tenrai پر می‌کند و در `listManga` به‌صورت `serialization` join می‌شود؛ یعنی مجله‌ی مانگاهای قدیمی کم‌کم ظاهر می‌شود.
- ~~C6 استک‌های علاقه~~ انجام شد: `server/stacks.js` (جدول‌های `stacks`/`stack_items`/`stack_likes`؛ ۱۰ استک برای هر کاربر، ۵۰ عنوان در هر استک؛ عمومی/خصوصی؛ لایک روی استک دیگران؛ `GET /api/stacks`، `/api/stacks/:id`، `/api/users/:name/stacks`، `POST/PUT/DELETE /api/user/stacks…`)، `src/stacksPages.jsx` (`/stacks` مرور، `/stacks/:id` نمایش + ویرایشگر مالک با جست‌وجوی عنوان و جابه‌جایی/حذف، بخش «استک‌ها» در پروفایل)، لینک در سایدبار «کشف کنید». استک‌های خالی در مرور عمومی نمی‌آیند ولی در پروفایل هستند.
- ~~C7 پیشنهاد ویرایش کاربران~~ انجام شد: `server/suggestions.js` (جدول `edit_suggestions`؛ نوع‌ها: خلاصه‌ی فارسی، عنوان فارسی، ژانر، گزارش اشتباه؛ حداکثر ۵ پیشنهاد در ۲۴ ساعت برای هر کاربر؛ یک پیشنهاد در انتظار از هر نوع برای هر عنوان؛ تأیید ادمین تغییر را خودکار اعمال می‌کند، رد نیاز به دلیل دارد). ستون جدید `anime.title_fa` (عنوان فارسی انیمه؛ در کارت‌ها و عنوان صفحه وقتی زبان فارسی است نشان داده می‌شود). UI: دکمه‌ی «پیشنهاد ویرایش» (`components/SuggestEdit.jsx`) در سایدبار دسکتاپ و تب «اطلاعات» موبایل؛ صفحه‌ی `/suggestions` (پیشنهادهای من با وضعیت و دلیل رد)؛ پنل ادمین `/admin/suggestions` با نمایش قدیم/جدید. کاتالوگ عمومی تا ~۱ دقیقه بعد از تأیید کش CDN/مرورگر است.
- ~~C8: API عمومی~~ **انجام شد** — `server/api-v1.js`: `/api/v1` (anime, manga, جزئیات با slug یا malId, top, search, schedule)، بدون کلید، ۶۰ درخواست در دقیقه برای هر IP، محتوای حساس همیشه حذف، `fields` و ETag/304، CORS باز. صفحه‌ی مستندات: `/developers`.

## 9. کارهای باز / یادآوری
- (2026-11-03) مالک تأیید کرد: بسته‌های B8، B9، C1، C2، C6، C7، C8 روی سرور اعمال شده‌اند. «بروزرسانی همه» انیمه/مانگا هنوز صریحاً تأیید نشده.
- مجله‌های مانگا (C2) در پس‌زمینه کم‌کم پر می‌شوند (۲۵ عنوان هر ۲۰ دقیقه)؛ C1/C2/B2/B7 به دسترسی سرور به Tenrai وابسته‌اند.
- تأیید ژانر C7: فقط ستون `genres` عوض می‌شود، نه ردیف «Genres» در اطلاعات.
- (2026-11-03) FilterSheet موبایل حالا ژانرها/تم‌ها/مخاطب را جدا گروه‌بندی می‌کند (`splitGenres`)؛ با داده‌ی تست در مرورگر موبایل دیده شد.
- (2026-11-03) تصمیم مالک: سخت‌سازی SSH (ورود فقط با کلید، unattended-upgrades) **کلاً کنار گذاشته شد**؛ دیگر پیشنهاد نده.
- (2026-11-03) تمیزکاری مستندات انجام شد: `PROVIDER=anilist` هنوز معتبر است (مستند ماند)؛ `server/jikan.js` و `admin/JikanImport.jsx` ایمپورتر قدیمیِ ادمین هستند و کد زنده‌اند، حذف نشدند.
- (2026-11-03) مسیر refresh-all مانگا با mock تست شد (شروع، پیوستن، پیشرفت، نتیجه، ذخیره ژانر Erotica) و درست کار کرد.
- امنیت مخزن: فایل‌های `.env`/کپی‌های sync-conflict یک بار در تاریخچه‌ی گیت رفته‌اند؛ مالک چرخاندن رمزها را رد کرد (بخش 5). یادآوری کن که ریپو باید **خصوصی** بماند.
- نبودن Tenrai واقعی در تست‌ها: هر قابلیتی که به Tenrai وابسته است (B2/B7، C1، C2، B8) فقط با mock تست شده؛ اولین بار روی سرور واقعی بررسی دستی لازم است.

## 10. قراردادهای کدنویسی
- زبان UI: فارسی اولویت؛ هر رشته در `i18n.js` (fa/en)، ادمین در `admin/i18n.js`.
- routeهای نوشتن: `requireAdmin` (در صورت ادمین)، `writeLimiter`، اعتبارسنجی zod در `schemas`.
- تغییرات DB: migrate در `server/db.js`؛ بدون ORM.
- موبایل: هر صفحه جدید باید در ≤820px (MobileShell) بررسی شود (`docs/mobile-ui-spec.md`).
- فایل‌های ایجادشده در `server/xcache/`, `server/*.db*`, `.env*` را کامیت نکن.

## 11. نقشه ماژول‌های A2–C8 (همه چک‌لیست انجام شده — نشست جدید از اینجا شروع می‌کند)
چک‌لیست بخش 8 **کامل شد** (A1–A8، B1–B9، C1، C2، C6، C7، C8). C3–C5 (انجمن/کلاب/پیام خصوصی)، CSS سفارشی خام و OAuth عمداً کنار گذاشته شدند. ایده‌ی بعدی را با مالک مشورت کن.
- **A2/A7** `src/lib/genre-kinds.js` (`genreKind`، `splitGenres`، `splitInfoRows`؛ مجموعه‌های ثابت MAL برای تم/مخاطب)، `server/reviews.js` (`communityStats` با `statuses`)، `src/components/CommunitySection.jsx`.
- **A8** `server/people.js` (`/api/search/people`، کش حافظه ۱ ساعت، محدودیت ۲۰/دقیقه)، `src/searchPage.jsx`.
- **B1** `server/reviews.js` (جدول `review_votes`، مرتب‌سازی `new|helpful|high|low`)، `HelpfulButton` در `CommunitySection.jsx`.
- **B2** `server/recs.js` (جدول‌های `recs`، `rec_votes`؛ جفت نامرتب `slug_a<slug_b`) + `src/components/Recommendations.jsx`؛ مدیریت ادمین (2026-11-03): `src/admin/UserRecs.jsx` در `/admin/recs` (جستجو، صفحه‌بندی ۱۵تایی، شمار «مفید»، حذف).
- **B3** `server/favorites.js` (جدول `favorites`، ۱۰ مورد برای هر دسته) + `src/components/Favorites.jsx`.
- **B4** ستون‌های `users.privacy_anime/privacy_manga` (در `server/db.js`)، `server/users.js` (`canSeeList`، `setPrivacy`، `VISIBLE_ENTRY_SQL`)، UI در `src/accountPages.jsx`.
- **B5** `server/users.js` (`tasteSimilarity`) + `src/components/TasteMatch.jsx`، `FollowListSheet.jsx`.
- **B6** ستون `users.about` + `src/lib/safe-markup.jsx` (`AboutRich`) + `src/components/AboutEditor.jsx`.
- **B7** `server/franchise.js` (جدول `franchise_cache`، BFS پس‌زمینه روی Tenrai، حداکثر ۲۵ گره) + `src/components/WatchOrder.jsx`.
- **B8** `server/topchars.js` + `src/topCharactersPage.jsx` — `/top/characters`، کش ۲۴ ساعته (`top_cache`).
- **B9** `src/components/QuickEpisode.jsx` (+۱ قسمت و «ادامه‌ی تماشا»)، `src/home-data.js` (بزودی/محبوب‌ترین).
- **C1** `server/media.js` (`/api/media/:type/:malId/:kind`، کش ۱۲ ساعته `media_cache`) + `src/components/MediaTabs.jsx`.
- **C2** `src/companyPage.jsx` (`/studio|producer|magazine/:name`) + `server/magazines.js` (جدول `manga_serial`، backfill پس‌زمینه).
- **C6** `server/stacks.js` + `src/stacksPages.jsx` — جدول‌های `stacks`، `stack_items`، `stack_likes`؛ ۱۰ استک برای هر کاربر، ۵۰ عنوان در هر استک.
- **C7** `server/suggestions.js` (جدول `edit_suggestions`؛ ستون `anime.title_fa`) + `src/components/SuggestEdit.jsx`، `src/suggestionsPage.jsx`، ادمین `src/admin/Suggestions.jsx`. تأیید خودکار اعمال می‌شود؛ حداکثر ۵ پیشنهاد در ۲۴ ساعت.
- **C8** `server/api-v1.js` — API عمومی `/api/v1` (anime، manga، جزئیات با slug/malId، top، search، schedule)، بدون کلید، ۶۰ درخواست/دقیقه برای هر IP، محتوای حساس همیشه حذف، `fields`، ETag، CORS باز. مستندات: `src/developersPage.jsx` در `/developers`. `getDocs` و گزینه‌ی `raw` در `server/search.js` برایش اضافه شد.

### تست سریع
`bash scripts/dev/test-server.sh /مسیر/data.db` (mock + سرور روی 3057؛ توقف: `fuser -k 4010/tcp 3057/tcp`). mock حالا endpointهای C1/C2/B8 را هم دارد.

### routeهای صفحه‌های جدید (`src/App.jsx`، همه با `WithHeader`)
`/top/characters`، `/studio/:name`، `/producer/:name`، `/magazine/:name`، `/stacks`، `/stacks/:id`، `/suggestions`، `/developers`. لینک سایدبار در `src/sectionData.js`؛ ورودی سئو برای صفحه‌های کشف در `server/seo.js` (`DISCOVERY`).

### جدول‌های جدید SQLite
`top_cache` (B8)، `media_cache` (C1)، `manga_serial` (C2؛ در `server/repo.js` هم ساخته می‌شود)، `stacks`/`stack_items`/`stack_likes` (C6)، `edit_suggestions` (C7) و ستون `anime.title_fa` (C7؛ در `server/suggestions.js`). این ماژول‌ها جدولشان را با `CREATE TABLE IF NOT EXISTS` هنگام بارگذاری ماژول می‌سازند؛ بقیه‌ی مهاجرت‌ها در `server/db.js` است. هر دو روش مجازند، ولی با همان روشِ ماژولی که ویرایش می‌کنی هماهنگ بمان.

### کش
`/api/anime` و `/api/manga`: `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300` ← تغییر ادمین/پیشنهاد حدود یک دقیقه بعد دیده می‌شود. `/api/v1/*`: `max-age=300` + ETag. تصویرهای MAL از `/api/ximg?u=` (فقط پیشوند `EXTRAS_IMG_PREFIX`، حداکثر 1MB).

### کلاینت Tenrai
`tenraiGetRaw(path)` در `server/tenrai.js`: صف سریالی، فاصله‌ی 600ms، circuit breaker (`tenraiCircuitOpen`). هر ماژول جدید که به Tenrai می‌رود باید از همین استفاده کند، نه fetch مستقیم. از ایران ممکن است بدون `PROXY_URL` در دسترس نباشد.

### متغیرهای محیطی (`server/.env`؛ نمونه: `server/.env.example`)
ضروری: `ADMIN_USER`، `ADMIN_PASSWORD_HASH`، `SESSION_SECRET`، `PORT`، `TRUST_PROXY=1`، `SITE_URL`. اختیاری: `PROXY_URL`، `PROVIDER`، `TENRAI_DISABLED`، `TENRAI_BASE_URL`، `TENRAI_TIMEOUT_MS`، `TENRAI_SERVER_KEY`، `EXTRAS_IMG_PREFIX`، `DB_FILE`، `HOST`، ترجمه (`GEMINI_API_KEY`، `TRANSLATE_ENGINE`، …)، ایمیل (`SMTP_*`). هیچ‌وقت مقدار آن‌ها را نمایش یا کامیت نکن.

### چک‌لیست افزودن صفحه یا قابلیت جدید
1. سرور: ماژول `server/xxx.js` با `registerXxxRoutes(app, deps)` و ثبت در `server/app.js`؛ routeهای نوشتن: `writeLimiter` + zod.
2. فرانت: صفحه در `src/`، route در `App.jsx`، لینک در `sectionData.js`، ورودی `DISCOVERY` در `server/seo.js` اگر صفحه‌ی عمومی است.
3. متن‌ها فقط از `src/i18n.js` (fa و en)؛ ادمین از `src/admin/i18n.js`. اعداد با `formatNumber(value, lang)` (`src/lib/digits.js`) تا ارقام فارسی شوند.
4. استایل: برای قابلیت‌های جدید (دسکتاپ و موبایل مشترک) به انتهای `style.css` ریشه اضافه کن؛ استایل مخصوص موبایل در `src/components/mobile/mobile.css`.
5. موبایل (≤820px) را بررسی کن؛ محتوای حساس را در لیست‌ها/APIهای عمومی رعایت کن (بخش 4).
6. `npm run build` + تست با mock (بخش 6)؛ بعد HANDOFF را به‌روز کن.

## 12. اولویت قوانین (تضادهای مستندات)
- `AGENTS.md` در بخش «Mobile UI redesign rules» قوانین دوره‌ی بازطراحی موبایل را دارد؛ آن بازطراحی تمام شده. **قانون فعلی:** تغییر UI دسکتاپ مجاز است (قابلیت‌های جدید دسکتاپ را هم دارند)، `style.css` ریشه فعال است و باید استفاده شود، `App.jsx` بزرگ شده و ویرایش‌های هدفمند در آن عادی است. قوانین RTL، i18n، توکن‌های CSS، بدون وابستگی جدید بدون اجازه و پوشه‌ی مخصوص فایل موقت همچنان برقرارند.
- در تضاد بین مستندات: `CLAUDE.md` > این فایل > `AGENTS.md`.
