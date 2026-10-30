import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import api from '../api/axios';
import Modal from './Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatKES, formatDate } from '../utils/format.js';

const CATEGORIES = [
  'Materials', 'Transport', 'Tools & Equipment', 'Airtime & Data',
  'Meals', 'Rent & Utilities', 'Licences & Fees', 'Other',
];

// today's date in Kenya time, as YYYY-MM-DD
const today = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
const emptyForm = () => ({ date: today(), amount: '', category: 'Materials', description: '', notes: '' });

// Money you spent on this one job (for example miscellaneous materials), kept separate from your general expenses list.
export default function JobExpensesTab({ job, onChange }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api
      .get('/expenses')
      .then((res) => setItems(res.data.filter((e) => String(e.job) === String(job._id))))
      .finally(() => setLoading(false));
  };

  useEffect(load, [job._id]);

  const total = items.reduce((sum, e) => sum + e.amount, 0);
  const received = job.paid || 0;

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError('');
    setModalOpen(true);
  };

  const openEdit = (e) => {
    setEditingId(e._id);
    setForm({
      date: e.date ? e.date.slice(0, 10) : today(),
      amount: e.amount,
      category: e.category || 'Materials',
      description: e.description || '',
      notes: e.notes || '',
    });
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setSaving(true);
    setError('');
    const payload = { ...form, amount: Number(form.amount), job: job._id };
    try {
      if (editingId) {
        await api.put(`/expenses/${editingId}`, payload);
        toast.success('Job expense updated');
      } else {
        await api.post('/expenses', payload);
        toast.success('Job expense added');
      }
      setModalOpen(false);
      load();
      onChange();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this job expense?')) return;
    try {
      setItems((list) => list.filter((x) => x._id !== id)); // disappears instantly
      await api.delete(`/expenses/${id}`);
      toast.success('Job expense deleted');
      load();
      onChange();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete expense');
      load(); // put it back if the delete failed
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          Things you bought or paid for on this job, like miscellaneous materials. They also show in your main Expenses page.
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-1.5">
          <Plus size={16} /> Add Job Expense
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Spent on this job</div>
          <div className="text-2xl font-bold text-red-600">{formatKES(total)}</div>
          <div className="text-xs text-slate-400 mt-1">{items.length} record(s)</div>
        </div>
        <div className="card">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Payments received</div>
          <div className="text-2xl font-bold text-green-700">{formatKES(received)}</div>
        </div>
        <div className="card">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Received less expenses</div>
          <div className={`text-2xl font-bold ${received - total < 0 ? 'text-red-600' : 'text-ink-900'}`}>{formatKES(received - total)}</div>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="card text-center py-8 text-slate-400">No expenses recorded for this job yet.</div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">What it was</th>
                <th className="py-2.5 px-4">Amount</th>
                <th className="py-2.5 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e._id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 px-4 text-slate-600">{formatDate(e.date)}</td>
                  <td className="py-2.5 px-4 text-ink-800">{e.category}</td>
                  <td className="py-2.5 px-4 text-slate-600">{e.description || '-'}</td>
                  <td className="py-2.5 px-4 font-medium text-red-600">{formatKES(e.amount)}</td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(e)} className="text-slate-400 hover:text-brand-600 mr-3">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => handleDelete(e._id)} className="text-slate-300 hover:text-red-500">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Job Expense' : 'Add Job Expense'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input required type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="label">Amount (KES)</label>
              <input required type="number" min="0" step="any" className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">What did you buy or pay for?</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Cable ties, tape and connectors" />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Save Expense'}
          </button>
        </form>
      </Modal>
    </div>
  );
}