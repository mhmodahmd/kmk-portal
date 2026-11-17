import { Link } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { Card, CardHeader, ErrorBox } from '../../ui/Display';
import { Bars, Kpi, Legend, MiniStats, PanelTitle, StackBar, TrendBars } from '../../ui/Dashboard';
import { DashboardSkeleton } from '../correspondence/CorDashboardPage';
import { TaskRow, useTaskLookups, useToggleDone } from './shared';
import { browseLink } from './TasksPages';
import type { Priority, TaskStatus, TaskView } from './types';

interface TskDashboard {
  today: string; scope: 'all' | 'team' | 'mine';
  kpis: { open: number; overdue: number; dueWeek: number; dueToday: number; noDue: number; review: number; urgent: number; done30: number; created30: number; total: number; completionRate: number | null; onTimeRate: number | null; mine: number };
  byStatus: { status: TaskStatus; label: string; count: number }[]; byPriority: { priority: Priority; label: string; count: number }[];
  byAssignee: { id: string; name: string; open: number; overdue: number }[]; byProject: { id: string; name: string; open: number }[];
  weekly: { week: string; label: string; created: number; done: number }[]; overdue: TaskView[]; dueSoon: TaskView[];
}

const STATUS_BG: Record<TaskStatus, string> = { todo: 'bg-line-strong', doing: 'bg-accent', review: 'bg-warn', done: 'bg-ok', cancelled: 'bg-chip' };
const PRIORITY_BG: Record<Priority, string> = { urgent: 'bg-bad-solid', high: 'bg-warn', normal: 'bg-accent', low: 'bg-line-strong' };
const SERIES = [{ key: 'created', label: tr("أُنشئت"), color: 'var(--c-accent)' }, { key: 'done', label: tr("أُنجزت"), color: 'var(--c-ok)' }];

/** لوحة المهام: المفتوح والمتأخر والإنجاز، الاتجاه الأسبوعي، التوزيع بالحالة والأولوية والمسؤول والمشروع */
export default function TasksOverviewPage() {
  const q = useApi<TskDashboard>('tsk.dashboard', {}, { staleTime: 30_000 });
  const lk = useTaskLookups();
  const toggle = useToggleDone();
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const d = q.data;
  if (!d) return <DashboardSkeleton />;
  const k = d.kpis, openTotal = d.byPriority.reduce((a, x) => a + x.count, 0);
  const pct = (v: number | null) => (v === null ? '—' : v + '%');
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[13px] text-muted">{d.scope === 'all' ? tr("كل مهام الشركة (مدير المهام).") : d.scope === 'team' ? tr("مهامك ومهام فريقك وما تتابعه.") : tr("مهامك وما تتابعه.")}</p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={tr("مهام مفتوحة")} value={k.open} icon="tasks" to={browseLink({ status: 'open' })} foot={tr("{0} مسندة إليك · {1} بلا موعد", k.mine, k.noDue)} />
        <Kpi label={tr("متأخرة")} value={k.overdue} icon="alert" tone={k.overdue ? 'bad' : 'ok'} strong to={browseLink({ due: 'overdue' })} foot={k.dueToday ? tr("و{0} موعدها اليوم", k.dueToday) : tr("لا مهام موعدها اليوم")} />
        <Kpi label={tr("تحين خلال أسبوع")} value={k.dueWeek} icon="calendar" tone={k.dueWeek ? 'warn' : 'info'} to={browseLink({ due: 'week' })} foot={tr("{0} عاجلة أو مرتفعة · {1} بانتظار مراجعة", k.urgent, k.review)} />
        <Kpi label={tr("نسبة الإنجاز · 30 يوماً")} value={pct(k.completionRate)} icon="check" tone={k.completionRate !== null && k.completionRate < 50 ? 'warn' : 'ok'} to={browseLink({ days: '30' })} foot={tr("{0} أُنجزت · {1} أُنشئت · في الموعد {2}", k.done30, k.created30, pct(k.onTimeRate))} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <Card className="flex flex-col gap-3">
          <PanelTitle title={tr("المنشأة والمنجزة · آخر 8 أسابيع")} action={<Legend series={SERIES} />} />
          <TrendBars data={d.weekly} series={SERIES} labelOf={(x) => String(x.label)} label={tr("المنشأة والمنجزة · آخر 8 أسابيع")} />
          <MiniStats items={[{ label: tr("الإجمالي"), value: k.total, to: browseLink({}) }, { label: tr("بانتظار مراجعة"), value: k.review, to: browseLink({ status: 'review' }) }, { label: tr("عاجلة ومرتفعة"), value: k.urgent, to: browseLink({ priority: 'hot' }) }]} />
        </Card>
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-3"><PanelTitle title={tr("حسب الحالة")} /><StackBar label={tr("حسب الحالة")} total={k.total} items={d.byStatus.map((s) => ({ key: s.status, label: s.label, count: s.count, className: STATUS_BG[s.status], to: browseLink({ status: s.status }) }))} /></div>
          <div className="flex flex-col gap-3 border-t border-line pt-3"><PanelTitle title={tr("المفتوحة حسب الأولوية")} /><StackBar label={tr("المفتوحة حسب الأولوية")} total={openTotal} items={d.byPriority.map((p) => ({ key: p.priority, label: p.label, count: p.count, className: PRIORITY_BG[p.priority], to: browseLink({ priority: p.priority }) }))} /></div>
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card padded={false}>
          <CardHeader title={tr("متأخرة · {0}", k.overdue)} action={k.overdue > d.overdue.length ? <Link to={browseLink({ due: 'overdue' })} className="text-[13px] font-semibold text-accent-fg no-underline">{tr("عرض الكل")}</Link> : undefined} />
          {d.overdue.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا مهام متأخرة.")}</p> : d.overdue.map((t) => <TaskRow key={t.id} t={t} today={lk.data?.today} showAssignee onToggle={toggle} />)}
        </Card>
        <Card padded={false}>
          <CardHeader title={tr("تحين خلال أسبوع · {0}", k.dueWeek)} action={<Link to={browseLink({ due: 'week' })} className="text-[13px] font-semibold text-accent-fg no-underline">{tr("عرض الكل")}</Link>} />
          {d.dueSoon.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا مواعيد قريبة.")}</p> : d.dueSoon.map((t) => <TaskRow key={t.id} t={t} today={lk.data?.today} showAssignee onToggle={toggle} />)}
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <PanelTitle title={d.scope === 'mine' ? tr("المفتوح لديك") : tr("أحمال الفريق")} />
          <Bars empty={tr("لا مهام مفتوحة")} rows={d.byAssignee.map((a) => ({ key: a.id, label: a.name, value: a.open, sub: a.overdue ? tr("{0} متأخرة", a.overdue) : '', tone: a.overdue > 0 ? 'bad' : 'accent', to: browseLink({ status: 'open', assignee: a.id }) }))} />
        </Card>
        <Card className="flex flex-col gap-3">
          <PanelTitle title={tr("المفتوحة حسب المشروع")} />
          <Bars empty={tr("لا مهام مرتبطة بمشاريع")} rows={d.byProject.map((p) => ({ key: p.id, label: p.name, value: p.open, tone: 'ok', to: browseLink({ status: 'open', project: p.id }) }))} />
        </Card>
      </div>
    </div>
  );
}
