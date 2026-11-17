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
import { dmy } from '../../lib/format';
import { ACCEPT, filePayload } from '../custody/files';
import type { ActivityView, ClientDetail, ClientView, ContactView, CrmLookups, PaymentView, ProjectView, ProposalView } from './types';

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
  if (p.billing === 'open') {
    if (!p.cycle) return <span className="text-[13px] text-muted">{tr("محصّل")} <Money fils={p.paid} /></span>;
    if (p.cycle.future) return <span className="text-[13px] text-muted">{tr("يبدأ {0}", dmy(p.cycle.start))}</span>;
    return (
      <div className="flex min-w-[140px] flex-col gap-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-chip"><div className={cx('h-full rounded-full', p.cycle.due ? 'bg-warn' : 'bg-ok')} style={{ width: Math.min(100, p.percent) + '%' }} /></div>
        <span className="text-[12px] text-muted num">{p.cycle.due ? tr("مستحق للدورة {0}", kwd(p.cycle.due)) : tr("دورة {0} محصّلة", p.billingCycleLabel)} · {tr("حتى {0}", dmy(p.cycle.end))}</span>
      </div>
    );
  }
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
      onSubmit={() => { setError(''); act.mutate(payload(), { onError: (e) => setError(e.message) }); }} footer={<><Button type="submit" variant="primary" className="flex-1" loading={act.isPending}>{tr("حفظ")}</Button>
        <Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <div className="flex flex-col gap-3">{children}<Err e={error} /></div>
    </Dialog>
  );
}

const opts = (list: { id: string; label: string }[]) => list.map((o) => ({ value: o.id, label: o.label }));

/** قائمة العملاء للاختيار داخل حوار (تُحمَّل عند الحاجة فقط) */
function useClientOptions(enabled: boolean) {
  const q = useApi<ClientView[]>('crm.clients', {}, { enabled, staleTime: 60_000 });
  return [{ value: '', label: tr("اختر العميل") }, ...(q.data || []).map((c) => ({ value: c.id, label: c.name }))];
}
/** تفاصيل عميل مختار (مشاريعه وجهات اتصاله) */
function useClientPick(clientId: string) {
  return useApi<ClientDetail>('crm.client', { id: clientId }, { enabled: !!clientId, staleTime: 30_000 });
}

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
      <TextInput label={tr("الاسم")} required value={f.name} onChange={set('name')} maxLength={120} autoFocus />
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
      <TextInput label={tr("الاسم")} required value={f.name} onChange={set('name')} autoFocus />
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
    billingCycle: project?.billingCycle || '', cycleAmount: toInput(project?.cycleAmount || 0),
    status: project?.status || 'ongoing', notes: project?.notes || '', reviewed: false,
    platformId: project?.platformId || '', centerId: project?.centerId || '', campaignId: project?.campaignId || '', revenueKind: project?.revenueKind || ''
  }));
  const PL = L?.platformLinks;
  const setPlatform = (e: { target: { value: string } }) => setF({ ...f, platformId: e.target.value, centerId: '', campaignId: '', revenueKind: e.target.value ? f.revenueKind || 'sponsorship' : '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <FormDialog open={open} onClose={onClose} wide title={project ? tr("تعديل المشروع") : tr("مشروع جديد")} action="crm.project.save" success={tr("حُفظ المشروع")}
      payload={() => { const { platformId, centerId, campaignId, revenueKind, ...rest } = f; return { ...rest, id: project?.id, parentId: project?.parentId, ...(PL ? { platformId, centerId, campaignId, revenueKind } : {}) }; }} onSaved={(r) => onSaved?.(r as ProjectView)}>
      {project?.needsReview && (
        <div className="rounded-lg bg-warn-bg px-3 py-2.5 text-warn">
          <p className="m-0">{project.reviewNote}</p>
          <label className="mt-2 flex items-center gap-2 font-semibold"><input type="checkbox" className="h-4 w-4 accent-accent" checked={f.reviewed} onChange={(e) => setF({ ...f, reviewed: e.target.checked })} />{tr("راجعته وصحّحته")}</label>
        </div>
      )}
      <TextInput label={tr("اسم المشروع")} required value={f.name} onChange={set('name')} autoFocus />
      <Grid>
        {clients && <Select label={tr("العميل")} required value={f.clientId} onChange={set('clientId')} options={[{ value: '', label: tr("اختر العميل") }, ...clients.map((c) => ({ value: c.id, label: c.name }))]} />}
        <TextInput label={tr("النوع")} value={f.type} onChange={set('type')} list="crm-project-types" />
        <Select label={tr("الحالة")} value={f.status} onChange={set('status')} options={opts(L?.projectStatuses || [])} />
        <Select label={tr("الفوترة")} value={f.billing} onChange={set('billing')} options={opts(L?.billing || [])}
          hint={f.billing === 'open' ? tr("بلا قيمة ثابتة: يُعرض المحصّل فقط ولا يُحسب متبقٍ") : undefined} />
        {f.billing === 'fixed' && <TextInput label={tr("قيمة العقد (د.ك)")} required ltr inputMode="decimal" value={f.contractValue} onChange={set('contractValue')} />}
        {f.billing === 'open' && (
          <Select label={tr("دورة الفوترة")} value={f.billingCycle} onChange={set('billingCycle')} options={[{ value: '', label: tr("بلا دورة (يُدفع عند الحاجة)") }, ...opts(L?.cycles || [])]}
            hint={f.billingCycle ? tr("تبدأ الدورات من تاريخ البداية، ويُحسب مستحق كل دورة من دفعاتها") : undefined} />
        )}
        {f.billing === 'open' && f.billingCycle && <TextInput label={tr("قيمة الدورة (د.ك)")} ltr inputMode="decimal" value={f.cycleAmount} onChange={set('cycleAmount')} />}
        <TextInput label={tr("البداية")} type="date" required ltr value={f.startDate} onChange={set('startDate')} />
        <TextInput label={tr("النهاية")} type="date" ltr value={f.endDate} onChange={set('endDate')} />
      </Grid>
      {PL && PL.platforms.length > 0 && (
        <Grid>
          <Select label={tr("ينفّذ في")} value={f.platformId} onChange={setPlatform} options={[{ value: '', label: tr("لا منصة") }, ...PL.platforms.map((p) => ({ value: p.id, label: p.name }))]}
            hint={tr("اربط رعايات المراكز والمسابقات وعقود الجهات بالمنصة لتظهر في إيراداتها")} />
          {f.platformId && <Select label={tr("نوع الإيراد")} value={f.revenueKind} onChange={set('revenueKind')} options={opts(PL.revenueKinds)} />}
          {f.platformId && <Select label={tr("المركز")} value={f.centerId} onChange={(e) => setF({ ...f, centerId: e.target.value, campaignId: '' })}
            options={[{ value: '', label: tr("بلا مركز") }, ...PL.centers.filter((c) => c.platformId === f.platformId).map((c) => ({ value: c.id, label: c.name }))]} />}
          {f.platformId && <Select label={tr("المسابقة أو التحدي")} value={f.campaignId} onChange={set('campaignId')}
            options={[{ value: '', label: tr("بلا مسابقة") }, ...PL.campaigns.filter((c) => c.platformId === f.platformId && (!f.centerId || !c.centerId || c.centerId === f.centerId)).map((c) => ({ value: c.id, label: c.name }))]} />}
        </Grid>
      )}
      <datalist id="crm-project-types">{(L?.projectTypes || []).map((t) => <option key={t} value={t} />)}</datalist>
      <Textarea label={tr("ملاحظات")} value={f.notes} onChange={set('notes')} />
    </FormDialog>
  );
}

