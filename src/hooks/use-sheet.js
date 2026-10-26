import { useEffect } from 'react';

const FOCUSABLE = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]';

// Shared modal behaviour for bottom sheets: Escape closes, Tab stays inside,
// the page behind does not scroll, and focus returns to the trigger on close.
export function useSheet(open, onClose, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const nodes = Array.from(ref.current.querySelectorAll(FOCUSABLE));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prev?.focus?.();
    };
  }, [open, onClose, ref]);
}
