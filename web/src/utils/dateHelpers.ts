export const BS_MONTHS = [
  'Januar', 'Februar', 'Mart', 'April', 'Maj', 'Juni',
  'Juli', 'August', 'Septembar', 'Oktobar', 'Novembar', 'Decembar',
];

export const BS_MONTHS_GEN = [
  'januara', 'februara', 'marta', 'aprila', 'maja', 'juna',
  'jula', 'augusta', 'septembra', 'oktobra', 'novembra', 'decembra',
];

export const BS_DAYS = ['Ned', 'Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub'];
export const BS_DAYS_FULL = ['Nedjelja', 'Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota'];

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function formatDate(date: Date): string {
  const d = date.getDate();
  const m = date.getMonth();
  const y = date.getFullYear();
  const dow = BS_DAYS_FULL[date.getDay()];
  return `${dow}, ${d}. ${BS_MONTHS_GEN[m]} ${y}.`;
}

export function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

// Prayer display names (Bosnian)
export const PRAYER_LABELS: Record<string, string> = {
  fajr: 'Zora',
  sunrise: 'Izlazak sunca',
  dhuhr: 'Podne',
  asr: 'Ikindija',
  maghrib: 'Akšam',
  isha: 'Jacija',
  ishaiz: 'Jacija IZ',
  midnight: 'Polovina noći',
  lastthird: 'Zadnja trećina noći',
};

export const PRAYER_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha', 'ishaiz', 'midnight', 'lastthird'] as const;
