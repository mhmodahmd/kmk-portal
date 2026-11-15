import { useMemo, useState, type DragEvent } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useAction, useApi } from '../../lib/useApi';
import { dmy, formatDateTime, kwMonth, monthLabel } from '../../lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Loader, PageHeader, StatTile } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { DataTable, SearchBox, Segmented, TabNav } from '../../ui/Controls';
import { Select, TextInput } from '../../ui/Field';
import { ReasonDialog } from '../../ui/Decide';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import { downloadCsv } from '../attendance/shared';
import { CRM_KEYS, ClientDialog, CollectBar, Money, ProjectBadge, ProjectDialog, ProposalBadge, StageChip, kwd, useCrmLookups } from './shared';
import type { ActivityView, ClientView, CrmHome, CrmReport, PaymentView, ProjectView, ProposalView } from './types';

export function CrmLayout() {
  const home = useApi<CrmHome>('crm.home', {}, { staleTime: 30_000 });
  const h = home.data;
  const items = [
    { to: '/crm', label: tr("نظرة عامة"), end: true },
    { to: '/crm/clients', label: tr("العملاء") },
    { to: '/crm/pipeline', label: tr("المسار") },
    { to: '/crm/projects', label: tr("المشاريع"), badge: h?.review || 0 },
    { to: '/crm/payments', label: tr("الدفعات"), badge: h?.overdue || 0 },
    { to: '/crm/proposals', label: tr("العروض") },
    { to: '/crm/activities', label: tr("الأنشطة") },
    { to: '/crm/reports', label: tr("التقارير") }
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="no-print"><PageHeader eyebrow={tr("العمل")} title={tr("العملاء")} /></div>
      <div className="no-print"><TabNav label={tr("أقسام العملاء")} items={items} /></div>
      <Outlet />
    </div>
  );
}

export function CrmHomePage() {
  const q = useApi<CrmHome>('crm.home');
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  const h = q.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
        <StatTile label={tr("العملاء")} value={h.clients} icon="crm" foot={<Link to="/crm/pipeline" className="text-accent-fg no-underline">{tr("{0} عميل محتمل", h.leads)}</Link>} />
        <StatTile label={tr("المشاريع الجارية")} value={h.ongoing} icon="briefcase" foot={h.review ? <Link to="/crm/projects?review=1" className="font-semibold text-warn no-underline">{tr("{0} تحتاج مراجعة", h.review)}</Link> : tr("لا مشاريع تحتاج مراجعة")} />
        <StatTile label={tr("المحصّل")} value={<Money fils={h.collected} />} icon="wallet" foot={tr("المتبقي على العقود الثابتة {0}", kwd(h.remaining))} />
        <StatTile label={tr("العروض قيد التفاوض")} value={h.openProposals} icon="file" foot={<Link to="/crm/proposals" className="text-accent-fg no-underline">{tr("كل العروض")}</Link>} />
      </div>
      <Card padded={false}>
        <CardHeader title={tr("دفعات مستحقة خلال أسبوعين")} action={<Link to="/crm/payments" className="text-[13px] font-semibold text-accent-fg no-underline">{tr("كل الدفعات")}</Link>} />
        {h.due.length === 0 ? <EmptyState title={tr("لا دفعات مستحقة قريباً")} /> : h.due.map((d) => <PaymentLine key={d.id} d={d} />)}
      </Card>
    </div>
  );
}

function PaymentLine({ d }: { d: PaymentView }) {
  return (
    <Link to={'/crm/projects/' + d.projectId} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3 text-fg no-underline first:border-t-0 hover:bg-chip/40">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{d.projectName}</span>
        <span className="text-[13px] text-muted">{d.clientName}{d.invoiceNo ? ' · ' + tr("فاتورة {0}", d.invoiceNo) : ''}</span>
      </span>
      <span className="flex flex-col items-end gap-0.5">
        <Money fils={d.amount} className="font-semibold" />
        <span className={cx('text-[12px] num', d.overdue ? 'font-semibold text-bad' : 'text-muted')}>{d.overdue ? tr("متأخرة منذ {0}", dmy(d.date)) : dmy(d.date)}</span>
      </span>
    </Link>
  );
}

