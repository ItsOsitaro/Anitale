import { useState } from 'react';
import { Flag } from 'lucide-react';
import { useSiteLang } from '@/i18n';
import { useUser } from '@/user';

// "Report" for a review, suggestion or profile. Signed-in members only; the owner sees it in the admin panel.
// Nothing is hidden by reporting, and the same member can report the same thing only once.
export default function ReportButton({ kind, refId, ownerName = '' }) {
  const { t } = useSiteLang();
  const user = useUser();
  const [state, setState] = useState('idle'); // idle | form | sending | sent | failed
  const [reason, setReason] = useState('');
  if (!user.me || user.me.username === ownerName) return null;
  if (state === 'sent') return <small className="report-done" role="status">{t('reportThanks')}</small>;
  if (state === 'idle') {
    return <button type="button" className="report-btn" onClick={() => setState('form')} aria-label={t('reportBtn')}><Flag width={14} height={14} aria-hidden="true" /> {t('reportBtn')}</button>;
  }
  const send = async (event) => {
    event.preventDefault();
    setState('sending');
    try {
      const res = await fetch('/api/user/reports', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, ref: String(refId), reason }) });
      setState(res.ok ? 'sent' : 'failed');
    } catch { setState('failed'); }
  };
  return (
    <form className="report-form" onSubmit={send}>
      <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder={t('reportReason')} aria-label={t('reportReason')} dir="auto" />
      <button type="submit" disabled={state === 'sending'}>{t('reportSend')}</button>
      <button type="button" onClick={() => setState('idle')}>{t('reportCancel')}</button>
      {state === 'failed' && <small role="alert">{t('reportFailed')}</small>}
    </form>
  );
}
