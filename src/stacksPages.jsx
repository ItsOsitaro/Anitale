import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useSiteLang } from './i18n.js';
import { useUser, userApi } from './user.jsx';
import { useCatalog, useEnsureTitles, useMangaCatalog, withMangaImages } from './catalog-context.jsx';
import { mediaHref } from './catalog.js';
import { coverUrl } from './lib/cover';
import { formatNumber } from './lib/digits.js';

const MAX_ITEMS = 50;

function useTitleMaps() {
  const anime = useCatalog();
  const manga = useMangaCatalog();
  const mangaItems = useMemo(() => withMangaImages(manga, anime), [manga, anime]);
  return useMemo(() => ({
    anime: new Map(anime.map((i) => [i.slug, i])), manga: new Map(mangaItems.map((i) => [i.slug, i])),
    all: [...anime.map((i) => ({ ...i, mediaType: 'anime' })), ...mangaItems.map((i) => ({ ...i, mediaType: 'manga' }))],
  }), [anime, mangaItems]);
}

export function StackCard({ stack }) {
  const { t, lang } = useSiteLang();
  return (
    <Link to={`/stacks/${stack.id}`} className="stack-card">
      <strong dir="auto">{stack.title}</strong>
      {stack.description && <p dir="auto">{stack.description}</p>}
      <small>
        {stack.owner} · {t('stackItems', { n: formatNumber(stack.itemCount, lang) })} · ♥ {formatNumber(stack.likes, lang)}
        {!stack.isPublic && <em>{t('stackPrivate')}</em>}
      </small>
    </Link>
  );
}

function NewStackForm({ onCreated }) {
  const { t } = useSiteLang();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { const r = await userApi.createStack({ title, description, isPublic }); onCreated(r.id); } catch (err) { setError(err.status === 409 ? t('stackLimit') : t('stackSaveError')); } finally { setBusy(false); }
  };
  return (
    <form className="stack-form panel" onSubmit={submit}>
      <label>{t('stackTitleLabel')}<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} required minLength={2} id="stack-title" /></label>
      <label>{t('stackDescLabel')}<textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={3} id="stack-desc" /></label>
      <label className="stack-check"><input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> {t('stackPublicLabel')}</label>
      {error && <p className="extras-muted" role="alert">{error}</p>}
      <button type="submit" className="stack-btn" disabled={busy}>{t('stackCreate')}</button>
    </form>
  );
}

export function StacksBrowse() {
  const { t } = useSiteLang();
  const user = useUser();
  const navigate = useNavigate();
  const [sort, setSort] = useState('popular');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ status: 'loading' });
  const [creating, setCreating] = useState(false);
  useEffect(() => { document.title = `${t('stacksTitle')} · ${t('siteName')}`; }, [t]);
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    userApi.stacks(sort, page).then((d) => { if (alive) setState({ status: 'ready', data: d }); }).catch(() => { if (alive) setState({ status: 'error' }); });
    return () => { alive = false; };
  }, [sort, page]);
  return (
    <main className="stacks-shell">
      <h1>{t('stacksTitle')}</h1>
      <p className="topchars-note">{t('stacksNote')}</p>
      <div className="company-bar">
        <label>{t('dashSortLabel')}{' '}
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
            <option value="popular">{t('stackSortPopular')}</option>
            <option value="new">{t('dashSortRecent')}</option>
          </select>
        </label>
        {user.me ? <button type="button" className="stack-btn" onClick={() => setCreating((v) => !v)}>{t('stackNew')}</button> : <Link to="/login" className="stack-btn">{t('stackLoginToCreate')}</Link>}
      </div>
      {creating && <NewStackForm onCreated={(id) => navigate(`/stacks/${id}`)} />}
      {state.status === 'loading' && <p className="extras-muted" role="status">{t('extrasLoading')}</p>}
      {state.status === 'error' && <p className="extras-muted" role="status">{t('mediaError')}</p>}
      {state.status === 'ready' && state.data.items.length === 0 && <p className="extras-muted">{t('stacksEmpty')}</p>}
      {state.status === 'ready' && (
        <div className="stack-grid">{state.data.items.map((s) => <StackCard key={s.id} stack={s} />)}</div>
      )}
      {state.status === 'ready' && (page > 1 || state.data.hasMore) && (
        <div className="topchars-pager">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('topCharsPrev')}</button>
          <button type="button" disabled={!state.data.hasMore} onClick={() => setPage(page + 1)}>{t('topCharsNext')}</button>
        </div>
      )}
    </main>
  );
}

