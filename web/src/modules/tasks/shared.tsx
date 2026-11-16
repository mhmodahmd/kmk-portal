import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IS_EN, tr } from '../../lib/i18n';
import { useAction, useApi } from '../../lib/useApi';
import { dmy } from '../../lib/format';
import { Badge, ListRow } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Select, TextInput, Textarea } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import type { Priority, TaskLookups, TaskStatus, TaskView } from './types';

/** «اليوم» بمعنى Today (المفتاح العام «اليوم» يُترجم Day في جداول الحضور) */
export const TODAY = IS_EN ? 'Today' : 'اليوم';

export const TASK_KEYS = ['tsk.list', 'tsk.get', 'home.summary', 'inbox.list'];

export const useTaskLookups = () => useApi<TaskLookups>('tsk.lookups', {}, { staleTime: 5 * 60_000 });

const S_TONE: Record<TaskStatus, 'neutral' | 'info' | 'warn' | 'ok' | 'bad'> = { todo: 'neutral', doing: 'info', review: 'warn', done: 'ok', cancelled: 'bad' };
export const StatusBadge = ({ t }: { t: Pick<TaskView, 'status' | 'statusLabel'> }) => <Badge tone={S_TONE[t.status]}>{t.statusLabel}</Badge>;

const P_CLASS: Record<Priority, string> = { urgent: 'text-bad', high: 'text-warn', normal: 'text-muted', low: 'text-muted/70' };
export function PriorityMark({ t }: { t: Pick<TaskView, 'priority' | 'priorityLabel'> }) {
  if (t.priority === 'normal') return null;
  return <span className={cx('inline-flex items-center gap-1 text-[12px] font-semibold', P_CLASS[t.priority])}><Icon name="alert" size={14} />{t.priorityLabel}</span>;
}

/** «اليوم» / «غداً» / التاريخ، بلون أحمر للمتأخرة */
export function DueText({ t, today }: { t: Pick<TaskView, 'dueDate' | 'overdue'>; today?: string }) {
  if (!t.dueDate) return null;
  const label = today && t.dueDate === today ? TODAY : dmy(t.dueDate);
  return <span className={cx('inline-flex items-center gap-1 text-[12px] num', t.overdue ? 'font-semibold text-bad' : 'text-muted')}><Icon name="calendar" size={14} />{label}</span>;
}

/** سطر مهمة في القوائم */
export function TaskRow({ t, today, showAssignee, onToggle }: { t: TaskView; today?: string; showAssignee?: boolean; onToggle?: (t: TaskView) => void }) {
  const closed = t.status === 'done' || t.status === 'cancelled';
  // دائرة الإنجاز 24px بصرياً، وهدف لمسها 44px على الجوال (32px على الحاسوب)
  const toggle = onToggle && t.canWork && t.status !== 'cancelled' ? (
    <button type="button" onClick={() => onToggle(t)} aria-label={closed ? tr("إعادة فتح") : tr("إنجاز")} title={closed ? tr("إعادة فتح") : tr("إنجاز")}
      className="-mx-2.5 inline-flex h-11 w-11 shrink-0 items-center justify-center cursor-pointer sm:-mx-1 sm:h-8 sm:w-8">
      <span className={cx('inline-flex h-6 w-6 items-center justify-center rounded-full border-2', closed ? 'border-ok bg-ok text-white' : t.status === 'review' ? 'border-warn text-warn' : 'border-line-strong text-transparent hover:text-muted')}>
        <Icon name="check" size={14} strokeWidth={2.4} />
      </span>
    </button>
  ) : <span className="h-6 w-6 shrink-0" />;
  return (
    <ListRow className="py-3" leading={toggle} to={'/tasks/' + t.id} title={t.title} titleClassName={closed ? 'text-muted line-through decoration-1' : undefined}
      sub={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]">
          <span className="num">{t.number}</span>
          {t.parentNumber && <span>{tr("فرعية من {0}", t.parentNumber)}</span>}
          {showAssignee && <span className="inline-flex items-center gap-1"><Icon name="user" size={13} />{t.assigneeName}</span>}
          {t.projectName && <span>{t.projectName}</span>}
          {t.checklistTotal > 0 && <span className="num">{t.checklistDone}/{t.checklistTotal}</span>}
          {t.commentsCount > 0 && <span className="num">💬 {t.commentsCount}</span>}
          {t.recurrenceLabel && <span className="inline-flex items-center gap-1"><Icon name="refresh" size={13} />{t.recurrenceLabel}</span>}
        </span>
      }
      badge={
        <span className="flex shrink-0 flex-col items-end gap-1">
          {t.status === 'todo' || t.status === 'doing' ? <PriorityMark t={t} /> : <StatusBadge t={t} />}
          {!closed && <DueText t={t} today={today} />}
        </span>
      } />
  );
}

