/**
 * Time zones: every city gets an IANA zone, so summer time is correct everywhere
 * (computed by the browser's Intl, not by a fixed EU rule).
 */
import type { City, PrayerTimesResult } from '../types';
import { getPrayerTimes, getSabahIZ } from './prayTimes';

export const COUNTRY_TZ: Record<string, string> = {
  'Albanija': 'Europe/Tirane', 'Austrija': 'Europe/Vienna', 'Belgija': 'Europe/Brussels',
  'Bosna i Hercegovina': 'Europe/Sarajevo', 'Crna Gora': 'Europe/Podgorica', 'Finska': 'Europe/Helsinki',
  'Francuska': 'Europe/Paris', 'Hrvatska': 'Europe/Zagreb', 'Japan': 'Asia/Tokyo', 'Kipar': 'Asia/Nicosia',
  'Kosovo': 'Europe/Belgrade', 'Luksemburg': 'Europe/Luxembourg', 'Njemačka': 'Europe/Berlin',
  'Norveška': 'Europe/Oslo', 'Saudijska Arabija': 'Asia/Riyadh', 'Sjeverna Makedonija': 'Europe/Skopje',
  'Slovenija': 'Europe/Ljubljana', 'Srbija': 'Europe/Belgrade', 'Švedska': 'Europe/Stockholm',
  'Švicarska': 'Europe/Zurich', 'Turska': 'Europe/Istanbul', 'Ujedinjeni Arapski Emirati': 'Asia/Dubai',
  'Velika Britanija': 'Europe/London',
};

export const deviceZone = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Sarajevo'; }
  catch { return 'Europe/Sarajevo'; }
};

export function zoneOf(city: City): string {
  return city.tz || COUNTRY_TZ[city.country] || deviceZone();
}

/** UTC offset in hours of [tz] on the calendar day of [d] (DST included). */
export function offsetHours(tz: string, d: Date): number {
  const noon = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12));
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).formatToParts(noon);
    const g = (t: string) => Number(parts.find(p => p.type === t)?.value);
    const local = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
    return Math.round((local - noon.getTime()) / 60000) / 60;
  } catch {
    return -noon.getTimezoneOffset() / 60;
  }
}

/** "Now" as wall-clock time in the city (so the countdown is right for a city in another zone). */
export function cityNow(city: City, now = new Date()): Date {
  const off = offsetHours(zoneOf(city), now);
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + off * 3600000);
}

export function timesFor(city: City, date: Date): PrayerTimesResult {
  return getPrayerTimes(date, city.lat, city.lng, offsetHours(zoneOf(city), date), 0);
}

export function sabahIZFor(city: City, date: Date): string {
  return getSabahIZ(date, city.lat, city.lng, offsetHours(zoneOf(city), date), 0);
}

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
