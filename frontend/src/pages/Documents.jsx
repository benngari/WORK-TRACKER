import { useEffect, useState } from 'react';
import { Upload, FileText, Trash2 } from 'lucide-react';
import api from '../api/axios';
import { formatDate } from '../utils/format.js';

export default function Documents() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('Payment Statement');
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/documents').then((res) => setDocs(res.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);
      // No 'job' field -> stored as a standalone historical document
      await api.post('/documents/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this document?')) return;
    await api.delete(`/documents/${id}`);
    load();
  };

  const filtered = filter ? docs.filter((d) => d.category === filter) : docs;

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3">
        <select className="input max-w-xs" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option>Payment Statement</option>
          <option>Job Card</option>
          <option>M-PESA Proof</option>
          <option>Site Photo</option>
          <option>Other</option>
        </select>
        <label className="btn-primary flex items-center gap-1.5 cursor-pointer">
          <Upload size={16} /> {uploading ? 'Uploading...' : 'Upload Document'}
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
        <select className="input max-w-xs ml-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All Categories</option>
          <option>Job Card</option>
          <option>Payment Statement</option>
          <option>M-PESA Proof</option>
          <option>Site Photo</option>
          <option>Other</option>
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">No documents uploaded yet.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((d) => (
            <div key={d._id} className="card">
              <a href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-ink-800 hover:text-brand-600">
                <FileText size={16} /> <span className="truncate">{d.filename}</span>
              </a>
              <div className="text-xs text-slate-400 mt-1">{d.category} · {formatDate(d.createdAt)}</div>
              {d.job && <div className="text-xs text-slate-400">Linked job: {d.job.jobCardRef || d.job._id}</div>}
              <button onClick={() => handleDelete(d._id)} className="text-xs text-red-500 mt-2 flex items-center gap-1">
                <Trash2 size={12} /> Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
