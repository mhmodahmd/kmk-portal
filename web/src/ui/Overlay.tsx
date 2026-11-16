import { tr } from '../lib/i18n';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { cx } from './cx';
import { validateForm } from './Field';

/** الحوارات المفتوحة بترتيب الفتح؛ آخرها فقط يستجيب للكيبورد (Escape وحلقة Tab) */
const STACK: HTMLElement[] = [];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * نافذة حوار: على الجوال تظهر من الأسفل، وعلى الحاسوب في الوسط.
 * - التركيز محبوس داخلها (Tab يدور) ويعود إلى العنصر السابق عند الإغلاق.
 * - مع `onSubmit` يصبح المحتوى نموذجاً: Enter يرسل، والحقول الإلزامية تُتحقَّق محلياً قبل الاستدعاء،
 *   وزر الحفظ في `footer` يكون `type="submit"`.
 */
export function Dialog({ open, onClose, title, children, footer, wide, onSubmit }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean; onSubmit?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const el = ref.current!;
    STACK.push(el);
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (STACK[STACK.length - 1] !== el) return;
      if (e.key === 'Escape') { closeRef.current(); return; }
      if (e.key !== 'Tab') return;
      const els = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null || x.getClientRects().length > 0);
      if (!els.length) { e.preventDefault(); return; }
      const first = els[0], last = els[els.length - 1], active = document.activeElement as HTMLElement | null;
      const inside = active && el.contains(active);
      if (e.shiftKey ? (!inside || active === first) : (!inside || active === last)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    };
    document.addEventListener('keydown', onKey);
    // أول حقل إدخال، وإلا أول زر بعد زر الإغلاق
    const buttons = Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled])'));
    const first = el.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])') || buttons[1] || buttons[0];
    first?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      STACK.splice(STACK.indexOf(el), 1);
      if (!STACK.length) document.body.style.overflow = '';
      prev?.focus();
    };
  }, [open]);
  if (!open) return null;
  const body = (
    <>
      <div className="overflow-y-auto px-5 pb-5">{children}</div>
      {footer && <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">{footer}</div>}
    </>
  );
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={cx('kmk-in flex max-h-[92vh] w-full flex-col rounded-t-2xl sm:rounded-2xl bg-surface-2 border border-line shadow-xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <h2 id={titleId} className="m-0 flex-1 text-[18px] font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={tr("إغلاق")} className="-me-1.5 inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-chip cursor-pointer sm:-me-0 sm:h-9 sm:w-9"><Icon name="x" /></button>
        </div>
        {onSubmit
          ? <form noValidate className="flex min-h-0 flex-col" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); if (validateForm(e.currentTarget)) onSubmit(); }}>{body}</form>
          : <div className="flex min-h-0 flex-col">{body}</div>}
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
