import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Ctrl+K quick jump: type part of a page or section name, arrows + Enter to go.
export default function Palette({ items, t, onClose }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => !needle || `${item.label} ${item.group || ''}`.toLowerCase().includes(needle));
  }, [items, query]);
  useEffect(() => {
    const opener = document.activeElement;
    inputRef.current?.focus();
    return () => { if (opener instanceof HTMLElement && document.contains(opener)) opener.focus(); };
  }, []);
  useEffect(() => { setIndex(0); }, [query]);
  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => { listRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' }); }, [index]);
  const go = (item) => { if (item) { navigate(item.to); onClose(); } };
  const onKey = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setIndex((i) => Math.min(i + 1, shown.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); go(shown[index]); }
    else if (event.key === 'Tab') event.preventDefault(); // focus stays in the search box
  };
  return (
    <div className="adm-modal-back" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="adm-palette" role="dialog" aria-modal="true" aria-label={t('paletteHint')} onKeyDown={onKey}>
        <input ref={inputRef} type="search" dir="auto" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('palettePlaceholder')} aria-label={t('palettePlaceholder')}
          role="combobox" aria-expanded="true" aria-controls="adm-palette-list" aria-activedescendant={shown[index] ? `adm-pal-${index}` : undefined} />
        <ul id="adm-palette-list" role="listbox" ref={listRef}>
          {shown.map((item, i) => (
            <li key={item.to} id={`adm-pal-${i}`} role="option" aria-selected={i === index}>
              <button type="button" tabIndex={-1} className={i === index ? 'is-active' : ''} onMouseMove={() => i !== index && setIndex(i)} onClick={() => go(item)}>
                <span>{item.label}</span>{item.group && <small>{item.group}</small>}
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="adm-empty" role="presentation">{t('paletteEmpty')}</li>}
        </ul>
        <div className="adm-palette-foot" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> <kbd>Enter</kbd> <kbd>Esc</kbd></div>
      </div>
    </div>
  );
}
