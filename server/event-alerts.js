import { getSetting, setSetting } from './settings.js';
import { sendAlert } from './chat-bots.js';

// Instant owner alerts for things that need a person: a new member report, a new edit suggestion. Sent to the same
// chat as the health alerts. To keep a flood (or a spammer) from filling the chat, each kind sends at most one message
// per 10 minutes; the rest are still in the admin queues and the weekly report. Switch: /admin/jobs ("events").
const MIN_GAP_MS = 10 * 60000;
const lastAt = new Map();

export const eventAlertsEnabled = () => getSetting('alerts.events', '1') !== '0';
export const setEventAlertsEnabled = (on) => setSetting('alerts.events', on ? '1' : '0');

export const eventAlert = (kind, text) => {
  if (!eventAlertsEnabled()) return;
  const now = Date.now();
  if (now - (lastAt.get(kind) || 0) < MIN_GAP_MS) return;
  lastAt.set(kind, now);
  sendAlert(text).catch(() => {}); // an alert must never break the request that caused it
};
