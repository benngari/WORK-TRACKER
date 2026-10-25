# Work Tracker update: Client Profit report + sortable columns (Jobs, Sites, Ledger, Outstanding).
# Run apply-expenses.ps1 FIRST. Then, from your project ROOT:
#   powershell -ExecutionPolicy Bypass -File .\apply-sorting-profit.ps1
$ErrorActionPreference = "Stop"
if (-not (Test-Path ./backend) -or -not (Test-Path ./frontend)) {
    Write-Host "ERROR: Run this from the project root (folder containing backend and frontend)." -ForegroundColor Red; exit 1
}
if (-not (Test-Path ./backend/models/Expense.js)) {
    Write-Host "ERROR: Run apply-expenses.ps1 first (the Expense model is missing)." -ForegroundColor Red; exit 1
}
function Write-FileUtf8NoBom {
    param([string]$Path, [string]$Content)
    $fullPath = Join-Path (Get-Location) $Path
    $dir = Split-Path -Path $fullPath -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($fullPath, $Content, $utf8NoBom)
    Write-Host ("  wrote " + $Path) -ForegroundColor Green
}

$f1 = @'
import { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';

// Sorts rows by a column. Blank values always sort last. `getters` maps a
// column key to a function returning a number (dates as timestamps) or text.
export function useSort(rows, defaultKey = null, defaultDir = 'desc', getters = {}) {
  const [sort, setSort] = useState({ key: defaultKey, dir: defaultDir });

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const get = getters[sort.key] || ((r) => r[sort.key]);
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const xBlank = x === null || x === undefined || x === '';
      const yBlank = y === null || y === undefined || y === '';
      if (xBlank && yBlank) return 0;
      if (xBlank) return 1;
      if (yBlank) return -1;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * factor;
      return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' }) * factor;
    });
  }, [rows, sort]);

  const toggle = (key, firstDir = 'asc') => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstDir }
    );
  };

  return { sorted, sort, toggle };
}

export function SortTh({ label, k, sort, onSort, firstDir = 'asc', className = '' }) {
  const active = sort.key === k;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`${className} cursor-pointer select-none`} onClick={() => onSort(k, firstDir)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon size={12} className={active ? 'text-brand-600' : 'text-slate-300'} />
      </span>
    </th>
  );
}
'@
Write-FileUtf8NoBom -Path "frontend/src/components/SortHeader.jsx" -Content $f1
$f2 = @'
const Job = require('../models/Job');
const Attendance = require('../models/Attendance');
const PaymentAllocation = require('../models/PaymentAllocation');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const { batchComputeFinancials } = require('./jobController');

exports.ledger = async (req, res) => {
  try {
    const filter = { owner: req.user.id, deletedAt: null };
    if (req.query.client) filter.client = req.query.client;
    if (req.query.site) filter.site = req.query.site;

    const jobs = await Job.find(filter).populate('client').populate('site').sort({ createdAt: -1 }).lean();
    const withFinancials = await batchComputeFinancials(jobs, req.user.id);

    let rows = withFinancials.map((job) => {
      const dates = (job.attendance || []).map((a) => a.date).sort((a, b) => new Date(a) - new Date(b));
      return {
        jobId: job._id,
        jobDate: dates[0] || job.createdAt,
        lastAttendance: dates[dates.length - 1] || null,
        client: job.client?.name,
        site: job.site
          ? job.site.siteType === 'Bank'
            ? [job.site.bankName, job.site.branch].filter(Boolean).join(' - ')
            : job.site.siteName
          : null,
        jobCardRef: job.jobCardRef,
        callouts: job.attendanceCount,
        expected: job.expected,
        paid: job.paid,
        balance: job.outstanding,
        paymentDueDate: job.paymentDueDate,
        status: job.paymentStatus,
      };
    });

    if (req.query.status) rows = rows.filter((r) => r.status === req.query.status);
    if (req.query.from) rows = rows.filter((r) => r.jobDate && new Date(r.jobDate) >= new Date(req.query.from));
    if (req.query.to) rows = rows.filter((r) => r.jobDate && new Date(r.jobDate) <= new Date(req.query.to));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to build payment ledger', error: err.message });
  }
};

