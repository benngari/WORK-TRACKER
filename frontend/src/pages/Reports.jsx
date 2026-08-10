import { useEffect, useState } from 'react';
import api from '../api/axios';
import { formatKES, siteLabel } from '../utils/format.js';

export default function Reports() {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/clients').then((res) => setClients(res.data));
  }, []);

  const loadSummary = (clientId) => {
    setSelectedClient(clientId);
    if (!clientId) return setSummary(null);
    setLoading(true);
    api.get(`/clients/${clientId}/summary`).then((res) => setSummary(res.data)).finally(() => setLoading(false));
  };

  // Group sites by bank/site name for the "every branch I've attended" view
  const grouped = {};
  if (summary) {
    summary.sites.forEach((s) => {
      const key = s.siteType === 'Bank' ? s.bankName : s.siteType;
      grouped[key] = grouped[key] || [];
      grouped[key].push(s);
    });
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <label className="label">Select a client to see every site/branch you've attended</label>
        <select className="input max-w-sm" value={selectedClient} onChange={(e) => loadSummary(e.target.value)}>
          <option value="">Choose client...</option>
          {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
      </div>

      {loading && <div className="text-sm text-slate-400">Loading...</div>}

      {summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="card">
              <div className="text-xs text-slate-400 uppercase">Total Sites</div>
              <div className="text-xl font-bold">{summary.sites.length}</div>
            </div>
            <div className="card">
              <div className="text-xs text-slate-400 uppercase">Total Jobs</div>
              <div className="text-xl font-bold">{summary.jobs.length}</div>
            </div>
            <div className="card">
              <div className="text-xs text-slate-400 uppercase">Client</div>
              <div className="text-xl font-bold">{summary.client.name}</div>
            </div>
          </div>

          {Object.entries(grouped).map(([groupName, sites]) => (
            <div key={groupName} className="card">
              <div className="font-semibold text-ink-900 mb-3">{groupName}</div>
              <div className="space-y-1.5">
                {sites.map((s) => (
                  <div key={s._id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                    <span className="text-slate-600">→ {siteLabel(s)}</span>
                    <span className="text-xs text-slate-400">{s.town}{s.county ? `, ${s.county}` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
