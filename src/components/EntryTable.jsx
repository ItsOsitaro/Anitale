import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSiteLang } from '@/i18n';
import { useUser } from '@/user';
import { mediaHref } from '@/catalog';
import { coverUrl } from '@/lib/cover';
import { entryTotal } from '@/components/mobile/entry-utils';

const STATUSES = ['watching', 'completed', 'on_hold', 'dropped', 'planned'];

// One row = one title of the member's list: the things changed every day (status, progress, score) edit in place.
// Notes, tags and dates stay in the card view.
function Row({ entry, item, mediaType }) {
  const { t } = useSiteLang();
  const user = useUser();
  const total = item ? entryTotal(item, mediaType) : null;
  const [progress, setProgress] = useState(entry.progress ?? '');
  useEffect(() => { setProgress(entry.progress ?? ''); }, [entry.progress]);
  const status = entry.status || 'watching';
  const label = (key) => (key === 'watching' && mediaType === 'manga' ? t('status_reading') : t(`status_${key}`));

  const commitProgress = (raw) => {
    const value = raw === '' ? null : Math.max(0, Math.floor(Number(raw)));
    if (raw !== '' && !Number.isFinite(Number(raw))) { setProgress(entry.progress ?? ''); return; }
    if (value === (entry.progress ?? null)) return;
    user.setProgress(mediaType, entry.slug, total && value != null ? Math.min(value, total) : value);
  };
  const step = (delta) => commitProgress(String(Math.max(0, (Number(progress) || 0) + delta)));
  const done = status === 'completed' && !entry.progress; // finished titles often carry no counter
  const pct = total ? (done ? 100 : Math.min(100, Math.round(((entry.progress || 0) / total) * 100))) : 0;

  return (
    <li className="entry-row">
      <Link className="entry-row__cover" to={item ? mediaHref(item, mediaType) : '#'} tabIndex={-1} aria-hidden="true">
        {item?.image ? <img src={coverUrl(item.image, 120)} alt="" loading="lazy" decoding="async" /> : <span>{(entry.slug || '?').slice(0, 2)}</span>}
      </Link>
      <div className="entry-row__title">
        {item ? <Link to={mediaHref(item, mediaType)} dir="auto">{item.title}</Link> : <span>{entry.slug}</span>}
        {total ? <span className="entry-row__bar" role="img" aria-label={`${entry.progress || 0} / ${total}`}><i style={{ width: `${pct}%` }} /></span> : null}
      </div>
      <select className="entry-row__status" value={status} aria-label={t('dashFilterLabel')} onChange={(event) => user.setStatus(mediaType, entry.slug, event.target.value)}>
        {STATUSES.map((key) => <option key={key} value={key}>{label(key)}</option>)}
      </select>
      <div className="entry-row__progress">
        <button type="button" onClick={() => step(-1)} aria-label="−" disabled={!entry.progress}>−</button>
        <input
          type="number" min="0" max={total || undefined} dir="ltr" value={progress} placeholder={done && total ? String(total) : '0'}
          aria-label={t(mediaType === 'manga' ? 'chaptersUnit' : 'episodesUnit')}
          onChange={(event) => setProgress(event.target.value)}
          onBlur={() => commitProgress(String(progress))}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        />
        <span className="entry-row__total" dir="ltr">/ {total || '?'}</span>
        <button type="button" onClick={() => step(1)} aria-label="+" disabled={Boolean(total) && (entry.progress || 0) >= total}>+</button>
      </div>
      <select className="entry-row__rating" value={entry.rating ?? ''} aria-label={t('ratingAria')} onChange={(event) => user.setRating(mediaType, entry.slug, event.target.value === '' ? null : Number(event.target.value))}>
        <option value="">—</option>
        {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <button type="button" className="entry-row__remove" onClick={() => user.toggle(mediaType, entry.slug)} aria-label={t('removeFromList')}>×</button>
    </li>
  );
}

export default function EntryTable({ entries, resolve, mediaType }) {
  const { t } = useSiteLang();
  return (
    <div className="entry-table">
      <div className="entry-table__head" aria-hidden="true">
        <span />
        <span>{t('tblTitle')}</span>
        <span>{t('tblStatus')}</span>
        <span>{t(mediaType === 'manga' ? 'chaptersUnit' : 'episodesUnit')}</span>
        <span>{t('ratingLabel')}</span>
        <span />
      </div>
      <ul>{entries.map((entry) => <Row key={entry.slug} entry={entry} item={resolve(entry)} mediaType={mediaType} />)}</ul>
    </div>
  );
}
