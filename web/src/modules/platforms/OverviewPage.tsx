import { useState } from 'react';
import { Link } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { dmy, monthLabel } from '../../lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorBox } from '../../ui/Display';
import { Bars, Change, Kpi, Legend, MiniStats, PanelTitle, TrendBars } from '../../ui/Dashboard';
import { MultiPick, type PickOption } from '../../ui/Controls';
import { Button } from '../../ui/Button';
import { kwd } from '../custody/shared';
import { DashboardSkeleton } from '../correspondence/CorDashboardPage';
import { PeriodPicker, periodLabel } from './PeriodPicker';
import { pltLink, usePlatform, usePltLookups } from './shared';
import type { PltDashboard } from './types';

const SERIES = [{ key: 'sales', label: tr("مبيعات التطبيق (صافي)"), color: 'var(--c-accent)' }, { key: 'sponsorship', label: tr("الرعايات والعقود"), color: 'var(--c-ok)' }];
const short = (f: number) => (f / 1000).toLocaleString('en-US', { maximumFractionDigits: 0 });

/**
 * لوحة المنصات: أقسام التقرير الشهري الستة + الرعايات والعقود. كل رقم رابط إلى ما وراءه.
 * التصفية بباقة أو أكثر (مبيعات التطبيق) وبمركز أو أكثر (الرعايات والمسابقات والجهات)، وكل الأرقام والرسوم تتبعها.
 */
