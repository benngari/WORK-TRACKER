import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Download, Receipt } from 'lucide-react';
import api from '../api/axios';
import Modal from '../components/Modal.jsx';
import { formatKES, formatDate } from '../utils/format.js';
import { downloadCSV } from '../utils/exportCsv.js';
import { useToast } from '../context/ToastContext.jsx';

const CATEGORIES = [
  'Transport', 'Tools & Equipment', 'Materials', 'Airtime & Data',
  'Meals', 'Rent & Utilities', 'Licences & Fees', 'Other',
];

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = () => ({ date: today(), amount: '', category: 'Transport', description: '', notes: '' });

function inPeriod(dateStr, period) {
  if (period === 'all') return true;
  const d = new Date(dateStr);
  const now = new Date();
  if (period === 'year') return d.getFullYear() === now.getFullYear();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export default function Expenses() {
  const toast = useToast();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [category, setCategory] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/expenses').then((res) => setExpenses(res.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = expenses.filter(
    (e) => inPeriod(e.date, period) && (!category || e.category === category)
  );
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const byCategory = {};
  filtered.forEach((e) => {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  });
  const categoryRows = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

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
      category: e.category || 'Other',
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
    const payload = { ...form, amount: Number(form.amount) };
    try {
      if (editingId) {
        await api.put(`/expenses/${editingId}`, payload);
        toast.success('Expense updated');
      } else {
        await api.post('/expenses', payload);
        toast.success('Expense added');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      toast.success('Expense deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete expense');
    }
  };

  const handleExport = () => {
    const headers = ['Date', 'Category', 'Description', 'Amount', 'Notes'];
    const rows = filtered.map((e) => [formatDate(e.date), e.category, e.description || '', e.amount, e.notes || '']);
    downloadCSV(`expenses-${today()}.csv`, headers, rows);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          <select className="input max-w-[160px]" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
            <option value="all">All Time</option>
          </select>
          <select className="input max-w-[200px]" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5">
            <Download size={15} /> Export CSV
          </button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-1.5">
            <Plus size={16} /> Add Expense
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Total Expenses</div>
          <div className="text-2xl font-bold text-red-600">{formatKES(total)}</div>
          <div className="text-xs text-slate-400 mt-1">{filtered.length} record(s)</div>
        </div>
        <div className="card md:col-span-2">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">By Category</div>
          {categoryRows.length === 0 ? (
            <div className="text-sm text-slate-400">No expenses in this view.</div>
          ) : (
            <div className="space-y-1.5">
              {categoryRows.map(([name, amt]) => (
                <div key={name} className="flex items-center gap-3 text-sm">
                  <div className="w-36 text-slate-600 truncate">{name}</div>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500" style={{ width: `${total ? (amt / total) * 100 : 0}%` }} />
                  </div>
                  <div className="w-28 text-right font-medium text-ink-800">{formatKES(amt)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Fares you pay on visits are already counted on the Dashboard (net of reimbursements), so there is no need to enter them here.
      </p>

      {loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">
          <Receipt className="mx-auto mb-2" />
          No expenses recorded for this view.
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">Description</th>
                <th className="py-2.5 px-4">Amount</th>
                <th className="py-2.5 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Expense' : 'Add Expense'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input required type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="label">Amount</label>
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
            <label className="label">Description</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Drill bits, airtime bundle" />
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