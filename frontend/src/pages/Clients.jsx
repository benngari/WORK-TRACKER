import { useEffect, useState } from 'react';
import { Plus, Trash2, Building2, Pencil } from 'lucide-react';
import api from '../api/axios';
import Modal from '../components/Modal.jsx';
import { formatKES } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

const emptyForm = { name: '', type: 'Direct Client', contactPerson: '', phone: '', email: '', defaultRate: 1500, notes: '' };

export default function Clients() {
  const toast = useToast();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/clients').then((res) => setClients(res.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (client) => {
    setEditingId(client._id);
    setForm({
      name: client.name || '',
      type: client.type || 'Direct Client',
      contactPerson: client.contactPerson || '',
      phone: client.phone || '',
      email: client.email || '',
      defaultRate: client.defaultRate ?? 1500,
      notes: client.notes || '',
    });
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.put(`/clients/${editingId}`, form);
        toast.success('Client updated');
      } else {
        await api.post('/clients', form);
        toast.success('Client added');
      }
      setModalOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save client');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this client? This only works if it has no sites or jobs.')) return;
    try {
      await api.delete(`/clients/${id}`);
      toast.success('Client deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete client');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{clients.length} client(s)</p>
        <button className="btn-primary flex items-center gap-1.5" onClick={openAdd}>
          <Plus size={16} /> New Client
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : clients.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">
          <Building2 className="mx-auto mb-2" />
          No clients yet. Add your first one.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((c) => (
            <div key={c._id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-ink-900">{c.name}</div>
                  <div className="text-xs text-slate-400">{c.type}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(c)} className="text-slate-400 hover:text-brand-600">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => handleDelete(c._id)} className="text-slate-300 hover:text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="mt-3 text-sm text-slate-600 space-y-0.5">
                {c.contactPerson && <div>{c.contactPerson}</div>}
                {c.phone && <div>{c.phone}</div>}
                <div className="text-xs text-slate-400 mt-2">Default rate: {formatKES(c.defaultRate)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Client / Company' : 'New Client / Company'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="label">Name</label>
            <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. DTE, Direct Customer" />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>Contractor</option>
              <option>Direct Client</option>
              <option>Agency</option>
              <option>Other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Contact Person</label>
              <input className="input" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Default Rate (KES per callout/day)</label>
            <input type="number" className="input" value={form.defaultRate} onChange={(e) => setForm({ ...form, defaultRate: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Save Client'}
          </button>
        </form>
      </Modal>
    </div>
  );
}