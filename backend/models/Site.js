const mongoose = require('mongoose');

const siteSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    siteType: {
      type: String,
      enum: ['Bank', 'Office', 'Shop', 'Warehouse', 'Institution', 'Customer Premises', 'Other'],
      required: true,
    },
    // Bank-specific fields
    bankName: { type: String, trim: true },
    branch: { type: String, trim: true },
    branchCode: { type: String, trim: true },
    // Generic fields (used by all site types)
    siteName: { type: String, trim: true }, // for non-bank sites, or a friendly label for banks
    location: { type: String, trim: true },
    town: { type: String, trim: true },
    county: { type: String, trim: true },
    isNairobi: { type: Boolean, default: false },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

// A convenient display name virtual: "Equity Bank - Kikuyu" or "Acme Warehouse"
siteSchema.virtual('displayName').get(function () {
  if (this.siteType === 'Bank') {
    return [this.bankName, this.branch].filter(Boolean).join(' - ');
  }
  return this.siteName || 'Unnamed Site';
});
siteSchema.set('toJSON', { virtuals: true });
siteSchema.set('toObject', { virtuals: true });

siteSchema.index({ owner: 1, client: 1, bankName: 1, branch: 1 });

module.exports = mongoose.model('Site', siteSchema);
