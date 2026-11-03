import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSiteLang } from '@/i18n';
import { useUser, userApi } from '@/user.jsx';
import { useCatalog, useMangaCatalog } from '@/catalog-context.jsx';
import { mediaHref } from '@/catalog.js';
import { getShowSensitive } from '@/lib/catalog-rules.js';

const MIN_LENGTH = 10;
const MAX_LENGTH = 300;

function RecHelpful({ rec, signedIn }) {
  const { t } = useSiteLang();
  const [state, setState] = useState({ helpful: rec.helpful, voted: rec.voted, busy: false });
  const canVote = signedIn && !rec.mine;
  const toggle = async () => {
    if (!canVote || state.busy) return;
    setState((cur) => ({ ...cur, busy: true }));
    try {
      const result = await userApi.setRecHelpful(rec.id, !state.voted);
      setState({ helpful: result.helpful, voted: result.voted, busy: false });
    } catch { setState((cur) => ({ ...cur, busy: false })); }
  };
  if (!canVote && !state.helpful) return null;
  return (
    <button type="button" className={`community-helpful${state.voted ? ' is-active' : ''}`} aria-pressed={state.voted} disabled={!canVote || state.busy} onClick={toggle}>
      {t('reviewHelpful')} <strong dir="ltr">{state.helpful}</strong>
    </button>
  );
}

function RecCard({ rec, mediaType, catalog, signedIn }) {
  const { t } = useSiteLang();
  const other = catalog.find((item) => item.slug === rec.other);
  return (
    <li className="rec-card">
      {other ? (
        <Link to={mediaHref(other, mediaType)} className="rec-card__title">
          <img src={other.image} alt="" loading="lazy" decoding="async" />
          <strong dir="auto">{other.title}</strong>
        </Link>
      ) : <span className="rec-card__title"><strong dir="ltr">{rec.other}</strong></span>}
      <div className="rec-card__body">
        <p dir="auto">{rec.body}</p>
        <small>{t('recBy')} <Link to={`/user/${encodeURIComponent(rec.username)}`}>{rec.username}</Link></small>
        <RecHelpful rec={rec} signedIn={signedIn} />
      </div>
    </li>
  );
}

function RecForm({ mediaType, slug, onSaved }) {
  const { t } = useSiteLang();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [picked, setPicked] = useState(null);
  const [body, setBody] = useState('');
  const [state, setState] = useState({ busy: false, error: '' });

  useEffect(() => {
    if (picked || query.trim().length < 2) { setHits([]); return undefined; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query.trim())}${getShowSensitive() ? '' : '&sfw=1'}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => setHits((data.items || []).filter((item) => item.kind === mediaType && item.slug !== slug).slice(0, 5)))
        .catch(() => {});
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, picked, mediaType, slug]);

  const submit = async (event) => {
    event.preventDefault();
    if (!picked) { setState({ busy: false, error: t('recPickFirst') }); return; }
    if (body.trim().length < MIN_LENGTH) { setState({ busy: false, error: t('reviewTooShort', { n: MIN_LENGTH }) }); return; }
    setState({ busy: true, error: '' });
    try {
      await userApi.saveRec(mediaType, slug, picked.slug, body.trim());
      setQuery(''); setPicked(null); setBody(''); setState({ busy: false, error: '' });
      onSaved();
    } catch (err) {
      setState({ busy: false, error: err?.status === 429 ? t('authRateLimit') : err?.status === 409 ? t('recAlready') : t('authGenericError') });
    }
  };

  return (
    <form className="community-form rec-form" onSubmit={submit} noValidate>
      <label htmlFor={`rec-q-${slug}`}>{t('recFormLabel')}</label>
      {picked ? (
        <p className="rec-form__picked">
          <strong dir="auto">{picked.title}</strong>
          <button type="button" className="rec-form__clear" onClick={() => setPicked(null)}>{t('recChange')}</button>
        </p>
      ) : (
        <>
          <input id={`rec-q-${slug}`} type="search" dir="auto" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('recSearchPlaceholder')} />
          {hits.length > 0 && (
            <ul className="rec-form__hits">
              {hits.map((hit) => (
                <li key={hit.slug}><button type="button" onClick={() => { setPicked(hit); setHits([]); }}>{hit.title}{hit.year ? ` (${hit.year})` : ''}</button></li>
              ))}
            </ul>
          )}
        </>
      )}
      <textarea dir="auto" rows={3} maxLength={MAX_LENGTH} value={body} onChange={(event) => setBody(event.target.value)} placeholder={t('recReasonPlaceholder')} aria-label={t('recReasonLabel')} />
      <div className="community-form__row"><small className="community-hint">{t('reviewFinalNote')}</small><small className="community-count" dir="ltr">{body.length}/{MAX_LENGTH}</small></div>
      {state.error && <p className="auth-error" role="alert">{state.error}</p>}
      <div className="community-form__actions"><Button type="submit" size="sm" disabled={state.busy}>{t('recPublish')}</Button></div>
    </form>
  );
}

// "If you liked this, try that": user recommendations for one title (below the reviews).
export default function Recommendations({ mediaType, slug }) {
  const { t } = useSiteLang();
  const user = useUser();
  const anime = useCatalog();
  const manga = useMangaCatalog();
  const catalog = mediaType === 'manga' ? manga : anime;
  const [items, setItems] = useState(null);
  const me = user.me?.username || null;

  const load = useCallback(async () => {
    try { setItems((await userApi.recs(mediaType, slug)).items); } catch { setItems([]); }
  }, [mediaType, slug]);
  useEffect(() => { load(); }, [load, me]);

  if (!items) return null;
  return (
    <section className="rec-section" aria-label={t('recTitle')}>
      <h3 className="community-reviews-head">{t('recTitle')}</h3>
      {items.length === 0 ? <p className="community-hint">{t('recEmpty')}</p> : (
        <ul className="rec-list">{items.map((rec) => <RecCard key={rec.id} rec={rec} mediaType={mediaType} catalog={catalog} signedIn={Boolean(user.me)} />)}</ul>
      )}
      {user.me ? <RecForm mediaType={mediaType} slug={slug} onSaved={load} /> : <p className="community-hint"><Link to="/login">{t('recLogin')}</Link></p>}
    </section>
  );
}
