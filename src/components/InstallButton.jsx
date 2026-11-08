import { useSiteLang } from '@/i18n';
import { useInstallPrompt } from '@/hooks/use-install-prompt';

// "Install Anitale" for browsers that allow it; a short how-to on iOS; nothing once installed.
export default function InstallButton({ className = '' }) {
  const { t } = useSiteLang();
  const { canInstall, ios, install } = useInstallPrompt();
  if (canInstall) return <button type="button" className={`install-button ${className}`} onClick={install}>{t('installApp')}</button>;
  if (ios) return <p className={`install-hint ${className}`}>{t('installIos')}</p>;
  return null;
}
