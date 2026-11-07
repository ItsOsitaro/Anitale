import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSiteLang } from '@/i18n';
import { useCatalog, useMangaCatalog } from '../catalog-context.jsx';
import { mediaHref } from '../catalog.js';

// Extra detail for a title (characters, relations, recommendations, trailer, themes) from
// /api/extras. The server fetches it from Tenrai once and keeps it; we only render what exists.
const cache = new Map();

export function useTitleExtras(mediaType, malId) {
  const [state, setState] = useState(() => (malId && cache.get(`${mediaType}:${malId}`)) || { status: malId ? 'loading' : 'none' });
  useEffect(() => {
    if (!malId) { setState({ status: 'none' }); return undefined; }
    const key = `${mediaType}:${malId}`;
    if (cache.has(key)) { setState(cache.get(key)); return undefined; }
    let alive = true;
    setState({ status: 'loading' });
    fetch(`/api/extras/${mediaType}/${malId}`)
      .then((response) => (response.ok ? response.json() : { ok: false }))
      .then((body) => {
        const next = body?.ok ? { status: 'ready', data: body } : { status: 'none' };
        if (next.status === 'ready') cache.set(key, next);
        if (alive) setState(next);
      })
      .catch(() => { if (alive) setState({ status: 'none' }); });
    return () => { alive = false; };
  }, [mediaType, malId]);
  return state;
}

const RELATION_FA = {
  Sequel: 'دنباله', Prequel: 'پیش‌درآمد', Adaptation: 'اقتباس', 'Side story': 'داستان فرعی', 'Parent story': 'داستان اصلی',
  'Alternative version': 'نسخهٔ جایگزین', 'Alternative setting': 'جهان جایگزین', 'Spin-off': 'اسپین‌آف', Summary: 'خلاصه',
  'Full story': 'داستان کامل', Character: 'شخصیت‌های مشترک', Other: 'سایر',
};

const POSITION_FA = {
  Director: 'کارگردان', 'Series Composition': 'طراح داستان سریال', 'Original Creator': 'خالق اثر اصلی', 'Character Design': 'طراح شخصیت',
  Music: 'آهنگساز', Script: 'فیلم‌نامه', 'Art Director': 'مدیر هنری', 'Sound Director': 'کارگردان صدا', 'Chief Animation Director': 'سرپرست انیمیشن',
};
const positionLabel = (position, lang) => {
  if (lang !== 'fa') return position;
  const key = Object.keys(POSITION_FA).find((k) => position.toLowerCase().startsWith(k.toLowerCase()));
  return key ? POSITION_FA[key] : position;
};

export function Staff({ data }) {
  const { lang } = useSiteLang();
  if (!data.staff?.length) return null;
  return (
    <ul className="extras-staff">
      {data.staff.map((person) => (
        <li key={person.id}>
          <Link className="extras-name" to={`/person/${person.id}`} dir="auto">{person.name}</Link>
          <span>{person.positions.map((position) => positionLabel(position, lang)).join(lang === 'fa' ? '، ' : ', ')}</span>
        </li>
      ))}
    </ul>
  );
}

function Poster({ src, alt = '' }) {
  return src ? <img src={src} alt={alt} loading="lazy" decoding="async" /> : <span className="extras-noimg" aria-hidden="true" />;
}

export function ExtrasSkeleton() {
  const { t } = useSiteLang();
  return <p className="extras-muted" role="status">{t('extrasLoading')}</p>;
}

export function Characters({ data }) {
  const { t } = useSiteLang();
  if (!data.characters?.length) return null;
  return (
    <ul className="extras-chars">
      {data.characters.map((c) => (
        <li key={c.id}>
          <Poster src={c.image} />
          <span className="extras-char-text">
            <Link className="extras-name" to={`/character/${c.id}`} dir="auto">{c.name}</Link>
            <em>{c.role === 'main' ? t('roleMain') : t('roleSupporting')}</em>
            {c.voice && (c.voice.id ? <Link className="extras-sub" to={`/person/${c.voice.id}`} dir="auto">{c.voice.name}</Link> : <small dir="auto">{c.voice.name}</small>)}
          </span>
          {c.voice?.image && <Poster src={c.voice.image} />}
        </li>
      ))}
    </ul>
  );
}

function TitleLink({ type, id, name, image }) {
  const anime = useCatalog();
  const manga = useMangaCatalog();
  const local = (type === 'manga' ? manga : anime).find((entry) => entry.malId === id);
  const body = (
    <>
      {image !== undefined && <Poster src={image} />}
      <span dir="auto">{name}</span>
    </>
  );
  return local
    ? <Link className="extras-title-link" to={mediaHref(local, type)}>{body}</Link>
    : <span className="extras-title-link is-plain">{body}</span>;
}

export function Relations({ data }) {
  const { lang } = useSiteLang();
  if (!data.relations?.length) return null;
  return (
    <dl className="extras-relations">
      {data.relations.map((group) => (
        <div key={group.relation}>
          <dt>{lang === 'fa' ? (RELATION_FA[group.relation] || group.relation) : group.relation}</dt>
          <dd>{group.entries.map((e) => <TitleLink key={`${e.type}${e.id}`} type={e.type} id={e.id} name={e.name} />)}</dd>
        </div>
      ))}
    </dl>
  );
}

// One-line "previous / next" pointer for a series, from the relations data.
export function FranchiseNav({ data, mediaType }) {
  const { t } = useSiteLang();
  const pick = (name) => (data?.relations || []).find((group) => group.relation === name)?.entries?.find((e) => e.type === mediaType);
  const prev = pick('Prequel');
  const next = pick('Sequel');
  if (!prev && !next) return null;
  return (
    <p className="franchise-nav">
      {prev && <span><b>{t('franchisePrev')}</b> <TitleLink type={prev.type} id={prev.id} name={prev.name} /></span>}
      {next && <span><b>{t('franchiseNext')}</b> <TitleLink type={next.type} id={next.id} name={next.name} /></span>}
    </p>
  );
}

export function Recommendations({ data, mediaType }) {
  if (!data.recommendations?.length) return null;
  return (
    <ul className="extras-recs">
      {data.recommendations.map((r) => (
        <li key={r.id}><TitleLink type={mediaType} id={r.id} name={r.title} image={r.image} /></li>
      ))}
    </ul>
  );
}

// The YouTube player only loads after a click, so the page stays light (and works when YouTube is slow/blocked).
export function Trailer({ data }) {
  const { t } = useSiteLang();
  const [play, setPlay] = useState(false);
  if (!data.trailer?.youtubeId) return null;
  const id = data.trailer.youtubeId;
  return (
    <div className="extras-trailer">
      {play ? (
        <iframe
          title={data.trailer.title || t('trailerTitle')}
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button type="button" onClick={() => setPlay(true)} aria-label={t('playTrailer')}>
          <span className="extras-play" aria-hidden="true">▶</span>
          <span>{t('playTrailer')}</span>
        </button>
      )}
    </div>
  );
}

export function Themes({ data, kind }) {
  const list = kind === 'op' ? data.openings : data.endings;
  if (!list?.length) return null;
  return <ul className="extras-themes">{list.map((line) => <li key={line} dir="ltr">{line}</li>)}</ul>;
}

export const hasAny = (state, key) => state.status === 'ready' && (Array.isArray(state.data[key]) ? state.data[key].length > 0 : Boolean(state.data[key]));
