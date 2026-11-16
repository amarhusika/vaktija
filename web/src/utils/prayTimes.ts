//--------------------- Copyright Block ----------------------
/*
PrayTimes.js: Prayer Times Calculator (ver 2.3)
Copyright (C) 2007-2011 PrayTimes.org
Developer: Hamid Zarrabi-Zadeh
License: GNU LGPL v3.0
Ported to TypeScript - original logic preserved exactly.
*/

import { PrayerTimesResult } from '../types';

// Degree-based math
const DMath = {
  dtr: (d: number) => (d * Math.PI) / 180.0,
  rtd: (r: number) => (r * 180.0) / Math.PI,
  sin: (d: number) => Math.sin(DMath.dtr(d)),
  cos: (d: number) => Math.cos(DMath.dtr(d)),
  tan: (d: number) => Math.tan(DMath.dtr(d)),
  arcsin: (d: number) => DMath.rtd(Math.asin(d)),
  arccos: (d: number) => DMath.rtd(Math.acos(d)),
  arctan: (d: number) => DMath.rtd(Math.atan(d)),
  arccot: (x: number) => DMath.rtd(Math.atan(1 / x)),
  arctan2: (y: number, x: number) => DMath.rtd(Math.atan2(y, x)),
  fixAngle: (a: number) => DMath.fix(a, 360),
  fixHour: (a: number) => DMath.fix(a, 24),
  fix: (a: number, b: number) => {
    a = a - b * Math.floor(a / b);
    return a < 0 ? a + b : a;
  },
};

function lastSunday(year: number, month: number): string {
  const date = new Date(year, month, 1, 12);
  const weekday = date.getDay();
  const dayDiff = weekday === 0 ? 7 : weekday;
  date.setDate(date.getDate() - dayDiff);
  return date.toDateString();
}

type Setting = Record<string, unknown>;

