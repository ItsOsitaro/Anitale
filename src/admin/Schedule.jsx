import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api as adminApi } from './api.js';
import { useAdmin } from './context.js';
import { formatNumber } from '../lib/digits.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PERSIAN_WEEK = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']; // week starts on Saturday in Iran
const DAY_LABELS = {
  Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday',
  Fri: 'friday', Sat: 'saturday', Sun: 'sunday',
};
const TODAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
const UNSCHEDULED_PAGE = 30;

export default function Schedule() {
  const { t, lang, toast, can } = useAdmin();
  const canEdit = can('catalog', 'edit');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [filter, setFilter] = useState('');
  const [shown, setShown] = useState(UNSCHEDULED_PAGE);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState(null); // null = idle, array = catalog search results
  const alive = useRef(true);
  const searchSeq = useRef(0);

  const days = lang === 'fa' ? PERSIAN_WEEK : WEEKDAYS;
  const num = (value) => formatNumber(value, lang);
  const dayName = (day) => (day ? t(DAY_LABELS[day]) : t('scheduleNone'));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // lite = the same list without the heavy per-title fields (about 4x smaller).
      const response = await fetch('/api/anime?lite=1', { credentials: 'same-origin' });
      if (!response.ok) throw new Error(response.statusText || String(response.status));
      const data = await response.json();
      if (alive.current) setItems(Array.isArray(data) ? data : (data.items || []));
    } catch (err) {
      if (alive.current) setError(err?.message || String(err));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, [load]);

  // Catalog-wide search (the loaded list only holds the core titles).
  useEffect(() => {
    const q = search.trim();
    searchSeq.current += 1;
    const seq = searchSeq.current;
    if (q.length < 2) { setFound(null); return undefined; }
    const timer = window.setTimeout(() => {
      fetch(`/api/admin/anime?${new URLSearchParams({ q, limit: '8' })}`, { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
        .then((data) => { if (seq === searchSeq.current) setFound(data.items || []); })
        .catch((err) => { if (seq === searchSeq.current) { setFound([]); toast(err?.message || String(err), 'error'); } });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, toast]);

  // Optimistic: move the row right away, roll back if the server refuses.
  const changeDay = async (item, nextDay) => {
    if (!canEdit || busy) return;
    const previous = item.airingDay || '';
    if (previous === nextDay) return;
    const wasKnown = bySlug.has(item.slug);
    setBusy(item.slug);
    setItems((list) => (wasKnown
      ? list.map((x) => (x.slug === item.slug ? { ...x, airingDay: nextDay } : x))
      : [...list, { ...item, airingDay: nextDay }]));
    try {
      await adminApi.setAiringDay(item.slug, nextDay);
      toast(nextDay ? t('scheduleSaved') : t('scRemoved'), 'ok');
    } catch (err) {
      setItems((list) => (wasKnown
        ? list.map((x) => (x.slug === item.slug ? { ...x, airingDay: previous } : x))
        : list.filter((x) => x.slug !== item.slug)));
      toast(`${t('scMoveFailed')} ${err?.message || ''}`.trim(), 'error');
    } finally {
      setBusy('');
    }
  };

  const grouped = useMemo(() => {
    const map = Object.fromEntries(WEEKDAYS.map((d) => [d, []]));
    const none = [];
    const needle = filter.trim().toLowerCase();
    for (const item of items) {
      if (needle && !`${item.title} ${item.slug}`.toLowerCase().includes(needle)) continue;
      (map[item.airingDay] || none).push(item);
    }
    for (const d of WEEKDAYS) map[d].sort((a, b) => String(a.title).localeCompare(String(b.title)));
    return { map, none };
  }, [items, filter]);

  const scheduledCount = items.filter((i) => WEEKDAYS.includes(i.airingDay)).length;
  const bySlug = useMemo(() => new Map(items.map((i) => [i.slug, i])), [items]);

  const renderSelect = (item, value, placeholder) => (!canEdit ? null : (
    <select
      value={value}
      disabled={!canEdit || busy === item.slug}
      onChange={(event) => changeDay(item, event.target.value)}
      aria-label={`${t('scheduleMove')}: ${item.title}`}
    >
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {!placeholder && <option value="">{t('scheduleNone')}</option>}
      {days.map((d) => <option key={d} value={d}>{dayName(d)}</option>)}
    </select>
  ));

  const renderRow = (item, day) => (
    <React.Fragment key={item.slug}>{rowBody(item, day)}</React.Fragment>
  );
  const rowBody = (item, day) => (
    <li className="adm-schedule-item" aria-busy={busy === item.slug}>
      <Link className="adm-schedule-title" to={`/admin/edit/${encodeURIComponent(item.slug)}`} title={`${item.title} — ${t('scEdit')}`} dir="auto">{item.title}</Link>
      {renderSelect(item, day)}
      {canEdit && day && (
        <button type="button" className="adm-sc-x" disabled={busy === item.slug} onClick={() => changeDay(item, '')} aria-label={`${t('scRemove')}: ${item.title}`} title={t('scRemove')}>×</button>
      )}
    </li>
  );

  if (loading && items.length === 0) {
    return <div className="adm-skeleton" aria-busy="true">{[0, 1, 2, 3].map((i) => <i key={i} />)}</div>;
  }
  if (error && items.length === 0) {
    return (
      <p className="adm-error" role="alert">
        {t('scLoadError')} {error} <button type="button" className="adm-btn" onClick={load}>{t('trRetry')}</button>
      </p>
    );
  }

  const unscheduled = grouped.none;

  return (
    <div className="adm-schedule">
      {!canEdit && <p className="adm-tr-note" role="note">{t('scReadOnly')}</p>}

      <div className="adm-toolbar">
        <input className="adm-search" type="search" dir="auto" value={filter} onChange={(e) => { setFilter(e.target.value); setShown(UNSCHEDULED_PAGE); }} placeholder={t('scFilter')} aria-label={t('scFilter')} />
        <span className="adm-chip">{t('scScheduledCount', { n: num(scheduledCount) })}</span>
        <button type="button" className="adm-btn adm-push" disabled={loading} onClick={load}>{t('scReload')}</button>
      </div>

      {canEdit && (
        <section className="adm-sc-add">
          <label className="adm-field">
            <span className="adm-label">{t('scSearchAll')}</span>
            <input type="search" dir="auto" value={search} maxLength={80} aria-describedby="sc-search-hint" onChange={(e) => setSearch(e.target.value)} placeholder={t('scSearchAllPlaceholder')} />
          </label>
          {found === null && search.trim().length < 2 && <p id="sc-search-hint" className="adm-muted">{t('scSearchAllHint')}</p>}
          {found && found.length === 0 && <p className="adm-muted">{t('scNoMatches')}</p>}
          {found && found.length > 0 && (
            <ul className="adm-schedule-list">
              {found.map((hit) => {
                const known = bySlug.get(hit.slug);
                const item = known || { slug: hit.slug, title: hit.title, image: hit.image, airingDay: '' };
                return (
                  <li key={hit.slug} className="adm-schedule-item">
                    <Link className="adm-schedule-title" to={`/admin/edit/${encodeURIComponent(hit.slug)}`} dir="auto">{hit.title}</Link>
                    {known && <span className="adm-muted">{t('scCurrentDay', { day: dayName(known.airingDay || '') })}</span>}
                    {renderSelect(item, known ? (known.airingDay || '') : '', known ? undefined : t('scPickDay'))}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {scheduledCount === 0 && !filter && <p className="adm-empty">{t('scNoScheduled')}</p>}
      {filter && days.every((d) => grouped.map[d].length === 0) && unscheduled.length === 0 && <p className="adm-empty">{t('scNoMatches')} <button type="button" className="adm-btn" onClick={() => setFilter('')}>{t('mangaClearFilters')}</button></p>}

      <div className="adm-schedule-grid">
        {days.map((day) => {
          const list = grouped.map[day];
          return (
            <section key={day} className={`adm-schedule-day${day === TODAY ? ' is-today' : ''}`} aria-labelledby={`sc-${day}`}>
              <header>
                <h3 id={`sc-${day}`}>{dayName(day)}</h3>
                {day === TODAY && <span className="adm-chip is-ok">{t('scToday')}</span>}
                <span className="adm-muted">{num(list.length)}</span>
              </header>
              <ul>
                {list.map((item) => renderRow(item, day))}
                {list.length === 0 && <li className="adm-muted adm-schedule-empty">{t('scheduleEmptyDay')}</li>}
              </ul>
            </section>
          );
        })}
      </div>

      <section className="adm-schedule-unscheduled">
        <h3>{t('scheduleUnscheduled')} <span className="adm-muted">({num(unscheduled.length)})</span></h3>
        {unscheduled.length === 0 && <p className="adm-muted">{t('scNoUnscheduled')}</p>}
        <ul className="adm-schedule-list">
          {unscheduled.slice(0, shown).map((item) => (
            <li key={item.slug} className="adm-schedule-item" aria-busy={busy === item.slug}>
              <Link className="adm-schedule-title" to={`/admin/edit/${encodeURIComponent(item.slug)}`} title={`${item.title} — ${t('scEdit')}`} dir="auto">{item.title}</Link>
              {renderSelect(item, '', t('scPickDay'))}
            </li>
          ))}
        </ul>
        {unscheduled.length > shown && (
          <button type="button" className="adm-btn" onClick={() => setShown((n) => n + UNSCHEDULED_PAGE)}>
            {t('scShowMore', { n: Math.min(UNSCHEDULED_PAGE, unscheduled.length - shown) })}
          </button>
        )}
      </section>
    </div>
  );
}
