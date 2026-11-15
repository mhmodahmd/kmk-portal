import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { tr } from '../../lib/i18n';
import { api } from '../../lib/api';
import { useAction, useApi } from '../../lib/useApi';
import { Badge } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Select, TextInput, Textarea } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { cx } from '../../ui/cx';
import { kwd, toInput } from '../custody/shared';
import { ACCEPT, filePayload } from '../custody/files';
import type { ActivityView, ClientView, ContactView, CrmLookups, PaymentView, ProjectView, ProposalView } from './types';

export { kwd, toInput };
export const CRM_KEYS = ['crm.clients', 'crm.client', 'crm.projects', 'crm.project', 'crm.payments', 'crm.proposals', 'crm.activities', 'crm.pipeline', 'crm.home', 'crm.report', 'tsk.list'];
export const useCrmLookups = () => useApi<CrmLookups>('crm.lookups', {}, { staleTime: 5 * 60_000 });

export function Money({ fils, className }: { fils: number; className?: string }) {
  return <span className={cx('ltr inline-block num', fils < 0 && 'text-bad', className)}>{kwd(fils)}</span>;
}

const P_TONE: Record<ProjectView['status'], 'ok' | 'info' | 'warn' | 'neutral'> = { ongoing: 'info', on_hold: 'warn', completed: 'ok', cancelled: 'neutral' };
export const ProjectBadge = ({ p }: { p: Pick<ProjectView, 'status' | 'statusLabel'> }) => <Badge tone={P_TONE[p.status]}>{p.statusLabel}</Badge>;
const PR_TONE: Record<ProposalView['status'], 'ok' | 'info' | 'warn' | 'bad' | 'neutral'> = { draft: 'neutral', negotiation: 'warn', accepted: 'ok', rejected: 'bad' };
export const ProposalBadge = ({ p }: { p: Pick<ProposalView, 'status' | 'statusLabel'> }) => <Badge tone={PR_TONE[p.status]}>{p.statusLabel}</Badge>;
export function StageChip({ c }: { c: Pick<ClientView, 'stageName' | 'stageColor'> }) {
  if (!c.stageName) return null;
  return <span className="inline-flex items-center gap-1.5 text-[12px] text-muted"><span className="h-2 w-2 rounded-full" style={{ background: c.stageColor }} />{c.stageName}</span>;
}

/** مؤشر التحصيل: المحصّل من العقد، أو المحصّل فقط للمفتوح */
export function CollectBar({ p }: { p: ProjectView }) {
  if (p.billing === 'open') return <span className="text-[13px] text-muted">{tr("محصّل")} <Money fils={p.paid} /></span>;
  const pct = Math.min(100, p.percent);
  return (
    <div className="flex min-w-[140px] flex-col gap-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-chip"><div className={cx('h-full rounded-full', p.overCollected ? 'bg-warn' : 'bg-ok')} style={{ width: pct + '%' }} /></div>
      <span className="text-[12px] text-muted num">{tr("{0}% · المتبقي", p.percent)} <Money fils={Math.max(0, p.remaining)} /></span>
    </div>
  );
}

const Err = ({ e }: { e: string }) => (e ? <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{e}</div> : null);
const Grid = ({ children }: { children: ReactNode }) => <div className="grid gap-3 sm:grid-cols-2">{children}</div>;

function FormDialog({ open, onClose, title, action, payload, success, children, wide, onSaved }: {
  open: boolean; onClose: () => void; title: string; action: string; payload: () => Record<string, unknown>; success: string; children: ReactNode; wide?: boolean; onSaved?: (r: unknown) => void;
}) {
  const [error, setError] = useState('');
  const act = useAction<Record<string, unknown>, unknown>(action, { invalidate: CRM_KEYS, success, silentError: true, onSuccess: (r) => { onClose(); onSaved?.(r); } });
  return (
    <Dialog open={open} onClose={onClose} title={title} wide={wide}
      footer={<><Button variant="primary" className="flex-1" loading={act.isPending} onClick={() => { setError(''); act.mutate(payload(), { onError: (e) => setError(e.message) }); }}>{tr("حفظ")}</Button>
        <Button variant="ghost" onClick={onClose}>{tr("إلغاء")}</Button></>}>
      <div className="flex flex-col gap-3">{children}<Err e={error} /></div>
    </Dialog>
  );
}

