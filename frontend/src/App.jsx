import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';

import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import Sites from './pages/Sites.jsx';
import Jobs from './pages/Jobs.jsx';
import JobDetail from './pages/JobDetail.jsx';
import PaymentLedger from './pages/PaymentLedger.jsx';
import MpesaPayments from './pages/MpesaPayments.jsx';
import Outstanding from './pages/Outstanding.jsx';
import Documents from './pages/Documents.jsx';
import CalendarPage from './pages/Calendar.jsx';
import Reports from './pages/Reports.jsx';
import HistoricalRecords from './pages/HistoricalRecords.jsx';
import SettingsPage from './pages/Settings.jsx';
import AttendanceHistory from './pages/AttendanceHistory.jsx';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="clients" element={<Clients />} />
        <Route path="sites" element={<Sites />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="attendance" element={<AttendanceHistory />} />
        <Route path="ledger" element={<PaymentLedger />} />
        <Route path="mpesa" element={<MpesaPayments />} />
        <Route path="outstanding" element={<Outstanding />} />
        <Route path="documents" element={<Documents />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="reports" element={<Reports />} />
        <Route path="historical" element={<HistoricalRecords />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
