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
  },
  { timestamps: true }
);

attendanceSchema.index({ owner: 1, job: 1, date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