const opts = (list: { id: string; label: string }[]) => list.map((o) => ({ value: o.id, label: o.label }));

export function ClientDialog({ open, onClose, client, onSaved }: { open: boolean; onClose: () => void; client?: ClientView | null; onSaved?: (c: ClientView) => void }) {
  const L = useCrmLookups().data;
  const [f, setF] = useState(() => ({
    name: client?.name || '', type: client?.type || 'company', category: client?.category || 'lead', status: client?.status || 'active',
    phone: client?.phone || '', phone2: client?.phone2 || '', email: client?.email || '', workplace: client?.workplace || '', nationality: client?.nationality || '',
    country: client?.country || 'الكويت', city: client?.city || '', address: client?.address || '', notes: client?.notes || '', assignedTo: client?.assignedTo ?? L?.me ?? ''
  }));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <FormDialog open={open} onClose={onClose} wide title={client ? tr("تعديل العميل") : tr("عميل جديد")} action="crm.client.save" success={tr("حُفظ العميل")}
      payload={() => ({ ...f, id: client?.id })} onSaved={(r) => onSaved?.(r as ClientView)}>
      <TextInput label={tr("الاسم")} value={f.name} onChange={set('name')} maxLength={120} autoFocus />
      <Grid>
        <Select label={tr("النوع")} value={f.type} onChange={set('type')} options={opts(L?.clientTypes || [])} />
        <Select label={tr("الفئة")} value={f.category} onChange={set('category')} options={opts(L?.categories || [])} />
        <Select label={tr("الحالة")} value={f.status} onChange={set('status')} options={opts(L?.statuses || [])} />
        <Select label={tr("المسؤول")} value={f.assignedTo} onChange={set('assignedTo')} options={[{ value: '', label: tr("بلا مسؤول") }, ...(L?.people || []).map((p) => ({ value: p.id, label: p.name }))]} />
        <TextInput label={tr("الهاتف")} ltr inputMode="tel" value={f.phone} onChange={set('phone')} />
        <TextInput label={tr("هاتف آخر")} ltr inputMode="tel" value={f.phone2} onChange={set('phone2')} />
        <TextInput label={tr("البريد الإلكتروني")} ltr type="email" value={f.email} onChange={set('email')} />
        <TextInput label={tr("جهة العمل")} value={f.workplace} onChange={set('workplace')} />
        <TextInput label={tr("الجنسية")} value={f.nationality} onChange={set('nationality')} />
        <TextInput label={tr("الدولة")} value={f.country} onChange={set('country')} />
        <TextInput label={tr("المدينة")} value={f.city} onChange={set('city')} />
        <TextInput label={tr("العنوان")} value={f.address} onChange={set('address')} />
      </Grid>
      <Textarea label={tr("ملاحظات")} value={f.notes} onChange={set('notes')} />
    </FormDialog>
  );
}

