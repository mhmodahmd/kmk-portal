import { useEffect, useState } from 'react';
import type { Branch, DeviceList, DeviceRow } from '../../lib/types';
import { dmy, kwDate, relativeTime } from '../../lib/format';
import { ReasonDialog } from '../../ui/Decide';
import { SearchBox } from '../../ui/Controls';
import { useAction, useApi } from '../../lib/useApi';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Checkbox, TextInput } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';

interface AttSettings { settings: { geoRequired: boolean; deviceRequired: boolean; openMaxHours: number; startDate: string }; branches: Branch[] }

export default function SettingsPage() {
  const q = useApi<AttSettings>('att.settings.get');
  const [geo, setGeo] = useState(false);
  const [device, setDevice] = useState(false);
  const [hours, setHours] = useState('16');
  const [start, setStart] = useState('');
  const [editing, setEditing] = useState<Branch | null>(null);
  useEffect(() => { if (q.data) { setGeo(q.data.settings.geoRequired); setDevice(!!q.data.settings.deviceRequired); setHours(String(q.data.settings.openMaxHours)); setStart(q.data.settings.startDate || ''); } }, [q.data]);
  const save = useAction('att.settings.save', { invalidate: ['att.settings.get', 'att.today', 'att.device.list'], success: 'حُفظت الإعدادات' });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  const located = q.data.branches.filter((b) => b.lat && b.lng && b.geoRadius > 0).length;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <h2 className="m-0 text-[16px] font-semibold">قواعد البصمة</h2>
        <Checkbox label="التحقق من الموقع عند البصمة" checked={geo} onChange={setGeo}
          description={located ? `لا تُقبل البصمة إلا داخل نطاق فرع الموظف (${located} فرع محدد الموقع).` : 'حدّد موقع فرع واحد على الأقل أولاً.'} />
        <Checkbox label="اشتراط بصمة الجهاز (الوجه أو الإصبع)" checked={device} onChange={setDevice}
          description="لا تُقبل البصمة إلا من هاتف الموظف المسجّل بعد التحقق بوجهه أو إصبعه أو رمز قفل الهاتف. من لم يسجّل هاتفه يُطلب منه تفعيله عند أول بصمة." />
        <TextInput label="أقصى مدة للحضور المفتوح (ساعات)" type="number" min={4} max={24} className="max-w-[260px]" value={hours} onChange={(e) => setHours(e.target.value)}
          hint="بعدها يُعتبر الحضور بلا انصراف منسياً، ويستطيع الموظف تسجيل حضور جديد" />
        <TextInput label="بداية احتساب الحضور" type="date" className="max-w-[260px]" value={start} onChange={(e) => setStart(e.target.value)}
          hint="لا يُحتسب غياب قبل هذا التاريخ. إن تُرك فارغاً: من تاريخ أول بصمة في البوابة" />
        <Button variant="primary" className="self-start" loading={save.isPending} onClick={() => save.mutate({ geoRequired: geo, deviceRequired: device, openMaxHours: hours, startDate: start })}>حفظ</Button>
      </Card>

      <Card padded={false}>
        <CardHeader title="مواقع الفروع" />
        {q.data.branches.length === 0 ? <EmptyState title="لا فروع بعد" body="أضف الفروع من الموارد البشرية ← الهيكل." /> : q.data.branches.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3.5">
            <Icon name="pin" className="text-muted" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{b.name}</span>
              <span className="text-[13px] text-muted num ltr text-right">{b.lat ? `${b.lat}, ${b.lng} · ${b.geoRadius} م` : 'لم يُحدد الموقع'}</span>
            </span>
            {b.lat ? <Badge tone="ok">محدد</Badge> : <Badge>غير محدد</Badge>}
            <Button size="sm" icon="edit" onClick={() => setEditing(b)}>تحديد</Button>
          </div>
        ))}
      </Card>
      <DevicesCard />
      <GeoDialog branch={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/** أجهزة بصمة الموظفين وإعادة ضبطها عند تغيير الهاتف */
function DevicesCard() {
  const q = useApi<DeviceList>('att.device.list');
  const [search, setSearch] = useState('');
  const [resetting, setResetting] = useState<DeviceRow | null>(null);
  const reset = useAction('att.device.reset', { invalidate: ['att.device.list'], success: 'أُعيد ضبط الجهاز', silentError: true });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  const rows = q.data.rows.filter((r) => !search || r.name.includes(search.trim()));
  return (
    <Card padded={false}>
      <CardHeader title="أجهزة بصمة الموظفين" action={<Badge tone={q.data.registered ? 'ok' : 'neutral'}>{q.data.registered} من {q.data.rows.length}</Badge>} />
      <p className="m-0 px-5 pb-3 text-[13px] leading-relaxed text-muted">
        كل موظف يسجّل هاتفاً واحداً من شاشة البصمة. إذا غيّر هاتفه أو فقده، أعد ضبط جهازه هنا ليسجّل الجديد.
      </p>
      {q.data.rows.length > 6 && <div className="flex px-5 pb-3"><SearchBox id="dev-search" value={search} onChange={setSearch} placeholder="ابحث باسم الموظف" /></div>}
      {rows.length === 0 ? <EmptyState title="لا موظفين" body="أضف الموظفين من الموارد البشرية." /> : rows.map((r) => (
        <div key={r.employeeId} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3.5">
          <Icon name="fingerprint" className={r.device ? 'text-ok' : 'text-muted'} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{r.name}</span>
            <span className="text-[13px] text-muted">
              {r.device
                ? <>{r.device.label} · سُجّل {dmy(kwDate(new Date(r.device.createdAt)))}{r.device.lastUsedAt ? <> · آخر بصمة {relativeTime(r.device.lastUsedAt)}</> : null}</>
                : r.hasAccount ? 'لم يسجّل جهازه بعد' : 'لا يملك حساب دخول'}
            </span>
          </span>
          {r.device ? <Button size="sm" variant="danger-outline" icon="refresh" onClick={() => setResetting(r)}>إعادة ضبط</Button> : <Badge>غير مسجّل</Badge>}
        </div>
      ))}
      <ReasonDialog open={!!resetting} onClose={() => setResetting(null)} title="إعادة ضبط جهاز البصمة" label="السبب (مثل: غيّر هاتفه)" confirmLabel="إعادة الضبط" danger
        onConfirm={(reason) => reset.mutateAsync({ employeeId: resetting!.employeeId, reason })}>
        <p className="m-0 text-muted">سيتوقف جهاز <b className="text-fg">{resetting?.name}</b> ({resetting?.device?.label}) عن البصمة، ويستطيع تسجيل جهاز جديد من شاشة البصمة.</p>
      </ReasonDialog>
    </Card>
  );
}

function GeoDialog({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const [f, setF] = useState({ lat: '', lng: '', geoRadius: '150' });
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  useEffect(() => { if (branch) { setF({ lat: branch.lat, lng: branch.lng, geoRadius: String(branch.geoRadius || 150) }); setError(''); } }, [branch]);
  const save = useAction('att.geo.save', { invalidate: ['att.settings.get'], success: 'حُفظ موقع الفرع', silentError: true, onSuccess: onClose });
  const here = () => {
    if (!navigator.geolocation) { setError('جهازك لا يدعم تحديد الموقع.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); setF((x) => ({ ...x, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })); },
      () => { setLocating(false); setError('تعذّر تحديد موقعك. اسمح للمتصفح باستخدام الموقع.'); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };
  return (
    <Dialog open={!!branch} onClose={onClose} title={'موقع ' + (branch?.name || '')}
      footer={<>
        <Button variant="primary" className="flex-1" loading={save.isPending} onClick={() => { setError(''); save.mutate({ branchId: branch!.id, ...f }, { onError: (e) => setError(e.message) }); }}>حفظ</Button>
        <Button variant="ghost" onClick={() => save.mutate({ branchId: branch!.id, lat: '', lng: '' })}>إزالة الموقع</Button>
      </>}>
      <div className="flex flex-col gap-3">
        <Button icon="pin" loading={locating} onClick={here}>استخدم موقعي الحالي</Button>
        <p className="m-0 text-[13px] text-muted">قف داخل الفرع واضغط الزر، أو انسخ الإحداثيات من خرائط Google.</p>
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="خط العرض" ltr inputMode="decimal" value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} />
          <TextInput label="خط الطول" ltr inputMode="decimal" value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} />
        </div>
        <TextInput label="نطاق البصمة (متر)" type="number" min={20} max={5000} value={f.geoRadius} onChange={(e) => setF({ ...f, geoRadius: e.target.value })} hint="150 متراً مناسبة لمبنى واحد" />
        {f.lat && f.lng && <a href={`https://maps.google.com/?q=${f.lat},${f.lng}`} target="_blank" rel="noreferrer" className="text-accent-fg no-underline">عرض على الخريطة</a>}
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}
