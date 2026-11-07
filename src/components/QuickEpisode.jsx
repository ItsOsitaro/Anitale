import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useSiteLang } from '@/i18n';
import { useUser } from '@/user.jsx';
import { formatNumber } from '@/lib/digits.js';
import { entryTotal } from '@/components/mobile/entry-utils';

// One-tap "+1 episode" for a title the viewer is currently watching / reading.
// Reaching the last episode marks the entry completed.
export function QuickEpisode({ mediaType = 'anime', item, compact = false, className = '' }) {
  const { t, lang } = useSiteLang();
  const user = useUser();
  const [busy, setBusy] = useState(false);
  const entry = user.entries[mediaType].find((e) => e.slug === item.slug);
  if (!entry || (entry.status || 'watching') !== 'watching') return null;
  const total = entryTotal(item, mediaType);
  const done = entry.progress ?? 0;
  if (total && done >= total) return null;
  const next = done + 1;
  const bump = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await user.setProgress(mediaType, item.slug, next);
      if (total && next >= total) await user.setStatus(mediaType, item.slug, 'completed');
    } finally { setBusy(false); }
  };
  const label = t(mediaType === 'manga' ? 'quickPlusChapter' : 'quickPlusEpisode');
  return (
    <button type="button" className={`quick-ep${compact ? ' is-compact' : ''} ${className}`} onClick={bump} disabled={busy} aria-label={`${label} (${formatNumber(done, lang)} → ${formatNumber(next, lang)})`}>
      {compact && <Plus width={18} height={18} aria-hidden="true" />}
      <span>{compact ? '+۱' : label}</span>
    </button>
  );
}
