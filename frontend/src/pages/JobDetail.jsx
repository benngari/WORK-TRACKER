import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Upload, FileText } from 'lucide-react';
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <Metric label="Callouts" value={job.attendanceCount} />
          <Metric label="Expected" value={formatKES(job.expected)} />
          <Metric label="Paid" value={formatKES(job.paid)} accent="text-brand-600" />
          <Metric label="Outstanding" value={formatKES(job.outstanding)} accent="text-amber-600" />
        </div>
        {/* Timeline */}
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
  const [form, setForm] = useState({ date: '', startTime: '', endTime: '', shift: 'Day', rate: job.rate, fare: 0, notes: '' });
  const [saving, setSaving] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/attendance', { ...form, job: job._id });
      setModalOpen(false);
      setForm({ date: '', startTime: '', endTime: '', shift: 'Day', rate: job.rate, fare: 0, notes: '' });
      onChange();
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
        <button onClick={() => setModalOpen(true)} className="btn-primary flex items-center gap-1.5 text-sm">
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
              <th className="py-2.5 px-4">Fare</th>
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
                <td className="py-2 px-4 text-slate-500">{formatKES(a.fare)}</td>
                <td className="py-2 px-4 text-right">
                  <button onClick={() => handleDelete(a._id)} className="text-slate-300 hover:text-red-500">
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record Attendance">
        <form onSubmit={handleAdd} className="space-y-3">
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
          <div>
            <label className="label">Fare (KES)</label>
            <input type="number" className="input" value={form.fare} onChange={(e) => setForm({ ...form, fare: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button disabled={saving} className="btn-primary w-full">{saving ? 'Saving...' : 'Save Attendance'}</button>
        </form>
      </Modal>
    </div>
  );
}

function PaymentsTab({ job, onChange }) {
  return (
    <div className="card space-y-3">
      <div className="text-sm text-slate-500">
        Payments are recorded from M-PESA messages or manually, then allocated to jobs. Go to
        <span className="font-medium text-ink-800"> M-PESA Payments </span> or
        <span className="font-medium text-ink-800"> Payment Ledger </span>
        to allocate a payment to this job.
      </div>
      <div className="divide-y divide-slate-50">
        {(job.allocations || []).length === 0 && (
          <div className="text-sm text-slate-400 py-4">No payments allocated to this job yet.</div>
        )}
        {(job.allocations || []).map((a) => (
          <div key={a._id} className="flex justify-between items-center py-2.5 text-sm">
            <div>
              <div className="font-medium text-ink-900">{formatKES(a.amount)}</div>
              <div className="text-xs text-slate-400">
                {a.payment?.method} · {formatDate(a.payment?.receivedDate)}
                {a.payment?.mpesaTransaction?.transactionCode ? ` · ${a.payment.mpesaTransaction.transactionCode}` : ''}
              </div>
            </div>
          </div>
        ))}
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
