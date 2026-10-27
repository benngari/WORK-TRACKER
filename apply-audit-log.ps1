# Adds an Audit Log: records every add / change / delete / login, with a new "Audit Log" page.
# Run from project root: powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Desktop\apply-audit-log.ps1"
function Write-FileUtf8NoBom {
    param([string]$Path, [string]$Content)
    $fullPath = Join-Path (Get-Location) $Path
    $dir = Split-Path -Path $fullPath -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($fullPath, $Content, $utf8NoBom)
}

Write-FileUtf8NoBom -Path 'backend/server.js' -Content @'
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const connectDB = require('./config/db');

const app = express();
app.set('trust proxy', 1);

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
app.use('/api', require('./middleware/audit'));

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
app.use('/api/audit', require('./routes/audit'));

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
Write-Host 'Wrote backend/server.js'

Write-FileUtf8NoBom -Path 'backend/models/AuditLog.js' -Content @'
const mongoose = require('mongoose');

// Append-only record of everything done in the app. There is deliberately no update or delete route for this.
const auditLogSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true }, // human readable, e.g. Deleted client "ABC Ltd"
    type: { type: String, enum: ['create', 'update', 'delete', 'auth', 'other'], default: 'other' },
    entity: { type: String, default: '' }, // jobs, clients, mpesa, payments ...
    entityId: { type: String, default: '' },
    method: { type: String, default: '' },
    path: { type: String, default: '' },
    status: { type: Number, default: 0 },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
'@
Write-Host 'Wrote backend/models/AuditLog.js'

Write-FileUtf8NoBom -Path 'backend/middleware/audit.js' -Content @'
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

const ENTITY_NAMES = {
  auth: 'account',
  clients: 'client',
  sites: 'site',
  jobs: 'job',
  attendance: 'attendance record',
  mpesa: 'M-PESA transaction',
  payments: 'payment',
  documents: 'document',
  transport: 'transport record',
  historical: 'historical record',
  settings: 'settings',
  expenses: 'expense',
};

const MODEL_NAMES = {
  clients: 'Client',
  sites: 'Site',
  jobs: 'Job',
  attendance: 'Attendance',
  mpesa: 'MpesaTransaction',
  payments: 'Payment',
  documents: 'JobDocument',
  transport: 'Transport',
  historical: 'HistoricalRecord',
  expenses: 'Expense',
};

const SECRET_KEY = /pass|token|secret|authorization|hash/i;
const ID_RE = /^[a-f0-9]{24}$/i;

function sanitize(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    if (value.startsWith('data:')) return '[file data]';
    return value.length > 300 ? value.slice(0, 300) + '...' : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 3) return '[...]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY.test(k) || k.startsWith('$') || k.includes('.')) continue;
      out[k] = sanitize(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function labelOf(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const name =
    obj.name || obj.siteName || obj.title || obj.jobCardRef || obj.transactionCode ||
    obj.filename || obj.description || obj.category || obj.jobType || obj.clientName;
  const parts = [];
  if (name) parts.push(String(name).slice(0, 80));
  if (typeof obj.amount === 'number') parts.push(`KES ${obj.amount}`);
  return parts.join(' - ');
}

function describe(method, segments) {
  const [entity = '', second = '', third = ''] = segments;
  const noun = ENTITY_NAMES[entity] || entity;
  const hasId = segments.some((s) => ID_RE.test(s));

  if (entity === 'auth') {
    if (second === 'login') return { type: 'auth', verb: 'Logged in' };
    if (second === 'register') return { type: 'auth', verb: 'Registered an account' };
    if (second === 'forgot-password') return { type: 'auth', verb: 'Requested a password reset' };
    if (second === 'reset-password') return { type: 'auth', verb: 'Reset password' };
    return { type: 'auth', verb: `${method} ${segments.join('/')}` };
  }
  if (entity === 'backup') return { type: 'other', verb: 'Downloaded a full data backup' };
  if (entity === 'jobs' && third === 'restore') return { type: 'update', verb: 'Restored job' };
  if (entity === 'jobs' && third === 'permanent') return { type: 'delete', verb: 'Permanently deleted job' };
  if (entity === 'payments' && third === 'allocate') return { type: 'create', verb: 'Allocated payment to job' };
  if (entity === 'payments' && second === 'allocations') {
    if (method === 'DELETE') return { type: 'delete', verb: 'Removed payment allocation' };
    return { type: 'update', verb: 'Updated payment allocation' };
  }
  if (entity === 'documents' && second === 'upload') return { type: 'create', verb: 'Uploaded document' };
  if (entity === 'settings') return { type: 'update', verb: 'Updated settings' };

  if (method === 'POST') return { type: 'create', verb: `Added ${noun}` };
  if (method === 'DELETE') return { type: 'delete', verb: `Deleted ${noun}` };
  return { type: 'update', verb: hasId ? `Updated ${noun}` : `Updated ${noun}` };
}

function shouldLog(method, segments) {
  const [entity = '', second = ''] = segments;
  if (entity === 'audit') return false;
  if (method === 'GET') return entity === 'backup' && second === 'export';
  if (!WRITE_METHODS.includes(method)) return false;
  if (entity === 'mpesa' && second === 'parse') return false; // read-only preview of a pasted message
  return true;
}

function userFromToken(req) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return null;
    return jwt.verify(header.slice(7), process.env.JWT_SECRET).id || null;
  } catch (e) {
    return null;
  }
}

