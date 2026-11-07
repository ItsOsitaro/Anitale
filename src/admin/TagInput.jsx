import React, { useRef, useState } from 'react';
import { useAdmin } from './context.js';

// Tag editor: Enter / comma / Persian comma adds, Backspace on empty input removes the last tag,
// pasting a comma- or line-separated list adds them all. Comparison is case-insensitive.
// Props: value, onChange, label, id; optional suggestions (datalist), max (tag count), maxLength (per tag),
// disabled (read-only view), error (message shown under the field).
export default function TagInput({ value, onChange, label, id, suggestions, max = 60, maxLength = 80, disabled = false, error = '' }) {
  const { t, lang } = useAdmin();
  const num = (n) => Number(n).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US');
  const box = useRef(null);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const composing = useRef(false); // Persian/Japanese IME: Enter confirms the composition, not the tag
  const listId = suggestions?.length ? `${id}-list` : undefined;

  const add = (raw) => {
    const parts = raw.split(/[,،\n\r]/).map((part) => part.trim().replace(/\s+/g, ' ')).filter(Boolean);
    if (!parts.length) { setDraft(''); return; }
    const seen = new Set(value.map((item) => item.toLowerCase()));
    const fresh = [];
    let skipped = 0;
    for (const part of parts) {
      const clipped = part.slice(0, maxLength);
      if (seen.has(clipped.toLowerCase()) || value.length + fresh.length >= max) { skipped += 1; continue; }
      seen.add(clipped.toLowerCase());
      fresh.push(clipped);
    }
    if (fresh.length) onChange([...value, ...fresh]);
    setNote(skipped ? t('tagSkipped', { n: skipped }) : '');
    setDraft('');
  };

  const remove = (tag) => { onChange(value.filter((item) => item !== tag)); setNote(t('tagRemoved', { tag })); document.getElementById(id)?.focus(); };
  const clearAll = () => { onChange([]); setNote(''); document.getElementById(id)?.focus(); };

  return (
    <div className="adm-field">
      <label htmlFor={id}>{label}{value.length > 0 && <span className="adm-muted tag-count"> ({num(value.length)}{value.length >= max * 0.8 ? `/${num(max)}` : ''})</span>}
        {!disabled && value.length > 3 && <button type="button" className="tag-clear" onClick={clearAll}>{t('tagClearAll')}</button>}</label>
      <div ref={box} className={`adm-tags${disabled ? ' is-disabled' : ''}${value.length >= max ? ' is-full' : ''}`} role="group" aria-label={label} onClick={(e) => { if (e.target === box.current) document.getElementById(id)?.focus(); }}>
        {value.map((tag) => (
          <span className="adm-tag" key={tag} dir="auto">
            {tag}
            {!disabled && <button type="button" aria-label={`${t('remove')} ${tag}`} title={t('remove')} onClick={() => remove(tag)}>×</button>}
          </span>
        ))}
        {!disabled && value.length >= max && <span className="adm-muted tag-full">{t('tagFull', { n: num(max) })}</span>}
        {!disabled && value.length < max && (
          <input
            id={id}
            dir="auto"
            list={listId}
            value={draft}
            maxLength={maxLength * 4}
            placeholder={value.length ? '' : t('tagHint')}
            aria-describedby={`${id}-note`}
            onChange={(event) => setDraft(event.target.value)}
            onCompositionStart={() => { composing.current = true; }}
            onCompositionEnd={() => { composing.current = false; }}
            onKeyDown={(event) => {
              if (composing.current || event.nativeEvent.isComposing) return;
              if (event.key === 'Enter' || event.key === ',' || event.key === '،') { event.preventDefault(); add(draft); }
              else if (event.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
              else if (event.key === 'Escape') setDraft('');
            }}
            onPaste={(event) => {
              const text = event.clipboardData.getData('text');
              if (/[,،\n\r]/.test(text)) { event.preventDefault(); add(`${draft}${text}`); }
            }}
            onBlur={() => add(draft)}
          />
        )}
        {listId && <datalist id={listId}>{suggestions.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>}
      </div>
      <small id={`${id}-note`} className={error ? 'adm-field-err' : 'adm-muted'} role={error ? 'alert' : undefined} aria-live="polite">{error || note}</small>
    </div>
  );
}
