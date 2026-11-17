import { useMemo, useState } from 'react';
import { Link, Outlet, useSearchParams } from 'react-router-dom';
import { Icon } from '../../ui/Icon';
import { tr } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { Card, CardHeader, EmptyState, ErrorBox, Loader, PageHeader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { SearchBox, Segmented, TabNav } from '../../ui/Controls';
import { Select } from '../../ui/Field';
import { TODAY, TaskDialog, TaskRow, useTaskLookups, useToggleDone } from './shared';
import type { TaskView } from './types';

export function TasksLayout() {
  const lk = useTaskLookups();
  const [creating, setCreating] = useState(false);
  const L = lk.data;
  const items = [
    { to: '/tasks', label: tr("مهامي"), end: true },
    { to: '/tasks/overview', label: tr("نظرة عامة") },
    { to: '/tasks/board', label: tr("اللوحة") },
    { to: '/tasks/assigned', label: tr("أسندتها") },
    { to: '/tasks/watching', label: tr("أتابعها") },
    ...(L?.hasTeam || L?.isManager ? [{ to: '/tasks/team', label: tr("مهام فريقي") }] : []),
    ...(L?.isManager ? [{ to: '/tasks/all', label: tr("كل المهام") }] : [])
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={tr("العمل")} title={tr("المهام")} actions={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>{tr("مهمة جديدة")}</Button>} />
      <TabNav label={tr("أقسام المهام")} items={items} />
      <Outlet />
      {creating && <TaskDialog open onClose={() => setCreating(false)} initial={{}} />}
    </div>
  );
}

/** مهامي: المتأخرة، اليوم، القادمة، بلا موعد، بانتظار مراجعة، المنجزة مؤخراً */
export function MyTasksPage() {
  const q = useApi<TaskView[]>('tsk.list', { view: 'mine' });
  const lk = useTaskLookups();
  const toggle = useToggleDone();
  const [allDone, setAllDone] = useState(false);
  const today = lk.data?.today || '';
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  const open = q.data.filter((t) => t.status === 'todo' || t.status === 'doing');
  const groups: { key: string; title: string; rows: TaskView[] }[] = [
    { key: 'overdue', title: tr("متأخرة"), rows: open.filter((t) => t.overdue) },
    { key: 'today', title: TODAY, rows: open.filter((t) => t.dueDate === today) },
    { key: 'next', title: tr("القادمة"), rows: open.filter((t) => t.dueDate > today) },
    { key: 'none', title: tr("بلا موعد"), rows: open.filter((t) => !t.dueDate) },
    { key: 'review', title: tr("بانتظار مراجعة"), rows: q.data.filter((t) => t.status === 'review') },
    { key: 'done', title: tr("المنجزة مؤخراً"), rows: q.data.filter((t) => t.status === 'done') }
  ].filter((g) => g.rows.length);
  const DONE_LIMIT = 10;
  if (!groups.length) return <Card><EmptyState title={tr("لا مهام لديك")} body={tr("المهام التي تُسند إليك تظهر هنا مرتبة حسب موعدها.")} /></Card>;
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <Card key={g.key} padded={false}>
          <CardHeader title={`${g.title} · ${g.rows.length}`} action={g.key === 'done' && g.rows.length > DONE_LIMIT ? <Button size="sm" variant="ghost" onClick={() => setAllDone(!allDone)}>{allDone ? tr("أقل") : tr("عرض الكل")}</Button> : undefined} />
          {(g.key === 'done' && !allDone ? g.rows.slice(0, DONE_LIMIT) : g.rows).map((t) => <TaskRow key={t.id} t={t} today={today} onToggle={toggle} />)}
        </Card>
      ))}
    </div>
  );
}