export function ContactDialog({ open, onClose, clientId, contact }: { open: boolean; onClose: () => void; clientId: string; contact?: ContactView | null }) {
  const [f, setF] = useState(() => ({ name: contact?.name || '', jobTitle: contact?.jobTitle || '', phone: contact?.phone || '', email: contact?.email || '', nationality: contact?.nationality || '', notes: contact?.notes || '' }));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <FormDialog open={open} onClose={onClose} title={contact ? tr("تعديل جهة الاتصال") : tr("جهة اتصال جديدة")} action="crm.contact.save" success={tr("حُفظت جهة الاتصال")}
      payload={() => ({ ...f, id: contact?.id, clientId })}>
      <TextInput label={tr("الاسم")} value={f.name} onChange={set('name')} autoFocus />
      <Grid>
        <TextInput label={tr("المسمى الوظيفي")} value={f.jobTitle} onChange={set('jobTitle')} />
        <TextInput label={tr("الهاتف")} ltr inputMode="tel" value={f.phone} onChange={set('phone')} />
        <TextInput label={tr("البريد الإلكتروني")} ltr type="email" value={f.email} onChange={set('email')} />
        <TextInput label={tr("الجنسية")} value={f.nationality} onChange={set('nationality')} />
      </Grid>
      <Textarea label={tr("ملاحظات")} value={f.notes} onChange={set('notes')} />
    </FormDialog>
  );
}

export function ProjectDialog({ open, onClose, project, clientId, clients, onSaved }: {
  open: boolean; onClose: () => void; project?: ProjectView | null; clientId?: string; clients?: { id: string; name: string }[]; onSaved?: (p: ProjectView) => void;
}) {
  const L = useCrmLookups().data;
  const [f, setF] = useState(() => ({
    name: project?.name || '', clientId: project?.clientId || clientId || '', type: project?.type || '', billing: project?.billing || 'fixed',
    contractValue: toInput(project?.contractValue || 0), startDate: project ? project.startDate : L?.today || '', endDate: project?.endDate || '',
    status: project?.status || 'ongoing', notes: project?.notes || '', reviewed: false
  }));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <FormDialog open={open} onClose={onClose} wide title={project ? tr("تعديل المشروع") : tr("مشروع جديد")} action="crm.project.save" success={tr("حُفظ المشروع")}
      payload={() => ({ ...f, id: project?.id, parentId: project?.parentId })} onSaved={(r) => onSaved?.(r as ProjectView)}>
      {project?.needsReview && (
        <div className="rounded-lg bg-warn-bg px-3 py-2.5 text-warn">
          <p className="m-0">{project.reviewNote}</p>
          <label className="mt-2 flex items-center gap-2 font-semibold"><input type="checkbox" className="h-4 w-4 accent-accent" checked={f.reviewed} onChange={(e) => setF({ ...f, reviewed: e.target.checked })} />{tr("راجعته وصحّحته")}</label>
        </div>
      )}
      <TextInput label={tr("اسم المشروع")} value={f.name} onChange={set('name')} autoFocus />
      <Grid>
        {clients && <Select label={tr("العميل")} value={f.clientId} onChange={set('clientId')} options={[{ value: '', label: tr("اختر العميل") }, ...clients.map((c) => ({ value: c.id, label: c.name }))]} />}
        <TextInput label={tr("النوع")} value={f.type} onChange={set('type')} list="crm-project-types" />
        <Select label={tr("الحالة")} value={f.status} onChange={set('status')} options={opts(L?.projectStatuses || [])} />
        <Select label={tr("الفوترة")} value={f.billing} onChange={set('billing')} options={opts(L?.billing || [])}
          hint={f.billing === 'open' ? tr("بلا قيمة ثابتة: يُعرض المحصّل فقط ولا يُحسب متبقٍ") : undefined} />
        {f.billing === 'fixed' && <TextInput label={tr("قيمة العقد (د.ك)")} ltr inputMode="decimal" value={f.contractValue} onChange={set('contractValue')} />}
        <TextInput label={tr("البداية")} type="date" ltr value={f.startDate} onChange={set('startDate')} />
        <TextInput label={tr("النهاية")} type="date" ltr value={f.endDate} onChange={set('endDate')} />
      </Grid>
      <datalist id="crm-project-types">{(L?.projectTypes || []).map((t) => <option key={t} value={t} />)}</datalist>
      <Textarea label={tr("ملاحظات")} value={f.notes} onChange={set('notes')} />
    </FormDialog>
  );
}