function createPrayTimes() {
  const timeNames: Record<string, string> = {
    imsak: 'Imsak',
    fajr: 'Fajr',
    sunrise: 'Sunrise',
    dhuhr: 'Dhuhr',
    asr: 'Asr',
    sunset: 'Sunset',
    maghrib: 'Maghrib',
    isha: 'Isha',
    ishaiz: 'IshaIZ',
    midnight: 'Midnight',
    lastthird: 'LastThird',
  };

  const methods: Record<string, { name: string; params: Record<string, unknown> }> = {
    Correct: {
      name: 'Correct',
      params: { fajr: 14.6, isha: 14.6, ishaiz: 16 },
    },
  };

  const defaultParams: Record<string, unknown> = {
    maghrib: '0 min',
    midnight: 'Jafari',
  };

  let calcMethod = 'Correct';

  const setting: Setting = {
    imsak: '10 min',
    dhuhr: '0 min',
    asr: 'Standard',
    highLats: 'NightMiddle',
  };

  let timeFormat = '24h';
  const timeSuffixes = ['am', 'pm'];
  const invalidTime = '-----';
  const numIterations = 1;
  const offset: Record<string, number> = {};

  // set methods defaults
  for (const i in methods) {
    const params = methods[i].params;
    for (const j in defaultParams)
      if (typeof params[j] === 'undefined') params[j] = defaultParams[j];
  }

  // initialize settings
  calcMethod = methods['Correct'] ? 'Correct' : calcMethod;
  const initParams = methods[calcMethod].params;
  for (const id in initParams) setting[id] = initParams[id];

  // init time offsets
  for (const i in timeNames) offset[i] = 0;

  // internal state
  let lat = 0, lng = 0, elv = 0, timeZone = 0, jDate = 0;

  const pt = {
    getTimes(
      date: Date | number[],
      coords: [number, number, number?],
      timezone: number,
      dst: number,
      format?: string
    ): PrayerTimesResult {
      lat = 1 * coords[0];
      lng = 1 * coords[1];
      elv = coords[2] ? 1 * coords[2] : 0;
      timeFormat = format || timeFormat;

      let dateArr: [number, number, number];
      if (date instanceof Date) {
        dateArr = [date.getFullYear(), date.getMonth() + 1, date.getDate()];
      } else {
        dateArr = date as [number, number, number];
      }

      // DST from last sunday of March to last sunday of October
      const year = dateArr[0];
      const lastSundayMarch = parseInt(lastSunday(year, 3).slice(8, 10));
      const lastSundayOctober = parseInt(lastSunday(year, 10).slice(8, 10));

      let dstFix = 0;
      if (dateArr[1] === 3 && dateArr[2] >= lastSundayMarch && dst === 1) dstFix = 1;
      if (dateArr[1] >= 4 && dateArr[1] <= 9 && dst === 1) dstFix = 1;
      if (dateArr[1] === 10 && dateArr[2] < lastSundayOctober && dst === 1) dstFix = 1;

      timeZone = 1 * timezone + dstFix;
      jDate = pt.julian(dateArr[0], dateArr[1], dateArr[2]) - lng / (15 * 24);
      return pt.computeTimes();
    },

    getFormattedTime(time: number, format: string): string {
      if (isNaN(time)) return invalidTime;
      if (format === 'Float') return String(time);
      time = DMath.fixHour(time + 0.5 / 60);
      const hours = Math.floor(time);
      const minutes = Math.floor((time - hours) * 60);
      const suffix = format === '12h' ? timeSuffixes[hours < 12 ? 0 : 1] : '';
      const hour =
        format === '24h'
          ? pt.twoDigitsFormat(hours)
          : String(((hours + 12 - 1) % 12) + 1);
      return hour + ':' + pt.twoDigitsFormat(minutes) + (suffix ? ' ' + suffix : '');
    },

    midDay(time: number): number {
      const eqt = pt.sunPosition(jDate + time).equation;
      return DMath.fixHour(12 - eqt);
    },

    sunAngleTime(angle: number, time: number, direction?: string): number {
      const decl = pt.sunPosition(jDate + time).declination;
      const noon = pt.midDay(time);
      const t =
        (1 / 15) *
        DMath.arccos(
          (-DMath.sin(angle) - DMath.sin(decl) * DMath.sin(lat)) /
            (DMath.cos(decl) * DMath.cos(lat))
        );
      return noon + (direction === 'ccw' ? -t : t);
    },

    asrTime(factor: number, time: number): number {
      const decl = pt.sunPosition(jDate + time).declination;
      const angle = -DMath.arccot(factor + DMath.tan(Math.abs(lat - decl)));
      return pt.sunAngleTime(angle, time);
    },

    sunPosition(jd: number): { declination: number; equation: number } {
      const D = jd - 2451545.0;
      const g = DMath.fixAngle(357.529 + 0.98560028 * D);
      const q = DMath.fixAngle(280.459 + 0.98564736 * D);
      const L = DMath.fixAngle(q + 1.915 * DMath.sin(g) + 0.02 * DMath.sin(2 * g));
      const e = 23.439 - 0.00000036 * D;
      const RA = DMath.arctan2(DMath.cos(e) * DMath.sin(L), DMath.cos(L)) / 15;
      const eqt = q / 15 - DMath.fixHour(RA);
      const decl = DMath.arcsin(DMath.sin(e) * DMath.sin(L));
      return { declination: decl, equation: eqt };
    },

    julian(year: number, month: number, day: number): number {
      if (month <= 2) {
        year -= 1;
        month += 12;
      }
      const A = Math.floor(year / 100);
      const B = 2 - A + Math.floor(A / 4);
      return (
        Math.floor(365.25 * (year + 4716)) +
        Math.floor(30.6001 * (month + 1)) +
        day +
        B -
        1524.5
      );
    },

    computePrayerTimes(times: Record<string, number>): Record<string, number> {
      times = pt.dayPortion(times);
      const params = setting;

      const imsak = pt.sunAngleTime(pt.evalParam(params.imsak), times.imsak, 'ccw');
      const fajr = pt.sunAngleTime(pt.evalParam(params.fajr), times.fajr, 'ccw');
      const sunrise = pt.sunAngleTime(pt.riseSetAngle(), times.sunrise, 'ccw');
      const dhuhr = pt.midDay(times.dhuhr);
      const asr = pt.asrTime(pt.asrFactor(params.asr as string), times.asr);
      const sunset = pt.sunAngleTime(pt.riseSetAngle(), times.sunset);
      const maghrib = pt.sunAngleTime(pt.evalParam(params.maghrib), times.maghrib);
      const isha = pt.sunAngleTime(pt.evalParam(params.isha), times.isha);
      const ishaiz = pt.sunAngleTime(pt.evalParam(params.ishaiz), times.ishaiz);

      times.midnight =
        setting.midnight === 'Jafari'
          ? times.sunset + pt.timeDiff(times.sunset, times.fajr) / 2
          : times.sunset + pt.timeDiff(times.sunset, times.sunrise) / 2;

      const maghribToFajr = pt.timeDiff(times.maghrib, times.fajr);
      times.lastthird = times.maghrib + (2 / 3) * maghribToFajr;

      return { imsak, fajr, sunrise, dhuhr, asr, sunset, maghrib, isha, ishaiz, midnight: times.midnight, lastthird: times.lastthird };
    },

    computeTimes(): PrayerTimesResult {
      let times: Record<string, number> = {
        imsak: 5, fajr: 5, sunrise: 6, dhuhr: 12,
        asr: 13, sunset: 18, maghrib: 18, isha: 18, ishaiz: 18,
      };

      for (let i = 1; i <= numIterations; i++)
        times = pt.computePrayerTimes(times);

      times = pt.adjustTimes(times);

      times.midnight =
        setting.midnight === 'Jafari'
          ? times.sunset + pt.timeDiff(times.sunset, times.fajr) / 2
          : times.sunset + pt.timeDiff(times.sunset, times.sunrise) / 2;

      const maghribToFajr = pt.timeDiff(times.maghrib, times.fajr);
      times.lastthird = times.maghrib + (2 / 3) * maghribToFajr;

      times = pt.tuneTimes(times);
      return pt.modifyFormats(times) as unknown as PrayerTimesResult;
    },

    adjustTimes(times: Record<string, number>): Record<string, number> {
      const params = setting;
      for (const i in times) times[i] += timeZone - lng / 15;

      if (params.highLats !== 'None') times = pt.adjustHighLats(times);

      if (pt.isMin(params.imsak)) times.imsak = times.fajr - pt.evalParam(params.imsak) / 60;
      if (pt.isMin(params.maghrib)) times.maghrib = times.sunset + pt.evalParam(params.maghrib) / 60;
      if (pt.isMin(params.isha)) times.isha = times.maghrib + pt.evalParam(params.isha) / 60;
      if (pt.isMin(params.ishaiz)) times.ishaiz = times.maghrib + pt.evalParam(params.ishaiz) / 60;

      times.dhuhr += pt.evalParam(params.dhuhr) / 60;
      return times;
    },

    asrFactor(asrParam: string): number {
      const factor: Record<string, number> = { Standard: 1, Hanafi: 2 };
      return factor[asrParam] || pt.evalParam(asrParam);
    },

    riseSetAngle(): number {
      const angle = 0.0347 * Math.sqrt(elv);
      return 0.833 + angle;
    },

    tuneTimes(times: Record<string, number>): Record<string, number> {
      for (const i in times) times[i] += offset[i] / 60;
      return times;
    },

    modifyFormats(times: Record<string, number>): Record<string, string> {
      const result: Record<string, string> = {};
      for (const i in times) result[i] = pt.getFormattedTime(times[i], timeFormat);
      return result;
    },

    adjustHighLats(times: Record<string, number>): Record<string, number> {
      const params = setting;
      const nightTime = pt.timeDiff(times.sunset, times.sunrise);
      times.imsak = pt.adjustHLTime(times.imsak, times.sunrise, pt.evalParam(params.imsak), nightTime, 'ccw');
      times.fajr = pt.adjustHLTime(times.fajr, times.sunrise, pt.evalParam(params.fajr), nightTime, 'ccw');
      times.isha = pt.adjustHLTime(times.isha, times.sunset, pt.evalParam(params.isha), nightTime);
      times.ishaiz = pt.adjustHLTime(times.ishaiz, times.sunset, pt.evalParam(params.ishaiz), nightTime);
      times.maghrib = pt.adjustHLTime(times.maghrib, times.sunset, pt.evalParam(params.maghrib), nightTime);
      return times;
    },

    adjustHLTime(time: number, base: number, angle: number, night: number, direction?: string): number {
      const portion = pt.nightPortion(angle, night);
      const timeDiff = direction === 'ccw' ? pt.timeDiff(time, base) : pt.timeDiff(base, time);
      if (isNaN(time) || timeDiff > portion) time = base + (direction === 'ccw' ? -portion : portion);
      return time;
    },

    nightPortion(angle: number, night: number): number {
      const method = setting.highLats;
      let portion = 1 / 2;
      if (method === 'AngleBased') portion = (1 / 60) * angle;
      if (method === 'OneSeventh') portion = 1 / 7;
      return portion * night;
    },

    dayPortion(times: Record<string, number>): Record<string, number> {
      for (const i in times) times[i] /= 24;
      return times;
    },

    timeDiff(time1: number, time2: number): number {
      return DMath.fixHour(time2 - time1);
    },

    evalParam(str: unknown): number {
      return 1 * parseFloat((str + '').split(/[^0-9.+-]/)[0]);
    },

    isMin(arg: unknown): boolean {
      return (arg + '').indexOf('min') !== -1;
    },

    twoDigitsFormat(num: number): string {
      return num < 10 ? '0' + num : String(num);
    },
  };

  return pt;
}