/** قوائم: أسندتها، أتابعها، فريقي، الكل — مع التصفية */
export function TaskListPage({ view }: { view: 'created' | 'watching' | 'team' | 'all' }) {
  const lk = useTaskLookups();
  const [status, setStatus] = useState<'open' | 'review' | 'done' | 'all'>('open');
  const [assignee, setAssignee] = useState('');
  const [project, setProject] = useState('');
  const [search, setSearch] = useState('');
  const q = useApi<TaskView[]>('tsk.list', { view, old: status === 'done' || status === 'all', assigneeId: assignee || undefined, projectId: project || undefined });
  const toggle = useToggleDone();
  const rows = useMemo(() => (q.data || []).filter((t) => {
    if (status === 'open' && !(t.status === 'todo' || t.status === 'doing' || t.status === 'review')) return false;
    if (status === 'review' && t.status !== 'review') return false;
    if (status === 'done' && t.status !== 'done') return false;
    const s = search.trim().toLowerCase();
    return !s || (t.title + ' ' + t.number + ' ' + t.assigneeName).toLowerCase().includes(s);
  }), [q.data, status, search]);
  const L = lk.data;
  const people = view === 'all' ? L?.everyone : L?.people;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Segmented label={tr("الحالة")} value={status} onChange={setStatus}
          options={[{ value: 'open', label: tr("المفتوحة") }, { value: 'review', label: tr("بانتظار مراجعة") }, { value: 'done', label: tr("المنجزة") }, { value: 'all', label: tr("الكل") }]} />
        {view !== 'watching' && (people?.length || 0) > 1 && (
          <Select label={tr("المسؤول")} className="w-44" value={assignee} onChange={(e) => setAssignee(e.target.value)}
            options={[{ value: '', label: tr("الكل") }, ...(people || []).map((p) => ({ value: p.id, label: p.name }))]} />
        )}
        {(L?.projects.length || 0) > 0 && (
          <Select label={tr("المشروع")} className="w-44" value={project} onChange={(e) => setProject(e.target.value)}
            options={[{ value: '', label: tr("الكل") }, ...(L?.projects || []).map((p) => ({ value: p.id, label: p.name }))]} />
        )}
        <div className="min-w-[200px] flex-1"><SearchBox id="tsk-search" value={search} onChange={setSearch} placeholder={tr("بحث بالعنوان أو الرقم")} /></div>
      </div>
      <Card padded={false}>
        {q.isError ? <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} /> : !q.data ? <Loader /> : rows.length === 0 ? (
          <EmptyState title={tr("لا مهام هنا")} />
        ) : rows.map((t) => <TaskRow key={t.id} t={t} today={L?.today} showAssignee onToggle={toggle} />)}
      </Card>
      {view === 'team' && <p className="m-0 text-[13px] text-muted">{tr("مهام من يعملون تحت إدارتك في الهيكل الوظيفي.")} <Link to="/tasks/board" className="text-accent-fg no-underline">{tr("عرضها على اللوحة")}</Link></p>}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = { open: tr("المفتوحة"), todo: tr("جديدة"), doing: tr("قيد العمل"), review: tr("بانتظار مراجعة"), done: tr("منجزة"), cancelled: tr("ملغاة") };
const DUE_LABEL: Record<string, string> = { overdue: tr("متأخرة"), today: tr("موعدها اليوم"), week: tr("تحين خلال أسبوع"), none: tr("بلا موعد") };
const PRIORITY_LABEL: Record<string, string> = { hot: tr("عاجلة ومرتفعة"), urgent: tr("عاجلة"), high: tr("مرتفعة"), normal: tr("عادية"), low: tr("منخفضة") };
const OPEN_STATUSES = ['todo', 'doing', 'review'];
const plusDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/** رابط قائمة مصفّاة يفتحها رقم في «نظرة عامة»: /tasks/browse?status=todo… */
export const browseLink = (f: Record<string, string>) => '/tasks/browse?' + new URLSearchParams(f).toString();

/**
 * المهام التي يمثّلها رقم في «نظرة عامة»، بالنطاق نفسه (كل ما تراه عدا الخاص) والتعريفات نفسها في الخادم:
 * status (أو open)، due (overdue|today|week|none)، priority (أو hot)، assignee، project، days (المنجزة خلال أيام)
 */
