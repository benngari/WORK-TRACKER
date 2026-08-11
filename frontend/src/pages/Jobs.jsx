import { useEffect, useState } from 'react';
import { Plus, Briefcase } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Modal from '../components/Modal.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatKES, siteLabel } from '../utils/format.js';

const emptyForm = {
  client: '', site: '', jobCardRef: '', jobType: '', description: '',
  status: 'Open', rate: 1500, paymentDueDate: '', notes: '',
  date: new Date().toISOString().slice(0, 10), fare: 0,
};

export default function Jobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ client: '', status: '' });

  const load = () => {
    setLoading(true);
    const params = {};
    if (filters.client) params.client = filters.client;
    if (filters.status) params.status = filters.status;
    Promise.all([api.get('/jobs', { params }), api.get('/clients'), api.get('/sites')])
      .then(([j, c, s]) => {
        setJobs(j.data);
        setClients(c.data);
        setSites(s.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [filters]);

  const clientSites = sites.filter((s) => s.client?._id === form.client);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { client, site, jobCardRef, jobType, description, status, rate, paymentDueDate, notes } = form;
      const { data: job } = await api.post('/jobs', {
        client, site, jobCardRef, jobType, description, status, rate, paymentDueDate, notes,
      });

      await api.post('/attendance', {
        job: job._id,
        date: form.date,
        rate: form.rate,
        fare: form.fare,
      });

      setModalOpen(false);
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create job');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <select className="input max-w-xs" value={filters.client} onChange={(e) => setFilters({ ...filters, client: e.target.value })}>
            <option value="">All Clients</option>
            {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <select className="input max-w-xs" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All Statuses</option>
            <option>Open</option>
            <option>In Progress</option>
            <option>Completed</option>
            <option>Cancelled</option>
          </select>
        </div>
        <button className="btn-primary flex items-center gap-1.5" onClick={() => setModalOpen(true)}>
          <Plus size={16} /> New Job
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : jobs.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">
          <Briefcase className="mx-auto mb-2" />
          No jobs yet.
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Site</th>
                <th className="py-3 px-4">Job Card</th>
                <th className="py-3 px-4">Callouts</th>
                <th className="py-3 px-4">Expected</th>
                <th className="py-3 px-4">Paid</th>
                <th className="py-3 px-4">Balance</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr
                  key={j._id}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer"
                  onClick={() => navigate(`/jobs/${j._id}`)}
                >
                  <td className="py-2.5 px-4 font-medium text-ink-900">{j.client?.name}</td>
                  <td className="py-2.5 px-4 text-slate-600">{siteLabel(j.site)}</td>
                  <td className="py-2.5 px-4 text-slate-600">{j.jobCardRef || '-'}</td>
                  <td className="py-2.5 px-4 text-slate-600">{j.attendanceCount}</td>
                  <td className="py-2.5 px-4 text-slate-600">{formatKES(j.expected)}</td>
                  <td className="py-2.5 px-4 text-slate-600">{formatKES(j.paid)}</td>
                  <td className="py-2.5 px-4 font-medium text-amber-600">{formatKES(j.outstanding)}</td>
                  <td className="py-2.5 px-4"><StatusBadge status={j.paymentStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Job" wide>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Client</label>
              <select required className="input" value={form.client} onChange={(e) => {
                const client = clients.find((c) => c._id === e.target.value);
                setForm({ ...form, client: e.target.value, site: '', rate: client?.defaultRate || 1500 });
              }}>
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

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Date of Visit</label>
              <input required type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="label">Rate (KES)</label>
              <input type="number" className="input" value={form.rate} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Fare (KES)</label>
              <input type="number" className="input" value={form.fare} onChange={(e) => setForm({ ...form, fare: Number(e.target.value) })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Job Card / Reference</label>
              <input className="input" value={form.jobCardRef} onChange={(e) => setForm({ ...form, jobCardRef: e.target.value })} />
            </div>
            <div>
              <label className="label">Job Type</label>
              <input className="input" value={form.jobType} onChange={(e) => setForm({ ...form, jobType: e.target.value })} placeholder="e.g. Repair, Installation" />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
              <label className="label">Payment Due Date</label>
              <input type="date" className="input" value={form.paymentDueDate} onChange={(e) => setForm({ ...form, paymentDueDate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button disabled={saving} className="btn-primary w-full">{saving ? 'Saving...' : 'Create Job'}</button>
        </form>
      </Modal>
    </div>
  );
}