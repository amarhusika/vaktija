import { useState, useEffect, useMemo } from 'react';
import { useCity } from '../hooks/useCity';
import { getJacijaIZ } from '../utils/prayTimes';
import { PRAYER_LABELS, PRAYER_KEYS, formatDate } from '../utils/dateHelpers';
import { formatHijri, isRamazan } from '../utils/hijri';
import { cityNow, timesFor, sabahIZFor } from '../utils/zone';
import type { PrayerTimesResult } from '../types';

const toMin = (t: string) => {
  if (!t || t === '-----') return -1;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const pad = (n: number) => String(n).padStart(2, '0');

export default function HomePage() {
  const { city } = useCity();
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // wall-clock time in the chosen city
  const now = useMemo(() => cityNow(city, new Date(tick)), [city, tick]);
  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const today = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [dayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const tomorrow = useMemo(() => new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1), [today]);

  const times = useMemo<PrayerTimesResult>(() => timesFor(city, today), [city, today]);
  const tomorrowFajr = useMemo(() => timesFor(city, tomorrow).fajr, [city, tomorrow]);
  // Ramazan night: this evening's "Jacija IZ" is akšam + 126 min when TOMORROW is a Ramazan day
  // → first on the last day of ša'ban, last on the second-to-last day of Ramazan.
  const ramazanNight = useMemo(() => isRamazan(tomorrow), [tomorrow]);
  const ramazanDay = useMemo(() => isRamazan(today), [today]);   // today's Sabah IZ (sehur)
  const sabahIZ = useMemo(() => sabahIZFor(city, today), [city, today]);
  const jacijaIZ = getJacijaIZ(times.maghrib);

  const keys = useMemo(() => PRAYER_KEYS.filter(k => !(ramazanNight && k === 'ishaiz')), [ramazanNight]);

  const { current, next, nextTime, left } = useMemo(() => {
    const fajr = toMin(times.fajr);
    const norm = (m: number) => (m >= 0 && m < fajr ? m + 1440 : m);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nowSec = norm(nowMin) * 60 + now.getSeconds();
    const slots = keys.map(k => ({ k, t: times[k as keyof PrayerTimesResult] })).filter(s => toMin(s.t) >= 0);
    let cur = -1;
    slots.forEach((s, i) => { if (norm(toMin(s.t)) <= norm(nowMin)) cur = i; });

    if (cur >= 0 && cur < slots.length - 1) {
      const n = slots[cur + 1];
      return { current: slots[cur].k, next: n.k, nextTime: n.t, left: norm(toMin(n.t)) * 60 - nowSec };
    }
    // after the last night time → the coming fajr (today's if past midnight, else tomorrow's)
    const f = nowMin < fajr ? times.fajr : tomorrowFajr;
    return { current: slots[cur]?.k ?? '', next: 'fajr', nextTime: f, left: (1440 + toMin(f)) * 60 - nowSec };
  }, [now, times, keys, tomorrowFajr]);

  const s = Math.max(0, left);
  const hijri = formatHijri(today);

  return (
    <main className="page">
      <header className="day-header">
        <h1 className="day-city">{city.name}</h1>
        <p className="day-date">{formatDate(today)}</p>
        {hijri && <p className="day-hijri">{hijri}</p>}
      </header>

      <section className="card next-card">
        <div className="label">Sljedeći vakt</div>
        <div className="next-row">
          <span className="next-name">{PRAYER_LABELS[next]}</span>
          <span className="next-time">u {nextTime}</span>
        </div>
        <div className="countdown">{pad(Math.floor(s / 3600))}:{pad(Math.floor((s % 3600) / 60))}:{pad(s % 60)}</div>
      </section>

      {(ramazanDay || ramazanNight) && (
        <section className="card list-card">
          <div className="label list-label">Ramazan</div>
          {ramazanDay && <div className="time-row"><span>Sabah IZ</span><b>{sabahIZ}</b></div>}
          {ramazanNight && <div className="time-row"><span>Jacija IZ</span><b>{jacijaIZ}</b></div>}
        </section>
      )}

      <section className="card list-card">
        {keys.map(k => (
          <div key={k} className={`time-row${k === current ? ' current' : ''}`}>
            <span>{PRAYER_LABELS[k]}</span>
            <b>{times[k as keyof PrayerTimesResult]}</b>
          </div>
        ))}
      </section>

      <p className="note">Ugao 14,6° za zoru i jaciju</p>

      <a className="card app-card" href="https://github.com/amarhusika/vaktija" target="_blank" rel="noopener noreferrer">
        <img src="/app-icon.svg" alt="" width="44" height="44" />
        <span className="app-text">
          <b>Mobilna aplikacija</b>
        </span>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9.3 5.3a1 1 0 0 0 0 1.4L14.6 12l-5.3 5.3a1 1 0 1 0 1.4 1.4l6-6a1 1 0 0 0 0-1.4l-6-6a1 1 0 0 0-1.4 0z"/></svg>
      </a>
    </main>
  );
}
