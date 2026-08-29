import { useState } from 'react';
import { Menu, Search, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/axios';

export default function Topbar({ title, onMenuClick }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    try {
      const { data } = await api.get('/search', { params: { q } });
      setResults(data);
    } finally {
      setSearching(false);
    }
  };

  return (
    <header className="no-print bg-white border-b border-slate-100 sticky top-0 z-20">
      <div className="flex items-center justify-between px-4 lg:px-6 py-3 gap-4">
        <div className="flex items-center gap-3">
          <button className="lg:hidden text-slate-500" onClick={onMenuClick}>
            <Menu size={22} />
          </button>
          <h1 className="text-lg font-semibold text-ink-900">{title}</h1>
        </div>

        <div className="flex-1 max-w-md relative hidden sm:block">
          <form onSubmit={handleSearch} className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                if (!e.target.value) setResults(null);
              }}
              placeholder="Search clients, sites, jobs, M-PESA codes..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </form>
          {results && (
            <div className="absolute mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-96 overflow-y-auto z-30">
              <SearchResults results={results} onSelect={() => setResults(null)} navigate={navigate} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm text-right hidden sm:block">
            <div className="font-medium text-ink-900">{user?.name}</div>
            <div className="text-xs text-slate-400">{user?.email}</div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="text-slate-400 hover:text-red-500 transition-colors"
            title="Logout"
          >
            <LogOut size={19} />
          </button>
        </div>
      </div>
    </header>
  );
}

function SearchResults({ results, onSelect, navigate }) {
  const { clients, sites, jobs, mpesa } = results;
  const empty = !clients?.length && !sites?.length && !jobs?.length && !mpesa?.length;
  if (empty) return <div className="p-4 text-sm text-slate-400">No matches found.</div>;

  return (
    <div className="text-sm">
      {jobs?.length > 0 && (
        <Section title="Jobs">
          {jobs.map((j) => (
            <Item
              key={j._id}
              label={`${j.client?.name || ''} - ${j.jobCardRef || j.jobType || 'Job'}`}
              onClick={() => {
                navigate(`/jobs/${j._id}`);
                onSelect();
              }}
            />
          ))}
        </Section>
      )}
      {clients?.length > 0 && (
        <Section title="Clients">
          {clients.map((c) => (
            <Item key={c._id} label={c.name} onClick={() => { navigate('/clients'); onSelect(); }} />
          ))}
        </Section>
      )}
      {sites?.length > 0 && (
        <Section title="Sites">
          {sites.map((s) => (
            <Item
              key={s._id}
              label={s.siteType === 'Bank' ? `${s.bankName} - ${s.branch}` : s.siteName}
              onClick={() => { navigate('/sites'); onSelect(); }}
            />
          ))}
        </Section>
      )}
      {mpesa?.length > 0 && (
        <Section title="M-PESA">
          {mpesa.map((m) => (
            <Item
              key={m._id}
              label={`${m.transactionCode || 'N/A'} - KES ${m.amount}`}
              onClick={() => { navigate('/mpesa'); onSelect(); }}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="border-b border-slate-100 last:border-0">
      <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{title}</div>
      {children}
    </div>
  );
}

function Item({ label, onClick }) {
  return (
    <button onClick={onClick} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-ink-800">
      {label}
    </button>
  );
}