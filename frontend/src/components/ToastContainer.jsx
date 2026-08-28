import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { useToastList } from '../context/ToastContext.jsx';

const styles = {
  success: 'bg-brand-600 text-white',
  error: 'bg-red-600 text-white',
  default: 'bg-ink-900 text-white',
};

const icons = {
  success: CheckCircle2,
  error: XCircle,
  default: Info,
};

export default function ToastContainer() {
  const { toasts, dismiss } = useToastList();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0">
      {toasts.map((t) => {
        const Icon = icons[t.type] || icons.default;
        return (
          <div
            key={t.id}
            className={`flex items-start gap-2 rounded-lg shadow-lg px-4 py-3 text-sm ${styles[t.type] || styles.default}`}
          >
            <Icon size={18} className="shrink-0 mt-0.5" />
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="shrink-0 opacity-70 hover:opacity-100">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}