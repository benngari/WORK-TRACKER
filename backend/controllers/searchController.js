const Client = require('../models/Client');
const Site = require('../models/Site');
const Job = require('../models/Job');
const MpesaTransaction = require('../models/MpesaTransaction');

exports.search = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ clients: [], sites: [], jobs: [], mpesa: [] });

    const regex = new RegExp(q, 'i');
    const ownerFilter = { owner: req.user.id };

    const clients = await Client.find({ ...ownerFilter, name: regex }).limit(10);

    const sites = await Site.find({
      ...ownerFilter,
      $or: [
        { bankName: regex },
        { branch: regex },
        { siteName: regex },
        { town: regex },
        { county: regex },
        { location: regex },
      ],
    })
      .populate('client')
      .limit(15);

    const jobs = await Job.find({
      ...ownerFilter,
      deletedAt: null,
      $or: [{ jobCardRef: regex }, { jobType: regex }, { description: regex }],
    })
      .populate('client')
      .populate('site')
      .limit(15);

    const mpesa = await MpesaTransaction.find({
      ...ownerFilter,
      $or: [{ transactionCode: regex }, { sender: regex }, { originalMessage: regex }],
    }).limit(10);

    // If the query matches a client name, also pull all sites/jobs under that client
    const matchingClientIds = clients.map((c) => c._id);
    let relatedSites = [];
    let relatedJobs = [];
    if (matchingClientIds.length) {
      relatedSites = await Site.find({ owner: req.user.id, client: { $in: matchingClientIds } }).populate('client').limit(25);
      relatedJobs = await Job.find({ owner: req.user.id, client: { $in: matchingClientIds }, deletedAt: null }).populate('client').populate('site').limit(25);
    }

    const dedupe = (arr) => Array.from(new Map(arr.map((i) => [String(i._id), i])).values());

    res.json({
      clients,
      sites: dedupe([...sites, ...relatedSites]),
      jobs: dedupe([...jobs, ...relatedJobs]),
      mpesa,
    });
  } catch (err) {
    res.status(500).json({ message: 'Search failed', error: err.message });
  }
};
