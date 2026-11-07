// Row "more" menus live inside a scrolling table wrapper, which would clip them. On open, pin the menu to the viewport instead.
export function placeMenu(event) {
  const details = event.currentTarget;
  const menu = details.querySelector('.adm-more-menu');
  if (!menu) return;
  if (!details.open) { menu.style.cssText = ''; return; }
  const rect = details.getBoundingClientRect();
  const rtl = getComputedStyle(details).direction === 'rtl';
  menu.style.position = 'fixed';
  menu.style.insetInlineEnd = 'auto';
  menu.style.insetBlockStart = 'auto';
  const h = menu.offsetHeight;
  const w = menu.offsetWidth;
  const top = rect.bottom + 4 + h > window.innerHeight ? Math.max(4, rect.top - h - 4) : rect.bottom + 4;
  const left = rtl ? rect.left : rect.right - w;
  menu.style.top = `${top}px`;
  menu.style.left = `${Math.max(4, Math.min(left, window.innerWidth - w - 4))}px`;
  const close = () => { details.open = false; window.removeEventListener('scroll', close, true); };
  window.addEventListener('scroll', close, true);
}
