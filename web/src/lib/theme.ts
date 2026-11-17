import { useSyncExternalStore } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'kmk.theme';
const mq = () => window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch { return 'system'; }
}

let choice: ThemeChoice = typeof window === 'undefined' ? 'system' : read();
let systemDark = typeof window !== 'undefined' && mq().matches;

const resolveDark = () => choice === 'dark' || (choice === 'system' && systemDark);

function apply() {
  const dark = resolveDark();
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0E0E0E' : '#232323');
}

function emit() { apply(); listeners.forEach((l) => l()); }

if (typeof window !== 'undefined') {
  mq().addEventListener('change', (e) => { systemDark = e.matches; emit(); });
  // مزامنة الاختيار بين التبويبات
  window.addEventListener('storage', (e) => { if (e.key === KEY) { choice = read(); emit(); } });
}

function setChoice(next: ThemeChoice) {
  choice = next;
  try { if (next === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, next); } catch { /* تجاهل */ }
  emit();
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
const snapshot = () => `${choice}|${resolveDark() ? 1 : 0}`;

/** حالة الوضع مشتركة بين المكونات، وتُحسب من الاختيار وتفضيل الجهاز لا من الصفحة المرسومة */
export function useTheme() {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return { choice, setChoice, isDark: resolveDark(), toggle: () => setChoice(resolveDark() ? 'light' : 'dark') };
}
