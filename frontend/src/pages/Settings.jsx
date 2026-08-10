import { useEffect, useState } from 'react';
import api from '../api/axios';

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/settings').then((res) => setSettings(res.data));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const { data } = await api.put('/settings', { defaultRate: settings.defaultRate, currency: settings.currency });
      setSettings(data);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="text-sm text-slate-400">Loading...</div>;

  return (
    <div className="max-w-md">
      <form onSubmit={handleSave} className="card space-y-4">
        <div>
          <label className="label">Default Rate (KES per callout/day)</label>
          <input
            type="number"
            className="input"
            value={settings.defaultRate}
            onChange={(e) => setSettings({ ...settings, defaultRate: Number(e.target.value) })}
          />
          <p className="text-xs text-slate-400 mt-1">
            Used as the default when creating a new job. Individual clients or jobs can still use a different rate.
          </p>
        </div>
        <div>
          <label className="label">Currency</label>
          <input className="input" value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} />
        </div>
        {saved && <div className="text-sm bg-brand-50 text-brand-700 rounded-lg px-3 py-2">Settings saved.</div>}
        <button disabled={saving} className="btn-primary w-full">{saving ? 'Saving...' : 'Save Settings'}</button>
      </form>
    </div>
  );
}
