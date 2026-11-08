import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSiteLang } from '@/i18n';
import { useUser } from '@/user';
import { mediaHref } from '@/catalog';
import { displayTitle } from '@/home-data';
import { coverUrl } from '@/lib/cover';
import { genreLabel } from '@/lib/genre-kinds';
import { useShowSensitive } from '@/lib/catalog-rules';
import { formatNumber, formatScore } from '@/lib/digits.js';
import { landingGenres } from '@/lib/landing';

// "What should I watch today?": a few filters, one suggestion, "another one". Candidates come from the server search
// (a random page of the best matches), minus what the member already has.
const LENGTHS = { any: {}, short: { maxEps: 13 }, mid: { minEps: 14, maxEps: 26 }, long: { minEps: 27 } };
const SCORES = [0, 7, 8];

export default function PickPage() {
  const { t, lang } = useSiteLang();
  const user = useUser();
  const showSensitive = useShowSensitive();
  const [filters, setFilters] = useState({ length: 'any', min: 7, genre: '', finished: true });
  const [pick, setPick] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | none | failed
  const seen = useRef(new Set());
  const mine = useMemo(() => new Set(user.me ? user.entries.anime.map((entry) => entry.slug) : []), [user.me, user.entries.anime]);

  useEffect(() => { document.title = `${t('pickTitle')} · ${t('siteName')}`; }, [t]);
  useEffect(() => { seen.current = new Set(); }, [filters]);

  const query = (page) => {
    const params = new URLSearchParams({ type: 'anime', sort: 'pop', page: String(page) });
    if (filters.min) params.set('min', String(filters.min));
    if (filters.genre) params.set('genre', filters.genre);
    if (filters.finished) params.set('status', 'finished');
    for (const [key, value] of Object.entries(LENGTHS[filters.length])) params.set(key, String(value));
    if (!showSensitive) params.set('sfw', '1');
    return `/api/search/full?${params}`;
  };

  const roll = async () => {
    setStatus('loading');
    try {
      const first = await fetch(query(1)).then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))));
      if (!first.total) { setPick(null); setStatus('none'); return; }
      // The first pages hold the best-known matches; a random one among them keeps suggestions interesting but good.
      const page = 1 + Math.floor(Math.random() * Math.min(first.pages, 5));
      const data = page === 1 ? first : await fetch(query(page)).then((res) => res.json());
      let pool = data.items.filter((item) => !mine.has(item.slug) && !seen.current.has(item.slug));
      if (!pool.length) pool = first.items.filter((item) => !mine.has(item.slug) && !seen.current.has(item.slug));
      if (!pool.length) { seen.current = new Set(); pool = first.items.filter((item) => !mine.has(item.slug)); }
      if (!pool.length) { setPick(null); setStatus('none'); return; }
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      seen.current.add(chosen.slug);
      const full = await fetch(`/api/title/anime/${encodeURIComponent(chosen.slug)}`).then((res) => (res.ok ? res.json() : null)).catch(() => null);
      const info = (full?.information || []).find((row) => row.label === 'Episodes')?.value;
      const synopsis = typeof full?.synopsis === 'string' ? full.synopsis : (lang === 'fa' ? full?.synopsis?.fa || full?.synopsis?.en : full?.synopsis?.en || full?.synopsis?.fa) || '';
      setPick({ ...chosen, synopsis, episodes: info });
      setStatus('idle');
    } catch { setStatus('failed'); }
  };

  const set = (patch) => setFilters((current) => ({ ...current, ...patch }));
  return (
    <main className="pick">
      <h1>{t('pickTitle')}</h1>
      <p className="pick__lead">{t('pickLead')}</p>
      <div className="pick__filters">
        <label><span>{t('pickLength')}</span>
          <select value={filters.length} onChange={(e) => set({ length: e.target.value })}>
            {Object.keys(LENGTHS).map((key) => <option key={key} value={key}>{t(`pickLen_${key}`)}</option>)}
          </select></label>
        <label><span>{t('pickScore')}</span>
          <select value={filters.min} onChange={(e) => set({ min: Number(e.target.value) })}>
            {SCORES.map((n) => <option key={n} value={n}>{n ? t('pickScoreMin', { n: formatNumber(n, lang) }) : t('pickAny')}</option>)}
          </select></label>
        <label><span>{t('pickGenre')}</span>
          <select value={filters.genre} onChange={(e) => set({ genre: e.target.value })}>
            <option value="">{t('pickAny')}</option>
            {landingGenres().map((key) => <option key={key} value={key}>{genreLabel(key, lang)}</option>)}
          </select></label>
        <label className="pick__check"><input type="checkbox" checked={filters.finished} onChange={(e) => set({ finished: e.target.checked })} /><span>{t('pickFinished')}</span></label>
      </div>
      <Button type="button" className="pick__go" onClick={roll} disabled={status === 'loading'}>{pick ? t('pickAnother') : t('pickGo')}</Button>

      {status === 'none' && <p className="pick__note" role="status">{t('pickNone')}</p>}
      {status === 'failed' && <p className="pick__note" role="alert">{t('authGenericError')}</p>}
      {pick && (
        <article className="pick__card" aria-live="polite">
          <Link to={mediaHref(pick, 'anime')} className="pick__cover"><img src={coverUrl(pick.image, 480)} alt="" /></Link>
          <div className="pick__body">
            <h2 dir="auto"><Link to={mediaHref(pick, 'anime')}>{displayTitle(pick, lang)}</Link></h2>
            <p className="pick__meta">
              {pick.score ? <span className="pick__score" dir="ltr">★ {formatScore(pick.score, lang)}</span> : null}
              {pick.year ? <span dir="ltr">{formatNumber(pick.year, lang, { useGrouping: false })}</span> : null}
              {pick.episodes && pick.episodes !== 'Unknown' ? <span>{t('pickEps', { n: formatNumber(Number(String(pick.episodes).replace(/[^0-9]/g, '')) || 0, lang) })}</span> : null}
              {pick.genres.map((genre) => <span key={genre}>{genreLabel(genre, lang)}</span>)}
            </p>
            {pick.synopsis && <p className="pick__synopsis" dir="auto">{pick.synopsis}</p>}
            <Link className="pick__open" to={mediaHref(pick, 'anime')}>{t('pickOpen')}</Link>
          </div>
        </article>
      )}
    </main>
  );
}
