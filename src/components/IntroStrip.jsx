import { Link } from 'react-router-dom';
import { useSiteLang } from '@/i18n';
import { useUser } from '@/user.jsx';

// One-line "what is this" for visitors who are not signed in (home page, desktop and mobile).
export default function IntroStrip() {
  const { t } = useSiteLang();
  const user = useUser();
  if (!user.meLoaded || user.me) return null;
  return (
    <section className="intro-strip" aria-label={t('homeIntroLabel')}>
      <p>{t('homeIntro')}</p>
      <Link className="intro-strip__cta" to="/login">{t('navAuth')}</Link>
    </section>
  );
}
