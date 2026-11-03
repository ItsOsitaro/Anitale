import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from './api.js';
import { useAdmin } from './context.js';
import JikanImport from './JikanImport.jsx';
import TagInput from './TagInput.jsx';
import { emptyForm, errText, INFO_FIELDS, STAT_FIELDS, toForm, toPayload } from './util.js';

function Field({ id, label, hint, children, wide }) {
  return (
    <div className={`adm-field${wide ? ' adm-wide' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <small className="adm-muted">{hint}</small>}
    </div>
  );
}

export default function AnimeForm() {
  const { slug } = useParams();
  const isEdit = Boolean(slug);
  const { t, toast } = useAdmin();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingUrl, setPendingUrl] = useState('');
  const fileInput = useRef(null);

  useEffect(() => {
    if (!isEdit) return undefined;
    let active = true;
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

  useEffect(() => () => { if (pendingUrl) URL.revokeObjectURL(pendingUrl); }, [pendingUrl]);

  const set = (patch) => { setForm((current) => ({ ...current, ...patch })); setDirty(true); };
  const setInfo = (name, value) => set({ info: { ...form.info, [name]: value } });
  const setStat = (name, value) => set({ stats: { ...form.stats, [name]: value } });
  const setLink = (index, patch) => set({ links: form.links.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) });

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
    setDirty(true);
  };

  const chooseFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setPendingUrl(URL.createObjectURL(file));
    setDirty(true);
  };
  const discardFile = () => { setPendingFile(null); setPendingUrl(''); if (fileInput.current) fileInput.current.value = ''; };

  const save = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) { setError(t('required')); return; }
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
    try {
      if (pendingFile) await api.uploadCover(saved.slug, pendingFile);
      toast(t(isEdit ? 'savedOk' : 'created'));
      navigate('/admin');
    } catch (err) {
      toast(t('coverUploadFailed', { msg: errText(err, t) }), 'error');
      navigate(`/admin/edit/${saved.slug}`);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => { if (!dirty || window.confirm(t('unsaved'))) navigate('/admin'); };
  const coverSrc = pendingUrl || (form.tempCover ? `/api/admin/temp-cover/${form.tempCover}` : form.image);

  if (loading) return <p className="adm-empty">{t('loading')}</p>;
  if (isEdit && error && !form.title) return <p className="adm-error" role="alert">{error} <Link to="/admin">←</Link></p>;

  return (
    <>
      <h1 className="adm-h1">{isEdit ? t('editTitle') : t('createTitle')}</h1>
      <JikanImport
        mode={isEdit ? 'edit' : 'create'}
        currentSlug={slug}
        initialQuery={isEdit && form.malId ? `https://myanimelist.net/anime/${form.malId}` : ''}
        onImported={onImported}
      />
    <form onSubmit={save} noValidate>

      <fieldset className="adm-card">
        <legend>{t('secBasic')}</legend>
        <div className="adm-grid">
          <Field id="f-title" label={`${t('fTitle')} *`} wide><input id="f-title" dir="auto" value={form.title} onChange={(e) => set({ title: e.target.value })} required /></Field>
          <Field id="f-slug" label={t('fSlug')} hint={t('fSlugHint')}><input id="f-slug" dir="ltr" value={form.slug} placeholder="auto" onChange={(e) => set({ slug: e.target.value.toLowerCase() })} /></Field>
          <Field id="f-format" label={t('fFormat')}>
            <input id="f-format" dir="ltr" list="adm-formats" value={form.format} onChange={(e) => set({ format: e.target.value })} />
            <datalist id="adm-formats">{['TV', 'Movie', 'OVA', 'ONA', 'Special', 'TV series'].map((v) => <option key={v} value={v} />)}</datalist>
          </Field>
          <Field id="f-category" label={t('fCategory')}><input id="f-category" dir="auto" value={form.category} onChange={(e) => set({ category: e.target.value })} /></Field>
          <Field id="f-year" label={t('fYear')}><input id="f-year" dir="ltr" inputMode="numeric" value={form.year} onChange={(e) => set({ year: e.target.value })} /></Field>
          <Field id="f-airing" label={t('fAiringDay')} hint={t('fAiringDayHint')}>
            <select id="f-airing" dir="ltr" value={form.airingDay} onChange={(e) => set({ airingDay: e.target.value })}>
              <option value="">{t('airingNone')}</option>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <option key={day} value={day}>{t(`day${day}`)}</option>
              ))}
            </select>
          </Field>
          <Field id="f-score" label={t('fScore')}><input id="f-score" dir="ltr" type="number" min="0" max="10" step="0.01" value={form.score} onChange={(e) => set({ score: e.target.value })} /></Field>
          <div className="adm-wide"><TagInput id="f-genres" label={t('fGenres')} value={form.genres} onChange={(genres) => set({ genres })} /></div>
          <Field id="f-synopsis" label={t('fSynopsis')} wide><textarea id="f-synopsis" dir="auto" rows={6} value={form.synopsis} onChange={(e) => set({ synopsis: e.target.value })} /></Field>
          <Field id="f-synopsis-fa" label={t('fSynopsisFa')} hint={t('fSynopsisFaHint')} wide><textarea id="f-synopsis-fa" dir="auto" rows={6} value={form.synopsisFa} onChange={(e) => set({ synopsisFa: e.target.value, synopsisAuto: false })} /></Field>
        </div>
      </fieldset>

      <fieldset className="adm-card">
        <legend>{t('secTitles')}</legend>
        <div className="adm-grid">
          <Field id="f-ja" label={t('fJapanese')}><input id="f-ja" dir="auto" value={form.japanese} onChange={(e) => set({ japanese: e.target.value })} /></Field>
          <Field id="f-ro" label={t('fRomaji')}><input id="f-ro" dir="ltr" value={form.romaji} onChange={(e) => set({ romaji: e.target.value })} /></Field>
          <Field id="f-en" label={t('fEnglish')}><input id="f-en" dir="auto" value={form.english} onChange={(e) => set({ english: e.target.value })} /></Field>
          <div className="adm-wide"><TagInput id="f-syn" label={t('fSynonyms')} value={form.synonyms} onChange={(synonyms) => set({ synonyms })} /></div>
        </div>
      </fieldset>

      <fieldset className="adm-card">
        <legend>{t('secDetails')}</legend>
        <div className="adm-grid">
          {INFO_FIELDS.map((name) => (
            <Field key={name} id={`i-${name}`} label={t(name)}><input id={`i-${name}`} dir="auto" value={form.info[name]} onChange={(e) => setInfo(name, e.target.value)} placeholder={name === 'Type' ? form.format : ''} /></Field>
          ))}
        </div>
      </fieldset>

      <fieldset className="adm-card">
        <legend>{t('secStats')}</legend>
        <p className="adm-muted">{t('statsHint')}</p>
        <div className="adm-grid">
          {STAT_FIELDS.map(([key, label]) => (
            <Field key={key} id={`s-${key}`} label={t(label)}><input id={`s-${key}`} dir="ltr" value={form.stats[key]} onChange={(e) => setStat(key, e.target.value)} /></Field>
          ))}
        </div>
      </fieldset>

      <fieldset className="adm-card">
        <legend>{t('secStreaming')}</legend>
        <div className="adm-grid">
          <div className="adm-wide"><TagInput id="f-platforms" label={t('fPlatforms')} value={form.platforms} onChange={(platforms) => set({ platforms })} /></div>
          <Field id="f-notice" label={t('fNotice')} wide><input id="f-notice" dir="auto" value={form.streamingNotice} onChange={(e) => set({ streamingNotice: e.target.value })} /></Field>
          <div className="adm-wide adm-field">
            <span className="adm-label">{t('fLinks')}</span>
            {form.links.map((entry, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <div className="adm-inline" key={index}>
                <input dir="auto" aria-label={t('linkLabel')} placeholder={t('linkLabel')} value={entry.label} onChange={(e) => setLink(index, { label: e.target.value })} />
                <input dir="ltr" aria-label={t('linkUrl')} placeholder={t('linkUrl')} value={entry.href} onChange={(e) => setLink(index, { href: e.target.value })} />
                <button className="adm-btn adm-danger" type="button" onClick={() => set({ links: form.links.filter((_, i) => i !== index) })}>{t('remove')}</button>
              </div>
            ))}
            <div><button className="adm-btn" type="button" onClick={() => set({ links: [...form.links, { label: '', href: '', icon: '' }] })}>+ {t('addLink')}</button></div>
          </div>
          <div className="adm-wide"><TagInput id="f-resources" label={t('fResources')} value={form.resources} onChange={(resources) => set({ resources })} /></div>
        </div>
      </fieldset>

      <fieldset className="adm-card">
        <legend>{t('secCover')}</legend>
        <div className="adm-cover-row">
          {coverSrc ? <img className="adm-cover" src={coverSrc} alt="" /> : <div className="adm-cover adm-thumb-empty">{t('noCover')}</div>}
          <div>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile} aria-label={t('chooseFile')} />
            {pendingFile && <button className="adm-btn" type="button" onClick={discardFile}>{t('removePending')}</button>}
            <p className="adm-muted">{t('coverHint')}</p>
            {form.tempCover && !pendingFile && <p className="adm-muted">{t('coverImported')}</p>}
          </div>
        </div>
      </fieldset>

      {error && <p className="adm-error" role="alert">{error}</p>}
      <div className="adm-savebar">
        <button className="adm-btn adm-primary" type="submit" disabled={saving}>{saving ? t('saving') : t('save')}</button>
        <button className="adm-btn" type="button" onClick={cancel}>{t('cancel')}</button>
      </div>
    </form>
    </>
  );
}
