import { useEffect, useState } from 'react';
import { useSiteLang } from './i18n.js';

export default function DevelopersPage() {
  const { t } = useSiteLang();
  const [doc, setDoc] = useState(null);
  useEffect(() => { document.title = `${t('devTitle')} · ${t('siteName')}`; }, [t]);
  useEffect(() => {
    let alive = true;
    fetch('/api/v1').then((r) => r.json()).then((d) => { if (alive) setDoc(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return (
    <main className="stacks-shell dev-shell">
      <h1>{t('devTitle')}</h1>
      <p>{t('devIntro')}</p>
      <ul className="dev-points">
        <li>{t('devNoKey')}</li>
        <li>{t('devLimit')}</li>
        <li>{t('devSensitive')}</li>
        <li>{t('devFields')}</li>
        <li>{t('devEtag')}</li>
      </ul>
      {doc && (
        <>
          <h2>{t('devEndpoints')}</h2>
          <dl className="dev-endpoints">
            {Object.entries(doc.endpoints).map(([k, v]) => (<div key={k}><dt dir="ltr"><code>{k}</code></dt><dd dir="ltr">{v}</dd></div>))}
          </dl>
          <h2>{t('devExample')}</h2>
          <pre dir="ltr" className="dev-code">{`curl "${doc.example}"`}</pre>
          <h2>{t('devFieldList')}</h2>
          <p dir="ltr"><strong>anime:</strong> {doc.fields.anime.join(', ')}</p>
          <p dir="ltr"><strong>manga:</strong> {doc.fields.manga.join(', ')}</p>
        </>
      )}
    </main>
  );
}
