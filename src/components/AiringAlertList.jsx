import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { mediaHref } from '@/catalog';
import { displayTitle } from '@/home-data';
import { useSiteLang } from '@/i18n';
import { coverUrl } from '@/lib/cover';
import { cn } from 'cn';

// Shared list of today's airing titles: used by the mobile bell sheet and the
// desktop dashboard panel.
export default function AiringAlertList({ alerts, onNavigate }) {
  const { t, lang } = useSiteLang();
  return (
    <ul className="airing-alerts">
      {alerts.items.map((row) => {
        const title = displayTitle(row.item, lang);
        return (
          <li key={row.entry.slug} className={cn('airing-alert', row.seen && 'is-seen')}>
            <Link className="airing-alert__cover" to={mediaHref(row.item, 'anime')} onClick={onNavigate} aria-label={title}>
              {row.item.image ? <img src={coverUrl(row.item.image, 120)} alt="" width="48" height="66" loading="lazy" decoding="async" /> : null}
            </Link>
            <div className="airing-alert__body">
              <Link className="airing-alert__title" to={mediaHref(row.item, 'anime')} onClick={onNavigate}>{title}</Link>
              <span className="airing-alert__ep">
                {row.mark === 'watched'
                  ? t('alertsUpTo', { n: row.progress })
                  : `${t('alertsEpisode', { n: row.nextEpisode })}${row.total ? ` / ${row.total}` : ''}`}
              </span>
            </div>
            {row.seen ? (
              <span className="airing-alert__done">
                {row.mark === 'watched' ? <><Check width={15} height={15} aria-hidden="true" />{t('alertsSeen')}</> : t('alertsPostponed')}
              </span>
            ) : (
              <div className="airing-alert__actions">
                <button type="button" className="airing-alert__primary" onClick={() => alerts.markWatched(row)}>{t('alertsWatched')}</button>
                <button type="button" className="airing-alert__later" onClick={() => alerts.markSeen(row.entry.slug)}>{t('alertsLater')}</button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
