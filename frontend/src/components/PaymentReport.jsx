import { useEffect, useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import api from '../api/axios';
import { TableSkeleton } from './Skeletons.jsx';
import { formatKES, formatDate, siteLabel, getCurrency } from '../utils/format.js';
import { downloadCSV } from '../utils/exportCsv.js';
import { useToast } from '../context/ToastContext.jsx';
import { SortTh, useSort } from './SortHeader.jsx';

export default function PaymentReport() {
  const toast = useToast();
  const [clients, setClients] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [includeFares, setIncludeFares] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/clients'), api.get('/payments')])
      .then(([c, p]) => {
        setClients(c.data);
        setPayments(p.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const client = clients.find((c) => c._id === clientId);

  // One row per allocation: which payment, which site it paid for, and how much.
  const rows = useMemo(() => {
    if (!clientId) return [];
    const start = from ? new Date(from).getTime() : null;
    const end = to ? new Date(to).getTime() + 86399999 : null;
    const out = [];
    payments.forEach((p) => {
      const when = new Date(p.receivedDate).getTime();
      if (start !== null && when < start) return;
      if (end !== null && when > end) return;
      (p.allocations || []).forEach((a) => {
        const job = a.job;
        if (!job || job.deletedAt || job.client?._id !== clientId) return;
        if (a.allocationType === 'Fare' && !includeFares) return;
        out.push({
          id: a._id,
          paymentId: p._id,
          date: p.receivedDate,
          reference: p.mpesaTransaction?.transactionCode || p.reference || p.method,
          site: siteLabel(job.site),
          jobCard: job.jobCardRef || '',
          type: a.allocationType === 'Fare' ? 'Fare' : 'Job Payment',
          amount: a.amount,
        });
      });
    });
    return out;
  }, [payments, clientId, from, to, includeFares]);

  const { totals, siteRows } = useMemo(() => {
    const t = { all: 0, job: 0, fare: 0, count: 0 };
    const ids = new Set();
    const bySite = {};
    rows.forEach((r) => {
      t.all += r.amount;
      if (r.type === 'Fare') t.fare += r.amount;
      else t.job += r.amount;
      ids.add(r.paymentId);
      const s = bySite[r.site] || (bySite[r.site] = { site: r.site, ids: new Set(), job: 0, fare: 0, total: 0 });
      s.ids.add(r.paymentId);
      s.total += r.amount;
      if (r.type === 'Fare') s.fare += r.amount;
      else s.job += r.amount;
    });
    t.count = ids.size;
    const list = Object.values(bySite)
      .map((s) => ({ site: s.site, payments: s.ids.size, job: s.job, fare: s.fare, total: s.total }))
      .sort((a, b) => b.total - a.total);
    return { totals: t, siteRows: list };
  }, [rows]);

  const { sorted, sort, toggle } = useSort(rows, 'date', 'asc', {
    date: (r) => new Date(r.date).getTime(),
  });

  const periodText =
    from || to ? `${from ? formatDate(from) : 'Start'} to ${to ? formatDate(to) : 'Today'}` : 'All dates';
  const safeName = (client?.name || 'client').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const today = new Date().toISOString().slice(0, 10);

  const handlePdf = async () => {
    setGenerating(true);
    try {
      const { buildPaymentReportPdf } = await import('../utils/paymentReportPdf.js');
      const doc = await buildPaymentReportPdf({
        clientName: client.name,
        periodText,
        currency: getCurrency(),
        rows: sorted,
        siteRows,
        totals,
      });
      doc.save(`payment-report-${safeName}-${today}.pdf`);
      toast.success('PDF downloaded');
    } catch (err) {
      console.error(err);
      toast.error('Could not create the PDF');
    } finally {
      setGenerating(false);
    }
  };

  const handleCsv = () => {
    const headers = ['Date', 'Reference', 'Site', 'Job Card', 'Type', 'Amount'];
    const data = sorted.map((r) => [formatDate(r.date), r.reference || '', r.site || '', r.jobCard || '', r.type, r.amount]);
    data.push(['', '', '', '', 'TOTAL', totals.all]);
    downloadCSV(`payment-report-${safeName}-${today}.csv`, headers, data);
  };

  const th = 'py-2.5 px-4';
  const ready = Boolean(clientId) && rows.length > 0;

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3">
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
          <input type="checkbox" checked={includeFares} onChange={(e) => setIncludeFares(e.target.checked)} />
          Include fare reimbursements
        </label>
        <div className="flex gap-2 ml-auto">
          <button onClick={handleCsv} disabled={!ready} className="btn-secondary flex items-center gap-1.5 disabled:opacity-50">
            <Download size={15} /> Excel (CSV)
          </button>
          <button onClick={handlePdf} disabled={!ready || generating} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
            <FileText size={15} /> {generating ? 'Creating...' : 'Download PDF'}
          </button>
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : !clientId ? (
        <div className="card text-center py-10 text-slate-400">Choose a client and a period to build the report.</div>
      ) : rows.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">No payments found for {client?.name} in this period.</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="bg-brand-600 text-white px-5 py-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-lg font-bold">Payment Report</div>
              <div className="text-sm opacity-90">{client?.name}</div>
            </div>
            <div className="text-xs opacity-90 sm:text-right">
              <div>Period: {periodText}</div>
              <div>Generated: {formatDate(new Date())}</div>
            </div>
          </div>

          <div className="p-5 space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg bg-brand-50 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">Total Received</div>
                <div className="text-lg font-bold text-ink-900">{formatKES(totals.all)}</div>
              </div>
              <div className="rounded-lg bg-brand-50 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">Job Payments</div>
                <div className="text-lg font-bold text-ink-900">{formatKES(totals.job)}</div>
              </div>
              <div className="rounded-lg bg-brand-50 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">Fare Reimbursements</div>
                <div className="text-lg font-bold text-ink-900">{formatKES(totals.fare)}</div>
              </div>
              <div className="rounded-lg bg-brand-50 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">Payments</div>
                <div className="text-lg font-bold text-ink-900">{totals.count}</div>
              </div>
            </div>

            <div>
              <div className="font-semibold text-ink-900 mb-2">Paid by site</div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                      <th className={th}>Site</th>
                      <th className={`${th} text-right`}>Payments</th>
                      <th className={`${th} text-right`}>Job Payments</th>
                      <th className={`${th} text-right`}>Fares</th>
                      <th className={`${th} text-right`}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {siteRows.map((s) => (
                      <tr key={s.site} className="border-t border-slate-100">
                        <td className="py-2.5 px-4 font-medium text-ink-900">{s.site}</td>
                        <td className="py-2.5 px-4 text-right text-slate-600">{s.payments}</td>
                        <td className="py-2.5 px-4 text-right">{formatKES(s.job)}</td>
                        <td className="py-2.5 px-4 text-right text-slate-600">{formatKES(s.fare)}</td>
                        <td className="py-2.5 px-4 text-right font-semibold">{formatKES(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-brand-50 font-bold text-brand-700">
                      <td className="py-2.5 px-4">TOTAL</td>
                      <td className="py-2.5 px-4 text-right">{totals.count}</td>
                      <td className="py-2.5 px-4 text-right">{formatKES(totals.job)}</td>
                      <td className="py-2.5 px-4 text-right">{formatKES(totals.fare)}</td>
                      <td className="py-2.5 px-4 text-right">{formatKES(totals.all)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div>
              <div className="font-semibold text-ink-900 mb-2">Payment details</div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                      <SortTh label="Date" k="date" sort={sort} onSort={toggle} className={th} />
                      <SortTh label="Reference" k="reference" sort={sort} onSort={toggle} className={th} />
                      <SortTh label="Site" k="site" sort={sort} onSort={toggle} className={th} />
                      <th className={th}>Job Card</th>
                      <SortTh label="Type" k="type" sort={sort} onSort={toggle} className={th} />
                      <SortTh label="Amount" k="amount" sort={sort} onSort={toggle} firstDir="desc" className={`${th} text-right`} />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="py-2.5 px-4 whitespace-nowrap">{formatDate(r.date)}</td>
                        <td className="py-2.5 px-4 font-mono text-xs text-ink-800">{r.reference || '-'}</td>
                        <td className="py-2.5 px-4 text-slate-600">{r.site}</td>
                        <td className="py-2.5 px-4 text-slate-600">{r.jobCard || '-'}</td>
                        <td className="py-2.5 px-4 text-slate-600">{r.type}</td>
                        <td className="py-2.5 px-4 text-right font-medium">{formatKES(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-brand-50 font-bold text-brand-700">
                      <td className="py-2.5 px-4" colSpan={5}>TOTAL</td>
                      <td className="py-2.5 px-4 text-right">{formatKES(totals.all)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}