export function TaskBrowsePage() {
  const [params, setParams] = useSearchParams();
  const lk = useTaskLookups();
  const toggle = useToggleDone();
  const [search, setSearch] = useState('');
  const q = useApi<TaskView[]>('tsk.list', { view: 'dash', old: true });
  const key = params.toString();
  const L = lk.data, today = L?.today || '';
  const rows = useMemo(() => {
    const f = Object.fromEntries(new URLSearchParams(key).entries()) as Record<string, string>;
    const s = search.trim().toLowerCase();
    const since = f.days ? new Date(Date.now() - Number(f.days) * 86400000).toISOString() : '';
    return (q.data || []).filter((t) => {
      const open = OPEN_STATUSES.includes(t.status), p = t.priority || 'normal';
      if (f.status === 'open' ? !open : f.status && t.status !== f.status) return false;
      if ((f.due || f.priority || f.assignee !== undefined || f.project) && !open) return false;
      if (f.due === 'overdue' && !(t.dueDate && t.dueDate < today)) return false;
      if (f.due === 'today' && t.dueDate !== today) return false;
      if (f.due === 'week' && !(t.dueDate && t.dueDate >= today && t.dueDate <= plusDays(today, 7))) return false;
      if (f.due === 'none' && t.dueDate) return false;
      if (f.priority === 'hot' ? !(p === 'urgent' || p === 'high') : f.priority && p !== f.priority) return false;
      if (f.assignee !== undefined && t.assigneeId !== f.assignee) return false;
      if (f.project && t.projectId !== f.project) return false;
      if (since && !(t.status === 'done' && (t.completedAt || '') >= since)) return false;
      return !s || (t.title + ' ' + t.number + ' ' + t.assigneeName).toLowerCase().includes(s);
    });
  }, [q.data, key, search, today]);

  const f = Object.fromEntries(params.entries()) as Record<string, string>;
  const person = (id: string) => (id ? [...(L?.everyone || []), ...(L?.people || [])].find((x) => x.id === id)?.name || id : tr("بلا مسؤول"));
  const chips = ([
    f.status ? { key: 'status', label: STATUS_LABEL[f.status] || f.status } : null,
    f.due ? { key: 'due', label: DUE_LABEL[f.due] || f.due } : null,
    f.priority ? { key: 'priority', label: PRIORITY_LABEL[f.priority] || f.priority } : null,
    f.assignee !== undefined ? { key: 'assignee', label: tr("المسؤول: {0}", person(f.assignee)) } : null,
    f.project ? { key: 'project', label: tr("المشروع: {0}", L?.projects.find((x) => x.id === f.project)?.name || f.project) } : null,
    f.days ? { key: 'days', label: tr("أُنجزت خلال {0} يوماً", f.days) } : null
  ]).filter((c): c is { key: string; label: string } => !!c);
  const drop = (k: string) => { const n = new URLSearchParams(params); n.delete(k); setParams(n, { replace: true }); };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/tasks/overview" className="text-[13px] font-semibold text-accent-fg no-underline">{tr("نظرة عامة")}</Link>
        <span className="text-muted" aria-hidden>‹</span>
        <span className="font-semibold">{q.data ? tr("{0} مهمة", rows.length) : tr("المهام")}</span>
        {chips.map((c) => (
          <button key={c.key} type="button" onClick={() => drop(c.key)} aria-label={tr("إزالة التصفية: {0}", c.label)}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-chip px-3 text-[13px] font-medium text-fg hover:border-line-strong">
            {c.label}<Icon name="x" size={14} />
          </button>
        ))}
        {chips.length > 0 && <button type="button" onClick={() => setParams({}, { replace: true })} className="cursor-pointer border-0 bg-transparent p-1 text-[13px] text-muted hover:text-fg">{tr("مسح التصفية")}</button>}
      </div>
      <div><SearchBox id="tsk-browse-search" value={search} onChange={setSearch} placeholder={tr("بحث بالعنوان أو الرقم")} /></div>
      <Card padded={false}>
        {q.isError ? <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} /> : !q.data ? <Loader /> : rows.length === 0 ? (
          <EmptyState title={tr("لا مهام هنا")} />
        ) : rows.map((t) => <TaskRow key={t.id} t={t} today={today} showAssignee onToggle={toggle} />)}
      </Card>
    </div>
  );
}
