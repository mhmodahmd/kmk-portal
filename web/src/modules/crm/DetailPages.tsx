import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { ApiError } from '../../lib/api';
import { useAction, useApi } from '../../lib/useApi';
import { dmy } from '../../lib/format';
import { Badge, Card, CardHeader, ErrorBox, Loader, DangerZone } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Facts } from '../../ui/Controls';
import { ReasonDialog } from '../../ui/Decide';
import { Dialog, useToast } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import { openFile } from '../custody/files';
import { QuickTaskButton, TaskRow } from '../tasks/shared';
import type { TaskView } from '../tasks/types';
import { useAuth } from '../../app/auth';
import { LinkedLetters } from '../correspondence/shared';
import { ActivityList } from './CrmPages';
import {
  ActivityDialog, CRM_KEYS, ClientDialog, CollectBar, ContactDialog, LinkDialog, Money, PaymentDialog, ProjectBadge, ProjectDialog, ProposalBadge,
  ProposalDialog, StageChip, kwd
} from './shared';
import type { ClientDetail, ContactView, LinkView, PaymentView, ProjectDetail, ProposalView } from './types';

function Links({ items, canEdit, onAdd }: { items: LinkView[]; canEdit: boolean; onAdd: () => void }) {
  const toast = useToast();
  const del = useAction('crm.link.remove', { invalidate: CRM_KEYS, success: tr("حُذف") });
  return (
    <Card padded={false}>
      <CardHeader title={tr("المستندات والروابط")} action={canEdit ? <Button size="sm" variant="ghost" icon="plus" onClick={onAdd}>{tr("إضافة")}</Button> : undefined} />
      {items.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا مستندات.")}</p> : items.map((l) => (
        <div key={l.id} className="flex items-center gap-3 border-t border-line px-5 py-2.5">
          {l.hasFile ? (
            <button type="button" className="inline-flex min-w-0 flex-1 items-center gap-2 text-start text-accent-fg cursor-pointer"
              onClick={() => openFile('crm.link.content', { id: l.id }).catch((e) => toast(e instanceof ApiError ? e.message : tr("تعذّر فتح الملف."), 'bad'))}>
              <Icon name="file" size={16} /><span className="truncate">{l.title}</span>
            </button>
          ) : (
            <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 flex-1 items-center gap-2 text-accent-fg no-underline"><Icon name="file" size={16} /><span className="truncate">{l.title}</span></a>
          )}
          {l.category && <span className="text-[12px] text-muted">{l.category}</span>}
          {canEdit && <button type="button" aria-label={tr("حذف")} className="text-muted hover:text-bad cursor-pointer" onClick={() => del.mutate({ id: l.id })}><Icon name="x" size={14} /></button>}
        </div>
      ))}
    </Card>
  );
}

