import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useSiteLang } from '@/i18n';
import { cn } from 'cn';

const FOCUSABLE = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export default function FilterSheet({
  open, onClose, resultCount,
  genre, onGenreChange, genres,
  format, onFormatChange, formats,
  year, onYearChange, years,
  sort, onSortChange, onClear, activeCount,
}) {
  const { t } = useSiteLang();
  const dialogRef = useRef(null);
  const dragRef = useRef(null);

  // Escape, focus trap, focus return, body scroll lock.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const nodes = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prev?.focus?.();
    };
  }, [open, onClose]);

  // Swipe down on the handle area to dismiss.
  const onPointerDown = (e) => {
    dragRef.current = { startY: e.clientY, dy: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag || !dialogRef.current) return;
    drag.dy = Math.max(0, e.clientY - drag.startY);
    dialogRef.current.style.transform = `translateY(${drag.dy}px)`;
    dialogRef.current.style.transition = 'none';
  };
  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || !dialogRef.current) return;
    dialogRef.current.style.transition = '';
    dialogRef.current.style.transform = '';
    if (drag.dy > 90) onClose();
  };

  if (!open) return null;

  const sorts = [
    ['score', 'sortScore'],
    ['new', 'sortNew'],
    ['old', 'sortOld'],
    ['az', 'sortAz'],
  ];

  const chip = (active, onClick, label, key) => (
    <button
      key={key}
      type="button"
      className={cn('mobile-chip', active && 'is-active')}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return createPortal(
    <div className="filter-sheet__scrim" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('mcFilters')}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="filter-sheet__grab"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="more-sheet__handle" aria-hidden="true" />
        </div>
        <div className="filter-sheet__head">
          <h2 className="filter-sheet__title">{t('mcFilters')}</h2>
          <button type="button" className="filter-sheet__close" onClick={onClose} aria-label={t('mcClose')}>
            <X width={20} height={20} aria-hidden="true" />
          </button>
        </div>

        <div className="filter-sheet__body">
          <section className="filter-sheet__group">
            <h3 className="filter-sheet__label">{t('genreLabel')}</h3>
            <div className="filter-sheet__chips">
              {chip(genre === 'All', () => onGenreChange('All'), t('mcAll'), 'All')}
              {genres.map((g) => chip(genre === g, () => onGenreChange(g), g, g))}
            </div>
          </section>

          {formats.length > 1 && (
            <section className="filter-sheet__group">
              <h3 className="filter-sheet__label">{t('formatLabel')}</h3>
              <div className="filter-sheet__chips">
                {chip(format === 'All', () => onFormatChange('All'), t('mcAll'), 'All')}
                {formats.map((f) => chip(format === f, () => onFormatChange(f), f, f))}
              </div>
            </section>
          )}

          {years.length > 1 && (
            <section className="filter-sheet__group">
              <label className="filter-sheet__label" htmlFor="filter-sheet-year">{t('yearLabel')}</label>
              <select
                id="filter-sheet-year"
                className="filter-sheet__select"
                value={year}
                onChange={(e) => onYearChange(e.target.value)}
              >
                <option value="All">{t('allYears')}</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </section>
          )}

          <section className="filter-sheet__group">
            <h3 className="filter-sheet__label">{t('sortLabel')}</h3>
            <div className="filter-sheet__chips">
              {sorts.map(([value, key]) => chip(sort === value, () => onSortChange(value), t(key), value))}
            </div>
          </section>
        </div>

        <div className="filter-sheet__footer">
          <button
            type="button"
            className="filter-sheet__clear"
            onClick={onClear}
            disabled={activeCount === 0}
          >
            {t('mcClearAll')}
          </button>
          <button type="button" className="filter-sheet__apply" onClick={onClose}>
            {t('mcShowResults', { n: resultCount })}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
