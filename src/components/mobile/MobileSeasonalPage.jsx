import { L, useSiteLang } from '@/i18n';
import { SeasonPageBody } from '@/airingBoard';

export default function MobileSeasonalPage({ title, items, fallback }) {
  const { lang } = useSiteLang();
  return (
    <div className="mobile-catalog">
      <h1 className="mobile-catalog__title">{L(title, lang)}</h1>
      <SeasonPageBody items={items} fallback={fallback} />
    </div>
  );
}
