import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSiteLang } from './i18n.js';
import { useUser, userApi } from './user.jsx';

export default function MySuggestions() {
  const { t } = useSiteLang();
  const user = useUser();
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => { document.title = `${t('sugMine')} · ${t('siteName')}`; }, [t]);
  useEffect(() => {
    if (!user.meLoaded) return undefined;
    if (!user.me) { setState({ status: 'guest' }); return undefined; }
    let alive = true;
    userApi.mySuggestions().then((d) => { if (alive) setState({ status: 'ready', data: d }); }).catch(() => { if (alive) setState({ status: 'error' }); });
    return () => { alive = false; };
  }, [user.meLoaded, user.me]);
  return (
    <main className="stacks-shell">
      <h1>{t('sugMine')}</h1>
      {state.status === 'loading' && <p className="extras-muted" role="status">{t('extrasLoading')}</p>}
      {state.status === 'guest' && <p><Link to="/login">{t('navAuth')}</Link></p>}
      {state.status === 'error' && <p className="extras-muted">{t('mediaError')}</p>}
      {state.status === 'ready' && state.data.items.length === 0 && <p className="extras-muted">{t('sugNone')}</p>}
      {state.status === 'ready' && (
        <ul className="sug-list">
          {state.data.items.map((s) => (
            <li key={s.id} className={`sug-item is-${s.status}`}>
              <div><Link to={`/${s.mediaType}/${encodeURIComponent(s.slug)}`} dir="ltr">{s.slug}</Link> · {t(`sugKind_${s.kind}`)}</div>
              <span className="sug-status">{t(`sugStatus_${s.status}`)}</span>
              {s.status === 'rejected' && s.reason && <p className="sug-reason">{t('sugReason')}: {s.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
