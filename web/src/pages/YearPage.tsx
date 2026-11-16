import { useState, useMemo, Fragment } from 'react';
import { useCity } from '../hooks/useCity';
import { timesFor } from '../utils/zone';
import { getDaysInMonth, BS_MONTHS, BS_DAYS } from '../utils/dateHelpers';

export default function YearPage() {
  const { city } = useCity();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [pdfLoading, setPdfLoading] = useState(false);

  const allMonths = useMemo(() => {
    return Array.from({ length: 12 }, (_, month) => {
      const days = getDaysInMonth(year, month);
      const rows = Array.from({ length: days }, (_, i) => {
        const d = i + 1;
        const date = new Date(year, month, d);
        const t = timesFor(city, date);
        return { d, dayOfWeek: date.getDay(), t };
      });
      return { month, rows };
    });
  }, [year, city]);

  const handlePDF = async () => {
    setPdfLoading(true);
    try { const { generateYearPDF } = await import('../utils/pdfGenerator'); await generateYearPDF(year, city); }
    finally { setPdfLoading(false); }
  };

  return (
    <main className="page animate-in">
      <div className="page-header">
        <h1 className="page-title">Godišnja vaktija</h1>
        <p className="page-subtitle">{city.name}{city.country ? `, ${city.country}` : ''}</p>
      </div>

      <div className="controls-bar">
        <button className="ctrl-btn" onClick={() => setYear(y => y - 1)} aria-label="Prethodna godina">‹</button>
        <div className="period-display">{year}.</div>
        <button className="ctrl-btn" onClick={() => setYear(y => y + 1)} aria-label="Sljedeća godina">›</button>

        <span className="ctrl-spacer" />

        <button className="pdf-btn" onClick={handlePDF} disabled={pdfLoading}>
          {pdfLoading ? 'Pravim PDF (12 str.)…' : 'Preuzmi PDF'}
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
            {allMonths.map(({ month, rows }) => (
              <Fragment key={`m-${month}`}>
                <tr className="month-separator">
                  <td colSpan={10}>{BS_MONTHS[month]} {year}.</td>
                </tr>
                {rows.map(({ d, dayOfWeek, t }) => {
                  const isToday =
                    d === today.getDate() &&
                    month === today.getMonth() &&
                    year === today.getFullYear();
                  const isFriday = dayOfWeek === 5;
                  return (
                    <tr
                      key={`${month}-${d}`}
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
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="note">PDF: 12 stranica A4, po jedna za svaki mjesec.</p>
    </main>
  );
}
