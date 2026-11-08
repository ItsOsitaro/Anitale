import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { mediaHref, currentWeekday } from '@/catalog';
import { displayTitle, getCurrentSeasonInfo } from '@/home-data';
import { useSiteLang } from '@/i18n';
import { coverUrl } from '@/lib/cover';
import { formatNumber, formatScore } from '@/lib/digits.js';
import { membersOf } from '@/lib/catalog-rules';

// The weekly schedule and the seasonal lineup share one card and one set of day controls.
const DAY_KEYS = { Mon: 'dayMon', Tue: 'dayTue', Wed: 'dayWed', Thu: 'dayThu', Fri: 'dayFri', Sat: 'daySat', Sun: 'daySun' };
const FA_WEEK = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']; // the Persian week starts on Saturday
const EN_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SEASON_KEYS = { winter: 'seasonWinter', spring: 'seasonSpring', summer: 'seasonSummer', fall: 'seasonFall' };

const airTime = (item) => {
  const row = Array.isArray(item.information) ? item.information.find((r) => r?.label === 'Broadcast') : null;
  const match = String(row?.value || '').match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
};

const byTimeThenScore = (a, b) => {
  const ta = airTime(a) || '99';
  const tb = airTime(b) || '99';
  return ta === tb ? (Number(b.sampleScore) || 0) - (Number(a.sampleScore) || 0) : ta.localeCompare(tb);
};

function AirCard({ item, poster = false }) {
  const { lang } = useSiteLang();
  const title = displayTitle(item, lang);
  const time = airTime(item);
  const score = Number(item.sampleScore) || 0;
  return (
    <li className={`air-card${poster ? ' air-card--poster' : ''}`}>
      <Link to={mediaHref(item)} className="air-card__link">
        <span className="air-card__cover">
          <img src={coverUrl(item.image, poster ? 360 : 240)} alt="" loading="lazy" decoding="async" />
          {poster && score > 0 && (
            <span className="air-card__score"><Star width={11} height={11} strokeWidth={1.6} aria-hidden="true" /><span dir="ltr">{formatScore(score, lang)}</span></span>
          )}
        </span>
        <span className="air-card__body">
          <span className="air-card__title">{title}</span>
          <span className="air-card__meta">
            {time && <span className="air-card__time" dir="ltr">{formatNumber(time, lang, { useGrouping: false })}</span>}
            {item.category && <span className="air-card__cat">{item.category}</span>}
            {!poster && score > 0 && <span className="air-card__rate"><Star width={11} height={11} strokeWidth={1.6} aria-hidden="true" /><span dir="ltr">{formatScore(score, lang)}</span></span>}
          </span>
        </span>
      </Link>
    </li>
  );
}

function DayTabs({ days, value, onChange, counts, today, allLabel }) {
  const { t, lang } = useSiteLang();
  return (
    <div className="air-days" role="group" aria-label={t('airDaysLabel')}>
      {allLabel && (
        <button type="button" className="air-day" aria-pressed={value === 'all'} onClick={() => onChange('all')}>
          <span>{allLabel}</span><small>{formatNumber(counts.all, lang)}</small>
        </button>
      )}
      {days.map((day) => (
        <button type="button" key={day} className={`air-day${day === today ? ' is-today' : ''}`} aria-pressed={value === day} onClick={() => onChange(day)} disabled={!counts[day] && value !== day}>
          <span>{t(DAY_KEYS[day])}</span><small>{formatNumber(counts[day] || 0, lang)}</small>
        </button>
      ))}
    </div>
  );
}

const useWeek = (items) => {
  const { lang } = useSiteLang();
  const days = lang === 'fa' ? FA_WEEK : EN_WEEK;
  const counts = useMemo(() => {
    const c = { all: 0 };
    for (const item of items) if (DAY_KEYS[item.airingDay]) { c[item.airingDay] = (c[item.airingDay] || 0) + 1; c.all += 1; }
    return c;
  }, [items]);
  return { days, counts, today: currentWeekday() };
};

export function SchedulePageBody({ items }) {
  const { t, lang } = useSiteLang();
  const { days, counts, today } = useWeek(items);
  const [day, setDay] = useState(today);
  const list = useMemo(() => items.filter((item) => item.airingDay === day).sort(byTimeThenScore), [items, day]);
  if (!counts.all) return <div className="sample-data-note">{t('scheduleEmpty')}</div>;
  return (
    <div className="air-board">
      <DayTabs days={days} value={day} onChange={setDay} counts={counts} today={today} />
      <section aria-labelledby="air-day-title">
        <header className="air-head">
          <h2 id="air-day-title">{t(DAY_KEYS[day])}{day === today && <strong className="today-chip">{t('todayBadge')}</strong>}</h2>
          <span>{t('titlesCount', { n: formatNumber(list.length, lang) })}</span>
        </header>
        {list.length === 0 ? <p className="air-empty">{t('nothingToday')}</p> : <ul className="air-list">{list.map((item) => <AirCard key={item.slug} item={item} />)}</ul>}
        <p className="air-note">{t('airTimeNote')}</p>
      </section>
    </div>
  );
}

export function SeasonPageBody({ items, fallback }) {
  const { t, lang } = useSiteLang();
  const { days, counts, today } = useWeek(items);
  const [day, setDay] = useState('all');
  const [sort, setSort] = useState('pop');
  const { season, year } = getCurrentSeasonInfo();
  const shown = useMemo(() => {
    const base = day === 'all' ? [...items] : items.filter((item) => item.airingDay === day);
    return base.sort(sort === 'score' ? (a, b) => (Number(b.sampleScore) || 0) - (Number(a.sampleScore) || 0) : (a, b) => membersOf(b) - membersOf(a));
  }, [items, day, sort]);
  return (
    <div className="air-board">
      <div className="air-season">
        <strong>{fallback ? t('seasonAllShown') : `${t(SEASON_KEYS[season])} ${formatNumber(year, lang, { useGrouping: false })}`}</strong>
        <span>{t('titlesCount', { n: formatNumber(items.length, lang) })}</span>
      </div>
      {fallback && <div className="sample-data-note">{t('seasonEmpty')}</div>}
      <section aria-labelledby="air-all-title">
        <header className="air-head air-head--end">
          <h2 id="air-all-title" className="sr-only">{t('seasonAllHead')}</h2>
          <label className="air-sort"><span>{t('sortLabel')}</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="pop">{t('seasonSortPop')}</option>
              <option value="score">{t('seasonSortScore')}</option>
            </select></label>
        </header>
        {counts.all > 0 && <DayTabs days={days} value={day} onChange={setDay} counts={counts} today={today} allLabel={t('seasonDayAll')} />}
        {shown.length === 0 ? <p className="air-empty">{t('nothingToday')}</p> : <ul className="air-grid">{shown.map((item) => <AirCard key={item.slug} item={item} poster />)}</ul>}
      </section>
    </div>
  );
}
