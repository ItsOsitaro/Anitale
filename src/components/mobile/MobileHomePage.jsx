import { Link } from 'react-router-dom';
import { editorialContent } from '@/sectionData';
import { L, useSiteLang } from '@/i18n';
import { mediaHref } from '@/catalog';
import { displayTitle } from '@/home-data';
import HeroCarousel from './HeroCarousel';
import QuickChips from './QuickChips';
import SectionHeader from './SectionHeader';
import Rail from './Rail';
import PosterCard from './PosterCard';
import RankRow from './RankRow';

function WideCard({ item }) {
  const { lang, t } = useSiteLang();
  const title = displayTitle(item, lang);
  const href = mediaHref(item, 'anime');
  return (
    <article className="mobile-wide-card">
      <Link className="mobile-wide-card__link" to={href} aria-label={title}>
        <img className="mobile-wide-card__image" src={item.image} alt={title} loading="lazy" decoding="async" width="130" height="195" />
      </Link>
      <div className="mobile-wide-card__body">
        <Link className="mobile-wide-card__title" to={href}>{title}</Link>
        <div className="mobile-wide-card__meta" aria-hidden="true">{t('homeEditorialMeta')}</div>
      </div>
    </article>
  );
}

function NewsCard({ item }) {
  const { lang, t } = useSiteLang();
  const title = L(item.title, lang);
  return (
    <article className="mobile-news-card">
      <Link className="mobile-news-card__image" to="/news" aria-hidden="true">
        {String(title).charAt(0)}
      </Link>
      <div className="mobile-news-card__copy">
        <Link className="mobile-news-card__title" to="/news">{title}</Link>
        <div className="mobile-news-card__meta" aria-hidden="true">{t('homeNewsMeta')}</div>
      </div>
    </article>
  );
}

function ReviewCard({ item }) {
  const { lang } = useSiteLang();
  const title = L(item.title, lang);
  const body = L(item.body, lang);
  const category = L(item.category, lang);
  return (
    <article className="mobile-review-card">
      <span className="mobile-review-card__cat">{category}</span>
      <Link className="mobile-review-card__title" to="/reviews">{title}</Link>
      <p className="mobile-review-card__body">{body.slice(0, 140)}{body.length > 140 ? '…' : ''}</p>
    </article>
  );
}

export default function MobileHomePage({ picks, lang, t }) {
  const news = editorialContent.news.items;
  const reviews = editorialContent.reviews.items;

  return (
    <div className="mobile-home">
      <HeroCarousel items={picks.topAnime} />
      <QuickChips />
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
      <SectionHeader title={t('latestRecs')} />
      <Rail>
        {picks.trendingAnime.slice(0, 6).map((item) => (
          <WideCard key={item.slug} item={item} />
        ))}
      </Rail>
      {picks.freshManga.length > 0 && (
        <>
          <SectionHeader title={t('freshManga')} to="/manga" />
          <Rail>
            {picks.freshManga.map((item) => (
              <PosterCard key={item.slug} item={item} mediaType="manga" />
            ))}
          </Rail>
        </>
      )}
      <SectionHeader title={t('animeMangaNews')} />
      <div className="mobile-news-rail">
        {news.slice(0, 3).map((item) => (
          <NewsCard key={L(item.title, lang)} item={item} />
        ))}
      </div>
      <SectionHeader title={t('latestReviews')} />
      <Rail>
        {reviews.map((item) => (
          <ReviewCard key={L(item.title, lang)} item={item} />
        ))}
      </Rail>
      <footer className="mobile-footer">
        <div className="mobile-footer__links">
          <Link to="/about">{t('footerAbout')}</Link>
          <Link to="/advertising">{t('footerAdvertising')}</Link>
          <Link to="/support">{t('footerContact')}</Link>
        </div>
        <p className="mobile-footer__copyright">{t('footerCopyright')}</p>
      </footer>
    </div>
  );
}
