export interface City {
  name: string;
  country: string;
  lat: number;
  lng: number;
  timezone: number;   // UTC offset without DST (only for cities from the list)
  dst: number;        // 1 = EU summer time (only for cities from the list)
  alt?: string;       // former / local name, still searchable
  tz?: string;        // IANA zone, e.g. "Europe/Sarajevo" – used whenever present
}

export interface PrayerTimesResult {
  imsak: string;
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  sunset: string;
  maghrib: string;
  isha: string;
  ishaiz: string;
  midnight: string;
  lastthird: string;
}
