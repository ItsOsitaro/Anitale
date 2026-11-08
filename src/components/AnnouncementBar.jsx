import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

// Site notice set by the owner (admin → Site notice). Visitors can close it; it comes back for a new notice.
export default function AnnouncementBar() {
  const { pathname } = useLocation();
  const [note, setNote] = useState(null);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    fetch('/api/announcement').then((res) => (res.ok ? res.json() : null)).then((data) => {
      if (!data?.text) return;
      let seen = '';
      try { seen = sessionStorage.getItem('anitale.notice') || ''; } catch { /* private mode */ }
      setNote(data);
      setClosed(seen === `${data.until}|${data.text}`);
    }).catch(() => {});
  }, []);
  if (!note || closed || pathname.startsWith('/admin')) return null;
  const close = () => {
    try { sessionStorage.setItem('anitale.notice', `${note.until}|${note.text}`); } catch { /* ignore */ }
    setClosed(true);
  };
  return (
    <div className={`site-notice is-${note.level}`} role="status">
      <span dir="auto">{note.text}</span>
      <button type="button" onClick={close} aria-label="×">×</button>
    </div>
  );
}
