const crudFactory = require('../utils/crudFactory');
const Site = require('../models/Site');
const Job = require('../models/Job');
const Attendance = require('../models/Attendance');
const PaymentAllocation = require('../models/PaymentAllocation');

const base = crudFactory(Site, { populate: 'client', sort: { bankName: 1, branch: 1, siteName: 1 } });

exports.list = base.list;
exports.getOne = base.getOne;
exports.create = base.create;
exports.update = base.update;
exports.remove = base.remove;

// Full history for a single site: every job, attendance date, expected/paid/outstanding
exports.history = async (req, res) => {
  try {
    const site = await Site.findOne({ _id: req.params.id, owner: req.user.id }).populate('client');
    if (!site) return res.status(404).json({ message: 'Not found' });

    const jobs = await Job.find({ site: site._id, owner: req.user.id, deletedAt: null }).sort({ createdAt: -1 });
    const jobIds = jobs.map((j) => j._id);

    const attendance = await Attendance.find({ job: { $in: jobIds }, owner: req.user.id }).sort({ date: 1 });
    const allocations = await PaymentAllocation.find({ job: { $in: jobIds }, owner: req.user.id });

    const attendanceByJob = groupBy(attendance, (a) => String(a.job));
    const paidByJob = {};
    allocations.forEach((a) => {
      const key = String(a.job);
      paidByJob[key] = (paidByJob[key] || 0) + a.amount;
    });

    let totalExpected = 0;
    let totalPaid = 0;
    const jobsWithTotals = jobs.map((job) => {
      const jobAttendance = attendanceByJob[String(job._id)] || [];
      const expected = job.expectedPaymentOverride ?? jobAttendance.length * job.rate;
      const paid = paidByJob[String(job._id)] || 0;
      totalExpected += expected;
      totalPaid += paid;
      return {
        ...job.toObject(),
        attendanceCount: jobAttendance.length,
        attendanceDates: jobAttendance.map((a) => a.date),
        expected,
        paid,
        outstanding: Math.max(0, expected - paid),
      };
    });

    res.json({
      site,
      totalJobs: jobs.length,
      totalAttendance: attendance.length,
      totalExpected,
      totalPaid,
      totalOutstanding: Math.max(0, totalExpected - totalPaid),
      jobs: jobsWithTotals,
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch site history', error: err.message });
  }
};

function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});
}
