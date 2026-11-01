import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileDown } from 'lucide-react';
import api from '../api/axios';
import { TableSkeleton } from './Skeletons.jsx';
import StatusBadge from './StatusBadge.jsx';
import { formatKES, formatDate } from '../utils/format.js';
import { downloadCSV } from '../utils/exportCsv.js';

const time = (d) => (d ? new Date(d).getTime() : 0);

// the dates written in the payment messages for this job
const paidOnList = (r) => {
  const dates = (r.paidDates || []).map((p) => p.date);
  if (dates.length === 0) return r.paidOn ? [r.paidOn] : [];
  return dates;
};

// Every job with what was expected, what was paid, when it was paid and what is left - as a screen, a PDF or a CSV.
export default function LedgerReport() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ client: '', status: '', from: '', to: '' });
  const [groupByClient, setGroupByClient] = useState(true);

  useEffect(() => {
    api.get('/clients').then((res) => setClients(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params[k] = v;
    });
    api
      .get('/reports/ledger', { params })
      .then((res) => {
        setRows(res.data);
        setError('');
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load the ledger'))
      .finally(() => setLoading(false));
  }, [filters]);

  const sorted = useMemo(() => [...rows].sort((a, b) => time(b.jobDate) - time(a.jobDate)), [rows]);
  const totals = useMemo(
    () => rows.reduce((t, r) => ({ expected: t.expected + r.expected, paid: t.paid + r.paid, balance: t.balance + r.balance }), { expected: 0, paid: 0, balance: 0 }),
    [rows]
  );
  const percent = totals.expected > 0 ? Math.round((totals.paid / totals.expected) * 100) : null;

  const filtersText = () => {
    const clientName = clients.find((c) => c._id === filters.client)?.name || 'All clients';
    const dates = filters.from || filters.to ? `${filters.from ? formatDate(filters.from) : 'start'} to ${filters.to ? formatDate(filters.to) : 'today'}` : 'All dates';
    return `${clientName} | ${filters.status || 'All statuses'} | ${dates}`;
  };

  const handlePdf = async () => {
    setBusy(true);
    try {
      const { buildLedgerPdf } = await import('../utils/reportPdf.js');
      const doc = await buildLedgerPdf({ rows: sorted, filtersText: filtersText(), groupByClient });
      doc.save(`payment-ledger-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      setError('Could not create the PDF. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleCsv = () => {
    const headers = ['Job Date', 'Client', 'Site', 'Job Card', 'Callouts', 'Expected', 'Paid', 'Balance', 'Paid On', 'Payment Due Date', 'Status'];
    const csv = sorted.map((r) => [
      formatDate(r.jobDate), r.client || '', r.site || '', r.jobCardRef || '', r.callouts, r.expected, r.paid, r.balance,
      paidOnList(r).map(formatDate).join('; '), formatDate(r.paymentDueDate), r.status,
    ]);
    downloadCSV(`payment-ledger-${new Date().toISOString().slice(0, 10)}.csv`, headers, csv);
  };

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Client</label>
          <select className="input" value={filters.client} onChange={(e) => setFilters({ ...filters, client: e.target.value })}>
            <option value="">All clients</option>
            {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All statuses</option>
            <option>Pending</option>
            <option>Partially Paid</option>
            <option>Paid</option>
            <option>Overpaid</option>
          </select>
        </div>
        <div>
          <label className="label">Job date from</label>
          <input type="date" className="input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </div>
        <div>
          <label className="label">to</label>
          <input type="date" className="input" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 pb-2">
          <input type="checkbox" checked={groupByClient} onChange={(e) => setGroupByClient(e.target.checked)} />
          Group by client in the PDF
        </label>
        <div className="flex gap-2 ml-auto">
          <button onClick={handleCsv} disabled={rows.length === 0} className="btn-secondary flex items-center gap-1.5">
            <Download size={15} /> Export CSV
          </button>
          <button onClick={handlePdf} disabled={rows.length === 0 || busy} className="btn-primary flex items-center gap-1.5">
            <FileDown size={15} /> {busy ? 'Preparing...' : 'Download PDF'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card"><div className="text-xs text-slate-400 uppercase mb-1">Total Expected</div><div className="text-xl font-bold">{formatKES(totals.expected)}</div></div>
        <div className="card"><div className="text-xs text-slate-400 uppercase mb-1">Total Paid</div><div className="text-xl font-bold text-green-700">{formatKES(totals.paid)}</div></div>
        <div className="card"><div className="text-xs text-slate-400 uppercase mb-1">Balance Remaining</div><div className="text-xl font-bold text-amber-600">{formatKES(totals.balance)}</div></div>
        <div className="card"><div className="text-xs text-slate-400 uppercase mb-1">Collected</div><div className="text-xl font-bold">{percent === null ? '-' : `${percent}%`}</div></div>
      </div>

      {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <th className="py-2.5 px-4">Job Date</th>
                <th className="py-2.5 px-4">Client</th>
                <th className="py-2.5 px-4">Site</th>
                <th className="py-2.5 px-4">Callouts</th>
                <th className="py-2.5 px-4">Expected</th>
                <th className="py-2.5 px-4">Paid</th>
                <th className="py-2.5 px-4">Balance</th>
                <th className="py-2.5 px-4">Paid On</th>
                <th className="py-2.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.jobId} onClick={() => navigate(`/jobs/${r.jobId}`)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer">
                  <td className="py-2.5 px-4">{formatDate(r.jobDate)}</td>
                  <td className="py-2.5 px-4 font-medium text-ink-900">{r.client}</td>
                  <td className="py-2.5 px-4 text-slate-600">{r.site}</td>
                  <td className="py-2.5 px-4 text-slate-600">{r.callouts}</td>
                  <td className="py-2.5 px-4">{formatKES(r.expected)}</td>
                  <td className="py-2.5 px-4 text-green-700">{formatKES(r.paid)}</td>
                  <td className={`py-2.5 px-4 font-medium ${r.balance > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{formatKES(r.balance)}</td>
                  <td className="py-2.5 px-4 text-slate-600">
                    {paidOnList(r).length === 0 ? '-' : paidOnList(r).map((d, i) => <div key={i}>{formatDate(d)}</div>)}
                  </td>
                  <td className="py-2.5 px-4"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && <div className="text-center py-8 text-sm text-slate-400">No jobs match these choices.</div>}
        </div>
      )}

      <p className="text-xs text-slate-400">
        "Paid On" is the date written in each payment message, not the day you recorded it. Tap a job to open it.
      </p>
    </div>
  );
}