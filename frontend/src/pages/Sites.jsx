import { useEffect, useState } from 'react';
import { Plus, Trash2, MapPin, Pencil } from 'lucide-react';
import api from '../api/axios';
import Modal from '../components/Modal.jsx';
import { siteLabel } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

const siteTypes = ['Bank', 'Office', 'Shop', 'Warehouse', 'Institution', 'Customer Premises', 'Other'];

const emptyForm = {
  client: '', siteType: 'Bank', bankName: '', branch: '', branchCode: '',
  siteName: '', location: '', town: '', county: '', isNairobi: false, notes: '',
};

function normalize(str) {
  return (str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export default function Sites() {
  const toast = useToast();
  const [sites, setSites] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState(null);
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
    setDuplicateWarning(null);
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
    setDuplicateWarning(null);
    setModalOpen(true);
  };

  const findDuplicate = () => {
    const key = form.siteType === 'Bank'
      ? `${normalize(form.bankName)}|${normalize(form.branch)}`
      : normalize(form.siteName);

    return sites.find((s) => {
      if (s._id === editingId) return false;
      if (s.client?._id !== form.client) return false;
      if (s.siteType !== form.siteType) return false;
      const sKey = s.siteType === 'Bank'
        ? `${normalize(s.bankName)}|${normalize(s.branch)}`
        : normalize(s.siteName);
      return sKey === key && key.length > 0;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!duplicateWarning) {
      const dup = findDuplicate();
      if (dup) {
        setDuplicateWarning(dup);
        return;
      }
    }

    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.put(`/sites/${editingId}`, form);
        toast.success('Site updated');
      } else {
        await api.post('/sites', form);
        toast.success('Site added');
      }
      setModalOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      setDuplicateWarning(null);
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
      toast.success('Site deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
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

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setDuplicateWarning(null); }}
        title={editingId ? 'Edit Site / Location' : 'New Site / Location'}
        wide
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
          {duplicateWarning && (
            <div className="text-sm bg-amber-50 text-amber-700 rounded-lg px-3 py-2">
              A very similar site already exists: <span className="font-medium">{siteLabel(duplicateWarning)}</span>.
              Click "Save Anyway" below if this is genuinely a different site, or close this and check your Sites list.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Client</label>
              <select
                required
                className="input"
                value={form.client}
                onChange={(e) => { setForm({ ...form, client: e.target.value }); setDuplicateWarning(null); }}
              >
                <option value="">Select client...</option>
                {clients.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Site Type</label>
              <select
                className="input"
                value={form.siteType}
                onChange={(e) => { setForm({ ...form, siteType: e.target.value }); setDuplicateWarning(null); }}
              >
                {siteTypes.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {form.siteType === 'Bank' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Bank Name</label>
                <input
                  required
                  className="input"
                  value={form.bankName}
                  onChange={(e) => { setForm({ ...form, bankName: e.target.value }); setDuplicateWarning(null); }}
                  placeholder="e.g. Equity Bank"
                />
              </div>
              <div>
                <label className="label">Branch</label>
                <input
                  required
                  className="input"
                  value={form.branch}
                  onChange={(e) => { setForm({ ...form, branch: e.target.value }); setDuplicateWarning(null); }}
                  placeholder="e.g. Kikuyu"
                />
              </div>
              <div>
                <label className="label">Branch Code</label>
                <input className="input" value={form.branchCode} onChange={(e) => setForm({ ...form, branchCode: e.target.value })} />
              </div>
            </div>
          ) : (
            <div>
              <label className="label">Site Name</label>
              <input
                required
                className="input"
                value={form.siteName}
                onChange={(e) => { setForm({ ...form, siteName: e.target.value }); setDuplicateWarning(null); }}
                placeholder="e.g. Acme Warehouse"
              />
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
            {saving ? 'Saving...' : duplicateWarning ? 'Save Anyway' : editingId ? 'Save Changes' : 'Save Site'}
          </button>
        </form>
      </Modal>
    </div>
  );
}