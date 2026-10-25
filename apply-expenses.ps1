# Work Tracker update: Expense tracking, net income, Client Statement report.
# Run from your work-tracker project ROOT (the folder containing backend and frontend):
#   powershell -ExecutionPolicy Bypass -File .\apply-expenses.ps1
$ErrorActionPreference = "Stop"
if (-not (Test-Path ./backend) -or -not (Test-Path ./frontend)) {
    Write-Host "ERROR: Run this from the project root (folder containing backend and frontend)." -ForegroundColor Red
    exit 1
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
const mongoose = require('mongoose');

const EXPENSE_CATEGORIES = [
  'Transport',
  'Tools & Equipment',
  'Materials',
  'Airtime & Data',
  'Meals',
  'Rent & Utilities',
  'Licences & Fees',
  'Other',
];

const expenseSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, enum: EXPENSE_CATEGORIES, default: 'Other' },
    description: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

expenseSchema.index({ owner: 1, date: -1 });

module.exports = mongoose.model('Expense', expenseSchema);
module.exports.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;
'@
Write-FileUtf8NoBom -Path "backend/models/Expense.js" -Content $f1
$f2 = @'
const crudFactory = require('../utils/crudFactory');
const Expense = require('../models/Expense');

module.exports = crudFactory(Expense, { sort: { date: -1 } });
'@
Write-FileUtf8NoBom -Path "backend/controllers/expenseController.js" -Content $f2
$f3 = @'
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/expenseController');
const auth = require('../middleware/auth');

router.use(auth);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
'@
Write-FileUtf8NoBom -Path "backend/routes/expenses.js" -Content $f3
$f4 = @'
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const connectDB = require('./config/db');

const app = express();

connectDB();

app.use(compression());

