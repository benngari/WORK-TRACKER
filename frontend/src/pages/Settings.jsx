import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import api from '../api/axios';
import { setCurrency } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

const currencyOptions = [
  { code: 'KES', label: 'KES — Kenyan Shilling' },
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'NGN', label: 'NGN — Nigerian Naira' },
  { code: 'ZAR', label: 'ZAR — South African Rand' },
  { code: 'UGX', label: 'UGX — Ugandan Shilling' },
  { code: 'TZS', label: 'TZS — Tanzanian Shilling' },
  { code: 'GHS', label: 'GHS — Ghanaian Cedi' },
  { code: 'INR', label: 'INR — Indian Rupee' },
];

export default function SettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get('/settings').then((res) => {
      setSettings(res.data);
      setCurrency(res.data.currency);
    });
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const { data } = await api.put('/settings', { defaultRate: settings.defaultRate, currency: settings.currency });
      setSettings(data);
      setCurrency(data.currency);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data } = await api.get('/backup/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `work-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  if (!settings) return <div className="text-sm text-slate-400">Loading...</div>;

  return (
    <div className="max-w-md space-y-4">
      <form onSubmit={handleSave} className="card space-y-4">
        <div>
          <label className="label">Default Rate (per callout/job)</label>
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
          <select
            className="input"
            value={settings.currency}
            onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
          >
            {currencyOptions.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">
            Applies everywhere amounts are shown across the app, right after you save.
          </p>
        </div>
        {saved && <div className="text-sm bg-brand-50 text-brand-700 rounded-lg px-3 py-2">Settings saved.</div>}
        <button disabled={saving} className="btn-primary w-full">{saving ? 'Saving...' : 'Save Settings'}</button>
      </form>

      <div className="card space-y-3">
        <div>
          <div className="font-semibold text-ink-900 text-sm">Data Backup</div>
          <p className="text-xs text-slate-500 mt-1">
            Downloads every client, site, job, attendance record, payment, and M-PESA transaction in your
            account as one JSON file — a safety copy independent of the database.
          </p>
        </div>
        <button onClick={handleExport} disabled={exporting} className="btn-secondary w-full flex items-center justify-center gap-1.5">
          <Download size={15} /> {exporting ? 'Preparing...' : 'Download Full Backup (JSON)'}
        </button>
      </div>
    </div>
  );
}