// Extra endpoints for the "system" admin pages. Add new routes under /api/admin/x/system/... only:
// the permission gate (server/admin-accounts.js) reads the area from that path (GET = view, other = edit).
import { requireAdmin } from './auth.js';
import { PROVIDERS, botSettings, saveBotSettings, verifyBot } from './chat-bots.js';

const bad = (res, message) => res.status(400).json({ error: message });

export const register = (app) => {
  // Messenger bots (new-episode alerts): tokens are write-only, the list only says whether one is set.
  app.get('/api/admin/x/system/chat', requireAdmin, (req, res) => res.json({ providers: botSettings() }));
  app.post('/api/admin/x/system/chat', requireAdmin, (req, res) => {
    const body = req.body || {};
    if (!PROVIDERS[body.provider]) return bad(res, 'Unknown messenger');
    if (body.token != null && (typeof body.token !== 'string' || body.token.length > 200 || /s/.test(body.token))) return bad(res, 'The token looks wrong');
    if (body.username != null && !/^@?[A-Za-z0-9_]{0,64}$/.test(String(body.username))) return bad(res, 'The bot username looks wrong');
    saveBotSettings(body.provider, { token: body.token, username: body.username, clear: body.clear === true });
    return res.json({ providers: botSettings() });
  });
  app.post('/api/admin/x/system/chat/test', requireAdmin, async (req, res) => {
    const id = (req.body || {}).provider;
    if (!PROVIDERS[id]) return bad(res, 'Unknown messenger');
    try {
      const username = await verifyBot(id);
      return res.json({ ok: true, username, providers: botSettings() });
    } catch (error) {
      return res.status(502).json({ error: String(error.message || error).slice(0, 200) });
    }
  });
};
