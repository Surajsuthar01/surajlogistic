import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DEMO } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import { Billing } from './pages/Billing';
import { ControlTower } from './pages/ControlTower';
import { DriverApp } from './pages/DriverApp';
import { Fleet } from './pages/Fleet';
import { Login } from './pages/Login';
import { Marketplace } from './pages/Marketplace';
import { NewShipment } from './pages/NewShipment';
import { SettingsPage } from './pages/Settings';
import { ShipmentDetail } from './pages/ShipmentDetail';
import { Shipments } from './pages/Shipments';
import { Track } from './pages/Track';
import { TripDetail } from './pages/TripDetail';
import { Trips } from './pages/Trips';
import { Warehouse } from './pages/Warehouse';
import './styles.css';

function Home() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'driver') return <Navigate to="/driver" replace />;
  if (user.role === 'warehouse') return <Navigate to="/warehouse" replace />;
  if (user.role === 'customer') return <Navigate to="/shipments" replace />;
  return <ControlTower />;
}

function Guard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-8 text-muted">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/track" element={<Track />} />
      <Route path="/track/:awb" element={<Track />} />
      <Route path="/driver" element={<Guard><DriverApp /></Guard>} />
      <Route element={<Guard><Layout /></Guard>}>
        <Route path="/" element={<Home />} />
        <Route path="/shipments" element={<Shipments />} />
        <Route path="/shipments/new" element={<NewShipment />} />
        <Route path="/shipments/:id" element={<ShipmentDetail />} />
        <Route path="/trips" element={<Trips />} />
        <Route path="/trips/:id" element={<TripDetail />} />
        <Route path="/fleet" element={<Fleet />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/warehouse" element={<Warehouse />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// The demo build is a single file hosted inside a frame, so it routes in memory.
const Router = DEMO ? MemoryRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Router>
        <App />
      </Router>
    </AuthProvider>
  </StrictMode>,
);
