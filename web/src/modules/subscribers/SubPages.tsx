import { useMemo, useState } from 'react';
import { Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { api } from '../../lib/api';
import { errorText, useAction, useApi } from '../../lib/useApi';
import { dateText, dmy, monthLabel } from '../../lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Loader, PageHeader } from '../../ui/Display';
import { Bars, Kpi, PanelTitle, TrendBars } from '../../ui/Dashboard';
import { Button, IconAction } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { DataTable, Facts, Pager, SearchBox, TabNav, useTable } from '../../ui/Controls';
import { Checkbox, Select, TextInput, Textarea } from '../../ui/Field';
import { Dialog, useToast } from '../../ui/Overlay';
import { ReasonDialog } from '../../ui/Decide';
import { kwd } from '../custody/shared';
import { ContactButtons, ReplyDialog } from './SubContact';
import { KEYS, LastContactCell, ReplyBadge, StatusBadge, detailLink, useSubLookups, useTemplates, type AutoKind, type Contact, type SubDashboard, type SubDetail, type SubRow, type Template, type Status } from './shared';
import { downloadCsv } from '../attendance/shared';
import { DashboardSkeleton } from '../correspondence/CorDashboardPage';

export function SubLayout() {
  const L = useSubLookups().data;
  const items = [
    { to: '/subscribers', label: tr("نظرة عامة"), end: true },
    ...(L?.isStaff ? [{ to: '/subscribers/followup', label: tr("متابعة التجديد") }, { to: '/subscribers/list', label: tr("المشتركون") }] : []),
    { to: '/subscribers/reports', label: tr("التقارير") },
    ...(L?.isManager ? [{ to: '/subscribers/settings', label: tr("الإعدادات") }] : [])
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={tr("المالية")} title={tr("المشتركون")} subtitle={tr("من جدّد ومن لم يجدد، ومتابعة التواصل معهم")} />
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
          <DataTable sticky sort={t.sort} onSort={t.onSort} pager={<Pager {...t.pager} />} minWidth={880}
            head={[{ key: 'name', label: tr("المشترك") }, { key: 'packageName', label: tr("الباقة") }, { key: 'expiresAt', label: tr("ينتهي") }, { key: 'status', label: tr("الحالة") },
              { key: 'lastContactAt', label: tr("آخر تواصل") }, { key: 'purchases', label: tr("مرات الشراء") }, { key: 'assignedName', label: tr("المسؤول") }]}>
            {t.rows.map((r) => (
              <tr key={r.ref} className="cursor-pointer hover:bg-chip/40" onClick={() => nav(detailLink(r.ref))}>
                <td><span className="flex flex-col"><Link to={detailLink(r.ref)} className="font-semibold text-fg no-underline">{r.name || (r.forgotten ? tr("(حُذفت بياناته)") : tr("(بلا اسم)"))}</Link>
                  <span className="num text-[12px] text-muted" dir="ltr">{[r.mobileMask, r.emailMask].filter(Boolean).join(' · ') || tr("لا تواصل")}</span></span></td>
                <td className="text-[13px]">{r.packageName}</td>
                <td className="num whitespace-nowrap text-[13px]">{dmy(r.expiresAt)}{r.daysLeft != null && r.daysLeft <= 7 && <div className="text-[11px] text-warn">{tr("بعد {0} يوم", r.daysLeft)}</div>}</td>
                <td><StatusBadge s={r} />{r.optOut && <Badge>{tr("أوقف الرسائل")}</Badge>}</td>
                <td><LastContactCell r={r} />{r.reply && <div className="mt-0.5"><ReplyBadge reply={r.reply} label={r.replyLabel} /></div>}</td>
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
          { k: tr("أول شراء"), v: <span className="num">{dateText(s.firstPaidAt, false)}</span> },
          { k: tr("المسؤول"), v: s.assignedName || '—' },
          { k: tr("إيقاف الرسائل"), v: s.optOut ? tr("{0} · {1}", dateText(s.optOutAt, false), s.optOutReason || '') : '—' }
        ]} />
        {shown && <p className="m-0 text-[12px] text-muted">{tr("سُجّل إظهار التواصل في سجل العمليات.")}</p>}
        {!s.id && <p className="m-0 rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn">{tr("لا بيانات تواصل لهذا المشترك. أعد رفع ملف البوابة الذي فيه عملياته من «المنصات».")}</p>}
        {s.id && !s.forgotten && <div className="border-t border-line pt-3"><ContactButtons s={s} /></div>}
      </Card>

      {s.id && <ContactLog contacts={s.contacts} />}

      <Card padded={false}>
        <CardHeader title={tr("دورات الاشتراك")} />
        <DataTable minWidth={560} head={[tr("الشراء"), tr("الباقة"), tr("المبلغ"), tr("ينتهي"), tr("النتيجة")]}>
          {s.cycles.map((c) => (
            <tr key={c.gatewayId}>
              <td className="num text-[13px]">{dateText(c.paidAt, false)}</td>
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

/** سجل التواصل في صفحة المشترك: من الأحدث، مع تحديث الرد لكل سطر */
function ContactLog({ contacts }: { contacts: Contact[] }) {
  const [editing, setEditing] = useState<Contact | null>(null);
  const icon = (c: Contact) => (c.channel === 'whatsapp' ? 'chat' : c.channel === 'email' ? 'mail' : c.channel === 'call' ? 'phone' : 'user') as 'chat' | 'mail' | 'phone' | 'user';
  return (
    <Card padded={false}>
      <CardHeader title={tr("سجل التواصل")} />
      {contacts.length === 0 ? <EmptyState title={tr("لم يُتواصل معه بعد")} body={tr("كل رسالة أو مكالمة تُسجَّل هنا بتاريخها ومن قام بها وحالة الرد.")} /> : (
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          {contacts.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:px-5">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-chip text-muted"><Icon name={icon(c)} size={16} /></span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-1.5 text-[14px]">
                  <span className="font-semibold">{c.channelLabel}</span>
                  {c.direction === 'in' && <Badge tone="info">{tr("وارد")}</Badge>}
                  {(c.templateName || c.kind !== 'manual') && <span className="text-muted">· {c.templateName || c.kindLabel}</span>}
                  <ReplyBadge reply={c.reply} label={c.replyLabel} />
                  {c.status !== 'sent' && <Badge tone={c.status === 'failed' ? 'bad' : 'neutral'}>{c.skipLabel ? tr("{0}: {1}", c.statusLabel, c.skipLabel) : c.statusLabel}</Badge>}
                </div>
                <div className="text-[12px] text-muted"><span className="num">{dateText(c.createdAt)}</span> · {c.auto ? tr("آلي") : c.byName || '—'}
                  {c.replyByName && c.replyAt && <> · {tr("الرد سجّله {0}", c.replyByName)}</>}
                  {c.nextFollowUpAt && <> · <span className="num">{tr("متابعة {0}", dmy(c.nextFollowUpAt))}</span></>}
                </div>
                {c.subject && <div className="text-[13px]">{c.subject}</div>}
                {c.note && <p className="m-0 whitespace-pre-wrap text-[13px]">{c.note}</p>}
                {c.error && <p className="m-0 text-[12px] text-bad">{c.error}</p>}
              </div>
              {c.status === 'sent' && <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing(c)}>{tr("تحديث الرد")}</Button>}
            </li>
          ))}
        </ul>
      )}
      {editing && <ReplyDialog id={editing.id} reply={editing.reply} next={editing.nextFollowUpAt} note={editing.note} onClose={() => setEditing(null)} />}
    </Card>
  );
}

const AUTO_KINDS: AutoKind[] = ['before14', 'before7', 'on_expiry', 'after7'];
const HOURS = Array.from({ length: 25 }, (_, h) => ({ value: String(h), label: String(h).padStart(2, '0') + ':00' }));

/** الإعدادات (مدير المتابعة): البريد التلقائي، القوالب، الرابط والاحتفاظ */
export function SubSettingsPage() {
  const L = useSubLookups().data;
  const toast = useToast();
  const [f, setF] = useState<{ renewalLink: string; retentionMonths: string } | null>(null);
  const [a, setA] = useState<{ autoEmail: boolean; autoKinds: Record<AutoKind, boolean>; sendFrom: string; sendTo: string; dailyCap: string; senderName: string } | null>(null);
  const [running, setRunning] = useState(false);
  const save = useAction('sub.settings.save', { invalidate: KEYS, success: tr("حُفظت الإعدادات"), onSuccess: () => { setF(null); setA(null); } });
  if (!L?.settings) return <Loader />;
  const st = L.settings;
  const v = f || { renewalLink: st.renewalLink, retentionMonths: String(st.retentionMonths) };
  const av = a || { autoEmail: st.autoEmail, autoKinds: st.autoKinds, sendFrom: String(st.sendFrom), sendTo: String(st.sendTo), dailyCap: String(st.dailyCap), senderName: st.senderName };
  const kindLabel = (k: string) => L.kinds.find((x) => x.id === k)?.label || k;
  const run = async () => {
    setRunning(true);
    try {
      const r = await api<{ sent: number; skipped: number; failed: number; noEmail: number; reason: string }>('sub.reminders.run', {});
      const why: Record<string, string> = {
        off: tr("البريد التلقائي متوقف."), hours: tr("خارج ساعات الإرسال."), mail: tr("إرسال البريد غير مفعّل في الخادم."), running: tr("يعمل الآن من المشغّل الزمني."),
        no_templates: tr("لا قوالب بريد نشطة للمواعيد المفعّلة."), cap: tr("بلغ الحد اليومي."), quota: tr("انتهت حصة البريد اليوم.")
      };
      toast([tr("أُرسل {0} · تخطّى {1} · فشل {2} · بلا بريد {3}", r.sent, r.skipped, r.failed, r.noEmail), r.reason ? why[r.reason] || '' : ''].filter(Boolean).join(' '), r.failed ? 'bad' : undefined);
    } catch (e) { toast(errorText(e), 'bad'); } finally { setRunning(false); }
  };
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <PanelTitle title={tr("البريد التلقائي")} action={<Button size="sm" variant="ghost" icon="refresh" loading={running} onClick={run}>{tr("تشغيل الآن")}</Button>} />
        <Checkbox label={tr("إرسال التذكيرات بالبريد تلقائياً")} description={tr("كل ساعة داخل ساعات الإرسال، من حساب Google للبوابة. لا يصل لمن أوقف الرسائل، ولا يتكرر للدورة نفسها.")}
          checked={av.autoEmail} onChange={(x) => setA({ ...av, autoEmail: x })} />
        <div className="grid gap-2 sm:grid-cols-2">
          {AUTO_KINDS.map((k) => <Checkbox key={k} label={kindLabel(k)} checked={!!av.autoKinds[k]} disabled={!av.autoEmail} onChange={(x) => setA({ ...av, autoKinds: { ...av.autoKinds, [k]: x } })} />)}
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Select label={tr("من الساعة")} value={av.sendFrom} onChange={(e) => setA({ ...av, sendFrom: e.target.value })} options={HOURS.slice(0, 24)} />
          <Select label={tr("إلى الساعة")} value={av.sendTo} onChange={(e) => setA({ ...av, sendTo: e.target.value })} options={HOURS.slice(1)} />
          <TextInput label={tr("الحد اليومي")} ltr inputMode="numeric" value={av.dailyCap} onChange={(e) => setA({ ...av, dailyCap: e.target.value })} />
          <TextInput label={tr("اسم المرسل")} value={av.senderName} onChange={(e) => setA({ ...av, senderName: e.target.value })} placeholder={tr("اسم المنصة")} />
        </div>
        <p className="m-0 text-[12px] text-muted">{tr("يُستخدم أول قالب بريد نشط لكل موعد. حصة حساب Gmail نحو 100 رسالة يومياً.")}</p>
        <div><Button variant="primary" loading={save.isPending} disabled={!a} onClick={() => save.mutate(av)}>{tr("حفظ")}</Button></div>
      </Card>

      <TemplatesCard />

      <Card className="flex flex-col gap-3">
        <PanelTitle title={tr("عام")} />
        <TextInput label={tr("رابط التجديد في الرسائل")} ltr value={v.renewalLink} onChange={(e) => setF({ ...v, renewalLink: e.target.value })} placeholder="https://" hint={tr("يحل محل {رابط_التجديد} في القوالب. بدونه يُحذف سطره من الرسالة.")} />
        <TextInput label={tr("مدة الاحتفاظ ببيانات التواصل (شهر)")} ltr inputMode="numeric" value={v.retentionMonths} onChange={(e) => setF({ ...v, retentionMonths: e.target.value })} hint={tr("بعدها بلا شراء تُمسح بيانات التواصل تلقائياً")} />
        <div><Button variant="primary" loading={save.isPending} disabled={!f} onClick={() => save.mutate(v)}>{tr("حفظ")}</Button></div>
      </Card>
    </div>
  );
}

type TplForm = { id?: string; channel: 'whatsapp' | 'email'; kind: string; name: string; subject: string; body: string; active: boolean };

/** قوالب الرسائل: لكل قناة ونوع، مع معاينة بقيم تجريبية */
function TemplatesCard() {
  const q = useTemplates();
  const [form, setForm] = useState<TplForm | null>(null);
  const [removing, setRemoving] = useState<Template | null>(null);
  const del = useAction('sub.template.remove', { invalidate: ['sub.templates'], success: tr("حُذف القالب"), onSuccess: () => setRemoving(null) });
  const groups: { ch: 'whatsapp' | 'email'; label: string }[] = [{ ch: 'whatsapp', label: tr("واتساب") }, { ch: 'email', label: tr("البريد") }];
  return (
    <Card padded={false}>
      <CardHeader title={tr("قوالب الرسائل")} action={<Button size="sm" variant="secondary" icon="plus" onClick={() => setForm({ channel: 'whatsapp', kind: 'before7', name: '', subject: '', body: '', active: true })}>{tr("قالب جديد")}</Button>} />
      {q.isError ? <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} /> : !q.data ? <Loader /> : groups.map((g) => {
        const list = q.data.filter((t) => t.channel === g.ch);
        return (
          <div key={g.ch} className="border-t border-line">
            <div className="px-4 pt-3 text-[13px] font-semibold text-muted sm:px-5">{g.label}</div>
            {list.length === 0 ? <p className="m-0 px-4 pb-3 pt-1 text-[13px] text-muted sm:px-5">{tr("لا قوالب")}</p> : (
              <ul className="m-0 flex list-none flex-col p-0">
                {list.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 px-4 py-2.5 sm:px-5">
                    <button type="button" className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-start text-fg" onClick={() => setForm({ id: t.id, channel: t.channel, kind: t.kind, name: t.name, subject: t.subject, body: t.body, active: t.active })}>
                      <span className="block truncate font-semibold">{t.name}</span>
                      <span className="block truncate text-[12px] text-muted">{t.kindLabel}{t.subject ? ' · ' + t.subject : ''}</span>
                    </button>
                    {!t.active && <Badge>{tr("موقوف")}</Badge>}
                    <IconAction icon="edit" label={tr("تعديل")} onClick={() => setForm({ id: t.id, channel: t.channel, kind: t.kind, name: t.name, subject: t.subject, body: t.body, active: t.active })} />
                    <IconAction icon="trash" label={tr("حذف")} danger onClick={() => setRemoving(t)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {form && <TemplateDialog value={form} onClose={() => setForm(null)} />}
      <Dialog open={!!removing} onClose={() => setRemoving(null)} title={tr("حذف القالب")}
        footer={<><Button variant="danger" className="flex-1" loading={del.isPending} onClick={() => removing && del.mutate({ id: removing.id })}>{tr("حذف")}</Button><Button variant="ghost" onClick={() => setRemoving(null)}>{tr("تراجع")}</Button></>}>
        <p className="m-0">{tr("يُحذف القالب «{0}». السجلات السابقة تبقى.", removing?.name || '')}</p>
      </Dialog>
    </Card>
  );
}

function TemplateDialog({ value, onClose }: { value: TplForm; onClose: () => void }) {
  const L = useSubLookups().data;
  const toast = useToast();
  const [f, setF] = useState<TplForm>(value);
  const [pv, setPv] = useState<{ subject: string; body: string } | null>(null);
  const save = useAction('sub.template.save', { invalidate: ['sub.templates'], success: tr("حُفظ القالب"), onSuccess: onClose });
  const preview = async () => {
    try { setPv(await api<{ subject: string; body: string }>('sub.message.preview', { subject: f.channel === 'email' ? f.subject : '', body: f.body })); }
    catch (e) { toast(errorText(e), 'bad'); }
  };
  const insert = (token: string) => setF({ ...f, body: f.body + (f.body && !f.body.endsWith(' ') && !f.body.endsWith('\n') ? ' ' : '') + token });
  return (
    <Dialog open onClose={onClose} title={f.id ? tr("تعديل القالب") : tr("قالب جديد")} wide
      onSubmit={() => save.mutate(f)}
      footer={<><Button type="submit" variant="primary" className="flex-1" loading={save.isPending}>{tr("حفظ")}</Button><Button variant="ghost" onClick={preview}>{tr("معاينة")}</Button><Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label={tr("القناة")} value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value as TplForm['channel'] })} options={[{ value: 'whatsapp', label: tr("واتساب") }, { value: 'email', label: tr("البريد") }]} />
        <Select label={tr("النوع")} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={(L?.kinds || []).map((k) => ({ value: k.id, label: k.label }))} />
      </div>
      <TextInput label={tr("اسم القالب")} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      {f.channel === 'email' && <TextInput label={tr("عنوان البريد")} required value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />}
      <Textarea label={tr("نص الرسالة")} required rows={8} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-muted">{tr("المتغيرات:")}</span>
        {(L?.vars || []).map((x) => <button key={x} type="button" className="cursor-pointer rounded-md border border-line bg-chip px-2 py-1 text-[12px] text-fg" onClick={() => insert(x)}>{x}</button>)}
      </div>
      <p className="m-0 text-[12px] text-muted">{f.channel === 'email' ? tr("يُلحق رابط «إيقاف الرسائل» بكل بريد تلقائياً.") : tr("أضف في آخر الرسالة طريقة الإيقاف، مثل: لإيقاف هذه الرسائل أرسل: إيقاف")}</p>
      <Checkbox label={tr("القالب نشط")} checked={f.active} onChange={(x) => setF({ ...f, active: x })} />
      {pv && (
        <div className="rounded-lg border border-line bg-chip/40 p-3 text-[14px]">
          <div className="mb-1 text-[12px] font-semibold text-muted">{tr("معاينة بقيم تجريبية")}</div>
          {pv.subject && <div className="mb-2 font-semibold">{pv.subject}</div>}
          <p className="m-0 whitespace-pre-wrap">{pv.body}</p>
        </div>
      )}
    </Dialog>
  );
}
