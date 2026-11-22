import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { tr, trServer } from '../../lib/i18n';
import { api, ApiError } from '../../lib/api';
import { useAction, useApi } from '../../lib/useApi';
import { dmy, formatDateTime, relativeTime } from '../../lib/format';
import { Avatar, Badge, Card, CardHeader, EmptyState, ErrorBox, Loader, DangerZone } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Facts } from '../../ui/Controls';
import { Textarea } from '../../ui/Field';
import { ReasonDialog } from '../../ui/Decide';
import { Dialog, useToast } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import { ACCEPT, filePayload, openFile } from '../custody/files';
import { PriorityMark, StatusBadge, TASK_KEYS, TaskDialog, TaskRow, useTaskLookups, useToggleDone } from './shared';
import { RequestSteps } from '../../ui/Timeline';
import type { TaskDetail, TaskStatus } from './types';

const NEXT: Record<TaskStatus, { to: TaskStatus; label: string; primary?: boolean }[]> = {
  todo: [{ to: 'doing', label: tr("بدء العمل"), primary: true }, { to: 'done', label: tr("إنجاز") }],
  doing: [{ to: 'done', label: tr("إنجاز"), primary: true }, { to: 'todo', label: tr("إرجاع إلى جديدة") }],
  review: [{ to: 'done', label: tr("اعتماد الإنجاز"), primary: true }, { to: 'doing', label: tr("إعادتها للعمل") }],
  done: [{ to: 'doing', label: tr("إعادة فتح") }],
  cancelled: [{ to: 'todo', label: tr("استعادة") }]
};

