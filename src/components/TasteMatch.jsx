import { useSiteLang } from '@/i18n';

// "How close is your taste to this member's" — shown to signed-in viewers on other members' profiles.
export default function TasteMatch({ similarity }) {
  const { t } = useSiteLang();
  if (!similarity) return null;
  if (similarity.percent == null) {
    return <p className="taste-match is-pending" role="note">{t('tasteNeedMore', { shared: similarity.shared, min: similarity.min })}</p>;
  }
  return (
    <p className="taste-match" role="note">
      <strong dir="ltr">{similarity.percent}%</strong> {t('tasteMatch')} <small>{t('tasteShared', { n: similarity.shared })}</small>
    </p>
  );
}
