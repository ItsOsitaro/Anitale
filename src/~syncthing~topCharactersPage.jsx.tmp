import { useEffect, useState } from 'react';
import { Link, NavLink, useSearchParams } from 'react-router-dom';
import { useSiteLang } from './i18n.js';
import { useIsMobile } from './hooks/use-is-mobile.js';
import { formatNumber } from './lib/digits.js';

const cache = new Map();

function useTopPage(page) {
  const [state, setState] = useState(() => cache.get(page) || { status: 'loading' });
  useEffect(() => {
    if (cache.has(page)) { setState(cache.get(page)); return undefined; }
    let alive = true;
    setState({ status: 'loading' });
    fetch(`/api/top/characters?page=${page}`)
      .then((r) => (r.ok ? r.json() : { ok: false }))
      .then((body) => {
        const next = body?.ok ? { status: 'ready', data: body } : { status: 'error' };
        if (next.status === 'ready' && !body.stale) cache.set(page, next);
        if (alive) setState(next);
      })
      .catch(() => { if (alive) setState({ status: 'error' }); });
    return () => { alive = false; };
  }, [page]);
  return state;
}

export default function TopCharactersPage() {
  const { t, lang } = useSiteLang();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const page = Math.min(2, Math.max(1, Number(params.get('page')) || 1));
  const state = useTopPage(page);
  useEffect(() => { document.title = `${t('topCharsTitle')} · ${t('siteName')}`; }, [t]);
  const go = (p) => { setParams(p > 1 ? { page: String(p) } : {}); window.scrollTo({ top: 0 }); };

  return (
    <main className="topchars-shell">
      <h1>{t('topCharsTitle')}</h1>
      <nav className="topchars-tabs" aria-label={t('mcRankingsAria')}>
        <NavLink to="/top/anime">{t('breadcrumbAnime')}</NavLink>
        <NavLink to="/top/manga">{t('breadcrumbManga')}</NavLink>
        <NavLink to="/top/characters" className="is-active">{t('topCharsTab')}</NavLink>
      </nav>
      <p className="topchars-note">{t('topCharsNote')}</p>
      {state.status === 'loading' && <p className="extras-muted" role="status">{t('extrasLoading')}</p>}
      {state.status === 'error' && <p className="extras-muted" role="status">{t('topCharsError')}</p>}
      {state.status === 'ready' && (
        <ol className="topchars-list" start={(page - 1) * 25 + 1} data-mobile={isMobile ? '1' : undefined}>
          {state.data.items.map((c) => (
            <li key={c.id} className="topchars-row">
              <span className="topchars-rank">{formatNumber(c.rank, lang)}</span>
              <Link to={`/character/${c.id}`} className="topchars-link">
                <span className="topchars-photo">{c.image ? <img src={c.image} alt="" loading="lazy" decoding="async" /> : null}</span>
                <span className="topchars-name">
                  <strong>{c.name}</strong>
                  {c.nameKanji && <small>{c.nameKanji}</small>}
                </span>
              </Link>
              <span className="topchars-fans">{formatNumber(c.favorites, lang)} <small>{t('topCharsFans')}</small></span>
            </li>
          ))}
        </ol>
      )}
      <div className="topchars-pager">
        <button type="button" disabled={page <= 1} onClick={() => go(page - 1)}>{t('topCharsPrev')}</button>
        <span>{t('topCharsPage')} {formatNumber(page, lang)} / {formatNumber(2, lang)}</span>
        <button type="button" disabled={page >= 2} onClick={() => go(page + 1)}>{t('topCharsNext')}</button>
      </div>
    </main>
  );
}