export function ClientsPage() {
  const lk = useCrmLookups();
  const nav = useNavigate();
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const q = useApi<ClientView[]>('crm.clients', { category: category || undefined, status: status || undefined });
  const rows = useMemo(() => (q.data || []).filter((c) => !search.trim() || (c.name + ' ' + c.phone + ' ' + c.email).toLowerCase().includes(search.trim().toLowerCase())), [q.data, search]);
  const L = lk.data;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Segmented label={tr("الفئة")} value={category} onChange={setCategory} options={[{ value: '', label: tr("الكل") }, ...(L?.categories || []).map((c) => ({ value: c.id, label: c.label }))]} />
        <Select label={tr("الحالة")} className="w-36" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: '', label: tr("الكل") }, ...(L?.statuses || []).map((s) => ({ value: s.id, label: s.label }))]} />
        <div className="min-w-[200px] flex-1"><SearchBox id="crm-search" value={search} onChange={setSearch} placeholder={tr("بحث بالاسم أو الهاتف")} /></div>
        <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>{tr("عميل جديد")}</Button>
      </div>
      <Card padded={false}>
        {q.isError ? <ErrorBox message={(q.error as Error).message} /> : !q.data ? <Loader /> : rows.length === 0 ? <EmptyState title={tr("لا عملاء")} /> : (
          <DataTable head={[tr("العميل"), tr("الفئة"), tr("المسؤول"), tr("المشاريع"), tr("المحصّل"), tr("المتبقي")]} minWidth={760}>
            {rows.map((c) => (
              <tr key={c.id} className="cursor-pointer border-t border-line hover:bg-chip/40" onClick={() => nav('/crm/clients/' + c.id)}>
                <td className="px-4 py-3"><span className="flex flex-col"><Link to={'/crm/clients/' + c.id} className="font-semibold text-fg no-underline">{c.name}</Link>
                  <span className="text-[12px] text-muted">{c.typeLabel}{c.status !== 'active' ? ' · ' + c.statusLabel : ''}{c.phone ? ' · ' : ''}<span className="ltr inline-block">{c.phone}</span></span></span></td>
                <td className="px-4 py-3">{c.category === 'lead' ? <StageChip c={c} /> : <span className="text-[13px]">{c.categoryLabel}</span>}</td>
                <td className="px-4 py-3 text-[13px]">{c.assignedName || '—'}</td>
                <td className="px-4 py-3 num">{c.projectsCount ? tr("{0} ({1} جارٍ)", c.projectsCount, c.activeProjects) : '—'}</td>
                <td className="px-4 py-3"><Money fils={c.paid} /></td>
                <td className="px-4 py-3">{c.remaining ? <Money fils={c.remaining} /> : '—'}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
      {creating && <ClientDialog open onClose={() => setCreating(false)} onSaved={(c) => nav('/crm/clients/' + c.id)} />}
    </div>
  );
}

/** مسار المبيعات: العملاء المحتملون على مراحل، بالسحب أو من القائمة */
export function PipelinePage() {
  const lk = useCrmLookups();
  const q = useApi<ClientView[]>('crm.pipeline');
  const [over, setOver] = useState('');
  const [lost, setLost] = useState<{ id: string } | null>(null);
  const move = useAction<{ id: string; stageId: string; reason?: string }>('crm.client.stage', { invalidate: CRM_KEYS });
  const stages = lk.data?.stages || [];
  const go = (id: string, stageId: string) => {
    const st = stages.find((s) => s.id === stageId);
    if (st?.kind === 'lost') setLost({ id }); else move.mutate({ id, stageId });
  };
  const drop = (stageId: string, e: DragEvent) => { e.preventDefault(); setOver(''); const id = e.dataTransfer.getData('text/plain'); if (id) go(id, stageId); };
  if (q.isError) return <ErrorBox message={(q.error as Error).message} />;
  if (!q.data || !lk.data) return <Loader />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3 overflow-x-auto pb-2">
        {stages.map((s) => {
          const items = q.data!.filter((c) => (c.stageId || 'st_new') === s.id);
          return (
            <section key={s.id} aria-label={s.name} onDragOver={(e) => { e.preventDefault(); setOver(s.id); }} onDragLeave={() => setOver((o) => (o === s.id ? '' : o))} onDrop={(e) => drop(s.id, e)}
              className={cx('flex min-h-[200px] w-[230px] shrink-0 flex-col gap-2 rounded-xl bg-chip/50 p-2.5', over === s.id && 'ring-2 ring-accent')}>
              <h2 className="m-0 flex items-center gap-2 px-1 pt-1 text-[14px] font-bold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}<span className="ms-auto text-[12px] text-muted num">{items.length}</span></h2>
              {items.map((c) => (
                <article key={c.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)} className="flex cursor-grab flex-col gap-1.5 rounded-lg border border-line bg-surface p-3 shadow-sm">
                  <Link to={'/crm/clients/' + c.id} className="font-semibold text-fg no-underline">{c.name}</Link>
                  <span className="text-[12px] text-muted">{c.assignedName || '—'}{c.lostReason ? ' · ' + c.lostReason : ''}</span>
                  <select aria-label={tr("المرحلة")} value={c.stageId || 'st_new'} onChange={(e) => go(c.id, e.target.value)} className="h-8 rounded-md border border-line bg-surface px-2 text-[13px] md:hidden">
                    {stages.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </article>
              ))}
            </section>
          );
        })}
      </div>
      <p className="m-0 text-[13px] text-muted">{tr("يظهر هنا العملاء المحتملون. «إغلاق ناجح» يحوّل العميل إلى عميل حالي، و«خسارة» تطلب السبب.")}</p>
      <ReasonDialog open={!!lost} onClose={() => setLost(null)} title={tr("خسارة العميل")} label={tr("سبب الخسارة")} confirmLabel={tr("حفظ")}
        onConfirm={(reason) => move.mutateAsync({ id: lost!.id, stageId: 'st_lost', reason })} />
    </div>
  );
}

export function ProjectsPage() {
  const nav = useNavigate();
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const [status, setStatus] = useState(params.get('review') ? 'review' : 'ongoing');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const q = useApi<ProjectView[]>('crm.projects', status === 'review' ? { review: true } : status ? { status } : {});
  const clients = useApi<ClientView[]>('crm.clients', {}, { enabled: creating });
  const rows = (q.data || []).filter((p) => !search.trim() || (p.name + ' ' + p.clientName).includes(search.trim()));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Segmented label={tr("الحالة")} value={status} onChange={setStatus} options={[
          { value: 'ongoing', label: tr("جارية") }, { value: 'on_hold', label: tr("متوقفة") }, { value: 'completed', label: tr("مكتملة") }, { value: 'review', label: tr("تحتاج مراجعة") }, { value: '', label: tr("الكل") }]} />
        <div className="min-w-[200px] flex-1"><SearchBox id="crm-psearch" value={search} onChange={setSearch} placeholder={tr("بحث بالمشروع أو العميل")} /></div>
        <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>{tr("مشروع جديد")}</Button>
      </div>
      {status === 'review' && <p className="m-0 rounded-lg bg-warn-bg px-3 py-2.5 text-warn">{tr("مشاريع نُقلت من النظام السابق بلا قيمة عقد أو بمحصّل أكبر من العقد. افتح كل مشروع واختر «عقد ثابت» بقيمته أو «اشتراك أو مفتوح»، ثم علّمه «راجعته».")}</p>}
      <Card padded={false}>
        {q.isError ? <ErrorBox message={(q.error as Error).message} /> : !q.data ? <Loader /> : rows.length === 0 ? <EmptyState title={tr("لا مشاريع")} /> : (
          <DataTable head={[tr("المشروع"), tr("العميل"), tr("الفوترة"), tr("التحصيل"), tr("الحالة")]} minWidth={760}>
            {rows.map((p) => (
              <tr key={p.id} className="cursor-pointer border-t border-line hover:bg-chip/40" onClick={() => nav('/crm/projects/' + p.id)}>
                <td className="px-4 py-3"><span className="flex flex-col"><Link to={'/crm/projects/' + p.id} className="font-semibold text-fg no-underline">{p.name}</Link>
                  <span className="text-[12px] text-muted">{[p.type, p.startDate && dmy(p.startDate)].filter(Boolean).join(' · ')}</span></span></td>
                <td className="px-4 py-3 text-[13px]">{p.clientName}</td>
                <td className="px-4 py-3 text-[13px]">{p.billing === 'fixed' ? <Money fils={p.contractValue} /> : p.billingLabel}</td>
                <td className="px-4 py-3"><CollectBar p={p} /></td>
                <td className="px-4 py-3"><span className="flex flex-col items-start gap-1"><ProjectBadge p={p} />{p.needsReview && <Badge tone="warn">{tr("تحتاج مراجعة")}</Badge>}</span></td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
      {creating && clients.data && <ProjectDialog open onClose={() => setCreating(false)} clients={clients.data} onSaved={(p) => nav('/crm/projects/' + p.id)} />}
    </div>
  );
}

export function PaymentsPage() {
  const [status, setStatus] = useState<'scheduled' | 'overdue' | 'paid' | ''>('scheduled');
  const q = useApi<PaymentView[]>('crm.payments', status ? { status } : {});
  const total = (q.data || []).reduce((a, x) => a + x.amount, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Segmented label={tr("الحالة")} value={status} onChange={setStatus} options={[{ value: 'scheduled', label: tr("مجدولة") }, { value: 'overdue', label: tr("متأخرة") }, { value: 'paid', label: tr("محصّلة") }, { value: '', label: tr("الكل") }]} />
        <span className="ms-auto text-muted">{tr("المجموع")} <Money fils={total} className="font-bold text-fg" /></span>
      </div>
      <Card padded={false}>
        {q.isError ? <ErrorBox message={(q.error as Error).message} /> : !q.data ? <Loader /> : q.data.length === 0 ? <EmptyState title={tr("لا دفعات")} /> : (
          <DataTable head={[tr("التاريخ"), tr("المشروع"), tr("العميل"), tr("المبلغ"), tr("الطريقة"), tr("الفاتورة"), tr("الحالة")]} minWidth={820}>
            {q.data.map((d) => (
              <tr key={d.id} className="border-t border-line">
                <td className={cx('px-4 py-3 num', d.overdue && 'font-semibold text-bad')}>{dmy(d.date)}</td>
                <td className="px-4 py-3"><Link to={'/crm/projects/' + d.projectId} className="text-fg no-underline hover:underline">{d.projectName}</Link></td>
                <td className="px-4 py-3 text-[13px]">{d.clientName}</td>
                <td className="px-4 py-3"><Money fils={d.amount} /></td>
                <td className="px-4 py-3 text-[13px]">{d.methodLabel}{d.recipient ? ' · ' + d.recipient : ''}</td>
                <td className="px-4 py-3 ltr text-right text-[13px]">{d.invoiceNo}</td>
                <td className="px-4 py-3"><Badge tone={d.status === 'paid' ? 'ok' : d.overdue ? 'bad' : 'warn'}>{d.overdue ? tr("متأخرة") : d.statusLabel}</Badge></td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  );
}

export function ProposalsPage() {
  const [status, setStatus] = useState('');
  const q = useApi<ProposalView[]>('crm.proposals', status ? { status } : {});
  return (
    <div className="flex flex-col gap-3">
      <Segmented label={tr("الحالة")} value={status} onChange={setStatus} options={[{ value: '', label: tr("الكل") }, { value: 'negotiation', label: tr("قيد التفاوض") }, { value: 'accepted', label: tr("مقبولة") }, { value: 'rejected', label: tr("مرفوضة") }]} />
      <Card padded={false}>
        {q.isError ? <ErrorBox message={(q.error as Error).message} /> : !q.data ? <Loader /> : q.data.length === 0 ? <EmptyState title={tr("لا عروض")} body={tr("أضف عرض السعر من صفحة العميل.")} /> : (
          <DataTable head={[tr("العرض"), tr("العميل"), tr("القيمة"), tr("التاريخ"), tr("الحالة")]} minWidth={680}>
            {q.data.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-4 py-3"><span className="flex flex-col"><span className="font-semibold">{p.name}</span><span className="text-[12px] text-muted num">{p.number}{p.projectName ? ' · ' + p.projectName : ''}</span></span></td>
                <td className="px-4 py-3"><Link to={'/crm/clients/' + p.clientId} className="text-fg no-underline hover:underline">{p.clientName}</Link></td>
                <td className="px-4 py-3"><Money fils={p.value} /></td>
                <td className="px-4 py-3 num">{dmy(p.issueDate)}</td>
                <td className="px-4 py-3"><ProposalBadge p={p} /></td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  );
}

export function ActivityList({ items }: { items: ActivityView[] }) {
  if (!items.length) return <EmptyState title={tr("لا أنشطة")} />;
  return (
    <ol className="m-0 list-none p-0">
      {items.map((a) => (
        <li key={a.id} className="flex gap-3 border-t border-line px-5 py-3 first:border-t-0">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chip text-muted"><Icon name={a.type === 'call' ? 'bell' : a.type === 'visit' ? 'pin' : a.type === 'meeting' ? 'users' : 'history'} size={16} /></span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-semibold">{a.typeLabel}{a.title ? ' — ' + a.title : ''}</span>
            <span className="text-[12px] text-muted">{[formatDateTime(a.at), a.userName, a.clientName, a.contactName, a.projectName].filter(Boolean).join(' · ')}</span>
            {a.description && <p className="m-0 whitespace-pre-wrap text-[13px]">{a.description}</p>}
            {a.followUpDate && <span className="text-[12px] text-accent-fg">{tr("متابعة في {0}", dmy(a.followUpDate))}{a.followUpTaskId ? <Link to={'/tasks/' + a.followUpTaskId} className="ms-1 text-accent-fg">{tr("المهمة")}</Link> : null}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ActivitiesPage() {
  const lk = useCrmLookups();
  const [type, setType] = useState('');
  const q = useApi<ActivityView[]>('crm.activities', type ? { type } : {});
  return (
    <div className="flex flex-col gap-3">
      <Select label={tr("النوع")} className="w-44" value={type} onChange={(e) => setType(e.target.value)} options={[{ value: '', label: tr("الكل") }, ...(lk.data?.activityTypes || []).map((t) => ({ value: t.id, label: t.label }))]} />
      <Card padded={false}>{q.isError ? <ErrorBox message={(q.error as Error).message} /> : !q.data ? <Loader /> : <ActivityList items={q.data} />}</Card>
      <p className="m-0 text-[13px] text-muted">{tr("سجّل النشاط من صفحة العميل.")}</p>
    </div>
  );
}

export function ReportsPage() {
  const [from, setFrom] = useState(kwMonth().slice(0, 4) + '-01-01');
  const [to, setTo] = useState('');
  const q = useApi<CrmReport>('crm.report', { from, to: to || undefined });
  const r = q.data;
  const exportCsv = () => r && downloadCsv(tr("تحصيل-المشاريع.csv"), [
    [tr("المشروع"), tr("العميل"), tr("الفوترة"), tr("العقد"), tr("المحصّل"), tr("المجدول"), tr("المتبقي"), tr("مصروف العهد"), tr("الحالة")],
    ...r.projects.map((p) => [p.name, p.clientName, p.billingLabel, kwd(p.contractValue, false), kwd(p.paid, false), kwd(p.scheduled, false), p.billing === 'fixed' ? kwd(p.remaining, false) : '', kwd(p.spent, false), p.statusLabel])
  ]);
  return (
    <div className="flex flex-col gap-4">
      <div className="no-print flex flex-wrap items-end gap-3">
        <TextInput label={tr("من")} type="date" ltr value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
        <TextInput label={tr("إلى")} type="date" ltr value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
        <Button icon="download" onClick={exportCsv} disabled={!r}>{tr("تصدير Excel")}</Button>
        <Button icon="printer" onClick={() => window.print()}>{tr("طباعة")}</Button>
      </div>
      {q.isError ? <ErrorBox message={(q.error as Error).message} /> : !r ? <Loader /> : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
            <StatTile label={tr("المحصّل في الفترة")} value={<Money fils={r.collected} />} icon="wallet" />
            <StatTile label={tr("العروض")} value={r.proposals.total} icon="file" foot={tr("{0} مقبول · {1} مرفوض", r.proposals.accepted, r.proposals.rejected)} />
            <StatTile label={tr("قيمة العروض المقبولة")} value={<Money fils={r.proposals.acceptedValue} />} icon="check" foot={r.proposals.total ? tr("نسبة القبول {0}%", Math.round(r.proposals.accepted * 100 / r.proposals.total)) : ''} />
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card padded={false} className="print-table">
              <CardHeader title={tr("التحصيل حسب العميل")} />
              <DataTable head={[tr("العميل"), tr("المحصّل")]} minWidth={300}>
                {r.byClient.map((x) => <tr key={x.clientId} className="border-t border-line"><td className="px-4 py-2.5">{x.clientName}</td><td className="px-4 py-2.5"><Money fils={x.amount} /></td></tr>)}
              </DataTable>
            </Card>
            <Card padded={false} className="print-table">
              <CardHeader title={tr("التحصيل الشهري")} />
              <DataTable head={[tr("الشهر"), tr("المحصّل")]} minWidth={300}>
                {r.byMonth.map((x) => <tr key={x.month} className="border-t border-line"><td className="px-4 py-2.5">{monthLabel(x.month)}</td><td className="px-4 py-2.5"><Money fils={x.amount} /></td></tr>)}
              </DataTable>
            </Card>
          </div>
          <Card padded={false} className="print-table">
            <CardHeader title={tr("نشاط الفريق")} />
            {r.activities.length === 0 ? <EmptyState title={tr("لا أنشطة في الفترة")} /> : (
              <DataTable head={[tr("الموظف"), tr("الأنشطة")]} minWidth={300}>
                {r.activities.map((x) => <tr key={x.userName} className="border-t border-line"><td className="px-4 py-2.5">{x.userName}</td><td className="px-4 py-2.5 num">{x.total}</td></tr>)}
              </DataTable>
            )}
          </Card>
          <Card padded={false} className="print-table">
            <CardHeader title={tr("المشاريع: العقد والتحصيل ومصروف العهد")} />
            <DataTable head={[tr("المشروع"), tr("العميل"), tr("العقد"), tr("المحصّل"), tr("المتبقي"), tr("مصروف العهد")]} minWidth={760}>
              {r.projects.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-4 py-2.5"><Link to={'/crm/projects/' + p.id} className="text-fg no-underline hover:underline">{p.name}</Link></td>
                  <td className="px-4 py-2.5 text-[13px]">{p.clientName}</td>
                  <td className="px-4 py-2.5">{p.billing === 'fixed' ? <Money fils={p.contractValue} /> : <span className="text-[13px] text-muted">{p.billingLabel}</span>}</td>
                  <td className="px-4 py-2.5"><Money fils={p.paid} /></td>
                  <td className="px-4 py-2.5">{p.billing === 'fixed' ? <Money fils={p.remaining} /> : '—'}</td>
                  <td className="px-4 py-2.5">{p.spent ? <Money fils={p.spent} /> : '—'}</td>
                </tr>
              ))}
            </DataTable>
          </Card>
        </>
      )}
    </div>
  );
}
