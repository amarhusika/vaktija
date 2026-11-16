import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CityProvider } from './hooks/useCity';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import MonthPage from './pages/MonthPage';
import YearPage from './pages/YearPage';

export default function App() {
  return (
    <CityProvider>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/mjesec" element={<MonthPage />} />
          <Route path="/godina" element={<YearPage />} />
        </Routes>
      </BrowserRouter>
    </CityProvider>
  );
}
