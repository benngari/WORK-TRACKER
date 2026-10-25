import { useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import api from '../api/axios';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatKES, formatDate } from '../utils/format.js';
import { downloadCSV } from '../utils/exportCsv.js';

export default function ClientStatement() {
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/clients').then((res) => setClients(res.data));
  }, []);

  useEffect(() => {
    if (!clientId) {
      setRows([]);
      return;
    }
    setLoading(true);
    const params = { client: clientId };
    if (from) params.from = from;
    if (to) params.to = to;
    api
      .get('/reports/ledger', { params })
      .then((res) => setRows(res.data))
      .finally(() => setLoading(false));
  }, [clientId, from, to]);

  const client = clients.find((c) => c._id === clientId);
  const shown = rows
    .filter((r) => !unpaidOnly || r.balance > 0)
    .sort((a, b) => new Date(a.jobDate) - new Date(b.jobDate));

  const totals = shown.reduce(
    (t, r) => ({
      callouts: t.callouts + r.callouts,
      expected: t.expected + r.expected,
      paid: t.paid + r.paid,
      balance: t.balance + r.balance,
    }),
    { callouts: 0, expected: 0, paid: 0, balance: 0 }
  );

  const periodText = from || to ? `${from ? formatDate(from) : 'Start'} to ${to ? formatDate(to) : 'Today'}` : 'All dates';

  const handleExport = () => {
    const headers = ['Date', 'Site', 'Job Card', 'Callouts', 'Expected', 'Paid', 'Balance', 'Status'];
    const data = shown.map((r) => [
      formatDate(r.jobDate), r.site || '', r.jobCardRef || '', r.callouts, r.expected, r.paid, r.balance, r.status,
    ]);
    data.push(['', '', 'TOTAL', totals.callouts, totals.expected, totals.paid, totals.balance, '']);
    const safeName = (client?.name || 'client').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    downloadCSV(`statement-${safeName}-${new Date().toISOString().slice(0, 10)}.csv`, headers, data);
  };

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 no-print">
        <div className="min-w-[200px]">
          <label className="label">Client</label>
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Select a client...</option>
            {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 pb-2">
          <input type="checkbox" checked={unpaidOnly} onChange={(e) => setUnpaidOnly(e.target.checked)} />
          Unpaid jobs only
        </label>
        <div className="flex gap-2 ml-auto">
          <button onClick={handleExport} disabled={!clientId} className="btn-secondary flex items-center gap-1.5">
            <Download size={15} /> Export Excel (CSV)
          </button>
          <button onClick={() => window.print()} disabled={!clientId} className="btn-secondary flex items-center gap-1.5">
            <Printer size={15} /> Print / PDF
          </button>
        </div>
      </div>

      {!clientId ? (
        <div className="card text-center py-10 text-slate-400">Choose a client to see their statement.</div>
      ) : loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : (
        <div className="card">
          <div className="mb-4">
            <div className="text-lg font-bold text-ink-900">Statement of Account</div>
            <div className="text-sm text-slate-600">{client?.name}</div>
            <div className="text-xs text-slate-400">
              Period: {periodText} | Generated: {formatDate(new Date())}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase border-b border-slate-200">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Site</th>
                  <th className="py-2 pr-4">Job Card</th>
                  <th className="py-2 pr-4 text-right">Callouts</th>
                  <th className="py-2 pr-4 text-right">Expected</th>
                  <th className="py-2 pr-4 text-right">Paid</th>
                  <th className="py-2 pr-4 text-right">Balance</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.jobId} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{formatDate(r.jobDate)}</td>
                    <td className="py-2 pr-4 text-slate-600">{r.site || '-'}</td>
                    <td className="py-2 pr-4 text-slate-600">{r.jobCardRef || '-'}</td>
                    <td className="py-2 pr-4 text-right">{r.callouts}</td>
                    <td className="py-2 pr-4 text-right">{formatKES(r.expected)}</td>
                    <td className="py-2 pr-4 text-right">{formatKES(r.paid)}</td>
                    <td className="py-2 pr-4 text-right font-medium">{formatKES(r.balance)}</td>
                    <td className="py-2"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={8} className="py-6 text-center text-slate-400">No jobs match these filters.</td></tr>
                )}
              </tbody>
              {shown.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-bold">
                    <td className="py-2 pr-4" colSpan={3}>TOTAL</td>
                    <td className="py-2 pr-4 text-right">{totals.callouts}</td>
                    <td className="py-2 pr-4 text-right">{formatKES(totals.expected)}</td>
                    <td className="py-2 pr-4 text-right">{formatKES(totals.paid)}</td>
                    <td className="py-2 pr-4 text-right text-amber-700">{formatKES(totals.balance)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="mt-4 text-right text-sm">
            Balance due: <span className="text-lg font-bold text-amber-700">{formatKES(totals.balance)}</span>
          </div>
        </div>
      )}
    </div>
  );
}