const allowedOrigins = (process.env.CLIENT_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/sites', require('./routes/sites'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/mpesa', require('./routes/mpesa'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/transport', require('./routes/transport'));
app.use('/api/historical', require('./routes/historical'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/search', require('./routes/search'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/expenses', require('./routes/expenses'));

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Server error', error: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
'@
Write-FileUtf8NoBom -Path "backend/server.js" -Content $f4
$f5 = @'
const Client = require('../models/Client');
const Site = require('../models/Site');
const Job = require('../models/Job');
const Attendance = require('../models/Attendance');
const Payment = require('../models/Payment');
const PaymentAllocation = require('../models/PaymentAllocation');
const MpesaTransaction = require('../models/MpesaTransaction');
const JobDocument = require('../models/JobDocument');
const Transport = require('../models/Transport');
const HistoricalRecord = require('../models/HistoricalRecord');
const Settings = require('../models/Settings');
const Expense = require('../models/Expense');

exports.exportAll = async (req, res) => {
  try {
    const owner = req.user.id;

    const [clients, sites, jobs, attendance, payments, allocations, mpesa, documents, transport, historical, settings, expenses] =
      await Promise.all([
        Client.find({ owner }).lean(),
        Site.find({ owner }).lean(),
        Job.find({ owner }).lean(),
        Attendance.find({ owner }).lean(),
        Payment.find({ owner }).lean(),
        PaymentAllocation.find({ owner }).lean(),
        MpesaTransaction.find({ owner }).lean(),
        JobDocument.find({ owner }).lean(),
        Transport.find({ owner }).lean(),
        HistoricalRecord.find({ owner }).lean(),
        Settings.findOne({ owner }).lean(),
        Expense.find({ owner }).lean(),
      ]);

    res.json({
      exportedAt: new Date().toISOString(),
      version: 2,
      data: { clients, sites, jobs, attendance, payments, allocations, mpesa, documents, transport, historical, settings, expenses },
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to export data', error: err.message });
  }
};
'@
Write-FileUtf8NoBom -Path "backend/controllers/backupController.js" -Content $f5
$f6 = @'
const Job = require('../models/Job');
const Attendance = require('../models/Attendance');
const PaymentAllocation = require('../models/PaymentAllocation');
const Payment = require('../models/Payment');
const MpesaTransaction = require('../models/MpesaTransaction');
const Transport = require('../models/Transport');
const Site = require('../models/Site');
const Expense = require('../models/Expense');

function getPeriodRange(period) {
  const now = new Date();
  if (period === 'week') {
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6, 23, 59, 59, 999);
    return { from, to };
  }
  if (period === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from, to };
  }
  if (period === 'year') {
    const from = new Date(now.getFullYear(), 0, 1);
    const to = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { from, to };
  }
  return null;
}

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const sum = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);

exports.summary = async (req, res) => {
  try {
    const ownerFilter = { owner: req.user.id };
    const period = ['week', 'month', 'year'].includes(req.query.period) ? req.query.period : 'all';
    const range = getPeriodRange(period);
    const inRange = (d) => !range || (d >= range.from && d <= range.to);

    const jobs = await Job.find({ ...ownerFilter, deletedAt: null }).populate('client').populate('site');
    const jobIds = jobs.map((j) => j._id);

    const [allAttendance, allAllocations, payments, mpesaCount, transportAgg, nairobiAgg, allExpenses] = await Promise.all([
      Attendance.find({ job: { $in: jobIds }, owner: req.user.id }),
      PaymentAllocation.find({ job: { $in: jobIds }, owner: req.user.id }),
      Payment.find(ownerFilter),
      MpesaTransaction.countDocuments(ownerFilter),
      Transport.aggregate([
        { $match: { owner: req.user.id } },
        { $group: { _id: null, totalFare: { $sum: '$fare' } } },
      ]),
      Transport.aggregate([
        { $match: { owner: req.user.id } },
        { $group: { _id: '$zone', total: { $sum: '$fare' }, count: { $sum: 1 } } },
      ]),
      Expense.find(ownerFilter).lean(),
    ]);

    const attendanceByJob = {};
    for (const a of allAttendance) {
      const key = String(a.job);
      (attendanceByJob[key] = attendanceByJob[key] || []).push(a);
    }
    const paidByJob = {};
    for (const a of allAllocations) {
      if (a.allocationType === 'Fare') continue;
      const key = String(a.job);
      paidByJob[key] = (paidByJob[key] || 0) + a.amount;
    }

    let totalExpected = 0;
    let totalPaid = 0;
    let totalCallouts = 0;
    let workCompletedNotPaid = 0;
    const byClient = {};
    const bySite = {};
    const byBank = {};
    const byMonth = {};
    const month = (key) => (byMonth[key] = byMonth[key] || { expected: 0, paid: 0, callouts: 0, expenses: 0 });

    for (const job of jobs) {
      const jobAttendance = attendanceByJob[String(job._id)] || [];
      const expected = job.expectedPaymentOverride ?? jobAttendance.length * job.rate;
      const paid = paidByJob[String(job._id)] || 0;
      const outstanding = Math.max(0, expected - paid);

      totalExpected += expected;
      totalPaid += paid;
      totalCallouts += jobAttendance.length;
      if (outstanding > 0 && job.status === 'Completed') {
        workCompletedNotPaid += outstanding;
      }

      const clientName = job.client?.name || 'Unknown';
      byClient[clientName] = byClient[clientName] || { expected: 0, paid: 0 };
      byClient[clientName].expected += expected;
      byClient[clientName].paid += paid;

      const siteLbl = job.site
        ? job.site.siteType === 'Bank'
          ? [job.site.bankName, job.site.branch].filter(Boolean).join(' - ')
          : job.site.siteName
        : 'Unknown Site';
      bySite[siteLbl] = bySite[siteLbl] || { expected: 0, paid: 0 };
      bySite[siteLbl].expected += expected;
      bySite[siteLbl].paid += paid;

      if (job.site?.siteType === 'Bank' && job.site.bankName) {
        byBank[job.site.bankName] = byBank[job.site.bankName] || { expected: 0, paid: 0 };
        byBank[job.site.bankName].expected += expected;
        byBank[job.site.bankName].paid += paid;
      }

      for (const a of jobAttendance) {
        const m = month(monthKey(a.date));
        m.expected += job.rate;
        m.callouts += 1;
      }
    }

    for (const p of payments) {
      month(monthKey(p.receivedDate)).paid += p.amount;
    }
    for (const e of allExpenses) {
      month(monthKey(new Date(e.date))).expenses += e.amount;
    }

    const periodAttendance = allAttendance.filter((a) => inRange(a.date));
    const paymentIdsInPeriod = new Set(payments.filter((p) => inRange(p.receivedDate)).map((p) => String(p._id)));

    const periodExpected = range ? sum(periodAttendance, (a) => a.rate) : totalExpected;
    const periodCallouts = periodAttendance.length;
    const periodPaid = range
      ? sum(
          allAllocations.filter((a) => a.allocationType !== 'Fare' && paymentIdsInPeriod.has(String(a.payment))),
          (a) => a.amount
        )
      : totalPaid;
    const periodOutstanding = Math.max(0, periodExpected - periodPaid);

    // Net visit fares = fares you spent on visits minus fares you were reimbursed.
    const fareSpent = sum(periodAttendance, (a) => a.fare || 0);
    const fareReceived = sum(
      allAllocations.filter((a) => a.allocationType === 'Fare' && paymentIdsInPeriod.has(String(a.payment))),
      (a) => a.amount
    );
    const netVisitFares = fareSpent - fareReceived;

    const periodExpenseList = allExpenses.filter((e) => inRange(new Date(e.date)));
    const expensesLogged = sum(periodExpenseList, (e) => e.amount);
    const expensesByCategory = {};
    for (const e of periodExpenseList) {
      const c = e.category || 'Other';
      expensesByCategory[c] = (expensesByCategory[c] || 0) + e.amount;
    }
    const totalExpenses = expensesLogged + netVisitFares;
    const netIncome = periodPaid - totalExpenses;

    const sitesVisited = await Site.countDocuments({
      _id: { $in: jobs.map((j) => j.site?._id).filter(Boolean) },
    });

    res.json({
      period,
      cards: {
        totalExpected: periodExpected,
        totalPaid: periodPaid,
        totalOutstanding: periodOutstanding,
        totalCallouts: periodCallouts,
        expensesLogged,
        netVisitFares,
        totalExpenses,
        netIncome,
        workCompletedNotPaid,
        totalJobs: totalCallouts,
        sitesVisited,
        mpesaPayments: mpesaCount,
        totalFare: transportAgg[0]?.totalFare || 0,
      },
      charts: {
        monthly: Object.entries(byMonth)
          .sort(([a], [b]) => (a > b ? 1 : -1))
          .map(([m, v]) => ({ month: m, ...v })),
        byClient: Object.entries(byClient).map(([name, v]) => ({ name, ...v })),
        bySite: Object.entries(bySite).map(([name, v]) => ({ name, ...v })),
        byBank: Object.entries(byBank).map(([name, v]) => ({ name, ...v })),
        nairobiVsOutside: nairobiAgg.map((n) => ({ zone: n._id, total: n.total, count: n.count })),
        expensesByCategory: Object.entries(expensesByCategory)
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total),
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to build dashboard summary', error: err.message });
  }
};
'@
Write-FileUtf8NoBom -Path "backend/controllers/dashboardController.js" -Content $f6
$f7 = @'
import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Download, Receipt } from 'lucide-react';
import api from '../api/axios';
import Modal from '../components/Modal.jsx';
import { formatKES, formatDate } from '../utils/format.js';
import { downloadCSV } from '../utils/exportCsv.js';
import { useToast } from '../context/ToastContext.jsx';

const CATEGORIES = [
  'Transport', 'Tools & Equipment', 'Materials', 'Airtime & Data',
  'Meals', 'Rent & Utilities', 'Licences & Fees', 'Other',
];

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = () => ({ date: today(), amount: '', category: 'Transport', description: '', notes: '' });

function inPeriod(dateStr, period) {
  if (period === 'all') return true;
  const d = new Date(dateStr);
  const now = new Date();
  if (period === 'year') return d.getFullYear() === now.getFullYear();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export default function Expenses() {
  const toast = useToast();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [category, setCategory] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/expenses').then((res) => setExpenses(res.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = expenses.filter(
    (e) => inPeriod(e.date, period) && (!category || e.category === category)
  );
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const byCategory = {};
  filtered.forEach((e) => {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  });
  const categoryRows = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError('');
    setModalOpen(true);
  };

  const openEdit = (e) => {
    setEditingId(e._id);
    setForm({
      date: e.date ? e.date.slice(0, 10) : today(),
      amount: e.amount,
      category: e.category || 'Other',
      description: e.description || '',
      notes: e.notes || '',
    });
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setSaving(true);
    setError('');
    const payload = { ...form, amount: Number(form.amount) };
    try {
      if (editingId) {
        await api.put(`/expenses/${editingId}`, payload);
        toast.success('Expense updated');
      } else {
        await api.post('/expenses', payload);
        toast.success('Expense added');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      toast.success('Expense deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete expense');
    }
  };

  const handleExport = () => {
    const headers = ['Date', 'Category', 'Description', 'Amount', 'Notes'];
    const rows = filtered.map((e) => [formatDate(e.date), e.category, e.description || '', e.amount, e.notes || '']);
    downloadCSV(`expenses-${today()}.csv`, headers, rows);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          <select className="input max-w-[160px]" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
            <option value="all">All Time</option>
          </select>
          <select className="input max-w-[200px]" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5">
            <Download size={15} /> Export CSV
          </button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-1.5">
            <Plus size={16} /> Add Expense
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Total Expenses</div>
          <div className="text-2xl font-bold text-red-600">{formatKES(total)}</div>
          <div className="text-xs text-slate-400 mt-1">{filtered.length} record(s)</div>
        </div>
        <div className="card md:col-span-2">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">By Category</div>
          {categoryRows.length === 0 ? (
            <div className="text-sm text-slate-400">No expenses in this view.</div>
          ) : (
            <div className="space-y-1.5">
              {categoryRows.map(([name, amt]) => (
                <div key={name} className="flex items-center gap-3 text-sm">
                  <div className="w-36 text-slate-600 truncate">{name}</div>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500" style={{ width: `${total ? (amt / total) * 100 : 0}%` }} />
                  </div>
                  <div className="w-28 text-right font-medium text-ink-800">{formatKES(amt)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Fares you pay on visits are already counted on the Dashboard (net of reimbursements), so there is no need to enter them here.
      </p>

      {loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">
          <Receipt className="mx-auto mb-2" />
          No expenses recorded for this view.
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">Description</th>
                <th className="py-2.5 px-4">Amount</th>
                <th className="py-2.5 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e._id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 px-4 text-slate-600">{formatDate(e.date)}</td>
                  <td className="py-2.5 px-4 text-ink-800">{e.category}</td>
                  <td className="py-2.5 px-4 text-slate-600">{e.description || '-'}</td>
                  <td className="py-2.5 px-4 font-medium text-red-600">{formatKES(e.amount)}</td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(e)} className="text-slate-400 hover:text-brand-600 mr-3">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => handleDelete(e._id)} className="text-slate-300 hover:text-red-500">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Expense' : 'Add Expense'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input required type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="label">Amount</label>
              <input required type="number" min="0" step="any" className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Drill bits, airtime bundle" />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Save Expense'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
'@
Write-FileUtf8NoBom -Path "frontend/src/pages/Expenses.jsx" -Content $f7
$f8 = @'
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
'@
Write-FileUtf8NoBom -Path "frontend/src/pages/ClientStatement.jsx" -Content $f8
$f9 = @'
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Briefcase, Building2, MapPin, CalendarCheck, Table2, Smartphone,
  AlertCircle, FileText, CalendarDays, BarChart3, Archive, Trash2, Settings, Wallet,
  Receipt, FileSpreadsheet,
} from 'lucide-react';
import api from '../api/axios';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/jobs', label: 'Jobs', icon: Briefcase },
  { to: '/clients', label: 'Clients / Companies', icon: Building2 },
  { to: '/sites', label: 'Sites & Locations', icon: MapPin },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/ledger', label: 'Payment Ledger', icon: Table2 },
  { to: '/mpesa', label: 'M-PESA Payments', icon: Smartphone },
  { to: '/outstanding', label: 'Outstanding Payments', icon: AlertCircle, badgeKey: 'outstanding' },
  { to: '/expenses', label: 'Expenses', icon: Receipt },
  { to: '/statement', label: 'Client Statement', icon: FileSpreadsheet },
  { to: '/documents', label: 'Job Cards / Documents', icon: FileText },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/historical', label: 'Historical Records', icon: Archive },
  { to: '/trash', label: 'Trash', icon: Trash2 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ open, onClose }) {
  const [overdueCount, setOverdueCount] = useState(0);

  useEffect(() => {
    api.get('/reports/overdue-summary').then((res) => setOverdueCount(res.data.count)).catch(() => {});
  }, []);

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/30 z-30 lg:hidden no-print" onClick={onClose} />
      )}
      <aside
        className={`no-print fixed lg:static z-40 top-0 left-0 h-full w-64 bg-ink-900 text-slate-300 flex flex-col transition-transform duration-200 ${
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
          {navItems.map(({ to, label, icon: Icon, end, badgeKey }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <Icon size={17} />
              <span className="flex-1">{label}</span>
              {badgeKey === 'outstanding' && overdueCount > 0 && (
                <span className="bg-red-500 text-white text-[11px] font-semibold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                  {overdueCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
'@
Write-FileUtf8NoBom -Path "frontend/src/components/Sidebar.jsx" -Content $f9
$f10 = @'
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

const titles = {
  '/': 'Dashboard',
  '/clients': 'Clients / Companies',
  '/sites': 'Sites & Locations',
  '/jobs': 'Jobs',
  '/attendance': 'Attendance History',
  '/ledger': 'Payment Ledger',
  '/mpesa': 'Payments',
  '/outstanding': 'Outstanding Payments',
  '/expenses': 'Expenses',
  '/statement': 'Client Statement',
  '/documents': 'Job Cards / Documents',
  '/calendar': 'Calendar',
  '/reports': 'Reports',
  '/historical': 'Historical Records',
  '/trash': 'Trash',
  '/settings': 'Settings',
};

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  const title =
    titles[pathname] ||
    (pathname.startsWith('/jobs/') ? 'Job Detail' : 'Work Tracker');

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
'@
Write-FileUtf8NoBom -Path "frontend/src/components/Layout.jsx" -Content $f10
$f11 = @'
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';

import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import Sites from './pages/Sites.jsx';
import Jobs from './pages/Jobs.jsx';
import JobDetail from './pages/JobDetail.jsx';
import PaymentLedger from './pages/PaymentLedger.jsx';
import MpesaPayments from './pages/MpesaPayments.jsx';
import Outstanding from './pages/Outstanding.jsx';
import Expenses from './pages/Expenses.jsx';
import ClientStatement from './pages/ClientStatement.jsx';
import Documents from './pages/Documents.jsx';
import CalendarPage from './pages/Calendar.jsx';
import Reports from './pages/Reports.jsx';
import HistoricalRecords from './pages/HistoricalRecords.jsx';
import SettingsPage from './pages/Settings.jsx';
import AttendanceHistory from './pages/AttendanceHistory.jsx';
import Trash from './pages/Trash.jsx';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />

      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="clients" element={<Clients />} />
        <Route path="sites" element={<Sites />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="attendance" element={<AttendanceHistory />} />
        <Route path="ledger" element={<PaymentLedger />} />
        <Route path="mpesa" element={<MpesaPayments />} />
        <Route path="outstanding" element={<Outstanding />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="statement" element={<ClientStatement />} />
        <Route path="documents" element={<Documents />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="reports" element={<Reports />} />
        <Route path="historical" element={<HistoricalRecords />} />
        <Route path="trash" element={<Trash />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
'@
Write-FileUtf8NoBom -Path "frontend/src/App.jsx" -Content $f11
$f12 = @'
import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import api from '../api/axios';
import StatCard from '../components/StatCard.jsx';
import OnboardingChecklist from '../components/OnboardingChecklist.jsx';
import { formatKES } from '../utils/format.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const COLORS = ['#26a873', '#7ad9ae', '#48c28c', '#146d4c', '#aeeacd', '#18885d'];

const periodLabels = {
  all: 'All Time',
  week: 'This Week',
  month: 'This Month',
  year: 'This Year',
};

export default function Dashboard() {
  const [period, setPeriod] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api
      .get('/dashboard/summary', { params: { period } })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, [period]);

  if (error) return <div className="text-red-500 text-sm">{error}</div>;

  const { cards, charts } = data || { cards: {}, charts: {} };
  const pl = periodLabels[period];

  return (
    <div className="space-y-6">
      <OnboardingChecklist />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs value={period} onValueChange={setPeriod}>
          <TabsList>
            <TabsTrigger value="all">All Time</TabsTrigger>
            <TabsTrigger value="year">This Year</TabsTrigger>
            <TabsTrigger value="month">This Month</TabsTrigger>
            <TabsTrigger value="week">This Week</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">Loading dashboard...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <StatCard label={`Expected (${pl})`} value={formatKES(cards.totalExpected)} />
            <StatCard label={`Paid (${pl})`} value={formatKES(cards.totalPaid)} accent="text-brand-600" />
            <StatCard label={`Outstanding (${pl})`} value={formatKES(cards.totalOutstanding)} accent="text-amber-600" />
            <StatCard
              label={`Expenses (${pl})`}
              value={formatKES(cards.totalExpenses)}
              accent="text-red-600"
              sub={`${formatKES(cards.expensesLogged)} logged + ${formatKES(cards.netVisitFares)} net visit fares`}
            />
            <StatCard
              label={`Net Income (${pl})`}
              value={formatKES(cards.netIncome)}
              accent={cards.netIncome >= 0 ? 'text-brand-600' : 'text-red-600'}
              sub="Paid minus expenses"
            />
            <StatCard
              label="Work Done, Not Paid"
              value={formatKES(cards.workCompletedNotPaid)}
              accent="text-red-600"
              sub="All time"
            />
            <StatCard label="Total Jobs" value={cards.totalJobs} sub="All time" />
            <StatCard label={`Callouts (${pl})`} value={cards.totalCallouts} />
            <StatCard label="Sites Visited" value={cards.sitesVisited} sub="All time" />
            <StatCard label="M-PESA Payments" value={cards.mpesaPayments} sub="All time" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card">
              <div className="font-semibold text-ink-900 mb-4">Monthly Expected vs Paid vs Expenses</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={charts.monthly}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatKES(v)} />
                  <Legend />
                  <Bar dataKey="expected" fill="#aeeacd" name="Expected" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="paid" fill="#26a873" name="Paid" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" fill="#f59e0b" name="Expenses" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="font-semibold text-ink-900 mb-4">Callouts by Month</div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={charts.monthly}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="callouts" stroke="#18885d" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="font-semibold text-ink-900 mb-4">Expenses by Category ({pl})</div>
              {(charts.expensesByCategory || []).length === 0 ? (
                <div className="text-sm text-slate-400 py-16 text-center">No expenses logged for this period.</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={charts.expensesByCategory} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f6" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => formatKES(v)} />
                    <Bar dataKey="total" fill="#f59e0b" name="Spent" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <div className="font-semibold text-ink-900 mb-4">Earnings by Client (All Time)</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={charts.byClient} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f6" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatKES(v)} />
                  <Bar dataKey="paid" fill="#26a873" name="Paid" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="font-semibold text-ink-900 mb-4">Nairobi vs Outside Nairobi (Fare, All Time)</div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={charts.nairobiVsOutside}
                    dataKey="total"
                    nameKey="zone"
                    outerRadius={90}
                    label={(entry) => `${entry.zone}: ${formatKES(entry.total)}`}
                  >
                    {(charts.nairobiVsOutside || []).map((entry, i) => (
                      <Cell key={entry.zone} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatKES(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
'@
Write-FileUtf8NoBom -Path "frontend/src/pages/Dashboard.jsx" -Content $f12
$f13 = @'
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const res = await login(email, password);
    if (res.success) navigate('/');
    else setError(res.message);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center text-white mb-3">
            <Wallet size={22} />
          </div>
          <h1 className="text-xl font-bold text-ink-900">Work Tracker</h1>
          <p className="text-sm text-slate-500">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Password</label>
              <Link to="/forgot-password" className="text-xs text-brand-600 font-medium">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-4">
          No account yet?{' '}
          <Link to="/register" className="text-brand-600 font-medium">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
'@
Write-FileUtf8NoBom -Path "frontend/src/pages/Login.jsx" -Content $f13
$f14 = @'
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import api from '../api/axios';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center text-white mb-3">
            <Wallet size={22} />
          </div>
          <h1 className="text-xl font-bold text-ink-900">Work Tracker</h1>
          <p className="text-sm text-slate-500">Reset your password</p>
        </div>

        {sent ? (
          <div className="card text-sm text-slate-600">
            If an account with that email exists, we have sent a password reset link to it.
            Check your inbox (and spam folder). The link expires in 1 hour.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card space-y-4">
            {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-slate-500 mt-4">
          <Link to="/login" className="text-brand-600 font-medium">Back to Sign In</Link>
        </p>
      </div>
    </div>
  );
}
'@
Write-FileUtf8NoBom -Path "frontend/src/pages/ForgotPassword.jsx" -Content $f14

Write-Host "Done. Now: git add . ; git commit -m `"Add expenses, net income, client statement`" ; git push" -ForegroundColor Yellow
