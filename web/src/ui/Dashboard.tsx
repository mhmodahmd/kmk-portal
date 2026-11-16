import { tr } from '../lib/i18n';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { cx } from './cx';

/**
 * مكونات لوحات المعلومات الموحدة لكل الوحدات (docs/02 §8):
 * مؤشر Kpi، شريط مكدّس، أعمدة أفقية بتسميات نصية، أعمدة شهرية لسلسلتين، ومقارنة بفترة سابقة.
 * الألوان من متغيرات الهوية فقط، ولا يُعتمد على اللون وحده: كل سلسلة لها اسم ورقم.
 */
export type KpiTone = 'ok' | 'warn' | 'bad' | 'info';
const KPI_ICON: Record<KpiTone, string> = { bad: 'bg-bad-bg text-bad', warn: 'bg-warn-bg text-warn', ok: 'bg-ok-bg text-ok', info: 'bg-accent-soft text-accent-fg' };

/** مؤشر رئيسي: تسمية، رقم كبير، أيقونة ملوّنة بالحالة، وسطر توضيحي. يصبح رابطاً مع `to` */
export function Kpi({ label, value, icon, foot, to, tone = 'info', strong }: { label: string; value: ReactNode; icon: IconName; foot?: ReactNode; to?: string; tone?: KpiTone; strong?: boolean }) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-2 font-medium leading-tight text-muted"><span className="min-w-0 text-[13px] sm:text-[14px]">{label}</span><span className={cx('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', KPI_ICON[tone])}><Icon name={icon} size={18} /></span></span>
      <span className={cx('text-[28px] font-bold leading-none num', strong && tone === 'bad' && 'text-bad', strong && tone === 'warn' && 'text-warn')}>{value}</span>
      {foot && <span className="mt-auto text-[12px] text-muted">{foot}</span>}
    </>
  );
  const cls = 'flex min-w-0 flex-col gap-2.5 rounded-xl border border-line bg-surface p-4 text-fg no-underline sm:p-5';
  return to ? <Link to={to} className={cx(cls, 'hover:border-line-strong')}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** مقارنة بالفترة السابقة: +3 عن الشهر الماضي */
export function Change({ now, prev, label = tr("عن الشهر الماضي"), invert, format }: { now: number; prev: number; label?: string; invert?: boolean; format?: (n: number) => string }) {
  const diff = now - prev;
  const good = invert ? diff < 0 : diff > 0;
  const txt = diff === 0 ? tr("كالفترة السابقة") : (diff > 0 ? '+' : '−') + (format ? format(Math.abs(diff)) : Math.abs(diff).toLocaleString('en-US')) + ' ' + label;
  return <span className={cx('num', diff !== 0 && (good ? 'text-ok' : 'text-warn'))}>{txt}</span>;
}

/** خلايا صغيرة متلاصقة (إجمالي، نسبة…) */
export function MiniStats({ items }: { items: { label: string; value: ReactNode; sub?: string }[] }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line text-center" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((x) => (
        <div key={x.label} className="flex flex-col gap-0.5 bg-surface px-2 py-2.5">
          <span className="text-[20px] font-bold leading-none num">{x.value}</span>
          <span className="text-[12px] text-muted">{x.label}</span>
          {x.sub && <span className="text-[11px] text-muted">{x.sub}</span>}
        </div>
      ))}
    </div>
  );
}

export interface Segment { key: string; label: string; count: number; className: string }

