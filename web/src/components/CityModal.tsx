import { useState, useMemo, useEffect, useRef } from 'react';
import { useCity } from '../hooks/useCity';
import { deviceZone, distanceKm, offsetHours } from '../utils/zone';
import type { ZoneRow } from '../data/zones';
import type { City } from '../types';

interface Props { onClose: () => void; }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

interface Country { code: string; name: string; zones: ZoneRow[]; info: string; }

const fmtOff = (h: number) => `UTC${h >= 0 ? '+' : '−'}${Math.floor(Math.abs(h))}${Math.abs(h) % 1 ? ':' + String(Math.round((Math.abs(h) % 1) * 60)).padStart(2, '0') : ''}`;

/** All countries of the world (names in Bosnian from the browser), with time zone and summer time. */
function buildCountries(zones: ZoneRow[], names: Record<string, string>): Country[] {
  const codes = new Set<string>(['XK']);
  zones.forEach(z => z.countries.forEach(c => codes.add(c)));
  const y = new Date().getFullYear();
  return [...codes].map(code => {
    const zs = code === 'XK' ? zones.filter(z => z.zone === 'Europe/Belgrade') : zones.filter(z => z.countries.includes(code));
    const main = zs[0]?.zone;
    let info = '';
    if (main) {
      const jan = offsetHours(main, new Date(y, 0, 15)), jul = offsetHours(main, new Date(y, 6, 15));
      info = `${fmtOff(Math.min(jan, jul))} · ${jan !== jul ? 'ima ljetno računanje' : 'bez ljetnog računanja'}`;
      if (new Set(zs.map(z => offsetHours(z.zone, new Date(y, 0, 15)))).size > 1) info = 'više vremenskih zona (bira se po koordinatama)';
    }
    return { code, name: names[code] || code, zones: zs, info };
  }).filter(c => c.zones.length > 0)
    .sort((a, b) => a.code === 'BA' ? -1 : b.code === 'BA' ? 1 : a.name.localeCompare(b.name, 'bs'));
}

/** The country's zone whose main city is nearest to the place. */
function zoneFor(c: Country, lat: number, lng: number): string {
  return c.zones.reduce((best, z) =>
    distanceKm(lat, lng, z.lat, z.lng) < distanceKm(lat, lng, best.lat, best.lng) ? z : best).zone;
}

/** Accepts "43.8563", "43,8563" or a pasted "43.8563, 18.4131" pair. */
const num = (s: string) => parseFloat(s.trim().replace(',', '.'));

