// Reads a MyAnimeList list export (anime or manga XML, optionally gzipped) into plain records.
const STATUS_TEXT = [
  [/plan/i, 'planned'],
  [/complet/i, 'completed'],
  [/hold/i, 'on_hold'],
  [/drop/i, 'dropped'],
  [/watching|reading/i, 'watching'],
];
const STATUS_NUM = { 1: 'watching', 2: 'completed', 3: 'on_hold', 4: 'dropped', 6: 'planned' };

export const mapStatus = (raw) => {
  const text = String(raw ?? '').trim();
  if (/^\d+$/.test(text)) return STATUS_NUM[Number(text)] || null;
  for (const [pattern, status] of STATUS_TEXT) if (pattern.test(text)) return status;
  return null;
};

const pick = (node, tag) => node.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';
const toInt = (value) => (/^\d+$/.test(value) ? Number(value) : 0);
// MAL writes 0000-00-00 (or a partial 2020-00-00) when a date is unknown.
const toDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  const ok = !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value && d.getUTCFullYear() >= 1950 && d.getUTCFullYear() <= 2100;
  return ok ? value : null;
};
const toPriority = (value) => ({ low: 'low', medium: 'medium', high: 'high' })[String(value).toLowerCase()] || null;
const toTags = (value) => [...new Set(String(value || '').split(',').map((tag) => tag.replace(/\s+/g, ' ').trim().slice(0, 24)).filter(Boolean))].slice(0, 10);

// Gzip files (.xml.gz) start with 1f 8b; everything else is read as text.
export const readExportFile = async (file) => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('GZIP_UNSUPPORTED');
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  return new TextDecoder('utf-8').decode(bytes);
};

export const parseMalXml = (xmlText) => {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('BAD_XML');
  const items = [];
  const seen = new Set();
  const collect = (type, nodeTag, idTag, progressTag, timesTag) => {
    for (const node of Array.from(doc.getElementsByTagName(nodeTag))) {
      const malId = toInt(pick(node, idTag));
      const status = mapStatus(pick(node, 'my_status'));
      if (!malId || !status || seen.has(`${type}${malId}`)) continue;
      seen.add(`${type}${malId}`);
      items.push({
        type,
        malId,
        status,
        score: Math.min(10, toInt(pick(node, 'my_score'))),
        progress: Math.min(5000, toInt(pick(node, progressTag))),
        title: pick(node, type === 'anime' ? 'series_title' : 'manga_title'),
        startDate: toDate(pick(node, 'my_start_date')),
        finishDate: toDate(pick(node, 'my_finish_date')),
        rewatch: Math.min(99, toInt(pick(node, timesTag))),
        // MAL fills every title with LOW, so priority only means something on the plan-to-watch list.
        priority: status === 'planned' ? toPriority(pick(node, 'my_priority')) : null,
        tags: toTags(pick(node, 'my_tags')),
      });
    }
  };
  collect('anime', 'anime', 'series_animedb_id', 'my_watched_episodes', 'my_times_watched');
  collect('manga', 'manga', 'manga_mangadb_id', 'my_read_chapters', 'my_times_read');
  if (!items.length) throw new Error('EMPTY');
  return items;
};
