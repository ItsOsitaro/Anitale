import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useSiteLang } from '@/i18n';
import { useUser, userApi } from '@/user.jsx';

const synopsisFa = (item) => (item.synopsis && typeof item.synopsis === 'object' ? item.synopsis.fa || '' : '');

function Dialog({ item, mediaType, onClose }) {
  const { t } = useSiteLang();
  const [kind, setKind] = useState('synopsis');
  const [text, setText] = useState(synopsisFa(item));
  const [remove, setRemove] = useState([]);
  const [addRaw, setAddRaw] = useState('');
  const [state, setState] = useState({ status: 'idle', msg: '' });
  const firstRef = useRef(null);
  useEffect(() => {
    firstRef.current?.focus();
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [onClose]);
  const pick = (next) => {
    setKind(next);
    setText(next === 'synopsis' ? synopsisFa(item) : next === 'title' ? (item.titleFa || '') : '');
    setState({ status: 'idle', msg: '' });
  };
  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'busy', msg: '' });
    const body = { mediaType, slug: item.slug, kind };
    if (kind === 'genres') { body.add = addRaw.split(/[,،]/).map((g) => g.trim()).filter(Boolean); body.remove = remove; } else body.text = text;
    try { await userApi.suggest(body); setState({ status: 'done', msg: '' }); } catch (err) {
      setState({ status: 'error', msg: err.status === 429 ? t('sugLimit') : err.status === 409 ? t('sugDuplicate') : t('sugError') });
    }
  };
  return createPortal(
    <div className="sug-backdrop" onClick={onClose}>
      <div className="sug-dialog" role="dialog" aria-modal="true" aria-label={t('sugButton')} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="sug-close" onClick={onClose} aria-label={t('mediaClose')}>×</button>
        <h2>{t('sugButton')}</h2>
        <p className="sug-title" dir="auto">{item.title}</p>
        {state.status === 'done' ? (
          <div>
            <p role="status">{t('sugThanks')}</p>
            <Link to="/suggestions" className="stack-btn" onClick={onClose}>{t('sugMine')}</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="sug-form">
            <label>{t('sugKind')}
              <select ref={firstRef} value={kind} onChange={(e) => pick(e.target.value)} id="sug-kind">
                <option value="synopsis">{t('sugKindSynopsis')}</option>
                <option value="title">{t('sugKindTitle')}</option>
                <option value="genres">{t('sugKindGenres')}</option>
                <option value="report">{t('sugKindReport')}</option>
              </select>
            </label>
            {kind === 'title' && <label>{t('sugNewTitle')}<input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} required minLength={2} dir="auto" id="sug-text" /></label>}
            {(kind === 'synopsis' || kind === 'report') && (
              <label>{kind === 'synopsis' ? t('sugNewSynopsis') : t('sugReportText')}
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={kind === 'synopsis' ? 8 : 4} maxLength={kind === 'synopsis' ? 5000 : 1000} required minLength={kind === 'synopsis' ? 20 : 10} dir="auto" id="sug-text" />
              </label>
            )}
            {kind === 'genres' && (
              <>
                <fieldset className="sug-genres">
                  <legend>{t('sugRemoveGenres')}</legend>
                  {(item.genres || []).map((g) => (
                    <label key={g} className="stack-check"><input type="checkbox" checked={remove.includes(g)} onChange={(e) => setRemove(e.target.checked ? [...remove, g] : remove.filter((x) => x !== g))} /> {g}</label>
                  ))}
                </fieldset>
                <label>{t('sugAddGenres')}<input value={addRaw} onChange={(e) => setAddRaw(e.target.value)} placeholder="Comedy, Drama" dir="ltr" id="sug-add" /></label>
              </>
            )}
            {state.msg && <p role="alert" className="sug-error">{state.msg}</p>}
            <button type="submit" className="stack-btn" disabled={state.status === 'busy'} id="sug-send">{t('sugSend')}</button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default function SuggestEdit({ item, mediaType }) {
  const { t } = useSiteLang();
  const user = useUser();
  const [open, setOpen] = useState(false);
  if (!user.me) return <Link to="/login" className="sug-open">{t('sugLogin')}</Link>;
  return (
    <>
      <button type="button" className="sug-open" onClick={() => setOpen(true)} id="sug-open">{t('sugButton')}</button>
      {open && <Dialog item={item} mediaType={mediaType} onClose={() => setOpen(false)} />}
    </>
  );
}
