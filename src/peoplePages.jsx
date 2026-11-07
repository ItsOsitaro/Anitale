import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSiteLang } from './i18n.js';
import { useCatalog, useEnsureTitles, useMangaCatalog } from './catalog-context.jsx';
import { mediaHref } from './catalog.js';
import { FavoriteButton } from './components/Favorites.jsx';

const cache = new Map();

function usePerson(kind, id) {
  const key = `${kind}:${id}`;
  const [state, setState] = useState(() => cache.get(key) || { status: 'loading' });
  useEffect(() => {
    if (cache.has(key)) { setState(cache.get(key)); return undefined; }
    let alive = true;
    setState({ status: 'loading' });
    fetch(`/api/people/${kind}/${id}`)
      .then((r) => (r.ok ? r.json() : { ok: false }))
      .then((body) => {
        const next = body?.ok ? { status: 'ready', data: body } : { status: body?.notFound ? 'missing' : 'error' };
        if (next.status === 'ready') cache.set(key, next);
        if (alive) setState(next);
      })
      .catch(() => { if (alive) setState({ status: 'error' }); });
    return () => { alive = false; };
  }, [key, kind, id]);
  return state;
}

function Cover({ src, alt }) {
  return src ? <img src={src} alt={alt} loading="lazy" decoding="async" /> : <span className="people-noimg" aria-hidden="true" />;
}

// Title chip: links into the site when the title is in the catalog, plain text otherwise.
function MediaChip({ entry, note }) {
  const anime = useCatalog();
  const manga = useMangaCatalog();
  useEnsureTitles(entry.type === 'manga' ? 'manga' : 'anime', [], [entry.id]);
  const local = (entry.type === 'manga' ? manga : anime).find((item) => item.malId === entry.id);
  const body = (
    <>
      <Cover src={entry.image} alt="" />
      <span><strong dir="auto">{entry.title}</strong>{note && <small dir="auto">{note}</small>}</span>
    </>
  );
  return local
    ? <Link className="people-chip" to={mediaHref(local, entry.type)}>{body}</Link>
    : <span className="people-chip is-plain">{body}</span>;
}

function Section({ title, children }) {
  return <section className="people-section"><h2>{title}</h2>{children}</section>;
}

function PersonCard({ id, name, image, note }) {
  return (
    <Link className="people-chip" to={`/person/${id}`}>
      <Cover src={image} alt="" />
      <span><strong dir="auto">{name}</strong>{note && <small dir="auto">{note}</small>}</span>
    </Link>
  );
}

// Keyed by kind + id so moving from a character to a voice actor starts from a clean state.
export default function PeoplePage({ kind }) {
  const { id } = useParams();
  return <PeopleView key={`${kind}:${id}`} kind={kind} id={id} />;
}

function PeopleView({ kind, id }) {
  const { t, lang } = useSiteLang();
  const navigate = useNavigate();
  const state = usePerson(kind, Number(id));
  const d = state.data;
  useEffect(() => { document.title = `${d?.name || t(kind === 'character' ? 'characterWord' : 'personWord')} · ${t('siteName')}`; }, [d, kind, t]);

  if (state.status === 'loading') return <main className="people-shell" aria-busy="true"><p className="extras-muted" role="status">{t('extrasLoading')}</p></main>;
  if (state.status !== 'ready') {
    return (
      <main className="people-shell">
        <h1>{state.status === 'missing' ? t('peopleMissing') : t('peopleError')}</h1>
        <button type="button" className="people-back" onClick={() => navigate(-1)}>{t('peopleBack')}</button>
      </main>
    );
  }
  const about = d.about?.replace(/\(Source:[^)]*\)/gi, '').trim();
  const other = kind === 'character' ? [d.nameKanji, ...(d.nicknames || [])] : [d.givenName && d.familyName ? `${d.givenName} ${d.familyName}` : '', ...(d.alternateNames || [])];
  const otherNames = [...new Set(other.filter(Boolean))];
  return (
    <main className="people-shell">
      <button type="button" className="people-back" onClick={() => navigate(-1)}>{t('peopleBack')}</button>
      <header className="people-head">
        <div className="people-photo"><Cover src={d.image} alt={d.name} /></div>
        <div>
          <h1 dir="auto">{d.name}</h1>
          {otherNames.length > 0 && <p className="people-alt" dir="auto">{otherNames.join(lang === 'fa' ? '، ' : ', ')}</p>}
          <FavoriteButton kind={kind} refId={d.id} />
          <dl className="people-facts">
            {d.birthday && <div><dt>{t('peopleBirthday')}</dt><dd dir="ltr">{d.birthday}</dd></div>}
            {d.favorites > 0 && <div><dt>{t('favoritesLabel')}</dt><dd dir="ltr">{d.favorites.toLocaleString('en-US')}</dd></div>}
          </dl>
        </div>
      </header>
      {about && <Section title={t('peopleAbout')}><p className="people-about" dir="auto">{about}</p><p className="extras-muted">{t('peopleAboutNote')}</p></Section>}

      {kind === 'character' && (
        <>
          {d.voices?.length > 0 && <Section title={t('peopleVoices')}><div className="people-grid">{d.voices.map((v) => <PersonCard key={`${v.id}${v.language}`} id={v.id} name={v.name} image={v.image} note={v.language} />)}</div></Section>}
          {d.anime?.length > 0 && <Section title={t('peopleAnime')}><div className="people-grid">{d.anime.map((a) => <MediaChip key={a.id} entry={a} note={a.role} />)}</div></Section>}
          {d.manga?.length > 0 && <Section title={t('peopleManga')}><div className="people-grid">{d.manga.map((m) => <MediaChip key={m.id} entry={m} note={m.role} />)}</div></Section>}
        </>
      )}
      {kind === 'person' && (
        <>
          {d.voices?.length > 0 && (
            <Section title={t('peopleVoiceRoles')}>
              <div className="people-grid">
                {d.voices.map((v) => (
                  <MediaChip key={`${v.anime.id}-${v.character?.id ?? 'x'}`} entry={v.anime} note={[v.character?.name, v.role].filter(Boolean).join(' · ')} />
                ))}
              </div>
            </Section>
          )}
          {d.anime?.length > 0 && <Section title={t('peopleStaffWork')}><div className="people-grid">{d.anime.map((a) => <MediaChip key={`${a.id}${a.position}`} entry={a} note={a.position} />)}</div></Section>}
          {d.manga?.length > 0 && <Section title={t('peopleManga')}><div className="people-grid">{d.manga.map((m) => <MediaChip key={`${m.id}${m.position}`} entry={m} note={m.position} />)}</div></Section>}
        </>
      )}
    </main>
  );
}