export function PaymentDialog({ open, onClose, projectId, payment }: { open: boolean; onClose: () => void; projectId: string; payment?: PaymentView | null }) {
  const L = useCrmLookups().data;
  const [f, setF] = useState(() => ({
    amount: toInput(payment?.amount || 0), status: payment?.status || 'paid', kind: payment?.kind || 'partial', method: payment?.method || 'transfer',
    date: payment?.date || L?.today || '', invoiceNo: payment?.invoiceNo || '', recipient: payment?.recipient || '', notes: payment?.notes || '', attachmentUrl: payment?.attachmentUrl || ''
  }));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <FormDialog open={open} onClose={onClose} title={payment ? tr("تعديل الدفعة") : tr("دفعة جديدة")} action="crm.payment.save" success={tr("حُفظت الدفعة")}
      payload={() => ({ ...f, id: payment?.id, projectId })}>
      <Grid>
        <TextInput label={tr("المبلغ (د.ك)")} ltr inputMode="decimal" value={f.amount} onChange={set('amount')} autoFocus />
        <Select label={tr("الحالة")} value={f.status} onChange={set('status')} options={[{ value: 'paid', label: tr("محصّلة") }, { value: 'scheduled', label: tr("مجدولة (موعد قادم)") }]} />
        <TextInput label={f.status === 'paid' ? tr("تاريخ التحصيل") : tr("موعد الاستحقاق")} type="date" ltr value={f.date} onChange={set('date')} />
        <Select label={tr("النوع")} value={f.kind} onChange={set('kind')} options={opts(L?.payKinds || [])} />
        <Select label={tr("طريقة الدفع")} value={f.method} onChange={set('method')} options={opts(L?.payMethods || [])} />
        <TextInput label={tr("رقم الفاتورة")} ltr value={f.invoiceNo} onChange={set('invoiceNo')} />
        <TextInput label={tr("المستلم")} value={f.recipient} onChange={set('recipient')} />
        <TextInput label={tr("رابط المرفق (اختياري)")} ltr value={f.attachmentUrl} onChange={set('attachmentUrl')} placeholder="https://" />
      </Grid>
      <Textarea label={tr("ملاحظات")} value={f.notes} onChange={set('notes')} className="[&_textarea]:min-h-[60px]" />
    </FormDialog>
  );
}

export function ProposalDialog({ open, onClose, clientId, proposal }: { open: boolean; onClose: () => void; clientId: string; proposal?: ProposalView | null }) {
  const L = useCrmLookups().data;
  const [f, setF] = useState(() => ({ name: proposal?.name || '', type: proposal?.type || '', value: toInput(proposal?.value || 0), issueDate: proposal?.issueDate || L?.today || '', notes: proposal?.notes || '', attachmentUrl: proposal?.attachmentUrl || '' }));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <FormDialog open={open} onClose={onClose} title={proposal ? tr("تعديل العرض") : tr("عرض سعر جديد")} action="crm.proposal.save" success={tr("حُفظ العرض")}
      payload={() => ({ ...f, id: proposal?.id, clientId })}>
      <TextInput label={tr("اسم العرض")} value={f.name} onChange={set('name')} autoFocus />
      <Grid>
        <TextInput label={tr("القيمة (د.ك)")} ltr inputMode="decimal" value={f.value} onChange={set('value')} />
        <TextInput label={tr("التاريخ")} type="date" ltr value={f.issueDate} onChange={set('issueDate')} />
        <TextInput label={tr("النوع")} value={f.type} onChange={set('type')} list="crm-project-types" />
        <TextInput label={tr("رابط العرض (اختياري)")} ltr value={f.attachmentUrl} onChange={set('attachmentUrl')} placeholder="https://" />
      </Grid>
      <datalist id="crm-project-types">{(L?.projectTypes || []).map((t) => <option key={t} value={t} />)}</datalist>
      <Textarea label={tr("ملاحظات")} value={f.notes} onChange={set('notes')} />
    </FormDialog>
  );
}

