const Job = require('../models/Job');
const Attendance = require('../models/Attendance');
const PaymentAllocation = require('../models/PaymentAllocation');
const JobDocument = require('../models/JobDocument');

// Computes expected/paid/outstanding + status for a single job document.
// Expected = manual override if set, else (number of attendance records * job.rate)
// Paid = sum of payment allocations for this job
// Outstanding = max(0, Expected - Paid)
async function computeJobFinancials(job) {
  const attendance = await Attendance.find({ job: job._id });
  const allocations = await PaymentAllocation.find({ job: job._id });
  const paid = allocations.reduce((sum, a) => sum + a.amount, 0);
  const expected = job.expectedPaymentOverride ?? attendance.length * job.rate;
  const outstanding = Math.max(0, expected - paid);

  let paymentStatus = 'Pending';
  if (paid === 0 && expected > 0) paymentStatus = 'Pending';
  else if (paid > 0 && paid < expected) paymentStatus = 'Partially Paid';
  else if (paid === expected && expected > 0) paymentStatus = 'Paid';
  else if (paid > expected) paymentStatus = 'Overpaid';

  return {
    attendanceCount: attendance.length,
    expected,
    paid,
    outstanding,
    paymentStatus,
    attendance,
  };
}

exports.list = async (req, res) => {
  try {
    const filter = { owner: req.user.id };
    if (req.query.client) filter.client = req.query.client;
    if (req.query.site) filter.site = req.query.site;
    if (req.query.status) filter.status = req.query.status;

    const jobs = await Job.find(filter)
      .populate('client')
      .populate('site')
      .sort({ createdAt: -1 });

    const withFinancials = await Promise.all(
      jobs.map(async (job) => {
        const fin = await computeJobFinancials(job);
        // Keep paymentStatus in sync with actual allocations
        if (job.paymentStatus !== fin.paymentStatus) {
          job.paymentStatus = fin.paymentStatus;
          await job.save();
        }
        return { ...job.toObject(), ...fin, attendance: undefined };
      })
    );

    res.json(withFinancials);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch jobs', error: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, owner: req.user.id })
      .populate('client')
      .populate('site');
    if (!job) return res.status(404).json({ message: 'Not found' });

    const fin = await computeJobFinancials(job);
    const documents = await JobDocument.find({ job: job._id }).sort({ createdAt: -1 });
    const allocations = await PaymentAllocation.find({ job: job._id }).populate({
      path: 'payment',
      populate: { path: 'mpesaTransaction' },
    });

    res.json({ ...job.toObject(), ...fin, documents, allocations });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch job', error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const job = await Job.create({ ...req.body, owner: req.user.id });
    res.status(201).json(job);
  } catch (err) {
    res.status(400).json({ message: 'Failed to create job', error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const job = await Job.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!job) return res.status(404).json({ message: 'Not found' });
    res.json(job);
  } catch (err) {
    res.status(400).json({ message: 'Failed to update job', error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const job = await Job.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
    if (!job) return res.status(404).json({ message: 'Not found' });
    await Attendance.deleteMany({ job: job._id });
    await PaymentAllocation.deleteMany({ job: job._id });
    await JobDocument.updateMany({ job: job._id }, { job: null }); // keep documents, unlink
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete job', error: err.message });
  }
};

exports.computeJobFinancials = computeJobFinancials;