// Singleton instance
const prayTimesInstance = createPrayTimes();

export function getPrayerTimes(
  date: Date,
  lat: number,
  lng: number,
  timezone: number,
  dst: number
): PrayerTimesResult {
  return prayTimesInstance.getTimes(date, [lat, lng], timezone, dst);
}

/** SabahIZ: fajr at 18° angle + 15 minutes */
export function getSabahIZ(
  date: Date,
  lat: number,
  lng: number,
  timezone: number,
  dst: number
): string {
  // Create a fresh instance with fajr=18 to compute sabahIZ
  const pt18 = createPrayTimes();
  // Override fajr angle by calling getTimes then reading fajr
  // We do this by temporarily creating a special call
  const result = pt18.getTimes(date, [lat, lng], timezone, dst);
  // We need 18° fajr: we compute manually using the base approach
  // Actually easier: we get normal times, then add offset
  // The proper way: fajr at 18° is computed by changing fajr param
  // We'll use normal result fajr (14.6°) and adjust
  // Since we can't easily override without modifying the singleton,
  // we compute it properly using a helper calc:
  return computeFajrAt18Plus15(date, lat, lng, timezone, dst);
}

function computeFajrAt18Plus15(
  date: Date,
  lat: number,
  lng: number,
  timezone: number,
  dst: number
): string {
  const pt = createPrayTimes();
  // We need fajr at 18 degrees. The instance has fajr=14.6 by default.
  // We use a trick: create a new instance and override the fajr angle
  // by passing it through the adjust mechanism via the setting
  // Since setting is internal, we compute by calling getTimes on a modified instance
  // The cleanest approach: use the exposed getTimes but note we can't change fajr angle externally
  // So we compute the angle difference manually:
  // Normal fajr is at 14.6°, we want 18°. We must use a separate calculation.
  
  // Use standard result and compute time offset:
  // The difference in fajr time between 14.6° and 18° depends on the date/location.
  // Best approach: create a standalone calculation
  const normalTimes = pt.getTimes(date, [lat, lng], timezone, dst);
  
  // Parse the fajr time (HH:MM) and add 15 minutes — but this is wrong
  // because 18° is EARLIER than 14.6°.
  // We need to actually compute fajr at 18°.
  // The createPrayTimes function initializes with Correct method (fajr=14.6).
  // We need a separate instance with fajr=18.
  
  // Solution: directly compute using DMath
  const dateArr = [date.getFullYear(), date.getMonth() + 1, date.getDate()];
  const year = dateArr[0];
  const lsm = parseInt(lastSunday(year, 3).slice(8, 10));
  const lso = parseInt(lastSunday(year, 10).slice(8, 10));
  let dstFix = 0;
  if (dateArr[1] === 3 && dateArr[2] >= lsm && dst === 1) dstFix = 1;
  if (dateArr[1] >= 4 && dateArr[1] <= 9 && dst === 1) dstFix = 1;
  if (dateArr[1] === 10 && dateArr[2] < lso && dst === 1) dstFix = 1;
  const tz = timezone + dstFix;

  const jd = julianDay(dateArr[0], dateArr[1], dateArr[2]) - lng / (15 * 24);

  // Compute fajr at 18°
  const fajr18Float = sunAngleTimeCalc(18, 5 / 24, jd, lat, 'ccw');
  let fajr18Adjusted = fajr18Float + tz - lng / 15;

  // Apply high lat adjustment (NightMiddle)
  const sunriseFloat = sunAngleTimeCalc(0.833, 6 / 24, jd, lat, 'ccw');
  const sunsetFloat = sunAngleTimeCalc(0.833, 18 / 24, jd, lat);
  const sunriseAdj = sunriseFloat + tz - lng / 15;
  const sunsetAdj = sunsetFloat + tz - lng / 15;
  const nightTime = DMath.fixHour(sunriseAdj - sunsetAdj);
  const portion = (1 / 2) * nightTime;
  const diff18 = DMath.fixHour(sunriseAdj - fajr18Adjusted);
  if (isNaN(fajr18Adjusted) || diff18 > portion) {
    fajr18Adjusted = sunriseAdj - portion;
  }

  // Add 15 minutes
  fajr18Adjusted += 15 / 60;
  fajr18Adjusted = DMath.fixHour(fajr18Adjusted);

  // Format
  fajr18Adjusted = DMath.fixHour(fajr18Adjusted + 0.5 / 60);
  const hours = Math.floor(fajr18Adjusted);
  const minutes = Math.floor((fajr18Adjusted - hours) * 60);
  const hStr = hours < 10 ? '0' + hours : String(hours);
  const mStr = minutes < 10 ? '0' + minutes : String(minutes);
  return `${hStr}:${mStr}`;

  // suppress unused warning
  void normalTimes;
}

