const Job = require('../models/Job');
const { batchComputeFinancials } = require('./jobController');

exports.ledger = async (req, res) => {
  try {
    const filter = { owner: req.user.id, deletedAt: null };
    if (req.query.client) filter.client = req.query.client;
    if (req.query.site) filter.site = req.query.site;

    const jobs = await Job.find(filter).populate('client').populate('site').sort({ createdAt: -1 }).lean();
    const withFinancials = await batchComputeFinancials(jobs, req.user.id);

    let rows = withFinancials.map((job) => {
      const dates = (job.attendance || []).map((a) => a.date).sort((a, b) => new Date(a) - new Date(b));
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
        callouts: job.attendanceCount,
        expected: job.expected,
        paid: job.paid,
        balance: job.outstanding,
        paymentDueDate: job.paymentDueDate,
        status: job.paymentStatus,
      };
    });

    if (req.query.status) rows = rows.filter((r) => r.status === req.query.status);
    if (req.query.from) rows = rows.filter((r) => r.jobDate && new Date(r.jobDate) >= new Date(req.query.from));
    if (req.query.to) rows = rows.filter((r) => r.jobDate && new Date(r.jobDate) <= new Date(req.query.to));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to build payment ledger', error: err.message });
  }
};

exports.outstanding = async (req, res) => {
  try {
    const jobs = await Job.find({ owner: req.user.id, deletedAt: null }).populate('client').populate('site').lean();
    const withFinancials = await batchComputeFinancials(jobs, req.user.id);
    const now = new Date();

    const rows = withFinancials
      .filter((job) => job.outstanding > 0)
      .map((job) => {
        const dates = (job.attendance || []).map((a) => a.date).sort((a, b) => new Date(a) - new Date(b));
        const lastAttendance = dates[dates.length - 1] || null;
        const daysOutstanding = lastAttendance
          ? Math.floor((Date.now() - new Date(lastAttendance).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        const isOverdue = Boolean(job.paymentDueDate && new Date(job.paymentDueDate) < now);
        return {
          jobId: job._id,
          client: job.client?.name,
          site: job.site
            ? job.site.siteType === 'Bank'
              ? [job.site.bankName, job.site.branch].filter(Boolean).join(' - ')
              : job.site.siteName
            : null,
          jobCardRef: job.jobCardRef,
          expected: job.expected,
          paid: job.paid,
          outstanding: job.outstanding,
          lastAttendance,
          paymentDueDate: job.paymentDueDate,
          daysOutstanding,
          isOverdue,
          status: job.paymentStatus,
        };
      })
      .sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        return b.outstanding - a.outstanding;
      });

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to build outstanding report', error: err.message });
  }
};

exports.overdueSummary = async (req, res) => {
  try {
    const jobs = await Job.find({ owner: req.user.id, deletedAt: null }).lean();
    const withFinancials = await batchComputeFinancials(jobs, req.user.id);
    const now = new Date();

    const overdue = withFinancials.filter(
      (job) => job.outstanding > 0 && job.paymentDueDate && new Date(job.paymentDueDate) < now
    );

    res.json({
      count: overdue.length,
      totalAmount: overdue.reduce((sum, j) => sum + j.outstanding, 0),
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to build overdue summary', error: err.message });
  }
};