exports.outstanding = async (req, res) => {
  try {
    const jobs = await Job.find({ owner: req.user.id, deletedAt: null }).populate('client').populate('site').lean();
    const withFinancials = await batchComputeFinancials(jobs, req.user.id);
    const now = new Date();

    const rows = withFinancials
      .filter((job) => job.outstanding > 0)
      .map((job) => {
        const dates = (job.attendance || []).map((a) => a.date).sort((a, b) => new Date(a) - new Date(b));
        const lastAttendance = dates[dates.length - 1] || null;
        const daysOutstanding = lastAttendance
          ? Math.floor((Date.now() - new Date(lastAttendance).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        const isOverdue = Boolean(job.paymentDueDate && new Date(job.paymentDueDate) < now);
        return {
          jobId: job._id,
          client: job.client?.name,
          site: job.site
            ? job.site.siteType === 'Bank'
              ? [job.site.bankName, job.site.branch].filter(Boolean).join(' - ')
              : job.site.siteName
            : null,
          jobCardRef: job.jobCardRef,
          expected: job.expected,
          paid: job.paid,
          outstanding: job.outstanding,
          lastAttendance,
          paymentDueDate: job.paymentDueDate,
          daysOutstanding,
          isOverdue,
          status: job.paymentStatus,
        };
      })
      .sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        return b.outstanding - a.outstanding;
      });

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to build outstanding report', error: err.message });
  }
};

