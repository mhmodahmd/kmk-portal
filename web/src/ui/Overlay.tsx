import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { cx } from './cx';

/** نافذة حوار: على الجوال تظهر من الأسفل، وعلى الحاسوب في الوسط. */
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button');
    first?.focus();
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus(); };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={cx('kmk-in flex max-h-[92vh] w-full flex-col rounded-t-2xl sm:rounded-2xl bg-surface-2 border border-line shadow-xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <h2 className="m-0 flex-1 text-[18px] font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-muted hover:bg-chip cursor-pointer"><Icon name="x" /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// ───────── الإشعارات المؤقتة ─────────
interface Toast { id: number; message: string; tone: 'ok' | 'bad' }
const ToastCtx = createContext<(message: string, tone?: 'ok' | 'bad') => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: 'ok' | 'bad' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, message, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 sm:bottom-6 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div key={t.id} className="kmk-in pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl bg-[#232323] px-4 py-3 text-white shadow-lg dark:bg-[#E8E8E8] dark:text-[#151515]">
            <Icon name={t.tone === 'ok' ? 'check' : 'alert'} size={18} className={t.tone === 'ok' ? 'text-[#4ADE80] dark:text-[#16803C]' : 'text-[#F87171] dark:text-[#B91C1C]'} strokeWidth={2.2} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
