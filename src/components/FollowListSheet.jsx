import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useSiteLang } from '@/i18n';
import { useSheet } from '@/hooks/use-sheet';
import { userApi } from '@/user.jsx';

// Who follows a user / who they follow. Opens from the counts on a profile.
export default function FollowListSheet({ username, kind, onClose }) {
  const { t } = useSiteLang();
  const ref = useRef(null);
  const open = Boolean(kind);
  const [state, setState] = useState({ loading: true, users: [], failed: false });
  useSheet(open, onClose, ref);

  useEffect(() => {
    if (!kind) return undefined;
    let alive = true;
    setState({ loading: true, users: [], failed: false });
    userApi.followList(username, kind)
      .then((result) => { if (alive) setState({ loading: false, users: result.users || [], failed: false }); })
      .catch(() => { if (alive) setState({ loading: false, users: [], failed: true }); });
    return () => { alive = false; };
  }, [username, kind]);

  if (!open) return null;
  const title = t(kind === 'followers' ? 'followersLabel' : 'followingLabel');
  return createPortal(
    <div className="filter-sheet__scrim follow-scrim" onClick={onClose} role="presentation">
      <div ref={ref} className="filter-sheet follow-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        <div className="filter-sheet__grab"><div className="more-sheet__handle" aria-hidden="true" /></div>
        <div className="filter-sheet__head">
          <h2 className="filter-sheet__title">{title}</h2>
          <button type="button" className="filter-sheet__close" onClick={onClose} aria-label={t('mcClose')}>
            <X width={20} height={20} aria-hidden="true" />
          </button>
        </div>
        <div className="filter-sheet__body">
          {state.loading && <p className="follow-sheet__note" role="status">{t('communityLoading')}</p>}
          {state.failed && <p className="follow-sheet__note" role="alert">{t('authGenericError')}</p>}
          {!state.loading && !state.failed && state.users.length === 0 && (
            <p className="follow-sheet__note">{t(kind === 'followers' ? 'followersEmpty' : 'followingEmpty')}</p>
          )}
          <ul className="follow-sheet__list">
            {state.users.map((person) => (
              <li key={person.username}>
                <Link to={`/user/${encodeURIComponent(person.username)}`} onClick={onClose}>
                  <span className="user-avatar sm" style={{ '--bloom': person.bloom ?? 12 }} aria-hidden="true">{person.username[0]?.toUpperCase()}</span>
                  <span className="follow-sheet__name" dir="ltr">{person.username}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}
