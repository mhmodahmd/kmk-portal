import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { tr, trServer } from '../../lib/i18n';
import { ApiError } from '../../lib/api';
import { useAction, useApi } from '../../lib/useApi';
import { dmy, formatDateTime, relativeTime } from '../../lib/format';
import { Badge, Card, CardHeader, DangerZone, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Facts } from '../../ui/Controls';
import { Select, Textarea } from '../../ui/Field';
import { ReasonDialog } from '../../ui/Decide';
import { Dialog, useToast } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import { openFile } from '../custody/files';
import { AttachButton, COR_KEYS, DirectionMark, LetterDialog, LetterLine, StatusBadge, linkTo, useCorLookups } from './shared';
import type { LetterDetail, LetterStatus } from './types';

export default function LetterDetailPage() {
  const { id = '' } = useParams();
  const q = useApi<LetterDetail>('cor.get', { id });
  const lk = useCorLookups();
  const nav = useNavigate();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const status = useAction<{ id: string; status: LetterStatus; note?: string }>('cor.status', { invalidate: COR_KEYS, success: tr("حُدّثت الحالة") });
  const delFile = useAction('cor.file.remove', { invalidate: ['cor.get', 'cor.list'], success: tr("حُذف المرفق") });
  const remove = useAction('cor.remove', { invalidate: COR_KEYS, success: tr("حُذف الخطاب"), onSuccess: () => nav('/correspondence') });

  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  const { letter: l, original, replies, files, log, can } = q.data;
  const L = lk.data;
  const view = (fid: string) => openFile('cor.file.content', { id: fid }).catch((e) => toast(e instanceof ApiError ? e.message : tr("تعذّر فتح الملف."), 'bad'));
  const link = linkTo(l);
  // أزرار الحالة حسب الاتجاه والحالة الحالية
  const actions: { to: LetterStatus; label: string; primary?: boolean }[] = [];
  if (can.edit && l.status !== 'archived') {
    if (l.direction === 'out' && l.status === 'draft') actions.push({ to: 'sent', label: tr("تأكيد الإرسال"), primary: true });
    if (l.status === 'sent' || l.status === 'received') actions.push({ to: 'replied', label: tr("تسجيل أنه تم الرد") });
    if (l.direction === 'out' && l.status === 'sent' && L?.isManager) actions.push({ to: 'draft', label: tr("إرجاع إلى مسودة") });
  }
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 flex-1 basis-[300px] flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
              <span className="num">{l.number}</span><DirectionMark l={l} /><StatusBadge l={l} />
              {l.category && <Badge>{l.category}</Badge>}
              {l.tags.map((t) => <span key={t} className="rounded-md bg-chip px-1.5 py-0.5 text-[12px]">#{t}</span>)}
            </span>
            <h2 className="m-0 text-[20px] font-bold leading-snug">{l.subject}</h2>
            {original && <Link to={'/correspondence/' + original.id} className="text-[13px] text-accent-fg no-underline">{tr("رد على {0} · {1}", original.number, original.subject)}</Link>}
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button key={a.to} variant={a.primary ? 'primary' : 'secondary'} loading={status.isPending && status.variables?.status === a.to} onClick={() => status.mutate({ id: l.id, status: a.to })}>{a.label}</Button>
            ))}
            {can.edit && l.status !== 'archived' && <Button variant={actions.some((a) => a.primary) ? 'secondary' : 'primary'} icon="mail" onClick={() => setReplying(true)}>{l.direction === 'in' ? tr("تسجيل الرد") : tr("تسجيل رد الجهة")}</Button>}
            {can.edit && l.status !== 'archived' && <Button variant="secondary" icon="user" onClick={() => setForwarding(true)}>{tr("إحالة")}</Button>}
            {can.edit && L?.drive && <AttachButton letterId={l.id} size="md" variant="secondary" />}
            {can.edit && <Button variant="ghost" icon="edit" onClick={() => setEditing(true)}>{tr("تعديل")}</Button>}
            {can.edit && l.status !== 'archived' && <Button variant="ghost" icon="archive" onClick={() => setArchiving(true)}>{tr("أرشفة")}</Button>}
            {L?.isManager && l.status === 'archived' && <Button variant="secondary" icon="refresh" onClick={() => status.mutate({ id: l.id, status: l.direction === 'in' ? 'received' : 'sent' })}>{tr("إعادة من الأرشيف")}</Button>}
          </div>
        </div>
        {l.overdue && <div className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{tr("تأخر الرد عن موعده {0}.", dmy(l.dueDate))}</div>}
        {l.summary ? <p className="m-0 whitespace-pre-wrap leading-relaxed">{l.summary}</p> : null}
        <Facts cols={3} items={[
          { k: tr("الجهة"), v: l.clientId ? <Link to={'/crm/clients/' + l.clientId} className="text-accent-fg no-underline">{l.party}</Link> : l.party },
          { k: tr("تاريخ الخطاب"), v: dmy(l.date) },
          { k: tr("القناة"), v: l.channelLabel || '—' },
          { k: tr("رقم مرجع الجهة"), v: l.refNo ? <span className="ltr inline-block">{l.refNo}</span> : '—' },
          { k: tr("المسؤول عن المتابعة"), v: l.assigneeName },
          { k: tr("موعد الرد"), v: l.dueDate ? <span className={cx(l.overdue && 'font-semibold text-bad')}>{dmy(l.dueDate)}</span> : '—' },
          ...(l.receivedAt ? [{ k: tr("استُلم"), v: formatDateTime(l.receivedAt) }] : []),
          ...(l.sentAt ? [{ k: tr("أُرسل"), v: formatDateTime(l.sentAt) }] : []),
          ...(l.archivedAt ? [{ k: tr("أُرشف"), v: formatDateTime(l.archivedAt) }] : []),
          ...(l.projectName ? [{ k: tr("المشروع"), v: <Link to={'/crm/projects/' + l.projectId} className="text-accent-fg no-underline">{l.projectName}</Link> }] : []),
          ...(l.linkedLabel ? [{ k: l.linkedTypeLabel, v: link ? <Link to={link} className="text-accent-fg no-underline">{l.linkedLabel}</Link> : l.linkedLabel }] : []),
          { k: tr("سجّله"), v: `${l.createdByName} · ${relativeTime(l.createdAt)}` }
        ]} />
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-4">
          <Card padded={false}>
            <CardHeader title={files.length ? tr("المرفقات · {0}", files.length) : tr("المرفقات")} action={can.edit && L?.drive ? <AttachButton letterId={l.id} /> : undefined} />
            {files.length ? files.map((f) => (
              <div key={f.id} className="flex items-center gap-3 border-t border-line px-5 py-2.5">
                <button type="button" className="inline-flex min-w-0 flex-1 items-center gap-2 text-start text-accent-fg cursor-pointer" onClick={() => view(f.id)}>
                  <Icon name={f.isImage ? 'eye' : 'file'} size={16} /><span className="truncate">{f.fileName.replace(/^(IN|OUT)-\d{4}-\d+_/, '')}</span>
                </button>
                <span className="text-[12px] text-muted">{f.uploadedByName}</span>
                {f.canDelete && <button type="button" aria-label={tr("حذف المرفق")} className="text-muted hover:text-bad cursor-pointer" onClick={() => delFile.mutate({ id: f.id })}><Icon name="x" size={14} /></button>}
              </div>
            )) : <p className="m-0 px-5 pb-4 text-[13px] text-muted">{L?.drive ? tr("صورة الخطاب أو ملف PDF حتى 10 ميجابايت.") : tr("رفع الملفات غير مفعّل بعد.")}</p>}
            {can.edit && L?.drive && files.length > 0 && <div className="border-t border-line px-5 py-3"><AttachButton letterId={l.id} variant="ghost" label={tr("إضافة مرفقات أخرى")} /></div>}
          </Card>

          <Card padded={false}>
            <CardHeader title={tr("سلسلة المراسلة")} />
            {!original && replies.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا أصل ولا ردود مرتبطة. سجّل الرد من زر «تسجيل الرد» ليُربط بهذا الخطاب.")}</p> : (
              <>
                {original && <div className="px-5 pt-1 text-[12px] text-muted">{tr("الأصل")}</div>}
                {original && <LetterLine l={original} />}
                {replies.length > 0 && <div className="border-t border-line px-5 pt-3 text-[12px] text-muted">{tr("الردود · {0}", replies.length)}</div>}
                {replies.map((r) => <LetterLine key={r.id} l={r} />)}
              </>
            )}
          </Card>
        </div>

        <Card padded={false}>
          <CardHeader title={tr("سجل التتبع")} />
          {log.length === 0 ? <EmptyState title={tr("لا أحداث")} /> : (
            <ol className="m-0 flex list-none flex-col p-0">
              {log.map((x) => (
                <li key={x.id} className="flex gap-2 border-t border-line px-5 py-2.5 text-[13px]">
                  <Icon name={x.kind === 'forward' ? 'user' : x.kind === 'file' ? 'file' : x.kind === 'archive' ? 'archive' : 'history'} size={14} className="mt-0.5 shrink-0 text-muted" />
                  <span className="flex-1"><b className="font-semibold">{x.byName}</b> <span className="text-muted">{x.kindLabel} ·</span> {trServer(x.body)}</span>
                  <span className="shrink-0 text-[12px] text-muted" title={formatDateTime(x.at)}>{relativeTime(x.at)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {can.remove && <DangerZone label={tr("حذف الخطاب نهائياً")} onClick={() => setRemoving(true)} />}

      {editing && (
        <LetterDialog open onClose={() => setEditing(false)} onSaved={() => undefined}
          initial={{ id: l.id, direction: l.direction, subject: l.subject, summary: l.summary, party: l.party, clientId: l.clientId, date: l.date, refNo: l.refNo, channel: l.channel,
            category: l.category, dueDate: l.dueDate, assigneeId: l.assigneeId, projectId: l.projectId, linkedType: l.linkedType, linkedId: l.linkedId, linkedLabel: l.linkedLabel, tags: l.tags.join('، ') }} />
      )}
      {replying && (
        <LetterDialog open onClose={() => setReplying(false)}
          initial={{ direction: l.direction === 'in' ? 'out' : 'in', replyToId: l.id, replyToNumber: l.number, party: l.party, clientId: l.clientId, projectId: l.projectId,
            subject: tr("رد: {0}", l.subject), category: l.category, channel: l.channel || 'mail', assigneeId: l.assigneeId, linkedType: l.linkedType, linkedId: l.linkedId, linkedLabel: l.linkedLabel }} />
      )}
      <ForwardDialog open={forwarding} onClose={() => setForwarding(false)} letterId={l.id} current={l.assigneeId} people={L?.people || []} />
      <ReasonDialog open={archiving} onClose={() => setArchiving(false)} title={tr("أرشفة الخطاب")} label={tr("ملاحظة الأرشفة")} confirmLabel={tr("أرشفة")}
        onConfirm={(note) => status.mutateAsync({ id: l.id, status: 'archived', note }).then(() => setArchiving(false))}>
        <p className="m-0 text-[13px] text-muted">{tr("يختفي الخطاب من الوارد والصادر ويبقى في الأرشيف قابلاً للبحث. يعيده مدير المراسلات عند الحاجة.")}</p>
      </ReasonDialog>
      <Dialog open={removing} onClose={() => setRemoving(false)} title={tr("حذف الخطاب نهائياً")}
        footer={<><Button variant="danger" className="flex-1" loading={remove.isPending} onClick={() => remove.mutate({ id: l.id })}>{tr("حذف نهائياً")}</Button>
          <Button variant="ghost" onClick={() => setRemoving(false)}>{tr("تراجع")}</Button></>}>
        <p className="m-0">{tr("تُحذف مرفقاته وسجل تتبعه ولا يمكن التراجع. لإخفائه مع بقاء سجله استخدم «أرشفة». لا يُحذف خطاب له ردود مرتبطة.")}</p>
      </Dialog>
    </div>
  );
}

/** إحالة الخطاب إلى مسؤول آخر مع ملاحظة */
function ForwardDialog({ open, onClose, letterId, current, people }: { open: boolean; onClose: () => void; letterId: string; current: string; people: { id: string; name: string }[] }) {
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const act = useAction<Record<string, unknown>>('cor.forward', { invalidate: COR_KEYS, silentError: true, success: tr("أُحيل الخطاب"), onSuccess: () => { onClose(); setTo(''); setNote(''); } });
  return (
    <Dialog open={open} onClose={onClose} title={tr("إحالة الخطاب")} onSubmit={() => { setError(''); act.mutate({ id: letterId, assigneeId: to, note }, { onError: (e) => setError(e.message) }); }}
      footer={<><Button type="submit" variant="primary" className="flex-1" loading={act.isPending}>{tr("إحالة")}</Button><Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <div className="flex flex-col gap-3">
        <Select label={tr("إلى")} required value={to} onChange={(e) => setTo(e.target.value)}
          options={[{ value: '', label: tr("اختر") }, ...people.filter((p) => p.id !== current).map((p) => ({ value: p.id, label: p.name }))]} hint={tr("يصل إشعار إلى المحال إليه ويصبح مسؤولاً عن المتابعة")} />
        <Textarea label={tr("ملاحظة (اختياري)")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}
