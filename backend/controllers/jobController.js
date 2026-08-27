const Job = require('../models/Job');
const Attendance = require('../models/Attendance');
const PaymentAllocation = require('../models/PaymentAllocation');
const JobDocument = require('../models/JobDocument');
const { cloudinary } = require('../config/cloudinary');

async function batchComputeFinancials(jobs, ownerId) {
  const jobIds = jobs.map((j) => j._id);
  const [allAttendance, allAllocations] = await Promise.all([
    Attendance.find({ job: { $in: jobIds }, owner: ownerId }).lean(),
    PaymentAllocation.find({ job: { $in: jobIds }, owner: ownerId }).lean(),
  ]);

  const attendanceByJob = {};
  for (const a of allAttendance) {
    const key = String(a.job);
    (attendanceByJob[key] = attendanceByJob[key] || []).push(a);
  }
  const paidByJob = {};
  const fareByJob = {};
  for (const a of allAllocations) {
    const key = String(a.job);
    if (a.allocationType === 'Fare') {
      fareByJob[key] = (fareByJob[key] || 0) + a.amount;
    } else {
      paidByJob[key] = (paidByJob[key] || 0) + a.amount;
    }
  }

  return jobs.map((job) => {
    const jobAttendance = attendanceByJob[String(job._id)] || [];
    const paid = paidByJob[String(job._id)] || 0;
    const fareReceived = fareByJob[String(job._id)] || 0;
    const expected = job.expectedPaymentOverride ?? jobAttendance.length * job.rate;
    const outstanding = Math.max(0, expected - paid);

    let paymentStatus = 'Pending';
    if (paid === 0 && expected > 0) paymentStatus = 'Pending';
    else if (paid > 0 && paid < expected) paymentStatus = 'Partially Paid';
    else if (paid === expected && expected > 0) paymentStatus = 'Paid';
    else if (paid > expected) paymentStatus = 'Overpaid';

    return { ...job, attendanceCount: jobAttendance.length, attendance: jobAttendance, expected, paid, fareReceived, outstanding, paymentStatus };
  });
}

async function computeJobFinancials(job) {
  const attendance = await Attendance.find({ job: job._id });
  const allocations = await PaymentAllocation.find({ job: job._id });
  const paid = allocations
    .filter((a) => a.allocationType !== 'Fare')
    .reduce((sum, a) => sum + a.amount, 0);
  const fareReceived = allocations
    .filter((a) => a.allocationType === 'Fare')
    .reduce((sum, a) => sum + a.amount, 0);
  const expected = job.expectedPaymentOverride ?? attendance.length * job.rate;
  const outstanding = Math.max(0, expected - paid);

  let paymentStatus = 'Pending';
  if (paid === 0 && expected > 0) paymentStatus = 'Pending';
  else if (paid > 0 && paid < expected) paymentStatus = 'Partially Paid';
  else if (paid === expected && expected > 0) paymentStatus = 'Paid';
  else if (paid > expected) paymentStatus = 'Overpaid';

  return { attendanceCount: attendance.length, expected, paid, fareReceived, outstanding, paymentStatus, attendance };
}

exports.list = async (req, res) => {
  try {
    const filter = { owner: req.user.id, deletedAt: null };
    if (req.query.client) filter.client = req.query.client;
    if (req.query.site) filter.site = req.query.site;
    if (req.query.status) filter.status = req.query.status;

    const jobs = await Job.find(filter).populate('client').populate('site').sort({ createdAt: -1 }).lean();
    const withFinancials = await batchComputeFinancials(jobs, req.user.id);

    res.json(
      withFinancials.map((j) => {
        const dates = (j.attendance || []).map((a) => a.date).sort((a, b) => new Date(a) - new Date(b));
        return { ...j, date: dates[0] || j.createdAt, attendance: undefined };
      })
    );
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch jobs', error: err.message });
  }
};

exports.trash = async (req, res) => {
  try {
    const jobs = await Job.find({ owner: req.user.id, deletedAt: { $ne: null } })
      .populate('client')
      .populate('site')
      .sort({ deletedAt: -1 })
      .lean();
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch trash', error: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, owner: req.user.id, deletedAt: null })
      .populate('client')
      .populate('site');
    if (!job) return res.status(404).json({ message: 'Not found' });

    const fin = await computeJobFinancials(job);
    const documents = await JobDocument.find({ job: job._id, deletedAt: null }).sort({ createdAt: -1 });
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
      { _id: req.params.id, owner: req.user.id, deletedAt: null },
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
    const job = await Job.findOne({ _id: req.params.id, owner: req.user.id, deletedAt: null });
    if (!job) return res.status(404).json({ message: 'Not found' });

    job.deletedAt = new Date();
    await job.save();
    await JobDocument.updateMany({ job: job._id, owner: req.user.id }, { deletedAt: new Date() });

    res.json({ message: 'Moved to Trash' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete job', error: err.message });
  }
};

exports.restore = async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, owner: req.user.id, deletedAt: { $ne: null } });
    if (!job) return res.status(404).json({ message: 'Not found in Trash' });

    job.deletedAt = null;
    await job.save();
    await JobDocument.updateMany({ job: job._id, owner: req.user.id }, { deletedAt: null });

    res.json({ message: 'Restored' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to restore job', error: err.message });
  }
};

exports.permanentRemove = async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, owner: req.user.id, deletedAt: { $ne: null } });
    if (!job) return res.status(404).json({ message: 'Job must be in Trash before it can be permanently deleted' });

    const documents = await JobDocument.find({ job: job._id, owner: req.user.id });
    for (const doc of documents) {
      try {
        await cloudinary.uploader.destroy(doc.publicId, { resource_type: 'auto' });
      } catch (cloudErr) {
        console.warn('Cloudinary delete warning:', cloudErr.message);
      }
    }
    await JobDocument.deleteMany({ job: job._id, owner: req.user.id });
    await Attendance.deleteMany({ job: job._id, owner: req.user.id });
    await PaymentAllocation.deleteMany({ job: job._id, owner: req.user.id });
    await job.deleteOne();

    res.json({ message: 'Permanently deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to permanently delete job', error: err.message });
  }
};

exports.computeJobFinancials = computeJobFinancials;
exports.batchComputeFinancials = batchComputeFinancials;