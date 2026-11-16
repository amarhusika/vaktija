import { useState, useMemo } from 'react';
import { useCity } from '../hooks/useCity';
import { timesFor } from '../utils/zone';
import { getDaysInMonth, BS_MONTHS, BS_DAYS } from '../utils/dateHelpers';

export default function MonthPage() {
  const { city } = useCity();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [pdfLoading, setPdfLoading] = useState(false);

  const rows = useMemo(() => {
    const days = getDaysInMonth(year, month);
    return Array.from({ length: days }, (_, i) => {
      const d = i + 1;
      const date = new Date(year, month, d);
      const t = timesFor(city, date);
      return { d, dayOfWeek: date.getDay(), t };
    });
  }, [year, month, city]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const handlePDF = async () => {
    setPdfLoading(true);
    try { const { generateMonthPDF } = await import('../utils/pdfGenerator'); await generateMonthPDF(year, month, city); }
    finally { setPdfLoading(false); }
  };

  return (
    <main className="page animate-in">
      <div className="page-header">
        <h1 className="page-title">Mjesečna vaktija</h1>
        <p className="page-subtitle">{city.name}{city.country ? `, ${city.country}` : ''}</p>
      </div>

      <div className="controls-bar">
        <button className="ctrl-btn" onClick={prevMonth} aria-label="Prethodni mjesec">‹</button>

        <select className="ctrl-select" value={month} onChange={e => setMonth(+e.target.value)}>
          {BS_MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>

        <select className="ctrl-select" value={year} onChange={e => setYear(+e.target.value)}>
          {Array.from({ length: 12 }, (_, i) => today.getFullYear() - 4 + i).map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <button className="ctrl-btn" onClick={nextMonth} aria-label="Sljedeći mjesec">›</button>

        <span className="ctrl-spacer" />

        <button className="pdf-btn" onClick={handlePDF} disabled={pdfLoading}>
          {pdfLoading ? 'Pravim PDF…' : 'Preuzmi PDF'}
        </button>
      </div>

      <div className="table-wrapper">
        <table className="prayer-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Zora</th>
              <th>Izlazak</th>
              <th>Podne</th>
              <th>Ikindija</th>
              <th>Akšam</th>
              <th>Jacija</th>
              <th>Jacija IZ</th>
              <th>Polovina</th>
              <th>Zadnja ⅓</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ d, dayOfWeek, t }) => {
              const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              const isFriday = dayOfWeek === 5;
              return (
                <tr
                  key={d}
                  className={`${isToday ? 'row-today' : ''}${isFriday ? ' row-friday' : ''}`}
                >
                  <td>
                    {String(d).padStart(2, '0')}. {BS_DAYS[dayOfWeek]}
                    {isToday && <span className="today-badge">danas</span>}
                  </td>
                  <td>{t.fajr}</td>
                  <td>{t.sunrise}</td>
                  <td>{t.dhuhr}</td>
                  <td>{t.asr}</td>
                  <td>{t.maghrib}</td>
                  <td>{t.isha}</td>
                  <td>{t.ishaiz}</td>
                  <td>{t.midnight}</td>
                  <td>{t.lastthird}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="note">PDF: A4, cijeli mjesec na jednoj stranici.</p>
    </main>
  );
}