export default function CityModal({ onClose }: Props) {
  const { city: current, cities, setCity } = useCity();
  const [query, setQuery] = useState('');
  const [gps, setGps] = useState('');
  const [manual, setManual] = useState(false);
  const [m, setM] = useState({ name: '', country: 'BA', lat: '', lng: '' });
  const [countryQuery, setCountryQuery] = useState('');
  const [countryOpen, setCountryOpen] = useState(false);
  const nameRef = useRef<HTMLLabelElement>(null);

  // when the country search opens, scroll so the place name is at the top and the
  // country results are visible right below it (again once the on-screen keyboard has appeared)
  useEffect(() => {
    if (!countryOpen) return;
    const toTop = () => nameRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const t1 = setTimeout(toTop, 50);
    const t2 = setTimeout(toTop, 400);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', toTop);
    return () => { clearTimeout(t1); clearTimeout(t2); vv?.removeEventListener('resize', toTop); };
  }, [countryOpen]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const grouped = useMemo(() => {
    const q = norm(query.trim());
    const list = q ? cities.filter(c => norm(c.name).includes(q) || norm(c.alt ?? '').includes(q) || norm(c.country).includes(q)) : cities;
    const g: Record<string, City[]> = {};
    for (const c of list) (g[c.country] ||= []).push(c);
    return Object.entries(g).sort(([a], [b]) =>
      a === 'Bosna i Hercegovina' ? -1 : b === 'Bosna i Hercegovina' ? 1 : a.localeCompare(b, 'bs'));
  }, [cities, query]);

  const pick = (c: City) => { setCity(c); onClose(); };

  // the country table is loaded only when the form is opened
  useEffect(() => {
    if (manual && countries.length === 0) import('../data/zones').then(z => setCountries(buildCountries(z.ZONES, z.NAMES)));
  }, [manual, countries.length]);

  const shownCountries = useMemo(() => {
    const q = norm(countryQuery.trim());
    if (!q) return countries;
    const hit = countries.filter(c => norm(c.name).includes(q) || c.code.toLowerCase() === q);
    // names that start with the typed text first
    return [...hit.filter(c => norm(c.name).startsWith(q)), ...hit.filter(c => !norm(c.name).startsWith(q))];
  }, [countries, countryQuery]);
  const selectedCountry = countries.find(c => c.code === m.country);

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) { setGps('Browser ne podržava lokaciju'); return; }
    setGps('Tražim lokaciju…');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const near = cities.map(c => ({ c, d: distanceKm(lat, lng, c.lat, c.lng) })).sort((a, b) => a.d - b.d)[0];
        pick({ name: near && near.d <= 40 ? near.c.name : 'Moja lokacija', country: 'Trenutna lokacija',
          lat, lng, timezone: 0, dst: 0, tz: deviceZone() });
      },
      err => setGps(err.code === 1 ? 'Dozvola za lokaciju je odbijena' : 'Lokacija nije dostupna'),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  };

  const onLatInput = (v: string) => {
    // pasted "lat, lng" (e.g. copied from Google Maps) → split into both fields
    const pair = v.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
    if (pair && v.includes(' ')) setM(s => ({ ...s, lat: pair[1], lng: pair[2] }));
    else setM(s => ({ ...s, lat: v }));
  };

  const saveManual = () => {
    const lat = num(m.lat), lng = num(m.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) { setError('Geografska širina (lat) mora biti između -90 i 90'); return; }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) { setError('Geografska dužina (long) mora biti između -180 i 180'); return; }
    const c = selectedCountry;
    if (!c) { setError('Izaberi državu'); return; }
    pick({
      name: m.name.trim() || 'Moje mjesto',
      country: c.name,
      lat, lng, timezone: 0, dst: 0,
      tz: zoneFor(c, lat, lng),
    });
  };

  const isCurrent = (c: City) => c.name === current.name && c.country === current.country;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Lokacija">
        <div className="modal-header">
          {manual && (
            <button className="icon-btn" onClick={() => { setManual(false); setError(''); }} aria-label="Nazad">
              <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            </button>
          )}
          <h2 className="modal-title">{manual ? 'Dodaj svoje mjesto' : 'Lokacija'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Zatvori">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        {manual ? (
          <form className="modal-body form" noValidate onSubmit={e => { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur(); saveManual(); }}>
            <p className="form-hint">
              Koordinate nađeš u Google Maps: desni klik na svoje mjesto i klik na brojeve
              (npr. <b>43.8563, 18.4131</b>) ih kopira. Možeš ih zalijepiti odjednom u prvo polje.
            </p>
            <label ref={nameRef}>Naziv mjesta
              <input value={m.name} placeholder="npr. Gornji Vakuf" enterKeyHint="next" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setCountryOpen(true); } }} onChange={e => setM(s => ({ ...s, name: e.target.value }))} />
            </label>
            <div className="field">
              <span className="field-label">Država</span>
              {countryOpen ? (
                <>
                  <input value={countryQuery} placeholder="Pretraži državu" autoFocus enterKeyHint="next"
                    onKeyDown={e => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      const c = shownCountries[0];
                      if (c) { setM(s => ({ ...s, country: c.code })); setCountryQuery(''); setCountryOpen(false); setTimeout(() => document.getElementById('m-lat')?.focus(), 0); }
                    }}
                    onChange={e => setCountryQuery(e.target.value)} />
                  <div className="country-list">
                    {countries.length === 0 && <div className="country-empty">Učitavam države…</div>}
                    {countries.length > 0 && shownCountries.length === 0 && <div className="country-empty">Nema takve države</div>}
                    {shownCountries.map(c => (
                      <button key={c.code} type="button" className={`country-row${c.code === m.country ? ' selected' : ''}`}
                        onClick={() => { setM(s => ({ ...s, country: c.code })); setCountryQuery(''); setCountryOpen(false); }}>
                        <span className="country-name">{c.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <button type="button" className="country-picked" onClick={() => setCountryOpen(true)}>
                  <span>{selectedCountry?.name ?? 'Bosna i Hercegovina'}</span>
                  <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
                </button>
              )}
            </div>

            <div className="form-row">
              <label>Lat (širina)
                <input id="m-lat" inputMode="decimal" enterKeyHint="next" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('m-lng')?.focus(); } }} value={m.lat} onChange={e => onLatInput(e.target.value)} />
              </label>
              <label>Long (dužina)
                <input id="m-lng" inputMode="decimal" enterKeyHint="go" value={m.lng} onChange={e => setM(s => ({ ...s, lng: e.target.value }))} />
              </label>
            </div>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn-primary">Spremi</button>
          </form>
        ) : (
          <>
            <div className="modal-search">
              <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
              <input type="text" placeholder="Pretraži grad ili državu" value={query} onChange={e => setQuery(e.target.value)} autoFocus />
            </div>

            <div className="quick-row">
              <button className="quick" onClick={useMyLocation}>
                <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3A8.99 8.99 0 0 0 13 3.06V1h-2v2.06A8.99 8.99 0 0 0 3.06 11H1v2h2.06A8.99 8.99 0 0 0 11 20.94V23h2v-2.06A8.99 8.99 0 0 0 20.94 13H23v-2h-2.06zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"/></svg>
                <span>{gps || 'Moja lokacija'}</span>
              </button>
              <button className="quick" onClick={() => { setManual(true); setM(s => ({ ...s, name: query.trim() })); }}>
                <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                <span>Dodaj svoje mjesto</span>
              </button>
            </div>

            <div className="modal-body">
              {grouped.length === 0 && (
                <div className="empty">
                  <p>Nema „{query}“ na listi.</p>
                  <button className="btn-secondary" onClick={() => { setManual(true); setM(s => ({ ...s, name: query.trim() })); }}>
                    Dodaj ga sam: država + lat i long
                  </button>
                </div>
              )}
              {grouped.map(([country, list]) => (
                <div key={country}>
                  <div className="group-label">{country}</div>
                  {list.map(c => (
                    <button key={`${c.name}-${c.country}`} className={`city-row${isCurrent(c) ? ' selected' : ''}`} onClick={() => pick(c)}>
                      <span className="city-row-name">{c.name}</span>
                      {isCurrent(c) && (
                        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
