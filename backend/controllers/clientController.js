const crudFactory = require('../utils/crudFactory');
const Client = require('../models/Client');
const Site = require('../models/Site');
const Job = require('../models/Job');
const Attendance = require('../models/Attendance');
const PaymentAllocation = require('../models/PaymentAllocation');

const base = crudFactory(Client, { sort: { name: 1 } });

exports.list = async (req, res) => {
  try {
    const clients = await Client.find({ owner: req.user.id }).sort({ name: 1 }).lean();
    const jobs = await Job.find({ owner: req.user.id, deletedAt: null }).lean();
    const jobIds = jobs.map((j) => j._id);

    const [allAttendance, allAllocations] = await Promise.all([
      Attendance.find({ job: { $in: jobIds }, owner: req.user.id }).lean(),
      PaymentAllocation.find({ job: { $in: jobIds }, owner: req.user.id }).lean(),
    ]);

    const attendanceByJob = {};
    for (const a of allAttendance) {
      const key = String(a.job);
      (attendanceByJob[key] = attendanceByJob[key] || []).push(a);
    }
    const paidByJob = {};
    for (const a of allAllocations) {
      if (a.allocationType === 'Fare') continue;
      const key = String(a.job);
      paidByJob[key] = (paidByJob[key] || 0) + a.amount;
    }

    const balanceByClient = {};
    for (const job of jobs) {
      const jobAttendance = attendanceByJob[String(job._id)] || [];
      const expected = job.expectedPaymentOverride ?? jobAttendance.length * job.rate;
      const paid = paidByJob[String(job._id)] || 0;
      const outstanding = Math.max(0, expected - paid);
      const key = String(job.client);
      balanceByClient[key] = (balanceByClient[key] || 0) + outstanding;
    }

    const withBalance = clients.map((c) => ({
      ...c,
      outstandingBalance: balanceByClient[String(c._id)] || 0,
    }));

    res.json(withBalance);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch clients', error: err.message });
  }
};

exports.getOne = base.getOne;
exports.create = base.create;
exports.update = base.update;

exports.remove = async (req, res) => {
  try {
    const siteCount = await Site.countDocuments({ client: req.params.id, owner: req.user.id });
    const jobCount = await Job.countDocuments({ client: req.params.id, owner: req.user.id });
    if (siteCount > 0 || jobCount > 0) {
      return res.status(409).json({
        message: `Cannot delete: this client has ${siteCount} site(s) and ${jobCount} job(s) attached.`,
      });
    }
    const client = await Client.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
    if (!client) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete client', error: err.message });
  }
};

exports.summary = async (req, res) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, owner: req.user.id });
    if (!client) return res.status(404).json({ message: 'Not found' });

    const sites = await Site.find({ client: client._id, owner: req.user.id }).sort({ bankName: 1, branch: 1 });
    const jobs = await Job.find({ client: client._id, owner: req.user.id, deletedAt: null }).populate('site');

    res.json({ client, sites, jobs });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch client summary', error: err.message });
  }
};