import { db } from './db.js';
import { getBySlug, getMangaBySlug, mangaRowToItem } from './repo.js';
import { rowToItem } from './shape.js';
import { isSensitiveItem } from './sensitive.js';

// Two small community highlights for the home page: the most helpful recent review, and the most liked public stacks.
// Cheap, so it is simply cached for ten minutes in memory.
const TTL_MS = 10 * 60000;
let cache = { at: 0, value: null };

const titleOf = (type, slug) => {
  const row = type === 'manga' ? getMangaBySlug(slug) : getBySlug(slug);
  if (!row) return null;
  const item = type === 'manga' ? mangaRowToItem(row) : rowToItem(row);
  return isSensitiveItem(item) ? null : { type, slug: item.slug, title: item.title, image: item.image || '' };
};

const reviewOfTheWeek = () => {
  // Helpful votes first (they are the community's own pick); long enough to say something; never a spoiler.
  const rows = db.prepare(`
    SELECT r.id, r.media_type, r.slug, r.body, u.username, u.avatar_color,
      (SELECT COUNT(*) FROM review_votes v WHERE v.review_id = r.id) AS helpful,
      (SELECT e.rating FROM user_entries e WHERE e.user_id = r.user_id AND e.media_type = r.media_type AND e.slug = r.slug) AS rating
    FROM reviews r JOIN users u ON u.id = r.user_id
    WHERE r.spoiler = 0 AND length(r.body) >= 80 AND r.created_at >= datetime('now', '-60 days')
    ORDER BY helpful DESC, r.id DESC LIMIT 12`).all();
  for (const row of rows) {
    const media = titleOf(row.media_type, row.slug);
    if (!media) continue;
    const body = row.body.length > 280 ? `${row.body.slice(0, 280).trimEnd()}…` : row.body;
    return { id: row.id, username: row.username, bloom: Number.parseInt(row.avatar_color, 10) || 12, rating: row.rating ?? null, helpful: row.helpful, body, media };
  }
  return null;
};

const topStacks = () => db.prepare(`
  SELECT s.id, s.title, u.username,
    (SELECT COUNT(*) FROM stack_items i WHERE i.stack_id = s.id) AS item_count,
    (SELECT COUNT(*) FROM stack_likes l WHERE l.stack_id = s.id) AS likes
  FROM stacks s JOIN users u ON u.id = s.user_id
  WHERE s.is_public = 1 AND item_count > 0
  ORDER BY likes DESC, s.id DESC LIMIT 4`).all().map((row) => ({ id: row.id, title: row.title, owner: row.username, itemCount: row.item_count, likes: row.likes }));

export const registerHomeCommunityRoute = (app) => {
  app.get('/api/home/community', (req, res) => {
    if (!cache.value || Date.now() - cache.at > TTL_MS) cache = { at: Date.now(), value: { review: reviewOfTheWeek(), stacks: topStacks() } };
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(cache.value);
  });
};