export default function PltOverviewPage() {
  const [platform] = usePlatform();
  const L = usePltLookups().data;
  const [period, setPeriod] = useState('');
  const [pkgs, setPkgs] = useState<string[]>([]);
  const [ctrs, setCtrs] = useState<string[]>([]);
  const pid = L?.platforms.find((p) => p.key === platform)?.id || '';
  const multiPlatform = !pid && (L?.platforms.length || 0) > 1;
  const pName = (id: string) => L?.platforms.find((p) => p.id === id)?.name || '';
  const pkgOptions: PickOption[] = (L?.packages || []).filter((p) => p.kind !== 'test' && (!pid || p.platformId === pid))
    .map((p) => ({ value: p.id, label: p.name, sub: [multiPlatform ? pName(p.platformId) : '', p.kindLabel, p.active ? '' : tr("غير مفعّلة")].filter(Boolean).join(' · ') }));
  const ctrOptions: PickOption[] = (L?.centers || []).filter((c) => !pid || c.platformId === pid)
    .map((c) => ({ value: c.id, label: c.name, sub: [multiPlatform ? pName(c.platformId) : '', c.status !== 'active' ? L?.centerStatuses.find((x) => x.id === c.status)?.label || '' : ''].filter(Boolean).join(' · ') }));
  // عند تغيير المنصة يسقط ما لا ينتمي إليها
  const selPkgs = L ? pkgs.filter((x) => pkgOptions.some((o) => o.value === x)) : pkgs;
  const selCtrs = L ? ctrs.filter((x) => ctrOptions.some((o) => o.value === x)) : ctrs;
  const filtered = selPkgs.length > 0 || selCtrs.length > 0;
  const q = useApi<PltDashboard>('plt.dashboard', { platform, period: period || undefined, packages: selPkgs.length ? selPkgs : undefined, centers: selCtrs.length ? selCtrs : undefined },
    { staleTime: 30_000, placeholderData: (prev) => prev });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const d = q.data;
  if (!d) return <DashboardSkeleton />;
  const s = d.summary;
  const multi = d.period.length > 1, label = periodLabel(d.periodKey);
  const vs = /^\d{4}$/.test(d.periodKey) ? tr("عن السنة السابقة") : multi ? tr("عن الفترة السابقة") : tr("عن الشهر الماضي");
  // صفحة المبيعات تأخذ باقة واحدة: تُمرَّر إن كانت المختارة واحدة
  const sales = (extra: Record<string, string | undefined> = {}) => pltLink('/platforms/sales/' + d.periodKey, platform, { ...(selPkgs.length === 1 ? { pkg: selPkgs[0] } : {}), ...extra });
  const hasSales = s.count > 0 || s.prevCount > 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <PeriodPicker value={d.periodKey} onChange={setPeriod} withData={d.months} />
          <MultiPick label={tr("الباقات")} allLabel={tr("كل الباقات")} countLabel={tr("{0} باقات")} icon="filter" value={selPkgs} onChange={setPkgs} options={pkgOptions} />
          <MultiPick label={tr("المراكز")} allLabel={tr("كل المراكز")} countLabel={tr("{0} مراكز")} icon="building" value={selCtrs} onChange={setCtrs} options={ctrOptions} />
          {q.isFetching && q.isPlaceholderData && <span className="text-[12px] text-muted" role="status">{tr("جارٍ التحديث…")}</span>}
        </div>
        <span className="flex items-center gap-2 text-[13px] text-muted">
          {d.monthStatus === 'approved' ? <Badge tone="ok">{multi ? tr("أشهر الفترة معتمدة") : tr("شهر معتمد")}</Badge>
            : d.monthStatus === 'draft' ? <Badge tone="warn">{multi ? tr("فيها أشهر لم تُعتمد") : tr("مسودة لم تُعتمد")}</Badge> : null}
          {tr("المبالغ بالدينار الكويتي · بتوقيت الكويت")}
        </span>
      </div>
      {multi && <p className="-mt-2 m-0 text-[12px] text-muted">{tr("المقارنة بـ {0}", periodLabel(d.prevKey))}</p>}
      {filtered && (
        <div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-accent-soft px-3 py-2 text-[13px]">
          <span className="min-w-0 flex-1">
            {[selPkgs.length ? tr("مبيعات التطبيق لـ {0} فقط", pkgOptions.filter((o) => selPkgs.includes(o.value)).map((o) => o.label).join('، ')) : '',
              selCtrs.length ? tr("الرعايات والمسابقات والجهات لـ {0} فقط", ctrOptions.filter((o) => selCtrs.includes(o.value)).map((o) => o.label).join('، ')) : ''].filter(Boolean).join(' · ')}
            <span className="block text-[12px] text-muted">{tr("الباقات تُصفّي مبيعات التطبيق، والمراكز تُصفّي الرعايات، لأن مبيعات التطبيق لا تُنسب إلى مركز.")}</span>
          </span>
          <Button size="sm" variant="ghost" icon="x" onClick={() => { setPkgs([]); setCtrs([]); }}>{tr("مسح التصفية")}</Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={multi ? tr("إيراد الفترة") : tr("إيراد الشهر")} value={kwd(s.revenue, false)} icon="finance" strong foot={<Change now={s.revenue} prev={s.prevRevenue} label={vs} format={(n) => kwd(n)} />} />
        <Kpi label={tr("صافي مبيعات التطبيق")} value={kwd(s.net, false)} icon="wallet" to={sales()}
          foot={<>{tr("{0} عملية", s.count)} · <Change now={s.net} prev={s.prevNet} label={vs} format={(n) => kwd(n)} /></>} />
        <Kpi label={tr("الرعايات والعقود المحصّلة")} value={kwd(s.sponsorship, false)} icon="briefcase" to={pltLink('/platforms/campaigns', platform)}
          foot={<Change now={s.sponsorship} prev={s.prevSponsorship} label={vs} format={(n) => kwd(n)} />} />
        <Kpi label={tr("منذ بداية السنة")} value={kwd(s.ytd, false)} icon="calendar" foot={tr("مبيعات {0} · رعايات {1}", kwd(s.ytdSales), kwd(s.ytdSponsorship))} />
      </div>

      <Card className="flex flex-col gap-3">
        <PanelTitle title={tr("الإيراد · آخر 12 شهراً")} action={<Legend series={SERIES} />} />
        <TrendBars data={d.trend} series={SERIES} labelOf={(x) => monthLabel(String(x.month)).replace(/ \d{4}$/, '')} format={short} label={tr("الإيراد · آخر 12 شهراً")} />
      </Card>

      {!hasSales ? (
        <Card>{selPkgs.length
          ? <EmptyState title={tr("لا مبيعات للباقات المختارة في هذه الفترة")} action={<Button variant="secondary" onClick={() => setPkgs([])}>{tr("كل الباقات")}</Button>} />
          : <EmptyState title={multi ? tr("لا مبيعات تطبيق في هذه الفترة") : tr("لا مبيعات تطبيق لهذا الشهر")} body={tr("استورد ملف بوابة الدفع من «المبيعات الشهرية» لتظهر الباقات والمشترون ووسائل الدفع.")} />}</Card>
      ) : (
        <>
          <Card className="flex flex-col gap-3">
            <PanelTitle title={tr("ملخص المبيعات · {0}", label)} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: tr("العمليات"), value: String(s.count), sub: multi ? tr("الفترة السابقة {0}", s.prevCount) : tr("الشهر السابق {0}", s.prevCount), to: sales() },
                { label: tr("الإجمالي"), value: kwd(s.amount), sub: '', to: sales() },
                { label: tr("عمولة البوابة"), value: kwd(s.fee), sub: s.fee ? '' : tr("لم تُضبط نسب العمولة") },
                { label: tr("متوسط العملية"), value: kwd(s.avg), sub: '' }
              ].map((x) => {
                const body = <><span className="text-[12px] text-muted">{x.label}</span><b className="num text-[17px]">{x.value}</b>{x.sub && <span className="text-[11px] text-muted">{x.sub}</span>}</>;
                return x.to ? <Link key={x.label} to={x.to} className="flex flex-col gap-0.5 rounded-lg bg-chip px-3 py-2 text-fg no-underline hover:bg-chip/70">{body}</Link>
                  : <div key={x.label} className="flex flex-col gap-0.5 rounded-lg bg-chip px-3 py-2">{body}</div>;
              })}
            </div>
          </Card>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card className="flex flex-col gap-3">
              <PanelTitle title={tr("الإيراد حسب الباقة")} />
              <Bars rows={d.byPackage.map((p) => ({ key: p.packageId, label: p.name, value: p.amount, display: kwd(p.amount), sub: tr("{0} عملية · {1}%", p.count, p.share), to: sales({ pkg: p.packageId }) }))} />
            </Card>
            <Card className="flex flex-col gap-3">
              <PanelTitle title={tr("باقة الإهداء")} />
              <MiniStats items={[
                { label: tr("عمليات الإهداء"), value: d.gift.count, to: sales({ kind: 'gift' }) },
                { label: tr("الأفراد المكفولون"), value: d.gift.people, sub: tr("متوسط {0} لكل عملية", d.gift.avgPeople) },
                { label: tr("المبلغ (د.ك)"), value: kwd(d.gift.amount, false) }
              ]} />
              <div className="flex flex-wrap gap-1.5 border-t border-line pt-3 text-[12px]">
                {[[tr("لفرد واحد"), d.gift.one], [tr("لفردين"), d.gift.two], [tr("لـ 3–4 أفراد"), d.gift.threeFour], [tr("لـ 5 فأكثر"), d.gift.fivePlus]].map(([l, v]) => (
                  <span key={String(l)} className="inline-flex items-center gap-1 rounded-full bg-chip px-2.5 py-1">{l}<b className="num">{v}</b></span>
                ))}
                {d.gift.review > 0 && <Badge tone="warn">{tr("{0} مبلغ لا يقبل القسمة على قيمة الفرد", d.gift.review)}</Badge>}
              </div>
            </Card>
          </div>

          <Card className="flex flex-col gap-3">
            <PanelTitle title={tr("مشترو الباقات")} />
            <MiniStats items={[
              { label: tr("المشترون"), value: d.buyers.buyers },
              { label: tr("جدد"), value: d.buyers.newBuyers, to: sales({ buyer: 'new' }) },
              { label: tr("عائدون من أشهر سابقة"), value: d.buyers.returning, to: sales({ buyer: 'returning' }) },
              { label: tr("اشتروا أكثر من مرة"), value: d.buyers.repeat },
            ]} />
            <MiniStats items={[
              { label: tr("ترقيات لباقة أعلى"), value: d.buyers.upgrades, to: sales({ buyer: 'upgrade' }) },
              { label: multi ? tr("اشتراكات سارية آخر الفترة") : tr("اشتراكات سارية آخر الشهر"), value: d.buyers.active },
              { label: tr("تنتهي الشهر القادم"), value: d.buyers.expiring, sub: tr("فرص تجديد") }
            ]} />
            <p className="m-0 text-[12px] text-muted">{tr("المشتري يُعرف برمز مشفّر من جواله أو بريده، ولا يُحفظ رقمه. البيانات تبدأ من {0}، فالسارية والعائدون تكتمل بعد استيراد الأشهر الأربعة السابقة.", d.buyers.historyFrom ? monthLabel(d.buyers.historyFrom) : '—')}</p>
          </Card>

          <div className="grid items-start gap-4 lg:grid-cols-3">
            <Card className="flex flex-col gap-3">
              <PanelTitle title={tr("وسائل الدفع")} />
              <Bars rows={d.methods.map((x) => ({ key: x.key, label: x.label, value: x.amount, display: kwd(x.amount), sub: tr("{0} عملية · عمولة {1}", x.count, kwd(x.fee)), to: sales({ method: x.key }) }))} />
            </Card>
            <Card className="flex flex-col gap-3">
              <PanelTitle title={tr("القنوات")} />
              <Bars rows={d.channels.map((x) => ({ key: x.key, label: x.label, value: x.amount, display: kwd(x.amount), sub: tr("{0} عملية", x.count), to: sales({ channel: x.key }) }))} />
            </Card>
            <Card className="flex flex-col gap-3">
              <PanelTitle title={tr("الدول")} />
              <Bars rows={d.countries.map((x) => ({ key: x.key || '-', label: x.label || tr("غير محدد"), value: x.amount, display: kwd(x.amount), sub: tr("{0} عملية", x.count), to: x.key === '*' ? undefined : sales({ country: x.key || '-' }) }))} />
            </Card>
          </div>
        </>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <PanelTitle title={tr("المراكز · المحصّل من الرعاة")} action={<Link to={pltLink('/platforms/centers', platform)} className="text-[13px] font-semibold text-accent-fg no-underline">{tr("كل المراكز")}</Link>} />
          <Bars empty={selCtrs.length ? tr("لا بيانات للمراكز المختارة") : tr("لا مراكز بعد")} rows={d.centers.map((c) => ({ key: c.id, label: c.name, value: c.collected, display: kwd(c.collected), sub: c.scheduled ? tr("مجدول {0}", kwd(c.scheduled)) : tr("{0} مشروع", c.projectsCount), to: pltLink('/platforms/centers', platform, { center: c.id }) }))} />
        </Card>
        <Card padded={false}>
          <CardHeader title={tr("المسابقات والتحديات الجارية")} action={<Link to={pltLink('/platforms/campaigns', platform)} className="text-[13px] font-semibold text-accent-fg no-underline">{tr("الكل")}</Link>} />
          {d.campaigns.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{selCtrs.length ? tr("لا مسابقات جارية أو مخططة في المراكز المختارة.") : tr("لا مسابقات جارية أو مخططة.")}</p> : d.campaigns.map((c) => (
            <Link key={c.id} to={pltLink('/platforms/campaigns', platform)} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3 text-fg no-underline first:border-t-0 hover:bg-chip/40">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{c.name}</span>
                <span className="text-[12px] text-muted">{[c.kindLabel, c.centerName, c.endDate ? tr("حتى {0}", dmy(c.endDate)) : ''].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="flex flex-col items-end text-[12px]">
                <span className="num font-semibold">{kwd(c.collected)}</span>
                <span className="text-muted">{c.pledged ? tr("من {0}", kwd(c.pledged)) : tr("بلا رعاية مسجلة")}</span>
              </span>
            </Link>
          ))}
        </Card>
      </div>

      {d.clients.length > 0 && (
        <Card padded={false}>
          <CardHeader title={tr("الجهات والرعاة · التحصيل")} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-right text-[13px]">
              <thead><tr className="text-muted [&>th]:px-4 [&>th]:py-2 [&>th]:font-semibold"><th>{tr("الجهة")}</th><th>{tr("المحصّل")}</th><th>{tr("المجدول")}</th><th>{tr("المتأخر")}</th><th>{tr("نسبة التحصيل")}</th></tr></thead>
              <tbody className="[&>tr]:border-t [&>tr]:border-line [&_td]:px-4 [&_td]:py-2.5">
                {d.clients.map((c) => (
                  <tr key={c.clientId}>
                    <td><Link to={'/crm/clients/' + c.clientId} className="font-semibold text-fg no-underline hover:underline">{c.name}</Link></td>
                    <td className="num">{kwd(c.collected)}</td>
                    <td className="num">{kwd(c.scheduled)}</td>
                    <td className={c.overdue ? 'num font-semibold text-bad' : 'num'}>{kwd(c.overdue)}</td>
                    <td className="num">{c.rate == null ? '—' : c.rate + '%'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
