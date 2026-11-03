import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Minus, Plus, Trash2, X } from 'lucide-react';
import { mediaHref } from '@/catalog';
import { displayTitle } from '@/home-data';
import { useSiteLang } from '@/i18n';
import { useSheet } from '@/hooks/use-sheet';
import { entryTotal } from './entry-utils';
import { cn } from 'cn';

const STATUSES = ['watching', 'completed', 'on_hold', 'dropped', 'planned'];

// Bottom sheet that edits one list entry: status, personal rating, progress, note.
export default function EntrySheet({ open, onClose, entry, item, mediaType, user }) {
  const { t, lang } = useSiteLang();
  const ref = useRef(null);
  const [note, setNote] = useState('');
  useSheet(open, onClose, ref);

  useEffect(() => { setNote(entry?.note || ''); }, [entry?.slug, entry?.note]);

  if (!open || !entry) return null;

  const total = entryTotal(item, mediaType);
  const progress = entry.progress ?? 0;
  const setProgress = (value) => {
    let next = Math.max(0, Math.floor(Number(value) || 0));
    if (total) next = Math.min(total, next);
    if (next !== (entry.progress ?? 0)) user.setProgress(mediaType, entry.slug, next);
  };
  const commitNote = () => {
    if (note !== (entry.note || '')) user.setNote(mediaType, entry.slug, note);
  };
  const close = () => { commitNote(); onClose(); };
  const title = item ? displayTitle(item, lang) : entry.slug;
  const statusLabel = (id) => (id === 'watching' && mediaType === 'manga' ? t('status_reading') : t(`status_${id}`));

  return createPortal(
    <div className="filter-sheet__scrim" onClick={close} role="presentation">
      <div
        ref={ref}
        className="filter-sheet entry-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('dbEditEntry')}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="filter-sheet__grab"><div className="more-sheet__handle" aria-hidden="true" /></div>
        <div className="filter-sheet__head entry-sheet__head">
          {item?.image && <img className="entry-sheet__cover" src={item.image} alt="" width="40" height="56" />}
          <div className="entry-sheet__title">
            <h2 dir="auto">{title}</h2>
            {item && <Link to={mediaHref(item, mediaType)} onClick={onClose}>{t('dbOpenTitle')}</Link>}
          </div>
          <button type="button" className="filter-sheet__close" onClick={close} aria-label={t('mcClose')}>
            <X width={20} height={20} aria-hidden="true" />
          </button>
        </div>

        <div className="filter-sheet__body">
          <section className="filter-sheet__group">
            <h3 className="filter-sheet__label">{t('listStatusAria')}</h3>
            <div className="filter-sheet__chips" role="radiogroup" aria-label={t('listStatusAria')}>
              {STATUSES.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={(entry.status || 'watching') === id}
                  className={cn('mobile-chip', (entry.status || 'watching') === id && 'is-active')}
                  onClick={() => user.setStatus(mediaType, entry.slug, id)}
                >
                  {statusLabel(id)}
                </button>
              ))}
            </div>
          </section>

          <section className="filter-sheet__group">
            <h3 className="filter-sheet__label">{t('progressLabel')}</h3>
            <div className="entry-stepper" dir="ltr">
              <button type="button" onClick={() => setProgress(progress - 1)} disabled={progress <= 0} aria-label="−1">
                <Minus width={18} height={18} aria-hidden="true" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={entry.progress ?? ''}
                placeholder="0"
                aria-label={t('progressLabel')}
                onChange={(e) => setProgress(e.target.value)}
              />
              {total && <span className="entry-stepper__total">/ {total}</span>}
              <button type="button" onClick={() => setProgress(progress + 1)} disabled={Boolean(total) && progress >= total} aria-label="+1">
                <Plus width={18} height={18} aria-hidden="true" />
              </button>
            </div>
          </section>

          <section className="filter-sheet__group">
            <h3 className="filter-sheet__label">{t('ratingLabel')}</h3>
            <div className="entry-rating-grid" role="radiogroup" aria-label={t('ratingAria')}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={entry.rating === n}
                  className={cn('mobile-chip', entry.rating === n && 'is-active')}
                  onClick={() => user.setRating(mediaType, entry.slug, entry.rating === n ? null : n)}
                >
                  <span dir="ltr">{n}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="filter-sheet__group">
            <label className="filter-sheet__label" htmlFor="entry-note">{t('noteAria')}</label>
            <textarea
              id="entry-note"
              className="entry-sheet__note"
              rows={3}
              dir="auto"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={commitNote}
              placeholder={t('notePlaceholder')}
            />
          </section>
        </div>

        <div className="filter-sheet__footer">
          <button
            type="button"
            className="filter-sheet__clear entry-sheet__remove"
            onClick={() => { onClose(); user.toggle(mediaType, entry.slug); }}
          >
            <Trash2 width={17} height={17} aria-hidden="true" />
            <span>{t('removeFromList')}</span>
          </button>
          <button type="button" className="filter-sheet__apply" onClick={close}>{t('dbDone')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
