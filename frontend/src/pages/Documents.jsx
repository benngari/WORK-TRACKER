import { useEffect, useState } from 'react';
import { Upload, FileText, Trash2, File as FileIcon } from 'lucide-react';
import api from '../api/axios';
import { formatDate, getThumbnailUrl } from '../utils/format.js';

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
            <DocumentCard key={d._id} doc={d} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentCard({ doc, onDelete }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumbUrl = getThumbnailUrl(doc.url);

  return (
    <div className="card p-0 overflow-hidden">
      <a href={doc.url} target="_blank" rel="noreferrer" className="block bg-slate-50 h-32 flex items-center justify-center overflow-hidden">
        {thumbUrl && !thumbFailed ? (
          <img
            src={thumbUrl}
            alt={doc.filename}
            className="w-full h-full object-cover"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <FileIcon size={32} className="text-slate-300" />
        )}
      </a>
      <div className="p-3">
        <a href={doc.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-ink-800 hover:text-brand-600">
          <FileText size={14} className="shrink-0" /> <span className="truncate">{doc.filename}</span>
        </a>
        <div className="text-xs text-slate-400 mt-1">{doc.category} · {formatDate(doc.createdAt)}</div>
        {doc.job && <div className="text-xs text-slate-400">Linked job: {doc.job.jobCardRef || doc.job._id}</div>}
        <button onClick={() => onDelete(doc._id)} className="text-xs text-red-500 mt-2 flex items-center gap-1">
          <Trash2 size={12} /> Delete
        </button>
      </div>
    </div>
  );
}