function PaymentsTable({ items, canPay, onEdit, showProject }: { items: PaymentView[]; canPay: boolean; onEdit: (p: PaymentView) => void; showProject?: boolean }) {
  if (!items.length) return <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا دفعات.")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-start">
        <tbody>
          {items.map((d) => (
            <tr key={d.id} className="border-t border-line">
              <td className={cx('px-4 py-2.5 num', d.overdue && 'font-semibold text-bad')}>{dmy(d.date)}</td>
              {showProject && <td className="px-4 py-2.5 text-[13px]"><Link to={'/crm/projects/' + d.projectId} className="text-fg no-underline hover:underline">{d.projectName}</Link></td>}
              <td className="px-4 py-2.5"><Money fils={d.amount} /></td>
              <td className="px-4 py-2.5 text-[13px] text-muted">{[d.kindLabel, d.methodLabel, d.recipient].filter(Boolean).join(' · ')}</td>
              <td className="px-4 py-2.5 ltr text-right text-[13px]">{d.invoiceNo}</td>
              <td className="px-4 py-2.5"><Badge tone={d.status === 'paid' ? 'ok' : d.overdue ? 'bad' : 'warn'}>{d.overdue ? tr("متأخرة") : d.statusLabel}</Badge></td>
              <td className="px-2 py-2.5">{canPay && <Button size="sm" variant="ghost" icon="edit" onClick={() => onEdit(d)} aria-label={tr("تعديل")} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProposalRows({ items, canEdit }: { items: ProposalView[]; canEdit: boolean }) {
  const nav = useNavigate();
  const [rejecting, setRejecting] = useState<ProposalView | null>(null);
  const decide = useAction<{ id: string; status: string; reason?: string }, ProposalView>('crm.proposal.decide', {
    invalidate: CRM_KEYS, success: (r) => (r.status === 'accepted' ? tr("قُبل العرض وأُنشئ المشروع") : tr("حُفظ")),
    onSuccess: (r) => { if (r.status === 'accepted' && r.projectId) nav('/crm/projects/' + r.projectId); }
  });
  if (!items.length) return <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا عروض.")}</p>;
  return (
    <>
      {items.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{p.name}</span>
            <span className="text-[12px] text-muted num">{p.number} · {dmy(p.issueDate)}{p.attachmentUrl && <a href={p.attachmentUrl} target="_blank" rel="noreferrer" className="ms-2 text-accent-fg">{tr("الملف")}</a>}</span>
          </span>
          <Money fils={p.value} />
          <ProposalBadge p={p} />
          {canEdit && p.status === 'negotiation' && (
            <span className="flex gap-1">
              <Button size="sm" variant="primary" loading={decide.isPending} onClick={() => decide.mutate({ id: p.id, status: 'accepted' })}>{tr("قبول")}</Button>
              <Button size="sm" variant="ghost" onClick={() => setRejecting(p)}>{tr("رفض")}</Button>
            </span>
          )}
        </div>
      ))}
      <ReasonDialog open={!!rejecting} onClose={() => setRejecting(null)} title={tr("رفض العرض")} label={tr("سبب الرفض")} confirmLabel={tr("حفظ")}
        onConfirm={(reason) => decide.mutateAsync({ id: rejecting!.id, status: 'rejected', reason })} />
    </>
  );
}

export function ClientPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const q = useApi<ClientDetail>('crm.client', { id });
  const tasks = useApi<TaskView[]>('tsk.list', { view: 'any', linkedType: 'client', linkedId: id, old: true });
  const auth = useAuth();
  const hasCor = !!auth.user?.isSuperAdmin || !!auth.roles.correspondence;
  const [dlg, setDlg] = useState<'' | 'edit' | 'contact' | 'project' | 'proposal' | 'activity' | 'link'>('');
  const [contact, setContact] = useState<ContactView | null>(null);
  const [pay, setPay] = useState<PaymentView | null>(null);
  const [removing, setRemoving] = useState(false);
  const remove = useAction('crm.client.remove', { invalidate: CRM_KEYS, success: tr("حُذف العميل"), onSuccess: () => nav('/crm/clients') });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  const { client: c, contacts, projects, payments, proposals, activities, links, can } = q.data;
  const taskList = tasks.data || [];
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted">{c.typeLabel} · {c.categoryLabel}{c.status !== 'active' && <Badge tone="warn">{c.statusLabel}</Badge>}<StageChip c={c} /></span>
            <h2 className="m-0 text-[22px] font-bold">{c.name}</h2>
            {c.lostReason && <span className="text-[13px] text-bad">{tr("سبب الخسارة: {0}", c.lostReason)}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {can.edit && <Button variant="primary" icon="plus" onClick={() => setDlg('activity')}>{tr("نشاط")}</Button>}
            <QuickTaskButton variant="secondary" size="md" draft={{ linkedType: 'client', linkedId: c.id, linkedLabel: c.name }} />
            {can.edit && <Button variant="ghost" icon="edit" onClick={() => setDlg('edit')}>{tr("تعديل")}</Button>}
          </div>
        </div>
        <Facts cols={3} items={[
          { k: tr("المسؤول"), v: c.assignedName || '—' },
          { k: tr("الهاتف"), v: c.phone ? <a href={'tel:' + c.phone} className="ltr inline-block text-accent-fg no-underline">{c.phone}</a> : '—' },
          { k: tr("البريد"), v: c.email ? <a href={'mailto:' + c.email} className="ltr inline-block text-accent-fg no-underline">{c.email}</a> : '—' },
          { k: tr("المحصّل"), v: <Money fils={c.paid} /> },
          { k: tr("المتبقي على العقود"), v: <Money fils={c.remaining} /> },
          { k: tr("المكان"), v: [c.city, c.country].filter(Boolean).join('، ') || '—' },
          ...(c.legacyOwner ? [{ k: tr("المسؤول في النظام السابق"), v: c.legacyOwner }] : []),
          ...(c.workplace ? [{ k: tr("جهة العمل"), v: c.workplace }] : [])
        ]} />
        {c.notes && <p className="m-0 whitespace-pre-wrap text-[13px] text-muted">{c.notes}</p>}
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-4">
          <Card padded={false}>
            <CardHeader title={tr("المشاريع · {0}", projects.length)} action={can.edit ? <Button size="sm" variant="ghost" icon="plus" onClick={() => setDlg('project')}>{tr("مشروع")}</Button> : undefined} />
            {projects.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا مشاريع.")}</p> : projects.map((p) => (
              <Link key={p.id} to={'/crm/projects/' + p.id} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3 text-fg no-underline hover:bg-chip/40">
                <span className="flex min-w-0 flex-1 flex-col"><span className="font-semibold">{p.name}</span><span className="text-[12px] text-muted">{[p.type, p.billing === 'fixed' ? kwd(p.contractValue) : p.billingLabel].filter(Boolean).join(' · ')}</span></span>
                <CollectBar p={p} />
                <span className="flex flex-col items-end gap-1"><ProjectBadge p={p} />{p.needsReview && <Badge tone="warn">{tr("تحتاج مراجعة")}</Badge>}</span>
              </Link>
            ))}
          </Card>
          <Card padded={false}>
            <CardHeader title={tr("الدفعات")} />
            <PaymentsTable items={payments} canPay={can.pay} onEdit={setPay} showProject />
          </Card>
          <Card padded={false}>
            <CardHeader title={tr("عروض الأسعار")} action={can.edit ? <Button size="sm" variant="ghost" icon="plus" onClick={() => setDlg('proposal')}>{tr("عرض")}</Button> : undefined} />
            <ProposalRows items={proposals} canEdit={can.edit} />
          </Card>
          <Card padded={false}>
            <CardHeader title={tr("المهام")} />
            {taskList.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا مهام مرتبطة.")}</p> : taskList.map((t) => <TaskRow key={t.id} t={t} showAssignee />)}
          </Card>
          {hasCor && <LinkedLetters filter={{ clientId: c.id }} draft={{ clientId: c.id, party: c.name }} />}
        </div>
        <div className="flex flex-col gap-4">
          <Card padded={false}>
            <CardHeader title={tr("جهات الاتصال")} action={can.edit ? <Button size="sm" variant="ghost" icon="plus" onClick={() => { setContact(null); setDlg('contact'); }}>{tr("إضافة")}</Button> : undefined} />
            {contacts.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا جهات اتصال.")}</p> : contacts.map((x) => (
              <button key={x.id} type="button" disabled={!can.edit} onClick={() => { setContact(x); setDlg('contact'); }} className="flex w-full flex-col gap-0.5 border-t border-line px-5 py-2.5 text-start enabled:cursor-pointer enabled:hover:bg-chip/40">
                <span className="font-semibold">{x.name}{x.jobTitle ? <span className="font-normal text-muted"> · {x.jobTitle}</span> : null}</span>
                <span className="text-[12px] text-muted"><span className="ltr inline-block">{x.phone}</span>{x.email ? ' · ' + x.email : ''}</span>
              </button>
            ))}
          </Card>
          <Card padded={false}>
            <CardHeader title={tr("سجل التواصل")} />
            <ActivityList items={activities} />
          </Card>
          <Links items={links} canEdit={can.edit} onAdd={() => setDlg('link')} />
        </div>
      </div>

      {can.remove && <DangerZone label={tr("حذف العميل نهائياً")} onClick={() => setRemoving(true)} />}
      {dlg === 'edit' && <ClientDialog open onClose={() => setDlg('')} client={c} />}
      {dlg === 'contact' && <ContactDialog open onClose={() => setDlg('')} clientId={c.id} contact={contact} />}
      {dlg === 'project' && <ProjectDialog open onClose={() => setDlg('')} clientId={c.id} onSaved={(p) => nav('/crm/projects/' + p.id)} />}
      {dlg === 'proposal' && <ProposalDialog open onClose={() => setDlg('')} clientId={c.id} />}
      {dlg === 'activity' && <ActivityDialog open onClose={() => setDlg('')} clientId={c.id} contacts={contacts} projects={projects} />}
      {dlg === 'link' && <LinkDialog open onClose={() => setDlg('')} ownerType="client" ownerId={c.id} />}
      {pay && <PaymentDialog open onClose={() => setPay(null)} projectId={pay.projectId} payment={pay} />}
      <Dialog open={removing} onClose={() => setRemoving(false)} title={tr("حذف العميل")}
        footer={<><Button variant="danger" className="flex-1" loading={remove.isPending} onClick={() => remove.mutate({ id: c.id })}>{tr("حذف نهائياً")}</Button><Button variant="ghost" onClick={() => setRemoving(false)}>{tr("تراجع")}</Button></>}>
        <p className="m-0">{tr("يُحذف العميل وجهات اتصاله وأنشطته وعروضه. لا يُحذف عميل له مشاريع.")}</p>
      </Dialog>
    </div>
  );
}


