import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

function Diff({ s, t }) {
  const cur = s.current;
  if (!cur) return <p className="adm-muted">{t('sgGone')}</p>;
  if (s.kind === 'report') return <p dir="auto" className="adm-review-body">{s.payload.text}</p>;
  if (s.kind === 'genres') {
    return (
      <div>
        <p><strong>{t('sgOld')}:</strong> <span dir="ltr">{cur.genres.join(', ') || '—'}</span></p>
        {s.payload.add?.length > 0 && <p><strong>+</strong> <span dir="ltr">{s.payload.add.join(', ')}</span></p>}
        {s.payload.remove?.length > 0 && <p><strong>−</strong> <span dir="ltr">{s.payload.remove.join(', ')}</span></p>}
      </div>
    );
  }
  const old = s.kind === 'synopsis' ? cur.synopsisFa : cur.titleFa;
  return (
    <div className="sg-diff">
      <div><strong>{t('sgOld')}</strong><p dir="auto">{old || '—'}</p></div>
      <div><strong>{t('sgNew')}</strong><p dir="auto">{s.payload.text}</p></div>
    </div>
  );
}

// Queue of member edit suggestions: approve applies the change, reject needs a reason shown to the member.
export default function Suggestions() {
  const { t, toast } = useAdmin();
  const [status, setStatus] = useState('pending');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    let active = true;
    api.suggestionsList(status)
      .then((r) => { if (active) { setData(r); setError(''); } })
      .catch((err) => { if (active) setError(errText(err, t)); });
    return () => { active = false; };
  }, [status, reloadKey, t]);

  const approve = async (s) => {
    setBusyId(s.id);
    try { await api.suggestionApprove(s.id); toast(t('sgApproved')); setReloadKey((n) => n + 1); } catch (err) { toast(errText(err, t), 'error'); } finally { setBusyId(null); }
  };
  const reject = async (s) => {
    setBusyId(s.id);
    try { await api.suggestionReject(s.id, reason); toast(t('sgRejected')); setRejecting(null); setReason(''); setReloadKey((n) => n + 1); } catch (err) { toast(errText(err, t), 'error'); } finally { setBusyId(null); }
  };

  return (
    <section>
      <div className="adm-toolbar">
        {['pending', 'approved', 'rejected'].map((st) => (
          <button key={st} type="button" className={`adm-btn${status === st ? ' adm-primary' : ''}`} onClick={() => setStatus(st)}>{t(`sgTab_${st}`)}</button>
        ))}
      </div>
      {error && <p className="adm-error" role="alert">{error}</p>}
      {data?.items.length === 0 && <p className="adm-empty">{t('sgEmpty')}</p>}
      {data?.items.map((s) => (
        <div className="adm-card sg-card" key={s.id} style={{ padding: 14, marginBottom: 12 }}>
          <p>
            <strong dir="ltr">{s.username}</strong> → <a href={`/${s.mediaType}/${encodeURIComponent(s.slug)}`} target="_blank" rel="noreferrer" dir="ltr">{s.slug}</a>
            <span className="adm-chip">{t(`sgKind_${s.kind}`)}</span>
            <span className="adm-chip">{s.mediaType}</span>
          </p>
          <Diff s={s} t={t} />
          {s.status === 'rejected' && s.reason && <p className="adm-muted">{t('sgReason')}: {s.reason}</p>}
          {s.status === 'pending' && (
            rejecting === s.id ? (
              <div className="sg-reject">
                <input className="adm-search" dir="auto" placeholder={t('sgReasonPh')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} id={`sg-reason-${s.id}`} />
                <button className="adm-btn adm-danger" type="button" disabled={busyId === s.id || reason.trim().length < 3} onClick={() => reject(s)} id={`sg-reject-ok-${s.id}`}>{t('sgReject')}</button>
                <button className="adm-btn" type="button" onClick={() => { setRejecting(null); setReason(''); }}>{t('cancel')}</button>
              </div>
            ) : (
              <div className="sg-actions">
                <button className="adm-btn adm-primary" type="button" disabled={busyId === s.id} onClick={() => approve(s)} id={`sg-approve-${s.id}`}>{s.kind === 'report' ? t('sgAck') : t('sgApprove')}</button>
                <button className="adm-btn adm-danger" type="button" onClick={() => setRejecting(s.id)} id={`sg-reject-${s.id}`}>{t('sgReject')}</button>
              </div>
            )
          )}
        </div>
      ))}
    </section>
  );
}