function norm(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function sameValue(before, after) {
  let a = norm(before);
  let b = norm(after);
  const dateLike = /^\d{4}-\d{2}-\d{2}/;
  if (dateLike.test(a) && dateLike.test(b) && !b.includes('T')) a = a.slice(0, 10);
  return a === b;
}

function diffChanges(before, body) {
  const changes = {};
  for (const [key, after] of Object.entries(body || {})) {
    if (SECRET_KEY.test(key) || key.startsWith('$') || key.includes('.')) continue;
    if (!(key in before)) continue;
    if (!sameValue(before[key], after)) {
      changes[key] = { from: sanitize(before[key]), to: sanitize(after) };
    }
  }
  return changes;
}

async function loadBefore(segments, userId) {
  const id = segments.find((s) => ID_RE.test(s));
  if (!id) return null;
  const modelName =
    segments[0] === 'payments' && segments[1] === 'allocations' ? 'PaymentAllocation' : MODEL_NAMES[segments[0]];
  if (!modelName) return null;
  try {
    const query = { _id: id };
    if (userId) query.owner = userId;
    const doc = await mongoose.model(modelName).findOne(query).lean();
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
  } catch (e) {
    return null;
  }
}

module.exports = async function audit(req, res, next) {
  let segments = [];
  try {
    const path = req.originalUrl.split('?')[0].replace(/^\/api/, '').replace(/\/+$/, '');
    segments = path.split('/').filter(Boolean);
    if (!shouldLog(req.method, segments)) return next();

    const info = describe(req.method, segments);
    const tokenUserId = userFromToken(req);

    let before = null;
    if (['PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      before = await loadBefore(segments, tokenUserId);
    }

    let responseBody = null;
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      responseBody = body;
      return originalJson(body);
    };

    res.on('finish', () => {
      record().catch((err) => console.error('Audit log failed:', err.message));
    });

    async function record() {
      const status = res.statusCode;
      const isLogin = segments[0] === 'auth' && segments[1] === 'login';
      const failedLogin = isLogin && status === 401;
      if (status >= 400 && !failedLogin) return;

      let owner = tokenUserId || (responseBody && responseBody.user && responseBody.user.id) || null;
      if (!owner && segments[0] === 'auth' && req.body && typeof req.body.email === 'string') {
        const User = mongoose.model('User');
        const u = await User.findOne({ email: req.body.email.toLowerCase() }).select('_id').lean();
        if (u) owner = u._id;
      }
      if (!owner) return;

      const idInPath = segments.find((s) => ID_RE.test(s)) || '';
      let doc = null;
      if (responseBody && typeof responseBody === 'object') {
        doc =
          responseBody._id
            ? responseBody
            : responseBody.job || responseBody.payment || responseBody.allocation ||
              responseBody.document || responseBody.transaction || null;
      }
      const label = labelOf(before) || labelOf(doc) || '';
      const entityId = idInPath || (doc && doc._id ? String(doc._id) : '');

      const details = {};
      if (label) details.label = label;
      if (info.type === 'update' && before && req.body && !['restore'].includes(segments[2])) {
        const changes = diffChanges(before, req.body);
        if (Object.keys(changes).length) details.changes = changes;
      } else if (info.type === 'delete' && before) {
        const snap = sanitize(before);
        delete snap.owner;
        delete snap.__v;
        details.snapshot = snap;
      } else if (info.type === 'create' && req.body && typeof req.body === 'object') {
        const fields = sanitize(req.body);
        if (fields && Object.keys(fields).length) details.fields = fields;
      }
      if (segments[0] === 'auth' && req.body && req.body.email) details.email = String(req.body.email);

      let action = failedLogin ? 'Failed login attempt' : info.verb;
      if (label && info.type !== 'auth') action += ` "${label}"`;

      await AuditLog.create({
        owner,
        action,
        type: info.type,
        entity: segments[0] || '',
        entityId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status,
        details,
        ip: req.ip || '',
        userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
      });
    }

    next();
  } catch (err) {
    console.error('Audit middleware error:', err.message);
    next();
  }
};

module.exports._test = { sanitize, labelOf, describe, shouldLog, diffChanges };
'@
Write-Host 'Wrote backend/middleware/audit.js'

Write-FileUtf8NoBom -Path 'backend/controllers/auditController.js' -Content @'
const AuditLog = require('../models/AuditLog');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

exports.list = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const { entity, type, search, from, to } = req.query;

    const query = { owner: req.user.id };
    if (entity) query.entity = String(entity);
    if (type) query.type = String(type);
    if (search) {
      const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
      query.$or = [{ action: rx }, { 'details.label': rx }];
    }
    if (from || to) {
      query.createdAt = {};
      // Dates are treated as East Africa Time (UTC+3)
      if (from) query.createdAt.$gte = new Date(`${from}T00:00:00+03:00`);
      if (to) query.createdAt.$lte = new Date(`${to}T23:59:59.999+03:00`);
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(query),
    ]);

    res.json({ logs, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load audit log', error: err.message });
  }
};
'@
Write-Host 'Wrote backend/controllers/auditController.js'

