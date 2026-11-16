import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useCity } from '../hooks/useCity';
import CityModal from './CityModal';

export default function Navbar() {
  const { city } = useCity();
  const [open, setOpen] = useState(false);
  const link = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? ' active' : ''}`;

  return (
    <>
      <nav className="navbar">
        <div className="navbar-inner">
          <NavLink to="/" className="brand">
            <img src="/crescent.svg" alt="" width="22" height="22" />
            Vaktija
          </NavLink>
          <div className="nav-links">
            <NavLink to="/" end className={link}>Danas</NavLink>
            <NavLink to="/mjesec" className={link}>Mjesec</NavLink>
            <NavLink to="/godina" className={link}>Godina</NavLink>
          </div>
          <button className="city-btn" onClick={() => setOpen(true)} title="Promijeni lokaciju">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
            <span>{city.name}</span>
          </button>
        </div>
      </nav>
      {open && <CityModal onClose={() => setOpen(false)} />}
    </>
  );
}
