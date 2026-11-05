const AuditLog = require('../models/AuditLog');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const mongoose = require('mongoose');

// Things that can be brought back from the Audit Log, and what each one is called.
const RESTORE_MODELS = {
  clients: ['Client', 'client'],
  sites: ['Site', 'site'],
  expenses: ['Expense', 'expense'],
  attendance: ['Attendance', 'attendance record'],
  transport: ['Transport', 'transport record'],
  historical: ['HistoricalRecord', 'historical record'],
};
const RESTORE_PATH = /^\/api\/(clients|sites|expenses|attendance|transport|historical)\/[a-f0-9]{24}$/i;

// Everything done on one job (added, changed, removed), newest first.
exports.forJob = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!/^[a-f0-9]{24}$/i.test(id)) return res.status(400).json({ message: 'Invalid job id' });
    const logs = await AuditLog.find({
      owner: req.user.id,
      $or: [
        { job: id },
        { entity: 'jobs', entityId: id },
        { 'details.fields.job': id },
        { 'details.fields.jobId': id },
        { 'details.snapshot.job': id },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(300)
      .lean();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load the job history', error: err.message });
  }
};

// Brings back something that was deleted, using the copy the Audit Log kept.
exports.restore = async (req, res) => {
  try {
    const log = await AuditLog.findOne({ _id: req.params.id, owner: req.user.id });
    if (!log) return res.status(404).json({ message: 'Log entry not found' });

    const entry = RESTORE_MODELS[log.entity];
    const snapshot = log.details && log.details.snapshot;
    if (log.type !== 'delete' || log.method !== 'DELETE' || !entry || !snapshot || !RESTORE_PATH.test(log.path || '')) {
      return res.status(400).json({ message: 'This entry cannot be restored automatically.' });
    }
    if (log.restoredAt) return res.status(409).json({ message: 'This was already restored.' });
    if (!snapshot._id) return res.status(400).json({ message: 'This entry has no saved copy to restore from.' });

    const text = JSON.stringify(snapshot);
    if (text.includes('"[...]"') || text.includes('[file data]')) {
      return res.status(422).json({ message: 'Some details were too large to keep, so this cannot be restored automatically.' });
    }

    const [modelName, noun] = entry;
    const Model = mongoose.model(modelName);
    if (await Model.exists({ _id: snapshot._id })) {
      return res.status(409).json({ message: 'This already exists, so there is nothing to restore.' });
    }

    const data = { ...snapshot, owner: req.user.id };
    delete data.__v;

    if (log.entity === 'attendance') {
      const job = await mongoose.model('Job').exists({ _id: data.job, owner: req.user.id, deletedAt: null });
      if (!job) return res.status(409).json({ message: 'The job this belongs to no longer exists, so it cannot be restored.' });
    }
    if (log.entity === 'sites') {
      const client = await mongoose.model('Client').exists({ _id: data.client, owner: req.user.id });
      if (!client) return res.status(409).json({ message: 'The client this site belongs to no longer exists. Restore the client first.' });
    }
    if (log.entity === 'expenses' && data.job) {
      const job = await mongoose.model('Job').exists({ _id: data.job, owner: req.user.id });
      if (!job) data.job = null; // keep the expense, as a general one
    }

    const restored = await Model.create(data);
    await AuditLog.updateOne({ _id: log._id }, { $set: { restoredAt: new Date() } });

    const label = (log.details && log.details.label) || '';
    await AuditLog.create({
      owner: req.user.id,
      action: `Restored ${noun}${label ? ` "${label}"` : ''}`,
      type: 'create',
      entity: log.entity,
      entityId: String(restored._id),
      job: restored.job || null,
      method: 'POST',
      path: `/api/audit/${log._id}/restore`,
      status: 201,
      details: { label, restoredFrom: String(log._id) },
      ip: req.ip || '',
      userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
    });

    res.json({ message: 'Restored', id: restored._id });
  } catch (err) {
    res.status(400).json({ message: 'Could not restore this entry', error: err.message });
  }
};

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