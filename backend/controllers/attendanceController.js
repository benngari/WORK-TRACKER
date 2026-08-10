const Attendance = require('../models/Attendance');
const Job = require('../models/Job');

exports.list = async (req, res) => {
  try {
    const filter = { owner: req.user.id };
    if (req.query.job) filter.job = req.query.job;
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to) filter.date.$lte = new Date(req.query.to);
    }
    const records = await Attendance.find(filter)
      .populate({ path: 'job', populate: ['client', 'site'] })
      .sort({ date: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch attendance', error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.body.job, owner: req.user.id });
    if (!job) return res.status(404).json({ message: 'Job not found' });

    const record = await Attendance.create({
      ...req.body,
      owner: req.user.id,
      rate: req.body.rate ?? job.rate,
    });
    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ message: 'Failed to record attendance', error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const record = await Attendance.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!record) return res.status(404).json({ message: 'Not found' });
    res.json(record);
  } catch (err) {
    res.status(400).json({ message: 'Failed to update attendance', error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const record = await Attendance.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
    if (!record) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete attendance', error: err.message });
  }
};

// For the calendar view: attendance grouped by date within a month/range
exports.calendar = async (req, res) => {
  try {
    const filter = { owner: req.user.id };
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to) filter.date.$lte = new Date(req.query.to);
    }
    const records = await Attendance.find(filter).populate({
      path: 'job',
      populate: ['client', 'site'],
    });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch calendar data', error: err.message });
  }
};