/** إنجاز/إعادة فتح من القائمة، مع رسالة عند الإرسال للمراجعة */
export function useToggleDone() {
  const act = useAction<{ id: string; status: TaskStatus }, TaskView>('tsk.status', {
    invalidate: TASK_KEYS,
    success: (r) => (r.review ? tr("أُرسلت للمراجعة") : r.status === 'done' ? (r.nextNumber ? tr("أُنجزت، وأُنشئت المهمة التالية {0}", r.nextNumber) : tr("أُنجزت المهمة")) : tr("أُعيد فتح المهمة"))
  });
  return (t: TaskView) => act.mutate({ id: t.id, status: t.status === 'done' ? 'doing' : 'done' });
}

export interface TaskDraft {
  id?: string; title?: string; description?: string; assigneeId?: string; dueDate?: string; startDate?: string; priority?: Priority;
  projectId?: string; linkedType?: string; linkedId?: string; linkedLabel?: string; parentId?: string; watchers?: string[]; recurrence?: string;
}

/** إنشاء مهمة أو تعديلها */
export function TaskDialog({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial: TaskDraft; onSaved?: (t: TaskView) => void }) {
  const lk = useTaskLookups();
  const nav = useNavigate();
  const editing = !!initial.id;
  const [f, setF] = useState<TaskDraft>(() => ({ priority: 'normal', ...initial }));
  const [checks, setChecks] = useState('');
  const [error, setError] = useState('');
  const set = (k: keyof TaskDraft, v: string | string[]) => setF((x) => ({ ...x, [k]: v }));
  const act = useAction<Record<string, unknown>, TaskView>('tsk.save', {
    invalidate: TASK_KEYS, silentError: true, success: editing ? tr("حُفظت المهمة") : tr("أُنشئت المهمة"),
    onSuccess: (t) => { onClose(); if (onSaved) onSaved(t); else if (!editing) nav('/tasks/' + t.id); }
  });
  const L = lk.data;
  const me = L?.me || '';
  const save = () => {
    setError('');
    act.mutate({
      id: f.id, title: f.title, description: f.description, assigneeId: f.assigneeId || me, dueDate: f.dueDate, startDate: f.startDate,
      priority: f.priority, projectId: f.projectId, linkedType: f.linkedType, linkedId: f.linkedId, parentId: f.parentId,
      watchers: f.watchers || [], ...(L?.isManager ? { recurrence: f.recurrence ? { freq: f.recurrence } : null } : {}),
      ...(editing ? {} : { checklist: checks.split('\n').map((s) => s.trim()).filter(Boolean) })
    }, { onError: (e) => setError(e.message) });
  };
  const people = L?.people || [];
  const watchers = f.watchers || [];
  return (
    <Dialog open={open} onClose={onClose} wide title={editing ? tr("تعديل المهمة") : f.parentId ? tr("مهمة فرعية جديدة") : tr("مهمة جديدة")}
      onSubmit={save} footer={<><Button type="submit" variant="primary" className="flex-1" loading={act.isPending}>{editing ? tr("حفظ") : tr("إنشاء المهمة")}</Button>
        <Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <div className="flex flex-col gap-3">
        <TextInput label={tr("العنوان")} required value={f.title || ''} onChange={(e) => set('title', e.target.value)} maxLength={160} autoFocus />
        <Textarea label={tr("الوصف (اختياري)")} value={f.description || ''} onChange={(e) => set('description', e.target.value)} maxLength={4000} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={tr("المسؤول")} value={f.assigneeId || me} onChange={(e) => set('assigneeId', e.target.value)}
            options={people.map((p) => ({ value: p.id, label: p.id === me ? tr("{0} (أنا)", p.name) : p.name }))} />
          <Select label={tr("الأولوية")} value={f.priority || 'normal'} onChange={(e) => set('priority', e.target.value)}
            options={(L?.priorities || []).map((p) => ({ value: p.id, label: p.label }))} />
          <TextInput label={tr("الموعد")} type="date" ltr value={f.dueDate || ''} onChange={(e) => set('dueDate', e.target.value)} />
          <TextInput label={tr("تاريخ البدء (اختياري)")} type="date" ltr value={f.startDate || ''} onChange={(e) => set('startDate', e.target.value)} />
          {(L?.projects.length || 0) > 0 && (
            <Select label={tr("المشروع")} value={f.projectId || ''} onChange={(e) => set('projectId', e.target.value)}
              options={[{ value: '', label: tr("بلا مشروع") }, ...(L?.projects || []).map((p) => ({ value: p.id, label: p.name }))]} />
          )}
          {L?.isManager && (
            <Select label={tr("التكرار")} value={f.recurrence || ''} onChange={(e) => set('recurrence', e.target.value)}
              hint={f.recurrence ? tr("عند إنجازها تُنشأ التالية تلقائياً") : undefined}
              options={[{ value: '', label: tr("لا تتكرر") }, ...(L?.freqs || []).map((p) => ({ value: p.id, label: p.label }))]} />
          )}
        </div>
        {f.linkedType && f.linkedLabel && (
          <div className="flex items-center gap-2 rounded-lg bg-chip px-3 py-2 text-[13px]">
            <Icon name={f.linkedType === 'custody' ? 'wallet' : 'user'} size={16} />{tr("مرتبطة بـ: {0}", f.linkedLabel)}
            <button type="button" className="ms-auto text-muted hover:text-bad cursor-pointer" aria-label={tr("إزالة الربط")} onClick={() => setF((x) => ({ ...x, linkedType: '', linkedId: '', linkedLabel: '' }))}><Icon name="x" size={14} /></button>
          </div>
        )}
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1.5 text-[13px] font-medium">{tr("المتابعون")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {(L?.everyone || []).filter((p) => p.id !== (f.assigneeId || me)).map((p) => {
              const on = watchers.includes(p.id);
              return (
                <button key={p.id} type="button" aria-pressed={on} onClick={() => set('watchers', on ? watchers.filter((x) => x !== p.id) : [...watchers, p.id])}
                  className={cx('h-8 rounded-full px-3 text-[13px] cursor-pointer', on ? 'bg-fg text-bg' : 'border border-line bg-surface')}>{p.name}</button>
              );
            })}
          </div>
        </fieldset>
        {!editing && <Textarea label={tr("القائمة الفرعية (بند في كل سطر، اختياري)")} value={checks} onChange={(e) => setChecks(e.target.value)} className="[&_textarea]:min-h-[64px]" />}
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}

/** زر «مهمة جديدة» من أي مكان (بطاقة موظف، عهدة) */
export function QuickTaskButton({ draft, label = tr("مهمة جديدة"), size = 'sm', variant = 'ghost' }: { draft: TaskDraft; label?: string; size?: 'sm' | 'md'; variant?: 'ghost' | 'secondary' | 'primary' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} icon="tasks" onClick={() => setOpen(true)}>{label}</Button>
      {open && <TaskDialog open onClose={() => setOpen(false)} initial={draft} />}
    </>
  );
}
