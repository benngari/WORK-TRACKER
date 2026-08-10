import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatKES, formatDate } from '../utils/format.js';

export default function PaymentLedger() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ client: '', status: '', from: '', to: '' });

  const load = () => {
    setLoading(true);
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    Promise.all([api.get('/reports/ledger', { params }), api.get('/clients')])
      .then(([l, c]) => { setRows(l.data); setClients(c.data); })
      .finally(() => setLoading(false));
  };

  useEffect(load, [filters]);

  const totals = rows.reduce(
    (acc, r) => ({ expected: acc.expected + r.expected, paid: acc.paid + r.paid, balance: acc.balance + r.balance }),
    { expected: 0, paid: 0, balance: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap gap-3">
        <select className="input max-w-xs" value={filters.client} onChange={(e) => setFilters({ ...filters, client: e.target.value })}>
          <option value="">All Clients</option>
          {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
        <select className="input max-w-xs" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All Statuses</option>
          <option>Pending</option>
          <option>Partially Paid</option>
          <option>Paid</option>
          <option>Overpaid</option>
        </select>
        <input type="date" className="input max-w-xs" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <input type="date" className="input max-w-xs" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card"><div className="text-xs text-slate-400 uppercase">Total Expected</div><div className="text-xl font-bold">{formatKES(totals.expected)}</div></div>
        <div className="card"><div className="text-xs text-slate-400 uppercase">Total Paid</div><div className="text-xl font-bold text-brand-600">{formatKES(totals.paid)}</div></div>
        <div className="card"><div className="text-xs text-slate-400 uppercase">Total Balance</div><div className="text-xl font-bold text-amber-600">{formatKES(totals.balance)}</div></div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <th className="py-2.5 px-4">Job Date</th>
                <th className="py-2.5 px-4">Client</th>
                <th className="py-2.5 px-4">Site</th>
                <th className="py-2.5 px-4">Job Card</th>
                <th className="py-2.5 px-4">Callouts</th>
                <th className="py-2.5 px-4">Expected</th>
                <th className="py-2.5 px-4">Paid</th>
                <th className="py-2.5 px-4">Balance</th>
                <th className="py-2.5 px-4">Due Date</th>
                <th className="py-2.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.jobId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/jobs/${r.jobId}`)}>
                  <td className="py-2.5 px-4">{formatDate(r.jobDate)}</td>
                  <td className="py-2.5 px-4 font-medium text-ink-900">{r.client}</td>
                  <td className="py-2.5 px-4 text-slate-600">{r.site}</td>
                  <td className="py-2.5 px-4 text-slate-600">{r.jobCardRef || '-'}</td>
                  <td className="py-2.5 px-4 text-slate-600">{r.callouts}</td>
                  <td className="py-2.5 px-4">{formatKES(r.expected)}</td>
                  <td className="py-2.5 px-4">{formatKES(r.paid)}</td>
                  <td className="py-2.5 px-4 font-medium text-amber-600">{formatKES(r.balance)}</td>
                  <td className="py-2.5 px-4 text-slate-600">{formatDate(r.paymentDueDate)}</td>
                  <td className="py-2.5 px-4"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="text-center py-8 text-sm text-slate-400">No records match these filters.</div>}
        </div>
      )}
    </div>
  );
}
