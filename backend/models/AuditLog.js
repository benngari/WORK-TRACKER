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