function AllocateModal({ open, onClose, tx, onSaved }) {
  const [jobs, setJobs] = useState([]);
  const [payments, setPayments] = useState([]);
  const [selectedJob, setSelectedJob] = useState('');
  const [amount, setAmount] = useState(0);
  const [allocationType, setAllocationType] = useState('Payment');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    api.get('/jobs').then((res) => setJobs(res.data));
    api.get('/payments').then((res) => {
      setPayments(res.data);
      const match = res.data.find((p) => p.mpesaTransaction?._id === tx._id);
      if (match) setAmount(match.unallocated);
    });
  }, [open, tx]);

  const handleAllocate = async () => {
    setSaving(true);
    setError('');
    try {
      const payment = payments.find((p) => p.mpesaTransaction?._id === tx._id);
      if (!payment) throw new Error('No payment record found for this transaction');
      await api.post(`/payments/${payment._id}/allocate`, { jobId: selectedJob, amount, allocationType });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to allocate');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Allocate ${formatKES(tx.unallocatedAmount)}`}>
      {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2 mb-3">{error}</div>}
      <div className="space-y-3">
        <div>
          <label className="label">Job</label>
          <select className="input" value={selectedJob} onChange={(e) => setSelectedJob(e.target.value)}>
            <option value="">Select job...</option>
            {jobs.map((j) => (
              <option key={j._id} value={j._id}>
                {j.client?.name} — {siteLabel(j.site)} ({formatKES(j.outstanding)} owed)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">This money is for</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAllocationType('Payment')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                allocationType === 'Payment' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              Job Payment
            </button>
            <button
              type="button"
              onClick={() => setAllocationType('Fare')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                allocationType === 'Fare' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              Fare / Transport
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Fare reimbursements are tracked separately and never count toward the job's callout payment total.
          </p>
        </div>
        <div>
          <label className="label">Amount to Allocate</label>
          <input type="number" className="input" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </div>
        <button onClick={handleAllocate} disabled={saving || !selectedJob} className="btn-primary w-full">
          {saving ? 'Allocating...' : 'Allocate to Job'}
        </button>
      </div>
    </Modal>
  );
}