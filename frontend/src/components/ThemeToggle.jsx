import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

function applyTheme(dark) {
  document.documentElement.classList.toggle('dark', dark);
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = dark ? '#000000' : '#ffffff';
}

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    applyTheme(dark);
    try {
      localStorage.setItem('wt_theme', dark ? 'dark' : 'light');
    } catch (e) {
      // storage blocked - theme still applies for this visit
    }
  }, [dark]);

  return (
    <button
      onClick={() => setDark((d) => !d)}
      className="text-slate-400 hover:text-brand-600 transition-colors"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
}