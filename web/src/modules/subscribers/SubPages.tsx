import { useMemo, useState } from 'react';
import { Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { api } from '../../lib/api';
import { errorText, useAction, useApi } from '../../lib/useApi';
import { dmy, monthLabel } from '../../lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Loader, PageHeader } from '../../ui/Display';
import { Bars, Kpi, PanelTitle, TrendBars } from '../../ui/Dashboard';
import { Button } from '../../ui/Button';
import { DataTable, Facts, Pager, SearchBox, TabNav, useTable } from '../../ui/Controls';
import { Select, TextInput, Textarea } from '../../ui/Field';
import { Dialog, useToast } from '../../ui/Overlay';
import { ReasonDialog } from '../../ui/Decide';
import { kwd } from '../custody/shared';
import { downloadCsv } from '../attendance/shared';
import { DashboardSkeleton } from '../correspondence/CorDashboardPage';

type Status = 'active' | 'expiring' | 'pending' | 'lapsed';
interface SubLookups {
  isManager: boolean; isStaff: boolean; today: string; statuses: { id: Status; label: string }[]; packages: { id: string; name: string }[];
  platforms: { id: string; key: string; name: string }[]; people: { id: string; name: string }[]; settings: { renewalLink: string; retentionMonths: number } | null;
}
interface SubRow {
  id: string; ref: string; platformId: string; status: Status; statusLabel: string; packageId: string; packageName: string; expiresAt: string; daysLeft: number | null;
  waitFor: string; lastPaidAt: string; firstPaidAt: string; purchases: number; totalPaid: number; winback: boolean; name: string; mobileMask: string; emailMask: string;
  hasContact: boolean; country: string; optOut: boolean; forgotten: boolean; assignedTo: string; assignedName: string;
}
interface SubDetail extends SubRow {
  notes: string; optOutAt: string; optOutReason: string;
  cycles: { gatewayId: string; packageName: string; paidAt: string; expiresAt: string; amount: number; outcome: string; outcomeLabel: string; waitFor: string }[];
}
interface SubDashboard {
  today: string; lastMonth: string; counts: Record<Status, number>;
  coverage: { total: number; withContact: number; withMobile: number; withEmail: number; optOut: number; winback: number };
  byPackage: { packageId: string; name: string; active: number; expiring: number; pending: number; lapsed: number }[];
  renewal: { month: string; total: number; renewed: number; pending: number; lapsed: number; rate: number | null; final: boolean }[];
}

const KEYS = ['sub.lookups', 'sub.dashboard', 'sub.list', 'sub.get'];
const useSubLookups = () => useApi<SubLookups>('sub.lookups', {}, { staleTime: 5 * 60_000 });
const TONE: Record<Status, 'ok' | 'warn' | 'info' | 'bad'> = { active: 'ok', expiring: 'warn', pending: 'info', lapsed: 'bad' };
const detailLink = (ref: string) => '/subscribers/s/' + encodeURIComponent(ref);

function StatusBadge({ s }: { s: Pick<SubRow, 'status' | 'statusLabel' | 'waitFor' | 'winback'> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={TONE[s.status]}>{s.status === 'pending' && s.waitFor ? tr("لم يجدد — بانتظار كشف {0}", monthLabel(s.waitFor)) : s.statusLabel}</Badge>
      {s.winback && (s.status === 'active' || s.status === 'expiring') && <Badge tone="info">{tr("عاد بعد انقطاع")}</Badge>}
    </span>
  );
}

export function SubLayout() {
  const L = useSubLookups().data;
  const items = [
    { to: '/subscribers', label: tr("نظرة عامة"), end: true },
    ...(L?.isStaff ? [{ to: '/subscribers/list', label: tr("المشتركون") }] : []),
    ...(L?.isManager ? [{ to: '/subscribers/settings', label: tr("الإعدادات") }] : [])
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={tr("المالية")} title={tr("المشتركون")} subtitle={tr("من جدّد ومن لم يجدد، من كشوف بوابة الدفع الشهرية")} />
      <TabNav label={tr("أقسام المشتركين")} items={items} />
      <Outlet />
    </div>
  );
}

/** النظرة العامة: الحالات ونسبة التجديد (أرقام فقط، لكل الأدوار) */
export function SubOverviewPage() {
  const L = useSubLookups().data;
  const q = useApi<SubDashboard>('sub.dashboard', {}, { staleTime: 30_000 });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const d = q.data;
  if (!d) return <DashboardSkeleton />;
  const to = (status: Status) => (L?.isStaff ? '/subscribers/list?status=' + status : undefined);
  const lastFinal = [...d.renewal].reverse().find((m) => m.final && m.rate != null);
  if (!d.coverage.total) return <Card><EmptyState title={tr("لا مشتركين بعد")} body={tr("يُبنى السجل من ملفات بوابة الدفع المستوردة في «المنصات». أعد رفع ملفات الأشهر السابقة لتصل بيانات التواصل.")} /></Card>;
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[13px] text-muted">{tr("آخر كشف مستورد: {0}. المشترك الذي انتهت باقته يبقى «لم يجدد» حتى يصل كشف شهر انتهائها.", d.lastMonth ? monthLabel(d.lastMonth) : '—')}</p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={tr("سارية")} value={d.counts.active} icon="check" tone="ok" to={to('active')} foot={tr("{0} عادوا بعد انقطاع", d.coverage.winback)} />
        <Kpi label={tr("تنتهي خلال 7 أيام")} value={d.counts.expiring} icon="clock" tone={d.counts.expiring ? 'warn' : 'info'} strong to={to('expiring')} foot={tr("وقت التذكير")} />
        <Kpi label={tr("لم يجدد — بانتظار الكشف")} value={d.counts.pending} icon="calendar" tone="info" to={to('pending')} foot={tr("يتأكد بعد رفع كشف الشهر")} />
        <Kpi label={tr("لم يجدد")} value={d.counts.lapsed} icon="alert" tone={d.counts.lapsed ? 'bad' : 'ok'} to={to('lapsed')} foot={lastFinal ? tr("نسبة التجديد في {0}: {1}%", monthLabel(lastFinal.month), lastFinal.rate) : ''} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <Card className="flex flex-col gap-3">
          <PanelTitle title={tr("نسبة التجديد حسب شهر الانتهاء")} />
          {d.renewal.length === 0 ? <p className="m-0 text-[13px] text-muted">{tr("لم تنتهِ أي دورة اشتراك بعد.")}</p> : (
            <>
              <TrendBars data={d.renewal.map((m) => ({ month: m.month, final: m.final ? 1 : 0, rateV: m.rate || 0 }))} series={[{ key: 'rateV', label: tr("نسبة التجديد %"), color: 'var(--c-ok)' }]}
                labelOf={(x) => monthLabel(String(x.month)).replace(/ \d{4}$/, '') + (x.final ? '' : '*')} format={(v) => v + '%'} label={tr("نسبة التجديد حسب شهر الانتهاء")} />
              <p className="m-0 text-[12px] text-muted">{tr("* أولية: لم يُرفع كشف ذلك الشهر بعد.")} {d.renewal.slice(-3).map((m) => tr("{0}: جدّد {1} من {2}", monthLabel(m.month), m.renewed, m.total)).join(' · ')}</p>
            </>
          )}
        </Card>
        <Card className="flex flex-col gap-3">
          <PanelTitle title={tr("بيانات التواصل")} />
          <Bars rows={[
            { key: 'c', label: tr("لهم بيانات تواصل"), value: d.coverage.withContact, display: tr("{0} من {1}", d.coverage.withContact, d.coverage.total) },
            { key: 'm', label: tr("بجوال"), value: d.coverage.withMobile },
            { key: 'e', label: tr("ببريد"), value: d.coverage.withEmail },
            { key: 'o', label: tr("أوقفوا الرسائل"), value: d.coverage.optOut, tone: 'warn' }
          ]} max={d.coverage.total} />
        </Card>
      </div>
      <Card className="flex flex-col gap-3">
        <PanelTitle title={tr("الحالات حسب الباقة الحالية")} />
        <Bars rows={d.byPackage.map((p) => ({ key: p.packageId, label: p.name, value: p.active + p.expiring + p.pending + p.lapsed, sub: tr("سارية {0} · تنتهي {1} · بانتظار {2} · لم يجدد {3}", p.active, p.expiring, p.pending, p.lapsed), to: L?.isStaff ? '/subscribers/list?pkg=' + p.packageId : undefined }))} />
      </Card>
    </div>
  );
}

