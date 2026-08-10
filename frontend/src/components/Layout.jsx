import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

const titles = {
  '/': 'Dashboard',
  '/clients': 'Clients / Companies',
  '/sites': 'Sites & Locations',
  '/jobs': 'Jobs',
  '/attendance': 'Attendance History',
  '/ledger': 'Payment Ledger',
  '/mpesa': 'M-PESA Payments',
  '/outstanding': 'Outstanding Payments',
  '/documents': 'Job Cards / Documents',
  '/calendar': 'Calendar',
  '/reports': 'Reports',
  '/historical': 'Historical Records',
  '/settings': 'Settings',
};

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  const title =
    titles[pathname] ||
    (pathname.startsWith('/jobs/') ? 'Job Detail' : 'Work Tracker');

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
