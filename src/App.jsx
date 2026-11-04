import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './state/store';
import Landing from './pages/Landing';
import AppShell from './components/AppShell';
import Assess from './pages/Assess';
import CeoDashboard from './pages/CeoDashboard';
import StakeholderDashboard from './pages/StakeholderDashboard';
import Agents from './pages/Agents';
import Scenarios from './pages/Scenarios';
import ClimateTech from './pages/ClimateTech';
import Documents from './pages/Documents';
import Reports from './pages/Reports';

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Navigate to="assess" replace />} />
            <Route path="assess" element={<Assess />} />
            <Route path="ceo" element={<CeoDashboard />} />
            <Route path="stakeholder" element={<StakeholderDashboard />} />
            <Route path="agents" element={<Agents />} />
            <Route path="scenarios" element={<Scenarios />} />
            <Route path="climate-tech" element={<ClimateTech />} />
            <Route path="documents" element={<Documents />} />
            <Route path="reports" element={<Reports />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}
