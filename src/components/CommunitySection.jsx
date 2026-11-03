import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSiteLang } from '@/i18n';
import { useUser, userApi } from '@/user.jsx';

const MIN_LENGTH = 10;
const MAX_LENGTH = 2000;

const STATUS_ORDER = ['completed', 'watching', 'on_hold', 'planned', 'dropped'];

// A2: how many members have this title, split by list status.
function StatusCounts({ stats, mediaType }) {
  const { t } = useSiteLang();
  if (!stats.listed) return null;
  const counts = stats.statuses || {};
  return (
    <div className="community-statuses">
      <p className="community-statuses__total">{t('communityListed', { n: stats.listed })}</p>
      <ul aria-label={t('communityStatusAria')}>
        {STATUS_ORDER.filter((status) => counts[status]).map((status) => (
          <li key={status}>
            <span className={`pi-dot status-${status}`} aria-hidden="true" />
            {status === 'watching' && mediaType === 'manga' ? t('status_reading') : t(`status_${status}`)} <strong dir="ltr">{counts[status]}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScoreSummary({ stats }) {
  const { t } = useSiteLang();
  const peak = Math.max(1, ...stats.histogram);
  return (
    <div className="community-score">
      <div className="community-score__main">
        <strong dir="ltr" className="community-score__value">{stats.average != null ? stats.average.toFixed(1) : '—'}</strong>
        <span className="community-score__meta">
          {stats.count > 0 ? t('communityRatings', { n: stats.count }) : t('communityNoRatings')}
        </span>
      </div>
      <ol className="community-bars" dir="ltr" aria-label={t('communityHistogram')}>
        {stats.histogram.map((n, index) => (
          <li key={index} title={`${index + 1}: ${n}`}>
            <span className="community-bars__fill" style={{ height: `${Math.max(n ? 8 : 2, (n / peak) * 100)}%` }} />
            <small>{index + 1}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MyRating({ mediaType, slug, onRated }) {
  const { t } = useSiteLang();
  const user = useUser();
  const entry = (user.entries?.[mediaType] || []).find((e) => e.slug === slug);
  const [busy, setBusy] = useState(false);
  if (!user.me) return <p className="community-hint"><Link to="/login">{t('communityLoginToRate')}</Link></p>;

  const pick = async (n) => {
    setBusy(true);
    try {
      if (!entry) await user.toggle(mediaType, slug); // rating lives on the list entry
      await user.setRating(mediaType, slug, entry?.rating === n ? null : n);
    } finally { setBusy(false); }
    onRated();
  };

  return (
    <div className="community-myrating">
      <span id={`myrating-${slug}`}>{t('communityYourRating')}</span>
      <div className="community-myrating__chips" role="radiogroup" aria-labelledby={`myrating-${slug}`}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={entry?.rating === n}
            className={`community-chip${entry?.rating === n ? ' is-active' : ''}`}
            disabled={busy}
            onClick={() => pick(n)}
          >{n}</button>
        ))}
      </div>
    </div>
  );
}

function ReviewForm({ mediaType, slug, onSaved }) {
  const { t } = useSiteLang();
  const [body, setBody] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [state, setState] = useState({ busy: false, error: '' });

  const submit = async (event) => {
    event.preventDefault();
    if (body.trim().length < MIN_LENGTH) { setState({ busy: false, error: t('reviewTooShort', { n: MIN_LENGTH }) }); return; }
    setState({ busy: true, error: '' });
    try {
      await userApi.saveReview(mediaType, slug, body.trim(), spoiler);
      onSaved();
    } catch (err) {
      setState({ busy: false, error: err?.status === 429 ? t('authRateLimit') : err?.status === 409 ? t('reviewAlready') : t('authGenericError') });
    }
  };

  return (
    <form className="community-form" onSubmit={submit} noValidate>
      <label htmlFor={`review-${slug}`}>{t('reviewWriteLabel')}</label>
      <textarea
        id={`review-${slug}`}
        dir="auto"
        rows={4}
        maxLength={MAX_LENGTH}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={t('reviewPlaceholder')}
      />
      <div className="community-form__row">
        <label className="community-check">
          <input type="checkbox" checked={spoiler} onChange={(event) => setSpoiler(event.target.checked)} />
          <span>{t('reviewSpoilerLabel')}</span>
        </label>
        <small className="community-count" dir="ltr">{body.length}/{MAX_LENGTH}</small>
      </div>
      <small className="community-hint">{t('reviewFinalNote')}</small>
      {state.error && <p className="auth-error" role="alert">{state.error}</p>}
      <div className="community-form__actions">
        <Button type="submit" size="sm" disabled={state.busy}>{t('reviewPublish')}</Button>
      </div>
    </form>
  );
}

function HelpfulButton({ review, signedIn }) {
  const { t } = useSiteLang();
  const [state, setState] = useState({ helpful: review.helpful || 0, voted: Boolean(review.voted), busy: false });
  useEffect(() => { setState({ helpful: review.helpful || 0, voted: Boolean(review.voted), busy: false }); }, [review.helpful, review.voted]);
  const canVote = signedIn && !review.mine;
  const toggle = async () => {
    if (!canVote || state.busy) return;
    setState((cur) => ({ ...cur, busy: true }));
    try {
      const result = await userApi.setHelpful(review.id, !state.voted);
      setState({ helpful: result.helpful, voted: result.voted, busy: false });
    } catch { setState((cur) => ({ ...cur, busy: false })); }
  };
  if (!canVote && !state.helpful) return null;
  return (
    <button type="button" className={`community-helpful${state.voted ? ' is-active' : ''}`} aria-pressed={state.voted} disabled={!canVote || state.busy} onClick={toggle}>
      {t('reviewHelpful')} <strong dir="ltr">{state.helpful}</strong>
    </button>
  );
}

function ReviewItem({ review, signedIn }) {
  const { t, lang } = useSiteLang();
  const [shown, setShown] = useState(!review.spoiler);
  const date = new Date(review.createdAt).toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  return (
    <li className="community-review">
      <header>
        <span className="user-avatar sm" style={{ '--bloom': review.bloom ?? 12 }} aria-hidden="true">{review.username[0]?.toUpperCase()}</span>
        <Link to={`/user/${encodeURIComponent(review.username)}`} className="community-review__name">{review.username}</Link>
        {review.rating != null && <span className="community-review__score" dir="ltr">{review.rating}/10</span>}
        <time dateTime={review.createdAt}>{date}</time>
      </header>
      {shown ? (
        <p dir="auto">{review.body}</p>
      ) : (
        <button type="button" className="community-spoiler" onClick={() => setShown(true)}>{t('reviewSpoilerShow')}</button>
      )}
      <HelpfulButton review={review} signedIn={signedIn} />
    </li>
  );
}

// Community score + reviews for one title. Shared by the desktop and mobile detail pages.
export default function CommunitySection({ mediaType, slug }) {
  const { t } = useSiteLang();
  const user = useUser();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('new');
  const me = user.me?.username || null;

  const load = useCallback(async (targetPage = 1) => {
    try {
      const result = await userApi.community(mediaType, slug, targetPage, sort);
      setData((current) => (targetPage > 1 && current
        ? { ...result, reviews: [...current.reviews, ...result.reviews] }
        : result));
      setPage(targetPage);
      setFailed(false);
    } catch { setFailed(true); }
  }, [mediaType, slug, sort]);

  useEffect(() => { load(1); }, [load, me]);

  if (failed && !data) return <p className="community-hint">{t('communityLoadFailed')}</p>;
  if (!data) return <p className="community-hint" role="status">{t('communityLoading')}</p>;

  const mine = data.reviews.find((review) => review.mine) || null;
  const others = data.reviews.filter((review) => !review.mine);
  const refreshAfterSave = () => load(1);

  return (
    <div className="community">
      <ScoreSummary stats={data.stats} />
      <StatusCounts stats={data.stats} mediaType={mediaType} />
      <MyRating mediaType={mediaType} slug={slug} onRated={() => load(1)} />

      {user.me && !mine && <ReviewForm mediaType={mediaType} slug={slug} onSaved={refreshAfterSave} />}
      {!user.me && <p className="community-hint"><Link to="/login">{t('communityLoginToReview')}</Link></p>}

      {mine && (
        <div className="community-mine">
          <h3>{t('reviewYours')}</h3>
          <ul className="community-reviews"><ReviewItem review={mine} signedIn /></ul>
        </div>
      )}

      <div className="community-reviews-bar">
        <h3 className="community-reviews-head">{t('reviewsCount', { n: data.total })}</h3>
        {data.total > 1 && (
          <label className="community-sort">
            <span>{t('reviewSort')}</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="new">{t('reviewSortNew')}</option>
              <option value="helpful">{t('reviewSortHelpful')}</option>
              <option value="high">{t('reviewSortHigh')}</option>
              <option value="low">{t('reviewSortLow')}</option>
            </select>
          </label>
        )}
      </div>
      {others.length === 0 ? (
        <p className="community-hint">{t('reviewsEmpty')}</p>
      ) : (
        <ul className="community-reviews">{others.map((review) => <ReviewItem key={review.id} review={review} signedIn={Boolean(user.me)} />)}</ul>
      )}
      {data.reviews.length < data.total && (
        <Button type="button" variant="outline" size="sm" onClick={() => load(page + 1)}>{t('reviewsMore')}</Button>
      )}
    </div>
  );
}
