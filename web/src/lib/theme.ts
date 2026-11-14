import { useEffect, useState } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';

function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0E0E0E' : '#232323');
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(() => {
    try { return (localStorage.getItem('kmk.theme') as ThemeChoice) || 'system'; } catch { return 'system'; }
  });
  useEffect(() => {
    apply(choice);
    try { choice === 'system' ? localStorage.removeItem('kmk.theme') : localStorage.setItem('kmk.theme', choice); } catch { /* تجاهل */ }
    if (choice !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => apply('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [choice]);
  const isDark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  return { choice, setChoice, isDark, toggle: () => setChoice(isDark ? 'light' : 'dark') };
}
