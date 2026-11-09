import React, { useEffect, useRef, useState } from 'react';
import { AdminNotes, TitlePreview } from './ToolsPages.jsx';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from './api.js';
import { useAdmin } from './context.js';
import TitleImport from './TitleImport.jsx';
import TagInput from './TagInput.jsx';
import { emptyForm, errText, INFO_FIELDS, STAT_FIELDS, toForm, toPayload } from './util.js';

const LIST_PATH = '/admin/anime';
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_COVER_BYTES = 2 * 1024 * 1024;
const COVER_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const SECTIONS = [['sec-basic', 'secBasic'], ['sec-titles', 'secTitles'], ['sec-details', 'secDetails'], ['sec-stats', 'secStats'], ['sec-streaming', 'secStreaming'], ['sec-cover', 'secCover']];

// Mirrors the server's slug rules so the admin sees what "auto" will produce.
const slugify = (text) => text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

function Field({ id, label, hint, error, children, wide }) {
  return (
    <div className={`adm-field${wide ? ' adm-wide' : ''}${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <small className="adm-field-err" role="alert">{error}</small> : hint && <small className="adm-muted">{hint}</small>}
    </div>
  );
}

export default function AnimeForm() {
  const { slug } = useParams();
  const isEdit = Boolean(slug);
  const { t, lang, toast, confirm, can } = useAdmin();
  const num = (n) => Number(n || 0).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US');
  const canEdit = can('catalog', 'edit');
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [errs, setErrs] = useState({});
  const [dirty, setDirty] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingUrl, setPendingUrl] = useState('');
  const [activeSec, setActiveSec] = useState(SECTIONS[0][0]);
  const [deleting, setDeleting] = useState(false);
  const [dims, setDims] = useState('');
  const fileInput = useRef(null);
  const formRef = useRef(null);
  const afterSave = useRef('list'); // 'list' = back to the list, 'stay' = keep editing

  useEffect(() => {
    if (!isEdit) return undefined;
    let active = true;
    setLoading(true);
    api.get(slug).then((item) => { if (active) { setForm(toForm(item)); setLoading(false); } })
      .catch((err) => { if (active) { setError(err.status === 404 ? t('notFound') : errText(err, t)); setLoading(false); } });
    return () => { active = false; };
  }, [slug, isEdit, t]);

  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Ctrl/Cmd+S saves from anywhere on the page.
  useEffect(() => {
    if (!canEdit) return undefined;
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); formRef.current?.requestSubmit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit]);

  useEffect(() => () => { if (pendingUrl) URL.revokeObjectURL(pendingUrl); }, [pendingUrl]);

  // Highlight the section being read in the jump bar.
  useEffect(() => {
    if (loading || typeof IntersectionObserver === 'undefined') return undefined;
    const seen = new Map();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) seen.set(entry.target.id, entry.isIntersecting);
      const first = SECTIONS.find(([anchor]) => seen.get(anchor));
      if (first) setActiveSec(first[0]);
      // The last card can never reach the reading line, so pin it at the page end.
      if (window.innerHeight + document.documentElement.scrollTop >= document.documentElement.scrollHeight - 4) setActiveSec(SECTIONS[SECTIONS.length - 1][0]);
    }, { rootMargin: '-90px 0px -55% 0px' });
    SECTIONS.forEach(([anchor]) => { const el = document.getElementById(anchor); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [loading]);

  const remove = async () => {
    if (!canEdit || !await confirm(t('confirmDelete', { title: form.title }))) return;
    setDeleting(true);
    try {
      await api.remove(slug);
      setDirty(false);
      toast(t('deleted'));
      navigate(LIST_PATH);
    } catch (err) {
      toast(errText(err, t), 'error');
      setDeleting(false);
    }
  };

  const set = (patch) => { setForm((current) => ({ ...current, ...patch })); setDirty(true); };
  const setInfo = (name, value) => set({ info: { ...form.info, [name]: value } });
  const setStat = (name, value) => set({ stats: { ...form.stats, [name]: value } });
  const setLink = (index, patch) => set({ links: form.links.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) });
  // Editing a field clears its own error message.
  const clearErr = (key) => setErrs((current) => (current[key] ? { ...current, [key]: undefined } : current));

  const onImported = (draft, tempCover) => {
    setForm((current) => {
      const next = { ...toForm(draft), tempCover };
      // On the edit page the import refreshes the data, but local-only fields stay untouched.
      if (isEdit) {
        next.slug = current.slug;
        // A source-provided broadcast day wins; an empty draft keeps the stored day.
        next.airingDay = draft.airingDay === undefined ? current.airingDay : (draft.airingDay || '');
        // An auto-filled Persian synopsis refreshes with the import; text the
        // admin typed stays untouched (a filled field also beats the draft).
        next.synopsisFa = current.synopsisFa || draft.synopsisFa || '';
        next.synopsisAuto = Boolean(current.synopsisFa)
          ? current.synopsisAuto
          : Boolean(draft.synopsisFa);
      }
      return next;
    });
    setPendingFile(null);
    setPendingUrl('');
    setErrs({});
    setDirty(true);
  };

  const acceptFile = (file) => {
    if (!file || !canEdit) return;
    // Check here so the admin does not wait for a failed upload after saving.
    const problem = !COVER_TYPES.includes(file.type) ? t('afErrFileType') : file.size > MAX_COVER_BYTES ? t('afErrFileSize') : '';
    if (problem) { setErrs((current) => ({ ...current, cover: problem })); if (fileInput.current) fileInput.current.value = ''; return; }
    clearErr('cover');
    setPendingFile(file);
    setPendingUrl(URL.createObjectURL(file));
    setDirty(true);
  };
  const chooseFile = (event) => acceptFile(event.target.files?.[0]);
  const [dragging, setDragging] = useState(false);
  const discardFile = () => { setPendingFile(null); setPendingUrl(''); setDims(''); clearErr('cover'); if (fileInput.current) fileInput.current.value = ''; };

  // Client-side checks mirroring the server schema; returns { fieldKey: message }.
  const validate = () => {
    const out = {};
    if (!form.title.trim()) out.title = t('required');
    const rawSlug = form.slug.trim();
    if (rawSlug && !SLUG_RE.test(rawSlug)) out.slug = t('afErrSlug');
    if (String(form.year ?? '').trim() && !/^\d{4}$/.test(String(form.year).trim())) out.year = t('afErrYear');
    if (form.score !== '' && form.score != null && !(Number(form.score) >= 0 && Number(form.score) <= 10)) out.score = t('afErrScore');
    form.links.forEach((entry, i) => {
      if (entry.label.trim() && entry.href.trim() && !/^https?:\/\//i.test(entry.href.trim())) out[`link${i}`] = t('afErrUrl');
    });
    return out;
  };

  const save = async (event) => {
    event.preventDefault();
    if (!canEdit || saving) return;
    const found = validate();
    setErrs(found);
    if (Object.keys(found).length) {
      setError(`${t('afFixFields')} (${num(Object.keys(found).length)})`);
      // Move focus to the first invalid field so the keyboard user lands on it.
      const first = Object.keys(found)[0];
      const target = { title: 'f-title', slug: 'f-slug', year: 'f-year', score: 'f-score' }[first] || document.querySelector(`[data-err="${first}"]`)?.id;
      (document.getElementById(target) || document.querySelector(`[data-err="${first}"]`))?.focus();
      return;
    }
    setSaving(true);
    setError('');
    let saved;
    try {
      const payload = toPayload(form, { omitTempCover: Boolean(pendingFile) });
      saved = isEdit ? await api.update(slug, payload) : await api.create(payload);
    } catch (err) {
      setError(errText(err, t));
      setSaving(false);
      return;
    }
    setDirty(false);
    const stay = afterSave.current === 'stay';
    afterSave.current = 'list';
    try {
      if (pendingFile) await api.uploadCover(saved.slug, pendingFile);
      toast(t(isEdit ? 'savedOk' : 'created'));
      if (stay) {
        discardFile();
        setForm((current) => ({ ...current, tempCover: '', slug: saved.slug }));
        if (!isEdit || saved.slug !== slug) navigate(`/admin/edit/${saved.slug}`, { replace: true });
      } else navigate(LIST_PATH);
    } catch (err) {
      toast(t('coverUploadFailed', { msg: errText(err, t) }), 'error');
      navigate(`/admin/edit/${saved.slug}`);
    } finally {
      setSaving(false);
    }
  };

  const saveAndStay = () => { afterSave.current = 'stay'; formRef.current?.requestSubmit(); };
  const cancel = async () => { if (!dirty || await confirm(t('unsaved'))) navigate(LIST_PATH); };
  const coverSrc = pendingUrl || (form.tempCover ? `/api/admin/temp-cover/${form.tempCover}` : form.image);
  const ro = !canEdit;

  if (loading) return <div className="adm-skeleton" aria-busy="true">{[0, 1, 2, 3].map((i) => <i key={i} />)}</div>;
  if (isEdit && error && !form.title) return <p className="adm-error" role="alert">{error} <Link to={LIST_PATH}>{t('afBack')}</Link></p>;

  return (
    <>
      <div className="af-head">
        <h1 className="adm-h1">{isEdit ? t('editTitle') : t('createTitle')}</h1>
        {dirty && <span className="adm-chip af-dirty">{t('afDirty')}</span>}
        {isEdit && <Link className="adm-btn af-view" to={`/anime/${slug}`} target="_blank">{t('afViewSite')}</Link>}
      </div>
      {ro && <p className="adm-muted af-readonly" role="status">{t('afReadOnly')}</p>}
      {canEdit && (() => {
        const box = (
          <TitleImport
            mode={isEdit ? 'edit' : 'create'}
            currentSlug={slug}
            initialQuery={isEdit && form.malId ? `https://myanimelist.net/anime/${form.malId}` : ''}
            onImported={onImported}
          />
        );
        // Editing: the MAL box is secondary, so it starts folded to keep the form near the top.
        return isEdit ? <details className="af-import"><summary>{t('afImportToggle')}</summary>{box}</details> : box;
      })()}
      <nav className="af-jump" aria-label={t('afJump')}>
        {SECTIONS.map(([anchor, key]) => <a key={anchor} href={`#${anchor}`} aria-current={activeSec === anchor ? 'true' : undefined} onClick={(e) => { e.preventDefault(); document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{t(key)}</a>)}
      </nav>
      <TitlePreview form={form} cover={coverSrc} slug={isEdit ? form.slug : ''} />
      {isEdit && form.slug && <AdminNotes type={LIST_PATH.includes('manga') ? 'manga' : 'anime'} slug={form.slug} />}
      {isEdit && form.slug && <p className="adm-muted"><Link to={`/admin/revisions?q=${encodeURIComponent(form.slug)}`}>{t('rvHistory')}</Link></p>}
      <form ref={formRef} onSubmit={save} noValidate>

        <fieldset className="adm-card" id="sec-basic" disabled={ro}>
          <legend>{t('secBasic')}</legend>
          <div className="adm-grid">
            <Field id="f-title" label={`${t('fTitle')} *`} error={errs.title} wide><input id="f-title" dir="auto" maxLength={200} autoFocus={!isEdit} aria-invalid={Boolean(errs.title)} value={form.title} onChange={(e) => { set({ title: e.target.value }); clearErr('title'); }} required /></Field>
            <Field id="f-title-fa" label={t('fTitleFa')} hint={t('fTitleFaHint')} wide><input id="f-title-fa" dir="rtl" maxLength={200} value={form.titleFa} onChange={(e) => set({ titleFa: e.target.value })} /></Field>
            <Field id="f-slug" label={t('fSlug')} hint={isEdit && form.slug.trim() && form.slug.trim() !== slug ? t('afSlugChange') : form.slug.trim() || !form.title.trim() ? t('fSlugHint') : t('afSlugPreview', { slug: slugify(form.title) || '—' })} error={errs.slug}><input id="f-slug" dir="ltr" maxLength={80} aria-invalid={Boolean(errs.slug)} value={form.slug} placeholder="auto" onChange={(e) => { set({ slug: e.target.value.toLowerCase() }); clearErr('slug'); }} /></Field>
            <Field id="f-format" label={t('fFormat')}>
              <input id="f-format" dir="ltr" list="adm-formats" value={form.format} onChange={(e) => set({ format: e.target.value })} />
              <datalist id="adm-formats">{['TV', 'Movie', 'OVA', 'ONA', 'Special', 'TV series'].map((v) => <option key={v} value={v} />)}</datalist>
            </Field>
            <Field id="f-category" label={t('fCategory')}><input id="f-category" dir="auto" maxLength={80} value={form.category} onChange={(e) => set({ category: e.target.value })} /></Field>
            <Field id="f-year" label={t('fYear')} error={errs.year}><input id="f-year" dir="ltr" inputMode="numeric" maxLength={4} aria-invalid={Boolean(errs.year)} value={form.year} onChange={(e) => { set({ year: e.target.value }); clearErr('year'); }} /></Field>
            <Field id="f-airing" label={t('fAiringDay')} hint={t('fAiringDayHint')}>
              <select id="f-airing" dir="ltr" value={form.airingDay} onChange={(e) => set({ airingDay: e.target.value })}>
                <option value="">{t('airingNone')}</option>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                  <option key={day} value={day}>{t(`day${day}`)}</option>
                ))}
              </select>
            </Field>
            <Field id="f-score" label={t('fScore')} error={errs.score}><input id="f-score" dir="ltr" type="number" min="0" max="10" step="0.01" aria-invalid={Boolean(errs.score)} value={form.score} onChange={(e) => { set({ score: e.target.value }); clearErr('score'); }} /></Field>
            <div className="adm-wide"><TagInput id="f-genres" label={t('fGenres')} value={form.genres} onChange={(genres) => set({ genres })} disabled={ro} max={40} /></div>
            <Field id="f-synopsis" label={t('fSynopsis')} hint={t('afChars', { n: num(form.synopsis.length) })} wide><textarea id="f-synopsis" dir="auto" rows={6} value={form.synopsis} onChange={(e) => set({ synopsis: e.target.value })} /></Field>
            <Field id="f-synopsis-fa" label={t('fSynopsisFa')} hint={`${t('fSynopsisFaHint')} · ${t('afChars', { n: num(form.synopsisFa.length) })}`} wide>
              <textarea id="f-synopsis-fa" dir="auto" rows={6} value={form.synopsisFa} onChange={(e) => set({ synopsisFa: e.target.value, synopsisAuto: false })} />
              {form.synopsisAuto && form.synopsisFa && <span className="adm-chip af-auto">{t('afAutoTranslated')}</span>}
            </Field>
          </div>
        </fieldset>

        <fieldset className="adm-card" id="sec-titles" disabled={ro}>
          <legend>{t('secTitles')}</legend>
          <div className="adm-grid">
            <Field id="f-ja" label={t('fJapanese')}><input id="f-ja" dir="auto" value={form.japanese} onChange={(e) => set({ japanese: e.target.value })} /></Field>
            <Field id="f-ro" label={t('fRomaji')}><input id="f-ro" dir="ltr" value={form.romaji} onChange={(e) => set({ romaji: e.target.value })} /></Field>
            <Field id="f-en" label={t('fEnglish')}><input id="f-en" dir="auto" value={form.english} onChange={(e) => set({ english: e.target.value })} /></Field>
            <div className="adm-wide"><TagInput id="f-syn" label={t('fSynonyms')} value={form.synonyms} onChange={(synonyms) => set({ synonyms })} disabled={ro} /></div>
          </div>
        </fieldset>

        <fieldset className="adm-card" id="sec-details" disabled={ro}>
          <legend>{t('secDetails')}</legend>
          <div className="adm-grid">
            {INFO_FIELDS.map((name) => (
              <Field key={name} id={`i-${name}`} label={t(name)}><input id={`i-${name}`} dir="auto" value={form.info[name]} onChange={(e) => setInfo(name, e.target.value)} placeholder={name === 'Type' ? form.format : ''} /></Field>
            ))}
          </div>
        </fieldset>

        <fieldset className="adm-card" id="sec-stats" disabled={ro}>
          <legend>{t('secStats')}</legend>
          <p className="adm-muted">{t('statsHint')}</p>
          <div className="adm-grid">
            {STAT_FIELDS.map(([key, label]) => (
              <Field key={key} id={`s-${key}`} label={t(label)}><input id={`s-${key}`} dir="ltr" inputMode="decimal" value={form.stats[key]} onChange={(e) => setStat(key, e.target.value)} /></Field>
            ))}
          </div>
        </fieldset>

        <fieldset className="adm-card" id="sec-streaming" disabled={ro}>
          <legend>{t('secStreaming')}</legend>
          <div className="adm-grid">
            <div className="adm-wide"><TagInput id="f-platforms" label={t('fPlatforms')} value={form.platforms} onChange={(platforms) => set({ platforms })} disabled={ro} /></div>
            <Field id="f-notice" label={t('fNotice')} wide><input id="f-notice" dir="auto" value={form.streamingNotice} onChange={(e) => set({ streamingNotice: e.target.value })} /></Field>
            <div className="adm-wide adm-field">
              <span className="adm-label">{t('fLinks')}</span>
              {form.links.length === 0 && <small className="adm-muted">{t('afNoLinks')}</small>}
              {form.links.map((entry, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={index}>
                  <div className="adm-inline">
                    <input dir="auto" aria-label={t('linkLabel')} placeholder={t('linkLabel')} value={entry.label} onChange={(e) => setLink(index, { label: e.target.value })} />
                    <input id={`link-url-${index}`} data-err={`link${index}`} dir="ltr" type="url" inputMode="url" aria-label={t('linkUrl')} aria-invalid={Boolean(errs[`link${index}`])} placeholder="https://" value={entry.href} onChange={(e) => { setLink(index, { href: e.target.value }); clearErr(`link${index}`); }} />
                    <button className="adm-btn adm-danger" type="button" onClick={() => set({ links: form.links.filter((_, i) => i !== index) })}>{t('remove')}</button>
                  </div>
                  {errs[`link${index}`] && <small className="adm-field-err" role="alert">{errs[`link${index}`]}</small>}
                </div>
              ))}
              <div><button className="adm-btn" type="button" onClick={() => set({ links: [...form.links, { label: '', href: '', icon: '' }] })}>+ {t('addLink')}</button></div>
            </div>
            <div className="adm-wide"><TagInput id="f-resources" label={t('fResources')} value={form.resources} onChange={(resources) => set({ resources })} disabled={ro} /></div>
          </div>
        </fieldset>

        <fieldset className="adm-card" id="sec-cover" disabled={ro}>
          <legend>{t('secCover')}</legend>
          <div className={`adm-cover-row${dragging ? ' is-drag' : ''}`} onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDragging(true); } }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files?.[0]); }}>
            {coverSrc ? <img className="adm-cover" src={coverSrc} onLoad={(e) => setDims(`${num(e.currentTarget.naturalWidth)}×${num(e.currentTarget.naturalHeight)}`)} alt={form.title ? t('afCoverAlt', { title: form.title }) : ''} /> : <div className="adm-cover adm-thumb-empty">{t('noCover')}</div>}
            <div>
              <input ref={fileInput} id="f-cover" className="af-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile} />
              <label className="adm-btn" htmlFor="f-cover">{t('chooseFile')}</label>
              {!pendingFile && <span className="adm-muted af-fileinfo"> {t('afDropHint')}</span>}
              {pendingFile && <button className="adm-btn" type="button" onClick={discardFile}>{t('removePending')}</button>}
              {pendingFile && <p className="adm-muted af-fileinfo" dir="ltr">{pendingFile.name} · {(pendingFile.size / 1024).toFixed(0)} KB</p>}
              {coverSrc && dims && <p className="adm-muted af-fileinfo">{t('afDims', { size: dims })}</p>}
              <p className="adm-muted">{t('coverHint')}</p>
              {errs.cover && <small className="adm-field-err" role="alert">{errs.cover}</small>}
              {form.tempCover && !pendingFile && <p className="adm-muted">{t('coverImported')}</p>}
            </div>
          </div>
        </fieldset>

        {error && <p className="adm-error" role="alert">{error}</p>}
        <div className="adm-savebar">
          {canEdit && <button className="adm-btn adm-primary" type="submit" disabled={saving} title="Ctrl+S">{saving ? t('saving') : t('save')}</button>}
          {canEdit && <button className="adm-btn" type="button" disabled={saving} onClick={saveAndStay}>{t('afSaveStay')}</button>}
          <button className="adm-btn" type="button" onClick={cancel}>{canEdit ? t('cancel') : t('afBack')}</button>
          {dirty && <span className="af-savestate" role="status">{t('afDirty')}</span>}
          {canEdit && isEdit && <button className="adm-btn adm-danger af-delete" type="button" disabled={saving || deleting} onClick={remove}>{t('delete')}</button>}
        </div>
      </form>
    </>
  );
}
