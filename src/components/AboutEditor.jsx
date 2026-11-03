import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSiteLang } from '@/i18n';
import { useUser, userApi } from '@/user.jsx';
import { AboutRich } from '@/lib/safe-markup.jsx';

const MAX = 2000;

// Editor for the long "about me" text: toolbar buttons, live preview, explicit save.
export default function AboutEditor() {
  const { t } = useSiteLang();
  const user = useUser();
  const ref = useRef(null);
  const [text, setText] = useState('');
  const [state, setState] = useState('idle'); // idle | saving | saved | error
  useEffect(() => { setText(user.me?.about || ''); }, [user.me?.about]);

  const wrap = (before, after = before, placeholder = '') => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const chosen = text.slice(start, end) || placeholder;
    const next = `${text.slice(0, start)}${before}${chosen}${after}${text.slice(end)}`;
    if (next.length > MAX) return;
    setText(next); setState('idle');
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + before.length, start + before.length + chosen.length); });
  };
  const linePrefix = (prefix) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const next = `${text.slice(0, lineStart)}${prefix}${text.slice(lineStart)}`;
    if (next.length > MAX) return;
    setText(next); setState('idle');
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + prefix.length, start + prefix.length); });
  };

  const save = async () => {
    setState('saving');
    try {
      const { user: updated } = await userApi.updateAbout(text);
      user.setMe((current) => ({ ...current, about: updated.about }));
      setState('saved');
    } catch { setState('error'); }
  };

  return (
    <div className="about-editor">
      <label className="account-label" htmlFor="about-text">{t('aboutLabel')}</label>
      <div className="about-editor__bar" role="toolbar" aria-label={t('aboutToolbar')}>
        <button type="button" onClick={() => wrap('**', '**', t('aboutBold'))}><strong>B</strong></button>
        <button type="button" onClick={() => wrap('*', '*', t('aboutItalic'))}><em>I</em></button>
        <button type="button" onClick={() => wrap('[', '](https://)', t('aboutLinkText'))}>{t('aboutLink')}</button>
        <button type="button" onClick={() => linePrefix('## ')}>{t('aboutHeading')}</button>
        <button type="button" onClick={() => linePrefix('- ')}>{t('aboutList')}</button>
        <button type="button" onClick={() => wrap('||', '||', t('aboutSpoilerText'))}>{t('aboutSpoiler')}</button>
      </div>
      <textarea id="about-text" ref={ref} rows={7} dir="auto" maxLength={MAX} value={text} onChange={(event) => { setText(event.target.value); setState('idle'); }} />
      <small className="account-hint" dir="ltr">{text.length}/{MAX}</small>
      <small className="account-hint">{t('aboutHelp')}</small>
      {text.trim() && (
        <div className="about-editor__preview">
          <span className="account-label">{t('aboutPreview')}</span>
          <AboutRich text={text} />
        </div>
      )}
      <div className="account-row">
        <Button className="account-save" type="button" disabled={state === 'saving'} onClick={save}>{state === 'saving' ? t('saving') : t('aboutSave')}</Button>
        {state === 'saved' && <span className="saved-note" role="status">{t('dashSaved')}</span>}
        {state === 'error' && <span className="auth-error" role="alert">{t('authGenericError')}</span>}
      </div>
    </div>
  );
}
