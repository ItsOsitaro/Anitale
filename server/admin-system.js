// Extra endpoints for the "system" admin pages. Add new routes under /api/admin/x/system/... only:
// the permission gate (server/admin-accounts.js) reads the area from that path (GET = view, other = edit).
import { requireAdmin } from './auth.js';
import { PROVIDERS, botSettings, saveBotSettings, verifyBot, alertInfo, makeAlertCode, unlinkAlert, sendAlertTest } from './chat-bots.js';
import { alertConfig, saveAlertConfig } from './health-alerts.js';

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
  // Health alerts to the owner: which chat is linked, thresholds, a one-time link code, a test message.
  const alertState = () => ({ ...alertConfig(), targets: alertInfo() });
  app.get('/api/admin/x/system/alerts', requireAdmin, (req, res) => res.json(alertState()));
  app.post('/api/admin/x/system/alerts', requireAdmin, (req, res) => {
    saveAlertConfig({ enabled: typeof (req.body || {}).enabled === 'boolean' ? req.body.enabled : undefined, diskPct: (req.body || {}).diskPct });
    return res.json(alertState());
  });
  app.post('/api/admin/x/system/alerts/code', requireAdmin, (req, res) => {
    const id = (req.body || {}).provider;
    if (!PROVIDERS[id]) return bad(res, 'Unknown messenger');
    return res.json(makeAlertCode(id));
  });
  app.post('/api/admin/x/system/alerts/test', requireAdmin, async (req, res) => {
    const sent = await sendAlertTest();
    return sent ? res.json({ ok: true, sent }) : res.status(502).json({ error: 'No linked chat accepted the message' });
  });
  app.delete('/api/admin/x/system/alerts/:provider', requireAdmin, (req, res) => {
    if (!PROVIDERS[req.params.provider]) return bad(res, 'Unknown messenger');
    unlinkAlert(req.params.provider);
    return res.json(alertState());
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
