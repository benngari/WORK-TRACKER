const mongoose = require('mongoose');

// For entering old/legacy data that predates using this system -
// e.g. a past job card or statement that doesn't need full Job/Attendance structure.
const historicalRecordSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    clientName: { type: String, trim: true },
    siteName: { type: String, trim: true },
    date: { type: Date },
    amount: { type: Number, default: null },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('HistoricalRecord', historicalRecordSchema);
