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