export function ProjectPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const q = useApi<ProjectDetail>('crm.project', { id });
  const tasks = useApi<TaskView[]>('tsk.list', { view: 'any', projectId: id, old: true });
  const auth = useAuth();
  const hasCor = !!auth.user?.isSuperAdmin || !!auth.roles.correspondence;
  const [dlg, setDlg] = useState<'' | 'edit' | 'pay' | 'link'>('');
  const [pay, setPay] = useState<PaymentView | null>(null);
  const [removing, setRemoving] = useState(false);
  const remove = useAction('crm.project.remove', { invalidate: CRM_KEYS, success: tr("حُذف المشروع"), silentError: false, onSuccess: () => nav('/crm/projects') });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  const { project: p, subprojects, payments, activities, proposals, links, can } = q.data;
  return (
    <div className="flex flex-col gap-4">
      {p.needsReview && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-warn-bg px-4 py-3 text-warn">
          <Icon name="alert" size={20} /><span className="flex-1">{p.reviewNote}</span>
          {can.edit && <Button size="sm" variant="secondary" onClick={() => setDlg('edit')}>{tr("مراجعة وتصحيح")}</Button>}
        </div>
      )}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted"><ProjectBadge p={p} />{p.type}{p.parentName && <Link to={'/crm/projects/' + p.parentId} className="text-accent-fg no-underline">{tr("فرعي من {0}", p.parentName)}</Link>}</span>
            <h2 className="m-0 text-[22px] font-bold">{p.name}</h2>
            <Link to={'/crm/clients/' + p.clientId} className="text-accent-fg no-underline">{p.clientName}</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {can.pay && <Button variant="primary" icon="plus" onClick={() => { setPay(null); setDlg('pay'); }}>{tr("دفعة")}</Button>}
            <QuickTaskButton variant="secondary" size="md" draft={{ projectId: p.id, linkedType: 'client', linkedId: p.clientId, linkedLabel: p.clientName }} />
            {can.edit && <Button variant="ghost" icon="edit" onClick={() => setDlg('edit')}>{tr("تعديل")}</Button>}
          </div>
        </div>
        <Facts cols={3} items={[
          { k: tr("الفوترة"), v: p.billingLabel },
          ...(p.billing === 'fixed' ? [{ k: tr("قيمة العقد"), v: <Money fils={p.contractValue} /> }] : []),
          { k: tr("المحصّل"), v: <Money fils={p.paid} /> },
          ...(p.billing === 'fixed' ? [{ k: tr("المتبقي"), v: <span className={cx(p.overCollected && 'text-warn')}><Money fils={p.remaining} />{p.overCollected ? ' · ' + tr("تجاوز العقد") : ''}</span> }] : []),
          ...(p.cycle ? [
            { k: tr("الاشتراك"), v: <span><Money fils={p.cycleAmount} /> · {p.billingCycleLabel}</span> },
            { k: p.cycle.future ? tr("تبدأ أول دورة") : tr("الدورة الحالية"), v: <span className="num">{dmy(p.cycle.start)} ← {dmy(p.cycle.end)}</span> },
            ...(p.cycle.future ? [] : [{ k: tr("مستحق هذه الدورة"), v: <span className={cx(p.cycle.due > 0 && 'font-semibold text-warn')}><Money fils={p.cycle.due} /></span> }])
          ] : []),
          { k: tr("مجدول"), v: p.scheduled ? <span><Money fils={p.scheduled} />{p.nextDue ? ' · ' + dmy(p.nextDue) : ''}</span> : '—' },
          { k: tr("المدة"), v: [p.startDate && dmy(p.startDate), p.endDate && dmy(p.endDate)].filter(Boolean).join(' ← ') || '—' },
          ...(p.spent ? [{ k: tr("مصروف العهد على المشروع"), v: <Money fils={p.spent} /> }] : [])
        ]} />
        {(p.billing === 'fixed' || p.cycle) && <CollectBar p={p} />}
        {p.notes && <p className="m-0 whitespace-pre-wrap text-[13px] text-muted">{p.notes}</p>}
      </Card>
      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-4">
          <Card padded={false}>
            <CardHeader title={tr("الدفعات · {0}", payments.length)} />
            <PaymentsTable items={payments} canPay={can.pay} onEdit={(d) => { setPay(d); setDlg('pay'); }} />
          </Card>
          <Card padded={false}>
            <CardHeader title={tr("المهام")} />
            {(tasks.data || []).length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا مهام مرتبطة.")}</p> : tasks.data!.map((t) => <TaskRow key={t.id} t={t} showAssignee />)}
          </Card>
          {hasCor && <LinkedLetters filter={{ projectId: p.id }} draft={{ projectId: p.id, clientId: p.clientId, party: p.clientName }} />}
          {subprojects.length > 0 && (
            <Card padded={false}>
              <CardHeader title={tr("مشاريع فرعية")} />
              {subprojects.map((s) => <Link key={s.id} to={'/crm/projects/' + s.id} className="flex items-center gap-3 border-t border-line px-5 py-3 text-fg no-underline hover:bg-chip/40"><span className="flex-1 font-semibold">{s.name}</span><ProjectBadge p={s} /></Link>)}
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {proposals.length > 0 && <Card padded={false}><CardHeader title={tr("العرض")} /><ProposalRows items={proposals} canEdit={false} /></Card>}
          <Card padded={false}><CardHeader title={tr("سجل التواصل")} /><ActivityList items={activities} /></Card>
          <Links items={links} canEdit={can.edit} onAdd={() => setDlg('link')} />
        </div>
      </div>
      {can.remove && <DangerZone label={tr("حذف المشروع نهائياً")} onClick={() => setRemoving(true)} />}
      {dlg === 'edit' && <ProjectDialog open onClose={() => setDlg('')} project={p} />}
      {dlg === 'pay' && <PaymentDialog open onClose={() => setDlg('')} projectId={p.id} payment={pay} defaultAmount={!pay && p.cycle ? p.cycle.due : 0} />}
      {dlg === 'link' && <LinkDialog open onClose={() => setDlg('')} ownerType="project" ownerId={p.id} />}
      <Dialog open={removing} onClose={() => setRemoving(false)} title={tr("حذف المشروع")}
        footer={<><Button variant="danger" className="flex-1" loading={remove.isPending} onClick={() => remove.mutate({ id: p.id })}>{tr("حذف نهائياً")}</Button><Button variant="ghost" onClick={() => setRemoving(false)}>{tr("تراجع")}</Button></>}>
        <p className="m-0">{tr("لا يُحذف مشروع عليه دفعات أو له مشاريع فرعية. لإيقافه اجعل حالته «ملغى».")}</p>
      </Dialog>
    </div>
  );
}
