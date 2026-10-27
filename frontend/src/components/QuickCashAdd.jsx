import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import api from '../api/axios';
import { useToast } from '../context/ToastContext.jsx';
import { formatKES } from '../utils/format.js';

// today's date in Kenya time, as YYYY-MM-DD
const todayNairobi = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

// Records money received in cash (or bank / other) and allocates it to this job in one step.
export default function QuickCashAdd({ job, onDone }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState('Cash');
  const [type, setType] = useState('Payment');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayNairobi());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openForm = () => {
    setMethod('Cash');
    setType('Payment');
    setAmount(job.outstanding > 0 ? String(job.outstanding) : '');
    setDate(todayNairobi());
    setNote('');
    setError('');
    setOpen(true);
  };

  const handleSave = async () => {
    const value = Number(amount);
    if (!(value > 0)) {
      setError('Enter the amount you received');
      return;
    }
    setSaving(true);
    setError('');
    let paymentId = null;
    try {
      const { data: payment } = await api.post('/payments', {
        method,
        amount: value,
        receivedDate: `${date}T12:00:00+03:00`,
        notes: note.trim() || undefined,
      });
      paymentId = payment._id;
      await api.post(`/payments/${paymentId}/allocate`, {
        jobId: job._id,
        amount: value,
        allocationType: type,
        notes: note.trim() || undefined,
      });
      toast.success(`${method} payment recorded`);
      setOpen(false);
      onDone();
    } catch (err) {
      // if the payment was saved but could not be allocated, remove it so nothing is left hanging
      if (paymentId) await api.delete(`/payments/${paymentId}`).catch(() => {});
      setError(err.response?.data?.message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button onClick={openForm} className="btn-secondary w-full flex items-center justify-center gap-1.5">
        <Plus size={16} /> Record Cash / Other Payment
      </button>
    );
  }

  const toggleClass = (active) =>
    `flex-1 py-2 rounded-lg text-sm font-medium border ${
      active ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200'
    }`;

  return (
    <div className="card space-y-3">
      <div className="flex justify-between items-center">
        <div className="font-semibold text-ink-900 text-sm">Record Cash / Other Payment</div>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
          <X size={18} />
        </button>
      </div>
      {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}

      <div>
        <label className="label">Paid by</label>
        <div className="flex gap-2">
          {['Cash', 'Bank Transfer', 'Other'].map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)} className={toggleClass(method === m)}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Amount received (KES)</label>
          <input type="number" min="0" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 5000" />
        </div>
        <div>
          <label className="label">Date received</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      {job.outstanding > 0 && (
        <div className="text-xs text-slate-400">Outstanding on this job: {formatKES(job.outstanding)}</div>
      )}

      <div>
        <label className="label">This money is for</label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setType('Payment')} className={toggleClass(type === 'Payment')}>Job Payment</button>
          <button type="button" onClick={() => setType('Fare')} className={toggleClass(type === 'Fare')}>Fare / Transport</button>
        </div>
      </div>

      <div>
        <label className="label">Note (optional)</label>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. paid by the supervisor" />
      </div>

      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Cancel</button>
        <button onClick={handleSave} disabled={saving || !(Number(amount) > 0)} className="btn-primary flex-1">
          {saving ? 'Saving...' : 'Save Payment'}
        </button>
      </div>
    </div>
  );
}