Write-FileUtf8NoBom -Path 'backend/routes/audit.js' -Content @'
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/auditController');
const auth = require('../middleware/auth');

router.use(auth);
// Read-only on purpose: the audit log can't be edited or deleted from the app.
router.get('/', ctrl.list);

module.exports = router;
'@
Write-Host 'Wrote backend/routes/audit.js'

Write-FileUtf8NoBom -Path 'frontend/src/pages/AuditLog.jsx' -Content @'
import { Fragment, useEffect, useState } from 'react';
import { ScrollText, ChevronDown, ChevronRight } from 'lucide-react';
import api from '../api/axios';

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
        <div className="text-sm text-slate-400">Loading...</div>
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
'@
Write-Host 'Wrote frontend/src/pages/AuditLog.jsx'

Write-FileUtf8NoBom -Path 'frontend/src/App.jsx' -Content @'
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
import AuditLog from './pages/AuditLog.jsx';

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
        <Route path="audit" element={<AuditLog />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
'@
Write-Host 'Wrote frontend/src/App.jsx'

Write-FileUtf8NoBom -Path 'frontend/src/components/Sidebar.jsx' -Content @'
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Briefcase, Building2, MapPin, CalendarCheck, Table2, Smartphone,
  AlertCircle, FileText, CalendarDays, BarChart3, Archive, Trash2, Settings, Wallet,
  Receipt, FileSpreadsheet, ScrollText,
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
  { to: '/audit', label: 'Audit Log', icon: ScrollText },
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
Write-Host 'Wrote frontend/src/components/Sidebar.jsx'

Write-FileUtf8NoBom -Path 'frontend/src/components/Layout.jsx' -Content @'
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
  '/audit': 'Audit Log',
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
Write-Host 'Wrote frontend/src/components/Layout.jsx'

Write-Host 'Done. Now run: git add . ; git commit -m "Add audit log" ; git push'
