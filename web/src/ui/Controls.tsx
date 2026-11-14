import { tr } from '../lib/i18n';
import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { cx } from './cx';
import { monthLabel, shiftMonth } from '../lib/format';

/** تبويبات تنقّل داخل وحدة (روابط). تنزلق أفقياً على الجوال. */
export function TabNav({ items, label }: { items: { to: string; label: string; badge?: number; end?: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="no-print -mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max gap-1 border-b border-line">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end}
            className={({ isActive }) => cx('relative inline-flex h-11 items-center gap-2 px-3.5 font-medium no-underline whitespace-nowrap',
              isActive ? 'text-fg after:absolute after:inset-x-2 after:-bottom-px after:h-[3px] after:rounded-t after:bg-brand' : 'text-muted hover:text-fg')}>
            {it.label}
            {!!it.badge && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">{it.badge}</span>}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** اختيار واحد من مجموعة صغيرة (مثل التصفية بالحالة) */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx('inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 font-medium cursor-pointer',
            value === o.value ? 'bg-fg text-bg' : 'border border-line bg-surface hover:border-line-strong')}>
          {o.label}
          {o.count !== undefined && <span className={cx('rounded-full px-1.5 text-[12px] font-semibold num', value === o.value ? 'bg-bg text-fg' : 'bg-chip text-muted')}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** تنقّل بين الأشهر: ‹ نوفمبر 2026 › */
export function MonthPicker({ value, onChange, max }: { value: string; onChange: (m: string) => void; max?: string }) {
  const next = shiftMonth(value, 1);
  const canNext = !max || next <= max;
  const btn = 'inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface hover:border-line-strong cursor-pointer disabled:opacity-40 disabled:cursor-default';
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={btn} aria-label={tr("الشهر السابق")} onClick={() => onChange(shiftMonth(value, -1))}><Icon name="chevron" className="rotate-180" /></button>
      <label className="relative inline-flex h-10 min-w-[140px] items-center justify-center rounded-lg border border-line bg-surface px-3 font-semibold">
        {monthLabel(value)}
        <input type="month" value={value} max={max} onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-label={tr("اختر الشهر")} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <button type="button" className={btn} aria-label={tr("الشهر التالي")} disabled={!canNext} onClick={() => onChange(next)}><Icon name="chevron" /></button>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder, id }: { value: string; onChange: (v: string) => void; placeholder: string; id: string }) {
  return (
    <div className="flex h-10 flex-[1_1_220px] items-center gap-2 rounded-lg border border-line bg-bg px-3 text-muted">
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      <Icon name="search" size={18} />
      <input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none" />
    </div>
  );
}

/** جدول بيانات بتمرير أفقي على الشاشات الضيقة */
export function DataTable({ head, children, className, minWidth = 640 }: { head: ReactNode[]; children: ReactNode; className?: string; minWidth?: number }) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-right" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-line text-[12px] text-muted">
            {head.map((h, i) => <th key={i} scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-line [&>tr:first-child]:border-t-0 [&_td]:px-4 [&_td]:py-2.5">{children}</tbody>
      </table>
    </div>
  );
}

/** سطر "مفتاح: قيمة" داخل بطاقة */
export function Facts({ items, cols = 2 }: { items: { k: string; v: ReactNode }[]; cols?: 2 | 3 }) {
  return (
    <dl className={cx('m-0 grid gap-x-4 gap-y-3', cols === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2')}>
      {items.map((f) => (
        <div key={f.k} className="min-w-0">
          <dt className="text-[12px] text-muted">{f.k}</dt>
          <dd className="m-0 truncate font-medium">{f.v || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
