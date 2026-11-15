import { getBySlug, getByMalId, getMangaBySlug, getMangaByMalId, mangaItemsBy, mangaRowToItem } from './repo.js';
import { rowToItem } from './shape.js';
import { getCachedExtras } from './extras.js';
import { communityStats, listReviews } from './reviews.js';
import { listRecs } from './recs.js';

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

export function registerPageRoutes(app, { viewerId } = {}) {
  app.get('/api/page/:type/:key', async (req, res) => {
    const type = req.params.type === 'manga' ? 'manga' : req.params.type === 'anime' ? 'anime' : '';
    if (!type) throw httpError(400, 'Invalid type');

    const key = String(req.params.key || '').trim();
    const mal = /^\d+$/.test(key) ? Number(key) : null;
    let item = null;
    let rawRow = null;

    if (type === 'anime') {
      rawRow = getBySlug(key) || (mal ? getByMalId(mal) : null);
      item = rawRow ? rowToItem(rawRow) : null;
    } else {
      rawRow = getMangaBySlug(key) || (mal ? getMangaByMalId(mal) : null);
      item = mangaItemsBy({ slugs: [key], malIds: mal ? [mal] : [] })[0] || (rawRow ? mangaRowToItem(rawRow) : null);
    }

    if (!item) throw httpError(404, 'Title not found');

    const vId = viewerId ? viewerId(req) : null;

    const [extrasResult, communityResult, recsResult] = await Promise.allSettled([
      Promise.resolve().then(() => (item.malId ? getCachedExtras(type, item.malId) : null)),
      Promise.resolve().then(() => {
        const stats = communityStats(type, item.slug);
        const reviews = listReviews(type, item.slug, { viewerId: vId, limit: 10, offset: 0, sort: 'new' });
        return { stats, reviews: reviews.items, total: reviews.total, page: 1 };
      }),
      Promise.resolve().then(() => listRecs(type, item.slug, { viewerId: vId, limit: 10 })),
    ]);

    const extras = extrasResult.status === 'fulfilled' ? extrasResult.value : null;
    const community = communityResult.status === 'fulfilled' ? communityResult.value : null;
    const recs = recsResult.status === 'fulfilled' ? recsResult.value : [];

    const updatedAt = rawRow?.updated_at || item.updatedAt || '';
    const extrasStamp = extras?.fetchedAt || (extras ? 1 : 0);
    const commStamp = `${community?.stats?.count || 0}-${community?.total || 0}-${community?.reviews?.[0]?.id || 0}`;
    const recsStamp = `${recs?.length || 0}-${recs?.[0]?.id || 0}`;
    const etag = `W/"page-${type}-${item.slug}-${vId || 0}-${Date.parse(updatedAt || 0) || 0}-${extrasStamp}-${commStamp}-${recsStamp}"`;

    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('ETag', etag);

    if (req.headers['if-none-match'] === etag || req.fresh) {
      res.status(304).end();
      return;
    }

    res.json({
      item,
      extras,
      community,
      recs,
    });
  });
}
