// Translation import/export for the admin "Translation" page, under /api/admin/x/translate/...
// (the permission gate maps that prefix to the `translate` area: GET = view, POST = edit).
//
//   GET  export-info  -> how many items / files an export would hold
//   GET  export.zip   -> a zip of small JSON files (English text with an empty "fa" to fill in)
//   POST import       -> { kind, media, items: [{ id, fa }] }  writes Persian titles / synopses
//
// The zip is built here (no dependency): each JSON file is deflated on its own, so memory stays at
// one file at a time even for 30k titles.
import zlib from 'node:zlib';
import { db } from './db.js';
import { requireAdmin } from './auth.js';

const MEDIA = ['anime', 'manga'];
const FILE_FORMAT = 'anitale-translation';
const MISSING_SYNOPSIS = "synopsis NOT LIKE '%\"fa\":\"_%'";
const MAX_IMPORT_ITEMS = 300;
const MAX_SYNOPSIS = 8000;
const MAX_TITLE = 500;
const PERSIAN = /[؀-ۿ]/g;

const cleanQuery = (req) => {
  const kind = req.query.kind === 'title' ? 'title' : 'synopsis';
  const media = ['anime', 'manga'].includes(req.query.media) ? [req.query.media] : MEDIA;
  const scope = req.query.scope === 'all' ? 'all' : 'missing';
  const size = Math.min(300, Math.max(20, Number(req.query.size) || 100));
  return { kind, media, scope, size };
};

// Read the stored synopsis as { en, fa } whatever shape the row uses (plain text, JSON string or JSON object).
const readSynopsis = (text) => {
  let value = text;
  try { value = JSON.parse(text); } catch { /* plain text */ }
  if (value && typeof value === 'object') return { en: String(value.en || ''), fa: String(value.fa || '') };
  return { en: String(value || ''), fa: '' };
};

const whereFor = ({ kind, scope }) => {
  if (scope === 'all') return kind === 'synopsis' ? "synopsis != ''" : '1=1';
  return kind === 'synopsis' ? `${MISSING_SYNOPSIS} AND synopsis != ''` : "title_fa = ''";
};

