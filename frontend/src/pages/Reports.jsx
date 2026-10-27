import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import api from '../api/axios';
import { TableSkeleton } from '../components/Skeletons.jsx';
import { formatKES, siteLabel } from '../utils/format.js';
import { downloadCSV } from '../utils/exportCsv.js';
import { SortTh, useSort } from '../components/SortHeader.jsx';
import PaymentReport from '../components/PaymentReport.jsx';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Reports() {
  const [view, setView] = useState('profit');
  return (
    <div className="space-y-4">
      <Tabs value={view} onValueChange={setView}>
        <TabsList>
          <TabsTrigger value="profit">Client Profit</TabsTrigger>
          <TabsTrigger value="payments">Payment Report</TabsTrigger>
          <TabsTrigger value="sites">Sites by Client</TabsTrigger>
        </TabsList>
      </Tabs>
      {view === 'profit' && <ClientProfit />}
      {view === 'payments' && <PaymentReport />}
      {view === 'sites' && <SitesByClient />}
    </div>
  );
}

function ClientProfit() {
  const [period, setPeriod] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get('/reports/client-profit', { params: { period } })
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));
  }, [period]);

  const rows = data?.rows || [];
  const totals = data?.totals || { paid: 0, netFares: 0, profit: 0, generalExpenses: 0, netIncome: 0 };
  const { sorted, sort, toggle } = useSort(rows, 'profit', 'desc');
  const th = 'py-2.5 px-4';

  const handleExport = () => {
    const headers = ['Client', 'Callouts', 'Revenue (paid)', 'Net visit fares', 'Profit', 'Margin %', 'Outstanding'];
    const csv = sorted.map((r) => [
      r.client, r.callouts, r.paid, r.netFares, r.profit,
      r.margin === null ? '' : Math.round(r.margin), r.outstanding,
    ]);
    downloadCSV(`client-profit-${period}-${new Date().toISOString().slice(0, 10)}.csv`, headers, csv);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select className="input max-w-[180px]" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="all">All Time</option>
          <option value="year">This Year</option>
          <option value="month">This Month</option>
        </select>
        <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5">
          <Download size={15} /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="card">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Revenue (Paid)</div>
          <div className="text-xl font-bold text-ink-900">{formatKES(totals.paid)}</div>
        </div>
        <div className="card">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Net Visit Fares</div>
          <div className="text-xl font-bold text-amber-600">{formatKES(totals.netFares)}</div>
        </div>
        <div className="card">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Client Profit</div>
          <div className="text-xl font-bold text-brand-600">{formatKES(totals.profit)}</div>
        </div>
        <div className="card">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">General Expenses</div>
          <div className="text-xl font-bold text-red-600">{formatKES(totals.generalExpenses)}</div>
        </div>
        <div className="card">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Net Income</div>
          <div className={`text-xl font-bold ${totals.netIncome >= 0 ? 'text-brand-600' : 'text-red-600'}`}>
            {formatKES(totals.netIncome)}
          </div>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">No client activity in this period.</div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <SortTh label="Client" k="client" sort={sort} onSort={toggle} className={th} />
                <SortTh label="Callouts" k="callouts" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Revenue" k="paid" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Net Fares" k="netFares" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Profit" k="profit" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Margin" k="margin" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Outstanding" k="outstanding" sort={sort} onSort={toggle} firstDir="desc" className={th} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.clientId} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 px-4 font-medium text-ink-900">{r.client}</td>
                  <td className="py-2.5 px-4 text-slate-600">{r.callouts}</td>
                  <td className="py-2.5 px-4">{formatKES(r.paid)}</td>
                  <td className="py-2.5 px-4 text-slate-600">{formatKES(r.netFares)}</td>
                  <td className={`py-2.5 px-4 font-semibold ${r.profit >= 0 ? 'text-brand-600' : 'text-red-600'}`}>
                    {formatKES(r.profit)}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">{r.margin === null ? '-' : `${Math.round(r.margin)}%`}</td>
                  <td className="py-2.5 px-4 text-amber-600">{formatKES(r.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Client profit is revenue minus net visit fares (fares you spent minus fares reimbursed). General expenses such as
        tools and airtime are not tied to a client, so they are shown once above and taken off to give Net Income.
      </p>
    </div>
  );
}

function titleCase(str) {
  if (!str) return 'Unknown';
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function SitesByClient() {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/clients').then((res) => setClients(res.data));
  }, []);

  const loadSummary = (clientId) => {
    setSelectedClient(clientId);
    if (!clientId) return setSummary(null);
    setLoading(true);
    api.get(`/clients/${clientId}/summary`).then((res) => setSummary(res.data)).finally(() => setLoading(false));
  };

  const grouped = {};
  if (summary) {
    summary.sites.forEach((s) => {
      const rawLabel = s.siteType === 'Bank' ? s.bankName : s.siteType;
      const key = (rawLabel || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (!grouped[key]) grouped[key] = { label: titleCase(rawLabel), sites: [] };
      grouped[key].sites.push(s);
    });
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <label className="label">Select a client to see every site/branch you have attended</label>
        <select className="input max-w-sm" value={selectedClient} onChange={(e) => loadSummary(e.target.value)}>
          <option value="">Choose client...</option>
          {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
      </div>

      {loading && <TableSkeleton rows={4} />}

      {summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="card">
              <div className="text-xs text-slate-400 uppercase">Total Sites</div>
              <div className="text-xl font-bold">{summary.sites.length}</div>
            </div>
            <div className="card">
              <div className="text-xs text-slate-400 uppercase">Total Jobs</div>
              <div className="text-xl font-bold">{summary.jobs.length}</div>
            </div>
            <div className="card">
              <div className="text-xs text-slate-400 uppercase">Client</div>
              <div className="text-xl font-bold">{summary.client.name}</div>
            </div>
          </div>

          {Object.values(grouped).map((group) => (
            <div key={group.label} className="card">
              <div className="font-semibold text-ink-900 mb-3">{group.label}</div>
              <div className="space-y-1.5">
                {group.sites.map((s) => (
                  <div key={s._id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                    <span className="text-slate-600">- {siteLabel(s)}</span>
                    <span className="text-xs text-slate-400">{s.town}{s.county ? `, ${s.county}` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}