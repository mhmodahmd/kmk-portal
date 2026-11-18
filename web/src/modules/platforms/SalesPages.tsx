import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { api } from '../../lib/api';
import { errorText, useAction, useApi } from '../../lib/useApi';
import { formatDateTime, monthLabel } from '../../lib/format';
import { readTable } from '../../lib/xlsx';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { DataTable, Pager, useTable } from '../../ui/Controls';
import { Select } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { ReasonDialog } from '../../ui/Decide';
import { Icon } from '../../ui/Icon';
import { kwd } from '../custody/shared';
import { PLT_KEYS, pltLink, usePlatform, usePltLookups } from './shared';
import { PackageDialog } from './PltSettingsPage';
import { periodLabel } from './PeriodPicker';
import type { ImportPreview, MonthRow, PackageView, SaleRow } from './types';

/** جدول الأشهر لكل منصة لها مبيعات، والاستيراد والاعتماد */
export function SalesMonthsPage() {
  const L = usePltLookups().data;
  const [platform] = usePlatform();
  const nav = useNavigate();
  const q = useApi<MonthRow[]>('plt.months', { platform });
  const [importing, setImporting] = useState(false);
  const [reopen, setReopen] = useState<MonthRow | null>(null);
  const [clearing, setClearing] = useState<MonthRow | null>(null);
  const approve = useAction<{ platform: string; month: string }>('plt.month.approve', { invalidate: PLT_KEYS, success: tr("اعتُمد الشهر وقُفل") });
  const reopenAct = useAction<{ platform: string; month: string; reason: string }>('plt.month.reopen', { invalidate: PLT_KEYS, success: tr("أُعيد فتح الشهر"), onSuccess: () => setReopen(null) });
  const clear = useAction<{ platform: string; month: string }>('plt.month.clear', { invalidate: PLT_KEYS, success: tr("فُرّغ الشهر"), onSuccess: () => setClearing(null) });
  const keyOf = (r: MonthRow) => L?.platforms.find((p) => p.id === r.platformId)?.key || r.platformId;
  const salesPlatforms = (L?.platforms || []).filter((p) => p.hasAppSales);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-2xl text-[13px] text-muted">{tr("ارفع ملف المدفوعات من بوابة الدفع كما هو. تُحسب العمليات المقبوضة فقط، ويُتجاهل المكرر، وتُستبعد الباقة التجريبية. لا يُحفظ اسم المشتري ولا جواله ولا بريده.")}</p>
        {L?.isAccountant && salesPlatforms.length > 0 && <Button variant="primary" icon="download" onClick={() => setImporting(true)}>{tr("استيراد ملف البوابة")}</Button>}
      </div>
      <Card padded={false}>
        {q.isError ? <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} /> : !q.data ? <Loader /> : q.data.length === 0 ? (
          <EmptyState title={tr("لا مبيعات مستوردة بعد")} body={tr("ابدأ باستيراد ملف شهر من بوابة الدفع.")} />
        ) : (
          <DataTable minWidth={860} head={[tr("الشهر"), tr("المنصة"), tr("العمليات"), tr("الإجمالي"), tr("العمولة"), tr("الصافي"), tr("الحالة"), tr("آخر استيراد"), '']}>
            {q.data.map((r) => (
              <tr key={r.platformId + r.month} className="cursor-pointer hover:bg-chip/40" onClick={() => nav(pltLink('/platforms/sales/' + r.month, keyOf(r)))}>
                <td className="whitespace-nowrap font-semibold">{monthLabel(r.month)}</td>
                <td className="text-[13px]">{r.platformName}</td>
                <td className="num">{r.count}</td>
                <td className="num">{kwd(r.amount)}</td>
                <td className="num text-muted">{kwd(r.fee)}</td>
                <td className="num font-semibold">{kwd(r.net)}</td>
                <td>{r.status === 'approved' ? <Badge tone="ok">{r.statusLabel}</Badge> : <Badge tone="warn">{r.statusLabel}</Badge>}
                  {r.status === 'approved' && r.approvedByName && <div className="text-[11px] text-muted">{r.approvedByName}</div>}
                  {r.status === 'draft' && r.reopenReason && <div className="text-[11px] text-muted">{tr("أُعيد فتحه: {0}", r.reopenReason)}</div>}</td>
                <td className="text-[12px] text-muted">{r.lastImport ? <>{r.lastImport.byName}<div className="num">{formatDateTime(r.lastImport.at)}</div></> : '—'}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <span className="flex flex-wrap justify-end gap-1">
                    {L?.isManager && r.status === 'draft' && r.count > 0 && <Button size="sm" variant="secondary" icon="check" loading={approve.isPending && approve.variables?.month === r.month} onClick={() => approve.mutate({ platform: keyOf(r), month: r.month })}>{tr("اعتماد")}</Button>}
                    {L?.isManager && r.status === 'approved' && <Button size="sm" variant="ghost" icon="lock" onClick={() => setReopen(r)}>{tr("إعادة فتح")}</Button>}
                    {L?.isAccountant && r.status === 'draft' && r.count > 0 && <Button size="sm" variant="ghost" icon="trash" onClick={() => setClearing(r)}>{tr("تفريغ")}</Button>}
                  </span>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
      {importing && <ImportDialog onClose={() => setImporting(false)} platforms={salesPlatforms} />}
      <ReasonDialog open={!!reopen} onClose={() => setReopen(null)} title={tr("إعادة فتح {0}", reopen ? monthLabel(reopen.month) : '')} label={tr("سبب إعادة الفتح")}
        confirmLabel={tr("إعادة الفتح")} onConfirm={(reason) => reopenAct.mutateAsync({ platform: keyOf(reopen!), month: reopen!.month, reason })} />
      <Dialog open={!!clearing} onClose={() => setClearing(null)} title={tr("تفريغ مبيعات {0}", clearing ? monthLabel(clearing.month) : '')}
        footer={<><Button variant="danger" className="flex-1" loading={clear.isPending} onClick={() => clear.mutate({ platform: keyOf(clearing!), month: clearing!.month })}>{tr("تفريغ الشهر")}</Button><Button variant="ghost" onClick={() => setClearing(null)}>{tr("تراجع")}</Button></>}>
        <p className="m-0">{tr("تُحذف عمليات هذا الشهر المستوردة ({0} عملية) لتعيد استيراد الملف من جديد. لا يمس ذلك الأشهر الأخرى.", clearing?.count || 0)}</p>
      </Dialog>
    </div>
  );
}

/** الاستيراد: اختيار الملف ← معاينة ومطابقة الباقات غير المعروفة ← حفظ كمسودة */
function ImportDialog({ onClose, platforms }: { onClose: () => void; platforms: { key: string; name: string }[] }) {
  const [platform, setPlatform] = useState(platforms[0]?.key || 'saad');
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const commit = useAction<Record<string, unknown>, { months: string[]; stats: { accepted: number }; contacts?: number }>('plt.import.commit', {
    invalidate: PLT_KEYS, silentError: true, success: (r) => (r.stats.accepted ? tr("استُورد {0} عملية كمسودة", r.stats.accepted) : tr("لا عمليات جديدة، وحُدّثت بيانات تواصل {0} مشتركاً", r.contacts || 0)), onSuccess: onClose
  });
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError(''); setPreview(null); setMap({}); setBusy(true);
    try {
      const rows = await readTable(f);
      setFile({ name: f.name, rows });
      setPreview(await api<ImportPreview>('plt.import.preview', { platform, rows }));
    } catch (e) {
      setError(e instanceof Error && e.message === 'bad-xlsx' ? tr("تعذّرت قراءة الملف. ارفع ملف Excel (.xlsx) أو CSV كما نزل من البوابة.") : errorText(e));
    } finally { setBusy(false); }
  };
  // تسجيل باقة غير معروفة من داخل الاستيراد (لمدير المنصات): تُحفظ ثم تُعاد المعاينة بها
  const L = usePltLookups().data;
  const [adding, setAdding] = useState<{ name: string; price: number } | null>(null);
  const added = async (name: string, pkg: PackageView) => {
    const next = { ...map, [name]: pkg.id };
    setMap(next);
    if (!file) return;
    setBusy(true);
    try { setPreview(await api<ImportPreview>('plt.import.preview', { platform, rows: file.rows, map: next })); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const platformId = L?.platforms.find((p) => p.key === platform)?.id || '';
  const unmatchedLeft = (preview?.unmatched || []).filter((u) => !map[u.name]).length;
  return (
    <Dialog open onClose={onClose} wide title={tr("استيراد ملف بوابة الدفع")}
      footer={<>
        <Button variant="primary" className="flex-1" disabled={!preview || !file || unmatchedLeft > 0 || !preview.stats.accepted && !preview.unmatched.length && !preview.contacts} loading={commit.isPending}
          onClick={() => { setError(''); commit.mutate({ platform, rows: file!.rows, map, fileName: file!.name }, { onError: (e) => setError(e.message) }); }}>{tr("حفظ كمسودة")}</Button>
        <Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {platforms.length > 1 && <Select label={tr("المنصة")} value={platform} onChange={(e) => { setPlatform(e.target.value); setPreview(null); setFile(null); }} options={platforms.map((p) => ({ value: p.key, label: p.name }))} />}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line-strong p-4">
          <Icon name="file" />
          <span className="min-w-0 flex-1 text-[13px]">{file ? <b>{file.name}</b> : tr("ملف المدفوعات من بوابة الدفع (Excel أو CSV)")}</span>
          <Button size="sm" variant="secondary" loading={busy} onClick={() => input.current?.click()}>{file ? tr("ملف آخر") : tr("اختيار الملف")}</Button>
          <input ref={input} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {preview && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[[tr("عمليات جديدة"), preview.stats.accepted], [tr("مكررة (مستوردة من قبل)"), preview.stats.duplicates], [tr("تجريبية مستبعدة"), preview.stats.test], [tr("غير مقبوضة"), preview.stats.notCaptured]].map(([l, v]) => (
                <div key={String(l)} className="rounded-lg bg-chip px-3 py-2"><div className="text-[12px] text-muted">{l}</div><div className="num text-[18px] font-semibold">{v}</div></div>
              ))}
            </div>
            <p className="m-0 text-[13px]">{tr("المبلغ: {0} · العمولة التقديرية: {1}", kwd(preview.stats.amount), kwd(preview.fee))} · {preview.months.map((m) => (
              <span key={m.month} className="ms-1">{monthLabel(m.month)} <span className="num">({m.count})</span>{m.status === 'approved' && <Badge tone="bad">{tr("معتمد ومقفل")}</Badge>}</span>
            ))}</p>
            {preview.contacts > 0 && <p className="m-0 text-[13px] text-muted">{tr("تُحدَّث بيانات تواصل {0} مشتركاً في «المشتركون» (مشفّرة).", preview.contacts)}</p>}
            {preview.packages.length > 0 && (
              <table className="w-full border-collapse text-right text-[13px]">
                <thead><tr className="text-muted [&>th]:py-1.5 [&>th]:font-semibold"><th>{tr("الباقة")}</th><th>{tr("العمليات")}</th><th>{tr("المبلغ")}</th></tr></thead>
                <tbody className="[&>tr]:border-t [&>tr]:border-line [&_td]:py-1.5">
                  {preview.packages.map((p) => <tr key={p.packageId}><td>{p.name}{p.kind === 'gift' && <span className="text-muted"> · {tr("{0} فرداً", p.people)}</span>}</td><td className="num">{p.count}</td><td className="num">{kwd(p.amount)}</td></tr>)}
                </tbody>
              </table>
            )}
            {preview.unmatched.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg bg-warn-bg p-3">
                <b className="text-warn">{tr("باقات غير معروفة: اختر ما يقابلها، فتُحفظ للمرات القادمة")}</b>
                {preview.unmatched.map((u) => (
                  <div key={u.name} className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[200px] flex-1">
                      <Select label={tr("«{0}» · {1} عملية · {2}", u.name || tr("بلا اسم"), u.count, kwd(u.amount))} value={map[u.name] || ''}
                        onChange={(e) => setMap({ ...map, [u.name]: e.target.value })}
                        options={[{ value: '', label: tr("اختر الباقة") }, ...preview.packageOptions.map((o) => ({ value: o.id, label: o.name }))]} />
                    </div>
                    {L?.isManager && u.name && <Button variant="secondary" icon="plus" disabled={busy}
                      onClick={() => setAdding({ name: u.name, price: u.count ? Math.round(u.amount / u.count) : 0 })}>{tr("تسجيل كباقة جديدة")}</Button>}
                  </div>
                ))}
                <p className="m-0 text-[12px] text-muted">{L?.isManager
                  ? tr("إن كانت باقة جديدة فعلاً، اضغط «تسجيل كباقة جديدة» وأكمل بياناتها، فتُطابَق تلقائياً.")
                  : tr("إن كانت باقة جديدة فعلاً، يضيفها مدير المنصات من «الإعدادات» ثم أعد اختيار الملف.")}</p>
              </div>
            )}
          </>
        )}
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
      {adding && <PackageDialog item={null} preset={{ platformId, code: adding.name, price: adding.price }}
        onClose={() => setAdding(null)} onSaved={(p) => added(adding.name, p)} />}
    </Dialog>
  );
}

const FILTERS: [string, string][] = [['pkg', 'packageId'], ['kind', 'kind'], ['method', 'method'], ['channel', 'channel'], ['country', 'country'], ['buyer', 'buyer']];

/** عمليات شهر: ما وراء أرقام اللوحة، مع التصفية من الرابط */
export function SalesMonthPage() {
  const { month = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const [platform] = usePlatform();
  const L = usePltLookups().data;
  const payload: Record<string, unknown> = { platform, month };
  FILTERS.forEach(([k, p]) => { const v = params.get(k); if (v) payload[p] = v; });
  const q = useApi<SaleRow[]>('plt.sales', payload);
  const rows = useMemo(() => q.data || [], [q.data]);
  const t = useTable(rows, { sort: { key: 'paidAt', dir: 'desc' } });
  const totals = rows.reduce((s, r) => ({ amount: s.amount + r.amount, fee: s.fee + r.fee, net: s.net + r.net }), { amount: 0, fee: 0, net: 0 });
  const label = (k: string, v: string) => {
    if (k === 'pkg') return L?.packages.find((p) => p.id === v)?.name || v;
    if (k === 'kind') return L?.kinds.find((x) => x.id === v)?.label || v;
    if (k === 'method') return L?.methods.find((x) => x.id === v)?.label || v;
    if (k === 'channel') return L?.channels.find((x) => x.id === v)?.label || v;
    if (k === 'buyer') return v === 'new' ? tr("مشترون جدد") : v === 'returning' ? tr("مشترون عائدون") : tr("ترقيات");
    if (k === 'country') return v === '-' ? tr("دولة غير محددة") : v;
    return v;
  };
  const drop = (k: string) => { const n = new URLSearchParams(params); n.delete(k); setParams(n, { replace: true }); };
  const active = FILTERS.map(([k]) => k).filter((k) => params.get(k));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={pltLink('/platforms/sales', platform)} className="text-[13px] font-semibold text-accent-fg no-underline">{tr("المبيعات الشهرية")}</Link>
        <span className="text-muted">/</span>
        <b>{periodLabel(month)}</b>
        {active.map((k) => (
          <button key={k} type="button" onClick={() => drop(k)} className="inline-flex cursor-pointer items-center gap-1 rounded-full border-0 bg-chip px-2.5 py-1 text-[12px] text-fg">
            {label(k, params.get(k) || '')}<Icon name="x" size={12} />
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[[tr("العمليات"), String(rows.length)], [tr("الإجمالي"), kwd(totals.amount)], [tr("العمولة"), kwd(totals.fee)], [tr("الصافي"), kwd(totals.net)]].map(([l, v]) => (
          <Card key={l} className="flex flex-col gap-1"><span className="text-[12px] text-muted">{l}</span><b className="num text-[17px]">{v}</b></Card>
        ))}
      </div>
      <Card padded={false}>
        <CardHeader title={tr("العمليات")} />
        {q.isError ? <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} /> : !q.data ? <Loader /> : rows.length === 0 ? (
          <EmptyState title={tr("لا عمليات بهذه التصفية")} />
        ) : (
          <DataTable sticky sort={t.sort} onSort={t.onSort} pager={<Pager {...t.pager} />} minWidth={760}
            head={[{ key: 'paidAt', label: tr("الوقت") }, { key: 'gatewayId', label: tr("رقم العملية") }, { key: 'packageName', label: tr("الباقة") }, { key: 'methodLabel', label: tr("الوسيلة") },
              { key: 'channelLabel', label: tr("القناة") }, { key: 'country', label: tr("الدولة") }, { key: 'amount', label: tr("المبلغ") }, { key: 'net', label: tr("الصافي") }, tr("المشتري")]}>
            {t.rows.map((r) => (
              <tr key={r.id}>
                <td className="num whitespace-nowrap text-[13px]">{r.paidAt}</td>
                <td className="num text-[13px]">{r.gatewayId}</td>
                <td>{r.packageName}{r.kind === 'gift' && <span className="text-[12px] text-muted"> · {tr("{0} فرداً", r.people)}</span>}</td>
                <td className="text-[13px]">{r.methodLabel}</td>
                <td className="text-[13px]">{r.channelLabel}</td>
                <td className="text-[13px]">{r.country || '—'}</td>
                <td className="num">{kwd(r.amount)}</td>
                <td className="num">{kwd(r.net)}</td>
                <td className="text-[12px]">{r.buyer === 'new' ? <Badge tone="info">{tr("جديد")}</Badge> : r.buyer === 'returning' ? <Badge>{tr("عائد")}</Badge> : '—'}{r.upgrade && <Badge tone="ok">{tr("ترقية")}</Badge>}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  );
}