function Editor({ stack, onChange, onDeleted }) {
  const { t } = useSiteLang();
  const maps = useTitleMaps();
  const [title, setTitle] = useState(stack.title);
  const [description, setDescription] = useState(stack.description);
  const [isPublic, setIsPublic] = useState(stack.isPublic);
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  const save = async (patch) => {
    try { const r = await userApi.updateStack(stack.id, patch); onChange(r); setNote(t('stackSaved')); } catch (err) { setNote(t('stackSaveError')); }
  };
  const key = (i) => `${i.mediaType}:${i.slug}`;
  const has = new Set(stack.items.map(key));
  useEnsureTitles('anime', stack.items.filter((i) => i.mediaType === 'anime').map((i) => i.slug));
  useEnsureTitles('manga', stack.items.filter((i) => i.mediaType === 'manga').map((i) => i.slug));
  // Title search goes to the server: the browser only holds the popular core of the catalog.
  const needle = q.trim();
  const [found, setFound] = useState([]);
  useEffect(() => {
    if (needle.length < 2) { setFound([]); return undefined; }
    let alive = true;
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(needle)}&sfw=1`).then((r) => r.json())
        .then((data) => { if (alive) setFound((data.items || []).map((h) => ({ mediaType: h.kind, slug: h.slug, title: h.title }))); })
        .catch(() => { if (alive) setFound([]); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [needle]);
  const hits = found.filter((i) => !has.has(key(i)));
  const move = (idx, d) => {
    const items = [...stack.items]; const j = idx + d;
    if (j < 0 || j >= items.length) return;
    [items[idx], items[j]] = [items[j], items[idx]];
    save({ items });
  };
  return (
    <section className="stack-editor panel" aria-label={t('stackEdit')}>
      <h2>{t('stackEdit')}</h2>
      <label>{t('stackTitleLabel')}<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} id="stack-edit-title" /></label>
      <label>{t('stackDescLabel')}<textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={3} id="stack-edit-desc" /></label>
      <label className="stack-check"><input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> {t('stackPublicLabel')}</label>
      <button type="button" className="stack-btn" onClick={() => save({ title, description, isPublic })} id="stack-save">{t('stackSave')}</button>
      <label>{t('stackAddTitle')}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('stackSearchPh')} id="stack-search" disabled={stack.items.length >= MAX_ITEMS} />
      </label>
      {stack.items.length >= MAX_ITEMS && <p className="extras-muted">{t('stackFull')}</p>}
      {hits.length > 0 && (
        <ul className="stack-hits">
          {hits.map((i) => (
            <li key={key(i)}><button type="button" onClick={() => { save({ items: [...stack.items, { mediaType: i.mediaType, slug: i.slug }] }); setQ(''); }}>
              <span dir="auto">{i.title}</span> <small>{t(i.mediaType === 'manga' ? 'breadcrumbManga' : 'breadcrumbAnime')}</small>
            </button></li>
          ))}
        </ul>
      )}
      {stack.items.length > 0 && (
        <ol className="stack-order">
          {stack.items.map((i, idx) => {
            const item = maps[i.mediaType].get(i.slug);
            return (
              <li key={key(i)}>
                <span dir="auto">{item?.title || i.slug}</span>
                <span className="stack-order__btns">
                  <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label={t('stackMoveUp')}>↑</button>
                  <button type="button" onClick={() => move(idx, 1)} disabled={idx === stack.items.length - 1} aria-label={t('stackMoveDown')}>↓</button>
                  <button type="button" onClick={() => save({ items: stack.items.filter((x) => key(x) !== key(i)) })} aria-label={t('stackRemove')}>×</button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {note && <p className="extras-muted" role="status">{note}</p>}
      <button type="button" className="stack-btn is-danger" id="stack-delete" onClick={async () => { if (window.confirm(t('stackDeleteConfirm'))) { await userApi.deleteStack(stack.id); onDeleted(); } }}>{t('stackDelete')}</button>
    </section>
  );
}

export function StackView() {
  const { id } = useParams();
  const { t, lang } = useSiteLang();
  const user = useUser();
  const navigate = useNavigate();
  const maps = useTitleMaps();
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    userApi.stack(id).then((d) => { if (alive) setState({ status: 'ready', data: d }); }).catch((e) => { if (alive) setState({ status: e.status === 404 ? 'missing' : 'error' }); });
    return () => { alive = false; };
  }, [id, user.me?.username]);
  const d = state.data;
  useEnsureTitles('anime', (d?.items || []).filter((i) => i.mediaType === 'anime').map((i) => i.slug));
  useEnsureTitles('manga', (d?.items || []).filter((i) => i.mediaType === 'manga').map((i) => i.slug));
  useEffect(() => { if (d) document.title = `${d.title} · ${t('siteName')}`; }, [d, t]);
  if (state.status === 'loading') return <main className="stacks-shell" aria-busy="true"><p className="extras-muted" role="status">{t('extrasLoading')}</p></main>;
  if (state.status !== 'ready') return <main className="stacks-shell"><h1>{t('stackMissing')}</h1><Link to="/stacks">{t('stacksTitle')}</Link></main>;
  const setData = (next) => setState({ status: 'ready', data: { ...state.data, ...next } });
  const like = async () => {
    if (!user.me) { navigate('/login'); return; }
    try { const r = await userApi.likeStack(d.id, !d.liked); setData({ likes: r.likes, liked: r.liked }); } catch { /* ignore */ }
  };
  const shown = d.items.map((i) => ({ ...i, item: maps[i.mediaType].get(i.slug) })).filter((i) => i.item);
  return (
    <main className="stacks-shell">
      <p className="company-kind"><Link to="/stacks">{t('stacksTitle')}</Link> · <Link to={`/user/${encodeURIComponent(d.owner)}`}>{d.owner}</Link>{!d.isPublic && <em className="stack-private"> {t('stackPrivate')}</em>}</p>
      <h1 dir="auto">{d.title}</h1>
      {d.description && <p className="stack-desc" dir="auto">{d.description}</p>}
      <div className="company-bar">
        <span>{t('stackItems', { n: formatNumber(d.itemCount, lang) })}</span>
        {!d.mine && d.isPublic && (
          <button type="button" className={`stack-like${d.liked ? ' is-on' : ''}`} aria-pressed={d.liked} onClick={like} id="stack-like">
            <Heart width={16} height={16} aria-hidden="true" fill={d.liked ? 'currentColor' : 'none'} /> {formatNumber(d.likes, lang)}
          </button>
        )}
        {(d.mine || !d.isPublic) && <span>♥ {formatNumber(d.likes, lang)}</span>}
      </div>
      {shown.length === 0 && <p className="extras-muted">{t('stackEmptyItems')}</p>}
      <ol className="stack-items">
        {shown.map(({ item, mediaType, slug }, idx) => (
          <li key={`${mediaType}:${slug}`}>
            <span className="stack-items__n">{formatNumber(idx + 1, lang)}</span>
            <Link to={mediaHref(item, mediaType)} className="stack-items__cover"><img src={coverUrl(item.image, 160)} alt="" loading="lazy" /></Link>
            <div><Link to={mediaHref(item, mediaType)} dir="auto">{item.title}</Link><small>{t(mediaType === 'manga' ? 'breadcrumbManga' : 'breadcrumbAnime')}{item.year ? ` · ${item.year}` : ''}</small></div>
          </li>
        ))}
      </ol>
      {d.mine && <Editor stack={d} onChange={(r) => setData(r)} onDeleted={() => navigate('/stacks')} />}
    </main>
  );
}

// Profile section: the user's stacks (private ones only show to the owner).
export function ProfileStacks({ username }) {
  const { t } = useSiteLang();
  const user = useUser();
  const [items, setItems] = useState(null);
  useEffect(() => {
    let alive = true;
    userApi.userStacks(username).then((d) => { if (alive) setItems(d.items); }).catch(() => {});
    return () => { alive = false; };
  }, [username, user.me?.username]);
  const isSelf = user.me && user.me.username.toLowerCase() === String(username).toLowerCase();
  if (!items || (!items.length && !isSelf)) return null;
  return (
    <section className="panel profile-stacks" aria-label={t('stacksTitle')}>
      <h2>{t('stacksTitle')}</h2>
      {items.length === 0 && <p className="extras-muted">{t('stackProfileEmpty')}</p>}
      <div className="stack-grid">{items.map((s) => <StackCard key={s.id} stack={s} />)}</div>
      {isSelf && <Link to="/stacks" className="stack-btn">{t('stackNew')}</Link>}
    </section>
  );
}
