import { useEffect, useState } from 'react';
import { Plus, Smartphone, Link2, Upload } from 'lucide-react';
import api from '../api/axios';
import Modal from '../components/Modal.jsx';
import { formatKES, formatDate, siteLabel } from '../utils/format.js';

export default function MpesaPayments() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [allocateModalOpen, setAllocateModalOpen] = useState(false);
  const [activeTx, setActiveTx] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/mpesa').then((res) => setTransactions(res.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setPasteModalOpen(true)} className="btn-primary flex items-center gap-1.5">
          <Plus size={16} /> Add M-PESA Payment
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : transactions.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">
          <Smartphone className="mx-auto mb-2" />
          No M-PESA transactions yet. Paste a confirmation message to get started.
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <th className="py-2.5 px-4">Code</th>
                <th className="py-2.5 px-4">Amount</th>
                <th className="py-2.5 px-4">Sender</th>
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Unallocated</th>
                <th className="py-2.5 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t._id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 px-4 font-mono text-xs text-ink-800">{t.transactionCode || '—'}</td>
                  <td className="py-2.5 px-4 font-medium text-ink-900">{formatKES(t.amount)}</td>
                  <td className="py-2.5 px-4 text-slate-600">{t.sender || '—'}</td>
                  <td className="py-2.5 px-4 text-slate-600">{formatDate(t.transactionDate)}</td>
                  <td className="py-2.5 px-4 text-amber-600 font-medium">{formatKES(t.unallocatedAmount)}</td>
                  <td className="py-2.5 px-4 text-right">
                    {t.unallocatedAmount > 0 && (
                      <button
                        onClick={() => { setActiveTx(t); setAllocateModalOpen(true); }}
                        className="text-brand-600 text-xs font-medium flex items-center gap-1 ml-auto"
                      >
                        <Link2 size={13} /> Allocate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PasteParseModal open={pasteModalOpen} onClose={() => setPasteModalOpen(false)} onSaved={load} />
      {activeTx && (
        <AllocateModal
          open={allocateModalOpen}
          onClose={() => setAllocateModalOpen(false)}
          tx={activeTx}
          onSaved={load}
        />
      )}
    </div>
  );
}

function PasteParseModal({ open, onClose, onSaved }) {
  const [step, setStep] = useState('paste'); // paste -> review
  const [message, setMessage] = useState('');
  const [parsed, setParsed] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [proofFile, setProofFile] = useState(null);

  const reset = () => {
    setStep('paste');
    setMessage('');
    setParsed(null);
    setDuplicate(null);
    setError('');
    setProofFile(null);
  };

  const handleParse = async () => {
    setParsing(true);
    setError('');
    try {
      const { data } = await api.post('/mpesa/parse', { message });
      setParsed(data.parsed);
      setDuplicate(data.duplicate);
      setStep('review');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to parse message');
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const { data: tx } = await api.post('/mpesa', {
        transactionCode: parsed.transactionCode,
        amount: parsed.amount,
        sender: parsed.sender,
        transactionDate: parsed.transactionDate,
        mpesaBalance: parsed.mpesaBalance,
        originalMessage: parsed.originalMessage,
        parsedSuccessfully: parsed.parsedSuccessfully,
      });

      if (proofFile) {
        const formData = new FormData();
        formData.append('file', proofFile);
        formData.append('category', 'M-PESA Proof');
        const { data: doc } = await api.post('/documents/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        await api.put(`/mpesa/${tx._id}`, { proofDocument: { url: doc.url, publicId: doc.publicId } });
      }

      // Also create a Payment record linked to this transaction, ready for allocation
      await api.post('/payments', {
        method: 'M-PESA',
        mpesaTransaction: tx._id,
        amount: tx.amount,
        receivedDate: tx.transactionDate || new Date(),
      });

      onSaved();
      onClose();
      reset();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save transaction');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={() => { onClose(); reset(); }} title="Add M-PESA Payment" wide>
      {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2 mb-3">{error}</div>}

      {step === 'paste' && (
        <div className="space-y-3">
          <label className="label">Paste the M-PESA confirmation message</label>
          <textarea
            className="input font-mono text-xs"
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder='e.g. "Confirmed. You have received Ksh3,000.00 from TENDE B2C 0722123456 on 15/7/26 at 7:24 AM. New M-PESA balance is Ksh12,450.00."'
          />
          <button onClick={handleParse} disabled={parsing || !message.trim()} className="btn-primary w-full">
            {parsing ? 'Parsing...' : 'Parse Message'}
          </button>
        </div>
      )}

      {step === 'review' && parsed && (
        <div className="space-y-3">
          {duplicate && (
            <div className="text-sm bg-amber-50 text-amber-700 rounded-lg px-3 py-2">
              A transaction with this code was already recorded — check for duplicates before saving.
            </div>
          )}
          {!parsed.parsedSuccessfully && (
            <div className="text-sm bg-amber-50 text-amber-700 rounded-lg px-3 py-2">
              Some fields couldn't be auto-detected. Please review and correct them below.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Transaction Code</label>
              <input className="input" value={parsed.transactionCode || ''} onChange={(e) => setParsed({ ...parsed, transactionCode: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label className="label">Amount (KES)</label>
              <input type="number" className="input" value={parsed.amount || ''} onChange={(e) => setParsed({ ...parsed, amount: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Sender</label>
              <input className="input" value={parsed.sender || ''} onChange={(e) => setParsed({ ...parsed, sender: e.target.value })} />
            </div>
            <div>
              <label className="label">Date/Time</label>
              <input
                type="datetime-local"
                className="input"
                value={parsed.transactionDate ? new Date(parsed.transactionDate).toISOString().slice(0, 16) : ''}
                onChange={(e) => setParsed({ ...parsed, transactionDate: e.target.value })}
              />
            </div>
            <div>
              <label className="label">M-PESA Balance</label>
              <input type="number" className="input" value={parsed.mpesaBalance || ''} onChange={(e) => setParsed({ ...parsed, mpesaBalance: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className="label">Attach Screenshot / Proof (optional)</label>
            <label className="btn-secondary flex items-center gap-1.5 cursor-pointer w-fit">
              <Upload size={15} /> {proofFile ? proofFile.name : 'Choose file'}
              <input type="file" className="hidden" onChange={(e) => setProofFile(e.target.files[0])} />
            </label>
          </div>
          <div>
            <label className="label">Original Message</label>
            <textarea className="input font-mono text-xs" rows={3} value={parsed.originalMessage} readOnly />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep('paste')} className="btn-secondary flex-1">Back</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving...' : 'Save Transaction'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function AllocateModal({ open, onClose, tx, onSaved }) {
  const [jobs, setJobs] = useState([]);
  const [payments, setPayments] = useState([]);
  const [selectedJob, setSelectedJob] = useState('');
  const [amount, setAmount] = useState(0);
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
      await api.post(`/payments/${payment._id}/allocate`, { jobId: selectedJob, amount });
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
