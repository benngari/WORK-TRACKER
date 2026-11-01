import { useEffect, useRef, useState } from 'react';
import { Check, Moon, MoonStar, Sun } from 'lucide-react';

const THEMES = [
  { id: 'light', label: 'Light', hint: 'Bright and clear', Icon: Sun, color: '#ffffff' },
  { id: 'soft', label: 'Soft dark', hint: 'Gentle on the eyes, lower contrast', Icon: Moon, color: '#20252d' },
  { id: 'black', label: 'Black', hint: 'Deep black, saves battery on OLED phones', Icon: MoonStar, color: '#000000' },
];

// 'light' | 'soft' | 'black'. The old single dark mode (saved as "dark") now opens as the softer dark.
function readSaved() {
  try {
    const saved = localStorage.getItem('wt_theme');
    if (saved === 'soft' || saved === 'black' || saved === 'light') return saved;
    if (saved === 'dark') return 'soft';
  } catch (e) {
    // storage blocked - use the default
  }
  return 'light';
}

export function applyTheme(id) {
  const root = document.documentElement;
  root.classList.toggle('dark', id !== 'light');
  root.classList.toggle('dark-soft', id === 'soft');
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = (THEMES.find((t) => t.id === id) || THEMES[0]).color;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(readSaved);
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem('wt_theme', theme);
    } catch (e) {
      // storage blocked - the choice still applies for this visit
    }
  }, [theme]);

  // close the menu when you tap elsewhere or press Escape
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('touchstart', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const current = THEMES.find((t) => t.id === theme) || THEMES[0];

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-slate-400 hover:text-brand-600 transition-colors"
        title={`Theme: ${current.label}`}
        aria-label={`Theme: ${current.label}. Tap to change`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <current.Icon size={19} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-64 card p-1.5 shadow-lg border border-slate-200 z-50">
          {THEMES.map(({ id, label, hint, Icon }) => (
            <button
              key={id}
              role="menuitemradio"
              aria-checked={theme === id}
              onClick={() => {
                setTheme(id);
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
            >
              <Icon size={18} className="text-slate-500 shrink-0" />
              <span className="flex-1">
                <span className="block text-sm font-medium text-ink-900">{label}</span>
                <span className="block text-xs text-slate-400">{hint}</span>
              </span>
              {theme === id && <Check size={16} className="text-brand-600 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}