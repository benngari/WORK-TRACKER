import { useEffect, useState } from 'react';
import { Plus, Archive, Trash2, Upload } from 'lucide-react';
import api from '../api/axios';
import Modal from '../components/Modal.jsx';
import { formatKES, formatDate } from '../utils/format.js';

const emptyForm = { title: '', clientName: '', siteName: '', date: '', amount: '', notes: '' };

export default function HistoricalRecords() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/historical').then((res) => setRecords(res.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/historical', { ...form, amount: form.amount ? Number(form.amount) : null });
      setModalOpen(false);
      setForm(emptyForm);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this historical record?')) return;
    await api.delete(`/historical/${id}`);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          For legacy job cards, old attendance, and past statements that predate this system.
          Upload supporting files from the Documents page.
        </p>
        <button onClick={() => setModalOpen(true)} className="btn-primary flex items-center gap-1.5 whitespace-nowrap">
          <Plus size={16} /> Add Record
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : records.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">
          <Archive className="mx-auto mb-2" />
          No historical records yet.
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <th className="py-2.5 px-4">Title</th>
                <th className="py-2.5 px-4">Client</th>
                <th className="py-2.5 px-4">Site</th>
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Amount</th>
                <th className="py-2.5 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r._id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 px-4 font-medium text-ink-900">{r.title}</td>
                  <td className="py-2.5 px-4 text-slate-600">{r.clientName || '-'}</td>
                  <td className="py-2.5 px-4 text-slate-600">{r.siteName || '-'}</td>
                  <td className="py-2.5 px-4 text-slate-600">{formatDate(r.date)}</td>
                  <td className="py-2.5 px-4 text-slate-600">{r.amount != null ? formatKES(r.amount) : '-'}</td>
                  <td className="py-2.5 px-4 text-right">
                    <button onClick={() => handleDelete(r._id)} className="text-slate-300 hover:text-red-500">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Historical Record">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Title</label>
            <input required className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Equity Kasarani - Jan 2024 job card" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Client Name</label>
              <input className="input" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
            </div>
            <div>
              <label className="label">Site Name</label>
              <input className="input" value={form.siteName} onChange={(e) => setForm({ ...form, siteName: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="label">Amount (KES)</label>
              <input type="number" className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button disabled={saving} className="btn-primary w-full">{saving ? 'Saving...' : 'Save Record'}</button>
        </form>
      </Modal>
    </div>
  );
}
