import { tr } from '../lib/i18n';
import { NavLink } from 'react-router-dom';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
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
          className={cx('inline-flex h-11 items-center gap-1.5 rounded-full px-3.5 font-medium cursor-pointer sm:h-9',
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
  const btn = 'inline-flex h-11 w-11 sm:h-10 sm:w-10 items-center justify-center rounded-lg border border-line bg-surface hover:border-line-strong cursor-pointer disabled:opacity-40 disabled:cursor-default';
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={btn} aria-label={tr("الشهر السابق")} onClick={() => onChange(shiftMonth(value, -1))}><Icon name="chevron" className="rotate-180" /></button>
      <label className="relative inline-flex h-11 min-w-[140px] items-center justify-center rounded-lg border border-line bg-surface px-3 font-semibold sm:h-10">
        {monthLabel(value)}
        <input type="month" value={value} max={max} onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-label={tr("اختر الشهر")} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <button type="button" className={btn} aria-label={tr("الشهر التالي")} disabled={!canNext} onClick={() => onChange(next)}><Icon name="chevron" /></button>
    </div>
  );
}

/** تبديل طريقة العرض (قائمة/لوحة، بطاقات/سطور): أزرار بأيقونة ونص، 44px على الجوال */
export function ViewToggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; icon: IconName; label: string }[] }) {
  return (
    <div role="radiogroup" aria-label={tr("طريقة العرض")} className="inline-flex shrink-0 rounded-lg border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx('inline-flex h-[38px] cursor-pointer items-center gap-1.5 rounded-md px-3 text-[14px] font-medium sm:h-[34px]',
            value === o.value ? 'bg-fg text-bg' : 'text-muted hover:text-fg')}>
          <Icon name={o.icon} size={16} />{o.label}
        </button>
      ))}
    </div>
  );
}

/** طريقة عرض محفوظة في هذا المتصفح (تفضيل شخصي، لا يضر فقدانه) */
export function useStoredView<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => { try { const s = localStorage.getItem(key) as T | null; return s && allowed.includes(s) ? s : fallback; } catch { return fallback; } });
  const set = (n: T) => { setV(n); try { localStorage.setItem(key, n); } catch { /* المتصفح يمنع التخزين */ } };
  return [v, set];
}

export function SearchBox({ value, onChange, placeholder, id }: { value: string; onChange: (v: string) => void; placeholder: string; id: string }) {
  return (
    <div className="flex h-11 flex-[1_1_220px] items-center gap-2 rounded-lg border border-line bg-bg px-3 text-muted sm:h-10">
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      <Icon name="search" size={18} />
      <input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none" />
    </div>
  );
}

// ───────── الجداول: فرز وترقيم محليان ─────────
export interface Sort { key: string; dir: 'asc' | 'desc' }
/** عمود: نص فقط، أو {key,label} ليكون قابلاً للفرز */
export type Column = ReactNode | { key: string; label: ReactNode };
const isSortable = (c: Column): c is { key: string; label: ReactNode } => !!c && typeof c === 'object' && 'key' in (c as object);

const PAGE_SIZES = [25, 50, 100];

function compare(a: unknown, b: unknown) {
  const ea = a === null || a === undefined || a === '', eb = b === null || b === undefined || b === '';
  if (ea || eb) return ea && eb ? 0 : ea ? 1 : -1; // الفارغ آخراً دائماً
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), 'ar', { numeric: true });
}

/**
 * حالة جدول محلية: فرز بالأعمدة وترقيم (البيانات محمّلة أصلاً).
 * `get(row, key)` يعيد قيمة الفرز للعمود؛ الافتراضي row[key].
 * تعاد الصفحة إلى الأولى عند تغيّر عدد الصفوف (تصفية أو بحث) أو الفرز.
 */
