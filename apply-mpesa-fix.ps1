# M-PESA fixes: date shift fix, paste-on-job-payments, delete wrongly pasted M-PESA messages.
# Run from project root: powershell -ExecutionPolicy Bypass -File .\apply-mpesa-fix.ps1
function Write-FileUtf8NoBom {
    param([string]$Path, [string]$Content)
    $fullPath = Join-Path (Get-Location) $Path
    $dir = Split-Path -Path $fullPath -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($fullPath, $Content, $utf8NoBom)
}

Write-FileUtf8NoBom -Path 'backend/utils/mpesaParser.js' -Content @'
/**
 * Parses a pasted M-PESA confirmation SMS and extracts structured fields.
 * Handles the common "Confirmed" receive-money format, e.g.:
 *
 *  "TENDE12ABC Confirmed. You have received Ksh3,000.00 from TENDE B2C
 *   0722123456 on 15/7/26 at 7:24 AM. New M-PESA balance is Ksh12,450.00."
 *
 * Real M-PESA messages vary in wording, so this is best-effort: it returns
 * whatever it can confidently find and flags what it couldn't, so the UI
 * can prompt for manual correction rather than silently guessing wrong.
 */

function parseMpesaMessage(rawMessage) {
  const message = (rawMessage || '').trim();
  const result = {
    transactionCode: null,
    amount: null,
    sender: null,
    transactionDate: null,
    mpesaBalance: null,
    originalMessage: message,
    parsedSuccessfully: false,
    warnings: [],
  };

  if (!message) {
    result.warnings.push('Empty message');
    return result;
  }

  // Transaction code: first token, usually 10 alphanumeric chars, e.g. "QAB1XYZ23"
  const codeMatch = message.match(/^([A-Z0-9]{6,12})\s/);
  if (codeMatch) {
    result.transactionCode = codeMatch[1];
  } else {
    result.warnings.push('Could not find transaction code');
  }

  // Amount: "received Ksh3,000.00" or "Ksh 3,000"
  const amountMatch = message.match(/received\s+Ksh?\.?\s?([\d,]+(?:\.\d{1,2})?)/i);
  if (amountMatch) {
    result.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  } else {
    result.warnings.push('Could not find amount received');
  }

  // Sender: "from TENDE B2C 0722123456" or "from JOHN DOE 254722123456"
  const senderMatch = message.match(/from\s+([A-Z0-9 .&'\-]+?)(?:\s+\d{9,12})?\s+on\s+\d/i);
  if (senderMatch) {
    result.sender = senderMatch[1].trim();
  } else {
    // fallback: everything between "from" and "on <date>"
    const fallback = message.match(/from\s+(.+?)\s+on\s+/i);
    if (fallback) {
      result.sender = fallback[1].trim();
    } else {
      result.warnings.push('Could not find sender');
    }
  }

  // Date + time: "on 15/7/26 at 7:24 AM"
  const dateMatch = message.match(
    /on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+at\s+(\d{1,2}:\d{2}\s?[AP]M)/i
  );
  if (dateMatch) {
    const [, datePart, timePart] = dateMatch;
    result.transactionDate = buildDate(datePart, timePart);
  } else {
    result.warnings.push('Could not find transaction date/time');
  }

  // Balance: "New M-PESA balance is Ksh12,450.00"
  const balanceMatch = message.match(/balance\s+is\s+Ksh?\.?\s?([\d,]+(?:\.\d{1,2})?)/i);
  if (balanceMatch) {
    result.mpesaBalance = parseFloat(balanceMatch[1].replace(/,/g, ''));
  }

  result.parsedSuccessfully = Boolean(
    result.transactionCode && result.amount && result.transactionDate
  );

  return result;
}

function buildDate(datePart, timePart) {
  try {
    const [d, m, y] = datePart.split('/').map((n) => parseInt(n, 10));
    const fullYear = y < 100 ? 2000 + y : y;

    const timeMatch = timePart.match(/(\d{1,2}):(\d{2})\s?([AP]M)/i);
    if (!timeMatch) return null;
    let [, hh, mm, ampm] = timeMatch;
    hh = parseInt(hh, 10);
    mm = parseInt(mm, 10);
    if (/PM/i.test(ampm) && hh !== 12) hh += 12;
    if (/AM/i.test(ampm) && hh === 12) hh = 0;

    // M-PESA SMS times are East Africa Time (UTC+3). Build the instant explicitly so the
    // server timezone (Render runs in UTC) can never shift the date.
    return new Date(Date.UTC(fullYear, m - 1, d, hh - 3, mm));
  } catch {
    return null;
  }
}

module.exports = { parseMpesaMessage };
'@
Write-Host 'Wrote backend/utils/mpesaParser.js'

Write-FileUtf8NoBom -Path 'backend/controllers/mpesaController.js' -Content @'
const MpesaTransaction = require('../models/MpesaTransaction');
const Payment = require('../models/Payment');
const PaymentAllocation = require('../models/PaymentAllocation');
const Job = require('../models/Job');
const { computeJobFinancials } = require('./jobController');
const { parseMpesaMessage } = require('../utils/mpesaParser');

// Step 1: paste a message, get back the parsed fields WITHOUT saving yet,
// so the user can review/correct before it's stored.
exports.parse = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ message: 'message is required' });

    const parsed = parseMpesaMessage(message);

    let duplicate = null;
    if (parsed.transactionCode) {
      duplicate = await MpesaTransaction.findOne({
        owner: req.user.id,
        transactionCode: parsed.transactionCode,
      });
    }

    res.json({ parsed, duplicate: duplicate ? { id: duplicate._id, createdAt: duplicate.createdAt } : null });
  } catch (err) {
    res.status(500).json({ message: 'Failed to parse message', error: err.message });
  }
};