export default function TaskDetailPage() {
  const { id = '' } = useParams();
  const q = useApi<TaskDetail>('tsk.get', { id });
  const lk = useTaskLookups();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const toggle = useToggleDone();
  const [editing, setEditing] = useState(false);
  const [sub, setSub] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [newCheck, setNewCheck] = useState('');
  const [comment, setComment] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const status = useAction<{ id: string; status: TaskStatus; note?: string }, { review?: boolean; nextNumber?: string; status: TaskStatus }>('tsk.status', {
    invalidate: TASK_KEYS,
    success: (r) => (r.review ? tr("أُرسلت للمراجعة") : r.nextNumber ? tr("أُنجزت، وأُنشئت المهمة التالية {0}", r.nextNumber) : tr("حُدّثت الحالة"))
  });
  const check = useAction('tsk.check.save', { invalidate: ['tsk.get', 'tsk.list'] });
  const uncheck = useAction('tsk.check.remove', { invalidate: ['tsk.get', 'tsk.list'] });
  const addComment = useAction('tsk.comment.add', { invalidate: ['tsk.get', 'tsk.list'], onSuccess: () => { setComment(''); setMentions([]); } });
  const delComment = useAction('tsk.comment.remove', { invalidate: ['tsk.get', 'tsk.list'] });
  const delFile = useAction('tsk.file.remove', { invalidate: ['tsk.get', 'tsk.list'], success: tr("حُذف المرفق") });
  const remove = useAction('tsk.remove', { invalidate: TASK_KEYS, success: tr("حُذفت المهمة"), onSuccess: () => nav('/tasks') });

  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  const { task: t, checklist, comments, files, subtasks, can } = q.data;
  const L = lk.data;
  // الجديدة وقيد العمل: المسؤول ومن يديرها · المراجعة والمنجزة والملغاة: من يديرها فقط
  // في سلسلة جارية: القرار من صفحة السلسلة (docs/09)
  const inChain = t.status === 'review' && !!t.wf && t.wf.status === 'running';
  const actions = inChain ? [] : (['todo', 'doing'].includes(t.status) ? can.work : can.manage) ? NEXT[t.status] : [];

  const attach = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try { await api('tsk.file.upload', { taskId: t.id, ...(await filePayload(file)) }); toast(tr("أُرفق الملف")); await qc.invalidateQueries({ queryKey: ['tsk.get'] }); }
    catch (e) { toast(e instanceof Error ? e.message : tr("تعذّر رفع الملف."), 'bad'); }
    finally { setUploading(false); }
  };
  const view = (fid: string) => openFile('tsk.file.content', { id: fid }).catch((e) => toast(e instanceof ApiError ? e.message : tr("تعذّر فتح الملف."), 'bad'));
  const linkTo = t.linkedType === 'custody' ? '/custody/' + t.linkedId : t.linkedType === 'client' ? '/crm/clients/' + t.linkedId : t.linkedType === 'project' ? '/crm/projects/' + t.linkedId : '';

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
              <span className="num">{t.number}</span><StatusBadge t={t} /><PriorityMark t={t} />
              {t.private && <Badge><Icon name="lock" size={12} className="me-1 inline align-[-1px]" />{tr("خاصة: لا يراها غيرك")}</Badge>}
              {t.recurrenceLabel && <span className="inline-flex items-center gap-1"><Icon name="refresh" size={14} />{tr("تتكرر: {0}", t.recurrenceLabel)}</span>}
            </span>
            <h2 className="m-0 text-[20px] font-bold leading-snug">{t.title}</h2>
            {t.parentId && <Link to={'/tasks/' + t.parentId} className="text-[13px] text-accent-fg no-underline">{tr("فرعية من {0} · {1}", t.parentNumber, t.parentTitle)}</Link>}
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button key={a.to} variant={a.primary ? 'primary' : 'secondary'} loading={status.isPending && status.variables?.status === a.to}
                onClick={() => status.mutate({ id: t.id, status: a.to })}>{a.to === 'done' && !can.manage ? tr("إنجاز وإرسال للمراجعة") : a.label}</Button>
            ))}
            {(can.manage || t.mine) && <Button variant="ghost" icon="edit" onClick={() => setEditing(true)}>{tr("تعديل")}</Button>}
            {can.manage && t.status !== 'cancelled' && t.status !== 'done' && <Button variant="ghost" onClick={() => setCancel(true)}>{tr("إلغاء المهمة")}</Button>}
          </div>
        </div>
        {t.status === 'review' && t.mine && !can.manage && !t.wf && <div className="rounded-lg bg-warn-bg px-3 py-2.5 text-warn">{tr("أرسلتها للمراجعة. تُعتمد من {0}.", t.createdByName)}</div>}
        {t.wf && t.wf.status === 'returned' && t.mine && <div className="rounded-lg bg-warn-bg px-3 py-2.5 text-warn">{tr("أُعيدت من سلسلة المراجعة. أكمل العمل ثم «إنجاز» لإعادة إرسالها.")}</div>}
        {(t.wf || t.steps.length > 0) && <RequestSteps wf={t.wf} steps={t.steps} />}
        {t.description ? <p className="m-0 whitespace-pre-wrap leading-relaxed">{t.description}</p> : null}
        <Facts cols={3} items={[
          { k: tr("المسؤول"), v: t.assigneeName },
          { k: tr("الموعد"), v: t.dueDate ? <span className={cx(t.overdue && 'font-semibold text-bad')}>{dmy(t.dueDate)}{t.overdue ? ' · ' + tr("متأخرة") : ''}</span> : '—' },
          { k: tr("أسندها"), v: `${t.createdByName} · ${relativeTime(t.createdAt)}` },
          ...(t.startDate ? [{ k: tr("تاريخ البدء"), v: dmy(t.startDate) }] : []),
          ...(t.projectName ? [{ k: tr("المشروع"), v: t.projectName }] : []),
          ...(t.linkedLabel ? [{ k: t.linkedTypeLabel, v: linkTo ? <Link to={linkTo} className="text-accent-fg no-underline">{t.linkedLabel}</Link> : t.linkedLabel }] : []),
          ...(t.completedAt ? [{ k: tr("أُنجزت"), v: formatDateTime(t.completedAt) }] : []),
          ...(t.watchers.length ? [{ k: tr("المتابعون"), v: t.watchers.map((w) => w.name).join('، ') }] : [])
        ]} />
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-4">
          <Card padded={false}>
            <CardHeader title={checklist.length ? tr("القائمة الفرعية · {0}/{1}", checklist.filter((c) => c.done).length, checklist.length) : tr("القائمة الفرعية")} />
            {checklist.map((c) => (
              <div key={c.id} className="group flex items-center gap-3 border-t border-line px-5 py-2.5">
                <input type="checkbox" className="h-[18px] w-[18px] accent-accent" checked={c.done} disabled={!can.work}
                  aria-label={c.text} onChange={(e) => check.mutate({ id: c.id, done: e.target.checked })} />
                <span className={cx('flex-1', c.done && 'text-muted line-through decoration-1')}>{c.text}</span>
                {c.done && c.doneByName && <span className="text-[12px] text-muted">{c.doneByName}</span>}
                {can.work && <button type="button" aria-label={tr("حذف البند")} className="text-muted opacity-0 hover:text-bad group-hover:opacity-100 focus:opacity-100 cursor-pointer" onClick={() => uncheck.mutate({ id: c.id })}><Icon name="x" size={14} /></button>}
              </div>
            ))}
            {can.work && (
              <form className="flex gap-2 border-t border-line px-5 py-3" onSubmit={(e) => { e.preventDefault(); if (newCheck.trim()) check.mutate({ taskId: t.id, text: newCheck.trim() }, { onSuccess: () => setNewCheck('') }); }}>
                <input value={newCheck} onChange={(e) => setNewCheck(e.target.value)} maxLength={200} placeholder={tr("أضف بنداً…")} aria-label={tr("بند جديد")}
                  className="h-9 flex-1 rounded-lg border border-line bg-surface px-3 outline-none focus:border-accent" />
                <Button type="submit" size="sm" icon="plus" loading={check.isPending}>{tr("إضافة")}</Button>
              </form>
            )}
            {!checklist.length && !can.work && <EmptyState title={tr("لا بنود")} />}
          </Card>

          {!t.parentId && (
            <Card padded={false}>
              <CardHeader title={tr("المهام الفرعية")} action={can.work ? <Button size="sm" variant="ghost" icon="plus" onClick={() => setSub(true)}>{tr("مهمة فرعية")}</Button> : undefined} />
              {subtasks.length ? subtasks.map((s) => <TaskRow key={s.id} t={s} today={L?.today} showAssignee onToggle={toggle} />) : <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("قسّم المهمة الكبيرة إلى مهام تُسند لأشخاص مختلفين.")}</p>}
            </Card>
          )}

          <Card padded={false}>
            <CardHeader title={tr("المرفقات")} action={can.work && L?.drive ? (
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-accent-fg hover:bg-chip">
                <Icon name={uploading ? 'refresh' : 'file'} size={16} />{uploading ? tr("جارٍ الرفع") : tr("إرفاق")}
                <input type="file" accept={ACCEPT} className="sr-only" disabled={uploading} onChange={(e) => { attach(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            ) : undefined} />
            {files.length ? files.map((f) => (
              <div key={f.id} className="flex items-center gap-3 border-t border-line px-5 py-2.5">
                <button type="button" className="inline-flex min-w-0 flex-1 items-center gap-2 text-start text-accent-fg cursor-pointer" onClick={() => view(f.id)}>
                  <Icon name={f.isImage ? 'eye' : 'file'} size={16} /><span className="truncate">{f.fileName.replace(/^T-\d+_/, '')}</span>
                </button>
                <span className="text-[12px] text-muted">{f.uploadedByName}</span>
                {f.canDelete && <button type="button" aria-label={tr("حذف المرفق")} className="text-muted hover:text-bad cursor-pointer" onClick={() => delFile.mutate({ id: f.id })}><Icon name="x" size={14} /></button>}
              </div>
            )) : <p className="m-0 px-5 pb-4 text-[13px] text-muted">{L?.drive ? tr("صور أو ملفات PDF حتى 10 ميجابايت.") : tr("رفع الملفات غير مفعّل بعد.")}</p>}
          </Card>
        </div>

        <Card padded={false} className="flex flex-col">
          <CardHeader title={tr("النقاش والنشاط")} />
          <ol className="m-0 flex list-none flex-col p-0">
            {comments.map((c) => c.kind === 'event' ? (
              <li key={c.id} className="flex gap-2 border-t border-line px-5 py-2 text-[12px] text-muted">
                <Icon name="history" size={14} className="mt-0.5 shrink-0" /><span className="flex-1"><b className="font-semibold">{c.byName}</b> {trServer(c.body)}</span>
                <span className="shrink-0" title={formatDateTime(c.at)}>{relativeTime(c.at)}</span>
              </li>
            ) : (
              <li key={c.id} className="flex gap-3 border-t border-line px-5 py-3">
                <Avatar name={c.byName} size={30} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center gap-2 text-[12px] text-muted"><b className="text-[13px] font-semibold text-fg">{c.byName}</b><span title={formatDateTime(c.at)}>{relativeTime(c.at)}</span>
                    {c.mine && <button type="button" className="ms-auto text-muted hover:text-bad cursor-pointer" aria-label={tr("حذف التعليق")} onClick={() => delComment.mutate({ id: c.id })}><Icon name="x" size={12} /></button>}
                  </span>
                  <p className="m-0 whitespace-pre-wrap leading-relaxed">{c.body}</p>
                  {c.mentions.length > 0 && <span className="text-[12px] text-accent-fg">@ {c.mentions.join('، ')}</span>}
                </div>
              </li>
            ))}
          </ol>
          <form className="flex flex-col gap-2 border-t border-line p-4" onSubmit={(e) => { e.preventDefault(); if (comment.trim()) addComment.mutate({ taskId: t.id, body: comment.trim(), mentions }); }}>
            <Textarea label={tr("تعليق")} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} className="[&_textarea]:min-h-[64px]" />
            <details className="text-[13px]">
              <summary className="cursor-pointer text-accent-fg">{mentions.length ? tr("إشارة إلى {0} شخص", mentions.length) : tr("إشارة إلى زميل")}</summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(L?.everyone || []).filter((p) => p.id !== L?.me).map((p) => {
                  const on = mentions.includes(p.id);
                  return <button key={p.id} type="button" aria-pressed={on} onClick={() => setMentions(on ? mentions.filter((x) => x !== p.id) : [...mentions, p.id])}
                    className={cx('h-7 rounded-full px-2.5 text-[12px] cursor-pointer', on ? 'bg-fg text-bg' : 'border border-line bg-surface')}>{p.name}</button>;
                })}
              </div>
              <span className="mt-1 block text-[12px] text-muted">{tr("من تُشير إليه يصبح متابعاً للمهمة ويراها.")}</span>
            </details>
            <Button type="submit" variant="primary" className="self-end" loading={addComment.isPending} disabled={!comment.trim()}>{tr("إرسال")}</Button>
          </form>
        </Card>
      </div>

      {can.remove && <DangerZone label={tr("حذف المهمة نهائياً")} onClick={() => setRemoving(true)} />}
      {editing && (
        <TaskDialog open onClose={() => setEditing(false)} onSaved={() => undefined}
          initial={{ id: t.id, title: t.title, description: t.description, assigneeId: t.assigneeId, dueDate: t.dueDate, startDate: t.startDate, priority: t.priority,
            projectId: t.projectId, linkedType: t.linkedType, linkedId: t.linkedId, linkedLabel: t.linkedLabel, watchers: t.watchers.map((w) => w.id), recurrence: t.recurrence?.freq || '',
            private: t.private, createdBy: t.createdBy }} />
      )}
      {sub && <TaskDialog open onClose={() => setSub(false)} onSaved={() => undefined} initial={{ parentId: t.id, projectId: t.projectId }} />}
      <ReasonDialog open={cancel} onClose={() => setCancel(false)} title={tr("إلغاء المهمة")} label={tr("سبب الإلغاء")} confirmLabel={tr("إلغاء المهمة")} danger
        onConfirm={(note: string) => status.mutateAsync({ id: t.id, status: 'cancelled', note }).then(() => setCancel(false))} />
      <Dialog open={removing} onClose={() => setRemoving(false)} title={tr("حذف المهمة نهائياً")}
        footer={<><Button variant="danger" className="flex-1" loading={remove.isPending} onClick={() => remove.mutate({ id: t.id })}>{tr("حذف نهائياً")}</Button>
          <Button variant="ghost" onClick={() => setRemoving(false)}>{tr("تراجع")}</Button></>}>
        <p className="m-0">{t.subtasksCount ? tr("تُحذف معها {0} مهمة فرعية وكل تعليقاتها ومرفقاتها، ولا يمكن التراجع.", t.subtasksCount) : tr("تُحذف معها تعليقاتها ومرفقاتها، ولا يمكن التراجع. لإيقافها مع بقاء سجلها استخدم «إلغاء المهمة».")}</p>
      </Dialog>
    </div>
  );
}
