import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Night is the default look. A person who picks day mode keeps it on this device. */
const KEY = 'sl_theme';
type Theme = 'dark' | 'light';

function saved(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Called once before the first render so the page never flashes the wrong colours. */
export function applyInitialTheme() {
  document.documentElement.setAttribute('data-sl-theme', saved());
}

const listeners = new Set<(t: Theme) => void>();

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(saved);
  useEffect(() => {
    listeners.add(setTheme);
    return () => void listeners.delete(setTheme);
  }, []);
  const set = (t: Theme) => {
    document.documentElement.setAttribute('data-sl-theme', t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* private mode: the choice lasts for this visit only */
    }
    listeners.forEach((fn) => fn(t));
  };
  return { dark: theme === 'dark', toggle: () => set(theme === 'dark' ? 'light' : 'dark') };
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { dark, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to day mode' : 'Switch to night mode'}
      title={dark ? 'Day mode' : 'Night mode'}
      className={`grid h-10 w-10 place-items-center rounded-[9px] text-muted transition-colors hover:bg-sheet-2 hover:text-ink ${className}`}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
