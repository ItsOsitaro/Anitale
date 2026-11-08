import { db } from './db.js';
import { getUserByUsername, canSeeList } from './users.js';
import { rowToItem } from './shape.js';
import { isSensitiveItem } from './sensitive.js';

// "What to watch together": anime both members want to watch, and what each loved (rated 8+) that the other does not
// have yet. Only the target's list as far as the viewer may see it (privacy), never anything from a hidden list.
const LOVED = 8;
const LIMIT = 8;

const clean = (slugs) => {
  const out = [];
  for (const slug of slugs) {
    const row = db.prepare('SELECT * FROM anime WHERE slug = ?').get(slug);
    if (row && !isSensitiveItem(rowToItem(row))) out.push(slug);
    if (out.length === LIMIT) break;
  }
  return out;
};

export const togetherFor = (viewerId, target) => {
  if (!canSeeList(target, 'anime', viewerId)) return { hidden: true, both: [], theyLoved: [], youLoved: [] };
  const listOf = (id) => new Map(db.prepare("SELECT slug, status, rating FROM user_entries WHERE user_id = ? AND media_type = 'anime'").all(id).map((r) => [r.slug, r]));
  const mine = listOf(viewerId);
  const theirs = listOf(target.id);
  const both = []; const theyLoved = []; const youLoved = [];
  for (const [slug, theirEntry] of theirs) {
    const myEntry = mine.get(slug);
    if (myEntry) {
      if (myEntry.status === 'planned' && theirEntry.status === 'planned') both.push(slug);
    } else if ((theirEntry.rating || 0) >= LOVED) theyLoved.push(slug);
  }
  for (const [slug, myEntry] of mine) if (!theirs.has(slug) && (myEntry.rating || 0) >= LOVED) youLoved.push(slug);
  return { hidden: false, both: clean(both), theyLoved: clean(theyLoved), youLoved: clean(youLoved) };
};

export const registerTogetherRoute = (app, { requireSiteUser, userIdOf }) => {
  app.get('/api/users/:username/together', requireSiteUser, (req, res) => {
    const target = getUserByUsername(String(req.params.username).slice(0, 40));
    if (!target) { res.status(404).json({ error: 'No such user' }); return; }
    const viewerId = userIdOf(req);
    if (target.id === viewerId) { res.status(400).json({ error: 'This is your own profile' }); return; }
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(togetherFor(viewerId, target));
  });
};
