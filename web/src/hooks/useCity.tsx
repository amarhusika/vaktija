import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { City } from '../types';
import citiesRaw from '../data/cities.json';

const cities = citiesRaw as City[];
const defaultCity = cities.find(c => c.name === 'Sarajevo') || cities[0];

interface CityContextValue {
  city: City;
  cities: City[];
  setCity: (city: City) => void;
}

const CityContext = createContext<CityContextValue>({ city: defaultCity, cities, setCity: () => {} });

function load(): City {
  try {
    const saved = localStorage.getItem('vaktija_city');
    if (saved) {
      const p = JSON.parse(saved) as City;
      // searched places and "my location" are stored whole; list cities are refreshed from the list
      if (p.tz && typeof p.lat === 'number' && typeof p.lng === 'number') return p;
      return cities.find(c => c.name === p.name && c.country === p.country)
        || cities.find(c => Math.abs(c.lat - p.lat) < 1e-3 && Math.abs(c.lng - p.lng) < 1e-3)   // renamed city
        || defaultCity;
    }
  } catch { /* ignore */ }
  return defaultCity;
}

export function CityProvider({ children }: { children: ReactNode }) {
  const [city, setCityState] = useState<City>(load);

  const setCity = useCallback((c: City) => {
    setCityState(c);
    try { localStorage.setItem('vaktija_city', JSON.stringify(c)); } catch { /* ignore */ }
  }, []);

  return <CityContext.Provider value={{ city, cities, setCity }}>{children}</CityContext.Provider>;
}

export function useCity() {
  return useContext(CityContext);
}
