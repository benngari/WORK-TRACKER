const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    defaultRate: { type: Number, default: 1500 }, // KES per callout/day
    currency: { type: String, default: 'KES' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
