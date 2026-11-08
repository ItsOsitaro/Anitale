import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api.js';

// Ctrl+K quick jump: type part of a page or section name, arrows + Enter to go.
export default function Palette({ items, t, onClose }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  // Titles and members matching what is typed (each needs its own area; a 403 just means no results of that kind).
  const [found, setFound] = useState([]);
  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) { setFound([]); return undefined; }
    let live = true;
    const timer = setTimeout(async () => {
      const [titles, users] = await Promise.all([api.findTitles(needle).catch(() => ({ items: [] })), api.findUsers(needle).catch(() => ({ items: [] }))]);
      if (!live) return;
      setFound([
        ...titles.items.map((row) => ({ label: row.title, group: t('palTitles'), to: row.type === 'manga' ? `/admin/manga?q=${encodeURIComponent(row.title)}` : `/admin/edit/${row.slug}` })),
        ...users.items.map((row) => ({ label: row.username, group: t('palUsers'), to: `/admin/users?q=${encodeURIComponent(row.username)}` })),
      ]);
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [query, t]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...items.filter((item) => !needle || `${item.label} ${item.group || ''}`.toLowerCase().includes(needle)), ...found];
  }, [items, query, found]);
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
            <li key={`${item.to}-${i}`} id={`adm-pal-${i}`} role="option" aria-selected={i === index}>
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
