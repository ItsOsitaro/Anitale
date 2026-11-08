import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { mediaHref } from '@/catalog';
import { displayTitle, getCurrentSeasonInfo } from '@/home-data';
import { useSiteLang } from '@/i18n';
import { useUser } from '@/user';
import { coverUrl } from '@/lib/cover';
import { formatNumber, formatScore } from '@/lib/digits.js';
import { membersOf } from '@/lib/catalog-rules';

// The weekly schedule and the seasonal lineup share one card and one set of day controls.
const DAY_KEYS = { Mon: 'dayMon', Tue: 'dayTue', Wed: 'dayWed', Thu: 'dayThu', Fri: 'dayFri', Sat: 'daySat', Sun: 'daySun' };
const FA_WEEK = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']; // the Persian week starts on Saturday
const EN_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const JS_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; // Date#getUTCDay() order
const SEASON_KEYS = { winter: 'seasonWinter', spring: 'seasonSpring', summer: 'seasonSummer', fall: 'seasonFall' };

// Broadcast times are weekly Japan time. Iran has had no daylight saving since 2022, so Tehran is a fixed UTC+3:30.
const ZONE_MIN = { jst: 9 * 60, tehran: 3 * 60 + 30 };
const pad = (n) => String(n).padStart(2, '0');

const jstTime = (item) => {
  const row = Array.isArray(item.information) ? item.information.find((r) => r?.label === 'Broadcast') : null;
  const match = String(row?.value || '').match(/(\d{1,2}):(\d{2})/);
  return match ? `${pad(Number(match[1]))}:${match[2]}` : '';
};

