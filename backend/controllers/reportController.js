const Job = require('../models/Job');
const { computeJobFinancials } = require('./jobController');

// Powers the Payment Ledger page: Job Date | Client | Site | Job | Callouts |
// Expected | Paid | Balance | Payment Date | Status, with filters.
exports.ledger = async (req, res) => {
  try {
    const filter = { owner: req.user.id };
    if (req.query.client) filter.client = req.query.client;
    if (req.query.site) filter.site = req.query.site;
    if (req.query.status) filter.paymentStatus = req.query.status;

    const jobs = await Job.find(filter).populate('client').populate('site').sort({ createdAt: -1 });

    const rows = await Promise.all(
      jobs.map(async (job) => {
        const fin = await computeJobFinancials(job);
        const dates = fin.attendance.map((a) => a.date).sort((a, b) => a - b);
        return {
          jobId: job._id,
          jobDate: dates[0] || job.createdAt,
          lastAttendance: dates[dates.length - 1] || null,
          client: job.client?.name,
          site: job.site
            ? job.site.siteType === 'Bank'
              ? [job.site.bankName, job.site.branch].filter(Boolean).join(' - ')
              : job.site.siteName
            : null,
          jobCardRef: job.jobCardRef,
          callouts: fin.attendanceCount,
          expected: fin.expected,
          paid: fin.paid,
          balance: fin.outstanding,
          paymentDueDate: job.paymentDueDate,
          status: fin.paymentStatus,
        };
      })
    );

    let filtered = rows;
    if (req.query.from) filtered = filtered.filter((r) => r.jobDate && new Date(r.jobDate) >= new Date(req.query.from));
    if (req.query.to) filtered = filtered.filter((r) => r.jobDate && new Date(r.jobDate) <= new Date(req.query.to));

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ message: 'Failed to build payment ledger', error: err.message });
  }
};

// Powers "Money Owed To Me": only jobs with outstanding > 0
exports.outstanding = async (req, res) => {
  try {
    const jobs = await Job.find({ owner: req.user.id }).populate('client').populate('site');
    const rows = await Promise.all(
      jobs.map(async (job) => {
        const fin = await computeJobFinancials(job);
        if (fin.outstanding <= 0) return null;
        const dates = fin.attendance.map((a) => a.date).sort((a, b) => a - b);
        const lastAttendance = dates[dates.length - 1] || null;
        const daysOutstanding = lastAttendance
          ? Math.floor((Date.now() - new Date(lastAttendance).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        return {
          jobId: job._id,
          client: job.client?.name,
          site: job.site
            ? job.site.siteType === 'Bank'
              ? [job.site.bankName, job.site.branch].filter(Boolean).join(' - ')
              : job.site.siteName
            : null,
          jobCardRef: job.jobCardRef,
          expected: fin.expected,
          paid: fin.paid,
          outstanding: fin.outstanding,
          lastAttendance,
          paymentDueDate: job.paymentDueDate,
          daysOutstanding,
          status: fin.paymentStatus,
        };
      })
    );
    res.json(rows.filter(Boolean).sort((a, b) => b.outstanding - a.outstanding));
  } catch (err) {
    res.status(500).json({ message: 'Failed to build outstanding report', error: err.message });
  }
};
