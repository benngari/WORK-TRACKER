import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Upload, FileText, Link2 } from 'lucide-react';
import api from '../api/axios';
import Modal from '../components/Modal.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatKES, formatDate, siteLabel } from '../utils/format.js';

const tabs = ['Overview', 'Attendance', 'Payments', 'Documents', 'Notes'];

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get(`/jobs/${id}`).then((res) => setJob(res.data)).finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  if (loading) return <div className="text-sm text-slate-400">Loading...</div>;
  if (!job) return <div className="text-sm text-red-500">Job not found.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/jobs')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-ink-900">
          <ArrowLeft size={16} /> Back to Jobs
        </button>
        <button
          onClick={async () => {
            if (!confirm('Move this job to Trash? Its documents will move with it. You can restore both later from the Trash page.')) return;
            try {
              await api.delete(`/jobs/${job._id}`);
              navigate('/jobs');
            } catch (err) {
              alert(err.response?.data?.message || 'Failed to delete job');
            }
          }}
          className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700"
        >
          <Trash2 size={15} /> Move to Trash
        </button>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-ink-900">{job.client?.name} — {siteLabel(job.site)}</div>
            <div className="text-sm text-slate-500">{job.jobCardRef || 'No job card ref'} · {job.jobType || 'Job'}</div>
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
              {i < 4 && <span className="text-slate-300">→</span>}
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
    </div>
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

function AttendanceTab({ job, onChange }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyAttendanceForm(job.rate));
  const [fareNeeded, setFareNeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyAttendanceForm(job.rate));
    setFareNeeded(false);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (a) => {
    setEditingId(a._id);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const payload = { ...form, fare: fareNeeded ? form.fare : 0 };
    try {
      if (editingId) {
        await api.put(`/attendance/${editingId}`, payload);
      } else {
        await api.post('/attendance', { ...payload, job: job._id });
      }
      setModalOpen(false);
      onChange();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (attId) => {
    if (!confirm('Delete this attendance record?')) return;
    await api.delete(`/attendance/${attId}`);
    onChange();
  };

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
            {(job.attendance || []).map((a) => (
              <tr key={a._id} className="border-b border-slate-50 last:border-0">
                <td className="py-2 px-4">{formatDate(a.date)}</td>
                <td className="py-2 px-4 text-slate-500">{a.startTime || '-'}{a.endTime ? ` - ${a.endTime}` : ''}</td>
                <td className="py-2 px-4 text-slate-500">{a.shift}</td>
                <td className="py-2 px-4 text-slate-500">{formatKES(a.rate)}</td>
                <td className="py-2 px-4">
                  {a.fare > 0 ? (
                    <span className="text-ink-800">Yes — {formatKES(a.fare)}</span>
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
        {(!job.attendance || job.attendance.length === 0) && (
          <div className="text-center py-8 text-sm text-slate-400">
            No attendance recorded for this job yet.
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Attendance' : 'Record Attendance'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="label">Date</label>
            <input required type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
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
              Was fare needed for this job?
            </label>
            {fareNeeded && (
              <div>
                <label className="label">Fare Amount (KES)</label>
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
            {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Save Attendance'}
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
      setEditingId(null);
      loadAvailablePayments();
      onChange();
    } catch (err) {
      setEditError(err.response?.data?.message || 'Failed to update allocation');
    } finally {
      setEditSaving(false);
    }
  };

  const removeAllocation = async (allocationId) => {
    if (!confirm('Remove this payment allocation from the job? The amount becomes unallocated again.')) return;
    try {
      await api.delete(`/payments/allocations/${allocationId}`);
      loadAvailablePayments();
      onChange();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to remove allocation');
    }
  };

  return (
    <div className="space-y-4">
      {/* Allocate a payment to this job */}
      <div className="card space-y-3">
        <div className="font-semibold text-ink-900 text-sm">Allocate an M-PESA Payment to This Job</div>
        {allocateError && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{allocateError}</div>}
        {loadingPayments ? (
          <div className="text-sm text-slate-400">Loading available payments...</div>
        ) : availablePayments.length === 0 ? (
          <div className="text-sm text-slate-400">
            No unallocated M-PESA payments available. Add one from the M-PESA Payments page first.
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
                      {p.mpesaTransaction?.transactionCode || p.method} — {formatKES(p.unallocated)} unallocated ({formatDate(p.receivedDate)})
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

      {/* Existing allocations */}
      <div className="card space-y-3">
        <div className="font-semibold text-ink-900 text-sm">Payments Allocated to This Job</div>
        {editError && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{editError}</div>}
        <div className="divide-y divide-slate-50">
          {(job.allocations || []).length === 0 && (
            <div className="text-sm text-slate-400 py-4">No payments allocated to this job yet.</div>
          )}
          {(job.allocations || []).map((a) => (
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
                    {a.payment?.method} · {formatDate(a.payment?.receivedDate)}
                    {a.payment?.mpesaTransaction?.transactionCode ? ` · ${a.payment.mpesaTransaction.transactionCode}` : ''}
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
      onChange();
    } catch (err) {
      alert(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (docId) => {
    if (!confirm('Delete this document?')) return;
    await api.delete(`/documents/${docId}`);
    onChange();
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
          <div key={d._id} className="card">
            <a href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-ink-800 hover:text-brand-600">
              <FileText size={16} /> <span className="truncate">{d.filename}</span>
            </a>
            <div className="text-xs text-slate-400 mt-1">{d.category} · {formatDate(d.createdAt)}</div>
            <button onClick={() => handleDelete(d._id)} className="text-xs text-red-500 mt-2">Delete</button>
          </div>
        ))}
        {(!job.documents || job.documents.length === 0) && (
          <div className="text-sm text-slate-400 col-span-full py-4">No documents uploaded for this job.</div>
        )}
      </div>
    </div>
  );
}

function NotesTab({ job, onChange }) {
  const [notes, setNotes] = useState(job.notes || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/jobs/${job._id}`, { notes });
      onChange();
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