export function PaymentDialog({ open, onClose, projectId, payment, defaultAmount }: { open: boolean; onClose: () => void; projectId?: string; payment?: PaymentView | null; defaultAmount?: number }) {
  const L = useCrmLookups().data;
  const pick = !projectId && !payment;
  const [sel, setSel] = useState({ clientId: '', projectId: '' });
  const clients = useClientOptions(pick);
  const detail = useClientPick(pick ? sel.clientId : '');
  const projects = (detail.data?.projects || []).filter((p) => p.status === 'ongoing' || p.status === 'on_hold');
  const [f, setF] = useState(() => ({
    amount: toInput(payment?.amount || defaultAmount || 0), status: payment?.status || 'paid', kind: payment?.kind || 'partial', method: payment?.method || 'transfer',
    date: payment?.date || L?.today || '', invoiceNo: payment?.invoiceNo || '', recipient: payment?.recipient || '', notes: payment?.notes || '', attachmentUrl: payment?.attachmentUrl || ''
  }));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <FormDialog open={open} onClose={onClose} title={payment ? tr("تعديل الدفعة") : tr("دفعة جديدة")} action="crm.payment.save" success={tr("حُفظت الدفعة")}
      payload={() => ({ ...f, id: payment?.id, projectId: projectId || payment?.projectId || sel.projectId })}>
      {pick && (
        <Grid>
          <Select label={tr("العميل")} required value={sel.clientId} onChange={(e) => setSel({ clientId: e.target.value, projectId: '' })} options={clients} autoFocus />
          <Select label={tr("المشروع")} required value={sel.projectId} onChange={(e) => setSel({ ...sel, projectId: e.target.value })} disabled={!sel.clientId}
            hint={sel.clientId && detail.data && !projects.length ? tr("لا مشاريع جارية لهذا العميل") : undefined}
            options={[{ value: '', label: tr("اختر المشروع") }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
        </Grid>
      )}
      <Grid>
        <TextInput label={tr("المبلغ (د.ك)")} required ltr inputMode="decimal" value={f.amount} onChange={set('amount')} autoFocus={!pick} />
        <Select label={tr("الحالة")} value={f.status} onChange={set('status')} options={[{ value: 'paid', label: tr("محصّلة") }, { value: 'scheduled', label: tr("مجدولة (موعد قادم)") }]} />
        <TextInput label={f.status === 'paid' ? tr("تاريخ التحصيل") : tr("موعد الاستحقاق")} type="date" required ltr value={f.date} onChange={set('date')} />
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

export function ProposalDialog({ open, onClose, clientId, proposal }: { open: boolean; onClose: () => void; clientId?: string; proposal?: ProposalView | null }) {
  const L = useCrmLookups().data;
  const pick = !clientId && !proposal;
  const [selClient, setSelClient] = useState('');
  const clients = useClientOptions(pick);
  const [f, setF] = useState(() => ({ name: proposal?.name || '', type: proposal?.type || '', value: toInput(proposal?.value || 0), issueDate: proposal?.issueDate || L?.today || '', notes: proposal?.notes || '', attachmentUrl: proposal?.attachmentUrl || '' }));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <FormDialog open={open} onClose={onClose} title={proposal ? tr("تعديل العرض") : tr("عرض سعر جديد")} action="crm.proposal.save" success={tr("حُفظ العرض")}
      payload={() => ({ ...f, id: proposal?.id, clientId: clientId || proposal?.clientId || selClient })}>
      {pick && <Select label={tr("العميل")} required value={selClient} onChange={(e) => setSelClient(e.target.value)} options={clients} autoFocus />}
      <TextInput label={tr("اسم العرض")} required value={f.name} onChange={set('name')} autoFocus={!pick} />
      <Grid>
        <TextInput label={tr("القيمة (د.ك)")} required ltr inputMode="decimal" value={f.value} onChange={set('value')} />
        <TextInput label={tr("التاريخ")} type="date" required ltr value={f.issueDate} onChange={set('issueDate')} />
        <TextInput label={tr("النوع")} value={f.type} onChange={set('type')} list="crm-project-types" />
        <TextInput label={tr("رابط العرض (اختياري)")} ltr value={f.attachmentUrl} onChange={set('attachmentUrl')} placeholder="https://" />
      </Grid>
      <datalist id="crm-project-types">{(L?.projectTypes || []).map((t) => <option key={t} value={t} />)}</datalist>
      <Textarea label={tr("ملاحظات")} value={f.notes} onChange={set('notes')} />
    </FormDialog>
  );
}

export function ActivityDialog({ open, onClose, clientId, contacts: contactsIn, projects: projectsIn, activity }: {
  open: boolean; onClose: () => void; clientId?: string; contacts?: ContactView[]; projects?: ProjectView[]; activity?: ActivityView | null;
}) {
  const L = useCrmLookups().data;
  const pick = !clientId && !activity;
  const [selClient, setSelClient] = useState('');
  const clients = useClientOptions(pick);
  const detail = useClientPick(pick ? selClient : (!contactsIn && activity ? activity.clientId : ''));
  const contacts = contactsIn || detail.data?.contacts || [];
  const projects = projectsIn || detail.data?.projects || [];
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [f, setF] = useState(() => ({
    type: activity?.type || 'meeting', title: activity?.title || '', description: activity?.description || '', at: activity?.at ? new Date(activity.at).toISOString().slice(0, 16) : now,
    durationMin: activity?.durationMin ? String(activity.durationMin) : '', location: activity?.location || '', contactId: activity?.contactId || '', projectId: activity?.projectId || '',
    userId: activity?.userId || L?.me || '', followUpDate: activity?.followUpDate || '', notes: activity?.notes || ''
  }));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <FormDialog open={open} onClose={onClose} wide title={activity ? tr("تعديل النشاط") : tr("نشاط جديد")} action="crm.activity.save" success={tr("سُجّل النشاط")}
      payload={() => ({ ...f, id: activity?.id, clientId: clientId || activity?.clientId || selClient, at: new Date(f.at).toISOString() })}>
      {pick && <Select label={tr("العميل")} required value={selClient} onChange={(e) => { setSelClient(e.target.value); setF((x) => ({ ...x, contactId: '', projectId: '' })); }} options={clients} autoFocus />}
      <Grid>
        <Select label={tr("النوع")} value={f.type} onChange={set('type')} options={opts(L?.activityTypes || [])} />
        <TextInput label={tr("الوقت")} type="datetime-local" required ltr value={f.at} onChange={set('at')} />
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
      onSubmit={save} footer={<><Button type="submit" variant="primary" className="flex-1" loading={busy}>{tr("حفظ")}</Button><Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <div className="flex flex-col gap-3">
        <TextInput label={tr("العنوان")} required={!file} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus hint={file ? tr("إن تُرك فارغاً يُستخدم اسم الملف") : undefined} />
        <TextInput label={tr("الرابط")} type="url" required={!file} ltr value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" disabled={!!file} />
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
