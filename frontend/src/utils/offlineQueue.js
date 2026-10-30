import api from '../api/axios';

// Attendance and expenses recorded with no signal are kept on this phone and sent later.
const KEY = 'wt_offline_queue';
const listeners = new Set();

const currentUserId = () => {
  try {
    return JSON.parse(localStorage.getItem('wt_user') || '{}').id || '';
  } catch (e) {
    return '';
  }
};

const readAll = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch (e) {
    return [];
  }
};

const writeAll = (items) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch (e) {
    // storage full or blocked - nothing more we can do
  }
  listeners.forEach((fn) => fn());
};

// only the logged-in person's items are ever shown or sent
export const pendingItems = () => readAll().filter((i) => i.user === currentUserId());

export function subscribeQueue(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const newRequestId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function enqueue(url, body, label) {
  const items = readAll();
  items.push({ id: body.clientRequestId, user: currentUserId(), url, body, label: label || url, queuedAt: new Date().toISOString() });
  writeAll(items);
}

// Sends now. If there is no connection, keeps it on this phone and sends it when you are back online.
// Every request carries an id, so a retry can never create the same record twice.
export async function postOrQueue(url, body, label) {
  const payload = { ...body, clientRequestId: body.clientRequestId || newRequestId() };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    enqueue(url, payload, label);
    return { queued: true };
  }
  try {
    const res = await api.post(url, payload, { noRetry: true, timeout: 10000 });
    return { queued: false, data: res.data };
  } catch (err) {
    if (!err.response) {
      enqueue(url, payload, label);
      return { queued: true };
    }
    throw err;
  }
}

let flushing = false;

export async function flushQueue() {
  if (flushing || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    for (const item of pendingItems().filter((i) => !i.failed)) {
      try {
        await api.post(item.url, item.body, { noRetry: true, timeout: 15000 });
        writeAll(readAll().filter((i) => i.id !== item.id));
        sent += 1;
      } catch (err) {
        if (!err.response) break; // still no connection - try again later
        // the server refused it (for example the job was deleted): keep it visible but stop retrying
        const reason = (err.response.data && err.response.data.message) || 'Rejected by the server';
        writeAll(readAll().map((i) => (i.id === item.id ? { ...i, failed: true, error: reason } : i)));
        failed += 1;
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, failed };
}

export function discardFailed() {
  const me = currentUserId();
  writeAll(readAll().filter((i) => !(i.user === me && i.failed)));
}