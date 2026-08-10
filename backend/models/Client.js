const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true }, // e.g. "DTE", "Direct Customer"
    type: {
      type: String,
      enum: ['Contractor', 'Direct Client', 'Agency', 'Other'],
      default: 'Other',
    },
    contactPerson: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    defaultRate: { type: Number, default: 1500 }, // KES per callout/day, overrides global default
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

clientSchema.index({ owner: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Client', clientSchema);
