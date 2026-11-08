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

const README = (opts) => `ANITALE TRANSLATION FILES
=========================
Each .json file holds up to ${opts.size} items. For every item:
  id    = identifier (never change it)
  title = English title (for context)
  en    = the English text to translate
  fa    = EMPTY: put the Persian translation here

Prompt for Claude (attach one or several .json files):
  "Translate the "en" text of every item into natural, fluent Persian and write it in "fa".
   Return the SAME JSON file (same structure, same ids, only "fa" filled in), nothing else.
   Keep names of characters/places as commonly written in Persian, keep line breaks."

Then import the returned files in the admin panel: Translation > Import / Export > Import.
What this export holds: ${opts.kind === 'title' ? 'TITLES' : 'SYNOPSES'}, ${opts.media.join(' + ')}, ${opts.scope === 'all' ? 'all items' : 'only items without Persian yet'}.

متن فارسی راهنما:
هر فایل را (یا چند فایل را با هم) به Claude بدهید و بنویسید: «مقدار en هر مورد را به فارسی روان ترجمه کن و در fa بگذار؛ همین فایل JSON را با همان ساختار و همان id ها برگردان.»
بعد فایل‌های برگشتی را در پنل: ترجمه ← ورود و خروج ← «وارد کردن» بدهید.
`;

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
          if (persianChars < Math.min(20, fa.length * 0.2)) { result.invalid += 1; problem(id, 'does not look Persian'); continue; }
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
