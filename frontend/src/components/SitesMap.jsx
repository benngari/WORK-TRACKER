import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../api/axios';
import { formatKES } from '../utils/format.js';
import { locateSite } from '../utils/kenyaPlaces.js';

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function nameOf(site) {
  if (site.siteType === 'Bank') return [site.bankName, site.branch].filter(Boolean).join(' - ') || 'Bank site';
  return site.siteName || 'Unnamed site';
}

const Dot = ({ color, dashed }) => (
  <span
    className="inline-block w-3 h-3 rounded-full align-middle mr-1"
    style={{ background: color, border: `2px ${dashed ? 'dashed' : 'solid'} rgba(0,0,0,0.35)` }}
  />
);

// Shows your sites on a map of Kenya. Loaded only when you switch it on from the Dashboard.
export default function SitesMap() {
  const [sites, setSites] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState('');
  const [onlyOwing, setOnlyOwing] = useState(false);
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    Promise.all([api.get('/sites'), api.get('/jobs')])
      .then(([s, j]) => {
        setSites(s.data);
        setJobs(j.data);
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load sites'));
  }, []);

  const { placed, unplaced } = useMemo(() => {
    if (!sites) return { placed: [], unplaced: [] };

    const stats = {};
    for (const job of jobs) {
      const id = job.site && (job.site._id || job.site);
      if (!id) continue;
      const st = (stats[id] = stats[id] || { jobs: 0, visits: 0, outstanding: 0 });
      st.jobs += 1;
      st.visits += job.attendanceCount || 0;
      st.outstanding += job.outstanding || 0;
    }

    const placedList = [];
    const unplacedList = [];
    for (const site of sites) {
      const where = locateSite(site);
      const st = stats[site._id] || { jobs: 0, visits: 0, outstanding: 0 };
      if (where) placedList.push({ site, ...where, ...st });
      else unplacedList.push(site);
    }

    // sites sharing the same approximate spot are fanned out slightly so each one can be seen and tapped
    const seen = {};
    for (const p of placedList) {
      if (!p.approx) continue;
      const key = `${p.lat},${p.lng}`;
      const n = seen[key] || 0;
      seen[key] = n + 1;
      if (n > 0) {
        const radius = 0.012 * Math.sqrt(n);
        p.lat += radius * Math.sin(n * 2.4);
        p.lng += radius * Math.cos(n * 2.4);
      }
    }
    return { placed: placedList, unplaced: unplacedList };
  }, [sites, jobs]);

  const visible = useMemo(() => (onlyOwing ? placed.filter((p) => p.outstanding > 0) : placed), [placed, onlyOwing]);

  // create the map once
  useEffect(() => {
    const map = L.map(mapEl.current, { scrollWheelZoom: false }).setView([0.3, 37.9], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const timer = setTimeout(() => map.invalidateSize(), 50);
    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // draw the markers whenever the data or the filter changes
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const points = [];
    for (const p of visible) {
      const owing = p.outstanding > 0;
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: Math.max(7, Math.min(16, 6 + p.visits)),
        color: owing ? '#b45309' : '#146d4c',
        weight: 2,
        dashArray: p.approx ? '3 3' : null,
        fillColor: owing ? '#f59e0b' : '#26a873',
        fillOpacity: 0.75,
      });
      marker.bindPopup(
        `<div style="min-width:170px">` +
          `<strong>${esc(nameOf(p.site))}</strong><br/>` +
          `${esc(p.site.client?.name || '')}<br/>` +
          `${esc([p.site.town, p.site.county].filter(Boolean).join(', '))}` +
          `<hr style="margin:6px 0"/>` +
          `Jobs: ${p.jobs} &middot; Visits: ${p.visits}<br/>` +
          `Outstanding: ${esc(formatKES(p.outstanding))}<br/>` +
          `<small>${p.approx ? 'Approximate - placed by ' + esc(p.basis) : 'Exact location'}</small>` +
          `</div>`
      );
      marker.addTo(layer);
      points.push([p.lat, p.lng]);
    }

    if (points.length > 1) map.fitBounds(points, { padding: [30, 30], maxZoom: 11 });
    else if (points.length === 1) map.setView(points[0], 10);
    else map.setView([0.3, 37.9], 6);
  }, [visible]);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="font-semibold text-ink-900">Sites Map</div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={onlyOwing} onChange={(e) => setOnlyOwing(e.target.checked)} />
          Only sites with money outstanding
        </label>
      </div>

      {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
      {!sites && !error && <div className="text-sm text-slate-400">Loading sites...</div>}

      <div
        ref={mapEl}
        style={{ height: 420, isolation: 'isolate' }}
        className="rounded-xl overflow-hidden border border-slate-100"
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span><Dot color="#26a873" /> Nothing owing</span>
        <span><Dot color="#f59e0b" /> Money outstanding</span>
        <span><Dot color="#ffffff" dashed /> Approximate spot (placed by town or county)</span>
        <span>Bigger dot = more visits</span>
      </div>

      {sites && (
        <div className="text-xs text-slate-400">
          {visible.length} of {sites.length} sites shown
        </div>
      )}
      {unplaced.length > 0 && (
        <div className="text-xs text-slate-500 bg-slate-100 rounded-lg px-3 py-2">
          Not on the map ({unplaced.length}): {unplaced.map(nameOf).join(', ')}. Add a town, a county or map
          coordinates to the site to place it.
        </div>
      )}
    </div>
  );
}