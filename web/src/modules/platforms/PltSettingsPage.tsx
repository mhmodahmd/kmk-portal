import { useEffect, useState } from 'react';
import { tr } from '../../lib/i18n';
import { useAction } from '../../lib/useApi';
import { Badge, Card, CardHeader, ErrorBox, Loader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Select, TextInput } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { kwd, toInput } from '../custody/shared';
import { PLT_KEYS, usePltLookups } from './shared';
import type { Method, PackageView } from './types';

const METHODS: Method[] = ['knet', 'applepay', 'card', 'other'];

/** إعدادات المنصات (مدير المنصات): عمولات البوابة والباقات */
export default function PltSettingsPage() {
  const lk = usePltLookups();
  const L = lk.data;
  const [fees, setFees] = useState<Record<string, { pct: string; fixed: string }>>({});
  const [editing, setEditing] = useState<{ item: PackageView | null } | null>(null);
  useEffect(() => {
    if (L) setFees(Object.fromEntries(METHODS.map((m) => [m, { pct: String(L.fees[m]?.pct || ''), fixed: toInput(L.fees[m]?.fixed || 0) }])));
  }, [L]);
  const save = useAction<{ fees: typeof fees }, { recalculated: number }>('plt.fees.save', {
    invalidate: PLT_KEYS, success: (r) => (r.recalculated ? tr("حُفظت العمولات وأُعيد حساب {0} عملية في الأشهر غير المعتمدة", r.recalculated) : tr("حُفظت العمولات"))
  });
  if (lk.isError) return <ErrorBox message={(lk.error as Error).message} onRetry={() => lk.refetch()} />;
  if (!L) return <Loader />;
  const label = (m: Method) => L.methods.find((x) => x.id === m)?.label || m;
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <Card padded={false}>
        <CardHeader title={tr("عمولة بوابة الدفع")} />
        <div className="flex flex-col gap-3 px-5 pb-4">
          <p className="m-0 text-[13px] text-muted">{tr("العمولة = نسبة من المبلغ + رسم ثابت لكل عملية، حسب وسيلة الدفع. تغييرها يعيد حساب الأشهر غير المعتمدة فقط.")}</p>
          {METHODS.map((m) => (
            <div key={m} className="grid grid-cols-[1fr_1fr] items-end gap-3 sm:grid-cols-[140px_1fr_1fr]">
              <b className="col-span-2 sm:col-span-1 sm:pb-3">{label(m)}</b>
              <TextInput label={tr("النسبة %")} ltr inputMode="decimal" value={fees[m]?.pct || ''} onChange={(e) => setFees({ ...fees, [m]: { ...fees[m], pct: e.target.value } })} placeholder="0" />
              <TextInput label={tr("رسم ثابت (د.ك)")} ltr inputMode="decimal" value={fees[m]?.fixed || ''} onChange={(e) => setFees({ ...fees, [m]: { ...fees[m], fixed: e.target.value } })} placeholder="0.000" />
            </div>
          ))}
          <div><Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ fees })}>{tr("حفظ العمولات")}</Button></div>
        </div>
      </Card>

      <Card padded={false}>
        <CardHeader title={tr("الباقات")} action={<Button size="sm" icon="plus" onClick={() => setEditing({ item: null })}>{tr("باقة جديدة")}</Button>} />
        {L.packages.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={p.active ? 'font-semibold' : 'font-semibold text-muted line-through'}>{p.name}</span>
              <span className="text-[12px] text-muted">{[
                tr("في الملف: «{0}»", p.code) + (p.aliases.length ? ' + ' + p.aliases.map((a) => '«' + a + '»').join(' ') : ''),
                L.platforms.find((x) => x.id === p.platformId)?.name || '',
                p.kind === 'subscription' ? tr("{0} · {1} يوماً", kwd(p.price), p.durationDays) : p.kind === 'gift' ? tr("رعاية الفرد {0}", kwd(p.unitPrice)) : kwd(p.price)
              ].filter(Boolean).join(' · ')}</span>
            </span>
            <Badge tone={p.kind === 'test' ? 'neutral' : p.kind === 'gift' ? 'info' : 'ok'}>{p.kindLabel}</Badge>
            <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing({ item: p })}>{tr("تعديل")}</Button>
          </div>
        ))}
        <p className="m-0 border-t border-line px-5 py-3 text-[13px] text-muted">{tr("«الاسم في الملف» يجب أن يطابق ما تكتبه البوابة حرفياً. الترتيب يحدد الترقية: شراء باقة أعلى ترتيباً من اشتراك سابق للمشتري نفسه.")}</p>
      </Card>
      {editing && <PackageDialog item={editing.item} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** preset: تعبئة مسبقة عند تسجيل باقة ظهرت في ملف البوابة ولا يعرفها النظام. onSaved يستلم الباقة المحفوظة */
export function PackageDialog({ item, onClose, preset, onSaved }: {
  item: PackageView | null; onClose: () => void;
  preset?: { platformId: string; code: string; price: number }; onSaved?: (p: PackageView) => void;
}) {
  const L = usePltLookups().data;
  const sales = L?.platforms.filter((p) => p.hasAppSales) || [];
  const [f, setF] = useState({
    platformId: item?.platformId || preset?.platformId || sales[0]?.id || '', name: item?.name || preset?.code || '', code: item?.code || preset?.code || '', kind: item?.kind || 'subscription',
    price: toInput(item?.price || preset?.price || 0), durationDays: item?.durationDays ? String(item.durationDays) : '', unitPrice: toInput(item?.unitPrice || 0),
    rank: item?.rank ? String(item.rank) : '', active: String(item ? item.active : true)
  });
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useAction<Record<string, unknown>, PackageView>('plt.package.save', { invalidate: PLT_KEYS, success: tr("حُفظت الباقة"), silentError: true, onSuccess: (r) => { onSaved?.(r); onClose(); } });
  const remove = useAction('plt.package.remove', { invalidate: PLT_KEYS, success: tr("حُذفت الباقة"), silentError: true, onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title={item ? tr("تعديل الباقة") : preset ? tr("تسجيل باقة جديدة") : tr("باقة جديدة")}
      onSubmit={() => { setError(''); save.mutate({ ...f, id: item?.id, active: f.active === 'true' }, { onError: (e) => setError(e.message) }); }}
      footer={<>
        <Button type="submit" variant="primary" className="flex-1" loading={save.isPending}>{tr("حفظ")}</Button>
        {item && <Button variant="danger-outline" loading={remove.isPending} onClick={() => remove.mutate({ id: item.id }, { onError: (e) => setError(e.message) })}>{tr("حذف")}</Button>}
        <Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button>
      </>}>
      <div className="flex flex-col gap-3">
        {preset && <p className="m-0 text-[13px] text-muted">{tr("ظهرت هذه الباقة في ملف البوابة ولا يعرفها النظام. أكمل بياناتها، فتُطابَق عملياتها في هذا الاستيراد وما بعده. السعر المقترح هو متوسط عملياتها في الملف.")}</p>}
        {sales.length > 1 && !preset && <Select label={tr("المنصة")} value={f.platformId} onChange={set('platformId')} options={sales.map((p) => ({ value: p.id, label: p.name }))} />}
        <TextInput label={tr("اسم الباقة في التقارير")} required value={f.name} onChange={set('name')} maxLength={80} autoFocus />
        <TextInput label={tr("الاسم في ملف البوابة")} required value={f.code} onChange={set('code')} maxLength={80} hint={tr("كما يظهر في عمود الباقة في ملف المدفوعات")} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={tr("النوع")} value={f.kind} onChange={set('kind')} options={(L?.kinds || []).map((k) => ({ value: k.id, label: k.label }))} />
          <TextInput label={tr("السعر (د.ك)")} ltr inputMode="decimal" value={f.price} onChange={set('price')} />
          {f.kind === 'subscription' && <TextInput label={tr("المدة (يوم)")} required ltr inputMode="numeric" value={f.durationDays} onChange={set('durationDays')} />}
          {f.kind === 'subscription' && <TextInput label={tr("الترتيب")} ltr inputMode="numeric" value={f.rank} onChange={set('rank')} hint={tr("الأعلى = باقة أكبر")} />}
          {f.kind === 'gift' && <TextInput label={tr("قيمة رعاية الفرد (د.ك)")} required ltr inputMode="decimal" value={f.unitPrice} onChange={set('unitPrice')} hint={tr("عدد الأفراد = المبلغ ÷ هذه القيمة")} />}
          <Select label={tr("الحالة")} value={f.active} onChange={set('active')} options={[{ value: 'true', label: tr("نشطة") }, { value: 'false', label: tr("موقوفة") }]} />
        </div>
        {f.kind === 'test' && <p className="m-0 text-[13px] text-muted">{tr("عمليات الباقة التجريبية لا تُحسب في الإيراد.")}</p>}
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}
