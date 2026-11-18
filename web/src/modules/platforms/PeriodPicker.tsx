import { useState } from 'react';
import { tr } from '../../lib/i18n';
import { kwDate, monthLabel, shiftMonth } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';

/** مفتاح الفترة كما يفهمه الخادم: «2026» سنة كاملة، أو «2026-10»، أو أشهر مفصولة بفواصل */
export function periodMonths(key: string): string[] {
  const out = new Set<string>();
  key.split(',').map((x) => x.trim()).filter(Boolean).forEach((x) => {
    if (/^\d{4}$/.test(x)) for (let i = 1; i <= 12; i++) out.add(x + '-' + String(i).padStart(2, '0'));
    else if (/^\d{4}-\d{2}$/.test(x)) out.add(x);
  });
  return [...out].sort();
}

export function periodKey(months: string[]): string {
  const list = [...new Set(months)].sort();
  const y = list[0]?.slice(0, 4);
  if (list.length === 12 && list.every((m) => m.slice(0, 4) === y)) return y;
  return list.join(',');
}

const shortMonth = (m: string) => monthLabel(m).replace(/ \d{4}$/, '');
const spanOf = (list: string[]) => {
  const n = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5));
  return n(list[list.length - 1]) - n(list[0]) + 1;
};

/** اسم الفترة: «سنة 2026»، «أكتوبر 2026»، «يوليو – سبتمبر 2026»، «3 أشهر من 2026» */
export function periodLabel(key: string): string {
  if (/^\d{4}$/.test(key)) return tr("سنة {0}", key);
  const list = periodMonths(key);
  if (!list.length) return '';
  if (list.length === 1) return monthLabel(list[0]);
  const first = list[0], last = list[list.length - 1], sameYear = first.slice(0, 4) === last.slice(0, 4);
  if (spanOf(list) === list.length) return sameYear ? `${shortMonth(first)} – ${shortMonth(last)} ${first.slice(0, 4)}` : `${monthLabel(first)} – ${monthLabel(last)}`;
  return sameYear ? tr("{0} أشهر من {1}", list.length, first.slice(0, 4)) : tr("{0} أشهر", list.length);
}

/**
 * اختيار الفترة: السهمان ينقلان الفترة كلها (الشهر بالشهر، والسنة بالسنة)،
 * والضغط على الاسم يفتح قائمة الأشهر للاختيار من متعدد أو السنة كاملة.
 * withData: الأشهر التي فيها مبيعات (تُميَّز في القائمة)
 */
export function PeriodPicker({ value, onChange, withData }: { value: string; onChange: (key: string) => void; withData: string[] }) {
  const [open, setOpen] = useState(false);
  const list = periodMonths(value);
  const now = kwDate().slice(0, 7);
  const span = list.length ? spanOf(list) : 1;
  const shift = (d: number) => periodKey(list.map((m) => shiftMonth(m, d * span)));
  const canNext = list.length > 0 && shiftMonth(list[0], span) <= now;
  const btn = 'inline-flex h-11 w-11 sm:h-10 sm:w-10 items-center justify-center rounded-lg border border-line bg-surface hover:border-line-strong cursor-pointer disabled:opacity-40 disabled:cursor-default';
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={btn} aria-label={tr("الفترة السابقة")} onClick={() => onChange(shift(-1))}><Icon name="chevron" className="rotate-180" /></button>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className="inline-flex h-11 min-w-[150px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 font-semibold text-fg hover:border-line-strong sm:h-10">
        <Icon name="calendar" size={16} />{periodLabel(value)}
      </button>
      <button type="button" className={btn} aria-label={tr("الفترة التالية")} disabled={!canNext} onClick={() => onChange(shift(1))}><Icon name="chevron" /></button>
      {open && <PeriodDialog initial={list} withData={withData} onClose={() => setOpen(false)} onApply={(k) => { onChange(k); setOpen(false); }} />}
    </div>
  );
}

function PeriodDialog({ initial, withData, onClose, onApply }: { initial: string[]; withData: string[]; onClose: () => void; onApply: (key: string) => void }) {
  const now = kwDate().slice(0, 7);
  const years = [...new Set([...withData, ...initial, now].map((m) => m.slice(0, 4)))].sort().reverse();
  const [year, setYear] = useState(initial[initial.length - 1]?.slice(0, 4) || now.slice(0, 4));
  const [sel, setSel] = useState<Set<string>>(new Set(initial));
  const has = new Set(withData);
  const months = Array.from({ length: 12 }, (_, i) => year + '-' + String(i + 1).padStart(2, '0'));
  const selectable = months.filter((m) => m <= now);
  const wholeYear = selectable.length > 0 && selectable.every((m) => sel.has(m)) && months.every((m) => m <= now || !sel.has(m));
  const toggle = (m: string) => { const n = new Set(sel); if (n.has(m)) n.delete(m); else n.add(m); setSel(n); };
  const setYearAll = (on: boolean) => { const n = new Set(sel); months.forEach((m) => (on && m <= now ? n.add(m) : n.delete(m))); setSel(n); };
  const picked = [...sel].sort();
  // السنة كلها مختارة (حتى الشهر الحالي) ولا شيء غيرها: تُرسل «سنة» لتُقارن بالسنة السابقة كاملة
  const onlyYear = wholeYear && picked.every((m) => m.slice(0, 4) === year);
  const apply = () => onApply(onlyYear ? year : periodKey(picked));
  return (
    <Dialog open onClose={onClose} title={tr("اختيار الفترة")}
      footer={<>
        <Button variant="primary" className="flex-1" disabled={!picked.length} onClick={apply}>{picked.length ? tr("عرض {0}", onlyYear ? tr("سنة {0}", year) : periodLabel(periodKey(picked))) : tr("اختر شهراً على الأقل")}</Button>
        <Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button>
      </>}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={tr("السنة")}>
          {years.map((y) => (
            <button key={y} type="button" aria-pressed={y === year} onClick={() => setYear(y)}
              className={'num h-9 cursor-pointer rounded-full border px-3.5 text-[14px] font-semibold ' + (y === year ? 'border-fg bg-fg text-bg' : 'border-line bg-surface text-fg hover:border-line-strong')}>{y}</button>
          ))}
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg bg-chip px-3 font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-[var(--c-accent)]" checked={wholeYear} disabled={!selectable.length} onChange={(e) => setYearAll(e.target.checked)} />
          {tr("السنة كاملة · {0}", year)}
        </label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label={tr("الأشهر")}>
          {months.map((m) => {
            const on = sel.has(m), future = m > now;
            return (
              <button key={m} type="button" aria-pressed={on} disabled={future} onClick={() => toggle(m)}
                className={'relative flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border text-[14px] disabled:cursor-default disabled:opacity-40 '
                  + (on ? 'border-accent bg-accent text-on-accent font-semibold' : 'border-line bg-surface text-fg hover:border-line-strong')}>
                {on && <Icon name="check" size={14} />}{shortMonth(m)}
                {has.has(m) && !on && <span aria-hidden className="absolute end-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />{tr("شهر فيه مبيعات مستوردة")}</span>
          {picked.length > 0 && <span>{picked.length === 1 ? tr("المختار: شهر واحد") : tr("المختار: {0} شهراً", picked.length)} · <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-semibold text-accent-fg" onClick={() => setSel(new Set())}>{tr("مسح")}</button></span>}
        </div>
      </div>
    </Dialog>
  );
}