function julianDay(year: number, month: number, day: number): number {
  if (month <= 2) { year -= 1; month += 12; }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
}

function midDayCalc(time: number, jDate: number): number {
  const D = jDate + time - 2451545.0;
  const g = DMath.fixAngle(357.529 + 0.98560028 * D);
  const q = DMath.fixAngle(280.459 + 0.98564736 * D);
  const L = DMath.fixAngle(q + 1.915 * DMath.sin(g) + 0.02 * DMath.sin(2 * g));
  const e = 23.439 - 0.00000036 * D;
  const RA = DMath.arctan2(DMath.cos(e) * DMath.sin(L), DMath.cos(L)) / 15;
  const eqt = q / 15 - DMath.fixHour(RA);
  return DMath.fixHour(12 - eqt);
}

function sunAngleTimeCalc(angle: number, time: number, jDate: number, lat: number, direction?: string): number {
  const D = jDate + time - 2451545.0;
  const g = DMath.fixAngle(357.529 + 0.98560028 * D);
  const q = DMath.fixAngle(280.459 + 0.98564736 * D);
  const L = DMath.fixAngle(q + 1.915 * DMath.sin(g) + 0.02 * DMath.sin(2 * g));
  const e = 23.439 - 0.00000036 * D;
  const decl = DMath.arcsin(DMath.sin(e) * DMath.sin(L));
  const noon = midDayCalc(time, jDate);
  const t = (1 / 15) * DMath.arccos(
    (-DMath.sin(angle) - DMath.sin(decl) * DMath.sin(lat)) /
    (DMath.cos(decl) * DMath.cos(lat))
  );
  return noon + (direction === 'ccw' ? -t : t);
}

/** JacijaIZ: maghrib + 6 min + 120 min = maghrib + 126 min */
export function getJacijaIZ(maghrib: string): string {
  if (!maghrib || maghrib === '-----') return '-----';
  const [h, m] = maghrib.split(':').map(Number);
  const totalMins = h * 60 + m + 126;
  const newH = Math.floor(totalMins / 60) % 24;
  const newM = totalMins % 60;
  return `${newH < 10 ? '0' + newH : newH}:${newM < 10 ? '0' + newM : newM}`;
}
