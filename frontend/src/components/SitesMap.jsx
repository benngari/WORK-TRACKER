import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Maximize2, Minimize2 } from 'lucide-react';
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

// Free satellite photos and place names from Esri (no account or key needed)
const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const LABELS_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

// Shows your sites on a map of Kenya. Loaded only when you switch it on from the Dashboard.
export default function SitesMap() {
  const [sites, setSites] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState('');
  const [onlyOwing, setOnlyOwing] = useState(false);
  const [mode, setMode] = useState('map'); // 'map' | 'satellite'
  const [tall, setTall] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const tilesRef = useRef(null);
  const meRef = useRef(null);
  const fittedFor = useRef(null);

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

  // create the map once, with both kinds of pictures ready to switch between
  useEffect(() => {
    const map = L.map(mapEl.current, { scrollWheelZoom: false }).setView([0.3, 37.9], 6);
    tilesRef.current = {
      street: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }),
      satellite: L.tileLayer(SATELLITE_URL, {
        maxZoom: 19,
        maxNativeZoom: 17, // beyond this the picture is just enlarged, so rural areas never show "no data" tiles
        attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics and the GIS User Community',
      }),
      labels: L.tileLayer(LABELS_URL, { maxZoom: 19, maxNativeZoom: 17 }),
    };
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const timer = setTimeout(() => map.invalidateSize(), 50);
    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      tilesRef.current = null;
      meRef.current = null;
      fittedFor.current = null;
    };
  }, []);

  // switch between the street map and satellite photos
  useEffect(() => {
    const map = mapRef.current;
    const tiles = tilesRef.current;
    if (!map || !tiles) return;
    [tiles.street, tiles.satellite, tiles.labels].forEach((layer) => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    });
    if (mode === 'satellite') {
      tiles.satellite.addTo(map);
      tiles.labels.addTo(map);
    } else {
      tiles.street.addTo(map);
    }
    // markers and labels must stay above the pictures
    if (layerRef.current) layerRef.current.eachLayer((l) => l.bringToFront && l.bringToFront());
    map.getContainer().classList.toggle('wt-satellite', mode === 'satellite');
  }, [mode]);

  // make the map taller or shorter
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const timer = setTimeout(() => map.invalidateSize(), 50);
    return () => clearTimeout(timer);
  }, [tall]);

  // draw the markers whenever the data, the filter or the picture type changes
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const sat = mode === 'satellite';
    const points = [];
    for (const p of visible) {
      const owing = p.outstanding > 0;
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: Math.max(7, Math.min(16, 6 + p.visits)),
        color: sat ? '#ffffff' : owing ? '#b45309' : '#146d4c',
        weight: sat ? 3 : 2,
        dashArray: p.approx ? '3 3' : null,
        fillColor: owing ? '#f59e0b' : '#26a873',
        fillOpacity: 0.85,
      });
      const here = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
      marker.bindPopup(
        `<div style="min-width:180px">` +
          `<strong>${esc(nameOf(p.site))}</strong><br/>` +
          `${esc(p.site.client?.name || '')}<br/>` +
          `${esc([p.site.town, p.site.county].filter(Boolean).join(', '))}` +
          `<hr style="margin:6px 0"/>` +
          `Jobs: ${p.jobs} &middot; Visits: ${p.visits}<br/>` +
          `Outstanding: ${esc(formatKES(p.outstanding))}<br/>` +
          `<small>${p.approx ? 'Approximate - placed by ' + esc(p.basis) : 'Exact location'}</small>` +
          `<hr style="margin:6px 0"/>` +
          `<a href="https://www.google.com/maps/dir/?api=1&destination=${here}" target="_blank" rel="noopener noreferrer">Directions in Google Maps</a><br/>` +
          `<a href="https://www.google.com/maps/@${here},18z/data=!3m1!1e3" target="_blank" rel="noopener noreferrer">View satellite in Google Maps</a>` +
          `</div>`
      );
      marker.addTo(layer);
      points.push([p.lat, p.lng]);
    }

    // zoom to fit only when the set of sites changes, not when you just switch picture type
    if (fittedFor.current !== visible) {
      fittedFor.current = visible;
      if (points.length > 1) map.fitBounds(points, { padding: [30, 30], maxZoom: 11 });
      else if (points.length === 1) map.setView(points[0], 10);
      else map.setView([0.3, 37.9], 6);
    }
  }, [visible, mode]);

  // show where you are standing, to see how close you are to a site
  const locateMe = () => {
    setLocError('');
    if (!navigator.geolocation) {
      setLocError('Location is not available on this device.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const map = mapRef.current;
        setLocating(false);
        if (!map) return;
        const { latitude, longitude, accuracy } = pos.coords;
        if (meRef.current) meRef.current.remove();
        meRef.current = L.layerGroup([
          L.circle([latitude, longitude], { radius: accuracy, color: '#2563eb', weight: 1, fillOpacity: 0.1 }),
          L.circleMarker([latitude, longitude], { radius: 8, color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).bindPopup('You are here'),
        ]).addTo(map);
        map.setView([latitude, longitude], Math.max(map.getZoom(), 13));
      },
      (err) => {
        setLocating(false);
        setLocError(err.code === 1 ? 'Location is blocked. Allow it for this site in your browser settings.' : 'Could not find your location. Try again outdoors.');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const segment = (value, label) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      className={`px-3 py-1.5 text-sm font-medium ${
        mode === value ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="font-semibold text-ink-900">Sites Map</div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg overflow-hidden border border-slate-200">
            {segment('map', 'Map')}
            {segment('satellite', 'Satellite')}
          </div>
          <button type="button" onClick={locateMe} disabled={locating} className="btn-secondary flex items-center gap-1.5">
            <Crosshair size={15} /> {locating ? 'Finding...' : 'My location'}
          </button>
          <button
            type="button"
            onClick={() => setTall((t) => !t)}
            className="btn-secondary flex items-center gap-1.5"
            title={tall ? 'Make the map smaller' : 'Make the map bigger'}
          >
            {tall ? <Minimize2 size={15} /> : <Maximize2 size={15} />} {tall ? 'Smaller' : 'Bigger'}
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={onlyOwing} onChange={(e) => setOnlyOwing(e.target.checked)} />
        Only sites with money outstanding
      </label>

      {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
      {locError && <div className="text-sm bg-amber-50 text-amber-700 rounded-lg px-3 py-2">{locError}</div>}
      {!sites && !error && <div className="text-sm text-slate-400">Loading sites...</div>}

      <div
        ref={mapEl}
        style={{ height: tall ? '75vh' : 420, minHeight: 320, isolation: 'isolate' }}
        className="rounded-xl overflow-hidden border border-slate-100"
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span><Dot color="#26a873" /> Nothing owing</span>
        <span><Dot color="#f59e0b" /> Money outstanding</span>
        <span><Dot color="#ffffff" dashed /> Approximate spot (placed by town or county)</span>
        <span><Dot color="#2563eb" /> You</span>
        <span>Bigger dot = more visits</span>
      </div>

      {mode === 'satellite' && (
        <div className="text-xs text-slate-400">
          Satellite photos can be a few years old. Zoom in on an exact site to check the building, the road and the gate.
        </div>
      )}

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