/** شريط مكدّس مع قائمة نصية بالأعداد والنسب (فلا يُعتمد على اللون وحده) */
export function StackBar({ items, total, label }: { items: Segment[]; total: number; label: string }) {
  return (
    <div className="flex flex-col gap-3">
      {total ? (
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={label}>
          {items.filter((s) => s.count).map((s) => <span key={s.key} title={`${s.label}: ${s.count}`} className={cx('h-full', s.className)} style={{ width: (s.count * 100 / total) + '%' }} />)}
        </div>
      ) : <div className="h-3 rounded-full bg-chip" />}
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {items.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-[13px]">
            <span className={cx('h-2.5 w-2.5 shrink-0 rounded-sm', s.className)} />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="num font-semibold">{s.count}</span>
            <span className="num w-10 text-end text-[12px] text-muted">{total ? Math.round(s.count * 100 / total) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface BarRow { key: string; label: ReactNode; value: number; display?: ReactNode; sub?: ReactNode; tone?: 'accent' | 'ok' | 'warn' | 'bad'; to?: string }
const BAR_TONE = { accent: 'bg-accent', ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad-solid' };

/** أعمدة أفقية بتسميات مباشرة؛ `display` لعرض القيمة بصيغة أخرى (مبلغ، نسبة) */
export function Bars({ rows, max: maxIn, empty = tr("لا بيانات") }: { rows: BarRow[]; max?: number; empty?: string }) {
  if (!rows.length) return <p className="m-0 text-[13px] text-muted">{empty}</p>;
  const max = Math.max(1, maxIn ?? Math.max(...rows.map((r) => r.value)));
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {rows.map((r) => {
        const head = (
          <span className="flex items-center gap-2 text-[13px]">
            <span className="min-w-0 flex-1 truncate">{r.label}</span>
            {r.sub && <span className={cx('text-[12px]', r.tone === 'bad' ? 'font-semibold text-bad' : r.tone === 'warn' ? 'font-semibold text-warn' : 'text-muted')}>{r.sub}</span>}
            <b className="num">{r.display ?? r.value}</b>
          </span>
        );
        return (
          <li key={r.key} className="flex flex-col gap-1">
            {r.to ? <Link to={r.to} className="text-fg no-underline hover:underline">{head}</Link> : head}
            <span className="h-2 overflow-hidden rounded-full bg-chip"><span className={cx('block h-full rounded-full', BAR_TONE[r.tone || 'accent'])} style={{ width: Math.max(2, r.value * 100 / max) + '%' }} /></span>
          </li>
        );
      })}
    </ul>
  );
}

export interface Series { key: string; label: string; color: string }
/** مفتاح السلاسل فوق الرسم */
export function Legend({ series }: { series: Series[] }) {
  return (
    <span className="flex flex-wrap items-center gap-3 text-[12px] text-muted">
      {series.map((s) => <span key={s.key} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
    </span>
  );
}

/**
 * أعمدة زمنية لسلسلة أو سلسلتين (أعمدة متجاورة لكل نقطة)، بتلميح لكل نقطة وتسميات مباشرة انتقائية.
 * `format` لعرض القيم (مبالغ مثلاً).
 */
export function TrendBars({ data, series, labelOf, format, label, height = 150 }: {
  data: Record<string, number | string>[]; series: Series[]; labelOf: (d: Record<string, number | string>) => string; format?: (v: number) => string; label: string; height?: number;
}) {
  const H = height, W = 720, pad = 20, n = Math.max(1, data.length), step = (W - pad * 2) / n;
  const gap = 3, bw = Math.max(5, Math.min(22, (step - 6) / series.length - gap));
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const fmt = format || ((v: number) => v.toLocaleString('en-US'));
  const showLabel = n <= 13;
  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} className="w-full" role="img" aria-label={label}>
      {[0.5, 1].map((f) => <line key={f} x1={pad} x2={W - pad} y1={H - (H - 14) * f} y2={H - (H - 14) * f} stroke="var(--c-border)" strokeDasharray="3 4" />)}
      <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="var(--c-border)" />
      {data.map((d, i) => {
        const x0 = pad + i * step + (step - (bw * series.length + gap * (series.length - 1))) / 2;
        const name = labelOf(d);
        return (
          <g key={String(d.key ?? i)}>
            <rect x={pad + i * step} y={0} width={step} height={H} fill="transparent"><title>{name}: {series.map((s) => `${s.label} ${fmt(Number(d[s.key]) || 0)}`).join(' · ')}</title></rect>
            {series.map((s, j) => {
              const v = Number(d[s.key]) || 0, h = Math.round((v / max) * (H - 14)), x = x0 + j * (bw + gap);
              return (
                <g key={s.key}>
                  <rect x={x} y={H - h} width={bw} height={h} rx={3} fill={v ? s.color : 'var(--c-chip)'} />
                  {v > 0 && showLabel && <text x={x + bw / 2} y={H - h - 4} textAnchor="middle" fontSize="10" fill="var(--c-muted)" className="num">{fmt(v)}</text>}
                </g>
              );
            })}
            {(showLabel || i % 2 === 0) && <text x={pad + i * step + step / 2} y={H + 16} textAnchor="middle" fontSize="10" fill="var(--c-muted)">{name}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** عنوان قسم في اللوحة مع عنصر جانبي */
export function PanelTitle({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="m-0 text-[16px] font-semibold">{title}</h2>{action}</div>;
}
