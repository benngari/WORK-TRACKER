import { Fragment, useEffect, useState } from 'react';
import { ScrollText, ChevronDown, ChevronRight } from 'lucide-react';
import api from '../api/axios';
import { TableSkeleton } from '../components/Skeletons.jsx';

const ENTITIES = [
  ['', 'All areas'],
  ['jobs', 'Jobs'],
  ['clients', 'Clients'],
  ['sites', 'Sites'],
  ['attendance', 'Attendance'],
  ['mpesa', 'M-PESA'],
  ['payments', 'Payments'],
  ['documents', 'Documents'],
  ['transport', 'Transport'],
  ['expenses', 'Expenses'],
  ['historical', 'Historical'],
  ['settings', 'Settings'],
  ['auth', 'Account / Login'],
  ['backup', 'Backup'],
];

const TYPES = [
  ['', 'All actions'],
  ['create', 'Added'],
  ['update', 'Changed'],
  ['delete', 'Deleted'],
  ['auth', 'Login / account'],
  ['other', 'Other'],
];

const TYPE_STYLES = {
  create: 'bg-green-50 text-green-700',
  update: 'bg-blue-50 text-blue-700',
  delete: 'bg-red-50 text-red-700',
  auth: 'bg-purple-50 text-purple-700',
  other: 'bg-slate-100 text-slate-600',
};

const TYPE_LABELS = { create: 'Added', update: 'Changed', delete: 'Deleted', auth: 'Account', other: 'Other' };

function formatWhen(value) {
  const d = new Date(value);
  if (isNaN(d)) return '-';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });
}

function showValue(v) {
  if (v === null || v === undefined || v === '') return '(empty)';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function KeyValues({ data }) {
  const entries = Object.entries(data || {});
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1">
      {entries.map(([k, v]) => (
        <div key={k} className="text-xs flex gap-2">
          <span className="text-slate-400 min-w-[110px]">{k}</span>
          <span className="text-slate-700 break-all">{showValue(v)}</span>
        </div>
      ))}
    </div>
  );
}

function Details({ log }) {
  const d = log.details || {};
  const hasAny = d.changes || d.snapshot || d.fields || d.email;
  return (
    <div className="space-y-3">
      {d.changes && (
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1">What changed</div>
          <div className="space-y-1">
            {Object.entries(d.changes).map(([k, c]) => (
              <div key={k} className="text-xs flex gap-2 flex-wrap">
                <span className="text-slate-400 min-w-[110px]">{k}</span>
                <span className="text-red-600 line-through break-all">{showValue(c.from)}</span>
                <span className="text-slate-400">{'->'}</span>
                <span className="text-green-700 break-all">{showValue(c.to)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {d.snapshot && (
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1">What was deleted</div>
          <KeyValues data={d.snapshot} />
        </div>
      )}
      {d.fields && (
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1">Details entered</div>
          <KeyValues data={d.fields} />
        </div>
      )}
      {d.email && <KeyValues data={{ email: d.email }} />}
      {!hasAny && <div className="text-xs text-slate-400">No extra details recorded.</div>}
      <div className="text-[11px] text-slate-400">
        {log.method} {log.path} | status {log.status}
        {log.ip ? ` | IP ${log.ip}` : ''}
      </div>
    </div>
  );
}

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const resetPage = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .get('/audit', { params: { page, limit: 50, search, entity, type, from, to } })
        .then((res) => {
          setLogs(res.data.logs);
          setTotal(res.data.total);
          setPages(res.data.pages);
          setError('');
        })
        .catch((err) => setError(err.response?.data?.message || 'Failed to load audit log'))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [page, search, entity, type, from, to]);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="label">Search</label>
          <input
            className="input"
            placeholder="e.g. client name, M-PESA code"
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Area</label>
          <select className="input" value={entity} onChange={(e) => resetPage(setEntity)(e.target.value)}>
            {ENTITIES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Action</label>
          <select className="input" value={type} onChange={(e) => resetPage(setType)(e.target.value)}>
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={from} onChange={(e) => resetPage(setFrom)(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={to} onChange={(e) => resetPage(setTo)(e.target.value)} />
        </div>
      </div>

      {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}

      {loading && logs.length === 0 ? (
        <TableSkeleton rows={8} />
      ) : logs.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">
          <ScrollText className="mx-auto mb-2" />
          No activity recorded yet. Actions you do from now on will show up here.
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <th className="py-2.5 px-4 w-8"></th>
                <th className="py-2.5 px-4">When</th>
                <th className="py-2.5 px-4">What happened</th>
                <th className="py-2.5 px-4">Type</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const isOpen = expanded === log._id;
                return (
                  <Fragment key={log._id}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : log._id)}
                      className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-2.5 px-4 text-slate-400">
                        {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap text-slate-500">{formatWhen(log.createdAt)}</td>
                      <td className="py-2.5 px-4 text-ink-900">{log.action}</td>
                      <td className="py-2.5 px-4">
                        <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${TYPE_STYLES[log.type] || TYPE_STYLES.other}`}>
                          {TYPE_LABELS[log.type] || 'Other'}
                        </span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <td></td>
                        <td colSpan={3} className="py-3 px-4">
                          <Details log={log} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-slate-500">
        <div>{total} {total === 1 ? 'entry' : 'entries'}</div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {pages}</span>
          <button className="btn-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}