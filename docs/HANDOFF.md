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
- ایران بعضی mirrorهای apt را می‌بندد؛ نصب بسته ممکن است شکست بخورد.
- `git pull` → «Already up to date» یعنی هنوز push نشده.
- بعد از هر دیپلوی: پاک‌کردن کش آروان.

- **ورود فایل‌های Syncthing به گیت (2026-11-03)**: فایل‌های `*.sync-conflict-*` و `.stfolder` به‌اشتباه commit شدند (از جمله کپی `server/.sync-conflict-…env`). از ریپو برداشته و در `.gitignore` ثبت شد، ولی در تاریخچه گیت مانده؛ مالک تصمیم گرفت رمزها را فعلاً عوض نکند (باید مطمئن بود ریپو خصوصی است). فایل‌های conflict داخل `dist/` سرور پاک شدند.
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

## 7. تصمیم‌های مالک (باز نکن)
- فیلتر حساس: پیش‌فرض روشن + سوئیچ کاربر. ✔
- رتبه: فقط امتیاز منبع با فرمول بیزی. ✔
- **فعلاً نه**: فروم، کلاب‌ها، پیام خصوصی (C3–C5)، CSS دلخواه خام (به‌جایش چند تم رنگی آماده)، OAuth API.
- تم پروفایل = چند تم رنگی از پیش‌تعریف‌شده.

