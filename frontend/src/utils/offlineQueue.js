import api from '../api/axios';
import { parseMpesaMessage } from './mpesaParseLocal.js';

// Things recorded with no signal are kept on this phone and sent later, in the same order.
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

// A database id made on the phone (4 bytes of time + 8 random bytes, like the server makes).
// Because the phone knows the id before the server does, a new job and its first visit can be saved together with no signal.
export function newObjectId() {
  const time = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  let random = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    random = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  } else {
    for (let i = 0; i < 16; i += 1) random += Math.floor(Math.random() * 16).toString(16);
  }
  return time + random;
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

function enqueue(url, body, label) {
  const items = readAll();
  items.push({ id: body.clientRequestId, user: currentUserId(), url, body, label: label || url, queuedAt: new Date().toISOString() });
  writeAll(items);
}

// Sends now. If there is no connection, keeps it on this phone and sends it when you are back online.
// Every request carries an id, so a retry can never create the same record twice.
export async function postOrQueue(url, body, label) {
  const payload = { ...body, clientRequestId: body.clientRequestId || newRequestId() };
  if (isOffline()) {
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

// Sends several steps that depend on each other (for example: the job, then its first visit).
// Once one step has to wait for a signal, every step after it waits too, so they are always sent in order.
export async function postChain(steps) {
  let waiting = isOffline();
  const results = [];
  for (const step of steps) {
    const payload = { ...step.body, clientRequestId: step.body.clientRequestId || newRequestId() };
    if (waiting) {
      enqueue(step.url, payload, step.label);
      results.push({ queued: true });
      continue;
    }
    try {
      const res = await api.post(step.url, payload, { noRetry: true, timeout: 10000 });
      results.push({ queued: false, data: res.data });
    } catch (err) {
      if (err.response) throw err;
      waiting = true;
      enqueue(step.url, payload, step.label);
      results.push({ queued: true });
    }
  }
  return { queued: results.some((r) => r.queued), results };
}

// Reads a pasted M-PESA message. The server also checks it against what you already saved;
// with no signal the phone reads it itself and the server checks for duplicates later, when it syncs.
export async function parseMessage(message) {
  const readHere = () => {
    const p = parseMpesaMessage(message);
    const parsed = { ...p, transactionDate: p.transactionDate ? p.transactionDate.toISOString() : null };
    const alreadyQueued = pendingItems().some((i) => i.url === '/mpesa' && i.body && p.transactionCode && i.body.transactionCode === p.transactionCode);
    return { parsed, duplicate: null, offline: true, queuedDuplicate: alreadyQueued };
  };
  if (isOffline()) return readHere();
  try {
    const { data } = await api.post('/mpesa/parse', { message }, { noRetry: true, timeout: 8000 });
    return { parsed: data.parsed, duplicate: data.duplicate, offline: false, queuedDuplicate: false };
  } catch (err) {
    if (!err.response) return readHere();
    throw err;
  }
}

let flushing = false;

export async function flushQueue() {
  if (flushing || isOffline()) return { sent: 0, failed: 0 };
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