export function useTable<T>(rows: T[], opts: { sort?: Sort; pageSize?: number; get?: (row: T, key: string) => unknown } = {}) {
  const [sort, setSort] = useState<Sort | undefined>(opts.sort);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(opts.pageSize ?? 25);
  const get = opts.get;
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const val = (r: T) => (get ? get(r, sort.key) : (r as Record<string, unknown>)[sort.key]);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return rows.map((r, i) => ({ r, i })).sort((x, y) => compare(val(x.r), val(y.r)) * dir || x.i - y.i).map((x) => x.r);
  }, [rows, sort, get]);
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const cur = Math.min(page, pages);
  useEffect(() => { setPage(1); }, [rows.length, sort]);
  const onSort = (key: string) => setSort((s) => {
    if (s?.key === key) return { key, dir: s.dir === 'asc' ? 'desc' : 'asc' };
    const sample = rows.find((r) => { const v = get ? get(r, key) : (r as Record<string, unknown>)[key]; return v !== null && v !== undefined && v !== ''; });
    const v = sample ? (get ? get(sample, key) : (sample as Record<string, unknown>)[key]) : '';
    return { key, dir: typeof v === 'number' ? 'desc' : 'asc' }; // الأرقام من الأكبر، والنصوص أبجدياً
  });
  return {
    rows: sorted.slice((cur - 1) * size, cur * size),
    sort, onSort,
    pager: { page: cur, pages, total: sorted.length, size, onPage: setPage, onSize: (n: number) => { setSize(n); setPage(1); } }
  };
}

/** شريط الترقيم تحت الجدول: «1–25 من 238» مع السابق/التالي وعدد الصفوف */
export function Pager({ page, pages, total, size, onPage, onSize }: { page: number; pages: number; total: number; size: number; onPage: (p: number) => void; onSize: (n: number) => void }) {
  if (total <= PAGE_SIZES[0]) return null;
  const from = (page - 1) * size + 1, to = Math.min(total, page * size);
  const btn = 'inline-flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-md text-muted hover:bg-chip hover:text-fg cursor-pointer disabled:opacity-30 disabled:cursor-default';
  return (
    <div className="no-print flex flex-wrap items-center gap-3 border-t border-line px-4 py-2 text-[13px] text-muted">
      <span className="num">{tr("{0}–{1} من {2}", from, to, total)}</span>
      <span className="flex items-center gap-1">
        <button type="button" className={btn} aria-label={tr("الصفحة السابقة")} disabled={page <= 1} onClick={() => onPage(page - 1)}><Icon name="chevron" size={16} className="rotate-180" /></button>
        <span className="num min-w-[48px] text-center">{page} / {pages}</span>
        <button type="button" className={btn} aria-label={tr("الصفحة التالية")} disabled={page >= pages} onClick={() => onPage(page + 1)}><Icon name="chevron" size={16} /></button>
      </span>
      <label className="ms-auto flex items-center gap-1.5">
        {tr("في الصفحة")}
        <select value={size} onChange={(e) => onSize(Number(e.target.value))} className="h-11 rounded-md border border-line bg-surface px-2 text-fg sm:h-8">
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </div>
  );
}

/**
 * جدول بيانات بتمرير أفقي على الشاشات الضيقة.
 * - `sort`/`onSort` من useTable يجعلان الأعمدة ذات {key} قابلة للفرز بالنقر.
 * - `sticky` يثبّت الرأس أثناء التمرير داخل الجدول (ارتفاع أقصى 70vh على الحاسوب).
 * - `pager` يُرسم أسفل الجدول.
 */
export function DataTable({ head, children, className, minWidth = 640, sort, onSort, sticky, pager }: {
  head: Column[]; children: ReactNode; className?: string; minWidth?: number; sort?: Sort; onSort?: (key: string) => void; sticky?: boolean; pager?: ReactNode;
}) {
  return (
    <>
      <div className={cx('overflow-x-auto', sticky && 'sm:max-h-[70vh] sm:overflow-y-auto', className)}>
        <table className="w-full border-collapse text-right" style={{ minWidth }}>
          <thead>
            <tr className="border-b border-line text-[12px] text-muted">
              {head.map((h, i) => {
                const s = isSortable(h);
                const active = s && sort?.key === h.key;
                return (
                  <th key={s ? h.key : i} scope="col" aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cx('px-4 py-2.5 font-semibold whitespace-nowrap', sticky && 'sm:sticky sm:top-0 sm:z-[1] sm:bg-surface sm:shadow-[inset_0_-1px_0_var(--c-border)]')}>
                    {s && onSort ? (
                      <button type="button" onClick={() => onSort(h.key)} className={cx('inline-flex min-h-8 items-center gap-1 cursor-pointer hover:text-fg', active && 'text-fg')}>
                        {h.label}<span aria-hidden="true" className={cx('text-[10px]', !active && 'opacity-30')}>{active && sort!.dir === 'asc' ? '▲' : '▼'}</span>
                      </button>
                    ) : s ? h.label : h}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-line [&>tr:first-child]:border-t-0 [&_td]:px-4 [&_td]:py-2.5">{children}</tbody>
        </table>
      </div>
      {pager}
    </>
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