## 8. چک‌لیست بهبود (از PDF کاتالوگ MAL)
**انجام‌شده**: A1 رتبه بیزی، A5 فیلتر حساس، A3 فیلدهای لیست (تاریخ شروع/پایان خودکار+دستی، دفعات تماشای مجدد، اولویت فقط برای «برای بعد»، برچسب آزاد؛ ایمپورت/اکسپورت XML/CSV/JSON؛ فیلتر برچسب و ترتیب اولویت در داشبورد دسکتاپ؛ در موبایل فقط داخل شیت ویرایش).
**فاز 1**
- ~~A2~~ انجام شد: `communityStats` (server/reviews.js) حالا `statuses` (تعداد اعضا در هر وضعیت) و `listed` دارد؛ `StatusCounts` در `CommunitySection.jsx` (دسکتاپ و موبایل). توزیع امتیاز از قبل بود.
- ~~A3~~ انجام شد (بالا). فیلتر برچسب موبایل هم انجام شد. باقی‌مانده کوچک: ذخیره جزئیات برای مهمان (فعلاً فقط اعضا).
- ~~A4~~ انجام شد: «روز تماشا» در `profileInsights` (`watchedMinutes`: قسمت‌های دیده‌شده یا همه قسمت‌های عنوان تمام‌شده بدون progress + دفعات rewatch، × مدت قسمت از ردیف Duration؛ عنوان‌های بدون Duration رد می‌شوند و عدد با ≈ نشان داده می‌شود). تاریخ عضویت از قبل بود.
- ~~A6~~ انجام شد: `/api/search/full` با `genre` (چندتایی، AND)، `xgenre` (حذف)، `from`/`to` (بازه سال؛ `year` قدیمی هنوز کار می‌کند)، `status` (airing/finished/upcoming/other از ردیف Status)، `studio`، `rating` (کد قبل از « - » در ردیف Rating)، `letter` (A–Z یا #)، مرتب‌سازی `pop`/`votes`/`eps`؛ نمایه‌ها در `factsOf` داخل `server/search.js`؛ UI در `src/searchPage.jsx` (چیپ‌های سه‌حالته ژانر). استودیو و رده سنی فقط انیمه.
- ~~A7~~ انجام شد: `src/lib/genre-kinds.js` (مجموعه‌های ثابت MAL برای تم و مخاطب؛ هر چیز ناشناخته = ژانر)؛ `splitInfoRows` ردیف Genres را به Genres/Themes/Demographic می‌شکند (App.jsx)، چیپ‌های موبایل (MobileDetailPage)، پنل ژانر جستجو و optgroup فیلتر کاتالوگ. در `tenrai.js` ردیف Demographic انیمه هم اضافه شد (عنوان‌های قبلی با refresh پر می‌شوند، تقسیم‌بندی بدون refresh کار می‌کند). فیلتر موبایل (FilterSheet) هنوز گروه‌بندی نشده.
- ~~A8~~ انجام شد: نرمال‌سازی فارسی و کاربران از قبل بود؛ جستجوی شخصیت/فرد اضافه شد: `GET /api/search/people?q=` در `server/people.js` (Tenrai `/characters` و `/people`، کش حافظه ۱ ساعت، محدودیت ۲۰ در دقیقه؛ اگر Tenrai در دسترس نباشد از `people_cache` محلی جواب می‌دهد، `local:true`). UI: بخش‌های «شخصیت‌ها» و «افراد» در `searchPage.jsx` زیر کاربران. جستجوی هدر (combobox) فقط عنوان و کاربر دارد.
**فاز 2**: ~~B1~~ انجام شد (واکنش «مفید بود» تک‌نوعی در جدول `review_votes`، PUT/DELETE `/api/user/reviews/:id/helpful`، نه روی نقد خود؛ مرتب‌سازی `sort=new|helpful|high|low` در `/api/community`؛ حداقل طول همان ۱۰ ماند) · ~~B2~~ انجام شد (`server/recs.js`: جدول `recs` با جفت بدون‌جهت، write-once، دلیل ۱۰–۳۰۰ حرف، رأی «مفید بود» در `rec_votes`؛ API: GET `/api/recs/:type/:slug`، POST `/api/user/recs`، PUT/DELETE `/api/user/recs/:id/helpful`، ادمین: GET/DELETE `/api/admin/recs` — **UI ادمین هنوز نیست**؛ کلاینت `components/Recommendations.jsx` زیر نقدها) · ~~B3~~ انجام شد (`server/favorites.js`: جدول `favorites`، سقف ۱۰ در هر دسته، شخصیت/فرد با snapshot نام و عکس از `people_cache` — فقط چیزی که قبلاً صفحه‌اش باز شده قابل افزودن است؛ API: GET `/api/favorites/:kind/:ref` (count+mine)، PUT/DELETE `/api/user/favorites/:kind/:ref`؛ `favorites` در `/api/users/:username`؛ UI در `components/Favorites.jsx`: دکمه قلب روی صفحه عنوان دسکتاپ/موبایل و صفحه شخصیت/فرد + بخش علاقه‌مندی‌ها در پروفایل؛ عمومی) · ~~B4~~ انجام شد (ستون‌های `users.privacy_anime/privacy_manga` = public|friends|private؛ «دوستان» = کسانی که **مالک** دنبالشان می‌کند؛ `canSeeList`/`VISIBLE_ENTRY_SQL` در `server/users.js`؛ اعمال‌شده روی `/api/users/:name` (+`hidden`)، `/api/users` (شمارش فقط لیست‌های عمومی)، فید، common-lists، امتیاز کنار نقد (`reviews.js`)، SEO پروفایل؛ آمار ناشناس عنوان (میانگین/شمارش وضعیت) عمداً می‌ماند؛ تنظیم در صفحه `/account` و `PUT /api/user/me {privacy}`) · ~~B5~~ انجام شد (`tasteSimilarity` در `server/users.js`: ۱ − میانگین اختلاف امتیاز/۹ روی عنوان‌های مشترکِ امتیازدار، فقط لیست‌هایی که بیننده اجازه دیدنشان را دارد؛ حداقل ۸ عنوان وگرنه `percent:null`؛ در `/api/users/:name` و followers/following (۱۰۰ نفر اول) برای کاربر واردشده؛ UI: `components/TasteMatch.jsx` روی پروفایل، درصد + دکمه مرتب‌سازی در `FollowListSheet`) · ~~B6~~ انجام شد (ستون `users.about` تا ۲۰۰۰ حرف؛ `PUT /api/user/me {about}`؛ فقط در `/api/users/:name` و `ownUser` می‌آید، نه در لیست‌ها؛ نمایش با رندر React بدون HTML خام در `src/lib/safe-markup.jsx` — **bold**, *italic*, [متن](https://…) فقط http/https با `rel=nofollow noopener noreferrer ugc`, `## تیتر`, لیست `- `/`1. `, اسپویلر `||…||`؛ ویرایشگر با نوار ابزار و پیش‌نمایش زنده در `components/AboutEditor.jsx`، داخل داشبورد دسکتاپ و `EditProfileSheet` موبایل؛ بیوی ۳۰۰ حرفی جداست) · B7 ترتیب تماشا/گراف فرنچایز · B8 برترین شخصیت‌ها · B9 خانه: محبوب‌ترین، به‌زودی، آپدیت سریع +1 قسمت.
**فاز 3 (وابسته به داده/تصمیم)**: C1 تب قسمت‌ها/ویدیو/تصاویر · C2 صفحه استودیو/تهیه‌کننده/مجله · C6 interest stacks · C7 پیشنهاد ویرایش کاربران + صف ادمین · C8 API عمومی با انتخاب فیلد و ETag.

## 9. کارهای باز / یادآوری
- از مالک بپرس: «بروزرسانی همه» انیمه و مانگا را (برای ذخیره ژانر Ecchi) زده؟ build و restart سرور تمام شد؟
- پیشنهاد امنیتی اختیاری: SSH فقط با کلید؛ بررسی unattended-upgrades.
- تمیزکاری: واژه‌های قدیمی `PROVIDER`/Jikan در مستندات.
- تست مسیر refresh-all مانگا.

## 10. قراردادهای کدنویسی
- زبان UI: فارسی اولویت؛ هر رشته در `i18n.js` (fa/en)، ادمین در `admin/i18n.js`.
- routeهای نوشتن: `requireAdmin` (در صورت ادمین)، `writeLimiter`، اعتبارسنجی zod در `schemas`.
- تغییرات DB: migrate در `server/db.js`؛ بدون ORM.
- موبایل: هر صفحه جدید باید در ≤820px (MobileShell) بررسی شود (`docs/mobile-ui-spec.md`).
- فایل‌های ایجادشده در `server/xcache/`, `server/*.db*`, `.env*` را کامیت نکن.
