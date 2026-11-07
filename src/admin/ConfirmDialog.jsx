import React, { useEffect, useRef } from 'react';

// Styled replacement for window.confirm: `await confirm(message, { danger, okLabel })` resolves true/false.
// Focus starts on "Cancel" (these prompts are mostly deletions), Tab stays inside the dialog,
// Esc cancels, and focus returns to whatever opened it.
export default function ConfirmDialog({ message, options = {}, t, onAnswer }) {
  const cancelRef = useRef(null);
  const boxRef = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    cancelRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') { onAnswer(false); return; }
      if (event.key !== 'Tab') return;
      const focusable = boxRef.current?.querySelectorAll('button');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); if (opener instanceof HTMLElement && document.contains(opener)) opener.focus(); };
  }, [onAnswer]);
  return (
    <div className="adm-modal-back" onMouseDown={(event) => { if (event.target === event.currentTarget) onAnswer(false); }}>
      <div className={`adm-modal${options.danger ? ' is-danger' : ''}`} ref={boxRef} role="alertdialog" aria-modal="true" aria-describedby="adm-confirm-text">
        <p id="adm-confirm-text">{message}</p>
        <div className="adm-modal-actions">
          <button className="adm-btn" type="button" ref={cancelRef} onClick={() => onAnswer(false)}>{t('confirmCancel')}</button>
          <button className={`adm-btn ${options.danger ? 'adm-danger' : 'adm-primary'}`} type="button" onClick={() => onAnswer(true)}>{options.okLabel || t('confirmOk')}</button>
        </div>
      </div>
    </div>
  );
}
