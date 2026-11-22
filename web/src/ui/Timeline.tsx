/**
 * الخط العمودي للمراحل (docs/09 القسم 3.4): نقطة لكل مرحلة على خط عمودي، وتفاصيلها بجانبها.
 * يُستخدم تحت كل طلب في النظام: سلسلة إجرائية أو مسار مدمج. Timeline كامل، وTimelineMini للقوائم،
 * وRequestSteps يجمعهما لطلبات الوحدات (المصغّر، ويفتح الكامل أو صفحة السلسلة).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { tr } from '../lib/i18n';
import { formatDateTime, relativeTime } from '../lib/format';
import { Badge } from './Display';
import { Icon } from './Icon';
import { cx } from './cx';

export type TlStatus = 'pending' | 'current' | 'done' | 'rejected' | 'returned' | 'skipped' | 'cancelled';
export interface TlStep {
  key?: string; name: string; status: TlStatus; kindLabel?: string; assignees?: string[]; actorName?: string; at?: string; note?: string;
  onBehalfOf?: string; dueAt?: string; overdue?: boolean; parallel?: boolean; progress?: string; fallback?: boolean; asking?: boolean;
}

const LABEL: Record<TlStatus, string> = { pending: tr("لم تبدأ"), current: tr("بانتظار القرار"), done: tr("مكتملة"), rejected: tr("مرفوضة"), returned: tr("معادة للتعديل"), skipped: tr("متخطاة"), cancelled: tr("ملغاة") };
const TONE: Record<TlStatus, 'neutral' | 'info' | 'warn' | 'ok' | 'bad'> = { pending: 'neutral', current: 'info', done: 'ok', rejected: 'bad', returned: 'warn', skipped: 'neutral', cancelled: 'neutral' };

function Dot({ s, small }: { s: TlStep | { status: TlStatus; overdue?: boolean }; small?: boolean }) {
  const size = small ? 'h-2.5 w-2.5' : 'h-6 w-6';
  const cls = s.status === 'done' ? 'bg-ok text-bg' : s.status === 'current' ? (s.overdue ? 'bg-bad text-bg' : 'bg-accent text-bg') : s.status === 'rejected' ? 'bg-bad text-bg'
    : s.status === 'returned' ? 'bg-warn text-bg' : 'border-2 border-line-strong bg-surface text-muted';
  return (
    <span className={cx('relative z-[1] flex shrink-0 items-center justify-center rounded-full', size, cls, s.status === 'current' && !small && 'ring-4 ring-accent-soft')}>
      {!small && (s.status === 'done' ? <Icon name="check" size={14} /> : s.status === 'rejected' ? <Icon name="x" size={14} /> : s.status === 'returned' ? <Icon name="refresh" size={12} /> : null)}
    </span>
  );
}

/** الخط الكامل: نقطة لكل مرحلة، والخط بعد المكتملة متصل وأخضر، وإلى ما لم يبدأ متقطع */
export function Timeline({ steps, start }: { steps: TlStep[]; start?: { by: string; at: string } }) {
  const all: TlStep[] = start ? [{ key: '_start', name: tr("تقديم الطلب"), status: 'done', actorName: start.by, at: start.at }, ...steps] : steps;
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {all.map((s, i) => {
        const next = all[i + 1];
        const solid = s.status === 'done' || s.status === 'skipped';
        const faded = s.status === 'skipped' || s.status === 'cancelled';
        return (
          <li key={s.key || s.name + i} className="relative flex gap-3 pb-4 last:pb-0">
            {next && <span aria-hidden="true" className={cx('absolute start-[11px] top-7 bottom-0 w-0', solid ? 'border-s-2 border-ok' : 'border-s-2 border-dashed border-line-strong')} />}
            <Dot s={s} />
            <div className={cx('flex min-w-0 flex-1 flex-col gap-0.5', faded && 'opacity-60')}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cx('font-semibold', s.status === 'skipped' && 'line-through')}>{s.name}</span>
                {s.key !== '_start' && <Badge tone={s.status === 'current' && s.overdue ? 'bad' : TONE[s.status]}>{s.asking ? tr("بانتظار إيضاح") : s.status === 'current' && s.overdue ? tr("متأخرة") : LABEL[s.status]}</Badge>}
                {s.parallel && <span className="text-[11px] text-muted">{tr("بالتوازي")}</span>}
                {s.progress && <span className="num text-[11px] text-muted">{s.progress}</span>}
              </div>
              {(s.kindLabel || (s.assignees && s.assignees.length)) && s.status !== 'done' && s.key !== '_start' && (
                <span className="text-[12px] text-muted">{[s.kindLabel, (s.assignees || []).join('، ')].filter(Boolean).join(' · ')}{s.fallback ? ' · ' + tr("بديل") : ''}</span>
              )}
              {(s.actorName || s.at) && (s.status !== 'current' && s.status !== 'pending') && (
                <span className="text-[12px] text-muted">
                  {s.actorName}{s.onBehalfOf ? ' ' + tr("نيابةً عن {0}", s.onBehalfOf) : ''}{s.at ? <span className="num" title={formatDateTime(s.at)}>{s.actorName ? ' · ' : ''}{formatDateTime(s.at)}</span> : null}
                </span>
              )}
              {s.status === 'current' && s.dueAt && <span className={cx('num text-[12px]', s.overdue ? 'font-semibold text-bad' : 'text-muted')}>{s.overdue ? tr("متأخرة منذ {0}", relativeTime(s.dueAt)) : tr("الموعد {0}", formatDateTime(s.dueAt))}</span>}
              {s.note && <span className="mt-0.5 rounded-md bg-chip px-2 py-1 text-[13px] leading-relaxed">«{s.note}»</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** نسخة مصغّرة للقوائم: نقاط عمودية صغيرة بخط رفيع، واسم المرحلة الحالية بجانبها */
export function TimelineMini({ statuses, label, overdue }: { statuses: TlStatus[]; label?: string; overdue?: boolean }) {
  if (!statuses.length) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex flex-col items-center" aria-hidden="true">
        {statuses.map((st, i) => (
          <span key={i} className="flex flex-col items-center">
            {i > 0 && <span className={cx('h-1.5 w-px', statuses[i - 1] === 'done' || statuses[i - 1] === 'skipped' ? 'bg-ok' : 'bg-line-strong')} />}
            <Dot s={{ status: st, overdue: st === 'current' && overdue }} small />
          </span>
        ))}
      </span>
      {label && <span className={cx('text-[12px]', overdue ? 'font-semibold text-bad' : 'text-muted')}>{label}</span>}
    </span>
  );
}

/** ملخص سلسلة لطلب من الخادم (Workflow.summary__) */
export interface ChainBrief { instanceId: string; status: string; statusLabel: string; stepName: string; assigneeNames: string[]; asking: boolean; overdue?: boolean; dots: TlStatus[]; done: number; total: number }

/**
 * مراحل طلب وحدة: إن كان في سلسلة فالمصغّر ورابط صفحة السلسلة، وإلا مراحل مساره المدمج (مصغّرة، وتنفتح خطاً كاملاً).
 */
export function RequestSteps({ wf, steps }: { wf?: ChainBrief | null; steps?: TlStep[] }) {
  const [open, setOpen] = useState(false);
  if (wf) {
    const live = wf.status === 'running' || wf.status === 'returned';
    const label = live ? [wf.stepName, wf.assigneeNames.join('، '), wf.asking ? tr("بانتظار إيضاح") : ''].filter(Boolean).join(' · ') : wf.statusLabel;
    return (
      <span className="mt-1 flex flex-wrap items-center gap-3">
        <TimelineMini statuses={wf.dots} label={label} overdue={wf.overdue} />
        <Link to={'/chain/' + wf.instanceId} className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-fg no-underline"><Icon name="history" size={12} />{tr("عرض السلسلة")}</Link>
      </span>
    );
  }
  if (!steps || !steps.length) return null;
  const cur = steps.find((s) => s.status === 'current');
  return (
    <span className="mt-1 flex flex-col gap-2">
      <span className="flex flex-wrap items-center gap-3">
        <TimelineMini statuses={steps.map((s) => s.status)} label={cur ? [cur.name, (cur.assignees || []).join('، ')].filter(Boolean).join(' · ') : undefined} />
        <button type="button" aria-expanded={open} onClick={() => setOpen((x) => !x)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-fg cursor-pointer">
          {open ? tr("إخفاء المراحل") : tr("المراحل")}<Icon name="chevronDown" size={12} className={cx('transition-transform', open && 'rotate-180')} />
        </button>
      </span>
      {open && <span className="block rounded-lg border border-line p-3"><Timeline steps={steps} /></span>}
    </span>
  );
}