export function ActivityDialog({ open, onClose, clientId, contacts, projects, activity }: {
  open: boolean; onClose: () => void; clientId: string; contacts: ContactView[]; projects: ProjectView[]; activity?: ActivityView | null;
}) {
  const L = useCrmLookups().data;
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [f, setF] = useState(() => ({
    type: activity?.type || 'meeting', title: activity?.title || '', description: activity?.description || '', at: activity?.at ? new Date(activity.at).toISOString().slice(0, 16) : now,
    durationMin: activity?.durationMin ? String(activity.durationMin) : '', location: activity?.location || '', contactId: '', projectId: activity?.projectId || '',
    userId: activity?.userId || L?.me || '', followUpDate: activity?.followUpDate || '', notes: activity?.notes || ''
  }));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <FormDialog open={open} onClose={onClose} wide title={activity ? tr("تعديل النشاط") : tr("نشاط جديد")} action="crm.activity.save" success={tr("سُجّل النشاط")}
      payload={() => ({ ...f, id: activity?.id, clientId, at: new Date(f.at).toISOString() })}>
      <Grid>
        <Select label={tr("النوع")} value={f.type} onChange={set('type')} options={opts(L?.activityTypes || [])} />
        <TextInput label={tr("الوقت")} type="datetime-local" ltr value={f.at} onChange={set('at')} />
      </Grid>
      <TextInput label={tr("الموضوع")} value={f.title} onChange={set('title')} autoFocus />
      <Textarea label={tr("ما الذي حدث؟")} value={f.description} onChange={set('description')} />
      <Grid>
        {contacts.length > 0 && <Select label={tr("جهة الاتصال")} value={f.contactId} onChange={set('contactId')} options={[{ value: '', label: '—' }, ...contacts.map((c) => ({ value: c.id, label: c.name }))]} />}
        {projects.length > 0 && <Select label={tr("المشروع")} value={f.projectId} onChange={set('projectId')} options={[{ value: '', label: '—' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />}
        <Select label={tr("الموظف")} value={f.userId} onChange={set('userId')} options={(L?.people || []).map((p) => ({ value: p.id, label: p.name }))} />
        <TextInput label={tr("المدة (دقيقة)")} ltr inputMode="numeric" value={f.durationMin} onChange={set('durationMin')} />
        <TextInput label={tr("المكان")} value={f.location} onChange={set('location')} />
        <TextInput label={tr("موعد المتابعة القادمة")} type="date" ltr value={f.followUpDate} onChange={set('followUpDate')}
          hint={f.followUpDate && !activity?.followUpTaskId ? tr("ستُنشأ مهمة متابعة للموظف في هذا الموعد") : undefined} />
      </Grid>
    </FormDialog>
  );
}

/** رابط أو ملف على عميل أو مشروع */
export function LinkDialog({ open, onClose, ownerType, ownerId }: { open: boolean; onClose: () => void; ownerType: 'client' | 'project'; ownerId: string }) {
  const L = useCrmLookups().data;
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setError(''); setBusy(true);
    try {
      await api('crm.link.save', { ownerType, ownerId, title: title || file?.name, ...(file ? await filePayload(file) : { url }) });
      CRM_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : tr("تعذّر الحفظ.")); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={tr("إضافة مستند أو رابط")}
      footer={<><Button variant="primary" className="flex-1" loading={busy} onClick={save}>{tr("حفظ")}</Button><Button variant="ghost" onClick={onClose}>{tr("إلغاء")}</Button></>}>
      <div className="flex flex-col gap-3">
        <TextInput label={tr("العنوان")} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <TextInput label={tr("الرابط")} ltr value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" disabled={!!file} />
        {L?.drive && (
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-accent-fg">
            {file ? tr("الملف: {0}", file.name) : tr("أو ارفع ملفاً (صورة أو PDF حتى 10 ميجابايت)")}
            <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
        )}
        <Err e={error} />
      </div>
    </Dialog>
  );
}
