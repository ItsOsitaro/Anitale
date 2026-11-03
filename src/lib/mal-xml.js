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
  const collect = (type, nodeTag, idTag, progressTag) => {
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
      });
    }
  };
  collect('anime', 'anime', 'series_animedb_id', 'my_watched_episodes');
  collect('manga', 'manga', 'manga_mangadb_id', 'my_read_chapters');
  if (!items.length) throw new Error('EMPTY');
  return items;
};
