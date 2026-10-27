import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import { TableSkeleton, DashboardSkeleton } from './components/Skeletons.jsx';

// Pages load only when opened, so the first screen downloads much less code.
const Register = lazy(() => import('./pages/Register.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Clients = lazy(() => import('./pages/Clients.jsx'));
const Sites = lazy(() => import('./pages/Sites.jsx'));
const Jobs = lazy(() => import('./pages/Jobs.jsx'));
const JobDetail = lazy(() => import('./pages/JobDetail.jsx'));
const PaymentLedger = lazy(() => import('./pages/PaymentLedger.jsx'));
const MpesaPayments = lazy(() => import('./pages/MpesaPayments.jsx'));
const Outstanding = lazy(() => import('./pages/Outstanding.jsx'));
const Expenses = lazy(() => import('./pages/Expenses.jsx'));
const ClientStatement = lazy(() => import('./pages/ClientStatement.jsx'));
const Documents = lazy(() => import('./pages/Documents.jsx'));
const CalendarPage = lazy(() => import('./pages/Calendar.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const HistoricalRecords = lazy(() => import('./pages/HistoricalRecords.jsx'));
const SettingsPage = lazy(() => import('./pages/Settings.jsx'));
const AttendanceHistory = lazy(() => import('./pages/AttendanceHistory.jsx'));
const Trash = lazy(() => import('./pages/Trash.jsx'));
const AuditLog = lazy(() => import('./pages/AuditLog.jsx'));

function Lazy({ children, fallback }) {
  return <Suspense fallback={fallback || <TableSkeleton rows={5} />}>{children}</Suspense>;
}

function PrivateRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Lazy><Register /></Lazy>} />
      <Route path="/forgot-password" element={<Lazy><ForgotPassword /></Lazy>} />
      <Route path="/reset-password/:token" element={<Lazy><ResetPassword /></Lazy>} />

      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Lazy fallback={<DashboardSkeleton />}><Dashboard /></Lazy>} />
        <Route path="clients" element={<Lazy><Clients /></Lazy>} />
        <Route path="sites" element={<Lazy><Sites /></Lazy>} />
        <Route path="jobs" element={<Lazy><Jobs /></Lazy>} />
        <Route path="jobs/:id" element={<Lazy><JobDetail /></Lazy>} />
        <Route path="attendance" element={<Lazy><AttendanceHistory /></Lazy>} />
        <Route path="ledger" element={<Lazy><PaymentLedger /></Lazy>} />
        <Route path="mpesa" element={<Lazy><MpesaPayments /></Lazy>} />
        <Route path="outstanding" element={<Lazy><Outstanding /></Lazy>} />
        <Route path="expenses" element={<Lazy><Expenses /></Lazy>} />
        <Route path="statement" element={<Lazy><ClientStatement /></Lazy>} />
        <Route path="documents" element={<Lazy><Documents /></Lazy>} />
        <Route path="calendar" element={<Lazy><CalendarPage /></Lazy>} />
        <Route path="reports" element={<Lazy><Reports /></Lazy>} />
        <Route path="historical" element={<Lazy><HistoricalRecords /></Lazy>} />
        <Route path="trash" element={<Lazy><Trash /></Lazy>} />
        <Route path="audit" element={<Lazy><AuditLog /></Lazy>} />
        <Route path="settings" element={<Lazy><SettingsPage /></Lazy>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}