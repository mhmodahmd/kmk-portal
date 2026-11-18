import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IS_EN, tr } from '../../lib/i18n';
import { useAction, useApi } from '../../lib/useApi';
import { dmy } from '../../lib/format';
import { Badge, ListRow } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Checkbox, Select, TextInput, Textarea } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import type { LinkType, Priority, TaskLookups, TaskStatus, TaskView } from './types';

/** «اليوم» بمعنى Today (المفتاح العام «اليوم» يُترجم Day في جداول الحضور) */
export const TODAY = IS_EN ? 'Today' : 'اليوم';

export const TASK_KEYS = ['tsk.list', 'tsk.get', 'home.summary', 'inbox.list'];

export const useTaskLookups = () => useApi<TaskLookups>('tsk.lookups', {}, { staleTime: 5 * 60_000 });

/** البحث في المهام: العنوان، الرقم، المسؤول، المشروع، المرتبط به، الوصف */
export const matchTask = (t: TaskView, search: string) => {
  const s = search.trim().toLowerCase();
  return !s || [t.title, t.number, t.assigneeName, t.projectName, t.linkedLabel, t.description].join(' ').toLowerCase().includes(s);
};

export type TaskMode = 'list' | 'board';
const MODE_STORE = 'kmk.tasks.mode';
const rememberedMode = (): TaskMode => { try { return localStorage.getItem(MODE_STORE) === 'board' ? 'board' : 'list'; } catch { return 'list'; } };

/** طريقة العرض (قائمة أو لوحة): من الرابط ?mode=board أولاً، ثم آخر اختيار في هذا المتصفح */
export function useTaskMode(): [TaskMode, (m: TaskMode) => void] {
  const [params, setParams] = useSearchParams();
  const p = params.get('mode');
  const mode: TaskMode = p === 'board' || p === 'list' ? p : rememberedMode();
  const set = (m: TaskMode) => {
    try { localStorage.setItem(MODE_STORE, m); } catch { /* المتصفح يمنع التخزين */ }
    const n = new URLSearchParams(params); n.set('mode', m); setParams(n, { replace: true });
  };
  return [mode, set];
}

/** زرّا تبديل طريقة العرض */
export function ModeToggle({ value, onChange }: { value: TaskMode; onChange: (m: TaskMode) => void }) {
  const opts: { v: TaskMode; icon: 'menu' | 'grid'; label: string }[] = [{ v: 'list', icon: 'menu', label: tr("قائمة") }, { v: 'board', icon: 'grid', label: tr("لوحة") }];
  return (
    <div role="radiogroup" aria-label={tr("طريقة العرض")} className="inline-flex shrink-0 rounded-lg border border-line bg-surface p-0.5">
      {opts.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          className={cx('inline-flex h-[38px] cursor-pointer items-center gap-1.5 rounded-md px-3 text-[14px] font-medium sm:h-[34px]',
            value === o.v ? 'bg-fg text-bg' : 'text-muted hover:text-fg')}>
          <Icon name={o.icon} size={16} />{o.label}
        </button>
      ))}
    </div>
  );
}

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
    <ListRow className="py-3" leading={toggle} to={'/tasks/' + t.id} titleClassName={closed ? 'text-muted line-through decoration-1' : undefined}
      title={<>{t.private && <Icon name="lock" size={13} className="me-1 inline align-[-1px] text-muted" />}{t.title}</>}
      sub={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]">
          <span className="num">{t.number}</span>
          {t.linkedLabel && <span>{t.linkedTypeLabel}: {t.linkedLabel}</span>}
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
  private?: boolean; createdBy?: string;
}

