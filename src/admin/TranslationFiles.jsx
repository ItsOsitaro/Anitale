import React, { useState, useEffect } from 'react';
import { useAdmin } from './context.js';
import { errText } from './util.js';

const BATCH = 100; // items per import request (the server accepts up to 300)

// Export English titles / synopses as small JSON files, give them to Claude to translate, then import the Persian files back.
export default function TranslationFiles() {
  const { t, lang, toast, confirm, can } = useAdmin();
  const canEdit = can('translate', 'edit');
  const [opts, setOpts] = useState({ kind: 'synopsis', media: 'anime', scope: 'missing', size: 100 });
  const [info, setInfo] = useState(null);
  const [files, setFiles] = useState([]); // [{ name, kind, media, items, filled, error }]
  const [progress, setProgress] = useState(null);
  const [report, setReport] = useState(null);
  const [tick, setTick] = useState(0); // bump to refresh the export counts after an import

  const query = `kind=${opts.kind}&media=${opts.media}&scope=${opts.scope}&size=${opts.size}`;
  useEffect(() => {
    let alive = true;
    setInfo(null);
    fetch(`/api/admin/x/translate/export-info?${query}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) setInfo(d); }).catch(() => {});
    return () => { alive = false; };
  }, [query, tick]);

  const set = (patch) => setOpts((current) => ({ ...current, ...patch }));
  const num = (value) => Number(value || 0).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US');

  const readFiles = async (list) => {
    setReport(null);
    const parsed = [];
    for (const file of Array.from(list)) {
      try {
        const data = JSON.parse(await file.text());
        if (data?.format !== 'anitale-translation' || !Array.isArray(data.items)) throw new Error(t('tfNotOurs'));
        parsed.push({ name: file.name, kind: data.kind, media: data.media, items: data.items, filled: data.items.filter((i) => String(i?.fa || '').trim()).length });
      } catch (error) {
        parsed.push({ name: file.name, error: error.message || t('tfBadJson'), items: [], filled: 0 });
      }
    }
    setFiles(parsed);
  };

  const runImport = async () => {
    const good = files.filter((f) => !f.error);
    const total = good.reduce((sum, f) => sum + f.filled, 0);
    const all = good.reduce((sum, f) => sum + f.items.length, 0);
    if (!total) { toast(t('tfNothing'), 'error'); return; }
    if (!(await confirm(t('tfConfirm', { n: num(total) }), { danger: true }))) return;
    const sum = { updated: 0, empty: 0, invalid: 0, notFound: 0, problems: [] };
    let done = 0;
    try {
      for (const file of good) {
        for (let i = 0; i < file.items.length; i += BATCH) {
          const items = file.items.slice(i, i + BATCH).map((item) => ({ id: item?.id, fa: item?.fa }));
          setProgress({ done, total: all, name: file.name });
          const res = await fetch('/api/admin/x/translate/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: file.kind, media: file.media, items }) });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { status: res.status });
          for (const key of ['updated', 'empty', 'invalid', 'notFound']) sum[key] += body[key] || 0;
          sum.problems.push(...(body.problems || []).map((p) => ({ ...p, file: file.name })));
          done += items.length;
        }
      }
      toast(t('tfDone', { n: num(sum.updated) }));
    } catch (error) {
      toast(errText(error, t), 'error');
    } finally {
      setProgress(null);
      setTick((n) => n + 1);
      setReport(sum);
      setFiles([]);
    }
  };

  const why = (text) => {
    const key = `tfWhy_${String(text).replace(/\W+/g, '_')}`;
    const translated = t(key);
    return translated === key ? text : translated;
  };

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const exportDisabled = Boolean(info && !info.count);
  return (
    <section className="adm-card tf-card" aria-labelledby="tf-title">
      <header className="adm-card-head"><div><h2 className="adm-card-title" id="tf-title">{t('tfTitle')}</h2><p className="adm-card-sub">{t('tfSub')}</p></div></header>
      <div className="adm-card-body tf-body">
        <div className="tf-col">
          <h3 className="tf-h">{t('tfExport')}</h3>
          <div className="tf-row">
            <label className="adm-field"><span>{t('tfKind')}</span>
              <select value={opts.kind} onChange={(e) => set({ kind: e.target.value })}>
                <option value="synopsis">{t('tfKindSynopsis')}</option>
                <option value="title">{t('tfKindTitle')}</option>
              </select></label>
            <label className="adm-field"><span>{t('tfMedia')}</span>
              <select value={opts.media} onChange={(e) => set({ media: e.target.value })}>
                <option value="anime">{t('translateMediaAnime')}</option>
                <option value="manga">{t('translateMediaManga')}</option>
                <option value="both">{t('translateMediaAll')}</option>
              </select></label>
            <label className="adm-field"><span>{t('tfScope')}</span>
              <select value={opts.scope} onChange={(e) => set({ scope: e.target.value })}>
                <option value="missing">{t('tfScopeMissing')}</option>
                <option value="all">{t('tfScopeAll')}</option>
              </select></label>
            <label className="adm-field"><span>{t('tfSize')}</span>
              <select value={opts.size} onChange={(e) => set({ size: Number(e.target.value) })}>
                {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{num(n)}</option>)}
              </select></label>
          </div>
          <p className="adm-muted" role="status">{info ? t('tfInfo', { n: num(info.count), files: num(info.files) }) : t('loading')}</p>
          <div className="adm-actions">
            <a className={`adm-btn adm-primary${exportDisabled ? ' is-disabled' : ''}`} href={`/api/admin/x/translate/export.zip?${query}`} download aria-disabled={exportDisabled} onClick={(e) => { if (exportDisabled) e.preventDefault(); }}>{t('tfDownload')}</a>
          </div>
          <p className="adm-muted">{t('tfHowTo')}</p>
        </div>

        <div className="tf-col">
          <h3 className="tf-h">{t('tfImport')}</h3>
          {!canEdit ? <p className="adm-muted">{t('tfReadOnly')}</p> : (
            <>
              <label className="tf-drop">
                <input type="file" accept=".json,application/json" multiple onChange={(e) => { readFiles(e.target.files); e.target.value = ''; }} />
                <span>{t('tfPick')}</span>
              </label>
              {files.length > 0 && (
                <ul className="tf-files">
                  {files.map((f) => (
                    <li key={f.name} className={f.error ? 'is-bad' : ''}>
                      <span dir="ltr">{f.name}</span>
                      {f.error ? <span>{f.error}</span> : <span>{t('tfFileInfo', { filled: num(f.filled), total: num(f.items.length) })}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="adm-actions">
                <button type="button" className="adm-btn adm-primary" disabled={!!progress || !files.some((f) => !f.error && f.filled)} onClick={runImport}>{t('tfRun')}</button>
              </div>
              {progress && (
                <div className="tf-progress" role="status">
                  <div className="adm-bar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${pct}%` }} /></div>
                  <small dir="ltr">{progress.name} · {num(progress.done)} / {num(progress.total)}</small>
                </div>
              )}
              {report && (
                <div className="tf-report">
                  <p><strong>{t('tfDone', { n: num(report.updated) })}</strong></p>
                  <p className="adm-muted">{t('tfReport', { empty: num(report.empty), invalid: num(report.invalid), missing: num(report.notFound) })}</p>
                  {report.problems.length > 0 && (
                    <ul className="tf-files">
                      {report.problems.slice(0, 20).map((p, i) => <li key={`${p.id}-${i}`} className="is-bad"><span dir="ltr">{p.id}</span><span>{why(p.why)}</span></li>)}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
