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
    if (second === 'logout') return { type: 'auth', verb: 'Logged out' };
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
      record().catch((err) => console.error('AUDIT FAILED:', req.method, req.originalUrl, err));
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
      if (!owner) { console.warn('AUDIT SKIPPED (no user found):', req.method, req.originalUrl); return; }

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