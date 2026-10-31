import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, ChevronDown, ChevronRight } from 'lucide-react';
import api from '../api/axios';
import { TableSkeleton } from './Skeletons.jsx';
import StatusBadge from './StatusBadge.jsx';
import { formatKES, formatDate, siteLabel } from '../utils/format.js';
import { downloadCSV } from '../utils/exportCsv.js';
import { SortTh, useSort } from './SortHeader.jsx';

const GROUPS = [
  ['client', 'By client'],
  ['site', 'By site'],
  ['clientSite', 'By client and site'],
  ['month', 'By month'],
  ['status', 'By payment status'],
  ['job', 'Job by job'],
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// the date a job belongs to: its first visit, or when it was created if no visit is recorded yet
const jobDate = (j) => j.firstVisit || j.createdAt;
const dayKey = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '');

function groupOf(job, by) {
  const client = (job.client && job.client.name) || 'Unknown client';
  const site = siteLabel(job.site);
  switch (by) {
    case 'client':
      return { key: (job.client && job.client._id) || client, label: client, sub: '' };
    case 'site':
      return { key: (job.site && job.site._id) || site, label: site, sub: client };
    case 'clientSite':
      return { key: `${(job.client && job.client._id) || client}|${(job.site && job.site._id) || site}`, label: `${client} - ${site}`, sub: '' };
    case 'month': {
      const d = jobDate(job);
      const key = d ? dayKey(d).slice(0, 7) : 'none';
      const label = d ? `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}` : 'No date';
      return { key, label, sub: '' };
    }
    case 'status':
      return { key: job.paymentStatus || 'Pending', label: job.paymentStatus || 'Pending', sub: '' };
    default:
      return { key: job._id, label: `${client} - ${site}${job.jobCardRef ? ` (${job.jobCardRef})` : ''}`, sub: formatDate(jobDate(job)) };
  }
}

