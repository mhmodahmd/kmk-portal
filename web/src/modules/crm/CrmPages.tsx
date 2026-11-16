import { useMemo, useState, type DragEvent } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useAction, useApi } from '../../lib/useApi';
import { dmy, formatDateTime, kwDate, monthLabel } from '../../lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Loader, PageHeader, StatTile } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { DataTable, Pager, SearchBox, Segmented, TabNav, useTable } from '../../ui/Controls';
import { Select, TextInput } from '../../ui/Field';
import { ReasonDialog } from '../../ui/Decide';
import { Dialog } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import { downloadCsv } from '../attendance/shared';
import { ActivityDialog, CRM_KEYS, ClientDialog, CollectBar, Money, PaymentDialog, ProjectBadge, ProjectDialog, ProposalBadge, ProposalDialog, StageChip, kwd, useCrmLookups } from './shared';
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
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card padded={false}>
          <CardHeader title={tr("دفعات مستحقة خلال أسبوعين")} action={<Link to="/crm/payments" className="text-[13px] font-semibold text-accent-fg no-underline">{tr("كل الدفعات")}</Link>} />
          {h.due.length === 0 ? <EmptyState title={tr("لا دفعات مستحقة قريباً")} /> : h.due.map((d) => <PaymentLine key={d.id} d={d} />)}
        </Card>
        <Card padded={false}>
          <CardHeader title={tr("اشتراكات مستحقة للدورة الحالية")} action={<Link to="/crm/projects" className="text-[13px] font-semibold text-accent-fg no-underline">{tr("المشاريع")}</Link>} />
          {h.cycles.length === 0 ? <EmptyState title={tr("لا اشتراكات مستحقة")} /> : h.cycles.map((x) => (
            <Link key={x.projectId} to={'/crm/projects/' + x.projectId} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3 text-fg no-underline first:border-t-0 hover:bg-chip/40">
              <span className="flex min-w-0 flex-1 flex-col"><span className="font-semibold">{x.projectName}</span><span className="text-[13px] text-muted">{x.clientName}</span></span>
              <span className="flex flex-col items-end gap-0.5"><Money fils={x.due} className="font-semibold" /><span className={cx('text-[12px] num', x.late ? 'font-semibold text-bad' : 'text-muted')}>{tr("حتى {0}", dmy(x.end))}</span></span>
            </Link>
          ))}
        </Card>
      </div>
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

/** قيم الفرز للأعمدة المركّبة في جداول العملاء */
const clientSortValue = (c: ClientView, k: string) => (k === 'category' ? (c.category === 'lead' ? c.stageName : c.categoryLabel) : (c as unknown as Record<string, unknown>)[k]);
const projectSortValue = (p: ProjectView, k: string) => (k === 'billing' ? (p.billing === 'fixed' ? p.contractValue : p.cycleAmount || 0) : k === 'collect' ? p.percent : k === 'status' ? p.statusLabel : (p as unknown as Record<string, unknown>)[k]);
const paymentSortValue = (d: PaymentView, k: string) => (k === 'status' ? (d.overdue ? 'z' : d.statusLabel) : (d as unknown as Record<string, unknown>)[k]);

