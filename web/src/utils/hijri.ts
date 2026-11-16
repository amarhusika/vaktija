/** Hijri date via the browser's built-in Umm al-Qura calendar. */
export const HIJRI_MONTHS = [
  'muharrem', 'safer', 'rebiu-l-evvel', 'rebiu-l-ahir', 'džumade-l-ula', 'džumade-l-uhra',
  'redžeb', "ša'ban", 'ramazan', 'ševval', "zu-l-ka'de", 'zu-l-hidždže',
];

export function hijriParts(date: Date): { day: number; month: number; year: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
      day: 'numeric', month: 'numeric', year: 'numeric',
    }).formatToParts(date);
    const g = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? '', 10);
    const r = { day: g('day'), month: g('month'), year: g('year') };
    return Number.isFinite(r.day) && Number.isFinite(r.month) ? r : null;
  } catch {
    return null;
  }
}

export function formatHijri(date: Date): string | null {
  const h = hijriParts(date);
  return h ? `${h.day}. ${HIJRI_MONTHS[h.month - 1]} ${h.year}. h.` : null;
}

export const isRamazan = (date: Date) => hijriParts(date)?.month === 9;