// Day and time of a title in the chosen zone. Moving from Japan to Tehran goes back 5.5 hours, which can move the day too.
export const slotOf = (item, zone) => {
  const day = DAY_KEYS[item.airingDay] ? item.airingDay : '';
  const time = jstTime(item);
  if (!day || !time || zone === 'jst') return { day, time };
  const [h, m] = time.split(':').map(Number);
  let minutes = h * 60 + m - (ZONE_MIN.jst - ZONE_MIN.tehran);
  let shift = 0;
  if (minutes < 0) { minutes += 1440; shift = -1; }
  return { day: JS_WEEK[(JS_WEEK.indexOf(day) + shift + 7) % 7], time: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}` };
};

export const todayIn = (zone) => JS_WEEK[new Date(Date.now() + ZONE_MIN[zone] * 60000).getUTCDay()];

// The visitor's choice is remembered; Persian visitors start on Tehran time, everyone else on Japan time.
const useZone = () => {
  const { lang } = useSiteLang();
  const [zone, setZoneState] = useState(() => {
    try { const saved = localStorage.getItem('anitale.tz'); if (saved in ZONE_MIN) return saved; } catch { /* private mode */ }
    return lang === 'fa' ? 'tehran' : 'jst';
  });
  const setZone = (next) => { setZoneState(next); try { localStorage.setItem('anitale.tz', next); } catch { /* private mode */ } };
  return [zone, setZone];
};

function ZoneToggle({ zone, onChange }) {
  const { t } = useSiteLang();
  return (
    <span className="view-toggle" role="group" aria-label={t('tzLabel')}>
      <button type="button" aria-pressed={zone === 'tehran'} onClick={() => onChange('tehran')}>{t('tzTehran')}</button>
      <button type="button" aria-pressed={zone === 'jst'} onClick={() => onChange('jst')}>{t('tzJst')}</button>
    </span>
  );
}

function AirCard({ item, slot, poster = false }) {
  const { lang } = useSiteLang();
  const title = displayTitle(item, lang);
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
            {slot.time && <span className="air-card__time" dir="ltr">{formatNumber(slot.time, lang, { useGrouping: false })}</span>}
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
};

// Titles with their day/time in the chosen zone, counted per day.
const useWeek = (items, zone) => {
  const { lang } = useSiteLang();
  const days = lang === 'fa' ? FA_WEEK : EN_WEEK;
  const slots = useMemo(() => new Map(items.map((item) => [item.slug, slotOf(item, zone)])), [items, zone]);
  const counts = useMemo(() => {
    const c = { all: 0 };
    for (const item of items) { const { day } = slots.get(item.slug); if (day) { c[day] = (c[day] || 0) + 1; c.all += 1; } }
    return c;
  }, [items, slots]);
  return { days, counts, slots, today: todayIn(zone) };
};

// The member's own "watching" and "planned" anime, for the personal calendar.
const useMine = () => {
  const user = useUser();
  return useMemo(() => new Set(user.me ? user.entries.anime.filter((e) => e.status === 'watching' || e.status === 'planned').map((e) => e.slug) : []), [user.me, user.entries.anime]);
};

export function SchedulePageBody({ items }) {
  const { t, lang } = useSiteLang();
  const [zone, setZone] = useZone();
  const mine = useMine();
  const [onlyMine, setOnlyMine] = useState(false);
  const pool = useMemo(() => (onlyMine ? items.filter((item) => mine.has(item.slug)) : items), [items, onlyMine, mine]);
  const { days, counts, slots, today } = useWeek(pool, zone);
  const [pickedDay, setDay] = useState('');
  const day = pickedDay || today;
  const list = useMemo(() => pool
    .filter((item) => slots.get(item.slug).day === day)
    .sort((a, b) => {
      const ta = slots.get(a.slug).time || '99';
      const tb = slots.get(b.slug).time || '99';
      return ta === tb ? (Number(b.sampleScore) || 0) - (Number(a.sampleScore) || 0) : ta.localeCompare(tb);
    }), [pool, slots, day]);
  if (!items.some((item) => DAY_KEYS[item.airingDay])) return <div className="sample-data-note">{t('scheduleEmpty')}</div>;
  return (
    <div className="air-board">
      <div className="air-tools">
        <ZoneToggle zone={zone} onChange={setZone} />
        {mine.size > 0 && (
          <span className="view-toggle" role="group" aria-label={t('calScope')}>
            <button type="button" aria-pressed={!onlyMine} onClick={() => setOnlyMine(false)}>{t('calAll')}</button>
            <button type="button" aria-pressed={onlyMine} onClick={() => setOnlyMine(true)}>{t('calMine')}</button>
          </span>
        )}
      </div>
      <DayTabs days={days} value={day} onChange={setDay} counts={counts} today={today} />
      <section aria-labelledby="air-day-title">
        <header className="air-head">
          <h2 id="air-day-title">{t(DAY_KEYS[day])}{day === today && <strong className="today-chip">{t('todayBadge')}</strong>}</h2>
          <span>{t('titlesCount', { n: formatNumber(list.length, lang) })}</span>
        </header>
        {list.length === 0
          ? <p className="air-empty">{onlyMine && counts.all === 0 ? t('calMineEmpty') : t('nothingToday')}</p>
          : <ul className="air-list">{list.map((item) => <AirCard key={item.slug} item={item} slot={slots.get(item.slug)} />)}</ul>}
        <p className="air-note">{t(zone === 'tehran' ? 'airTimeNoteTehran' : 'airTimeNote')}</p>
      </section>
    </div>
  );
}

export function SeasonPageBody({ items, fallback }) {
  const { t, lang } = useSiteLang();
  const [zone] = useZone();
  const { days, counts, slots, today } = useWeek(items, zone);
  const [day, setDay] = useState('all');
  const [sort, setSort] = useState('pop');
  const { season, year } = getCurrentSeasonInfo();
  const shown = useMemo(() => {
    const base = day === 'all' ? [...items] : items.filter((item) => slots.get(item.slug).day === day);
    return base.sort(sort === 'score' ? (a, b) => (Number(b.sampleScore) || 0) - (Number(a.sampleScore) || 0) : (a, b) => membersOf(b) - membersOf(a));
  }, [items, day, sort, slots]);
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
        {shown.length === 0 ? <p className="air-empty">{t('nothingToday')}</p> : <ul className="air-grid">{shown.map((item) => <AirCard key={item.slug} item={item} slot={slots.get(item.slug)} poster />)}</ul>}
      </section>
    </div>
  );
}
