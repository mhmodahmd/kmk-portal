import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { api } from '../../lib/api';
import { errorText, useApi } from '../../lib/useApi';
import { dateText, dmy, monthLabel } from '../../lib/format';
import { Badge, Card, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { Bars, Kpi, PanelTitle } from '../../ui/Dashboard';
import { Button } from '../../ui/Button';
import { DataTable, Pager, SearchBox, Segmented, useTable } from '../../ui/Controls';
import { Select } from '../../ui/Field';
import { useToast } from '../../ui/Overlay';
import { downloadCsv } from '../attendance/shared';
import { DashboardSkeleton } from '../correspondence/CorDashboardPage';
import { ContactButtons } from './SubContact';
import { LastContactCell, ReplyBadge, daysLeftText, detailLink, useSubLookups, type SubRow } from './shared';

type Win = '7' | '14' | 'expired';
interface FollowRow extends SubRow { overdue: boolean }
interface Followup {
  today: string; window: Win; rows: FollowRow[]; auto: { enabled: boolean; sentToday: number; cap: number };
  kpis: { in7: number; in14: number; soon: number; soonContacted: number; notContacted: number; waiting: number; promised: number; overdue: number; expired: number; contactedRate: number | null };
}

/** متابعة التجديد: من تنتهي باقته خلال أسبوع أو أسبوعين، ومن انتهت ولم يجدد، مع التواصل من السطر نفسه */
export function SubFollowupPage() {
  const L = useSubLookups().data;
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const w = (['7', '14', 'expired'].includes(params.get('w') || '') ? params.get('w') : '14') as Win;
  const contact = params.get('c') || '', pkg = params.get('pkg') || '', assigned = params.get('a') || '';
  const [search, setSearch] = useState('');
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };
  const q = useApi<Followup>('sub.followup', { window: w, contact: contact || undefined, packageId: pkg || undefined, assigned: assigned || undefined }, { staleTime: 15_000 });
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data?.rows || []).filter((r) => !s || (r.name + ' ' + r.mobileMask + ' ' + r.emailMask).toLowerCase().includes(s));
  }, [q.data, search]);
  const t = useTable(rows, { pageSize: 25 });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const d = q.data;
  if (!d) return <DashboardSkeleton />;
  const k = d.kpis;
  const link = (w2: Win, c = '') => '/subscribers/followup?w=' + w2 + (c ? '&c=' + c : '');
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={tr("تنتهي خلال 7 أيام")} value={k.in7} icon="clock" tone={k.in7 ? 'warn' : 'ok'} strong to={link('7')} />
        <Kpi label={tr("تنتهي خلال 8–14 يوماً")} value={k.in14} icon="calendar" tone="info" to={link('14')} />
        <Kpi label={tr("لم يُتواصل معهم بعد")} value={k.notContacted} icon="alert" tone={k.notContacted ? 'bad' : 'ok'} strong to={link('14', 'none')}
          foot={k.contactedRate != null ? tr("تُوصل مع {0}% ممن تنتهي باقاتهم", k.contactedRate) : ''} />
        <Kpi label={tr("انتهت ولم تجدد")} value={k.expired} icon="history" tone={k.expired ? 'bad' : 'ok'} to={link('expired')} foot={tr("آخر 30 يوماً")} />
        <Kpi label={tr("بانتظار الرد")} value={k.waiting} icon="chat" tone="info" to={link(w, 'waiting')} />
        <Kpi label={tr("وعدوا بالتجديد")} value={k.promised} icon="check" tone="ok" to={link(w, 'promised')} />
        <Kpi label={tr("متابعة متأخرة")} value={k.overdue} icon="bell" tone={k.overdue ? 'warn' : 'ok'} strong to={link(w, 'overdue')} foot={tr("مضى موعد متابعتها")} />
        <Kpi label={tr("البريد التلقائي اليوم")} value={d.auto.enabled ? tr("{0} من {1}", d.auto.sentToday, d.auto.cap) : tr("متوقف")} icon="mail" tone={d.auto.enabled ? 'ok' : 'info'}
          to={L?.isManager ? '/subscribers/settings' : undefined} foot={d.auto.enabled ? tr("حسب الإعدادات") : tr("يُشغَّل من الإعدادات")} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Segmented label={tr("المدة")} value={w} onChange={(v) => set('w', v)} options={[
          { value: '7', label: tr("خلال أسبوع"), count: k.in7 }, { value: '14', label: tr("خلال أسبوعين"), count: k.soon }, { value: 'expired', label: tr("انتهت مؤخراً"), count: k.expired }
        ]} />
        <Select label={tr("التواصل")} className="w-44" value={contact} onChange={(e) => set('c', e.target.value)} options={[
          { value: '', label: tr("الكل") }, { value: 'none', label: tr("لم يُتواصل معه") }, { value: 'contacted', label: tr("تُوصل معه") }, { value: 'overdue', label: tr("متابعة متأخرة") },
          ...(L?.replies || []).map((r) => ({ value: r.id, label: r.label }))
        ]} />
        <Select label={tr("الباقة")} className="w-40" value={pkg} onChange={(e) => set('pkg', e.target.value)} options={[{ value: '', label: tr("الكل") }, ...(L?.packages || []).map((p) => ({ value: p.id, label: p.name }))]} />
        <Select label={tr("المسؤول")} className="w-36" value={assigned} onChange={(e) => set('a', e.target.value)} options={[{ value: '', label: tr("الكل") }, { value: 'me', label: tr("المسندون إليّ") }, { value: 'none', label: tr("غير مسندين") }]} />
        <div className="min-w-[180px] flex-1"><SearchBox id="sub-follow-search" value={search} onChange={setSearch} placeholder={tr("بحث بالاسم")} /></div>
      </div>

      <Card padded={false}>
        {rows.length === 0 ? <EmptyState title={tr("لا مشتركين بهذه التصفية")} body={w === 'expired' ? undefined : tr("لا أحد تنتهي باقته في هذه المدة، أو تُوصل مع الجميع.")} /> : (
          <DataTable sticky pager={<Pager {...t.pager} />} minWidth={900}
            head={[tr("المشترك"), tr("تواصل"), tr("ينتهي"), tr("آخر تواصل"), tr("الرد"), tr("المسؤول")]}>
            {t.rows.map((r) => (
              <tr key={r.ref} className="cursor-pointer hover:bg-chip/40" onClick={() => nav(detailLink(r.ref))}>
                <td><span className="flex flex-col"><Link to={detailLink(r.ref)} className="font-semibold text-fg no-underline" onClick={(e) => e.stopPropagation()}>{r.name || tr("(بلا اسم)")}</Link>
                  <span className="num text-[12px] text-muted" dir="ltr">{[r.mobileMask, r.emailMask].filter(Boolean).join(' · ') || tr("لا تواصل")}</span>
                  <span className="text-[12px] text-muted">{r.packageName}</span></span></td>
                <td><ContactButtons s={r} compact /></td>
                <td className="num whitespace-nowrap text-[13px]">{dmy(r.expiresAt)}<div className={r.daysLeft != null && r.daysLeft <= 7 ? 'text-[11px] text-warn' : 'text-[11px] text-muted'}>{daysLeftText(r)}</div></td>
                <td><LastContactCell r={r} /></td>
                <td><span className="inline-flex flex-wrap gap-1"><ReplyBadge reply={r.reply} label={r.replyLabel} />{r.overdue && <Badge tone="warn">{tr("متأخرة")}</Badge>}{r.optOut && <Badge>{tr("أوقف الرسائل")}</Badge>}</span>
                  {r.nextFollowUpAt && <div className="num text-[11px] text-muted">{tr("متابعة {0}", dmy(r.nextFollowUpAt))}</div>}</td>
                <td className="text-[13px]">{r.assignedName || '—'}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  );
}

interface Report {
  from: string; to: string; days: number; totals: { contacts: number; replied: number; subscribers: number; manual: number }; auto: { sent: number; skipped: number; failed: number };
  byChannel: { channel: string; label: string; total: number; replied: number; rate: number | null }[];
  byReply: { id: string; label: string; count: number }[];
  byStaff: { userId: string; name: string; contacts: number; replied: number; renewed: number }[];
  byMonth: { month: string; total: number; contacted: number; contactedBefore: number; renewed: number; renewedContacted: number; renewedNot: number; rateContacted: number | null; rateNot: number | null }[];
}
interface ExportRow { createdAt: string; name: string; mobileMask: string; channelLabel: string; direction: string; kindLabel: string; templateName: string; auto: boolean; byName: string; statusLabel: string; replyLabel: string; nextFollowUpAt: string; note: string }

const pct = (v: number | null) => (v == null ? '—' : v + '%');

/** تقارير المتابعة: التواصل في الفترة، وأثره في التجديد لكل شهر انتهاء */
export function SubReportsPage() {
  const L = useSubLookups().data;
  const toast = useToast();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const q = useApi<Report>('sub.report', { days: Number(days) }, { staleTime: 30_000 });
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const list = await api<ExportRow[]>('sub.report.export', { days: Number(days) });
      downloadCsv(tr("سجل التواصل.csv"), [[tr("التاريخ"), tr("المشترك"), tr("الجوال"), tr("القناة"), tr("الاتجاه"), tr("النوع"), tr("القالب"), tr("بواسطة"), tr("الحالة"), tr("الرد"), tr("موعد المتابعة"), tr("ملاحظة")],
        ...list.map((x) => [dateText(x.createdAt), x.name, x.mobileMask, x.channelLabel, x.direction === 'in' ? tr("وارد") : tr("صادر"), x.kindLabel, x.templateName, x.auto ? tr("آلي") : x.byName, x.statusLabel, x.replyLabel, x.nextFollowUpAt ? dmy(x.nextFollowUpAt) : '', x.note])]);
    } catch (e) { toast(errorText(e), 'bad'); } finally { setExporting(false); }
  };
  const head = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <Segmented label={tr("الفترة")} value={days} onChange={setDays} options={[{ value: '7', label: tr("7 أيام") }, { value: '30', label: tr("30 يوماً") }, { value: '90', label: tr("90 يوماً") }]} />
      {L?.isManager && <Button size="sm" variant="ghost" icon="download" loading={exporting} onClick={exportCsv}>{tr("تنزيل سجل التواصل (Excel)")}</Button>}
    </div>
  );
  if (q.isError) return <div className="flex flex-col gap-4">{head}<ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} /></div>;
  const r = q.data;
  if (!r) return <div className="flex flex-col gap-4">{head}<Loader /></div>;
  const replyRate = r.totals.contacts ? Math.round(r.totals.replied * 100 / r.totals.contacts) : null;
  return (
    <div className="flex flex-col gap-4">
      {head}
      <p className="m-0 text-[13px] text-muted">{tr("من {0} إلى {1}", dmy(r.from), dmy(r.to))}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={tr("تواصلات")} value={r.totals.contacts} icon="chat" foot={tr("{0} يدوي", r.totals.manual)} />
        <Kpi label={tr("مشتركون تُوصل معهم")} value={r.totals.subscribers} icon="users" />
        <Kpi label={tr("نسبة الرد")} value={pct(replyRate)} icon="check" tone="ok" foot={tr("ردّ {0}", r.totals.replied)} />
        <Kpi label={tr("بريد تلقائي")} value={r.auto.sent} icon="mail" foot={tr("تخطّى {0} · فشل {1}", r.auto.skipped, r.auto.failed)} tone={r.auto.failed ? 'warn' : 'info'} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <PanelTitle title={tr("حسب القناة")} />
          <Bars rows={r.byChannel.map((c) => ({ key: c.channel, label: c.label, value: c.total, display: tr("{0} · رد {1}", c.total, pct(c.rate)) }))} empty={tr("لا تواصل في الفترة")} />
        </Card>
        <Card className="flex flex-col gap-3">
          <PanelTitle title={tr("حالات الرد")} />
          <Bars rows={r.byReply.filter((x) => x.count).map((x) => ({ key: x.id, label: x.label, value: x.count, tone: x.id === 'refused' || x.id === 'wrong_contact' ? 'bad' as const : x.id === 'promised' || x.id === 'renewed' || x.id === 'interested' ? 'ok' as const : undefined }))} empty={tr("لا ردود مسجلة")} />
        </Card>
      </div>
      <Card padded={false}>
        <div className="px-4 pt-4 sm:px-5"><PanelTitle title={tr("أداء الموظفين")} /></div>
        {r.byStaff.length === 0 ? <EmptyState title={tr("لا تواصل يدوي في الفترة")} /> : (
          <DataTable minWidth={480} head={[tr("الموظف"), tr("تواصلات"), tr("ردود"), tr("جدّدوا بعد تواصله")]}>
            {r.byStaff.map((s) => (
              <tr key={s.userId}><td className="font-semibold">{s.name || '—'}</td><td className="num">{s.contacts}</td><td className="num">{s.replied}</td><td className="num">{s.renewed}</td></tr>
            ))}
          </DataTable>
        )}
      </Card>
      <Card padded={false}>
        <div className="px-4 pt-4 sm:px-5"><PanelTitle title={tr("أثر التواصل في التجديد حسب شهر الانتهاء")} /></div>
        {r.byMonth.length === 0 ? <EmptyState title={tr("لم تنتهِ أي دورة اشتراك بعد")} /> : (
          <DataTable minWidth={720} head={[tr("الشهر"), tr("انتهت"), tr("تُوصل معهم"), tr("قبل الانتهاء"), tr("جدّدوا"), tr("التجديد مع التواصل"), tr("التجديد دون تواصل")]}>
            {r.byMonth.map((m) => (
              <tr key={m.month}>
                <td className="whitespace-nowrap">{monthLabel(m.month)}</td><td className="num">{m.total}</td><td className="num">{m.contacted}</td><td className="num">{m.contactedBefore}</td>
                <td className="num">{m.renewed}</td><td className="num">{tr("{0} ({1})", m.renewedContacted, pct(m.rateContacted))}</td><td className="num">{tr("{0} ({1})", m.renewedNot, pct(m.rateNot))}</td>
              </tr>
            ))}
          </DataTable>
        )}
        <p className="m-0 px-4 pb-4 text-[12px] text-muted sm:px-5">{tr("الشهر الأخير أولي حتى يُرفع كشفه في «المنصات».")}</p>
      </Card>
    </div>
  );
}
