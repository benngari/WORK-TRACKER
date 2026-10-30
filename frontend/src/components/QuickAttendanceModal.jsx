import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import api from '../api/axios';
import { useToast } from '../context/ToastContext.jsx';
import { postOrQueue } from '../utils/offlineQueue.js';
import { todayNairobi } from '../utils/dates.js';
import { siteLabel } from '../utils/format.js';

const jobLabel = (j) =>
  `${(j.client && j.client.name) || ''} - ${siteLabel(j.site)}${j.jobCardRef ? ` (${j.jobCardRef})` : ''}`;

// Record attendance for any job from one place (also reachable from the home-screen shortcut).
export default function QuickAttendanceModal({ open, onClose, onDone }) {
  const toast = useToast();
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState('');
  const [jobId, setJobId] = useState('');
  const [date, setDate] = useState(todayNairobi());
  const [shift, setShift] = useState('Day');
  const [rate, setRate] = useState('');
  const [fareNeeded, setFareNeeded] = useState(false);
  const [fare, setFare] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setFilter('');
    setDate(todayNairobi());
    setShift('Day');
    setFareNeeded(false);
    setFare(0);
    setNotes('');
    setError('');
    api
      .get('/jobs')
      .then((res) => {
        setJobs(res.data);
        const first = res.data[0];
        setJobId(first ? first._id : '');
        setRate(first ? first.rate : '');
      })
      .catch(() => setError('Could not load your jobs. Connect once to load them, then they work offline.'));
  }, [open]);

  const shown = jobs.filter((j) => jobLabel(j).toLowerCase().includes(filter.toLowerCase()));

  const pickJob = (id) => {
    setJobId(id);
    const job = jobs.find((j) => j._id === id);
    if (job) setRate(job.rate);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!jobId) {
      setError('Choose a job');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const job = jobs.find((j) => j._id === jobId);
      const result = await postOrQueue(
        '/attendance',
        { job: jobId, date, shift, rate: Number(rate), fare: fareNeeded ? Number(fare) : 0, notes: notes.trim() || undefined },
        `Attendance ${date} - ${job ? jobLabel(job) : 'job'}`
      );
      toast.success(result.queued ? 'No signal - saved on this phone, it will sync when you are online' : 'Attendance recorded');
      onClose();
      if (!result.queued && onDone) onDone();
    } catch (err) {
      setError((err.response && err.response.data && err.response.data.message) || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Record Attendance">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="label">Job</label>
          <input className="input mb-2" placeholder="Type to find a job..." value={filter} onChange={(e) => setFilter(e.target.value)} />
          <select className="input" value={jobId} onChange={(e) => pickJob(e.target.value)} size={Math.min(6, Math.max(2, shown.length))}>
            {shown.map((j) => (
              <option key={j._id} value={j._id}>{jobLabel(j)}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Date</label>
            <input required type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Shift</label>
            <select className="input" value={shift} onChange={(e) => setShift(e.target.value)}>
              <option>Day</option>
              <option>Night</option>
            </select>
          </div>
          <div>
            <label className="label">Rate</label>
            <input type="number" className="input" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={fareNeeded} onChange={(e) => setFareNeeded(e.target.checked)} />
          Fare needed for this visit
        </label>
        {fareNeeded && (
          <div>
            <label className="label">Fare (KES)</label>
            <input type="number" className="input" value={fare} onChange={(e) => setFare(e.target.value)} />
          </div>
        )}
        <div>
          <label className="label">Notes (optional)</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button disabled={saving || !jobId} className="btn-primary w-full">{saving ? 'Saving...' : 'Save Attendance'}</button>
      </form>
    </Modal>
  );
}