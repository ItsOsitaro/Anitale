import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSiteLang } from './i18n.js';
import { useCatalog, useMangaCatalog, withMangaImages } from './catalog-context.jsx';
import { mediaHref } from './catalog.js';
import { useUser, userApi } from './user.jsx';
import { Skeleton } from '@/components/ui/skeleton';

export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,24}$/;

// Maps the server's error to a bilingual, user-facing sentence.
const authErrorMessage = (error, t) => {
  if (error?.status === 0) return t('authNetwork');
  if (error?.status === 401) return t('wrongCredentials');
  if (error?.status === 409) return t('usernameTaken');
  if (error?.status === 429) return t('authRateLimit');
  return t('authGenericError');
};

const Avatar = ({ name, bloom, size = 'sm' }) => (
  <span className={`user-avatar ${size}`} style={{ '--bloom': bloom ?? 12 }} aria-hidden="true">
    {String(name || '؟').trim().charAt(0).toUpperCase()}
  </span>
);

const EntryBadge = ({ status, mediaType, t }) => (
  <span className={`entry-status status-${status}`}>
    {status === 'watching' && mediaType === 'manga' ? t('status_reading') : t(`status_${status}`)}
  </span>
);

// Local titles for the entries (catalog-driven; slugs without a match still render).
function useEntryCatalogs() {
  const animeCatalog = useCatalog();
  const mangaCatalog = useMangaCatalog();
  const mangaItems = useMemo(() => withMangaImages(mangaCatalog, animeCatalog), [mangaCatalog, animeCatalog]);
  return {
    animeCatalog,
    animeBySlug: useMemo(() => new Map(animeCatalog.map((item) => [item.slug, item])), [animeCatalog]),
    mangaBySlug: useMemo(() => new Map(mangaItems.map((item) => [item.slug, item])), [mangaItems]),
  };
}

