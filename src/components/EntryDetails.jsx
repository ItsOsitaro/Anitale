import { useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';

const PRIORITIES = ['low', 'medium', 'high'];
export const MAX_TAGS = 10;

// Cleans one tag the same way the server does (no commas, collapsed spaces, 24 chars).
export const cleanTag = (raw) => String(raw || '').replace(/[,\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);

// List details for one entry (A3): start / finish date, rewatch count, priority
// (planned titles only) and free-form tags. Used by the desktop entry card and
// the mobile entry sheet; `onChange(patch)` receives only the keys that changed.
export default function EntryDetails({ entry, mediaType, onChange, t }) {
  const [tagDraft, setTagDraft] = useState('');
  const tags = entry.tags || [];
  const rewatch = entry.rewatch || 0;
  const status = entry.status || 'watching';
  const orderWrong = entry.startDate && entry.finishDate && entry.finishDate < entry.startDate;

  const addTag = (raw) => {
    const tag = cleanTag(raw);
    setTagDraft('');
    if (!tag || tags.length >= MAX_TAGS) return;
    if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return;
    onChange({ tags: [...tags, tag] });
  };
  const removeTag = (tag) => onChange({ tags: tags.filter((existing) => existing !== tag) });

  return (
    <div className="entry-details-body">
      <div className="det-row">
        <label className="det-field">
          <span>{t('detStart')}</span>
          <input type="date" dir="ltr" value={entry.startDate || ''} max="2100-12-31" min="1950-01-01"
            onChange={(event) => onChange({ startDate: event.target.value || null })} />
        </label>
        <label className="det-field">
          <span>{t('detFinish')}</span>
          <input type="date" dir="ltr" value={entry.finishDate || ''} max="2100-12-31" min="1950-01-01"
            onChange={(event) => onChange({ finishDate: event.target.value || null })} />
        </label>
      </div>
      {orderWrong && <p className="det-warn" role="status">{t('detDateOrder')}</p>}

      <div className="det-field det-rewatch">
        <span>{t(mediaType === 'manga' ? 'detRewatchManga' : 'detRewatchAnime')}</span>
        <div className="det-stepper" dir="ltr">
          <button type="button" onClick={() => onChange({ rewatch: Math.max(0, rewatch - 1) })} disabled={rewatch <= 0} aria-label="−1">
            <Minus width={16} height={16} aria-hidden="true" />
          </button>
          <output aria-live="polite">{rewatch}</output>
          <button type="button" onClick={() => onChange({ rewatch: Math.min(99, rewatch + 1) })} disabled={rewatch >= 99} aria-label="+1">
            <Plus width={16} height={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {status === 'planned' && (
        <div className="det-field">
          <span>{t('detPriority')}</span>
          <div className="det-chips" role="radiogroup" aria-label={t('detPriority')}>
            {PRIORITIES.map((id) => (
              <button key={id} type="button" role="radio" aria-checked={entry.priority === id}
                className={`det-chip${entry.priority === id ? ' is-active' : ''}`}
                onClick={() => onChange({ priority: entry.priority === id ? null : id })}>
                {t(`priority_${id}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="det-field">
        <span>{t('detTags')}</span>
        {tags.length > 0 && (
          <ul className="det-tags">
            {tags.map((tag) => (
              <li key={tag}>
                <span dir="auto">{tag}</span>
                <button type="button" onClick={() => removeTag(tag)} aria-label={t('detTagRemove', { tag })}>
                  <X width={12} height={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {tags.length < MAX_TAGS ? (
          <input type="text" className="det-tag-input" dir="auto" maxLength={24} value={tagDraft}
            placeholder={t('detTagAdd')} aria-label={t('detTagAdd')}
            onChange={(event) => {
              const value = event.target.value;
              if (value.includes(',') || value.includes('،')) addTag(value.replace(/[،]/g, ','));
              else setTagDraft(value);
            }}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTag(tagDraft); } }}
            onBlur={() => { if (tagDraft.trim()) addTag(tagDraft); }} />
        ) : <small className="det-hint">{t('detTagsMax')}</small>}
      </div>
    </div>
  );
}