const LINK_LABELS: Record<LinkType, string> = { client: tr("عميل"), custody: tr("عهدة"), employee: tr("موظف") };

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
  const isPrivate = !!f.private;
  // «خاصة» يضبطها منشئ المهمة فقط (أو عند الإنشاء)
  const canPrivate = !editing || initial.createdBy === me;
  const save = () => {
    setError('');
    act.mutate({
      id: f.id, title: f.title, description: f.description, assigneeId: isPrivate ? me : f.assigneeId || me, dueDate: f.dueDate, startDate: f.startDate,
      priority: f.priority, projectId: f.projectId, linkedType: f.linkedId ? f.linkedType : '', linkedId: f.linkedId || '', parentId: f.parentId, private: isPrivate,
      watchers: isPrivate ? [] : f.watchers || [], ...(L?.isManager ? { recurrence: f.recurrence ? { freq: f.recurrence } : null } : {}),
      ...(editing ? {} : { checklist: checks.split('\n').map((s) => s.trim()).filter(Boolean) })
    }, { onError: (e) => setError(e.message) });
  };
  const people = L?.people || [];
  const watchers = f.watchers || [];
  // أنواع الربط المتاحة للمستخدم + النوع الحالي للمهمة إن لم يكن ضمن خياراته
  const linkTypes = (Object.keys(LINK_LABELS) as LinkType[]).filter((k) => (L?.links[k] || []).length || f.linkedType === k);
  const linkOptions = (() => {
    const list = (L?.links[f.linkedType as LinkType] || []).map((x) => ({ value: x.id, label: x.name }));
    if (f.linkedId && !list.some((x) => x.value === f.linkedId)) list.unshift({ value: f.linkedId, label: f.linkedLabel || f.linkedId });
    return [{ value: '', label: tr("اختر") }, ...list];
  })();
  return (
    <Dialog open={open} onClose={onClose} wide title={editing ? tr("تعديل المهمة") : f.parentId ? tr("مهمة فرعية جديدة") : tr("مهمة جديدة")}
      onSubmit={save} footer={<><Button type="submit" variant="primary" className="flex-1" loading={act.isPending}>{editing ? tr("حفظ") : tr("إنشاء المهمة")}</Button>
        <Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <div className="flex flex-col gap-3">
        <TextInput label={tr("العنوان")} required value={f.title || ''} onChange={(e) => set('title', e.target.value)} maxLength={160} autoFocus />
        <Textarea label={tr("الوصف (اختياري)")} value={f.description || ''} onChange={(e) => set('description', e.target.value)} maxLength={4000} />
        {canPrivate && (
          <Checkbox label={tr("مهمة خاصة")} description={tr("لا يراها غيرك: لا مديرك ولا مدير المهام ولا مدير النظام. تُسند إليك بلا متابعين وتُنجز بلا مراجعة.")}
            checked={isPrivate} onChange={(v) => setF((x) => ({ ...x, private: v }))} />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {!isPrivate && <Select label={tr("المسؤول")} value={f.assigneeId || me} onChange={(e) => set('assigneeId', e.target.value)}
            options={people.map((p) => ({ value: p.id, label: p.id === me ? tr("{0} (أنا)", p.name) : p.name }))} />}
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
        {(linkTypes.length > 0 || f.linkedType) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label={tr("مرتبطة بـ")} value={f.linkedType || ''} onChange={(e) => setF((x) => ({ ...x, linkedType: e.target.value, linkedId: '', linkedLabel: '' }))}
              options={[{ value: '', label: tr("بلا ربط") }, ...linkTypes.map((k) => ({ value: k, label: LINK_LABELS[k] }))]}
              hint={tr("تظهر المهمة في صفحة العميل أو العهدة أو الموظف المرتبط")} />
            {f.linkedType && (
              <Select label={LINK_LABELS[f.linkedType as LinkType] || tr("العنصر")} required value={f.linkedId || ''} options={linkOptions}
                onChange={(e) => { const o = linkOptions.find((x) => x.value === e.target.value); setF((x) => ({ ...x, linkedId: e.target.value, linkedLabel: o?.label || '' })); }} />
            )}
          </div>
        )}
        {!isPrivate && <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
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
        </fieldset>}
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