function EntryCard({ entry, item, mediaType, onRemove, onNoteChange, onRatingChange, onProgressChange, t, ariaLabel }) {
  const removable = typeof onRemove === 'function';
  const editableNote = typeof onNoteChange === 'function';
  const editableRating = typeof onRatingChange === 'function';
  const editableProgress = typeof onProgressChange === 'function';
  const [noteDraft, setNoteDraft] = useState(entry.note || '');
  const [ratingDraft, setRatingDraft] = useState(entry.rating ?? '');
  const [progressDraft, setProgressDraft] = useState(entry.progress ?? '');
  useEffect(() => { setNoteDraft(entry.note || ''); }, [entry.note]);
  useEffect(() => { setRatingDraft(entry.rating ?? ''); }, [entry.rating]);
  useEffect(() => { setProgressDraft(entry.progress ?? ''); }, [entry.progress]);
  const commitNote = () => {
    if (noteDraft === (entry.note || '')) return;
    onNoteChange(mediaType, entry.slug, noteDraft);
  };
  const commitRating = () => {
    const value = ratingDraft === '' ? null : Number(ratingDraft);
    if (value === (entry.rating ?? null)) return;
    onRatingChange(mediaType, entry.slug, value);
  };
  // Queue 21: episode/chapter total for the progress bar. Anime reports its
  // episode count inside the information rows; manga has a real column.
  const entryTotal = useMemo(() => {
    if (!item) return null;
    if (mediaType === 'manga') return item.chapters ?? null;
    const info = Array.isArray(item.information) ? item.information : [];
    const parsed = Number(String((info.find((row) => row.label === 'Episodes')?.value || '').replace(/[^\d]/g, '')));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [item, mediaType]);
  const commitProgress = () => {
    const value = progressDraft === '' ? null : Math.max(0, Math.floor(Number(progressDraft)));
    if (value === (entry.progress ?? null)) return;
    if (progressDraft !== '' && !Number.isFinite(Number(progressDraft))) { setProgressDraft(entry.progress ?? ''); return; }
    onProgressChange(mediaType, entry.slug, value);
  };
  return (
    <article className="entry-card">
      {removable && (
        <button className="entry-remove" type="button" onClick={() => onRemove(entry.slug)} aria-label={ariaLabel ?? t('removeFromList')}>×</button>
      )}
      {item?.image
        ? <img src={item.image} alt="" loading="lazy" />
        : <span className="entry-cover-empty" aria-hidden="true">{(entry.slug || '?').slice(0, 2)}</span>}
      <div className="entry-copy">
        {item
          ? <Link className="entry-title" to={mediaHref(item, mediaType)}>{item.title}</Link>
          : <span className="entry-title">{entry.slug}</span>}
        <EntryBadge status={entry.status || 'watching'} mediaType={mediaType} t={t} />
        {entry.rating != null && !editableRating && (
          <span className="entry-rating-chip" aria-label={t('ratingAria')}>{entry.rating}/10</span>
        )}
        {editableRating && (
          <label className="entry-rating">
            <span>{t('ratingLabel')}</span>
            <input
              type="number"
              min="1"
              max="10"
              step="1"
              value={ratingDraft}
              onChange={(event) => setRatingDraft(event.target.value)}
              onBlur={commitRating}
              placeholder="—"
              aria-label={t('ratingAria')}
            />
          </label>
        )}
        {editableProgress && (
          <div className="entry-progress-box">
            <label className="entry-progress">
              <span>{t('progressLabel')}</span>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={progressDraft}
                onChange={(event) => setProgressDraft(event.target.value)}
                onBlur={commitProgress}
                placeholder="—"
                aria-label={t('progressLabel')}
              />
            </label>
            <div className="entry-progress-row" dir="ltr">
              <div
                className="entry-progress-bar"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax={entryTotal ?? -1}
                aria-valuenow={entry.progress ?? 0}
                style={{ '--progress': `${entryTotal ? Math.min(100, Math.round(((entry.progress ?? 0) / entryTotal) * 100)) : (entry.progress != null ? 100 : 0)}%` }}
              />
              <span className="entry-progress-text">
                {entry.progress != null ? (entryTotal ? `${entry.progress}/${entryTotal}` : `${entry.progress}`) : '—'}
              </span>
            </div>
          </div>
        )}
        {editableNote && (
          <textarea
            className="entry-note"
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            onBlur={commitNote}
            placeholder={t('notePlaceholder')}
            rows={2}
            aria-label={t('noteAria')}
          />
        )}
      </div>
    </article>
  );
}

// ---------- Sign in / Sign up ----------

export function AuthPage({ mode = 'login' }) {
  const { t, lang } = useSiteLang();
  const { setMe, refresh } = useUser();
  const navigate = useNavigate();
  const isRegister = mode === 'register';
  const [fields, setFields] = useState({ username: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = `${t(isRegister ? 'authRegister' : 'authLogin')} · ${t('siteName')}`;
  }, [isRegister, t]);

  const submit = async (event) => {
    event.preventDefault();
    const username = fields.username.trim();
    if (isRegister && !USERNAME_PATTERN.test(username)) { setError(t('usernameRule')); return; }
    if (fields.password.length < 6) { setError(t('passwordRule')); return; }
    setSubmitting(true);
    setError('');
    try {
      const { user } = isRegister
        ? await userApi.register({ username, password: fields.password })
        : await userApi.login(username, fields.password);
      setMe(user);
      // Pull the fresh server state (and migrate this browser's guest lists into the account).
      await refresh(true);
      navigate('/dashboard');
    } catch (err) {
      setError(authErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const setField = (name) => (event) => setFields((current) => ({ ...current, [name]: event.target.value }));

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="authHeading">
        <span className="auth-mark" aria-hidden="true">{lang === 'fa' ? 'م' : 'M'}</span>
        <h1 id="authHeading">{t(isRegister ? 'authRegister' : 'authLogin')}</h1>
        <p className="auth-tagline">{t(isRegister ? 'authTaglineRegister' : 'authTaglineLogin')}</p>
        <form onSubmit={submit} noValidate>
          <div className="auth-field">
            <label htmlFor="auth-username">{t('authUsername')}</label>
            <Input id="auth-username" dir="ltr" autoComplete="username" value={fields.username} onChange={setField('username')} />
            {isRegister && <small className="auth-hint">{t('authUsernameHint')}</small>}
          </div>
          <div className="auth-field">
            <label htmlFor="auth-password">{t('authPassword')}</label>
            <Input id="auth-password" dir="ltr" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} value={fields.password} onChange={setField('password')} />
          </div>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <Button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? t('authSubmitting') : t(isRegister ? 'authSubmitRegister' : 'authSubmitLogin')}
          </Button>
        </form>
        <p className="auth-switch">
          {t(isRegister ? 'authSwitchHave' : 'authSwitchNone')}
          {' '}
          <Link to={isRegister ? '/login' : '/register'}>{t(isRegister ? 'authSwitchLogin' : 'authDoRegister')}</Link>
        </p>
      </section>
    </main>
  );
}

// ---------- Dashboard (signed-in view) ----------

export function UserDashboard() {
  const { lang, t } = useSiteLang();
  const user = useUser();
  const { animeBySlug, mangaBySlug } = useEntryCatalogs();
  const [tab, setTab] = useState('anime');
  const [statusFilter, setStatusFilter] = useState('all');
  const [bio, setBio] = useState('');
  const [bioState, setBioState] = useState('idle'); // idle | saving | saved
  const [avatarSaving, setAvatarSaving] = useState(false);

  useEffect(() => {
    document.title = `${t('dashTitle')} · ${t('siteName')}`;
  }, [t]);

  useEffect(() => { if (user.me) setBio(user.me.bio || ''); }, [user.me]);

  // Friends feed refreshes whenever the session or the lists change.
  const [feedItems, setFeedItems] = useState([]);
  useEffect(() => {
    if (!user.me) { setFeedItems([]); return undefined; }
    let alive = true;
    userApi.feed().then((result) => { if (alive) setFeedItems(result.items || []); }).catch(() => { if (alive) setFeedItems([]); });
    return () => { alive = false; };
  }, [user.me, user.entries]);

  if (!user.meLoaded) {
    return (
      <main className="dash-shell" aria-busy="true">
        <Skeleton className="dash-skeleton" />
      </main>
    );
  }
  if (!user.me) return <Navigate to="/login" replace />;

  const { me, entries } = user;
  const tabEntries = entries[tab];
  const ratedTabEntries = tabEntries.filter((entry) => entry.rating != null);
  const tabAvgRating = ratedTabEntries.length
    ? (ratedTabEntries.reduce((sum, entry) => sum + entry.rating, 0) / ratedTabEntries.length).toFixed(1)
    : null;

  // Status filter chips (همه + the five list statuses, each with a count).
  const statusCounts = tabEntries.reduce((acc, entry) => {
    const status = entry.status || 'watching';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, { all: tabEntries.length });
  const listEntries = statusFilter === 'all' ? tabEntries : tabEntries.filter((entry) => (entry.status || 'watching') === statusFilter);
  const statusFilters = ['all', 'watching', 'completed', 'on_hold', 'dropped', 'planned'].filter((key) => key === 'all' || statusCounts[key]);

  // Switching tabs resets the filter (the other tab may not have that status).
  const pickTab = (next) => { setTab(next); setStatusFilter('all'); };

  const saveBio = async () => {
    setBioState('saving');
    try {
      const { user: updated } = await user.saveBio(bio);
      user.setMe((current) => ({ ...current, bio: updated.bio }));
      setBioState('saved');
    } catch {
      setBioState('idle');
    }
  };

  const changeAvatar = async (hue) => {
    if (avatarSaving || me.bloom === hue) return;
    setAvatarSaving(true);
    const previous = me.bloom;
    user.setMe((current) => ({ ...current, bloom: hue }));
    try {
      const { user: updated } = await user.saveAvatar(hue);
      user.setMe((current) => ({ ...current, bloom: updated.bloom }));
    } catch {
      user.setMe((current) => ({ ...current, bloom: previous }));
    } finally {
      setAvatarSaving(false);
    }
  };

  return (
    <main className="dash-shell">
      <section className="dash-hero" style={{ '--bloom': me.bloom ?? 12 }}>
        <Avatar name={me.username} bloom={me.bloom} size="lg" />
        <div className="avatar-picker" role="group" aria-label={t('avatarPickerLabel')}>
          {[8, 342, 276, 208, 168, 96].map((hue) => (
            <button
              key={hue}
              type="button"
              aria-pressed={me.bloom === hue}
              disabled={avatarSaving}
              className={`avatar-swatch${me.bloom === hue ? ' is-active' : ''}`}
              style={{ '--bloom': hue }}
              onClick={() => changeAvatar(hue)}
              aria-label={t('avatarColorOption')}
            />
          ))}
        </div>
        <div className="dash-hero-copy">
          <h1>{t('dashGreeting', { name: me.username })}</h1>
          <p>
            <time dateTime={me.joinedAt}>{t('dashJoined', { date: new Date(me.joinedAt).toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-GB') })}</time>
            {' · '}
            <Link to={`/user/${encodeURIComponent(me.username)}`}>{t('dashViewProfile')}</Link>
          </p>
        </div>
        <Button className="dash-logout" variant="outline" size="sm" type="button" onClick={user.logout}>{t('dashLogout')}</Button>
      </section>

      <div className="dash-stats" role="list">
        <div className="stamp" role="listitem" style={{ '--bloom': me.bloom ?? 12 }}>
          <strong>{entries.anime.length}</strong><span>{t('dashAnimeTab')}</span>
        </div>
        <div className="stamp" role="listitem" style={{ '--bloom': me.bloom ?? 12 }}>
          <strong>{entries.manga.length}</strong><span>{t('dashMangaTab')}</span>
        </div>
        {tabAvgRating && (
          <div className="stamp" role="listitem" style={{ '--bloom': me.bloom ?? 12 }}>
            <strong>{tabAvgRating}</strong><span>{t('dashAvgRating')}</span>
          </div>
        )}
      </div>

      <section className="dash-lists panel" aria-labelledby="dashListsHeading">
        <div className="list-tabs" role="tablist" aria-label={t('dashUserLists')}>
          <button role="tab" aria-selected={tab === 'anime'} className={tab === 'anime' ? 'is-active' : ''} onClick={() => pickTab('anime')}>{t('dashAnimeTab')}</button>
          <button role="tab" aria-selected={tab === 'manga'} className={tab === 'manga' ? 'is-active' : ''} onClick={() => pickTab('manga')}>{t('dashMangaTab')}</button>
          <span className="list-count">{t('total', { n: listEntries.length })}</span>
        </div>
        {tabEntries.length > 0 && (
          <div className="status-filter" role="group" aria-label={t('dashFilterLabel')}>
            {statusFilters.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={statusFilter === key}
                className={`status-filter-chip${statusFilter === key ? ' is-active' : ''}`}
                onClick={() => setStatusFilter(key)}
              >
                {key === 'all' ? t('dashFilterAll') : t(`status_${key}`)}
                <span className="filter-count">{statusCounts[key]}</span>
              </button>
            ))}
          </div>
        )}
        {listEntries.length === 0 ? (
          <div className="empty-list">
            <p>{t('dashEmpty')}</p>
            <p className="media-note">{t('dashEmptyHint')}</p>
          </div>
        ) : (
          <div className="entry-grid">
            {listEntries.map((entry) => {
              const item = (tab === 'anime' ? animeBySlug : mangaBySlug).get(entry.slug);
              return <EntryCard key={entry.slug} entry={entry} item={item} mediaType={tab} onRemove={(slug) => user.toggle(tab, slug)} onNoteChange={(mt, slug, note) => user.setNote(mt, slug, note)} onRatingChange={(mt, slug, rating) => user.setRating(mt, slug, rating)} onProgressChange={(mt, slug, progress) => user.setProgress(mt, slug, progress)} t={t} ariaLabel={item?.title} />;
            })}
          </div>
        )}
      </section>

      <FriendsFeed items={feedItems} />

      <ListMatches />

      <section className="account-card panel" aria-labelledby="accountHeading">
        <h2 id="accountHeading">{t('dashAccount')}</h2>
        <label className="account-label" htmlFor="dash-bio">{t('dashBio')}</label>
        <textarea id="dash-bio" rows={3} dir="auto" maxLength={300} value={bio} onChange={(e) => { setBio(e.target.value); setBioState('idle'); }} />
        <small className="account-hint">{t('dashBioHint')}</small>
        <div className="account-row">
          <Button className="account-save" type="button" disabled={bioState === 'saving'} onClick={saveBio}>
            {bioState === 'saving' ? t('saving') : t('dashSaveBio')}
          </Button>
          {bioState === 'saved' && <span className="saved-note" role="status">{t('dashSaved')}</span>}
        </div>
      </section>
    </main>
  );
}

// ---------- Public profile ----------

// Friends activity feed (queue 15): the newest real list activity of the
// people the visitor follows. Notes stay private; only status / rating shows.
// Queue 23: titles the viewer and the followed users share on their lists.
export function ListMatches() {
  const { lang, t } = useSiteLang();
  const user = useUser();
  const { animeBySlug, mangaBySlug } = useEntryCatalogs();
  const [matches, setMatches] = useState(null);
  useEffect(() => {
    if (!user.me) { setMatches(null); return undefined; }
    let alive = true;
    userApi.commonLists().then((result) => { if (alive) setMatches(result.items || []); }).catch(() => { if (alive) setMatches([]); });
    return () => { alive = false; };
  }, [user.me, user.entries]);
  if (!user.me) return null;

  const statusLabel = (status, mediaType) => (status === 'watching' && mediaType === 'manga' ? t('status_reading') : t(`status_${status}`));
  const titleFor = (match) => ((match.mediaType === 'manga' ? mangaBySlug : animeBySlug).get(match.slug)?.title || match.slug);
  const hrefFor = (match) => (match.mediaType === 'manga' ? `/manga/${match.slug}` : `/anime/${match.slug}`);

  return (
    <section className="friends-feed panel" aria-labelledby="listMatchesHeading">
      <h2 id="listMatchesHeading">{t('listMatchesTitle')}</h2>
      {!matches ? null : matches.length === 0 ? (
        <p className="media-note">{t('listMatchesEmpty')}</p>
      ) : (
        <ul className="feed-list">
          {matches.map((match, index) => (
            <li key={`${match.username}-${match.mediaType}-${match.slug}-${index}`}>
              <span className="feed-avatar user-avatar sm" style={{ '--bloom': match.bloom ?? 12 }} aria-hidden="true">
                {String(match.username).charAt(0).toUpperCase()}
              </span>
              <div className="feed-copy">
                <Link to={`/user/${encodeURIComponent(match.username)}`}>{match.username}</Link>
                <span className="feed-copy-text">
                  {' · '}
                  <Link dir="auto" to={hrefFor(match)}>{titleFor(match)}</Link>
                  {' · '}
                  {statusLabel(match.theirStatus, match.mediaType)}
                  {match.myStatus !== match.theirStatus && (
                    <span> ({t('listMatchesYou')} {statusLabel(match.myStatus, match.mediaType)})</span>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function FriendsFeed({ items }) {
  const { lang, t } = useSiteLang();
  const user = useUser();
  if (!user.me) return null;

  const formatStamp = (value) => new Date(`${value.replace(' ', 'T')}Z`).toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-GB');
  const statusLabel = (status, mediaType) => (status === 'watching' && mediaType === 'manga' ? t('status_reading') : t(`status_${status}`));
  const hrefFor = (item) => (item.mediaType === 'manga' ? `/manga/${item.slug}` : `/anime/${item.slug}`);

  return (
    <section className="friends-feed panel" aria-labelledby="friendsFeedHeading">
      <h2 id="friendsFeedHeading">{t('friendsFeed')}</h2>
      {items.length === 0 ? (
        <p className="media-note">{t('friendsFeedEmpty')}</p>
      ) : (
        <ul className="feed-list">
          {items.map((item, index) => (
            // The same person + slug can appear twice (fresh writes re-stamp
            // updated_at); combined with the timestamp the pair is unique.
            <li key={`${item.username}-${item.slug}-${item.added}-${index}`}>
              <span className="feed-avatar user-avatar sm" style={{ '--bloom': item.bloom ?? 12 }} aria-hidden="true">
                {String(item.username).charAt(0).toUpperCase()}
              </span>
              <div className="feed-copy">
                <Link to={`/user/${encodeURIComponent(item.username)}`}>{item.username}</Link>
                <span className="feed-copy-text">
                  {' · '}
                  <Link dir="auto" to={hrefFor(item)}>{item.title}</Link>
                  {' · '}
                  {statusLabel(item.status, item.mediaType)}
                  {item.rating != null && ` · ${t('feedRating', { rating: item.rating })}`}
                </span>
              </div>
              <time dateTime={item.added} className="feed-stamp" dir="ltr">{formatStamp(item.added)}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function FollowButton({ profile, onChange }) {
  const { t } = useSiteLang();
  const user = useUser();
  const [busy, setBusy] = useState(false);
  const isSelf = user.me && user.me.username.toLowerCase() === profile.username.toLowerCase();
  if (!user.me || isSelf) return null;
  const follow = async () => {
    setBusy(true);
    try {
      if (profile.isFollowing) {
        const next = await userApi.unfollow(profile.username);
        onChange(next.followers, false);
      } else {
        const next = await userApi.follow(profile.username);
        onChange(next.followers, true);
      }
    } catch { /* surfaced via state */ } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      type="button"
      size="sm"
      variant={profile.isFollowing ? 'outline' : 'default'}
      className="follow-button"
      disabled={busy}
      aria-pressed={Boolean(profile.isFollowing)}
      onClick={follow}
    >
      {profile.isFollowing ? t('followingAction') : t('followAction')}
    </Button>
  );
}

export function UserPublicProfile() {
  const { lang, t } = useSiteLang();
  const { username } = useParams();
  const user = useUser();
  const { animeBySlug, mangaBySlug } = useEntryCatalogs();
  const [data, setData] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState('anime');
  // Follow-graph state: null until the profile loads, then a local override
  // { followers, following, isFollowing } after a follow/unfollow action.
  const [followCountsState, setFollowCountsState] = useState(null);

  useEffect(() => {
    setData(null);
    setNotFound(false);
    userApi.publicProfile(username)
      .then((result) => {
        setData(result);
        document.title = `${t('profileOf')} ${result.user.username} · ${t('siteName')}`;
      })
      .catch((error) => { if (error.status === 404) setNotFound(true); });
  }, [username, t]);

  if (notFound) {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="profileMissingHeading">
          <h1 id="profileMissingHeading">{t('userNotFound')}</h1>
          <p className="auth-switch"><Link to="/">{t('backHome')}</Link></p>
        </section>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="profile-shell" aria-busy="true"><Skeleton className="dash-skeleton" /></main>
    );
  }

  const { user: profile, entries } = data;
  const isOwner = user.me && user.me.username.toLowerCase() === profile.username.toLowerCase();
  const listEntries = entries[tab];
  const followCounts = followCountsState ?? { followers: data.followers ?? 0, following: data.following ?? 0, isFollowing: Boolean(data.isFollowing) };
  const allRated = [...entries.anime, ...entries.manga].filter((entry) => entry.rating != null);
  const profileAvgRating = allRated.length
    ? (allRated.reduce((sum, entry) => sum + entry.rating, 0) / allRated.length).toFixed(1)
    : null;

  const resolve = (entry) => (tab === 'anime' ? animeBySlug : mangaBySlug).get(entry.slug);

  return (
    <main className="profile-shell">
      <section className="profile-banner" style={{ '--bloom': profile.bloom ?? 12 }}>
        {isOwner && <Link className="own-chip" to="/dashboard">{t('ownProfile')}</Link>}
        <div className="profile-id">
          <Avatar name={profile.username} bloom={profile.bloom} size="lg" />
          <div className="profile-id-copy">
            <h1>{profile.username}</h1>
            <p>
              <time dateTime={profile.joinedAt}>{t('dashJoined', { date: new Date(profile.joinedAt).toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-GB') })}</time>
            </p>
            <p className="profile-follow-counts">
              <span><strong>{followCounts.followers}</strong> {t('followersLabel')}</span>
              <span><strong>{followCounts.following}</strong> {t('followingLabel')}</span>
            </p>
          </div>
          <FollowButton
            profile={{ ...profile, isFollowing: followCounts.isFollowing }}
            onChange={(followTotal, nextFlag) => {
              setFollowCountsState({ followers: followTotal, following: followCounts.following, isFollowing: nextFlag });
            }}
          />
        </div>
        {profile.bio && <p className="profile-bio">{profile.bio}</p>}
      </section>

      <div className="dash-stats" role="list">
        <div className="stamp" role="listitem" style={{ '--bloom': profile.bloom ?? 12 }}>
          <strong>{entries.anime.length}</strong><span>{t('dashAnimeTab')}</span>
        </div>
        <div className="stamp" role="listitem" style={{ '--bloom': profile.bloom ?? 12 }}>
          <strong>{entries.manga.length}</strong><span>{t('dashMangaTab')}</span>
        </div>
        {profileAvgRating && (
          <div className="stamp" role="listitem" style={{ '--bloom': profile.bloom ?? 12 }}>
            <strong>{profileAvgRating}</strong><span>{t('dashAvgRating')}</span>
          </div>
        )}
      </div>

      {listEntries.length > 0 && (
        <section className="dash-lists panel" aria-label={t('profileLists')}>
          <div className="list-tabs" role="tablist" aria-label={t('profileLists')}>
            <button role="tab" aria-selected={tab === 'anime'} className={tab === 'anime' ? 'is-active' : ''} onClick={() => setTab('anime')}>{t('dashAnimeTab')}</button>
            <button role="tab" aria-selected={tab === 'manga'} className={tab === 'manga' ? 'is-active' : ''} onClick={() => setTab('manga')}>{t('dashMangaTab')}</button>
            <span className="list-count">{t('total', { n: listEntries.length })}</span>
          </div>
          <div className="entry-grid">
            {listEntries.map((entry) => <EntryCard key={entry.slug} entry={entry} item={resolve(entry)} mediaType={tab} t={t} ariaLabel={resolve(entry)?.title} />)}
          </div>
        </section>
      )}
    </main>
  );
}