export function ClientsPage() {
  const lk = useCrmLookups();
  const nav = useNavigate();
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const q = useApi<ClientView[]>('crm.clients', { category: category || undefined, status: status || undefined });
  const rows = useMemo(() => (q.data || []).filter((c) => !search.trim() || (c.name + ' ' + c.phone + ' ' + c.email).toLowerCase().includes(search.trim().toLowerCase())), [q.data, search]);
  const t = useTable(rows, { sort: { key: 'name', dir: 'asc' }, get: clientSortValue });
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
          <DataTable sticky sort={t.sort} onSort={t.onSort} pager={<Pager {...t.pager} />} minWidth={760}
            head={[{ key: 'name', label: tr("العميل") }, { key: 'category', label: tr("الفئة") }, { key: 'assignedName', label: tr("المسؤول") }, { key: 'projectsCount', label: tr("المشاريع") }, { key: 'paid', label: tr("المحصّل") }, { key: 'remaining', label: tr("المتبقي") }]}>
            {t.rows.map((c) => (
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
  const rows = useMemo(() => (q.data || []).filter((p) => !search.trim() || (p.name + ' ' + p.clientName).includes(search.trim())), [q.data, search]);
  const t = useTable(rows, { sort: { key: 'name', dir: 'asc' }, get: projectSortValue });
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
          <DataTable sticky sort={t.sort} onSort={t.onSort} pager={<Pager {...t.pager} />} minWidth={760}
            head={[{ key: 'name', label: tr("المشروع") }, { key: 'clientName', label: tr("العميل") }, { key: 'billing', label: tr("الفوترة") }, { key: 'collect', label: tr("التحصيل") }, { key: 'status', label: tr("الحالة") }]}>
            {t.rows.map((p) => (
              <tr key={p.id} className="cursor-pointer border-t border-line hover:bg-chip/40" onClick={() => nav('/crm/projects/' + p.id)}>
                <td className="px-4 py-3"><span className="flex flex-col"><Link to={'/crm/projects/' + p.id} className="font-semibold text-fg no-underline">{p.name}</Link>
                  <span className="text-[12px] text-muted">{[p.type, p.startDate && dmy(p.startDate)].filter(Boolean).join(' · ')}</span></span></td>
                <td className="px-4 py-3 text-[13px]">{p.clientName}</td>
                <td className="px-4 py-3 text-[13px]">{p.billing === 'fixed' ? <Money fils={p.contractValue} /> : p.cycle ? <span><Money fils={p.cycleAmount} /> <span className="text-muted">/ {p.billingCycleLabel}</span></span> : p.billingLabel}</td>
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
  const lk = useCrmLookups();
  const [status, setStatus] = useState<'scheduled' | 'overdue' | 'paid' | ''>('scheduled');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PaymentView | null>(null);
  const q = useApi<PaymentView[]>('crm.payments', status ? { status } : {});
  const total = (q.data || []).reduce((a, x) => a + x.amount, 0);
  const t = useTable(q.data || EMPTY_PAYMENTS, { sort: { key: 'date', dir: status === 'paid' ? 'desc' : 'asc' }, get: paymentSortValue });
  const canPay = !!lk.data?.isAccountant;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Segmented label={tr("الحالة")} value={status} onChange={setStatus} options={[{ value: 'scheduled', label: tr("مجدولة") }, { value: 'overdue', label: tr("متأخرة") }, { value: 'paid', label: tr("محصّلة") }, { value: '', label: tr("الكل") }]} />
        <span className="ms-auto text-muted">{tr("المجموع")} <Money fils={total} className="font-bold text-fg" /></span>
        {canPay && <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>{tr("دفعة جديدة")}</Button>}
      </div>
      <Card padded={false}>
        {q.isError ? <ErrorBox message={(q.error as Error).message} /> : !q.data ? <Loader /> : q.data.length === 0 ? <EmptyState title={tr("لا دفعات")} /> : (
          <DataTable sticky sort={t.sort} onSort={t.onSort} pager={<Pager {...t.pager} />} minWidth={860}
            head={[{ key: 'date', label: tr("التاريخ") }, { key: 'projectName', label: tr("المشروع") }, { key: 'clientName', label: tr("العميل") }, { key: 'amount', label: tr("المبلغ") }, { key: 'methodLabel', label: tr("الطريقة") }, { key: 'invoiceNo', label: tr("الفاتورة") }, { key: 'status', label: tr("الحالة") }, '']}>
            {t.rows.map((d) => (
              <tr key={d.id} className="border-t border-line">
                <td className={cx('px-4 py-3 num', d.overdue && 'font-semibold text-bad')}>{dmy(d.date)}</td>
                <td className="px-4 py-3"><Link to={'/crm/projects/' + d.projectId} className="text-fg no-underline hover:underline">{d.projectName}</Link></td>
                <td className="px-4 py-3 text-[13px]">{d.clientName}</td>
                <td className="px-4 py-3"><Money fils={d.amount} /></td>
                <td className="px-4 py-3 text-[13px]">{d.methodLabel}{d.recipient ? ' · ' + d.recipient : ''}</td>
                <td className="px-4 py-3 ltr text-right text-[13px]">{d.invoiceNo}</td>
                <td className="px-4 py-3"><Badge tone={d.status === 'paid' ? 'ok' : d.overdue ? 'bad' : 'warn'}>{d.overdue ? tr("متأخرة") : d.statusLabel}</Badge></td>
                <td className="px-2 py-3">{canPay && <Button size="sm" variant="ghost" icon="edit" aria-label={tr("تعديل")} onClick={() => setEditing(d)} />}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
      {adding && <PaymentDialog open onClose={() => setAdding(false)} />}
      {editing && <PaymentDialog open onClose={() => setEditing(null)} projectId={editing.projectId} payment={editing} />}
    </div>
  );
}

export function ProposalsPage() {
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);
  const q = useApi<ProposalView[]>('crm.proposals', status ? { status } : {});
  const t = useTable(q.data || EMPTY_PROPOSALS, { sort: { key: 'issueDate', dir: 'desc' }, get: (p, k) => (k === 'status' ? p.statusLabel : (p as unknown as Record<string, unknown>)[k]) });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Segmented label={tr("الحالة")} value={status} onChange={setStatus} options={[{ value: '', label: tr("الكل") }, { value: 'negotiation', label: tr("قيد التفاوض") }, { value: 'accepted', label: tr("مقبولة") }, { value: 'rejected', label: tr("مرفوضة") }]} />
        <Button variant="primary" icon="plus" className="ms-auto" onClick={() => setAdding(true)}>{tr("عرض سعر جديد")}</Button>
      </div>
      <Card padded={false}>
        {q.isError ? <ErrorBox message={(q.error as Error).message} /> : !q.data ? <Loader /> : q.data.length === 0 ? <EmptyState title={tr("لا عروض")} body={tr("القبول والرفض من صفحة العميل.")} /> : (
          <DataTable sticky sort={t.sort} onSort={t.onSort} pager={<Pager {...t.pager} />} minWidth={680}
            head={[{ key: 'name', label: tr("العرض") }, { key: 'clientName', label: tr("العميل") }, { key: 'value', label: tr("القيمة") }, { key: 'issueDate', label: tr("التاريخ") }, { key: 'status', label: tr("الحالة") }]}>
            {t.rows.map((p) => (
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
      {adding && <ProposalDialog open onClose={() => setAdding(false)} />}
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

const ACT_TONE: Record<string, 'info' | 'ok' | 'warn' | 'neutral'> = { meeting: 'info', call: 'ok', visit: 'warn', follow_up: 'neutral', whatsapp: 'ok', email: 'neutral' };

export function ActivitiesPage() {
  const lk = useCrmLookups();
  const [f, setF] = useState({ q: '', type: '', clientId: '', userId: '', projectId: '' });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ActivityView | null>(null);
  const [deleting, setDeleting] = useState<ActivityView | null>(null);
  const q = useApi<ActivityView[]>('crm.activities', {});
  const del = useAction('crm.activity.remove', { invalidate: CRM_KEYS, success: tr("حُذف النشاط"), onSuccess: () => setDeleting(null) });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const all = q.data || [];
  const uniq = (key: 'clientId' | 'userId' | 'projectId', label: 'clientName' | 'userName' | 'projectName') =>
    [...new Map(all.filter((a) => a[key]).map((a) => [a[key], a[label]])).entries()].sort((x, y) => x[1].localeCompare(y[1], 'ar')).map(([value, text]) => ({ value, label: text }));
  const rows = useMemo(() => {
    const s = f.q.trim().toLowerCase();
    return all.filter((a) => (!f.type || a.type === f.type) && (!f.clientId || a.clientId === f.clientId) && (!f.userId || a.userId === f.userId) && (!f.projectId || a.projectId === f.projectId) &&
      (!s || [a.clientName, a.contactName, a.userName, a.projectName, a.title, a.description, a.followUpTask?.title].filter(Boolean).join(' ').toLowerCase().includes(s)));
  }, [all, f]);
  const t = useTable(rows, { sort: { key: 'at', dir: 'desc' } });
  const exportCsv = () => downloadCsv(tr("الأنشطة.csv"), [
    [tr("النوع"), tr("العميل"), tr("جهة الاتصال"), tr("المشروع"), tr("الموظف"), tr("التاريخ والوقت"), tr("المدة (دقيقة)"), tr("الموضوع"), tr("التفاصيل"), tr("مهمة المتابعة")],
    ...rows.map((a) => [a.typeLabel, a.clientName, a.contactName, a.projectName, a.userName, formatDateTime(a.at), a.durationMin || '', a.title, a.description, a.followUpTask ? a.followUpTask.number + ' ' + a.followUpTask.title : ''])
  ]);
  const can = !!lk.data;
  return (
    <div className="flex flex-col gap-3">
      <div className="no-print flex flex-wrap items-center gap-2">
        <div className="min-w-[220px] flex-1"><SearchBox id="act-q" value={f.q} onChange={(v) => setF({ ...f, q: v })} placeholder={tr("بحث بالعميل أو الموظف أو الموضوع")} /></div>
        <Button icon="refresh" aria-label={tr("تحديث")} onClick={() => q.refetch()} loading={q.isFetching && !q.isPending} />
        <Button icon="download" onClick={exportCsv} disabled={!rows.length}>{tr("تصدير CSV (Excel)")}</Button>
        <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>{tr("تسجيل نشاط")}</Button>
      </div>
      <div className="no-print grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Select label={tr("النوع")} className="[&>label]:sr-only" value={f.type} onChange={set('type')} options={[{ value: '', label: tr("كل الأنواع") }, ...(lk.data?.activityTypes || []).map((t) => ({ value: t.id, label: t.label }))]} />
        <Select label={tr("العميل")} className="[&>label]:sr-only" value={f.clientId} onChange={set('clientId')} options={[{ value: '', label: tr("كل العملاء") }, ...uniq('clientId', 'clientName')]} />
        <Select label={tr("الموظف")} className="[&>label]:sr-only" value={f.userId} onChange={set('userId')} options={[{ value: '', label: tr("كل الموظفين") }, ...uniq('userId', 'userName')]} />
        <Select label={tr("المشروع")} className="[&>label]:sr-only" value={f.projectId} onChange={set('projectId')} options={[{ value: '', label: tr("كل المشاريع") }, ...uniq('projectId', 'projectName')]} />
      </div>
      <Card padded={false} className="print-table">
        {q.isError ? <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} /> : !q.data ? <Loader /> : rows.length === 0 ? (
          <EmptyState title={all.length ? tr("لا نتائج تطابق التصفية") : tr("لا أنشطة بعد")} body={all.length ? undefined : tr("سجّل كل اجتماع أو مكالمة أو زيارة ليبقى تاريخ العلاقة مع العميل في مكان واحد.")} />
        ) : (
          <DataTable sticky sort={t.sort} onSort={t.onSort} pager={<Pager {...t.pager} />} minWidth={900}
            head={[{ key: 'typeLabel', label: tr("النوع") }, { key: 'clientName', label: tr("العميل / جهة الاتصال") }, { key: 'projectName', label: tr("المشروع") }, tr("المهمة"), { key: 'userName', label: tr("الموظف") }, { key: 'at', label: tr("التاريخ والوقت") }, { key: 'durationMin', label: tr("المدة") }, '']}>
            {t.rows.map((a) => (
              <tr key={a.id} className="border-t border-line">
                <td className="px-4 py-3"><Badge tone={ACT_TONE[a.type] || 'neutral'}>{a.typeLabel}</Badge></td>
                <td className="px-4 py-3">
                  <Link to={'/crm/clients/' + a.clientId} className="font-medium text-accent-fg no-underline hover:underline">{a.clientName}</Link>
                  {a.contactName && <span className="text-[12px] text-muted"> ({a.contactName})</span>}
                  {a.title && <div className="text-[12px] text-muted">{a.title}</div>}
                </td>
                <td className="px-4 py-3 text-[13px]">{a.projectId ? <Link to={'/crm/projects/' + a.projectId} className="text-fg no-underline hover:underline">{a.projectName}</Link> : '—'}</td>
                <td className="px-4 py-3 text-[13px]">{a.followUpTask ? <Link to={'/tasks/' + a.followUpTaskId} className="text-accent-fg no-underline hover:underline" title={a.followUpTask.title}>{a.followUpTask.number}</Link> : '—'}</td>
                <td className="px-4 py-3 text-[13px]">{a.userName}</td>
                <td className="px-4 py-3 num whitespace-nowrap text-[13px]">{formatDateTime(a.at)}</td>
                <td className="px-4 py-3 num text-[13px]">{a.durationMin ? tr("{0} دقيقة", a.durationMin) : '—'}</td>
                <td className="px-2 py-3 whitespace-nowrap">
                  {can && <Button size="sm" variant="ghost" icon="edit" aria-label={tr("تعديل")} onClick={() => setEditing(a)} />}
                  {can && <Button size="sm" variant="ghost" icon="trash" aria-label={tr("حذف")} className="text-bad" onClick={() => setDeleting(a)} />}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
      <p className="m-0 text-[12px] text-muted">{tr("{0} من {1} نشاط", rows.length, all.length)}</p>
      {adding && <ActivityDialog open onClose={() => setAdding(false)} />}
      {editing && <ActivityDialog open onClose={() => setEditing(null)} activity={editing} />}
      <Dialog open={!!deleting} onClose={() => setDeleting(null)} title={tr("حذف النشاط")}
        footer={<><Button variant="danger" className="flex-1" loading={del.isPending} onClick={() => del.mutate({ id: deleting!.id })}>{tr("حذف نهائياً")}</Button><Button variant="ghost" onClick={() => setDeleting(null)}>{tr("تراجع")}</Button></>}>
        {deleting && <p className="m-0">{deleting.typeLabel} · {deleting.clientName} · {formatDateTime(deleting.at)}{deleting.followUpTask ? ' — ' + tr("مهمة المتابعة {0} لا تُحذف.", deleting.followUpTask.number) : ''}</p>}
      </Dialog>
    </div>
  );
}

type Preset = 'month' | 'quarter' | 'year' | 'all' | 'custom';
function presetRange(p: Preset, today: string): { from: string; to: string } {
  const y = today.slice(0, 4), m = Number(today.slice(5, 7));
  if (p === 'month') return { from: today.slice(0, 7) + '-01', to: today };
  if (p === 'quarter') return { from: y + '-' + String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0') + '-01', to: today };
  if (p === 'year') return { from: y + '-01-01', to: today };
  return { from: '2000-01-01', to: today };
}

/** تغيّر نسبي مقارنة بالفترة السابقة */
function Change({ pct, label }: { pct: number; label: string }) {
  if (!pct) return <span className="text-[12px] text-muted">{label}</span>;
  return <span className={cx('text-[12px] font-semibold', pct > 0 ? 'text-ok' : 'text-bad')}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct)}% <span className="font-normal text-muted">{label}</span></span>;
}

/** رسم أعمدة بسيط بلا مكتبة */
function MonthBars({ data }: { data: { month: string; amount: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.amount));
  const W = 720, H = 180, pad = 28, bw = Math.max(8, Math.min(48, (W - pad * 2) / data.length - 8));
  const step = (W - pad * 2) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 40}`} className="w-full" role="img" aria-label={tr("التحصيل الشهري")}>
      {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={pad} x2={W - pad} y1={H - H * f} y2={H - H * f} stroke="var(--c-border)" strokeDasharray="3 4" />)}
      {data.map((d, i) => {
        const h = Math.round((d.amount / max) * (H - 10)), x = pad + i * step + (step - bw) / 2;
        return (
          <g key={d.month}>
            <rect x={x} y={H - h} width={bw} height={h} rx={4} fill={d.amount ? 'var(--c-accent)' : 'var(--c-chip)'}>
              <title>{monthLabel(d.month)}: {kwd(d.amount)}</title>
            </rect>
            {d.amount > 0 && <text x={x + bw / 2} y={H - h - 5} textAnchor="middle" fontSize="10" fill="var(--c-muted)" className="num">{Math.round(d.amount / 1000).toLocaleString('en-US')}</text>}
            <text x={x + bw / 2} y={H + 18} textAnchor="middle" fontSize="11" fill="var(--c-muted)">{monthLabel(d.month).replace(/ \d{4}$/, '')}</text>
            {(i === 0 || d.month.endsWith('-01')) && <text x={x + bw / 2} y={H + 33} textAnchor="middle" fontSize="10" fill="var(--c-muted)" className="num">{d.month.slice(0, 4)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

const EMPTY_PAYMENTS: PaymentView[] = [];
const EMPTY_PROPOSALS: ProposalView[] = [];

export function ReportsPage() {
  const lk = useCrmLookups();
  const today = lk.data?.today || kwDate();
  const [preset, setPreset] = useState<Preset>('year');
  const [custom, setCustom] = useState({ from: today.slice(0, 4) + '-01-01', to: today });
  const range = preset === 'custom' ? custom : presetRange(preset, today);
  const q = useApi<CrmReport>('crm.report', { from: range.from, to: range.to }, { placeholderData: (p) => p });
  const [pstatus, setPstatus] = useState<'' | 'ongoing' | 'completed' | 'on_hold'>('');
  const r = q.data;
  const filtered = useMemo(() => (r?.projects || []).filter((p) => !pstatus || p.status === pstatus), [r, pstatus]);
  // تقرير يُطبع كاملاً: فرز بلا ترقيم
  const pt = useTable(filtered, { sort: { key: 'paid', dir: 'desc' }, pageSize: Infinity });
  const projects = pt.rows;
  const exportProjects = () => r && downloadCsv(tr("تحصيل-المشاريع.csv"), [
    [tr("المشروع"), tr("العميل"), tr("الفوترة"), tr("العقد"), tr("المحصّل"), tr("المجدول"), tr("المتبقي"), tr("مصروف العهد"), tr("الحالة")],
    ...projects.map((p) => [p.name, p.clientName, p.cycle ? p.billingCycleLabel + ' ' + kwd(p.cycleAmount, false) : p.billingLabel, kwd(p.contractValue, false), kwd(p.paid, false), kwd(p.scheduled, false), kwd(p.remaining, false), kwd(p.spent, false), p.statusLabel])
  ]);
  const exportReceivables = () => r && downloadCsv(tr("المستحقات.csv"), [
    [tr("النوع"), tr("المشروع"), tr("العميل"), tr("المبلغ"), tr("الموعد"), tr("أيام التأخير")],
    ...r.receivables.items.map((x) => [x.kind === 'cycle' ? tr("اشتراك") : tr("دفعة مجدولة"), x.projectName, x.clientName, kwd(x.amount, false), dmy(x.date), x.daysLate])
  ]);
  const periodLabel = `${dmy(range.from)} ← ${dmy(range.to)}`;
  const typeLabel = (k: string) => lk.data?.activityTypes.find((t) => t.id === k)?.label || k;
  return (
    <div className="flex flex-col gap-4">
      <div className="no-print flex flex-wrap items-end gap-3">
        <Segmented label={tr("الفترة")} value={preset} onChange={setPreset} options={[{ value: 'month', label: tr("هذا الشهر") }, { value: 'quarter', label: tr("هذا الربع") }, { value: 'year', label: tr("هذه السنة") }, { value: 'all', label: tr("الكل") }, { value: 'custom', label: tr("فترة محددة") }]} />
        {preset === 'custom' && <>
          <TextInput label={tr("من")} type="date" ltr value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="w-40" />
          <TextInput label={tr("إلى")} type="date" ltr value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="w-40" />
        </>}
        <span className="ms-auto" />
        <Button icon="download" onClick={exportProjects} disabled={!r}>{tr("تصدير CSV (Excel)")}</Button>
        <Button icon="printer" onClick={() => window.print()} disabled={!r}>{tr("طباعة")}</Button>
      </div>
      <div className="print-only"><h2 className="m-0">{tr("تقرير العملاء · {0}", periodLabel)}</h2></div>
      {q.isError ? <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} /> : !r ? <Loader /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label={tr("المحصّل في الفترة")} value={<Money fils={r.collected} />} icon="wallet" foot={<Change pct={r.collectedChange} label={tr("عن الفترة السابقة ({0})", kwd(r.previousCollected))} />} />
            <StatTile label={tr("مستحقات متأخرة")} value={<Money fils={r.receivables.overdue} className={r.receivables.overdue ? 'text-bad' : ''} />} icon="alert" foot={tr("من إجمالي مستحق {0}", kwd(r.receivables.total))} />
            <StatTile label={tr("العروض")} value={r.proposals.total} icon="file" foot={<span className="text-[12px] text-muted">{r.proposals.total ? tr("قبول {0}% · قيمة المقبول {1}", Math.round(r.proposals.accepted * 100 / r.proposals.total), kwd(r.proposals.acceptedValue)) : tr("لا عروض في الفترة")}</span>} />
            <StatTile label={tr("الأنشطة")} value={r.activitiesTotal} icon="users" foot={<Change pct={r.activitiesChange} label={tr("عن الفترة السابقة · {0} عميل جديد", r.newClients)} />} />
          </div>

          <Card className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3"><h2 className="m-0 text-[16px] font-semibold">{tr("التحصيل الشهري")}</h2><span className="text-[12px] text-muted">{tr("بالدينار")}</span></div>
            {r.byMonth.every((x) => !x.amount) ? <EmptyState title={tr("لا تحصيل في الفترة")} /> : <MonthBars data={r.byMonth} />}
          </Card>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card padded={false} className="print-table">
              <CardHeader title={tr("المستحقات الآن · {0}", r.receivables.items.length)} action={<Button size="sm" variant="ghost" icon="download" onClick={exportReceivables}>{tr("CSV")}</Button>} />
              {r.receivables.items.length === 0 ? <EmptyState title={tr("لا مستحقات")} /> : (
                <DataTable head={[tr("المشروع"), tr("المبلغ"), tr("الموعد")]} minWidth={360}>
                  {r.receivables.items.map((x) => (
                    <tr key={x.kind + x.id} className="border-t border-line">
                      <td className="px-4 py-2.5"><Link to={'/crm/projects/' + x.projectId} className="font-medium text-fg no-underline hover:underline">{x.projectName}</Link><div className="text-[12px] text-muted">{x.clientName} · {x.kind === 'cycle' ? tr("اشتراك") : tr("دفعة مجدولة")}</div></td>
                      <td className="px-4 py-2.5"><Money fils={x.amount} /></td>
                      <td className={cx('px-4 py-2.5 num', x.daysLate > 0 && 'font-semibold text-bad')}>{dmy(x.date)}{x.daysLate > 0 ? <div className="text-[12px]">{tr("متأخرة {0} يوم", x.daysLate)}</div> : null}</td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Card>
            <Card padded={false} className="print-table">
              <CardHeader title={tr("التحصيل حسب العميل")} />
              {r.byClient.length === 0 ? <EmptyState title={tr("لا تحصيل في الفترة")} /> : (
                <DataTable head={[tr("العميل"), tr("المحصّل"), tr("النسبة")]} minWidth={360}>
                  {r.byClient.map((x) => (
                    <tr key={x.clientId} className="border-t border-line">
                      <td className="px-4 py-2.5"><Link to={'/crm/clients/' + x.clientId} className="font-medium text-fg no-underline hover:underline">{x.clientName}</Link><div className="text-[12px] text-muted">{tr("{0} مشروع", x.projects)}</div></td>
                      <td className="px-4 py-2.5"><Money fils={x.amount} /></td>
                      <td className="px-4 py-2.5"><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-chip"><div className="h-full rounded-full bg-accent" style={{ width: x.percent + '%' }} /></div><span className="text-[12px] text-muted num">{x.percent}%</span></div></td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Card>
          </div>

          <Card padded={false} className="print-table">
            <CardHeader title={tr("نشاط الفريق في الفترة")} />
            {r.activities.length === 0 ? <EmptyState title={tr("لا أنشطة في الفترة")} /> : (
              <DataTable head={[tr("الموظف"), tr("الأنشطة"), tr("التفصيل")]} minWidth={420}>
                {r.activities.map((x) => <tr key={x.userName} className="border-t border-line"><td className="px-4 py-2.5 font-medium">{x.userName}</td><td className="px-4 py-2.5 num">{x.total}</td><td className="px-4 py-2.5 text-[12px] text-muted">{Object.entries(x.types).map(([k, v]) => typeLabel(k) + ' ' + v).join(' · ')}</td></tr>)}
              </DataTable>
            )}
          </Card>

          <Card padded={false} className="print-table">
            <CardHeader title={tr("المشاريع: العقد والتحصيل ومصروف العهد")} action={<Segmented label={tr("الحالة")} value={pstatus} onChange={setPstatus} options={[{ value: '', label: tr("الكل") }, { value: 'ongoing', label: tr("جارية") }, { value: 'on_hold', label: tr("متوقفة") }, { value: 'completed', label: tr("مكتملة") }]} />} />
            <DataTable sort={pt.sort} onSort={pt.onSort} minWidth={760}
              head={[{ key: 'name', label: tr("المشروع") }, { key: 'clientName', label: tr("العميل") }, { key: 'contractValue', label: tr("العقد / الاشتراك") }, { key: 'paid', label: tr("المحصّل") }, { key: 'remaining', label: tr("المتبقي") }, { key: 'spent', label: tr("مصروف العهد") }]}>
              {projects.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-4 py-2.5"><Link to={'/crm/projects/' + p.id} className="text-fg no-underline hover:underline">{p.name}</Link></td>
                  <td className="px-4 py-2.5 text-[13px]">{p.clientName}</td>
                  <td className="px-4 py-2.5">{p.billing === 'fixed' ? <Money fils={p.contractValue} /> : p.cycle ? <span><Money fils={p.cycleAmount} /> <span className="text-[12px] text-muted">/ {p.billingCycleLabel}</span></span> : <span className="text-[13px] text-muted">{p.billingLabel}</span>}</td>
                  <td className="px-4 py-2.5"><Money fils={p.paid} /></td>
                  <td className="px-4 py-2.5">{p.billing === 'fixed' || p.cycle ? <Money fils={p.remaining} /> : '—'}</td>
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
