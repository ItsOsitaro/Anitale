import { getSetting, setSetting } from './settings.js';
import { requireAdmin } from './auth.js';

// One short notice for every visitor (maintenance, news), shown as a bar above the site until its end date.
// Stored in settings: announce.text, announce.level (info|warn), announce.until (ISO time).
const read = () => {
  const text = getSetting('announce.text', '');
  const until = getSetting('announce.until', '');
  return { text, level: getSetting('announce.level', 'info') === 'warn' ? 'warn' : 'info', until, active: Boolean(text) && Boolean(until) && until > new Date().toISOString() };
};

export const registerAnnouncementRoutes = (app) => {
  app.get('/api/announcement', (_req, res) => {
    const a = read();
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(a.active ? { text: a.text, level: a.level, until: a.until } : {});
  });
  app.get('/api/admin/x/system/announcement', requireAdmin, (_req, res) => res.json(read()));
  app.post('/api/admin/x/system/announcement', requireAdmin, (req, res) => {
    const text = String(req.body?.text || '').trim().slice(0, 280);
    const hours = Math.min(24 * 60, Math.max(1, Number(req.body?.hours) || 24));
    if (!text) { res.status(400).json({ error: 'Text is required' }); return; }
    setSetting('announce.text', text);
    setSetting('announce.level', req.body?.level === 'warn' ? 'warn' : 'info');
    setSetting('announce.until', new Date(Date.now() + hours * 3600000).toISOString());
    res.json(read());
  });
  app.delete('/api/admin/x/system/announcement', requireAdmin, (_req, res) => {
    setSetting('announce.until', '');
    res.json(read());
  });
};