/** قائمة المشتركين (موظف المتابعة والمدير) */
export function SubListPage() {
  const L = useSubLookups().data;
  const nav = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '', pkg = params.get('pkg') || '';
  const [search, setSearch] = useState('');
  const [assigned, setAssigned] = useState('');
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };
  const q = useApi<SubRow[]>('sub.list', { status: status || undefined, packageId: pkg || undefined, assigned: assigned || undefined });
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data || []).filter((r) => !s || (r.name + ' ' + r.mobileMask + ' ' + r.emailMask).toLowerCase().includes(s));
  }, [q.data, search]);
  const t = useTable(rows, { sort: { key: 'expiresAt', dir: 'asc' } });
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const list = await api<{ name: string; mobile: string; email: string; country: string; packageName: string; expiresAt: string; statusLabel: string; purchases: number; optOut: boolean }[]>('sub.export', { status: status || undefined, packageId: pkg || undefined });
      downloadCsv(tr("المشتركون.csv"), [[tr("الاسم"), tr("الجوال"), tr("البريد"), tr("الدولة"), tr("الباقة"), tr("ينتهي"), tr("الحالة"), tr("مرات الشراء"), tr("أوقف الرسائل")],
        ...list.map((x) => [x.name, x.mobile, x.email, x.country, x.packageName, dmy(x.expiresAt), x.statusLabel, x.purchases, x.optOut ? tr("نعم") : ''])]);
    } catch (e) { toast(errorText(e), 'bad'); } finally { setExporting(false); }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select label={tr("الحالة")} className="w-48" value={status} onChange={(e) => set('status', e.target.value)} options={[{ value: '', label: tr("الكل") }, ...(L?.statuses || []).map((s) => ({ value: s.id, label: s.label }))]} />
        <Select label={tr("الباقة")} className="w-44" value={pkg} onChange={(e) => set('pkg', e.target.value)} options={[{ value: '', label: tr("الكل") }, ...(L?.packages || []).map((p) => ({ value: p.id, label: p.name }))]} />
        <Select label={tr("المسؤول")} className="w-36" value={assigned} onChange={(e) => setAssigned(e.target.value)} options={[{ value: '', label: tr("الكل") }, { value: 'me', label: tr("المسندون إليّ") }, { value: 'none', label: tr("غير مسندين") }]} />
        <div className="min-w-[200px] flex-1"><SearchBox id="sub-search" value={search} onChange={setSearch} placeholder={tr("بحث بالاسم")} /></div>
        {L?.isManager && <Button size="sm" variant="ghost" icon="download" loading={exporting} disabled={!rows.length} onClick={exportCsv}>{tr("تنزيل القائمة (Excel)")}</Button>}
      </div>
      <Card padded={false}>
        {q.isError ? <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} /> : !q.data ? <Loader /> : rows.length === 0 ? (
          <EmptyState title={tr("لا مشتركين بهذه التصفية")} />
        ) : (
          <DataTable sticky sort={t.sort} onSort={t.onSort} pager={<Pager {...t.pager} />} minWidth={760}
            head={[{ key: 'name', label: tr("المشترك") }, { key: 'packageName', label: tr("الباقة") }, { key: 'expiresAt', label: tr("ينتهي") }, { key: 'status', label: tr("الحالة") },
              { key: 'purchases', label: tr("مرات الشراء") }, { key: 'assignedName', label: tr("المسؤول") }]}>
            {t.rows.map((r) => (
              <tr key={r.ref} className="cursor-pointer hover:bg-chip/40" onClick={() => nav(detailLink(r.ref))}>
                <td><span className="flex flex-col"><Link to={detailLink(r.ref)} className="font-semibold text-fg no-underline">{r.name || (r.forgotten ? tr("(حُذفت بياناته)") : tr("(بلا اسم)"))}</Link>
                  <span className="num text-[12px] text-muted" dir="ltr">{[r.mobileMask, r.emailMask].filter(Boolean).join(' · ') || tr("لا تواصل")}</span></span></td>
                <td className="text-[13px]">{r.packageName}</td>
                <td className="num whitespace-nowrap text-[13px]">{dmy(r.expiresAt)}{r.daysLeft != null && r.daysLeft <= 7 && <div className="text-[11px] text-warn">{tr("بعد {0} يوم", r.daysLeft)}</div>}</td>
                <td><StatusBadge s={r} />{r.optOut && <Badge>{tr("أوقف الرسائل")}</Badge>}</td>
                <td className="num">{r.purchases}</td>
                <td className="text-[13px]">{r.assignedName || '—'}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  );
}

/** صفحة المشترك */
export function SubDetailPage() {
  const { ref = '' } = useParams();
  const L = useSubLookups().data;
  const toast = useToast();
  const q = useApi<SubDetail>('sub.get', { ref });
  const [shown, setShown] = useState<{ name: string; mobile: string; email: string } | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [optingOut, setOptingOut] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [assignTo, setAssignTo] = useState<string | null>(null);
  const reveal = async () => { try { setShown(await api('sub.reveal', { ref })); } catch (e) { toast(errorText(e), 'bad'); } };
  const noteAct = useAction('sub.note', { invalidate: KEYS, success: tr("حُفظت الملاحظة"), onSuccess: () => setNotes(null) });
  const optAct = useAction<{ ref: string; optOut: boolean; reason?: string }>('sub.optout', { invalidate: KEYS, success: tr("حُدّث") });
  const forgetAct = useAction('sub.forget', { invalidate: KEYS, success: tr("حُذفت بيانات المشترك"), onSuccess: () => { setForgetting(false); setShown(null); } });
  const assignAct = useAction('sub.assign', { invalidate: KEYS, success: tr("أُسند"), onSuccess: () => setAssignTo(null) });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const s = q.data;
  if (!s) return <Loader />;
  return (
    <div className="flex flex-col gap-4">
      <Link to="/subscribers/list" className="text-[13px] font-semibold text-accent-fg no-underline">{tr("المشتركون")}</Link>
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-[20px] font-semibold">{shown?.name || s.name || (s.forgotten ? tr("(حُذفت بياناته)") : tr("(بلا اسم)"))}</h2>
            <div className="mt-1"><StatusBadge s={s} />{s.optOut && <Badge tone="warn">{tr("أوقف الرسائل")}</Badge>}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.hasContact && !s.forgotten && !shown && <Button size="sm" variant="secondary" icon="eye" onClick={reveal}>{tr("إظهار التواصل")}</Button>}
            {s.id && !s.forgotten && <Button size="sm" variant="ghost" onClick={() => (s.optOut ? optAct.mutate({ ref, optOut: false }) : setOptingOut(true))}>{s.optOut ? tr("إعادة تفعيل الرسائل") : tr("إيقاف الرسائل")}</Button>}
            {L?.isManager && s.id && <Button size="sm" variant="ghost" icon="user" onClick={() => setAssignTo(s.assignedTo)}>{tr("إسناد")}</Button>}
          </div>
        </div>
        <Facts cols={3} items={[
          { k: tr("الجوال"), v: <span className="num" dir="ltr">{shown ? shown.mobile || '—' : s.mobileMask || '—'}</span> },
          { k: tr("البريد"), v: <span className="num" dir="ltr">{shown ? shown.email || '—' : s.emailMask || '—'}</span> },
          { k: tr("الدولة"), v: s.country || '—' },
          { k: tr("الباقة الحالية"), v: s.packageName },
          { k: tr("ينتهي"), v: <span className="num">{dmy(s.expiresAt)}</span> },
          { k: tr("مرات الشراء"), v: tr("{0} · {1}", s.purchases, kwd(s.totalPaid)) },
          { k: tr("أول شراء"), v: <span className="num">{s.firstPaidAt.slice(0, 10)}</span> },
          { k: tr("المسؤول"), v: s.assignedName || '—' },
          { k: tr("إيقاف الرسائل"), v: s.optOut ? tr("{0} · {1}", s.optOutAt.slice(0, 10), s.optOutReason || '') : '—' }
        ]} />
        {shown && <p className="m-0 text-[12px] text-muted">{tr("سُجّل إظهار التواصل في سجل العمليات.")}</p>}
        {!s.id && <p className="m-0 rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn">{tr("لا بيانات تواصل لهذا المشترك. أعد رفع ملف البوابة الذي فيه عملياته من «المنصات».")}</p>}
      </Card>

      <Card padded={false}>
        <CardHeader title={tr("دورات الاشتراك")} />
        <DataTable minWidth={560} head={[tr("الشراء"), tr("الباقة"), tr("المبلغ"), tr("ينتهي"), tr("النتيجة")]}>
          {s.cycles.map((c) => (
            <tr key={c.gatewayId}>
              <td className="num text-[13px]">{c.paidAt}</td>
              <td className="text-[13px]">{c.packageName}</td>
              <td className="num">{kwd(c.amount)}</td>
              <td className="num text-[13px]">{dmy(c.expiresAt)}</td>
              <td><Badge tone={c.outcome === 'renewed' ? 'ok' : c.outcome === 'lapsed' ? 'bad' : c.outcome === 'pending' ? 'info' : 'neutral'}>{c.outcome === 'pending' && c.waitFor ? tr("بانتظار كشف {0}", monthLabel(c.waitFor)) : c.outcomeLabel}</Badge></td>
            </tr>
          ))}
        </DataTable>
      </Card>

      {s.id && !s.forgotten && (
        <Card className="flex flex-col gap-3">
          <PanelTitle title={tr("ملاحظات")} action={notes === null ? <Button size="sm" variant="ghost" icon="edit" onClick={() => setNotes(s.notes)}>{tr("تعديل")}</Button> : undefined} />
          {notes === null ? <p className="m-0 whitespace-pre-wrap text-[14px]">{s.notes || <span className="text-muted">{tr("لا ملاحظات")}</span>}</p> : (
            <>
              <Textarea label={tr("ملاحظات")} value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div className="flex gap-2"><Button variant="primary" loading={noteAct.isPending} onClick={() => noteAct.mutate({ ref, notes })}>{tr("حفظ")}</Button><Button variant="ghost" onClick={() => setNotes(null)}>{tr("تراجع")}</Button></div>
            </>
          )}
        </Card>
      )}

      {L?.isManager && s.id && !s.forgotten && (
        <div><Button variant="danger-outline" icon="trash" onClick={() => setForgetting(true)}>{tr("حذف بيانات المشترك بطلبه")}</Button></div>
      )}

      <ReasonDialog open={optingOut} onClose={() => setOptingOut(false)} title={tr("إيقاف الرسائل")} label={tr("السبب أو طريقة الطلب")} confirmLabel={tr("إيقاف")}
        onConfirm={(reason) => optAct.mutateAsync({ ref, optOut: true, reason })} />
      <Dialog open={forgetting} onClose={() => setForgetting(false)} title={tr("حذف بيانات المشترك")}
        footer={<><Button variant="danger" className="flex-1" loading={forgetAct.isPending} onClick={() => forgetAct.mutate({ ref })}>{tr("حذف نهائياً")}</Button><Button variant="ghost" onClick={() => setForgetting(false)}>{tr("تراجع")}</Button></>}>
        <p className="m-0">{tr("يُمسح الاسم والجوال والبريد والملاحظات نهائياً، وتبقى أرقام اشتراكاته بلا هوية. إعادة رفع الملفات لا تعيدها.")}</p>
      </Dialog>
      <Dialog open={assignTo !== null} onClose={() => setAssignTo(null)} title={tr("إسناد المشترك")}
        footer={<><Button variant="primary" className="flex-1" loading={assignAct.isPending} onClick={() => assignAct.mutate({ refs: [ref], userId: assignTo || '' })}>{tr("حفظ")}</Button><Button variant="ghost" onClick={() => setAssignTo(null)}>{tr("تراجع")}</Button></>}>
        <Select label={tr("المسؤول")} value={assignTo || ''} onChange={(e) => setAssignTo(e.target.value)} options={[{ value: '', label: tr("بلا مسؤول") }, ...(L?.people || []).map((p) => ({ value: p.id, label: p.name }))]} />
      </Dialog>
    </div>
  );
}

/** الإعدادات (مدير المتابعة) */
export function SubSettingsPage() {
  const L = useSubLookups().data;
  const [f, setF] = useState<{ renewalLink: string; retentionMonths: string } | null>(null);
  const save = useAction('sub.settings.save', { invalidate: KEYS, success: tr("حُفظت الإعدادات") });
  if (!L?.settings) return <Loader />;
  const v = f || { renewalLink: L.settings.renewalLink, retentionMonths: String(L.settings.retentionMonths) };
  return (
    <Card className="flex max-w-2xl flex-col gap-3">
      <TextInput label={tr("رابط التجديد في الرسائل")} ltr value={v.renewalLink} onChange={(e) => setF({ ...v, renewalLink: e.target.value })} placeholder="https://" hint={tr("يُضاف إلى رسائل التذكير. اتركه فارغاً حتى يُحدَّد.")} />
      <TextInput label={tr("مدة الاحتفاظ ببيانات التواصل (شهر)")} ltr inputMode="numeric" value={v.retentionMonths} onChange={(e) => setF({ ...v, retentionMonths: e.target.value })} hint={tr("بعدها بلا شراء تُمسح بيانات التواصل تلقائياً")} />
      <div><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(v)}>{tr("حفظ")}</Button></div>
      <p className="m-0 text-[13px] text-muted">{tr("التذكيرات الآلية بالبريد وواتساب في المرحلة التالية.")}</p>
    </Card>
  );
}
