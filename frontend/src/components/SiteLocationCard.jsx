import { useState } from 'react';
import { MapPin } from 'lucide-react';
import api from '../api/axios';
import { useToast } from '../context/ToastContext.jsx';
import { siteLabel } from '../utils/format.js';

// "-1.2921, 36.8219" (copied from Google Maps) -> latitude and longitude
const parseCoords = (text) => {
  const m = String(text || '').match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
  return m ? { latitude: Number(m[1]), longitude: Number(m[2]) } : null;
};

// Shows where the job's site is, and whether its map coordinates have already been saved.
export default function SiteLocationCard({ site, onSaved }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!site || !site._id) return null;

  const hasCoords = site.latitude != null && site.longitude != null;
  const here = hasCoords ? `${Number(site.latitude).toFixed(5)},${Number(site.longitude).toFixed(5)}` : '';
  const place = [site.location, site.town, site.county].filter(Boolean).join(', ');

  const startEdit = () => {
    setText(hasCoords ? `${site.latitude}, ${site.longitude}` : '');
    setError('');
    setEditing(true);
  };

  const save = async () => {
    const parsed = parseCoords(text);
    if (!parsed) {
      setError('Paste the two numbers from Google Maps, like -1.2921, 36.8219');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.put(`/sites/${site._id}`, parsed);
      toast.success('Site coordinates saved');
      setEditing(false);
      if (onSaved) onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save the coordinates');
    } finally {
      setSaving(false);
    }
  };

  const link = 'text-brand-600 hover:text-brand-700 font-medium';

  return (
    <div className="card space-y-2 text-sm">
      <div className="flex items-center gap-2 font-semibold text-ink-900">
        <MapPin size={16} className="text-brand-600" /> Site location
      </div>
      <div className="text-ink-800">{siteLabel(site)}</div>
      <div className="text-slate-500">{place || 'No address, town or county saved for this site yet.'}</div>

      {hasCoords ? (
        <div className="space-y-1">
          <div className="text-slate-600">
            Coordinates: <span className="font-medium text-ink-900">{here}</span>{' '}
            <span className="text-xs rounded-full bg-green-50 text-green-700 px-2 py-0.5">Saved</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <a className={link} href={`https://www.google.com/maps/search/?api=1&query=${here}`} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
            <a className={link} href={`https://www.google.com/maps/@${here},18z/data=!3m1!1e3`} target="_blank" rel="noopener noreferrer">Satellite view</a>
            <a className={link} href={`https://www.google.com/maps/dir/?api=1&destination=${here}`} target="_blank" rel="noopener noreferrer">Directions</a>
            {!editing && <button type="button" onClick={startEdit} className="text-slate-400 hover:text-slate-600">Change</button>}
          </div>
        </div>
      ) : (
        !editing && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs rounded-full bg-amber-50 text-amber-700 px-2 py-0.5">No coordinates saved yet</span>
            <button type="button" onClick={startEdit} className={link}>Add coordinates</button>
          </div>
        )
      )}

      {editing && (
        <div className="space-y-2 pt-1">
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. -1.2921, 36.8219" />
          <p className="text-xs text-slate-400">In Google Maps, press and hold the spot, then copy the two numbers shown and paste them here.</p>
          {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="button" onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Save coordinates'}</button>
          </div>
        </div>
      )}
    </div>
  );
}