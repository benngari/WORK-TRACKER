import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { siteLabel } from '../utils/format.js';

export default function CalendarPage() {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(new Date());
  const [records, setRecords] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    api
      .get('/attendance/calendar', { params: { from: from.toISOString(), to: to.toISOString() } })
      .then((res) => setRecords(res.data));
  }, [cursor]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();

  const recordsByDay = {};
  records.forEach((r) => {
    const d = new Date(r.date);
    if (d.getMonth() !== month || d.getFullYear() !== year) return;
    const day = d.getDate();
    (recordsByDay[day] = recordsByDay[day] || []).push(r);
  });

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="btn-secondary p-2"><ChevronLeft size={16} /></button>
          <div className="font-semibold text-ink-900">{firstDay.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</div>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="btn-secondary p-2"><ChevronRight size={16} /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400 font-medium mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => (
            <button
              key={i}
              disabled={!day}
              onClick={() => setSelectedDay(day)}
              className={`aspect-square rounded-lg border text-sm flex flex-col items-center justify-start p-1 ${
                !day ? 'border-transparent' :
                recordsByDay[day] ? 'border-brand-200 bg-brand-50 hover:bg-brand-100' : 'border-slate-100 hover:bg-slate-50'
              }`}
            >
              {day && <span className="font-medium text-ink-800">{day}</span>}
              {day && recordsByDay[day] && (
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1" />
              )}
            </button>
          ))}
        </div>
      </div>

      {selectedDay && recordsByDay[selectedDay] && (
        <div className="card">
          <div className="font-semibold text-ink-900 mb-3">
            {new Date(year, month, selectedDay).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <div className="space-y-2">
            {recordsByDay[selectedDay].map((r) => (
              <div
                key={r._id}
                onClick={() => navigate(`/jobs/${r.job?._id}`)}
                className="flex justify-between items-center p-3 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer text-sm"
              >
                <div>
                  <div className="font-medium text-ink-900">{r.job?.client?.name}</div>
                  <div className="text-xs text-slate-400">{siteLabel(r.job?.site)}</div>
                </div>
                <div className="text-xs text-slate-500">{r.shift}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