exports.overdueSummary = async (req, res) => {
  try {
    const jobs = await Job.find({ owner: req.user.id, deletedAt: null }).lean();
    const withFinancials = await batchComputeFinancials(jobs, req.user.id);
    const now = new Date();

    const overdue = withFinancials.filter(
      (job) => job.outstanding > 0 && job.paymentDueDate && new Date(job.paymentDueDate) < now
    );

    res.json({
      count: overdue.length,
      totalAmount: overdue.reduce((sum, j) => sum + j.outstanding, 0),
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to build overdue summary', error: err.message });
  }
};

function getPeriodRange(period) {
  const now = new Date();
  if (period === 'month') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }
  if (period === 'year') {
    return {
      from: new Date(now.getFullYear(), 0, 1),
      to: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  }
  return null;
}

// Profit per client = job payments received minus net visit fares (fares you
// spent minus fares you were reimbursed). General expenses (tools, airtime...)
// are not tied to a client, so they are reported once in the totals.
exports.clientProfit = async (req, res) => {
  try {
    const owner = req.user.id;
    const period = ['month', 'year'].includes(req.query.period) ? req.query.period : 'all';
    const range = getPeriodRange(period);
    const inRange = (d) => !range || (d >= range.from && d <= range.to);

    const jobs = await Job.find({ owner, deletedAt: null }).populate('client', 'name').lean();
    const jobIds = jobs.map((j) => j._id);

    const [attendance, allocations, payments, expenses] = await Promise.all([
      Attendance.find({ job: { $in: jobIds }, owner }).lean(),
      PaymentAllocation.find({ job: { $in: jobIds }, owner }).lean(),
      Payment.find({ owner }).select('receivedDate').lean(),
      Expense.find({ owner }).lean(),
    ]);

    const rowsByClient = {};
    const jobRow = {};
    for (const j of jobs) {
      const id = String(j.client?._id || 'unknown');
      rowsByClient[id] = rowsByClient[id] || {
        clientId: id,
        client: j.client?.name || 'Unknown',
        callouts: 0,
        expected: 0,
        paid: 0,
        fareSpent: 0,
        fareReceived: 0,
      };
      jobRow[String(j._id)] = rowsByClient[id];
    }

    for (const a of attendance) {
      if (!inRange(a.date)) continue;
      const row = jobRow[String(a.job)];
      if (!row) continue;
      row.callouts += 1;
      row.expected += a.rate;
      row.fareSpent += a.fare || 0;
    }

    const paymentDate = {};
    for (const p of payments) paymentDate[String(p._id)] = p.receivedDate;

    for (const al of allocations) {
      const d = paymentDate[String(al.payment)];
      if (!d || !inRange(d)) continue;
      const row = jobRow[String(al.job)];
      if (!row) continue;
      if (al.allocationType === 'Fare') row.fareReceived += al.amount;
      else row.paid += al.amount;
    }

    const rows = Object.values(rowsByClient)
      .map((r) => {
        const netFares = r.fareSpent - r.fareReceived;
        const profit = r.paid - netFares;
        return {
          ...r,
          netFares,
          profit,
          margin: r.paid > 0 ? (profit / r.paid) * 100 : null,
          outstanding: Math.max(0, r.expected - r.paid),
        };
      })
      .filter((r) => r.callouts > 0 || r.paid > 0 || r.fareSpent > 0 || r.outstanding > 0);

    const paid = rows.reduce((s, r) => s + r.paid, 0);
    const netFares = rows.reduce((s, r) => s + r.netFares, 0);
    const profit = rows.reduce((s, r) => s + r.profit, 0);
    const generalExpenses = expenses.filter((e) => inRange(new Date(e.date))).reduce((s, e) => s + e.amount, 0);

    res.json({
      period,
      rows,
      totals: { paid, netFares, profit, generalExpenses, netIncome: profit - generalExpenses },
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to build client profit report', error: err.message });
  }
};
'@
Write-FileUtf8NoBom -Path "backend/controllers/reportController.js" -Content $f2
$f3 = @'
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reportController');
const auth = require('../middleware/auth');

router.use(auth);
router.get('/ledger', ctrl.ledger);
router.get('/outstanding', ctrl.outstanding);
router.get('/overdue-summary', ctrl.overdueSummary);
router.get('/client-profit', ctrl.clientProfit);

module.exports = router;
'@
Write-FileUtf8NoBom -Path "backend/routes/reports.js" -Content $f3
$f4 = @'
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import api from '../api/axios';
import { formatKES, siteLabel } from '../utils/format.js';
import { downloadCSV } from '../utils/exportCsv.js';
import { SortTh, useSort } from '../components/SortHeader.jsx';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Reports() {
  const [view, setView] = useState('profit');
  return (
    <div className="space-y-4">
      <Tabs value={view} onValueChange={setView}>
        <TabsList>
          <TabsTrigger value="profit">Client Profit</TabsTrigger>
          <TabsTrigger value="sites">Sites by Client</TabsTrigger>
        </TabsList>
      </Tabs>
      {view === 'profit' ? <ClientProfit /> : <SitesByClient />}
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
        <div className="text-sm text-slate-400">Loading...</div>
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

      {loading && <div className="text-sm text-slate-400">Loading...</div>}

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
'@
Write-FileUtf8NoBom -Path "frontend/src/pages/Reports.jsx" -Content $f4
$f5 = @'
import { useEffect, useState } from 'react';
import { Plus, Briefcase, Copy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Modal from '../components/Modal.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { SortTh, useSort } from '../components/SortHeader.jsx';
import { formatKES, formatDate, siteLabel } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

const emptyForm = {
  client: '', site: '', jobCardRef: '', jobType: '', description: '',
  status: 'Open', rate: 1500, paymentDueDate: '', notes: '',
  date: new Date().toISOString().slice(0, 10), fare: 0,
};

const emptyQuickClient = { name: '', type: 'Direct Client', contactPerson: '', phone: '', defaultRate: 1500 };
const emptyQuickSite = {
  siteType: 'Bank', bankName: '', branch: '', branchCode: '',
  siteName: '', town: '', county: '', isNairobi: false,
};

function loadStoredFilters() {
  try {
    const raw = localStorage.getItem('wt_job_filters');
    return raw ? JSON.parse(raw) : { client: '', status: '' };
  } catch {
    return { client: '', status: '' };
  }
}

export default function Jobs() {
  const navigate = useNavigate();
  const toast = useToast();
  const [jobs, setJobs] = useState([]);
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(loadStoredFilters);
  const [repeatJob, setRepeatJob] = useState(null);

  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickClientForm, setQuickClientForm] = useState(emptyQuickClient);
  const [quickClientSaving, setQuickClientSaving] = useState(false);

  const [quickSiteOpen, setQuickSiteOpen] = useState(false);
  const [quickSiteForm, setQuickSiteForm] = useState(emptyQuickSite);
  const [quickSiteSaving, setQuickSiteSaving] = useState(false);

  const { sorted, sort, toggle } = useSort(jobs, 'date', 'desc', {
    date: (j) => (j.date ? new Date(j.date).getTime() : null),
    client: (j) => j.client?.name,
    site: (j) => siteLabel(j.site),
  });

  const load = () => {
    setLoading(true);
    const params = {};
    if (filters.client) params.client = filters.client;
    if (filters.status) params.status = filters.status;
    Promise.all([api.get('/jobs', { params }), api.get('/clients'), api.get('/sites')])
      .then(([j, c, s]) => {
        setJobs(j.data);
        setClients(c.data);
        setSites(s.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [filters]);

  const updateFilters = (next) => {
    setFilters(next);
    localStorage.setItem('wt_job_filters', JSON.stringify(next));
  };

  const clientSites = sites.filter((s) => s.client?._id === form.client);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { client, site, jobCardRef, jobType, description, status, rate, paymentDueDate, notes } = form;
      const { data: job } = await api.post('/jobs', {
        client, site, jobCardRef, jobType, description, status, rate, paymentDueDate, notes,
      });

      await api.post('/attendance', {
        job: job._id,
        date: form.date,
        rate: form.rate,
        fare: form.fare,
      });

      toast.success('Job created');
      setModalOpen(false);
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create job');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickClientSubmit = async (e) => {
    e.preventDefault();
    setQuickClientSaving(true);
    try {
      const { data: newClient } = await api.post('/clients', quickClientForm);
      toast.success('Client added');
      setClients((prev) => [...prev, newClient].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((prev) => ({ ...prev, client: newClient._id, site: '', rate: newClient.defaultRate || prev.rate }));
      setQuickClientOpen(false);
      setQuickClientForm(emptyQuickClient);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add client');
    } finally {
      setQuickClientSaving(false);
    }
  };

  const handleQuickSiteSubmit = async (e) => {
    e.preventDefault();
    setQuickSiteSaving(true);
    try {
      const { data: newSite } = await api.post('/sites', { ...quickSiteForm, client: form.client });
      toast.success('Site added');
      setSites((prev) => [...prev, newSite]);
      setForm((prev) => ({ ...prev, site: newSite._id }));
      setQuickSiteOpen(false);
      setQuickSiteForm(emptyQuickSite);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add site');
    } finally {
      setQuickSiteSaving(false);
    }
  };

  const th = 'py-3 px-4';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <select className="input max-w-xs" value={filters.client} onChange={(e) => updateFilters({ ...filters, client: e.target.value })}>
            <option value="">All Clients</option>
            {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <select className="input max-w-xs" value={filters.status} onChange={(e) => updateFilters({ ...filters, status: e.target.value })}>
            <option value="">All Statuses</option>
            <option>Open</option>
            <option>In Progress</option>
            <option>Completed</option>
            <option>Cancelled</option>
          </select>
        </div>
        <button className="btn-primary flex items-center gap-1.5" onClick={() => setModalOpen(true)}>
          <Plus size={16} /> New Job
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : jobs.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">
          <Briefcase className="mx-auto mb-2" />
          No jobs yet.
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <SortTh label="Date" k="date" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Client" k="client" sort={sort} onSort={toggle} className={th} />
                <SortTh label="Site" k="site" sort={sort} onSort={toggle} className={th} />
                <th className={th}>Job Card</th>
                <SortTh label="Callouts" k="attendanceCount" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Expected" k="expected" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Paid" k="paid" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Balance" k="outstanding" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Status" k="paymentStatus" sort={sort} onSort={toggle} className={th} />
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((j) => (
                <tr
                  key={j._id}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer"
                  onClick={() => navigate(`/jobs/${j._id}`)}
                >
                  <td className="py-2.5 px-4 text-slate-600">{formatDate(j.date)}</td>
                  <td className="py-2.5 px-4 font-medium text-ink-900">{j.client?.name}</td>
                  <td className="py-2.5 px-4 text-slate-600">{siteLabel(j.site)}</td>
                  <td className="py-2.5 px-4 text-slate-600">{j.jobCardRef || '-'}</td>
                  <td className="py-2.5 px-4 text-slate-600">{j.attendanceCount}</td>
                  <td className="py-2.5 px-4 text-slate-600">{formatKES(j.expected)}</td>
                  <td className="py-2.5 px-4 text-slate-600">{formatKES(j.paid)}</td>
                  <td className="py-2.5 px-4 font-medium text-amber-600">{formatKES(j.outstanding)}</td>
                  <td className="py-2.5 px-4"><StatusBadge status={j.paymentStatus} /></td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRepeatJob(j);
                      }}
                      className="text-slate-400 hover:text-brand-600"
                      title="Repeat this job (same client/site/rate, new date)"
                    >
                      <Copy size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Job" wide>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">Client</label>
                <button type="button" onClick={() => setQuickClientOpen(true)} className="text-xs text-brand-600 font-medium">
                  + New Client
                </button>
              </div>
              <select required className="input" value={form.client} onChange={(e) => {
                const client = clients.find((c) => c._id === e.target.value);
                setForm({ ...form, client: e.target.value, site: '', rate: client?.defaultRate || 1500 });
              }}>
                <option value="">Select client...</option>
                {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">Site</label>
                <button
                  type="button"
                  onClick={() => setQuickSiteOpen(true)}
                  disabled={!form.client}
                  className="text-xs text-brand-600 font-medium disabled:text-slate-300"
                >
                  + New Site
                </button>
              </div>
              <select required className="input" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} disabled={!form.client}>
                <option value="">Select site...</option>
                {clientSites.map((s) => <option key={s._id} value={s._id}>{siteLabel(s)}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Date of Visit</label>
              <input required type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="label">Rate</label>
              <input type="number" className="input" value={form.rate} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Fare</label>
              <input type="number" className="input" value={form.fare} onChange={(e) => setForm({ ...form, fare: Number(e.target.value) })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Job Card / Reference</label>
              <input className="input" value={form.jobCardRef} onChange={(e) => setForm({ ...form, jobCardRef: e.target.value })} />
            </div>
            <div>
              <label className="label">Job Type</label>
              <input className="input" value={form.jobType} onChange={(e) => setForm({ ...form, jobType: e.target.value })} placeholder="e.g. Repair, Installation" />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>Open</option>
                <option>In Progress</option>
                <option>Completed</option>
                <option>Cancelled</option>
              </select>
            </div>
            <div>
              <label className="label">Payment Due Date</label>
              <input type="date" className="input" value={form.paymentDueDate} onChange={(e) => setForm({ ...form, paymentDueDate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button disabled={saving} className="btn-primary w-full">{saving ? 'Saving...' : 'Create Job'}</button>
        </form>
      </Modal>

      <Modal open={quickClientOpen} onClose={() => setQuickClientOpen(false)} title="Quick Add Client">
        <form onSubmit={handleQuickClientSubmit} className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input required className="input" value={quickClientForm.name} onChange={(e) => setQuickClientForm({ ...quickClientForm, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={quickClientForm.type} onChange={(e) => setQuickClientForm({ ...quickClientForm, type: e.target.value })}>
              <option>Contractor</option>
              <option>Direct Client</option>
              <option>Agency</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label className="label">Default Rate</label>
            <input type="number" className="input" value={quickClientForm.defaultRate} onChange={(e) => setQuickClientForm({ ...quickClientForm, defaultRate: Number(e.target.value) })} />
          </div>
          <button disabled={quickClientSaving} className="btn-primary w-full">{quickClientSaving ? 'Saving...' : 'Add Client & Continue'}</button>
        </form>
      </Modal>

      <Modal open={quickSiteOpen} onClose={() => setQuickSiteOpen(false)} title="Quick Add Site">
        <form onSubmit={handleQuickSiteSubmit} className="space-y-3">
          <div>
            <label className="label">Site Type</label>
            <select className="input" value={quickSiteForm.siteType} onChange={(e) => setQuickSiteForm({ ...quickSiteForm, siteType: e.target.value })}>
              <option>Bank</option>
              <option>Office</option>
              <option>Shop</option>
              <option>Warehouse</option>
              <option>Institution</option>
              <option>Customer Premises</option>
              <option>Other</option>
            </select>
          </div>
          {quickSiteForm.siteType === 'Bank' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Bank Name</label>
                <input required className="input" value={quickSiteForm.bankName} onChange={(e) => setQuickSiteForm({ ...quickSiteForm, bankName: e.target.value })} />
              </div>
              <div>
                <label className="label">Branch</label>
                <input required className="input" value={quickSiteForm.branch} onChange={(e) => setQuickSiteForm({ ...quickSiteForm, branch: e.target.value })} />
              </div>
            </div>
          ) : (
            <div>
              <label className="label">Site Name</label>
              <input required className="input" value={quickSiteForm.siteName} onChange={(e) => setQuickSiteForm({ ...quickSiteForm, siteName: e.target.value })} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Town</label>
              <input className="input" value={quickSiteForm.town} onChange={(e) => setQuickSiteForm({ ...quickSiteForm, town: e.target.value })} />
            </div>
            <div>
              <label className="label">County</label>
              <input className="input" value={quickSiteForm.county} onChange={(e) => setQuickSiteForm({ ...quickSiteForm, county: e.target.value })} />
            </div>
          </div>
          <button disabled={quickSiteSaving} className="btn-primary w-full">{quickSiteSaving ? 'Saving...' : 'Add Site & Continue'}</button>
        </form>
      </Modal>

      {repeatJob && (
        <RepeatJobModal job={repeatJob} onClose={() => setRepeatJob(null)} onDone={load} />
      )}
    </div>
  );
}

function RepeatJobModal({ job, onClose, onDone }) {
  const toast = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [fare, setFare] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data: newJob } = await api.post('/jobs', {
        client: job.client?._id,
        site: job.site?._id,
        jobCardRef: job.jobCardRef,
        jobType: job.jobType,
        description: job.description,
        status: 'Open',
        rate: job.rate,
        paymentDueDate: '',
      });
      await api.post('/attendance', { job: newJob._id, date, rate: job.rate, fare });
      toast.success('Job repeated');
      onClose();
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to repeat job');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title="Repeat This Job">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
        <div className="text-sm text-slate-500">
          Creates a new job for <span className="font-medium text-ink-800">{job.client?.name} - {siteLabel(job.site)}</span> with the same rate ({formatKES(job.rate)}) and job details.
        </div>
        <div>
          <label className="label">Date of Visit</label>
          <input required type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Fare</label>
          <input type="number" className="input" value={fare} onChange={(e) => setFare(Number(e.target.value))} />
        </div>
        <button disabled={saving} className="btn-primary w-full">{saving ? 'Creating...' : 'Create Repeat Job'}</button>
      </form>
    </Modal>
  );
}
'@
Write-FileUtf8NoBom -Path "frontend/src/pages/Jobs.jsx" -Content $f5
$f6 = @'
import { useEffect, useState } from 'react';
import { Plus, Trash2, MapPin, Pencil } from 'lucide-react';
import api from '../api/axios';
import Modal from '../components/Modal.jsx';
import { SortTh, useSort } from '../components/SortHeader.jsx';
import { siteLabel, formatDate } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

const siteTypes = ['Bank', 'Office', 'Shop', 'Warehouse', 'Institution', 'Customer Premises', 'Other'];

const emptyForm = {
  client: '', siteType: 'Bank', bankName: '', branch: '', branchCode: '',
  siteName: '', location: '', town: '', county: '', isNairobi: false, notes: '',
};

function normalize(str) {
  return (str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export default function Sites() {
  const toast = useToast();
  const [sites, setSites] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [filterClient, setFilterClient] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/sites'), api.get('/clients')])
      .then(([s, c]) => {
        setSites(s.data);
        setClients(c.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = filterClient ? sites.filter((s) => s.client?._id === filterClient) : sites;
  const { sorted, sort, toggle } = useSort(filtered, 'site', 'asc', {
    site: (s) => siteLabel(s),
    client: (s) => s.client?.name,
    createdAt: (s) => (s.createdAt ? new Date(s.createdAt).getTime() : null),
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setDuplicateWarning(null);
    setModalOpen(true);
  };

  const openEdit = (site) => {
    setEditingId(site._id);
    setForm({
      client: site.client?._id || '',
      siteType: site.siteType,
      bankName: site.bankName || '',
      branch: site.branch || '',
      branchCode: site.branchCode || '',
      siteName: site.siteName || '',
      location: site.location || '',
      town: site.town || '',
      county: site.county || '',
      isNairobi: site.isNairobi || false,
      notes: site.notes || '',
    });
    setError('');
    setDuplicateWarning(null);
    setModalOpen(true);
  };

  const findDuplicate = () => {
    const key = form.siteType === 'Bank'
      ? `${normalize(form.bankName)}|${normalize(form.branch)}`
      : normalize(form.siteName);

    return sites.find((s) => {
      if (s._id === editingId) return false;
      if (s.client?._id !== form.client) return false;
      if (s.siteType !== form.siteType) return false;
      const sKey = s.siteType === 'Bank'
        ? `${normalize(s.bankName)}|${normalize(s.branch)}`
        : normalize(s.siteName);
      return sKey === key && key.length > 0;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!duplicateWarning) {
      const dup = findDuplicate();
      if (dup) {
        setDuplicateWarning(dup);
        return;
      }
    }

    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.put(`/sites/${editingId}`, form);
        toast.success('Site updated');
      } else {
        await api.post('/sites', form);
        toast.success('Site added');
      }
      setModalOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      setDuplicateWarning(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save site');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this site?')) return;
    try {
      await api.delete(`/sites/${id}`);
      toast.success('Site deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  const th = 'py-2 pr-4';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select className="input max-w-xs" value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
          <option value="">All Clients</option>
          {clients.map((c) => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </select>
        <button className="btn-primary flex items-center gap-1.5" onClick={openAdd}>
          <Plus size={16} /> New Site
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">
          <MapPin className="mx-auto mb-2" />
          No sites yet.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <SortTh label="Site" k="site" sort={sort} onSort={toggle} className={th} />
                <SortTh label="Client" k="client" sort={sort} onSort={toggle} className={th} />
                <SortTh label="Type" k="siteType" sort={sort} onSort={toggle} className={th} />
                <SortTh label="Town" k="town" sort={sort} onSort={toggle} className={th} />
                <SortTh label="County" k="county" sort={sort} onSort={toggle} className={th} />
                <SortTh label="Added" k="createdAt" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s._id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-ink-900">{siteLabel(s)}</td>
                  <td className="py-2.5 pr-4 text-slate-600">{s.client?.name}</td>
                  <td className="py-2.5 pr-4 text-slate-600">{s.siteType}</td>
                  <td className="py-2.5 pr-4 text-slate-600">{s.town || '-'}</td>
                  <td className="py-2.5 pr-4 text-slate-600">{s.county || '-'}</td>
                  <td className="py-2.5 pr-4 text-slate-600">{formatDate(s.createdAt)}</td>
                  <td className="py-2.5 pr-4 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(s)} className="text-slate-400 hover:text-brand-600 mr-3">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => handleDelete(s._id)} className="text-slate-300 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setDuplicateWarning(null); }}
        title={editingId ? 'Edit Site / Location' : 'New Site / Location'}
        wide
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
          {duplicateWarning && (
            <div className="text-sm bg-amber-50 text-amber-700 rounded-lg px-3 py-2">
              A very similar site already exists: <span className="font-medium">{siteLabel(duplicateWarning)}</span>.
              Click "Save Anyway" below if this is genuinely a different site, or close this and check your Sites list.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Client</label>
              <select
                required
                className="input"
                value={form.client}
                onChange={(e) => { setForm({ ...form, client: e.target.value }); setDuplicateWarning(null); }}
              >
                <option value="">Select client...</option>
                {clients.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Site Type</label>
              <select
                className="input"
                value={form.siteType}
                onChange={(e) => { setForm({ ...form, siteType: e.target.value }); setDuplicateWarning(null); }}
              >
                {siteTypes.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {form.siteType === 'Bank' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Bank Name</label>
                <input
                  required
                  className="input"
                  value={form.bankName}
                  onChange={(e) => { setForm({ ...form, bankName: e.target.value }); setDuplicateWarning(null); }}
                  placeholder="e.g. Equity Bank"
                />
              </div>
              <div>
                <label className="label">Branch</label>
                <input
                  required
                  className="input"
                  value={form.branch}
                  onChange={(e) => { setForm({ ...form, branch: e.target.value }); setDuplicateWarning(null); }}
                  placeholder="e.g. Kikuyu"
                />
              </div>
              <div>
                <label className="label">Branch Code</label>
                <input className="input" value={form.branchCode} onChange={(e) => setForm({ ...form, branchCode: e.target.value })} />
              </div>
            </div>
          ) : (
            <div>
              <label className="label">Site Name</label>
              <input
                required
                className="input"
                value={form.siteName}
                onChange={(e) => { setForm({ ...form, siteName: e.target.value }); setDuplicateWarning(null); }}
                placeholder="e.g. Acme Warehouse"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Town</label>
              <input className="input" value={form.town} onChange={(e) => setForm({ ...form, town: e.target.value })} />
            </div>
            <div>
              <label className="label">County</label>
              <input className="input" value={form.county} onChange={(e) => setForm({ ...form, county: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Location / Directions</label>
            <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.isNairobi} onChange={(e) => setForm({ ...form, isNairobi: e.target.checked })} />
            Within Nairobi
          </label>

          <button disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving...' : duplicateWarning ? 'Save Anyway' : editingId ? 'Save Changes' : 'Save Site'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
'@
Write-FileUtf8NoBom -Path "frontend/src/pages/Sites.jsx" -Content $f6
$f7 = @'
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import api from '../api/axios';
import StatusBadge from '../components/StatusBadge.jsx';
import { SortTh, useSort } from '../components/SortHeader.jsx';
import { formatKES, formatDate } from '../utils/format.js';
import { downloadCSV } from '../utils/exportCsv.js';

const time = (d) => (d ? new Date(d).getTime() : null);

export default function PaymentLedger() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ client: '', status: '', from: '', to: '' });

  const { sorted, sort, toggle } = useSort(rows, 'jobDate', 'desc', {
    jobDate: (r) => time(r.jobDate),
    paymentDueDate: (r) => time(r.paymentDueDate),
  });

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

  const handleExportCSV = () => {
    const headers = ['Job Date', 'Client', 'Site', 'Job Card', 'Callouts', 'Expected', 'Paid', 'Balance', 'Payment Due Date', 'Status'];
    const csvRows = sorted.map((r) => [
      formatDate(r.jobDate),
      r.client || '',
      r.site || '',
      r.jobCardRef || '',
      r.callouts,
      r.expected,
      r.paid,
      r.balance,
      formatDate(r.paymentDueDate),
      r.status,
    ]);
    downloadCSV(`payment-ledger-${new Date().toISOString().slice(0, 10)}.csv`, headers, csvRows);
  };

  const th = 'py-2.5 px-4';

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap gap-3 no-print">
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
        <div className="flex gap-2 ml-auto">
          <button onClick={handleExportCSV} className="btn-secondary flex items-center gap-1.5">
            <Download size={15} /> Export CSV
          </button>
          <button onClick={() => window.print()} className="btn-secondary flex items-center gap-1.5">
            <Printer size={15} /> Print / PDF
          </button>
        </div>
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
                <SortTh label="Job Date" k="jobDate" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Client" k="client" sort={sort} onSort={toggle} className={th} />
                <SortTh label="Site" k="site" sort={sort} onSort={toggle} className={th} />
                <th className={th}>Job Card</th>
                <SortTh label="Callouts" k="callouts" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Expected" k="expected" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Paid" k="paid" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Balance" k="balance" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Due Date" k="paymentDueDate" sort={sort} onSort={toggle} className={th} />
                <SortTh label="Status" k="status" sort={sort} onSort={toggle} className={th} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
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
'@
Write-FileUtf8NoBom -Path "frontend/src/pages/PaymentLedger.jsx" -Content $f7
$f8 = @'
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Download } from 'lucide-react';
import api from '../api/axios';
import StatusBadge from '../components/StatusBadge.jsx';
import { SortTh, useSort } from '../components/SortHeader.jsx';
import { formatKES, formatDate } from '../utils/format.js';
import { downloadCSV } from '../utils/exportCsv.js';

const time = (d) => (d ? new Date(d).getTime() : null);

export default function Outstanding() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // No default column: starts in the server order (overdue first, biggest first)
  const { sorted, sort, toggle } = useSort(rows, null, 'desc', {
    lastAttendance: (r) => time(r.lastAttendance),
    paymentDueDate: (r) => time(r.paymentDueDate),
  });

  useEffect(() => {
    api.get('/reports/outstanding').then((res) => setRows(res.data)).finally(() => setLoading(false));
  }, []);

  const total = rows.reduce((s, r) => s + r.outstanding, 0);
  const overdueCount = rows.filter((r) => r.isOverdue).length;
  const overdueTotal = rows.filter((r) => r.isOverdue).reduce((s, r) => s + r.outstanding, 0);

  const handleExportCSV = () => {
    const headers = ['Client', 'Site', 'Job Card', 'Expected', 'Paid', 'Outstanding', 'Last Attendance', 'Payment Due Date', 'Days Outstanding', 'Overdue', 'Status'];
    const csvRows = sorted.map((r) => [
      r.client || '',
      r.site || '',
      r.jobCardRef || '',
      r.expected,
      r.paid,
      r.outstanding,
      formatDate(r.lastAttendance),
      formatDate(r.paymentDueDate),
      r.daysOutstanding ?? '',
      r.isOverdue ? 'Yes' : 'No',
      r.status,
    ]);
    downloadCSV(`outstanding-payments-${new Date().toISOString().slice(0, 10)}.csv`, headers, csvRows);
  };

  const th = 'py-2.5 px-4';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 no-print flex-wrap">
        <div className="card bg-amber-50 border-amber-100 flex items-center gap-3 flex-1 min-w-[220px]">
          <AlertCircle className="text-amber-500" />
          <div>
            <div className="text-xs text-amber-700 uppercase font-semibold">Total Owed To Me</div>
            <div className="text-2xl font-bold text-amber-700">{formatKES(total)}</div>
          </div>
        </div>
        {overdueCount > 0 && (
          <div className="card bg-red-50 border-red-100 flex items-center gap-3 flex-1 min-w-[220px]">
            <AlertCircle className="text-red-500" />
            <div>
              <div className="text-xs text-red-700 uppercase font-semibold">Overdue ({overdueCount})</div>
              <div className="text-2xl font-bold text-red-700">{formatKES(overdueTotal)}</div>
            </div>
          </div>
        )}
        <button onClick={handleExportCSV} className="btn-secondary flex items-center gap-1.5">
          <Download size={15} /> Export CSV
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">Nothing outstanding - all caught up.</div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <SortTh label="Client" k="client" sort={sort} onSort={toggle} className={th} />
                <SortTh label="Site" k="site" sort={sort} onSort={toggle} className={th} />
                <th className={th}>Job</th>
                <SortTh label="Expected" k="expected" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Paid" k="paid" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Outstanding" k="outstanding" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Last Attendance" k="lastAttendance" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Due Date" k="paymentDueDate" sort={sort} onSort={toggle} className={th} />
                <SortTh label="Status" k="status" sort={sort} onSort={toggle} className={th} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.jobId}
                  className={`border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer ${
                    r.isOverdue ? 'bg-red-50/50' : ''
                  }`}
                  onClick={() => navigate(`/jobs/${r.jobId}`)}
                >
                  <td className="py-2.5 px-4 font-medium text-ink-900">{r.client}</td>
                  <td className="py-2.5 px-4 text-slate-600">{r.site}</td>
                  <td className="py-2.5 px-4 text-slate-600">{r.jobCardRef || '-'}</td>
                  <td className="py-2.5 px-4">{formatKES(r.expected)}</td>
                  <td className="py-2.5 px-4">{formatKES(r.paid)}</td>
                  <td className="py-2.5 px-4 font-semibold text-red-600">{formatKES(r.outstanding)}</td>
                  <td className="py-2.5 px-4 text-slate-600">{formatDate(r.lastAttendance)}</td>
                  <td className="py-2.5 px-4">
                    {r.isOverdue ? (
                      <span className="text-red-600 font-medium">{formatDate(r.paymentDueDate)} - Overdue</span>
                    ) : (
                      <span className="text-slate-600">{formatDate(r.paymentDueDate)}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
'@
Write-FileUtf8NoBom -Path "frontend/src/pages/Outstanding.jsx" -Content $f8

Write-Host "Done. Now: git add . ; git commit -m `"Add client profit report and sortable columns`" ; git push" -ForegroundColor Yellow
