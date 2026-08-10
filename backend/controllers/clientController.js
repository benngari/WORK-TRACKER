const crudFactory = require('../utils/crudFactory');
const Client = require('../models/Client');
const Site = require('../models/Site');
const Job = require('../models/Job');

const base = crudFactory(Client, { sort: { name: 1 } });

exports.list = base.list;
exports.getOne = base.getOne;
exports.create = base.create;
exports.update = base.update;

// Block deleting a client that still has sites/jobs, to protect data integrity
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

// Client with a rollup of sites/jobs/financials - powers the "Bank & Site history" view
exports.summary = async (req, res) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, owner: req.user.id });
    if (!client) return res.status(404).json({ message: 'Not found' });

    const sites = await Site.find({ client: client._id, owner: req.user.id }).sort({ bankName: 1, branch: 1 });
    const jobs = await Job.find({ client: client._id, owner: req.user.id }).populate('site');

    res.json({ client, sites, jobs });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch client summary', error: err.message });
  }
};
