import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  Building2,
  MapPin,
  CalendarCheck,
  Table2,
  Smartphone,
  AlertCircle,
  FileText,
  CalendarDays,
  BarChart3,
  Archive,
  Settings,
  Wallet,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/jobs', label: 'Jobs', icon: Briefcase },
  { to: '/clients', label: 'Clients / Companies', icon: Building2 },
  { to: '/sites', label: 'Sites & Locations', icon: MapPin },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/ledger', label: 'Payment Ledger', icon: Table2 },
  { to: '/mpesa', label: 'M-PESA Payments', icon: Smartphone },
  { to: '/outstanding', label: 'Outstanding Payments', icon: AlertCircle },
  { to: '/documents', label: 'Job Cards / Documents', icon: FileText },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/historical', label: 'Historical Records', icon: Archive },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed lg:static z-40 top-0 left-0 h-full w-64 bg-ink-900 text-slate-300 flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center gap-2 px-5 py-5 border-b border-white/10">
          <div className="w-9 h-9 rounded-lg bg-brand-500 flex items-center justify-center text-white font-bold">
            <Wallet size={18} />
          </div>
          <div>
            <div className="text-white font-semibold leading-tight">Work Tracker</div>
            <div className="text-[11px] text-slate-400 leading-tight">Jobs & Payments</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
