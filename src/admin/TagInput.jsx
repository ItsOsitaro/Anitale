import React, { useState } from 'react';
import { useAdmin } from './context.js';

export default function TagInput({ value, onChange, label, id }) {
  const { t } = useAdmin();
  const [draft, setDraft] = useState('');

  const add = (raw) => {
    const items = raw.split(/[,،]/).map((part) => part.trim()).filter(Boolean);
    if (!items.length) return;
    onChange([...value, ...items.filter((item, index) => !value.includes(item) && items.indexOf(item) === index)]);
    setDraft('');
  };

  return (
    <div className="adm-field">
      <label htmlFor={id}>{label}</label>
      <div className="adm-tags">
        {value.map((tag) => (
          <span className="adm-tag" key={tag}>
            {tag}
            <button type="button" aria-label={`${t('remove')} ${tag}`} onClick={() => onChange(value.filter((item) => item !== tag))}>×</button>
          </span>
        ))}
        <input
          id={id}
          dir="auto"
          value={draft}
          placeholder={t('tagHint')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',' || event.key === '،') { event.preventDefault(); add(draft); }
            else if (event.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => add(draft)}
        />
      </div>
    </div>
  );
}
