import { Link } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { dmy, monthLabel } from '../../lib/format';
import { Card, CardHeader, EmptyState, ErrorBox, Skeleton } from '../../ui/Display';
import { Bars, Change, Kpi, Legend, MiniStats, PanelTitle, StackBar, TrendBars } from '../../ui/Dashboard';
import { DirectionMark, DueText, LetterLine, StatusBadge } from './shared';
import type { CorDashboard, LetterStatus, LetterView } from './types';

const STATUS_BG: Record<LetterStatus, string> = {
  draft: 'bg-line-strong', in_review: 'bg-accent-soft', returned: 'bg-warn-bg', approved: 'bg-ok-bg', rejected: 'bg-bad', sent: 'bg-accent', received: 'bg-warn', replied: 'bg-ok', archived: 'bg-chip'
};
const SERIES = [{ key: 'in', label: tr("وارد"), color: 'var(--c-ok)' }, { key: 'out', label: tr("صادر"), color: 'var(--c-accent)' }];

/** لوحة المراسلات: المؤشرات، الاتجاه الشهري، التوزيعات، ما يحتاج متابعة */
export default function CorDashboardPage() {
  const q = useApi<CorDashboard>('cor.dashboard', {}, { staleTime: 30_000 });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const d = q.data;
  if (!d) return <DashboardSkeleton />;
  const k = d.kpis;
  const monthTotal = k.monthIn + k.monthOut, prevTotal = k.prevIn + k.prevOut;
  return (
    <div className="flex flex-col gap-4">
      {d.scope === 'mine' && <p className="m-0 text-[13px] text-muted">{tr("تعرض اللوحة ما سجّلته أو أُحيل إليك. مدير المراسلات يرى الكل.")}</p>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={tr("بانتظار الرد")} value={k.open} icon="mail" to="/correspondence/in" foot={tr("{0} وارد ينتظر ردّنا · {1} صادر ينتظر رد الجهة", k.awaitingReply, k.awaitingParty)} />
        <Kpi label={tr("متأخرة عن موعد الرد")} value={k.overdue} icon="alert" tone={k.overdue ? 'bad' : 'ok'} strong to="/correspondence/in?status=overdue" foot={k.overdue ? tr("تحتاج متابعة الآن") : tr("لا تأخير")} />
        <Kpi label={tr("تحين خلال أسبوع")} value={k.dueSoon} icon="clock" tone={k.dueSoon ? 'warn' : 'info'} foot={k.noDue ? tr("و{0} بلا موعد رد", k.noDue) : tr("كل المفتوح له موعد")} />
        <Kpi label={tr("هذا الشهر")} value={monthTotal} icon="calendar" foot={<>{tr("{0} وارد · {1} صادر", k.monthIn, k.monthOut)} · <Change now={monthTotal} prev={prevTotal} /></>} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <Card className="flex flex-col gap-3">
          <PanelTitle title={tr("الصادر والوارد · آخر 12 شهراً")} action={<Legend series={SERIES} />} />
          {k.total === 0 ? <EmptyState title={tr("لا خطابات بعد")} body={tr("سجّل أول خطاب من الأزرار أعلى الصفحة.")} /> : (
            <TrendBars data={d.byMonth} series={SERIES} labelOf={(x) => monthLabel(String(x.month)).replace(/ \d{4}$/, '')} label={tr("الصادر والوارد · آخر 12 شهراً")} />
          )}
          <MiniStats items={[
            { label: tr("الإجمالي"), value: k.total }, { label: tr("مؤرشفة"), value: k.archived },
            { label: tr("متوسط أيام الرد"), value: k.avgReplyDays === null ? '—' : k.avgReplyDays, sub: k.repliedCount ? tr("على {0} خطاباً وارداً", k.repliedCount) : tr("لا ردود مسجلة بعد") }
          ]} />
        </Card>
        <Card className="flex flex-col gap-3">
          <PanelTitle title={tr("توزيع الحالات")} />
          <StackBar label={tr("توزيع الحالات")} total={k.total} items={d.byStatus.map((s) => ({ key: s.status, label: s.label, count: s.count, className: STATUS_BG[s.status] }))} />
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
          <PanelTitle title={tr("أكثر الجهات مراسلة")} />
          <Bars rows={d.topParties.map((p) => ({ key: p.party, label: p.party, value: p.count, sub: p.open ? tr("{0} مفتوح", p.open) : '' }))} />
        </Card>
        <Card className="flex flex-col gap-3">
          <PanelTitle title={tr("حسب التصنيف")} />
          <Bars rows={d.byCategory.map((c) => ({ key: c.category, label: c.category, value: c.count }))} />
          {d.byChannel.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
              {d.byChannel.map((c) => <span key={c.channel} className="inline-flex items-center gap-1 rounded-full bg-chip px-2.5 py-1 text-[12px]">{c.label}<b className="num">{c.count}</b></span>)}
            </div>
          )}
        </Card>
        <Card className="flex flex-col gap-3">
          <PanelTitle title={d.scope === 'all' ? tr("أحمال المسؤولين") : tr("المفتوح لديك")} />
          <Bars empty={tr("لا خطابات مفتوحة")} rows={d.byAssignee.map((a) => ({ key: a.id, label: a.name, value: a.open, sub: a.overdue ? tr("{0} متأخرة", a.overdue) : '', tone: a.overdue > 0 ? 'bad' : 'accent' }))} />
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

/** هيكل التحميل الموحد للوحات */
export function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => <Card key={i} className="flex flex-col gap-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-16" /><Skeleton className="h-3 w-32" /></Card>)}
    </div>
  );
}
