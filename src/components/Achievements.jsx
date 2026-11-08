import { useMemo } from 'react';
import { BookOpen, Clock, Layers, MessageSquare, Star, Trophy } from 'lucide-react';
import { useSiteLang } from '@/i18n';
import { formatNumber } from '@/lib/digits.js';
import { computeAchievements } from '@/lib/achievements';

const ICONS = { completed: Trophy, days: Clock, rated: Star, genres: Layers, manga: BookOpen, reviews: MessageSquare };

// Profile block: level badges worked out from the member's list (see lib/achievements.js).
export default function Achievements({ insights, reviews = [] }) {
  const { t, lang } = useSiteLang();
  const list = useMemo(() => computeAchievements(insights, reviews), [insights, reviews]);
  if (!insights.total) return null;
  return (
    <section className="achievements" aria-labelledby="achTitle">
      <h2 id="achTitle">{t('achTitle')}</h2>
      <ul>
        {list.map((a) => {
          const Icon = ICONS[a.id];
          return (
            <li key={a.id} className={a.level ? 'is-on' : ''}>
              <span className="achievements__icon" aria-hidden="true"><Icon width={20} height={20} strokeWidth={1.8} /></span>
              <div>
                <strong>{t(`ach_${a.id}`)}</strong>
                <small>{a.level ? t('achLevel', { n: formatNumber(a.level, lang), max: formatNumber(a.levels, lang) }) : t('achNone')}</small>
                <span className="achievements__bar" role="img" aria-label={`${a.value}`}><i style={{ width: `${Math.round(a.progress * 100)}%` }} /></span>
                <small>{a.next == null ? t('achMax') : t('achNext', { value: formatNumber(a.value, lang), next: formatNumber(a.next, lang) })}</small>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
