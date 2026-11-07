import React, { useCallback, useEffect, useRef, useState } from 'react';

// Shared helpers for the community / user admin pages (reviews, recs, suggestions, site users).

export const fmtDate = (value, lang, withTime = false) => {
  if (!value) return '';
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(value)) ? value : `${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return '';
  const locale = lang === 'fa' ? 'fa-IR' : 'en-GB';
  return withTime ? d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : d.toLocaleDateString(locale);
};

export const num = (n, lang) => Number(n || 0).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-GB');

export const qs = (params) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null && v !== false) sp.set(k, String(v));
  return sp.toString();
};

// Small fetch wrapper (same contract as api.js: throws Error with .status, 'NETWORK' on connection loss).
export const call = async (method, url, body) => {
  let res;
  try {
    res = await fetch(url, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw Object.assign(new Error('NETWORK'), { status: 0 });
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('admin-unauthorized'));
    throw Object.assign(new Error(data?.error || res.statusText), { status: res.status });
  }
  return data;
};

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

// Server-paged list. Keeps the previous rows on screen while a new page loads; stale responses are dropped.
export function useRemoteList(url, params, errText) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const [tick, setTick] = useState(0);
  const key = `${url}?${qs(params)}`;
  const errRef = useRef(errText);
  errRef.current = errText;
  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true }));
    call('GET', key)
      .then((data) => { if (active) setState({ data, error: '', loading: false }); })
      .catch((err) => { if (active) setState((s) => ({ ...s, error: errRef.current(err), loading: false })); });
    return () => { active = false; };
  }, [key, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}

// "/" focuses the search box, Escape inside it clears it.
export function useSearchHotkey(inputRef, clear) {
  useEffect(() => {
    const onKey = (e) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !['input', 'textarea', 'select'].includes(tag)) { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inputRef]);
  return (e) => { if (e.key === 'Escape') clear(); };
}

export function useSelection(items, idOf = (x) => x.id) {
  const [ids, setIds] = useState(() => new Set());
  const toggle = (id) => setIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clear = useCallback(() => setIds(new Set()), []);
  const all = Boolean(items?.length) && items.every((x) => ids.has(idOf(x)));
  const toggleAll = () => setIds(all ? new Set() : new Set((items || []).map(idOf)));
  // Drop ids that are no longer on the page.
  useEffect(() => {
    setIds((prev) => {
      const present = new Set((items || []).map(idOf));
      const next = new Set([...prev].filter((id) => present.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ids, has: (id) => ids.has(id), toggle, toggleAll, all, clear, count: ids.size };
}

export function Skeleton({ rows = 5 }) {
  return <div className="adm-skeleton" aria-hidden="true">{Array.from({ length: rows }, (_, i) => <i key={i} />)}</div>;
}

export function Pager({ data, page, setPage, t, lang }) {
  if (!data || data.pages <= 1) return null;
  return (
    <div className="adm-pager">
      <button className="adm-btn" type="button" disabled={page <= 1} onClick={() => setPage(1)} aria-label={t('cmFirst')}>«</button>
      <button className="adm-btn" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('prev')}</button>
      <span>{t('pageOf', lang ? { page: num(data.page, lang), pages: num(data.pages, lang) } : { page: data.page, pages: data.pages })}</span>
      <button className="adm-btn" type="button" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>{t('next')}</button>
      <button className="adm-btn" type="button" disabled={page >= data.pages} onClick={() => setPage(data.pages)} aria-label={t('cmLast')}>»</button>
    </div>
  );
}

// Filter chip with a count badge.
export function Chip({ on, onClick, children, count }) {
  return (
    <button type="button" className={`adm-fchip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={onClick}>
      {children}{count != null && <b>{count}</b>}
    </button>
  );
}

export function ErrorBar({ error, onRetry, t }) {
  if (!error) return null;
  return (
    <div className="adm-error cm-errbar" role="alert">
      <span>{error}</span>
      <button className="adm-btn" type="button" onClick={onRetry}>{t('cmRetry')}</button>
    </div>
  );
}

// Bar shown while rows are selected.
export function BulkBar({ count, t, children, onClear, lang }) {
  if (!count) return null;
  const n = lang ? num(count, lang) : count;
  return (
    <div className="cm-bulk" role="region" aria-label={t('cmSelected', { n })}>
      <strong>{t('cmSelected', { n })}</strong>
      <div className="adm-actions">{children}</div>
      <button className="adm-btn" type="button" onClick={onClear}>{t('cmClear')}</button>
    </div>
  );
}

// Long text clamped to a few lines with a toggle.
export function Clamp({ text, t, limit = 220 }) {
  const [open, setOpen] = useState(false);
  const long = text.length > limit;
  return (
    <>
      <span dir="auto">{long && !open ? `${text.slice(0, limit).trimEnd()}…` : text}</span>
      {long && <button type="button" className="cm-link" onClick={() => setOpen((v) => !v)}>{open ? t('cmLess') : t('cmMore')}</button>}
    </>
  );
}
