import { useEffect, useState } from 'react';
import { Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import api from '../api/axios';
import { formatDate, siteLabel } from '../utils/format.js';

export default function Trash() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/jobs/trash').then((res) => setJobs(res.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleRestore = async (id) => {
    await api.post(`/jobs/${id}/restore`);
    load();
  };

  const handlePermanentDelete = async (id) => {
    if (!confirm('Permanently delete this job? This cannot be undone — attendance, payment allocations, and documents will all be removed.')) return;
    try {
      await api.delete(`/jobs/${id}/permanent`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to permanently delete');
    }
  };

  return (
    <div className="space-y-4">
      <div className="card bg-amber-50 border-amber-100 flex items-center gap-3">
        <AlertTriangle className="text-amber-500" size={18} />
        <div className="text-sm text-amber-700">
          Deleted jobs stay here until you permanently delete them. Restoring a job also restores its documents.
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : jobs.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">
          <Trash2 className="mx-auto mb-2" />
          Trash is empty.
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <th className="py-2.5 px-4">Client</th>
                <th className="py-2.5 px-4">Site</th>
                <th className="py-2.5 px-4">Job Card</th>
                <th className="py-2.5 px-4">Deleted On</th>
                <th className="py-2.5 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j._id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 px-4 font-medium text-ink-900">{j.client?.name}</td>
                  <td className="py-2.5 px-4 text-slate-600">{siteLabel(j.site)}</td>
                  <td className="py-2.5 px-4 text-slate-600">{j.jobCardRef || '-'}</td>
                  <td className="py-2.5 px-4 text-slate-600">{formatDate(j.deletedAt)}</td>
                  <td className="py-2.5 px-4 text-right space-x-3 whitespace-nowrap">
                    <button onClick={() => handleRestore(j._id)} className="text-brand-600 text-xs font-medium inline-flex items-center gap-1">
                      <RotateCcw size={13} /> Restore
                    </button>
                    <button onClick={() => handlePermanentDelete(j._id)} className="text-red-500 text-xs font-medium inline-flex items-center gap-1">
                      <Trash2 size={13} /> Delete Forever
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}