import React from 'react';
import { useSiteLang } from '../i18n.js';
import { setShowSensitive, useShowSensitive } from '../lib/catalog-rules.js';

// Switch for the sensitive-content filter. The filter is on until a visitor turns it off here.
export default function SensitiveToggle() {
  const { t } = useSiteLang();
  const show = useShowSensitive();
  const change = (event) => {
    if (event.target.checked && !window.confirm(t('sensitiveConfirm'))) return;
    setShowSensitive(event.target.checked);
  };
  return (
    <label className="sensitive-toggle">
      <input type="checkbox" checked={show} onChange={change} />
      <span>
        <strong>{t('sensitiveToggle')}</strong>
        <small>{t('sensitiveHint')}</small>
      </span>
    </label>
  );
}