exports.list = async (req, res) => {
  try {
    const transactions = await MpesaTransaction.find({ owner: req.user.id }).sort({ transactionDate: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch transactions', error: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const tx = await MpesaTransaction.findOne({ _id: req.params.id, owner: req.user.id });
    if (!tx) return res.status(404).json({ message: 'Not found' });
    res.json(tx);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch transaction', error: err.message });
  }
};

// Step 2: save the (possibly corrected) transaction after review
exports.create = async (req, res) => {
  try {
    if (req.body.transactionCode) {
      const existing = await MpesaTransaction.findOne({
        owner: req.user.id,
        transactionCode: req.body.transactionCode.toUpperCase(),
      });
      if (existing) {
        return res.status(409).json({ message: 'A transaction with this code already exists', existingId: existing._id });
      }
    }
    const tx = await MpesaTransaction.create({ ...req.body, owner: req.user.id });
    res.status(201).json(tx);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Duplicate transaction code' });
    }
    res.status(400).json({ message: 'Failed to save transaction', error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const tx = await MpesaTransaction.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!tx) return res.status(404).json({ message: 'Not found' });
    res.json(tx);
  } catch (err) {
    res.status(400).json({ message: 'Failed to update transaction', error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const tx = await MpesaTransaction.findOne({ _id: req.params.id, owner: req.user.id });
    if (!tx) return res.status(404).json({ message: 'Not found' });

    // Remove the linked payment record and any allocations to jobs, then refresh those jobs' status
    const payments = await Payment.find({ owner: req.user.id, mpesaTransaction: tx._id });
    for (const payment of payments) {
      const allocations = await PaymentAllocation.find({ payment: payment._id });
      for (const a of allocations) {
        const job = await Job.findById(a.job);
        await a.deleteOne();
        if (job) {
          const fin = await computeJobFinancials(job);
          job.paymentStatus = fin.paymentStatus;
          await job.save();
        }
      }
      await payment.deleteOne();
    }

    await tx.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete transaction', error: err.message });
  }
};
'@
Write-Host 'Wrote backend/controllers/mpesaController.js'

Write-FileUtf8NoBom -Path 'frontend/src/utils/format.js' -Content @'
export function getCurrency() {
  return localStorage.getItem('wt_currency') || 'KES';
}

export function setCurrency(code) {
  localStorage.setItem('wt_currency', code || 'KES');
}

export function formatKES(amount) {
  const n = Number(amount) || 0;
  const currency = getCurrency();
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatDate(date) {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d)) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' });
}

export function siteLabel(site) {
  if (!site) return '-';
  if (site.siteType === 'Bank') return [site.bankName, site.branch].filter(Boolean).join(' - ');
  return site.siteName || '-';
}

export function getThumbnailUrl(url, { width = 300, height = 200 } = {}) {
  if (!url) return null;
  const transformation = `w_${width},h_${height},c_fill,f_auto,q_auto,pg_1`;
  if (url.includes('/upload/')) {
    return url.replace('/upload/', `/upload/${transformation}/`);
  }
  return url;
}

// datetime-local helpers: values are always treated as East Africa Time (UTC+3)
const EAT_MS = 3 * 60 * 60 * 1000;

export function toNairobiInput(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d)) return '';
  return new Date(d.getTime() + EAT_MS).toISOString().slice(0, 16);
}

export function fromNairobiInput(value) {
  if (!value) return null;
  const d = new Date(value + ':00+03:00');
  return isNaN(d) ? null : d.toISOString();
}
'@
Write-Host 'Wrote frontend/src/utils/format.js'

Write-FileUtf8NoBom -Path 'frontend/src/pages/MpesaPayments.jsx' -Content @'
import { useEffect, useState } from 'react';
import { Plus, Smartphone, Link2, Upload, Wallet, Trash2 } from 'lucide-react';
import api from '../api/axios';
import Modal from '../components/Modal.jsx';
import { formatKES, formatDate, siteLabel, toNairobiInput, fromNairobiInput } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

export default function MpesaPayments() {
  const toast = useToast();
  const [transactions, setTransactions] = useState([]);
  const [manualPayments, setManualPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [allocateModalOpen, setAllocateModalOpen] = useState(false);
  const [activeTx, setActiveTx] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/mpesa'), api.get('/payments')])
      .then(([tx, payments]) => {
        setTransactions(tx.data);
        // Manual payments are Payment records with no linked M-PESA transaction
        setManualPayments(payments.data.filter((p) => !p.mpesaTransaction));
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (t) => {
    const allocated = Number(t.allocatedAmount) || 0;
    const warning = allocated > 0
      ? ` It is allocated to jobs (${formatKES(allocated)}); those allocations will be removed too.`
      : '';
    if (!window.confirm(`Delete M-PESA transaction ${t.transactionCode || ''} for ${formatKES(t.amount)}?${warning}`)) return;
    try {
      await api.delete(`/mpesa/${t._id}`);
      toast.success('Transaction deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete transaction');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <button onClick={() => setManualModalOpen(true)} className="btn-secondary flex items-center gap-1.5">
          <Wallet size={16} /> Add Manual Payment
        </button>
        <button onClick={() => setPasteModalOpen(true)} className="btn-primary flex items-center gap-1.5">
          <Plus size={16} /> Add M-PESA Payment
        </button>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-ink-900 mb-2">M-PESA Transactions</h2>
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
                    <td className="py-2.5 px-4 font-mono text-xs text-ink-800">{t.transactionCode || '-'}</td>
                    <td className="py-2.5 px-4 font-medium text-ink-900">{formatKES(t.amount)}</td>
                    <td className="py-2.5 px-4 text-slate-600">{t.sender || '-'}</td>
                    <td className="py-2.5 px-4 text-slate-600">{formatDate(t.transactionDate)}</td>
                    <td className="py-2.5 px-4 text-amber-600 font-medium">{formatKES(t.unallocatedAmount)}</td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {t.unallocatedAmount > 0 && (
                          <button
                            onClick={() => { setActiveTx(t); setAllocateModalOpen(true); }}
                            className="text-brand-600 text-xs font-medium flex items-center gap-1"
                          >
                            <Link2 size={13} /> Allocate
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(t)}
                          className="text-red-500 hover:text-red-700 text-xs font-medium flex items-center gap-1"
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-ink-900 mb-2">Other Payments (Cash, Bank Transfer, etc.)</h2>
        {loading ? (
          <div className="text-sm text-slate-400">Loading...</div>
        ) : manualPayments.length === 0 ? (
          <div className="card text-center py-10 text-slate-400">
            <Wallet className="mx-auto mb-2" />
            No manual payments recorded yet.
          </div>
        ) : (
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                  <th className="py-2.5 px-4">Method</th>
                  <th className="py-2.5 px-4">Amount</th>
                  <th className="py-2.5 px-4">Reference</th>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Unallocated</th>
                </tr>
              </thead>
              <tbody>
                {manualPayments.map((p) => (
                  <tr key={p._id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 px-4 text-ink-800">{p.method}</td>
                    <td className="py-2.5 px-4 font-medium text-ink-900">{formatKES(p.amount)}</td>
                    <td className="py-2.5 px-4 text-slate-600">{p.reference || '-'}</td>
                    <td className="py-2.5 px-4 text-slate-600">{formatDate(p.receivedDate)}</td>
                    <td className="py-2.5 px-4 text-amber-600 font-medium">{formatKES(p.unallocated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
              Allocate these to jobs from the job's Payments tab, or from a job's page directly.
            </div>
          </div>
        )}
      </div>

      <PasteParseModal open={pasteModalOpen} onClose={() => setPasteModalOpen(false)} onSaved={load} />
      <ManualPaymentModal open={manualModalOpen} onClose={() => setManualModalOpen(false)} onSaved={load} />
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

function ManualPaymentModal({ open, onClose, onSaved }) {
  const toast = useToast();
  const [method, setMethod] = useState('Cash');
  const [amount, setAmount] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setMethod('Cash');
    setAmount('');
    setReceivedDate(new Date().toISOString().slice(0, 10));
    setReference('');
    setNotes('');
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/payments', { method, amount: Number(amount), receivedDate, reference, notes });
      toast.success('Payment recorded');
      onSaved();
      onClose();
      reset();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={() => { onClose(); reset(); }} title="Add Manual Payment">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="label">Method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option>Cash</option>
            <option>Bank Transfer</option>
            <option>Other</option>
          </select>
        </div>
        <div>
          <label className="label">Amount</label>
          <input required type="number" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label className="label">Date Received</label>
          <input required type="date" className="input" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Reference (optional)</label>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. cheque number, bank ref" />
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button disabled={saving} className="btn-primary w-full">{saving ? 'Saving...' : 'Save Payment'}</button>
      </form>
    </Modal>
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
              A transaction with this code was already recorded - check for duplicates before saving.
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
              <label className="label">Amount</label>
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
                value={toNairobiInput(parsed.transactionDate)}
                onChange={(e) => setParsed({ ...parsed, transactionDate: fromNairobiInput(e.target.value) })}
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
                {j.client?.name} - {siteLabel(j.site)} ({formatKES(j.outstanding)} owed)
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
'@
Write-Host 'Wrote frontend/src/pages/MpesaPayments.jsx'

Write-FileUtf8NoBom -Path 'frontend/src/pages/JobDetail.jsx' -Content @'
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Upload, FileText, Link2, File as FileIcon, Pencil, Copy, X } from 'lucide-react';
import api from '../api/axios';
import Modal from '../components/Modal.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatKES, formatDate, siteLabel, getThumbnailUrl, toNairobiInput, fromNairobiInput } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

const tabs = ['Overview', 'Attendance', 'Payments', 'Documents', 'Notes'];
const UNDO_WINDOW_MS = 5000;

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [job, setJob] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [loading, setLoading] = useState(true);
  const [editJobOpen, setEditJobOpen] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);

  const load = () => {
    setLoading(true);
    api.get(`/jobs/${id}`).then((res) => setJob(res.data)).finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const handleTrash = async () => {
    if (!confirm('Move this job to Trash? Its documents will move with it. You can restore both later from the Trash page.')) return;
    try {
      await api.delete(`/jobs/${job._id}`);
      toast.success('Job moved to Trash');
      navigate('/jobs');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete job');
    }
  };

  if (loading) return <div className="text-sm text-slate-400">Loading...</div>;
  if (!job) return <div className="text-sm text-red-500">Job not found.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/jobs')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-ink-900">
          <ArrowLeft size={16} /> Back to Jobs
        </button>
        <div className="flex items-center gap-4">
          <button onClick={() => setEditJobOpen(true)} className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700">
            <Pencil size={15} /> Edit Job
          </button>
          <button onClick={() => setRepeatOpen(true)} className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700">
            <Copy size={15} /> Duplicate
          </button>
          <button onClick={handleTrash} className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700">
            <Trash2 size={15} /> Move to Trash
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-ink-900">{job.client?.name} - {siteLabel(job.site)}</div>
            <div className="text-sm text-slate-500">{job.jobCardRef || 'No job card ref'} | {job.jobType || 'Job'}</div>
          </div>
          <StatusBadge status={job.paymentStatus} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-4">
          <Metric label="Callouts" value={job.attendanceCount} />
          <Metric label="Expected" value={formatKES(job.expected)} />
          <Metric label="Paid" value={formatKES(job.paid)} accent="text-brand-600" />
          <Metric label="Outstanding" value={formatKES(job.outstanding)} accent="text-amber-600" />
          <Metric label="Fare Received" value={formatKES(job.fareReceived)} accent="text-blue-600" />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
          {['Job Created', 'Attended', 'Payment Due', 'Matched', 'Paid'].map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full ${
                (step === 'Job Created') ||
                (step === 'Attended' && job.attendanceCount > 0) ||
                (step === 'Payment Due' && job.paymentDueDate) ||
                (step === 'Matched' && job.paid > 0) ||
                (step === 'Paid' && job.paymentStatus === 'Paid')
                  ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400'
              }`}>{step}</span>
              {i < 4 && <span className="text-slate-300">{'->'}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-ink-900'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && <OverviewTab job={job} />}
      {tab === 'Attendance' && <AttendanceTab job={job} onChange={load} />}
      {tab === 'Payments' && <PaymentsTab job={job} onChange={load} />}
      {tab === 'Documents' && <DocumentsTab job={job} onChange={load} />}
      {tab === 'Notes' && <NotesTab job={job} onChange={load} />}

      <EditJobModal open={editJobOpen} onClose={() => setEditJobOpen(false)} job={job} onSaved={load} />
      {repeatOpen && (
        <RepeatJobModal
          job={job}
          onClose={() => setRepeatOpen(false)}
          onDone={(newJobId) => navigate(`/jobs/${newJobId}`)}
        />
      )}
    </div>
  );
}

function RepeatJobModal({ job, onClose, onDone }) {
  const toast = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [fare, setFare] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data: newJob } = await api.post('/jobs', {
        client: job.client?._id,
        site: job.site?._id,
        jobCardRef: job.jobCardRef,
        jobType: job.jobType,
        description: job.description,
        status: 'Open',
        rate: job.rate,
        paymentDueDate: '',
      });
      await api.post('/attendance', { job: newJob._id, date, rate: job.rate, fare });
      toast.success('Job repeated');
      onClose();
      onDone(newJob._id);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to repeat job');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title="Duplicate This Job">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
        <div className="text-sm text-slate-500">
          Creates a new job for <span className="font-medium text-ink-800">{job.client?.name} - {siteLabel(job.site)}</span> with the same rate ({formatKES(job.rate)}) and job details.
        </div>
        <div>
          <label className="label">Date of Visit</label>
          <input required type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Fare (KES)</label>
          <input type="number" className="input" value={fare} onChange={(e) => setFare(Number(e.target.value))} />
        </div>
        <button disabled={saving} className="btn-primary w-full">{saving ? 'Creating...' : 'Create Duplicate Job'}</button>
      </form>
    </Modal>
  );
}

function Metric({ label, value, accent = 'text-ink-900' }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold ${accent}`}>{value}</div>
    </div>
  );
}

function EditJobModal({ open, onClose, job, onSaved }) {
  const toast = useToast();
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !job) return;
    setForm({
      client: job.client?._id || '',
      site: job.site?._id || '',
      jobCardRef: job.jobCardRef || '',
      jobType: job.jobType || '',
      description: job.description || '',
      status: job.status || 'Open',
      rate: job.rate,
      paymentDueDate: job.paymentDueDate ? job.paymentDueDate.slice(0, 10) : '',
    });
    setError('');
    Promise.all([api.get('/clients'), api.get('/sites')]).then(([c, s]) => {
      setClients(c.data);
      setSites(s.data);
    });
  }, [open, job]);

  if (!form) return null;

  const clientSites = sites.filter((s) => s.client?._id === form.client);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.put(`/jobs/${job._id}`, form);
      toast.success('Job updated');
      onClose();
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update job');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Job" wide>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Client</label>
            <select
              required
              className="input"
              value={form.client}
              onChange={(e) => setForm({ ...form, client: e.target.value, site: '' })}
            >
              <option value="">Select client...</option>
              {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Site</label>
            <select required className="input" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} disabled={!form.client}>
              <option value="">Select site...</option>
              {clientSites.map((s) => <option key={s._id} value={s._id}>{siteLabel(s)}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Job Card / Reference</label>
            <input className="input" value={form.jobCardRef} onChange={(e) => setForm({ ...form, jobCardRef: e.target.value })} />
          </div>
          <div>
            <label className="label">Job Type</label>
            <input className="input" value={form.jobType} onChange={(e) => setForm({ ...form, jobType: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option>Open</option>
              <option>In Progress</option>
              <option>Completed</option>
              <option>Cancelled</option>
            </select>
          </div>
          <div>
            <label className="label">Rate (KES/callout)</label>
            <input type="number" className="input" value={form.rate} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Payment Due Date</label>
            <input type="date" className="input" value={form.paymentDueDate} onChange={(e) => setForm({ ...form, paymentDueDate: e.target.value })} />
          </div>
        </div>
        <button disabled={saving} className="btn-primary w-full">{saving ? 'Saving...' : 'Save Changes'}</button>
      </form>
    </Modal>
  );
}

function OverviewTab({ job }) {
  return (
    <div className="card space-y-3 text-sm">
      <Row label="Description" value={job.description || '-'} />
      <Row label="Job Rate" value={formatKES(job.rate)} />
      <Row label="Status" value={job.status} />
      <Row label="Payment Due Date" value={formatDate(job.paymentDueDate)} />
      <Row label="Created" value={formatDate(job.createdAt)} />
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between border-b border-slate-50 pb-2 last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-ink-800 font-medium text-right">{value}</span>
    </div>
  );
}

// Deletes with a 5-second Undo window instead of firing immediately: the row
// hides right away, but the real API delete is delayed and can be cancelled.
// Also supports adding multiple attendance dates in one go ("bulk mode"),
// for jobs visited on several (possibly non-consecutive) days.
function AttendanceTab({ job, onChange }) {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [form, setForm] = useState(emptyAttendanceForm(job.rate));
  const [bulkDates, setBulkDates] = useState(['']);
  const [fareNeeded, setFareNeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingDeleteIds, setPendingDeleteIds] = useState(new Set());
  const timersRef = useRef({});

  useEffect(() => () => {
    Object.values(timersRef.current).forEach((t) => clearTimeout(t));
  }, []);

  const openAdd = () => {
    setEditingId(null);
    setBulkMode(false);
    setForm(emptyAttendanceForm(job.rate));
    setBulkDates(['']);
    setFareNeeded(false);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (a) => {
    setEditingId(a._id);
    setBulkMode(false);
    setForm({
      date: a.date ? a.date.slice(0, 10) : '',
      startTime: a.startTime || '',
      endTime: a.endTime || '',
      shift: a.shift || 'Day',
      rate: a.rate,
      fare: a.fare || 0,
      notes: a.notes || '',
    });
    setFareNeeded((a.fare || 0) > 0);
    setError('');
    setModalOpen(true);
  };

  const updateBulkDate = (index, value) => {
    setBulkDates((prev) => prev.map((d, i) => (i === index ? value : d)));
  };

  const addBulkDateField = () => setBulkDates((prev) => [...prev, '']);

  const removeBulkDateField = (index) => {
    setBulkDates((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    if (bulkMode) {
      const validDates = bulkDates.map((d) => d.trim()).filter(Boolean);
      if (validDates.length === 0) {
        setError('Add at least one date');
        setSaving(false);
        return;
      }
      try {
        for (const date of validDates) {
          await api.post('/attendance', {
            job: job._id,
            date,
            rate: form.rate,
            shift: form.shift,
            fare: fareNeeded ? form.fare : 0,
            notes: form.notes,
          });
        }
        toast.success(`${validDates.length} attendance record${validDates.length > 1 ? 's' : ''} added`);
        setModalOpen(false);
        onChange();
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to save some attendance records');
      } finally {
        setSaving(false);
      }
      return;
    }

    const payload = { ...form, fare: fareNeeded ? form.fare : 0 };
    try {
      if (editingId) {
        await api.put(`/attendance/${editingId}`, payload);
        toast.success('Attendance updated');
      } else {
        await api.post('/attendance', { ...payload, job: job._id });
        toast.success('Attendance recorded');
      }
      setModalOpen(false);
      onChange();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (attId) => {
    setPendingDeleteIds((prev) => new Set(prev).add(attId));

    const timeoutId = setTimeout(async () => {
      delete timersRef.current[attId];
      try {
        await api.delete(`/attendance/${attId}`);
        onChange();
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to delete attendance');
        setPendingDeleteIds((prev) => {
          const next = new Set(prev);
          next.delete(attId);
          return next;
        });
      }
    }, UNDO_WINDOW_MS);
    timersRef.current[attId] = timeoutId;

    toast.info('Attendance record deleted', {
      duration: UNDO_WINDOW_MS + 300,
      action: {
        label: 'Undo',
        onClick: () => {
          clearTimeout(timersRef.current[attId]);
          delete timersRef.current[attId];
          setPendingDeleteIds((prev) => {
            const next = new Set(prev);
            next.delete(attId);
            return next;
          });
        },
      },
    });
  };

  const visibleAttendance = (job.attendance || []).filter((a) => !pendingDeleteIds.has(a._id));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={openAdd} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={15} /> Record Attendance
        </button>
      </div>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
              <th className="py-2.5 px-4">Date</th>
              <th className="py-2.5 px-4">Time</th>
              <th className="py-2.5 px-4">Shift</th>
              <th className="py-2.5 px-4">Rate</th>
              <th className="py-2.5 px-4">Fare Needed?</th>
              <th className="py-2.5 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {visibleAttendance.map((a) => (
              <tr key={a._id} className="border-b border-slate-50 last:border-0">
                <td className="py-2 px-4">{formatDate(a.date)}</td>
                <td className="py-2 px-4 text-slate-500">{a.startTime || '-'}{a.endTime ? ` - ${a.endTime}` : ''}</td>
                <td className="py-2 px-4 text-slate-500">{a.shift}</td>
                <td className="py-2 px-4 text-slate-500">{formatKES(a.rate)}</td>
                <td className="py-2 px-4">
                  {a.fare > 0 ? (
                    <span className="text-ink-800">Yes - {formatKES(a.fare)}</span>
                  ) : (
                    <span className="text-slate-400">No</span>
                  )}
                </td>
                <td className="py-2 px-4 text-right whitespace-nowrap">
                  <button onClick={() => openEdit(a)} className="text-brand-600 text-xs font-medium mr-3">Edit</button>
                  <button onClick={() => handleDelete(a._id)} className="text-slate-300 hover:text-red-500 inline-block align-middle">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleAttendance.length === 0 && (
          <div className="text-center py-8 text-sm text-slate-400">
            No attendance recorded for this job yet.
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Attendance' : 'Record Attendance'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}

          {!editingId && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBulkMode(false)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                  !bulkMode ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                Single Date
              </button>
              <button
                type="button"
                onClick={() => setBulkMode(true)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                  bulkMode ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                Multiple Dates
              </button>
            </div>
          )}

          {bulkMode ? (
            <div>
              <label className="label">Dates ({bulkDates.filter((d) => d).length} added)</label>
              <div className="space-y-2">
                {bulkDates.map((d, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="date"
                      className="input"
                      value={d}
                      onChange={(e) => updateBulkDate(i, e.target.value)}
                    />
                    {bulkDates.length > 1 && (
                      <button type="button" onClick={() => removeBulkDateField(i)} className="text-slate-400 hover:text-red-500 shrink-0">
                        <X size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={addBulkDateField} className="text-brand-600 text-xs font-medium mt-2">
                + Add Another Date
              </button>
              <p className="text-xs text-slate-400 mt-2">
                All dates share the same shift, rate, fare and notes below.
              </p>
            </div>
          ) : (
            <div>
              <label className="label">Date</label>
              <input required type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          )}

          {!bulkMode && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Start Time</label>
                <input type="time" className="input" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div>
                <label className="label">End Time</label>
                <input type="time" className="input" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Day/Night</label>
              <select className="input" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}>
                <option>Day</option>
                <option>Night</option>
              </select>
            </div>
            <div>
              <label className="label">Rate (KES)</label>
              <input type="number" className="input" value={form.rate} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} />
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-ink-800">
              <input
                type="checkbox"
                checked={fareNeeded}
                onChange={(e) => {
                  setFareNeeded(e.target.checked);
                  if (!e.target.checked) setForm({ ...form, fare: 0 });
                }}
              />
              Was fare needed for {bulkMode ? 'these visits' : 'this job'}?
            </label>
            {fareNeeded && (
              <div>
                <label className="label">Fare Amount (KES{bulkMode ? ' per visit' : ''})</label>
                <input
                  type="number"
                  className="input"
                  value={form.fare}
                  onChange={(e) => setForm({ ...form, fare: Number(e.target.value) })}
                />
              </div>
            )}
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button disabled={saving} className="btn-primary w-full">
            {saving
              ? 'Saving...'
              : bulkMode
              ? `Save ${bulkDates.filter((d) => d).length} Attendance Record${bulkDates.filter((d) => d).length !== 1 ? 's' : ''}`
              : editingId
              ? 'Save Changes'
              : 'Save Attendance'}
          </button>
        </form>
      </Modal>
    </div>
  );
}

function emptyAttendanceForm(rate) {
  return { date: '', startTime: '', endTime: '', shift: 'Day', rate, fare: 0, notes: '' };
}

function PaymentsTab({ job, onChange }) {
  const toast = useToast();
  const [availablePayments, setAvailablePayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState('');
  const [allocateAmount, setAllocateAmount] = useState(0);
  const [allocateType, setAllocateType] = useState('Payment');
  const [allocating, setAllocating] = useState(false);
  const [allocateError, setAllocateError] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editAmount, setEditAmount] = useState(0);
  const [editType, setEditType] = useState('Payment');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [pendingRemoveIds, setPendingRemoveIds] = useState(new Set());
  const timersRef = useRef({});

  useEffect(() => () => {
    Object.values(timersRef.current).forEach((t) => clearTimeout(t));
  }, []);

  const loadAvailablePayments = () => {
    setLoadingPayments(true);
    api
      .get('/payments')
      .then((res) => setAvailablePayments(res.data.filter((p) => p.unallocated > 0)))
      .finally(() => setLoadingPayments(false));
  };

  useEffect(loadAvailablePayments, []);

  useEffect(() => {
    const payment = availablePayments.find((p) => p._id === selectedPayment);
    if (payment) {
      setAllocateAmount(Math.min(payment.unallocated, job.outstanding || payment.unallocated));
    }
  }, [selectedPayment]);

  const handleAllocate = async () => {
    setAllocating(true);
    setAllocateError('');
    try {
      await api.post(`/payments/${selectedPayment}/allocate`, {
        jobId: job._id,
        amount: allocateAmount,
        allocationType: allocateType,
      });
      toast.success('Payment allocated');
      setSelectedPayment('');
      setAllocateAmount(0);
      setAllocateType('Payment');
      loadAvailablePayments();
      onChange();
    } catch (err) {
      setAllocateError(err.response?.data?.message || 'Failed to allocate payment');
    } finally {
      setAllocating(false);
    }
  };

  const startEdit = (allocation) => {
    setEditingId(allocation._id);
    setEditAmount(allocation.amount);
    setEditType(allocation.allocationType || 'Payment');
    setEditError('');
  };

  const saveEdit = async (allocationId) => {
    setEditSaving(true);
    setEditError('');
    try {
      await api.put(`/payments/allocations/${allocationId}`, { amount: editAmount, allocationType: editType });
      toast.success('Allocation updated');
      setEditingId(null);
      loadAvailablePayments();
      onChange();
    } catch (err) {
      setEditError(err.response?.data?.message || 'Failed to update allocation');
    } finally {
      setEditSaving(false);
    }
  };

  const removeAllocation = (allocationId) => {
    setPendingRemoveIds((prev) => new Set(prev).add(allocationId));

    const timeoutId = setTimeout(async () => {
      delete timersRef.current[allocationId];
      try {
        await api.delete(`/payments/allocations/${allocationId}`);
        loadAvailablePayments();
        onChange();
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to remove allocation');
        setPendingRemoveIds((prev) => {
          const next = new Set(prev);
          next.delete(allocationId);
          return next;
        });
      }
    }, UNDO_WINDOW_MS);
    timersRef.current[allocationId] = timeoutId;

    toast.info('Payment allocation removed', {
      duration: UNDO_WINDOW_MS + 300,
      action: {
        label: 'Undo',
        onClick: () => {
          clearTimeout(timersRef.current[allocationId]);
          delete timersRef.current[allocationId];
          setPendingRemoveIds((prev) => {
            const next = new Set(prev);
            next.delete(allocationId);
            return next;
          });
        },
      },
    });
  };

  const visibleAllocations = (job.allocations || []).filter((a) => !pendingRemoveIds.has(a._id));

  return (
    <div className="space-y-4">
      <QuickMpesaAdd job={job} onDone={() => { loadAvailablePayments(); onChange(); }} />

      <div className="card space-y-3">
        <div className="font-semibold text-ink-900 text-sm">Allocate an M-PESA Payment to This Job</div>
        {allocateError && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{allocateError}</div>}
        {loadingPayments ? (
          <div className="text-sm text-slate-400">Loading available payments...</div>
        ) : availablePayments.length === 0 ? (
          <div className="text-sm text-slate-400">
            No unallocated M-PESA payments available. Paste a new M-PESA message in the box above.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="label">Payment</label>
                <select className="input" value={selectedPayment} onChange={(e) => setSelectedPayment(e.target.value)}>
                  <option value="">Select a payment...</option>
                  {availablePayments.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.mpesaTransaction?.transactionCode || p.method} - {formatKES(p.unallocated)} unallocated ({formatDate(p.receivedDate)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Amount to Allocate</label>
                <input
                  type="number"
                  className="input"
                  value={allocateAmount}
                  onChange={(e) => setAllocateAmount(Number(e.target.value))}
                  disabled={!selectedPayment}
                />
              </div>
            </div>
            <div>
              <label className="label">This money is for</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAllocateType('Payment')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                    allocateType === 'Payment' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  Job Payment
                </button>
                <button
                  type="button"
                  onClick={() => setAllocateType('Fare')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                    allocateType === 'Fare' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  Fare / Transport
                </button>
              </div>
            </div>
            <button
              onClick={handleAllocate}
              disabled={!selectedPayment || allocating}
              className="btn-primary w-full sm:w-auto flex items-center justify-center gap-1.5"
            >
              <Link2 size={15} /> {allocating ? 'Allocating...' : 'Allocate to This Job'}
            </button>
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <div className="font-semibold text-ink-900 text-sm">Payments Allocated to This Job</div>
        {editError && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{editError}</div>}
        <div className="divide-y divide-slate-50">
          {visibleAllocations.length === 0 && (
            <div className="text-sm text-slate-400 py-4">No payments allocated to this job yet.</div>
          )}
          {visibleAllocations.map((a) => (
            <div key={a._id} className="py-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    {editingId === a._id ? (
                      <input
                        type="number"
                        className="input w-32"
                        value={editAmount}
                        onChange={(e) => setEditAmount(Number(e.target.value))}
                      />
                    ) : (
                      <span className="font-medium text-ink-900">{formatKES(a.amount)}</span>
                    )}
                    <span
                      className={`badge ${
                        (a.allocationType || 'Payment') === 'Fare' ? 'bg-blue-50 text-blue-700' : 'bg-brand-50 text-brand-700'
                      }`}
                    >
                      {(a.allocationType || 'Payment') === 'Fare' ? 'Fare' : 'Job Payment'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {a.payment?.method} | {formatDate(a.payment?.receivedDate)}
                    {a.payment?.mpesaTransaction?.transactionCode ? ` | ${a.payment.mpesaTransaction.transactionCode}` : ''}
                  </div>
                  {editingId === a._id && (
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => setEditType('Payment')}
                        className={`px-3 py-1 rounded-lg text-xs font-medium border ${
                          editType === 'Payment' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        Job Payment
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditType('Fare')}
                        className={`px-3 py-1 rounded-lg text-xs font-medium border ${
                          editType === 'Fare' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        Fare / Transport
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm shrink-0 ml-3">
                  {editingId === a._id ? (
                    <>
                      <button onClick={() => saveEdit(a._id)} disabled={editSaving} className="text-brand-600 text-xs font-medium">
                        {editSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-slate-400 text-xs font-medium">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(a)} className="text-brand-600 text-xs font-medium">Edit</button>
                      <button onClick={() => removeAllocation(a._id)} className="text-red-500 text-xs font-medium">Remove</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DocumentsTab({ job, onChange }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState('Job Card');

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('job', job._id);
      formData.append('category', category);
      await api.post('/documents/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Document uploaded');
      onChange();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (docId) => {
    if (!confirm('Delete this document?')) return;
    try {
      await api.delete(`/documents/${docId}`);
      toast.success('Document deleted');
      onChange();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete document');
    }
  };

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-center gap-3">
        <select className="input max-w-xs" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option>Job Card</option>
          <option>Payment Statement</option>
          <option>Site Photo</option>
          <option>Other</option>
        </select>
        <label className="btn-secondary flex items-center gap-1.5 cursor-pointer">
          <Upload size={15} /> {uploading ? 'Uploading...' : 'Upload File'}
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {(job.documents || []).map((d) => (
          <JobDocumentCard key={d._id} doc={d} onDelete={handleDelete} />
        ))}
        {(!job.documents || job.documents.length === 0) && (
          <div className="text-sm text-slate-400 col-span-full py-4">No documents uploaded for this job.</div>
        )}
      </div>
    </div>
  );
}

function JobDocumentCard({ doc, onDelete }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumbUrl = getThumbnailUrl(doc.url);

  return (
    <div className="card p-0 overflow-hidden">
      <a href={doc.url} target="_blank" rel="noreferrer" className="block bg-slate-50 h-28 flex items-center justify-center overflow-hidden">
        {thumbUrl && !thumbFailed ? (
          <img
            src={thumbUrl}
            alt={doc.filename}
            className="w-full h-full object-cover"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <FileIcon size={28} className="text-slate-300" />
        )}
      </a>
      <div className="p-3">
        <a href={doc.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-ink-800 hover:text-brand-600">
          <FileText size={14} className="shrink-0" /> <span className="truncate">{doc.filename}</span>
        </a>
        <div className="text-xs text-slate-400 mt-1">{doc.category} | {formatDate(doc.createdAt)}</div>
        <button onClick={() => onDelete(doc._id)} className="text-xs text-red-500 mt-2">Delete</button>
      </div>
    </div>
  );
}

function NotesTab({ job, onChange }) {
  const toast = useToast();
  const [notes, setNotes] = useState(job.notes || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/jobs/${job._id}`, { notes });
      toast.success('Notes saved');
      onChange();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save notes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card space-y-3">
      <textarea className="input" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Notes'}</button>
    </div>
  );
}

function QuickMpesaAdd({ job, onDone }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [parsed, setParsed] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const [type, setType] = useState('Payment');
  const [allocAmount, setAllocAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setMessage('');
    setParsed(null);
    setDuplicate(null);
    setType('Payment');
    setAllocAmount(0);
    setError('');
  };

  const suggestAmount = (amount, t) => {
    const total = Number(amount) || 0;
    if (t === 'Payment' && job.outstanding > 0) return Math.min(total, job.outstanding);
    return total;
  };

  const handleParse = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/mpesa/parse', { message });
      setParsed(data.parsed);
      setDuplicate(data.duplicate);
      setAllocAmount(suggestAmount(data.parsed.amount, type));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to read message');
    } finally {
      setBusy(false);
    }
  };

  const chooseType = (t) => {
    setType(t);
    if (parsed) setAllocAmount(suggestAmount(parsed.amount, t));
  };

  const handleSave = async () => {
    setBusy(true);
    setError('');
    try {
      let paymentId;
      if (duplicate) {
        // Already saved before: reuse its payment record instead of creating a duplicate
        const { data: payments } = await api.get('/payments');
        const existing = payments.find((p) => p.mpesaTransaction && p.mpesaTransaction._id === duplicate.id);
        if (!existing) throw new Error('This code exists but has no payment record. Check the M-PESA Payments page.');
        paymentId = existing._id;
      } else {
        const { data: tx } = await api.post('/mpesa', {
          transactionCode: parsed.transactionCode,
          amount: parsed.amount,
          sender: parsed.sender,
          transactionDate: parsed.transactionDate,
          mpesaBalance: parsed.mpesaBalance,
          originalMessage: parsed.originalMessage,
          parsedSuccessfully: parsed.parsedSuccessfully,
        });
        const { data: payment } = await api.post('/payments', {
          method: 'M-PESA',
          mpesaTransaction: tx._id,
          amount: tx.amount,
          receivedDate: tx.transactionDate || new Date(),
        });
        paymentId = payment._id;
      }
      await api.post(`/payments/${paymentId}/allocate`, {
        jobId: job._id,
        amount: Number(allocAmount),
        allocationType: type,
      });
      toast.success('M-PESA payment added and allocated');
      reset();
      setOpen(false);
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary w-full flex items-center justify-center gap-1.5">
        <Plus size={16} /> Paste New M-PESA Message
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
        <div className="font-semibold text-ink-900 text-sm">Paste New M-PESA Message</div>
        <button onClick={() => { reset(); setOpen(false); }} className="text-slate-400 hover:text-slate-600">
          <X size={18} />
        </button>
      </div>
      {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}

      {!parsed && (
        <div className="space-y-3">
          <textarea
            className="input font-mono text-xs"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Paste the M-PESA confirmation message here"
          />
          <button onClick={handleParse} disabled={busy || !message.trim()} className="btn-primary w-full">
            {busy ? 'Reading...' : 'Read Message'}
          </button>
        </div>
      )}

      {parsed && (
        <div className="space-y-3">
          {duplicate && (
            <div className="text-sm bg-amber-50 text-amber-700 rounded-lg px-3 py-2">
              This code is already saved. It will not be added twice - the existing payment will be allocated to this job.
            </div>
          )}
          {!parsed.parsedSuccessfully && !duplicate && (
            <div className="text-sm bg-amber-50 text-amber-700 rounded-lg px-3 py-2">
              Some fields could not be read. Please check them below.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Code</label>
              <input className="input" disabled={!!duplicate} value={parsed.transactionCode || ''} onChange={(e) => setParsed({ ...parsed, transactionCode: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label className="label">Amount</label>
              <input
                type="number"
                className="input"
                disabled={!!duplicate}
                value={parsed.amount || ''}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setParsed({ ...parsed, amount: v });
                  setAllocAmount(suggestAmount(v, type));
                }}
              />
            </div>
            <div>
              <label className="label">Sender</label>
              <input className="input" disabled={!!duplicate} value={parsed.sender || ''} onChange={(e) => setParsed({ ...parsed, sender: e.target.value })} />
            </div>
            <div>
              <label className="label">Date / Time</label>
              <input
                type="datetime-local"
                className="input"
                disabled={!!duplicate}
                value={toNairobiInput(parsed.transactionDate)}
                onChange={(e) => setParsed({ ...parsed, transactionDate: fromNairobiInput(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <label className="label">This money is for</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => chooseType('Payment')} className={toggleClass(type === 'Payment')}>Job Payment</button>
              <button type="button" onClick={() => chooseType('Fare')} className={toggleClass(type === 'Fare')}>Fare / Transport</button>
            </div>
          </div>
          <div>
            <label className="label">Amount to Allocate to This Job</label>
            <input type="number" className="input" value={allocAmount} onChange={(e) => setAllocAmount(Number(e.target.value))} />
          </div>
          <div className="flex gap-2">
            <button onClick={reset} className="btn-secondary flex-1">Back</button>
            <button
              onClick={handleSave}
              disabled={busy || !parsed.amount || !(Number(allocAmount) > 0)}
              className="btn-primary flex-1"
            >
              {busy ? 'Saving...' : 'Save and Allocate'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
'@
Write-Host 'Wrote frontend/src/pages/JobDetail.jsx'

Write-Host 'Done. Now run: git add . ; git commit -m "M-PESA: date fix, paste on job, delete" ; git push'
