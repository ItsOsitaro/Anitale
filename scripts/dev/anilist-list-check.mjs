// Self-check for the AniList list import conversion against a fake GraphQL server (no network, no real account).
//   node scripts/dev/anilist-list-check.mjs
import http from 'node:http';
import assert from 'node:assert/strict';

const entry = (status, score, progress, malId, extra = {}) => ({ status, score, progress, repeat: 0, startedAt: { year: 2024, month: 1, day: 5 }, completedAt: { year: null, month: null, day: null }, media: { idMal: malId, title: { romaji: `Title ${malId}`, english: null } }, ...extra });
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const { variables } = JSON.parse(body);
    res.setHeader('Content-Type', 'application/json');
    if (variables.name === 'ghost') { res.statusCode = 404; res.end(JSON.stringify({ errors: [{ status: 404, message: 'User not found' }] })); return; }
    const anime = variables.type === 'ANIME';
    res.end(JSON.stringify({ data: { MediaListCollection: {
      user: { mediaListOptions: { scoreFormat: 'POINT_100' } },
      lists: anime
        ? [{ entries: [entry('COMPLETED', 85, 12, 1), entry('CURRENT', 0, 3, 2), entry('PLANNING', 0, 0, 3), entry('PAUSED', 40, 5, 4), entry('DROPPED', 100, 1, 5), entry('COMPLETED', 70, 12, null)] }, { entries: [entry('COMPLETED', 85, 12, 1)] }]
        : [{ entries: [entry('CURRENT', 90, 20, 100)] }],
    } } }));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
process.env.ANILIST_URL = `http://127.0.0.1:${server.address().port}`;

const { anilistUserList } = await import('../../server/anilist.js');
const { items, withoutMalId } = await anilistUserList('someone');
const byId = (id) => items.find((i) => i.malId === id);

assert.equal(items.length, 6, 'duplicates across lists collapse and entries without a MAL id are skipped');
assert.equal(withoutMalId, 1);
assert.deepEqual([byId(1).type, byId(1).status, byId(1).score], ['anime', 'completed', 9], '85/100 becomes 9 (rounded)');
assert.equal(byId(1).startDate, '2024-01-05');
assert.equal(byId(1).finishDate, null);
assert.equal(byId(2).status, 'watching');
assert.equal('score' in byId(2), false, 'an unscored entry carries no score');
assert.equal(byId(3).status, 'planned');
assert.equal(byId(4).status, 'on_hold');
assert.equal(byId(5).score, 10);
assert.equal(byId(100).type, 'manga');
await assert.rejects(() => anilistUserList('ghost'), (error) => error.status === 404);

console.log('anilist list import: all checks passed');
server.close();
process.exit(0);
