/**
 * PDF generator — jsPDF + DejaVuSansCondensed
 * A4 Portrait, cijeli mjesec na jednoj stranici.
 * Font base64 se cache-uje globalno i registruje na svakom jsPDF objektu.
 */

import type { City } from '../types';
import { timesFor } from './zone';
import { getDaysInMonth, BS_MONTHS, BS_DAYS } from './dateHelpers';

// ── Layout ────────────────────────────────────────────────────────────────────
const PW = 210, PH = 297, MX = 8, CW = PW - 2 * MX; // content width 194mm
const TABLE_Y = 23, FOOTER_Y = PH - 6;
const ROW_H = (FOOTER_Y - TABLE_Y - 3) / 32;  // 1 header + 31 data rows
const COL0 = 22, COLT = (CW - COL0) / 9;
const HDRS = ['Dan','Zora','Izlazak','Podne','Ikindija','Aksam','Jacija','Jacija IZ','Polovina','Zadnja 1/3'];

// gray · whitesmoke · white (same palette as the app)
const C = {
  hBg: [60,60,60]    as [number,number,number],
  wh:  [255,255,255] as [number,number,number],
  sBg: [245,245,245] as [number,number,number],
  sTx: [97,97,97]    as [number,number,number],
  alt: [250,250,250] as [number,number,number],
  fri: [238,238,238] as [number,number,number],
  frT: [33,33,33]    as [number,number,number],
  cTx: [33,33,33]    as [number,number,number],
  brd: [224,224,224] as [number,number,number],
  fTx: [158,158,158] as [number,number,number],
};

// ── Font cache ────────────────────────────────────────────────────────────────
let _b64n: string | null = null;
let _b64b: string | null = null;
let _promise: Promise<void> | null = null;

function _toB64(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf);
  const CHUNK = 8192;
  let s = '';
  for (let i = 0; i < u.length; i += CHUNK)
    s += String.fromCharCode(...(u.subarray(i, i + CHUNK) as unknown as number[]));
  return btoa(s);
}

async function fetchFonts(): Promise<void> {
  // Always await the in-flight promise if one exists
  if (_promise) { await _promise; return; }
  if (_b64n && _b64b) return;
  _promise = (async () => {
    try {
      const [r1, r2] = await Promise.all([
        fetch('/DejaVuSansCondensed.ttf'),
        fetch('/DejaVuSansCondensed-Bold.ttf'),
      ]);
      if (!r1.ok || !r2.ok) throw new Error('font fetch failed');
      const [b1, b2] = await Promise.all([r1.arrayBuffer(), r2.arrayBuffer()]);
      _b64n = _toB64(b1);
      _b64b = _toB64(b2);
    } catch (e) {
      console.warn('DejaVu fonts unavailable, falling back to helvetica:', e);
    }
  })();
  await _promise;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFonts(doc: any): void {
  if (!_b64n || !_b64b) return;
  doc.addFileToVFS('DejaVuSansCondensed.ttf', _b64n);
  doc.addFont('DejaVuSansCondensed.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSansCondensed-Bold.ttf', _b64b);
  doc.addFont('DejaVuSansCondensed-Bold.ttf', 'DejaVu', 'bold');
}

const F = () => (_b64n ? 'DejaVu' : 'helvetica');

// ── Renderer ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderPage(doc: any, year: number, month: number, city: City, pg?: number, total?: number) {
  const f = F();
  const days = getDaysInMonth(year, month);
  const rows: { d: number; dow: number; times: string[] }[] = [];
  for (let d = 1; d <= days; d++) {
    const dt = new Date(year, month, d);
    const t = timesFor(city, dt);
    rows.push({ d, dow: dt.getDay(),
      times: [t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha, t.ishaiz, t.midnight, t.lastthird] });
  }

  // Top bar
  doc.setFillColor(...C.hBg); doc.rect(0, 0, PW, 11, 'F');
  doc.setFont(f, 'bold'); doc.setFontSize(11); doc.setTextColor(...C.wh);
  doc.text(`Namaska vremena \u2014 ${BS_MONTHS[month]} ${year}.`, MX, 8);
  if (pg !== undefined) doc.text(`${pg}/${total}`, PW - MX, 8, { align: 'right' });

  // City strip
  doc.setFillColor(...C.sBg); doc.rect(0, 11, PW, 12, 'F');
  doc.setFont(f, 'normal'); doc.setFontSize(8.5); doc.setTextColor(...C.sTx);
  doc.text(`${city.name}  \u2022  ${city.country}`, MX, 19.5);

  // Column header row
  const hY = TABLE_Y;
  doc.setFillColor(...C.hBg); doc.rect(MX, hY, CW, ROW_H, 'F');
  doc.setFont(f, 'bold'); doc.setFontSize(6.8); doc.setTextColor(...C.wh);
  let cx = MX;
  HDRS.forEach((h, i) => {
    const cw = i === 0 ? COL0 : COLT;
    doc.text(h, i === 0 ? cx + 1.5 : cx + cw / 2, hY + ROW_H * 0.68, { align: i === 0 ? 'left' : 'center' });
    cx += cw;
  });

  // Data rows
  rows.forEach((row, idx) => {
    const ry = hY + ROW_H * (idx + 1);
    const fri = row.dow === 5, alt = idx % 2 === 1;
    doc.setFillColor(...(fri ? C.fri : alt ? C.alt : C.wh));
    doc.rect(MX, ry, CW, ROW_H, 'F');
    doc.setDrawColor(...C.brd); doc.setLineWidth(0.1);
    doc.line(MX, ry + ROW_H, MX + CW, ry + ROW_H);
    const ty = ry + ROW_H * 0.68;
    doc.setTextColor(...(fri ? C.frT : C.cTx));
    doc.setFontSize(7.2);
    doc.setFont(f, 'bold');
    doc.text(`${String(row.d).padStart(2, '0')}. ${BS_DAYS[row.dow]}`, MX + 1.5, ty);
    doc.setFont(f, fri ? 'bold' : 'normal');
    let tx = MX + COL0;
    row.times.forEach(t => { doc.text(t, tx + COLT / 2, ty, { align: 'center' }); tx += COLT; });
  });

  // Vertical separators
  doc.setDrawColor(...C.brd); doc.setLineWidth(0.15);
  let sx = MX + COL0;
  for (let i = 0; i < 8; i++) { doc.line(sx, hY, sx, hY + ROW_H * (rows.length + 1)); sx += COLT; }

  // Outer border
  doc.setDrawColor(...C.hBg); doc.setLineWidth(0.3);
  doc.rect(MX, hY, CW, ROW_H * (rows.length + 1), 'S');

  // Footer
  doc.setFont(f, 'normal'); doc.setFontSize(6.5); doc.setTextColor(...C.fTx);
  doc.text('vaktijadev.pages.dev | Metoda: Ugao 14.6\u00B0', MX, FOOTER_Y);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateMonthPDF(year: number, month: number, city: City): Promise<void> {
  await fetchFonts();
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  applyFonts(doc);
  renderPage(doc, year, month, city);
  doc.save(`vaktija-${city.name}-${BS_MONTHS[month]}-${year}.pdf`);
}

export async function generateYearPDF(year: number, city: City): Promise<void> {
  await fetchFonts();                // čekamo da se fonti učitaju
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  applyFonts(doc);                   // registrujemo na ovoj instanci
  for (let m = 0; m < 12; m++) {
    if (m > 0) doc.addPage();        // addPage() čuva VFS/fontove u istom objektu
    renderPage(doc, year, m, city, m + 1, 12);
  }
  doc.save(`vaktija-${city.name}-${year}.pdf`);
}