const countItems = (opts) => opts.media.reduce(
  (sum, table) => sum + db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${whereFor(opts)}`).get().n, 0,
);

// ---- minimal zip writer ----
const dosTime = (date) => ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
const dosDate = (date) => (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;

const createZip = (res) => {
  const central = [];
  let offset = 0;
  const now = new Date();
  const write = (buffer) => { res.write(buffer); offset += buffer.length; };
  return {
    add(name, text) {
      const raw = Buffer.from(text, 'utf8');
      const packed = zlib.deflateRawSync(raw);
      const nameBuf = Buffer.from(name, 'utf8');
      const crc = zlib.crc32(raw);
      const head = Buffer.alloc(30);
      head.writeUInt32LE(0x04034b50, 0);
      head.writeUInt16LE(20, 4);
      head.writeUInt16LE(0x0800, 6); // UTF-8 names
      head.writeUInt16LE(8, 8); // deflate
      head.writeUInt16LE(dosTime(now), 10);
      head.writeUInt16LE(dosDate(now), 12);
      head.writeUInt32LE(crc, 14);
      head.writeUInt32LE(packed.length, 18);
      head.writeUInt32LE(raw.length, 22);
      head.writeUInt16LE(nameBuf.length, 26);
      central.push({ nameBuf, crc, csize: packed.length, usize: raw.length, offset });
      write(head);
      write(nameBuf);
      write(packed);
    },
    finish() {
      const start = offset;
      for (const entry of central) {
        const rec = Buffer.alloc(46);
        rec.writeUInt32LE(0x02014b50, 0);
        rec.writeUInt16LE(20, 4);
        rec.writeUInt16LE(20, 6);
        rec.writeUInt16LE(0x0800, 8);
        rec.writeUInt16LE(8, 10);
        rec.writeUInt16LE(dosTime(now), 12);
        rec.writeUInt16LE(dosDate(now), 14);
        rec.writeUInt32LE(entry.crc, 16);
        rec.writeUInt32LE(entry.csize, 20);
        rec.writeUInt32LE(entry.usize, 24);
        rec.writeUInt16LE(entry.nameBuf.length, 28);
        rec.writeUInt32LE(entry.offset, 42);
        write(rec);
        write(entry.nameBuf);
      }
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0);
      end.writeUInt16LE(central.length, 8);
      end.writeUInt16LE(central.length, 10);
      end.writeUInt32LE(offset - start, 12);
      end.writeUInt32LE(start, 16);
      write(end);
      res.end();
    },
  };
};

// The README tells the translator (Claude) what the text is for, who reads it and how to return the file.
const README_COMMON_FA = `درباره‌ی پروژه
=============
«انی‌تیل» یک سایت فارسی‌زبان برای کاتالوگ انیمه و مانگا است (شبیه MyAnimeList، با رابط راست‌به‌چپ). داده‌ها از MyAnimeList گرفته شده و به انگلیسی است. هدف این کار، فارسی‌کردن متن‌هاست تا کاربر ایرانی بتواند انیمه یا مانگا را بشناسد و تصمیم بگیرد ببیند یا نه. مخاطب: دوستداران عادی انیمه و مانگا؛ نه متخصص و نه کودک.

دستور کار برای مترجم (Claude)
==============================
۱. فقط مقدار "fa" هر مورد را پر کن. "id"، "title"، "en" و بقیهٔ ساختار را هرگز تغییر نده، ترتیب موارد را عوض نکن، مورد را جا نینداز و دو مورد را ادغام نکن.
۲. اگر "en" خالی است، "fa" را هم خالی بگذار.
۳. خروجی باید دقیقاً همان فایل JSON معتبر باشد (کاراکتر " داخل متن را با \\" بنویس، خط جدید داخل متن را با \\n). هیچ توضیح اضافه، مقدمه یا نتیجه‌گیری ننویس. بهتر است نتیجه را به‌صورت فایل قابل‌دانلود بدهی؛ اگر نشد، فقط یک بلوک JSON کامل.
۴. حتماً همهٔ موارد فایل را کامل برگردان؛ اگر فایل طولانی است ناقص نفرست.
`;

const README_SYNOPSIS_FA = `چه چیزی ترجمه می‌شود: «خلاصهٔ داستان» (synopsis)
------------------------------------------------
- این متن در صفحهٔ هر انیمه/مانگا زیر عنوان «خلاصهٔ داستان» نمایش داده می‌شود و خواننده را متقاعد می‌کند ببیند/بخواند. پس باید روان، طبیعی و جذاب باشد، نه ترجمهٔ کلمه‌به‌کلمه و سنگین.
- معنا و لحن را حفظ کن؛ چیزی اضافه نکن، چیزی حذف نکن و داستان را لو نده (اگر منبع لو نداده، تو هم نده).
- نام شخصیت‌ها: به همان شکلی که در فارسی رایج است بنویس (مثلاً ناروتو، لوفی، ایرن). اگر شکل رایجی ندارد، آوانگاری ساده و خوانا با حروف فارسی بنویس. نام‌های خاص (جاها، گروه‌ها، قدرت‌ها) هم همین‌طور؛ اگر ترجمهٔ معنایی خوبی دارند همان را به کار ببر.
- نام آثار دیگری که در متن آمده (مثلاً «اقتباس از مانگای …») را با اسم لاتین/ژاپنی اصلی (انگلیسی) نگه دار و در صورت نیاز توضیح کوتاه فارسی کنارش بگذار.
- اصطلاحات رایج را رایج بنویس (مثلاً ایسکای، شونن). «MAL»، «OVA»، «TV» و مانند آن‌ها را لاتین نگه دار.
- جمله‌های منبع/اعتبار مثل «(Source: …)» یا «[Written by MAL Rewrite]» را ترجمه نکن و حذف کن؛ در "fa" نیایند.
- نگارش فارسی درست: «ي/ك» عربی ننویس (ی و ک فارسی)، نیم‌فاصله را درست به کار ببر (می‌شود، کتاب‌ها)، نشانه‌گذاری فارسی (، ؛ ؟ «»)، اعداد را با ارقام فارسی (۰-۹) بنویس.
- پاراگراف‌بندی متن اصلی (خط خالی بین پاراگراف‌ها) را حفظ کن.
`;

const README_TITLE_FA = `چه چیزی ترجمه می‌شود: «عنوان» (title)
-----------------------------------------
- این عنوان فارسی فقط به‌عنوان «عنوان جایگزین فارسی» زیر مشخصات هر اثر نشان داده می‌شود و در جستجو حساب می‌شود؛ عنوان اصلی سایت انگلیسی می‌ماند. هدف این است که کسی که اثر را با نام فارسی می‌شناسد و جستجو می‌کند آن را پیدا کند.
- اگر عنوان فارسیِ رایج و شناخته‌شده‌ای دارد (مثلاً نام معروف در میان طرفداران ایرانی)، همان را بنویس.
- وگرنه: عنوان‌های کوتاه و اسمی (مثل Naruto) را با آوانگاری فارسی بنویس (ناروتو)؛ عنوان‌های توصیفی (مثل «Attack on Titan») را به‌صورت معنایی و طبیعی ترجمه کن (حملهٔ تایتان‌ها).
- فقط خود عنوان را بنویس؛ بدون توضیح و بدون پرانتز. اگر زیرعنوان یا شمارهٔ فصل در عنوان انگلیسی هست، همان را به همان شکل ترجمه یا آوانگاری کن؛ چیزی اضافه نکن.
- نیم‌فاصله و «ی/ک» فارسی را رعایت کن؛ اعداد را فارسی بنویس.
- اگر ترجمهٔ معنایی عنوان بی‌معنا یا نامفهوم می‌شود، آوانگاریِ ساده بنویس؛ از ترجمهٔ خلاقانه یا بی‌ربط پرهیز کن.
`;

const README = (opts) => {
  const synopsis = opts.kind !== 'title';
  return `ANITALE TRANSLATION FILES / فایل‌های ترجمهٔ انی‌تیل
=======================================================
${README_COMMON_FA}
${synopsis ? README_SYNOPSIS_FA : README_TITLE_FA}
ساختار هر مورد داخل فایل‌های .json
-----------------------------------
  id    = شناسهٔ مورد (هرگز عوض نشود)
${synopsis ? '  title = عنوان انگلیسی (فقط برای فهم زمینه؛ ترجمه نشود)\n' : ''}  en    = متن انگلیسیِ مورد ترجمه
  fa    = جای نوشتن ترجمهٔ فارسی (الان خالی${opts.scope === 'all' ? ' یا شامل ترجمهٔ فعلی؛ اگر پر است، بهتر کن و بازنویسی کن' : ''})

متن آمادهٔ پیام (کپی کن و همراه فایل‌های .json و همین README.txt به Claude بده)
-------------------------------------------------------
«من مدیر سایت فارسی انی‌تیل (کاتالوگ انیمه و مانگا) هستم. فایل‌های پیوست را بر اساس راهنمای README.txt ترجمه کن: فقط مقدار "fa" هر مورد را با ترجمهٔ فارسی روان و مناسب این سایت پر کن، همهٔ موارد را کامل و بدون هیچ تغییری در "id" و ساختار برگردان، و فقط فایل JSON نهایی را بده.»

ENGLISH SUMMARY
---------------
Anitale is a Persian (RTL) anime/manga catalogue modelled on MyAnimeList; the English texts come from MyAnimeList. Fill ONLY the "fa" field of every item with a fluent, natural Persian translation suited to ${synopsis ? 'a synopsis page (engaging, no spoilers added, common Persian spellings of names, source credits like "(Source: ...)" dropped)' : 'an alternative Persian title used for display and search (the established Persian name if one exists, otherwise a simple transliteration or meaning-based translation; title only, no explanations)'}. Never change "id", never reorder or skip items, return the same valid JSON and nothing else.

Export: ${synopsis ? 'SYNOPSES' : 'TITLES'}, ${opts.media.join(' + ')}, ${opts.scope === 'all' ? 'all items' : 'only items without Persian yet'}, up to ${opts.size} items per file.
After translating: admin panel > Translation > Import / Export > Import (choose the returned .json files).
`;
};

export const register = (app) => {
  app.get('/api/admin/x/translate/export-info', requireAdmin, (req, res) => {
    const opts = cleanQuery(req);
    const count = countItems(opts);
    res.json({ count, files: Math.ceil(count / opts.size) });
  });

  app.get('/api/admin/x/translate/export.zip', requireAdmin, (req, res) => {
    const opts = cleanQuery(req);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="anitale-${opts.kind}-${stamp}.zip"`);
    res.setHeader('Cache-Control', 'no-store');
    const zip = createZip(res);
    zip.add('README.txt', README(opts));
    for (const table of opts.media) {
      let after = 0;
      let part = 0;
      for (;;) {
        const rows = db.prepare(`SELECT id, slug, title, title_fa, synopsis FROM ${table} WHERE id > ? AND ${whereFor(opts)} ORDER BY id ASC LIMIT ?`).all(after, opts.size);
        if (!rows.length) break;
        after = rows[rows.length - 1].id;
        part += 1;
        const items = rows.map((row) => {
          if (opts.kind === 'title') return { id: row.slug, en: row.title, fa: opts.scope === 'all' ? row.title_fa : '' };
          const syn = readSynopsis(row.synopsis);
          return { id: row.slug, title: row.title, en: syn.en, fa: opts.scope === 'all' ? syn.fa : '' };
        }).filter((item) => item.en.trim());
        if (!items.length) continue;
        const file = { format: FILE_FORMAT, kind: opts.kind, media: table, part, items };
        zip.add(`${opts.kind}-${table}-${String(part).padStart(3, '0')}.json`, JSON.stringify(file, null, 1));
      }
    }
    zip.finish();
  });

  app.post('/api/admin/x/translate/import', requireAdmin, (req, res) => {
    const { kind, media, items } = req.body || {};
    if (!['synopsis', 'title'].includes(kind) || !MEDIA.includes(media) || !Array.isArray(items)) {
      res.status(400).json({ error: 'Bad import data: expected { kind, media, items }' });
      return;
    }
    if (items.length > MAX_IMPORT_ITEMS) {
      res.status(400).json({ error: `At most ${MAX_IMPORT_ITEMS} items per request` });
      return;
    }
    const result = { updated: 0, empty: 0, invalid: 0, notFound: 0, problems: [] };
    const problem = (id, why) => { if (result.problems.length < 20) result.problems.push({ id: String(id).slice(0, 80), why }); };
    const find = db.prepare(`SELECT id, title, synopsis FROM ${media} WHERE slug = ?`);
    const setSynopsis = db.prepare(`UPDATE ${media} SET synopsis = ?, updated_at = datetime('now') WHERE id = ?`);
    const setTitle = db.prepare(`UPDATE ${media} SET title_fa = ?, updated_at = datetime('now') WHERE id = ?`);
    db.exec('BEGIN');
    try {
      for (const item of items) {
        const id = String(item?.id || '');
        const fa = String(item?.fa ?? '').replace(/\r\n/g, '\n').trim();
        if (!id) { result.invalid += 1; problem('?', 'missing id'); continue; }
        if (!fa) { result.empty += 1; continue; }
        const row = find.get(id);
        if (!row) { result.notFound += 1; problem(id, 'no such title'); continue; }
        const persianChars = (fa.match(PERSIAN) || []).length;
        if (kind === 'title') {
          if (fa.length > MAX_TITLE) { result.invalid += 1; problem(id, 'title too long'); continue; }
          if (!persianChars && fa === row.title) { result.invalid += 1; problem(id, 'not translated'); continue; }
          setTitle.run(fa, row.id);
        } else {
          if (fa.length > MAX_SYNOPSIS) { result.invalid += 1; problem(id, 'synopsis too long'); continue; }
          // Only reject text that is clearly not Persian: texts full of Latin names or digits are still valid.
          if (persianChars < Math.min(8, Math.max(1, fa.length * 0.05)) || fa === readSynopsis(row.synopsis).en) { result.invalid += 1; problem(id, 'does not look Persian'); continue; }
          // No "auto" flag: a person (or Claude, reviewed by a person) wrote this, so it counts as approved.
          setSynopsis.run(JSON.stringify({ fa, en: readSynopsis(row.synopsis).en }), row.id);
        }
        result.updated += 1;
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    res.json(result);
  });
};
