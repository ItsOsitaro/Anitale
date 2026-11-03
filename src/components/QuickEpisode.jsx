import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useSiteLang } from '@/i18n';
import { useUser } from '@/user.jsx';
import { useCatalog } from '@/catalog-context.jsx';
import { mediaHref } from '@/catalog.js';
import { coverUrl } from '@/lib/cover';
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
      <Plus width={compact ? 18 : 16} height={compact ? 18 : 16} aria-hidden="true" />
      <span>{compact ? '+۱' : label}</span>
    </button>
  );
}

// Home shelf: the viewer's anime in progress, each with a +1 button.
export function ContinueWatching() {
  const { t, lang } = useSiteLang();
  const user = useUser();
  const catalog = useCatalog();
  const rows = user.entries.anime
    .filter((e) => (e.status || 'watching') === 'watching')
    .map((e) => ({ entry: e, item: catalog.find((c) => c.slug === e.slug) }))
    .filter((r) => r.item)
    .filter((r) => { const total = entryTotal(r.item, 'anime'); return !total || (r.entry.progress ?? 0) < total; })
    .slice(0, 4);
  if (!rows.length) return null;
  return (
    <section className="continue-watching" aria-label={t('continueWatching')}>
      <h2>{t('continueWatching')}</h2>
      <ul>
        {rows.map(({ entry, item }) => {
          const total = entryTotal(item, 'anime');
          return (
            <li key={item.slug}>
              <Link to={mediaHref(item)} className="continue-watching__cover"><img src={coverUrl(item.image, 160)} alt="" loading="lazy" /></Link>
              <div className="continue-watching__info">
                <Link to={mediaHref(item)}>{item.title}</Link>
                <small dir="ltr">{formatNumber(entry.progress ?? 0, lang)}{total ? ` / ${formatNumber(total, lang)}` : ''}</small>
              </div>
              <QuickEpisode mediaType="anime" item={item} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
