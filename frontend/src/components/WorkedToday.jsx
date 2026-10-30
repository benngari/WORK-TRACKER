import { useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { useToast } from '../context/ToastContext.jsx';
import { postOrQueue } from '../utils/offlineQueue.js';
import { todayNairobi } from '../utils/dates.js';

// One tap: records today (Day shift, the job's rate) for this job.
// Works with no signal too - it is saved on the phone and sent later.
export default function WorkedTodayButton({ job, onDone, iconOnly = false, className = '' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const handleClick = async (e) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const result = await postOrQueue(
        '/attendance',
        { job: job._id, date: todayNairobi(), shift: 'Day', rate: job.rate, fare: 0, skipIfExists: true },
        `Worked today - ${(job.client && job.client.name) || 'job'}`
      );
      if (result.queued) toast.success('No signal - saved on this phone, it will sync when you are online');
      else if (result.data && result.data.alreadyRecorded) toast.success('Today is already recorded for this job');
      else toast.success('Recorded: worked today');
      if (!result.queued && !(result.data && result.data.alreadyRecorded) && onDone) onDone();
    } catch (err) {
      toast.error((err.response && err.response.data && err.response.data.message) || 'Could not record attendance');
    } finally {
      setBusy(false);
    }
  };

  if (iconOnly) {
    return (
      <button
        onClick={handleClick}
        disabled={busy}
        title="Worked today (records today for this job)"
        className={`text-slate-400 hover:text-brand-600 mr-3 ${className}`}
      >
        <CalendarCheck size={15} />
      </button>
    );
  }
  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className={className || 'flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700'}
    >
      <CalendarCheck size={15} /> {busy ? 'Saving...' : 'Worked Today'}
    </button>
  );
}