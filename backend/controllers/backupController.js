const Client = require('../models/Client');
const Site = require('../models/Site');
const Job = require('../models/Job');
const Attendance = require('../models/Attendance');
const Payment = require('../models/Payment');
const PaymentAllocation = require('../models/PaymentAllocation');
const MpesaTransaction = require('../models/MpesaTransaction');
const JobDocument = require('../models/JobDocument');
const Transport = require('../models/Transport');
const HistoricalRecord = require('../models/HistoricalRecord');
const Settings = require('../models/Settings');

// Exports every record belonging to the logged-in user as one JSON file.
// This is a data-safety backup, not a way to move between accounts - it
// includes internal IDs and references exactly as stored.
exports.exportAll = async (req, res) => {
  try {
    const owner = req.user.id;

    const [clients, sites, jobs, attendance, payments, allocations, mpesa, documents, transport, historical, settings] =
      await Promise.all([
        Client.find({ owner }).lean(),
        Site.find({ owner }).lean(),
        Job.find({ owner }).lean(),
        Attendance.find({ owner }).lean(),
        Payment.find({ owner }).lean(),
        PaymentAllocation.find({ owner }).lean(),
        MpesaTransaction.find({ owner }).lean(),
        JobDocument.find({ owner }).lean(),
        Transport.find({ owner }).lean(),
        HistoricalRecord.find({ owner }).lean(),
        Settings.findOne({ owner }).lean(),
      ]);

    res.json({
      exportedAt: new Date().toISOString(),
      version: 1,
      data: { clients, sites, jobs, attendance, payments, allocations, mpesa, documents, transport, historical, settings },
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to export data', error: err.message });
  }
};
