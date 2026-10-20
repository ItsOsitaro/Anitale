import React, { useCallback, useEffect, useState } from 'react';
import { api as adminApi } from './api.js';
import { useAdmin } from './context.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LABELS = {
  Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday',
  Fri: 'friday', Sat: 'saturday', Sun: 'sunday',
};

export default function Schedule() {
  const { t } = useAdmin();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch('/api/anime').then((r) => r.json());
      setItems(Array.isArray(data) ? data : (data.items || []));
    } catch (error) {
      setToast(error.message || String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeDay = async (item, nextDay) => {
    setBusy(item.slug);
    try {
      await adminApi.setAiringDay(item.slug, nextDay);
      setToast(t('scheduleSaved'));
      await load();
    } catch (error) {
      setToast(error.message || String(error));
    } finally {
      setBusy('');
    }
  };

  const byDay = (day) => items.filter((item) => (item.airingDay || '') === day);
  const unscheduled = items.filter((item) => !(item.airingDay || ''));

  if (loading) return <p className="adm-empty">{t('loading')}</p>;

  return (
    <div className="adm-schedule">
      {toast && <p className="adm-toast" role="status">{toast}</p>}
      <div className="adm-schedule-grid">
        {WEEKDAYS.map((day) => (
          <section key={day} className="adm-schedule-day">
            <header>
              <h3>{t(DAY_LABELS[day])}</h3>
              <span className="adm-muted">{byDay(day).length}</span>
            </header>
            <ul>
              {byDay(day).map((item) => (
                <li key={item.slug} className="adm-schedule-item">
                  <span className="adm-schedule-title">{item.title}</span>
                  <select
                    value={day}
                    disabled={busy === item.slug}
                    onChange={(event) => changeDay(item, event.target.value)}
                    aria-label={t('scheduleMove')}
                  >
                    <option value="">{t('scheduleNone')}</option>
                    {WEEKDAYS.map((d) => <option key={d} value={d}>{t(DAY_LABELS[d])}</option>)}
                  </select>
                </li>
              ))}
              {byDay(day).length === 0 && <li className="adm-muted adm-schedule-empty">{t('scheduleEmptyDay')}</li>}
            </ul>
          </section>
        ))}
      </div>

      {unscheduled.length > 0 && (
        <section className="adm-schedule-unscheduled">
          <h3>{t('scheduleUnscheduled')} <span className="adm-muted">({unscheduled.length})</span></h3>
          <ul className="adm-schedule-list">
            {unscheduled.map((item) => (
              <li key={item.slug} className="adm-schedule-item">
                <span className="adm-schedule-title">{item.title}</span>
                <select
                  value=""
                  disabled={busy === item.slug}
                  onChange={(event) => changeDay(item, event.target.value)}
                  aria-label={t('scheduleMove')}
                >
                  <option value="">{t('scheduleNone')}</option>
                  {WEEKDAYS.map((d) => <option key={d} value={d}>{t(DAY_LABELS[d])}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
