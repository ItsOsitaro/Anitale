import { Link } from 'react-router-dom';
import { L, useSiteLang } from '@/i18n';
import { mediaHref } from '@/catalog';
import { displayTitle, selectCurrentSeasonPicks } from '@/home-data';
import HeroCarousel from './HeroCarousel';
import IntroStrip from '@/components/IntroStrip';
import OnboardingPicker from '@/components/OnboardingPicker';
import CommunityPicks from '@/components/CommunityPicks';
import QuickChips from './QuickChips';
import SectionHeader from './SectionHeader';
import Rail from './Rail';
import PosterCard from './PosterCard';
import RankRow from './RankRow';
import { coverUrl } from '@/lib/cover';
import { genreLabel } from '@/lib/genre-kinds';

function WideCard({ item }) {
  const { lang, t } = useSiteLang();
  const title = displayTitle(item, lang);
  const href = mediaHref(item, 'anime');
  return (
    <article className="mobile-wide-card">
      <Link className="mobile-wide-card__link" to={href} aria-label={title}>
        <img className="mobile-wide-card__image" src={coverUrl(item.image, 240)} alt={title} loading="lazy" decoding="async" width="130" height="195" />
      </Link>
      <div className="mobile-wide-card__body">
        <Link className="mobile-wide-card__title" to={href}>{title}</Link>
        <div className="mobile-wide-card__meta" aria-hidden="true">{t('homeEditorialMeta')}</div>
      </div>
    </article>
  );
}

export default function MobileHomePage({ picks, lang, t }) {
  const animeCatalog = picks?.animeCatalog || picks?.topAnime?.concat(picks?.trendingAnime || []) || [];
  // Better approach - we need the full catalog; but picks structure is passed from App.jsx
  // Try to get from picks if available
  let heroItems = [];
  try {
    // If animeCatalog is passed separately in some form, try to use it
    if (picks?.animeCatalog) {
      heroItems = selectCurrentSeasonPicks({ animeCatalog: picks.animeCatalog });
    } else {
      // Fallback: try to construct from all anime in picks
      const allAnime = [
        ...(picks.topAnime || []),
        ...(picks.trendingAnime || []),
        ...(picks.currentSeason || []),
        ...(picks.airingAnime || []),
      ];
      // Remove duplicates
      const unique = [];
      const seen = new Set();
      for (const item of allAnime) {
        if (!seen.has(item.slug)) {
          unique.push(item);
          seen.add(item.slug);
        }
      }
      heroItems = selectCurrentSeasonPicks({ animeCatalog: unique });
    }
  } catch (e) {
    heroItems = [];
  }

  return (
    <div className="mobile-home">
      {heroItems && heroItems.length > 0 && <HeroCarousel items={heroItems} />}
      <IntroStrip />
      <OnboardingPicker />
      <QuickChips />
      {picks.continueSeries?.length > 0 && (
        <>
          <SectionHeader title={t('continueSeries')} />
          <p className="for-you-why">{t('continueSeriesWhy')}</p>
          <Rail>
            {picks.continueSeries.map((item) => (
              <PosterCard key={item.slug} item={item} mediaType="anime" />
            ))}
          </Rail>
        </>
      )}
      {picks.forYou?.items.length > 0 && (
        <>
          <SectionHeader title={t('forYou')} />
          <p className="for-you-why">{t('forYouWhy', { genres: picks.forYou.genres.map((g) => genreLabel(g, lang)).join(lang === 'fa' ? '، ' : ', ') })}</p>
          <Rail>
            {picks.forYou.items.map((item) => (
              <PosterCard key={item.slug} item={item} mediaType="anime" />
            ))}
          </Rail>
        </>
      )}
      <SectionHeader title={t('homeSeason')} to="/seasonal" />
      <Rail>
        {picks.currentSeason.map((item) => (
          <PosterCard key={item.slug} item={item} mediaType="anime" />
        ))}
      </Rail>
      <SectionHeader title={t('topAnime')} to="/top/anime" />
      <div className="mobile-rank-list">
        {picks.topAnime.slice(0, 5).map((item, index) => (
          <RankRow key={item.slug} item={item} rank={index + 1} mediaType="anime" />
        ))}
      </div>
      <SectionHeader title={t('trendingNow')} to="/anime" />
      <Rail>
        {picks.trendingAnime.slice(0, 6).map((item) => (
          <WideCard key={item.slug} item={item} />
        ))}
      </Rail>
      {picks.upcomingAnime && picks.upcomingAnime.length > 0 && (
        <>
          <SectionHeader title={t('topUpcoming')} to="/seasonal" />
          <Rail>
            {picks.upcomingAnime.map((item) => (
              <PosterCard key={item.slug} item={item} mediaType="anime" />
            ))}
          </Rail>
        </>
      )}
      {picks.popularAnime && picks.popularAnime.length > 0 && (
        <>
          <SectionHeader title={t('mostPopular')} to="/anime" />
          <Rail>
            {picks.popularAnime.map((item) => (
              <PosterCard key={item.slug} item={item} mediaType="anime" />
            ))}
          </Rail>
        </>
      )}
      <CommunityPicks />
      {picks.freshManga && picks.freshManga.length > 0 && (
        <>
          <SectionHeader title={t('freshManga')} to="/manga" />
          <Rail>
            {picks.freshManga.map((item) => (
              <PosterCard key={item.slug} item={item} mediaType="manga" />
            ))}
          </Rail>
        </>
      )}
      <footer className="mobile-footer">
        <p className="mobile-footer__copyright">{t('footerCopyright')}</p>
      </footer>
    </div>
  );
}

