import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useToast } from '../context/ToastContext.jsx';
import { discardFailed, flushQueue, pendingItems, subscribeQueue } from '../utils/offlineQueue.js';

// Small notice in the top bar: shows when you are offline or have changes waiting to be sent.
export default function SyncStatus() {
  const toast = useToast();
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  const [items, setItems] = useState(pendingItems);
  const [syncing, setSyncing] = useState(false);

  const waiting = items.filter((i) => !i.failed);
  const failed = items.filter((i) => i.failed);

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await flushQueue();
      if (result.sent) toast.success(`${result.sent} saved change${result.sent > 1 ? 's' : ''} synced`);
      if (result.failed) toast.error(`${result.failed} change${result.failed > 1 ? 's' : ''} could not be saved - tap the red notice`);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      sync();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const unsubscribe = subscribeQueue(() => setItems(pendingItems()));
    if (pendingItems().some((i) => !i.failed)) sync();
    // keeps trying now and then, in case the connection came back without a notification
    const timer = setInterval(() => {
      if (navigator.onLine !== false && pendingItems().some((i) => !i.failed)) sync();
    }, 30000);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  if (online && items.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-xs">
      {!online && (
        <span className="flex items-center gap-1 rounded-full bg-red-50 text-red-600 px-2 py-1">
          <CloudOff size={13} /> Offline
        </span>
      )}
      {waiting.length > 0 && (
        <button
          onClick={sync}
          title="Saved on this phone - tap to send now"
          className="flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2 py-1"
        >
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> {waiting.length} waiting to sync
        </button>
      )}
      {failed.length > 0 && (
        <button
          onClick={() => {
            const lines = failed.map((f) => `- ${f.label}: ${f.error}`).join('\n');
            if (confirm(`These could not be saved:\n\n${lines}\n\nRemove them from this phone?`)) discardFailed();
          }}
          className="rounded-full bg-red-50 text-red-600 px-2 py-1"
        >
          {failed.length} need attention
        </button>
      )}
    </div>
  );
}