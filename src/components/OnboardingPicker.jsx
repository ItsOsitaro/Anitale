import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { useSiteLang } from '@/i18n';
import { useUser } from '@/user';
import { useVisibleCatalog } from '@/catalog-context';
import { membersOf } from '@/lib/catalog-rules';
import { coverUrl } from '@/lib/cover';
import { franchiseKey } from '@/hooks/use-for-you';
import { formatNumber } from '@/lib/digits.js';

const NEED = 3; // what "For you" needs before it can say anything about taste
const SHOWN = 24;
const flag = (name) => `anitale.onboard.${String(name).toLowerCase()}`;

// First-run card for a member with an (almost) empty list: tap the anime you have seen and liked; they are saved as
// completed, which is exactly what the home "For you" rail learns from.
export default function OnboardingPicker() {
  const { t, lang } = useSiteLang();
  const user = useUser();
  const catalog = useVisibleCatalog();
  const [picked, setPicked] = useState(() => new Set());
  const [state, setState] = useState('idle'); // idle | saving | done
  const [hidden, setHidden] = useState(() => {
    try { return Boolean(user.me && localStorage.getItem(flag(user.me.username))); } catch { return false; }
  });

  const choices = useMemo(() => {
    const seen = new Set();
    const mine = new Set(user.entries.anime.map((entry) => entry.slug));
    const out = [];
    for (const item of [...catalog].sort((a, b) => membersOf(b) - membersOf(a))) {
      const key = franchiseKey(item.title) || item.slug;
      if (seen.has(key) || mine.has(item.slug) || !item.image) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= SHOWN) break;
    }
    return out;
  }, [catalog, user.entries.anime]);

  if (!user.me || hidden || state === 'done' || user.entries.anime.length >= NEED || choices.length === 0) return null;

  const dismiss = () => { try { localStorage.setItem(flag(user.me.username), '1'); } catch { /* private mode */ } setHidden(true); };
  const toggle = (slug) => setPicked((current) => { const next = new Set(current); if (!next.delete(slug)) next.add(slug); return next; });
  const save = async () => {
    setState('saving');
    try {
      for (const slug of picked) {
        await user.toggle('anime', slug);
        await user.setStatus('anime', slug, 'completed');
      }
      setState('done');
    } catch { setState('idle'); }
  };

  return (
    <section className="onboard" aria-labelledby="onbTitle">
      <h2 id="onbTitle">{t('onbTitle')}</h2>
      <p>{t('onbHint', { n: formatNumber(NEED, lang) })}</p>
      <ul className="onboard__grid">
        {choices.map((item) => {
          const on = picked.has(item.slug);
          return (
            <li key={item.slug}>
              <button type="button" className={`onboard__item${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => toggle(item.slug)}>
                <img src={coverUrl(item.image, 240)} alt="" loading="lazy" decoding="async" />
                <span className="onboard__check" aria-hidden="true"><Check width={16} height={16} strokeWidth={3} /></span>
                <span className="onboard__name" dir="auto">{item.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="onboard__actions">
        <button type="button" className="onboard__save" disabled={picked.size < NEED || state === 'saving'} onClick={save}>
          {picked.size < NEED ? t('onbNeed', { n: formatNumber(NEED - picked.size, lang) }) : t('onbSave', { n: formatNumber(picked.size, lang) })}
        </button>
        <button type="button" className="onboard__skip" onClick={dismiss}>{t('onbSkip')}</button>
      </div>
    </section>
  );
}
