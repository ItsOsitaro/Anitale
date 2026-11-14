import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { mediaHref } from '@/catalog';
import { useCatalog, useEnsureTitles, useMangaCatalog, withMangaImages } from '@/catalog-context';
import { displayTitle } from '@/home-data';
import { useSiteLang } from '@/i18n';
import { coverUrl } from '@/lib/cover';
import { cn } from 'cn';

const timeAgo = (iso, lang) => {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(lang === 'fa' ? 'fa' : 'en', { numeric: 'auto' });
  if (seconds < 3600) return formatter.format(-Math.max(1, Math.round(seconds / 60)), 'minute');
  if (seconds < 86400) return formatter.format(-Math.round(seconds / 3600), 'hour');
  return formatter.format(-Math.round(seconds / 86400), 'day');
};

// Server notifications: followers, reviews by people you follow, "helpful" votes, results of your reports and edit
// suggestions, new titles in genres you like and sequels that started airing. Same-kind events within a day arrive
// already merged (row.count / row.actors). Shared by the bell sheet and the /notifications page.
export default function NotificationList({ items, onNavigate }) {
  const { t, lang } = useSiteLang();
  const anime = useCatalog();
  const manga = useMangaCatalog();
  useEnsureTitles('anime', items.filter((row) => row.slug && row.mediaType === 'anime').map((row) => row.slug));
  useEnsureTitles('manga', items.filter((row) => row.slug && row.mediaType === 'manga').map((row) => row.slug));
  const bySlug = useMemo(() => ({
    anime: new Map((anime || []).map((item) => [item.slug, item])),
    manga: new Map(withMangaImages(manga || [], anime || []).map((item) => [item.slug, item])),
  }), [anime, manga]);

  // "Ali", "Ali and Sara", "Ali and 3 others".
  const whoOf = (row) => {
    const names = (row.actors || []).map((a) => a.username);
    if (!names.length) return '';
    if (row.count <= 1) return names[0];
    if (row.count === 2 && names.length === 2) return t('notifAnd', { a: names[0], b: names[1] });
    return t('notifAndMore', { a: names[0], n: row.count - 1 });
  };

  const textOf = (row, title) => {
    const name = row.actor?.username;
    const who = whoOf(row);
    switch (row.kind) {
      case 'report_result':
        return t(row.report?.status === 'dismissed' ? 'notifReportDismissed' : 'notifReportDone', { note: row.report?.note ? ` ${row.report.note}` : '' });
      case 'suggestion_result':
        return row.suggestion?.status === 'rejected'
          ? t('notifSuggestionRejected', { title, reason: row.suggestion.reason ? ` ${row.suggestion.reason}` : '' })
          : t('notifSuggestionApproved', { title });
      case 'follow': return row.count > 1 ? t('notifFollowMany', { who }) : t('notifFollow', { name });
      case 'friend_review': return t('notifReview', { name, title });
      case 'review_helpful': return t('notifReviewHelpful', { who, title });
      case 'rec_helpful': return t('notifRecHelpful', { who, title });
      case 'sequel_airing': return t('notifSequel', { title, from: row.from?.title || '' });
      default: return title;
    }
  };

  return (
    <ul className="notif-list">
      {items.map((row) => {
        const item = row.slug ? bySlug[row.mediaType]?.get(row.slug) : null;
        const title = item ? displayTitle(item, lang) : row.slug;
        const name = row.actor?.username;
        const profile = name ? `/user/${encodeURIComponent(name)}` : null;
        const href = row.kind === 'follow' ? profile : (item ? mediaHref(item, row.mediaType) : (row.slug ? `/${row.mediaType}/${row.slug}` : null));
        const visual = row.kind === 'follow'
          ? <span className="user-avatar sm" style={{ '--bloom': row.actor?.bloom ?? 12 }} aria-hidden="true">{name?.[0]?.toUpperCase()}</span>
          : item?.image ? <img src={coverUrl(item.image, 120)} alt="" width="40" height="56" loading="lazy" decoding="async" /> : <span className="notif__blank" aria-hidden="true" />;
        const body = (
          <>
            <span className="notif__visual">{visual}</span>
            <span className="notif__copy">
              <span className="notif__text" dir="auto">{textOf(row, title)}</span>
              <time className="notif__time" dateTime={row.createdAt}>{timeAgo(row.createdAt, lang)}</time>
            </span>
            {!row.read && <span className="notif__dot" aria-label={t('notifNew')} />}
          </>
        );
        return (
          <li key={row.id} className={cn('notif', !row.read && 'is-new')}>
            {href ? <Link to={href} onClick={onNavigate}>{body}</Link> : <div>{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}
