import { useMemo, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
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
