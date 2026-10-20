import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

// Queue 25: full manga management — list, edit (incl. Persian fields), delete.
export default function MangaList() {
  const { t, toast } = useAdmin();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  // inline editor state: { slug, draft }
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    api.mangaList().then((items) => { setRows(items || []); setError(''); }).catch((err) => setError(errText(err, t)));
  }, [t]);

  const shown = (rows || []).filter((row) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${row.title} ${row.titleFa || ''} ${row.slug}`.toLowerCase().includes(needle);
  });

  const remove = async (row) => {
    if (!window.confirm(t('mangaConfirmDelete', { title: row.title }))) return;
    setBusy(row.slug);
    try {
      await api.mangaRemove(row.slug);
      setRows((current) => current.filter((x) => x.slug !== row.slug));
      toast(t('mangaDeleted', { title: row.title }));
    } catch (err) {
      toast(errText(err, t), 'error');
    } finally {
      setBusy('');
    }
  };

  const refresh = async (row) => {
    if (!row.malId) { toast(t('mangaRefreshNoId', { title: row.title }), 'error'); return; }
    setBusy(row.slug);
    try {
      const { item, coverWarning, changes = [] } = await api.mangaRefresh(row.slug);
      setRows((current) => current.map((x) => (x.slug === row.slug ? { ...x, ...item, image: item.image || x.image } : x)));
      toast(t('mangaRefreshed', { title: item.title }));
      if (changes.length > 0) toast(changes.map((c) => `${c.field}: ${c.from ?? '—'} → ${c.to ?? '—'}`).join(' · '));
      if (coverWarning) toast(t('coverWarning', { msg: coverWarning }), 'error');
    } catch (err) {
      toast(errText(err, t), 'error');
    } finally {
      setBusy('');
    }
  };

  const startEdit = (row) => {
    setEditing({
      slug: row.slug,
      draft: {
        title: row.title || '',
        titleFa: row.titleFa || '',
        category: row.category || '',
        year: String(row.year || ''),
        score: row.sampleScore ?? '',
      },
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { slug, draft } = editing;
    setBusy(slug);
    try {
      const patch = {
        title: draft.title.trim(),
        titleFa: draft.titleFa.trim(),
        category: draft.category.trim(),
        year: String(draft.year).trim(),
        score: draft.score === '' || draft.score == null ? null : Number(draft.score),
      };
      const { item } = await api.mangaUpdate(slug, patch);
      setRows((current) => current.map((x) => (x.slug === slug ? { ...x, ...item } : x)));
      setEditing(null);
      toast(t('mangaSaved', { title: item.title }));
    } catch (err) {
      toast(errText(err, t), 'error');
    } finally {
      setBusy('');
    }
  };

  const draftField = (key, event) => setEditing((current) => ({ ...current, draft: { ...current.draft, [key]: event.target.value } }));

  return (
    <section>
      <div className="adm-toolbar">
        <input className="adm-search" type="search" dir="auto" placeholder={t('mangaSearch')} aria-label={t('mangaSearch')} value={query} onChange={(e) => setQuery(e.target.value)} />
        {rows && <span className="adm-muted">{t('mangaTotal', { n: shown.length })}</span>}
      </div>
      {error && <p className="adm-error" role="alert">{error}</p>}

      <div className="adm-card adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>{t('mangaColCover')}</th>
              <th>{t('mangaColTitle')}</th>
              <th>{t('mangaColFa')}</th>
              <th>{t('mangaColYear')}</th>
              <th>{t('mangaColScore')}</th>
              <th>{t('mangaColChapters')}</th>
              <th>{t('mangaColActions')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <React.Fragment key={row.slug}>
                <tr>
                  <td>{row.image ? <img className="adm-thumb" src={row.image} alt="" /> : <span className="adm-thumb adm-thumb-empty" />}</td>
                  <td>
                    <Link to={`/manga/${row.slug}`} dir="auto"><strong>{row.title}</strong></Link>
                    <div className="adm-muted" dir="ltr">{row.slug}{row.malId ? ` · MAL ${row.malId}` : ''}{row.publicationStatus ? ` · ${row.publicationStatus}` : ''}</div>
                  </td>
                  <td dir="auto">{row.titleFa || '—'}</td>
                  <td>{row.year || '—'}</td>
                  <td>{row.sampleScore != null ? Number(row.sampleScore).toFixed(1) : '—'}</td>
                  <td>{row.chapters ?? '—'}</td>
                  <td>
                    <div className="adm-actions">
                      <button className="adm-btn" type="button" disabled={busy === row.slug} onClick={() => (editing?.slug === row.slug ? setEditing(null) : startEdit(row))}>{editing?.slug === row.slug ? t('mangaClose') : t('mangaEdit')}</button>
                      <button className="adm-btn" type="button" disabled={busy === row.slug || !row.malId} title={row.malId ? t('mangaRefreshBtn') : t('mangaRefreshNoId', { title: row.title })} onClick={() => refresh(row)}>{busy === row.slug ? t('mangaBusy') : t('mangaRefreshBtn')}</button>
                      <button className="adm-btn adm-danger" type="button" disabled={busy === row.slug} onClick={() => remove(row)}>{t('mangaDelete')}</button>
                    </div>
                  </td>
                </tr>
                {editing?.slug === row.slug && (
                  <tr className="manga-edit-row">
                    <td colSpan={7}>
                      <div className="manga-editor">
                        <label><span>{t('mangaFieldTitle')}</span><input dir="auto" value={editing.draft.title} onChange={(e) => draftField('title', e)} /></label>
                        <label><span>{t('mangaFieldFa')}</span><input dir="auto" value={editing.draft.titleFa} onChange={(e) => draftField('titleFa', e)} /></label>
                        <label><span>{t('mangaFieldCategory')}</span><input dir="auto" value={editing.draft.category} onChange={(e) => draftField('category', e)} /></label>
                        <label><span>{t('mangaFieldYear')}</span><input dir="ltr" value={editing.draft.year} onChange={(e) => draftField('year', e)} /></label>
                        <label><span>{t('mangaFieldScore')}</span><input type="number" step="0.1" min="0" max="10" dir="ltr" value={editing.draft.score} onChange={(e) => draftField('score', e)} /></label>
                        <div className="manga-editor-actions">
                          <button className="adm-btn adm-primary" type="button" disabled={busy === row.slug} onClick={saveEdit}>{t('mangaSave')}</button>
                          <button className="adm-btn" type="button" onClick={() => setEditing(null)}>{t('mangaCancel')}</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {rows && shown.length === 0 && <p className="adm-empty">{t('mangaEmpty')}</p>}
        {!rows && !error && <p className="adm-empty">{t('loading')}</p>}
      </div>
    </section>
  );
}
