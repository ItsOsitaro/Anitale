// Small helpers shared by the import pages.
export const parseMalRef = (text) => {
  const trimmed = String(text || '').trim();
  if (/^\d+$/.test(trimmed)) return { id: Number(trimmed), type: '' };
  const match = trimmed.match(/myanimelist\.net\/(anime|manga)\/(\d+)/i);
  return match ? { id: Number(match[2]), type: match[1].toLowerCase() } : null;
};

// 3725 -> "1:02:05", 95 -> "1:35"; null for unknown.
export const fmtDur = (sec) => {
  if (sec == null || !Number.isFinite(sec)) return '';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

// Safe localStorage JSON (private mode / quota errors must never break a page).
export const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } },
};

export const apiGet = async (url) => {
  const res = await fetch(url, { credentials: 'same-origin' });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error || res.statusText), { status: res.status });
  return data;
};

// Numbers and dates in the page language (Persian digits / Jalali date in fa).
const locale = (lang) => (lang === 'fa' ? 'fa-IR' : 'en-US');
export const fmtNum = (value, lang) => Number(value || 0).toLocaleString(locale(lang));
export const fmtDate = (iso, lang) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale(lang), { dateStyle: 'medium', timeStyle: 'short' });
};

// Server messages about an unreachable provider are English; show the translated hint instead.
export const friendly = (message, t) => (/Cannot reach|unreachable|ENOTFOUND|ECONNREFUSED|fetch failed/i.test(message || '') ? t('sourceNetwork') : message);

// Recent searches (quick add), newest first.
export const pushRecent = (list, text, max = 6) => [text, ...list.filter((item) => item !== text)].slice(0, max);

// Latin digits -> Persian digits in a ready string such as "1:02:05".
export const faDigits = (text, lang) => (lang === 'fa' ? String(text).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) : String(text));