// How much was expected, how much has been paid and how much is still owed - grouped the way you choose.
export default function PaidBalanceReport() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [by, setBy] = useState('client');
  const [period, setPeriod] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [onlyOwing, setOnlyOwing] = useState(false);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api
      .get('/jobs')
      .then((res) => setJobs(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load jobs'))
      .finally(() => setLoading(false));
  }, []);

  const range = useMemo(() => {
    const now = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10); // today, Kenya time
    if (period === 'year') return { start: `${now.slice(0, 4)}-01-01`, end: '' };
    if (period === 'month') return { start: `${now.slice(0, 7)}-01`, end: '' };
    if (period === 'custom') return { start: from, end: to };
    return { start: '', end: '' };
  }, [period, from, to]);

  const { rows, totals } = useMemo(() => {
    const inRange = jobs.filter((j) => {
      const day = dayKey(jobDate(j));
      if (range.start && day < range.start) return false;
      if (range.end && day > range.end) return false;
      return true;
    });
    const map = {};
    for (const j of inRange) {
      const g = groupOf(j, by);
      const row = (map[g.key] = map[g.key] || { key: g.key, label: g.label, sub: g.sub, jobs: [], days: 0, expected: 0, paid: 0, balance: 0 });
      row.jobs.push(j);
      row.days += j.attendanceCount || 0;
      row.expected += j.expected || 0;
      row.paid += j.paid || 0;
      row.balance += j.outstanding || 0;
    }
    let list = Object.values(map).map((r) => ({ ...r, percent: r.expected > 0 ? Math.round((r.paid / r.expected) * 100) : null }));
    if (onlyOwing) list = list.filter((r) => r.balance > 0);
    const t = list.reduce(
      (sum, r) => ({ jobs: sum.jobs + r.jobs.length, days: sum.days + r.days, expected: sum.expected + r.expected, paid: sum.paid + r.paid, balance: sum.balance + r.balance }),
      { jobs: 0, days: 0, expected: 0, paid: 0, balance: 0 }
    );
    return { rows: list, totals: t };
  }, [jobs, by, range, onlyOwing]);

  const { sorted, sort, toggle } = useSort(rows, 'balance', 'desc', { jobs: (r) => r.jobs.length });
  const th = 'py-2.5 px-4';
  const percentAll = totals.expected > 0 ? Math.round((totals.paid / totals.expected) * 100) : null;

  const handleExport = () => {
    const headers = ['Name', 'Jobs', 'Days', 'Expected', 'Paid', 'Balance remaining', '% paid'];
    const csv = sorted.map((r) => [r.sub ? `${r.label} (${r.sub})` : r.label, r.jobs.length, r.days, r.expected, r.paid, r.balance, r.percent === null ? '' : r.percent]);
    csv.push(['TOTAL', totals.jobs, totals.days, totals.expected, totals.paid, totals.balance, percentAll === null ? '' : percentAll]);
    downloadCSV(`paid-and-balance-${by}-${new Date().toISOString().slice(0, 10)}.csv`, headers, csv);
  };

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Group</label>
          <select className="input" value={by} onChange={(e) => { setBy(e.target.value); setOpen(null); }}>
            {GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Period</label>
          <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="all">All time</option>
            <option value="year">This year</option>
            <option value="month">This month</option>
            <option value="custom">Choose dates</option>
          </select>
        </div>
        {period === 'custom' && (
          <>
            <div>
              <label className="label">From</label>
              <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600 pb-2">
          <input type="checkbox" checked={onlyOwing} onChange={(e) => setOnlyOwing(e.target.checked)} />
          Only where a balance remains
        </label>
        <button onClick={handleExport} disabled={rows.length === 0} className="btn-secondary flex items-center gap-1.5 ml-auto">
          <Download size={15} /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Expected</div>
          <div className="text-xl font-bold text-ink-900">{formatKES(totals.expected)}</div>
          <div className="text-xs text-slate-400 mt-1">{totals.jobs} job(s), {totals.days} day(s)</div>
        </div>
        <div className="card">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Paid</div>
          <div className="text-xl font-bold text-green-700">{formatKES(totals.paid)}</div>
        </div>
        <div className="card">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Balance remaining</div>
          <div className="text-xl font-bold text-amber-600">{formatKES(totals.balance)}</div>
        </div>
        <div className="card">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Collected</div>
          <div className="text-xl font-bold text-ink-900">{percentAll === null ? '-' : `${percentAll}%`}</div>
        </div>
      </div>

      {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}

      {loading ? (
        <TableSkeleton rows={5} />
      ) : sorted.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">Nothing to show for these choices.</div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <th className="py-2.5 px-4 w-8"></th>
                <SortTh label="Name" k="label" sort={sort} onSort={toggle} className={th} />
                <SortTh label="Jobs" k="jobs" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Days" k="days" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Expected" k="expected" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Paid" k="paid" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Balance remaining" k="balance" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="% paid" k="percent" sort={sort} onSort={toggle} firstDir="desc" className={th} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const isOpen = open === r.key;
                return (
                  <Fragment key={r.key}>
                    <tr onClick={() => setOpen(isOpen ? null : r.key)} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer">
                      <td className="py-2.5 px-4 text-slate-400">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                      <td className="py-2.5 px-4 font-medium text-ink-900">
                        {r.label}
                        {r.sub && <div className="text-xs font-normal text-slate-400">{r.sub}</div>}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{r.jobs.length}</td>
                      <td className="py-2.5 px-4 text-slate-600">{r.days}</td>
                      <td className="py-2.5 px-4">{formatKES(r.expected)}</td>
                      <td className="py-2.5 px-4 text-green-700">{formatKES(r.paid)}</td>
                      <td className={`py-2.5 px-4 font-semibold ${r.balance > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{formatKES(r.balance)}</td>
                      <td className="py-2.5 px-4 text-slate-600">{r.percent === null ? '-' : `${r.percent}%`}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <td></td>
                        <td colSpan={7} className="py-3 px-4">
                          <div className="space-y-1.5">
                            {[...r.jobs]
                              .sort((a, b) => (b.outstanding || 0) - (a.outstanding || 0))
                              .map((j) => (
                                <Link
                                  key={j._id}
                                  to={`/jobs/${j._id}`}
                                  className="flex flex-wrap items-center justify-between gap-2 text-xs rounded-lg bg-white px-3 py-2 border border-slate-100 hover:border-brand-200"
                                >
                                  <span className="text-ink-800">
                                    {formatDate(jobDate(j))} - {(j.client && j.client.name) || ''} - {siteLabel(j.site)}
                                    {j.jobCardRef ? ` (${j.jobCardRef})` : ''}
                                  </span>
                                  <span className="flex items-center gap-3">
                                    <span className="text-slate-500">Expected {formatKES(j.expected)}</span>
                                    <span className="text-green-700">Paid {formatKES(j.paid)}</span>
                                    <span className="text-amber-600">Balance {formatKES(j.outstanding)}</span>
                                    <StatusBadge status={j.paymentStatus} />
                                  </span>
                                </Link>
                              ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              <tr className="font-semibold text-ink-900 bg-slate-50">
                <td></td>
                <td className="py-2.5 px-4">Total</td>
                <td className="py-2.5 px-4">{totals.jobs}</td>
                <td className="py-2.5 px-4">{totals.days}</td>
                <td className="py-2.5 px-4">{formatKES(totals.expected)}</td>
                <td className="py-2.5 px-4 text-green-700">{formatKES(totals.paid)}</td>
                <td className="py-2.5 px-4 text-amber-600">{formatKES(totals.balance)}</td>
                <td className="py-2.5 px-4">{percentAll === null ? '-' : `${percentAll}%`}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Paid means job payments only, not fares you were reimbursed. Each job is counted in the period of its first visit.
        Click a row to see the jobs behind it, and click a job to open it.
      </p>
    </div>
  );
}