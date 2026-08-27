import { useEffect, useState } from 'react';
import { Plus, Trash2, MapPin, Pencil } from 'lucide-react';
import api from '../api/axios';
import Modal from '../components/Modal.jsx';
import { siteLabel } from '../utils/format.js';

const siteTypes = ['Bank', 'Office', 'Shop', 'Warehouse', 'Institution', 'Customer Premises', 'Other'];

const emptyForm = {
  client: '', siteType: 'Bank', bankName: '', branch: '', branchCode: '',
  siteName: '', location: '', town: '', county: '', isNairobi: false, notes: '',
};

export default function Sites() {
  const [sites, setSites] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filterClient, setFilterClient] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/sites'), api.get('/clients')])
      .then(([s, c]) => {
        setSites(s.data);
        setClients(c.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (site) => {
    setEditingId(site._id);
    setForm({
      client: site.client?._id || '',
      siteType: site.siteType,
      bankName: site.bankName || '',
      branch: site.branch || '',
      branchCode: site.branchCode || '',
      siteName: site.siteName || '',
      location: site.location || '',
      town: site.town || '',
      county: site.county || '',
      isNairobi: site.isNairobi || false,
      notes: site.notes || '',
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
        await api.put(`/sites/${editingId}`, form);
      } else {
        await api.post('/sites', form);
      }
      setModalOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save site');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this site?')) return;
    try {
      await api.delete(`/sites/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  const filtered = filterClient ? sites.filter((s) => s.client?._id === filterClient) : sites;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select className="input max-w-xs" value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
          <option value="">All Clients</option>
          {clients.map((c) => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </select>
        <button className="btn-primary flex items-center gap-1.5" onClick={openAdd}>
          <Plus size={16} /> New Site
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">
          <MapPin className="mx-auto mb-2" />
          No sites yet.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <th className="py-2 pr-4">Site</th>
                <th className="py-2 pr-4">Client</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Town</th>
                <th className="py-2 pr-4">County</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s._id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-ink-900">{siteLabel(s)}</td>
                  <td className="py-2.5 pr-4 text-slate-600">{s.client?.name}</td>
                  <td className="py-2.5 pr-4 text-slate-600">{s.siteType}</td>
                  <td className="py-2.5 pr-4 text-slate-600">{s.town || '-'}</td>
                  <td className="py-2.5 pr-4 text-slate-600">{s.county || '-'}</td>
                  <td className="py-2.5 pr-4 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(s)} className="text-slate-400 hover:text-brand-600 mr-3">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => handleDelete(s._id)} className="text-slate-300 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Site / Location' : 'New Site / Location'} wide>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Client</label>
              <select required className="input" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })}>
                <option value="">Select client...</option>
                {clients.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Site Type</label>
              <select className="input" value={form.siteType} onChange={(e) => setForm({ ...form, siteType: e.target.value })}>
                {siteTypes.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {form.siteType === 'Bank' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Bank Name</label>
                <input required className="input" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="e.g. Equity Bank" />
              </div>
              <div>
                <label className="label">Branch</label>
                <input required className="input" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} placeholder="e.g. Kikuyu" />
              </div>
              <div>
                <label className="label">Branch Code</label>
                <input className="input" value={form.branchCode} onChange={(e) => setForm({ ...form, branchCode: e.target.value })} />
              </div>
            </div>
          ) : (
            <div>
              <label className="label">Site Name</label>
              <input required className="input" value={form.siteName} onChange={(e) => setForm({ ...form, siteName: e.target.value })} placeholder="e.g. Acme Warehouse" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Town</label>
              <input className="input" value={form.town} onChange={(e) => setForm({ ...form, town: e.target.value })} />
            </div>
            <div>
              <label className="label">County</label>
              <input className="input" value={form.county} onChange={(e) => setForm({ ...form, county: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Location / Directions</label>
            <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.isNairobi} onChange={(e) => setForm({ ...form, isNairobi: e.target.checked })} />
            Within Nairobi
          </label>

          <button disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Save Site'}
          </button>
        </form>
      </Modal>
    </div>
  );
}