import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { dmy, monthLabel } from '../../lib/format';
import { Card, CardHeader, EmptyState, ErrorBox, Skeleton } from '../../ui/Display';
import { Icon, type IconName } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import { DirectionMark, DueText, LetterLine, StatusBadge } from './shared';
import type { CorDashboard, LetterStatus, LetterView } from './types';

/** لوحة المراسلات: المؤشرات، الاتجاه الشهري، التوزيعات، ما يحتاج متابعة */
export default function CorDashboardPage() {
  const q = useApi<CorDashboard>('cor.dashboard', {}, { staleTime: 30_000 });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const d = q.data;
  if (!d) {
    return (
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        {[0, 1, 2, 3].map((i) => <Card key={i} className="flex flex-col gap-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-16" /><Skeleton className="h-3 w-32" /></Card>)}
      </div>
    );
  }
  const k = d.kpis;
  const monthTotal = k.monthIn + k.monthOut, prevTotal = k.prevIn + k.prevOut;
  const maxMonth = Math.max(1, ...d.byMonth.map((x) => Math.max(x.in, x.out)));
  return (
    <div className="flex flex-col gap-4">
      {d.scope === 'mine' && <p className="m-0 text-[13px] text-muted">{tr("تعرض اللوحة ما سجّلته أو أُحيل إليك. مدير المراسلات يرى الكل.")}</p>}

      {/* المؤشرات الرئيسية */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={tr("بانتظار الرد")} value={k.open} icon="mail" to="/correspondence/in"
          foot={tr("{0} وارد ينتظر ردّنا · {1} صادر ينتظر رد الجهة", k.awaitingReply, k.awaitingParty)} />
        <Kpi label={tr("متأخرة عن موعد الرد")} value={k.overdue} icon="alert" tone={k.overdue ? 'bad' : 'ok'} to="/correspondence/in?status=overdue"
          foot={k.overdue ? tr("تحتاج متابعة الآن") : tr("لا تأخير")} />
        <Kpi label={tr("تحين خلال أسبوع")} value={k.dueSoon} icon="clock" tone={k.dueSoon ? 'warn' : undefined} foot={k.noDue ? tr("و{0} بلا موعد رد", k.noDue) : tr("كل المفتوح له موعد")} />
        <Kpi label={tr("هذا الشهر")} value={monthTotal} icon="calendar" foot={<Change now={monthTotal} prev={prevTotal} detail={tr("{0} وارد · {1} صادر", k.monthIn, k.monthOut)} />} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        {/* الاتجاه الشهري */}
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-[16px] font-semibold">{tr("الصادر والوارد · آخر 12 شهراً")}</h2>
            <span className="flex items-center gap-3 text-[12px] text-muted">
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-ok" />{tr("وارد")}</span>
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-accent" />{tr("صادر")}</span>
            </span>
          </div>
          {k.total === 0 ? <EmptyState title={tr("لا خطابات بعد")} body={tr("سجّل أول خطاب من الأزرار أعلى الصفحة.")} /> : <TrendBars data={d.byMonth} max={maxMonth} />}
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line text-center">
            <Mini label={tr("الإجمالي")} value={k.total} />
            <Mini label={tr("مؤرشفة")} value={k.archived} />
            <Mini label={tr("متوسط أيام الرد")} value={k.avgReplyDays === null ? '—' : k.avgReplyDays} sub={k.repliedCount ? tr("على {0} خطاباً وارداً", k.repliedCount) : tr("لا ردود مسجلة بعد")} />
          </div>
        </Card>

        {/* الحالات */}
        <Card className="flex flex-col gap-3">
          <h2 className="m-0 text-[16px] font-semibold">{tr("توزيع الحالات")}</h2>
          <StatusStack items={d.byStatus} total={k.total} />
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {d.byStatus.map((s) => (
              <li key={s.status} className="flex items-center gap-2 text-[13px]">
                <span className={cx('h-2.5 w-2.5 shrink-0 rounded-sm', STATUS_BG[s.status])} />
                <span className="flex-1">{s.label}</span>
                <span className="num font-semibold">{s.count}</span>
                <span className="num w-10 text-end text-[12px] text-muted">{k.total ? Math.round(s.count * 100 / k.total) : 0}%</span>
              </li>
            ))}
          </ul>
          {k.drafts > 0 && <Link to="/correspondence/out" className="text-[13px] font-semibold text-accent-fg no-underline">{tr("{0} مسودة صادرة لم تُرسل بعد", k.drafts)}</Link>}
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card padded={false}>
          <CardHeader title={tr("متأخرة عن موعد الرد · {0}", k.overdue)} action={k.overdue > 8 ? <Link to="/correspondence/in?status=overdue" className="text-[13px] font-semibold text-accent-fg no-underline">{tr("عرض الكل")}</Link> : undefined} />
          {d.overdue.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا خطابات متأخرة.")}</p> : d.overdue.map((l) => <LetterLine key={l.id} l={l} />)}
        </Card>
        <Card padded={false}>
          <CardHeader title={tr("تحين خلال أسبوع · {0}", k.dueSoon)} />
          {d.dueSoon.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا مواعيد قريبة.")}</p> : d.dueSoon.map((l) => <LetterLine key={l.id} l={l} />)}
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-3">
          <h2 className="m-0 text-[16px] font-semibold">{tr("أكثر الجهات مراسلة")}</h2>
          {d.topParties.length === 0 ? <p className="m-0 text-[13px] text-muted">{tr("لا بيانات")}</p> : <Bars rows={d.topParties.map((p) => ({ key: p.party, label: p.party, value: p.count, sub: p.open ? tr("{0} مفتوح", p.open) : '' }))} />}
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="m-0 text-[16px] font-semibold">{tr("حسب التصنيف")}</h2>
          {d.byCategory.length === 0 ? <p className="m-0 text-[13px] text-muted">{tr("لا بيانات")}</p> : <Bars rows={d.byCategory.map((c) => ({ key: c.category, label: c.category, value: c.count }))} />}
          {d.byChannel.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
              {d.byChannel.map((c) => <span key={c.channel} className="inline-flex items-center gap-1 rounded-full bg-chip px-2.5 py-1 text-[12px]">{c.label}<b className="num">{c.count}</b></span>)}
            </div>
          )}
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="m-0 text-[16px] font-semibold">{d.scope === 'all' ? tr("أحمال المسؤولين") : tr("المفتوح لديك")}</h2>
          {d.byAssignee.length === 0 ? <p className="m-0 text-[13px] text-muted">{tr("لا خطابات مفتوحة")}</p> : (
            <Bars rows={d.byAssignee.map((a) => ({ key: a.id, label: a.name, value: a.open, sub: a.overdue ? tr("{0} متأخرة", a.overdue) : '', bad: a.overdue > 0 }))} />
          )}
        </Card>
      </div>

      <Card padded={false}>
        <CardHeader title={tr("آخر ما سُجّل")} action={<Link to="/correspondence/in" className="text-[13px] font-semibold text-accent-fg no-underline">{tr("الوارد")}</Link>} />
        {d.recent.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا خطابات بعد")}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-right">
              <tbody className="[&>tr]:border-t [&>tr]:border-line [&_td]:px-4 [&_td]:py-2.5">
                {d.recent.map((l: LetterView) => (
                  <tr key={l.id} className="hover:bg-chip/40">
                    <td className="whitespace-nowrap"><DirectionMark l={l} short /> <span className="num text-[13px]">{l.number}</span></td>
                    <td><Link to={'/correspondence/' + l.id} className="font-semibold text-fg no-underline">{l.subject}</Link><div className="text-[12px] text-muted">{l.party}{l.category ? ' · ' + l.category : ''}</div></td>
                    <td className="num whitespace-nowrap text-[13px]">{dmy(l.date)}</td>
                    <td className="text-[13px]">{l.assigneeName}</td>
                    <td><StatusBadge l={l} /></td>
                    <td className="whitespace-nowrap"><DueText l={l} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

const STATUS_BG: Record<LetterStatus, string> = { draft: 'bg-line-strong', sent: 'bg-accent', received: 'bg-warn', replied: 'bg-ok', archived: 'bg-chip' };

function Kpi({ label, value, icon, foot, to, tone }: { label: string; value: number; icon: IconName; foot?: ReactNode; to?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const body = (
    <>
      <span className="flex items-center justify-between font-medium text-muted">{label}<span className={cx('inline-flex h-9 w-9 items-center justify-center rounded-lg', tone === 'bad' ? 'bg-bad-bg text-bad' : tone === 'warn' ? 'bg-warn-bg text-warn' : tone === 'ok' ? 'bg-ok-bg text-ok' : 'bg-accent-soft text-accent-fg')}><Icon name={icon} size={18} /></span></span>
      <span className={cx('text-[30px] font-bold leading-none num', tone === 'bad' && value > 0 && 'text-bad')}>{value}</span>
      {foot && <span className="mt-auto text-[12px] text-muted">{foot}</span>}
    </>
  );
  const cls = 'flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-5 text-fg no-underline';
  return to ? <Link to={to} className={cx(cls, 'hover:border-line-strong')}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Change({ now, prev, detail }: { now: number; prev: number; detail: string }) {
  const diff = now - prev;
  const txt = prev === 0 && now === 0 ? tr("كالشهر الماضي") : prev === 0 ? tr("لا خطابات الشهر الماضي") : diff === 0 ? tr("كالشهر الماضي") : diff > 0 ? tr("+{0} عن الشهر الماضي", diff) : tr("−{0} عن الشهر الماضي", -diff);
  return <span>{detail} · <span className={cx(diff > 0 ? 'text-ok' : diff < 0 ? 'text-warn' : '')}>{txt}</span></span>;
}

function Mini({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-surface px-3 py-2.5">
      <span className="text-[20px] font-bold leading-none num">{value}</span>
      <span className="text-[12px] text-muted">{label}</span>
      {sub && <span className="text-[11px] text-muted">{sub}</span>}
    </div>
  );
}

/** شريط مكدّس للحالات (مع قائمة نصية أسفله فلا يُعتمد على اللون وحده) */
function StatusStack({ items, total }: { items: { status: LetterStatus; label: string; count: number }[]; total: number }) {
  if (!total) return <div className="h-3 rounded-full bg-chip" />;
  return (
    <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={tr("توزيع الحالات")}>
      {items.filter((s) => s.count).map((s) => <span key={s.status} title={`${s.label}: ${s.count}`} className={cx('h-full', STATUS_BG[s.status])} style={{ width: (s.count * 100 / total) + '%' }} />)}
    </div>
  );
}

/** أعمدة أفقية بتسميات نصية مباشرة */
function Bars({ rows }: { rows: { key: string; label: string; value: number; sub?: string; bad?: boolean }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-[13px]"><span className="min-w-0 flex-1 truncate">{r.label}</span>{r.sub && <span className={cx('text-[12px]', r.bad ? 'font-semibold text-bad' : 'text-muted')}>{r.sub}</span>}<b className="num">{r.value}</b></span>
          <span className="h-2 overflow-hidden rounded-full bg-chip"><span className={cx('block h-full rounded-full', r.bad ? 'bg-warn' : 'bg-accent')} style={{ width: Math.max(3, r.value * 100 / max) + '%' }} /></span>
        </li>
      ))}
    </ul>
  );
}

/** أعمدة شهرية مزدوجة لآخر 12 شهراً، مع تلميح لكل عمود */
function TrendBars({ data, max }: { data: { month: string; in: number; out: number }[]; max: number }) {
  const W = 720, H = 150, pad = 20, step = (W - pad * 2) / data.length, bw = Math.max(6, Math.min(18, step / 2 - 4));
  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} className="w-full" role="img" aria-label={tr("الصادر والوارد · آخر 12 شهراً")}>
      {[0.5, 1].map((f) => <line key={f} x1={pad} x2={W - pad} y1={H - (H - 12) * f} y2={H - (H - 12) * f} stroke="var(--c-border)" strokeDasharray="3 4" />)}
      <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="var(--c-border)" />
      {data.map((d, i) => {
        const x = pad + i * step + (step - bw * 2 - 3) / 2;
        const hi = Math.round((d.in / max) * (H - 12)), ho = Math.round((d.out / max) * (H - 12));
        const label = monthLabel(d.month);
        return (
          <g key={d.month}>
            <rect x={pad + i * step} y={0} width={step} height={H} fill="transparent"><title>{label}: {tr("وارد")} {d.in} · {tr("صادر")} {d.out}</title></rect>
            <rect x={x} y={H - hi} width={bw} height={hi} rx={3} fill={d.in ? 'var(--c-ok)' : 'var(--c-chip)'} />
            <rect x={x + bw + 3} y={H - ho} width={bw} height={ho} rx={3} fill={d.out ? 'var(--c-accent)' : 'var(--c-chip)'} />
            {d.in > 0 && <text x={x + bw / 2} y={H - hi - 4} textAnchor="middle" fontSize="10" fill="var(--c-muted)" className="num">{d.in}</text>}
            {d.out > 0 && <text x={x + bw * 1.5 + 3} y={H - ho - 4} textAnchor="middle" fontSize="10" fill="var(--c-muted)" className="num">{d.out}</text>}
            <text x={x + bw + 1.5} y={H + 16} textAnchor="middle" fontSize="10" fill="var(--c-muted)">{label.replace(/ \d{4}$/, '').slice(0, 6)}</text>
            {(i === 0 || d.month.endsWith('-01')) && <text x={x + bw + 1.5} y={H + 28} textAnchor="middle" fontSize="9" fill="var(--c-muted)" className="num">{d.month.slice(0, 4)}</text>}
          </g>
        );
      })}
    </svg>
  );
}
