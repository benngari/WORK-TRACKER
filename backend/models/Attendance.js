const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    date: { type: Date, required: true }, // the Job/Attendance Date
    startTime: { type: String, trim: true }, // "08:00"
    endTime: { type: String, trim: true }, // "17:00"
    shift: { type: String, enum: ['Day', 'Night'], default: 'Day' },
    rate: { type: Number, required: true }, // callout rate applied for this specific date
    fare: { type: Number, default: 0 }, // transport cost for this attendance (tracked separately from earnings)
    notes: { type: String, trim: true },
    clientRequestId: { type: String, trim: true }, // stops an offline retry creating a duplicate
    // sites visited for this record (only used for jobs that cover several sites)
    sites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Site' }],
  },
  { timestamps: true }
);

attendanceSchema.index({ owner: 1, job: 1, date: 1 });
attendanceSchema.index({ owner: 1, clientRequestId: 1 }, { sparse: true });

attendanceSchema.index({ owner: 1, date: -1 }); // speeds up the sorted list query
module.exports = mongoose.model('Attendance', attendanceSchema);
