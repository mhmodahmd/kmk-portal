import { tr } from '../../lib/i18n';
import { useEffect, useState, type ReactNode } from 'react';
import type { Directory } from '../../lib/types';
import { dmy } from '../../lib/format';
import { useAction, useApi } from '../../lib/useApi';
import { Badge, Card, CardHeader, ErrorBox, Loader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Checkbox, Select, TextInput } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';

type Kind = 'dept' | 'branch' | 'shift' | 'holiday' | 'leaveType';
type Draft = Record<string, string | boolean>;
const DAY_NAMES = [tr("الأحد"), tr("الإثنين"), tr("الثلاثاء"), tr("الأربعاء"), tr("الخميس"), tr("الجمعة"), tr("السبت")];
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];
const TITLES: Record<Kind, string> = { dept: tr("قسم"), branch: tr("فرع"), shift: tr("وردية"), holiday: tr("عطلة رسمية"), leaveType: tr("نوع إجازة") };

export default function StructurePage() {
  const q = useApi<Directory>('hr.directory');
  const [edit, setEdit] = useState<{ kind: Kind; draft: Draft } | null>(null);
  const del = useAction('hr.holiday.delete', { invalidate: ['hr.directory'], success: tr("حُذفت العطلة") });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  const d = q.data;
  const empName = (id: string) => d.employees.find((e) => e.id === id)?.fullName || '';
  const open = (kind: Kind, draft: Draft = {}) => setEdit({ kind, draft });

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
      <Block title={tr("الورديات")} hint={tr("أوقات الدوام وأيام العمل وفترة السماح للتأخير")} onAdd={() => open('shift', { start: '08:00', end: '16:00', graceMin: '10', workDays: '0,1,2,3,4', active: true })}>
        {d.shifts.map((s) => (
          <Row key={s.id} title={s.name} inactive={!s.active} onEdit={() => open('shift', { ...s, graceMin: String(s.graceMin) })}
            sub={<><span className="ltr num">{s.start}–{s.end}</span> {tr("· سماح")} {s.graceMin} {tr("د ·")} {s.workDays.split(',').map((x) => DAY_NAMES[Number(x)]).join(tr("، "))}</>} />
        ))}
      </Block>
      <Block title={tr("الأقسام")} onAdd={() => open('dept', { active: true })}>
        {d.departments.map((x) => (
          <Row key={x.id} title={x.name} inactive={!x.active} sub={x.managerId ? tr("المدير: ") + empName(x.managerId) : tr("بلا مدير")} onEdit={() => open('dept', { ...x })} />
        ))}
      </Block>
      <Block title={tr("الفروع")} hint={tr("حدّد موقع الفرع من إعدادات الحضور للتحقق من مكان البصمة")} onAdd={() => open('branch', { active: true })}>
        {d.branches.map((x) => (
          <Row key={x.id} title={x.name} inactive={!x.active} sub={[x.address, x.lat ? tr("موقع البصمة {0} م", x.geoRadius) : tr("بلا موقع")].filter(Boolean).join(' · ')}
            onEdit={() => open('branch', { ...x, geoRadius: String(x.geoRadius || '') })} />
        ))}
      </Block>
      <Block title={tr("أنواع الإجازات")} hint={tr("0 يوم = بلا سقف (مثل الإجازة بدون راتب)")} onAdd={() => open('leaveType', { annualDays: '0', paid: true, active: true })}>
        {d.leaveTypes.map((t) => (
          <Row key={t.id} title={t.name} inactive={!t.active} sub={`${t.annualDays ? t.annualDays + tr(" يوم سنوياً") : tr("بلا سقف")} · ${t.paid ? tr("مدفوعة") : tr("غير مدفوعة")}`}
            onEdit={() => open('leaveType', { ...t, annualDays: String(t.annualDays) })} />
        ))}
      </Block>
      <Block title={tr("العطل الرسمية")} hint={tr("لا يُحتسب فيها غياب ولا تُخصم من الإجازات")} onAdd={() => open('holiday', {})}>
        {d.holidays.map((h) => (
          <Row key={h.id} title={h.name} sub={<span className="num">{dmy(h.date)}{h.dateTo ? ' ← ' + dmy(h.dateTo) : ''}</span>} onEdit={() => open('holiday', { ...h })}
            extra={<button type="button" aria-label={tr("حذف")} onClick={() => del.mutate({ id: h.id })} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-bad-bg hover:text-bad cursor-pointer"><Icon name="trash" size={16} /></button>} />
        ))}
      </Block>
      <EditDialog edit={edit} dir={d} onClose={() => setEdit(null)} />
    </div>
  );
}

function Block({ title, hint, onAdd, children }: { title: string; hint?: string; onAdd: () => void; children: ReactNode[] }) {
  return (
    <Card padded={false}>
      <CardHeader title={title} action={<Button size="sm" icon="plus" onClick={onAdd}>{tr("إضافة")}</Button>} />
      {hint && <p className="m-0 -mt-2 px-5 pb-3 text-[13px] text-muted">{hint}</p>}
      {children.length ? children : <p className="m-0 border-t border-line px-5 py-4 text-muted">{tr("لا شيء بعد.")}</p>}
    </Card>
  );
}

function Row({ title, sub, inactive, onEdit, extra }: { title: string; sub: ReactNode; inactive?: boolean; onEdit: () => void; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-line px-5 py-3">
      <span className={cx('flex min-w-0 flex-1 flex-col', inactive && 'opacity-60')}>
        <span className="font-semibold">{title} {inactive && <Badge>{tr("موقوف")}</Badge>}</span>
        <span className="text-[13px] text-muted">{sub}</span>
      </span>
      <button type="button" aria-label={tr("تعديل ") + title} onClick={onEdit} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-chip hover:text-fg cursor-pointer"><Icon name="edit" size={16} /></button>
      {extra}
    </div>
  );
}

const ACTIONS: Record<Kind, string> = { dept: 'hr.dept.save', branch: 'hr.branch.save', shift: 'hr.shift.save', holiday: 'hr.holiday.save', leaveType: 'hr.leaveType.save' };

function EditDialog({ edit, dir, onClose }: { edit: { kind: Kind; draft: Draft } | null; dir: Directory; onClose: () => void }) {
  const [f, setF] = useState<Draft>({});
  const [error, setError] = useState('');
  useEffect(() => { if (edit) { setF(edit.draft); setError(''); } }, [edit]);
  const kind = edit?.kind || 'dept';
  const save = useAction(ACTIONS[kind], { invalidate: ['hr.directory', 'att.settings.get'], success: tr("حُفظ"), silentError: true, onSuccess: onClose });
  const s = (k: string) => String(f[k] ?? '');
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const days = s('workDays').split(',').filter(Boolean);
  const toggleDay = (n: number) => {
    const next = days.includes(String(n)) ? days.filter((x) => x !== String(n)) : [...days, String(n)];
    setF((x) => ({ ...x, workDays: next.sort().join(',') }));
  };
  return (
    <Dialog open={!!edit} onClose={onClose} title={(f.id ? tr("تعديل ") : tr("إضافة ")) + TITLES[kind]}
      footer={<><Button variant="primary" className="flex-1" loading={save.isPending} onClick={() => { setError(''); save.mutate(f, { onError: (e) => setError(e.message) }); }}>{tr("حفظ")}</Button><Button variant="ghost" onClick={onClose}>{tr("إلغاء")}</Button></>}>
      <div className="flex flex-col gap-3">
        <TextInput label={tr("الاسم")} value={s('name')} onChange={set('name')} />
        {kind === 'dept' && (
          <Select label={tr("مدير القسم")} value={s('managerId')} onChange={set('managerId')} hint={tr("يصبح المدير المباشر لموظفي القسم ما لم يُحدَّد لهم مدير آخر")}
            options={[{ value: '', label: tr("بلا مدير") }, ...dir.employees.filter((e) => e.status !== 'terminated').map((e) => ({ value: e.id, label: e.fullName }))]} />
        )}
        {kind === 'branch' && <TextInput label={tr("العنوان")} value={s('address')} onChange={set('address')} />}
        {kind === 'shift' && <>
          <div className="grid grid-cols-3 gap-3">
            <TextInput label={tr("البداية")} type="time" value={s('start')} onChange={set('start')} />
            <TextInput label={tr("النهاية")} type="time" value={s('end')} onChange={set('end')} />
            <TextInput label={tr("السماح (د)")} type="number" min={0} max={120} value={s('graceMin')} onChange={set('graceMin')} />
          </div>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1.5 text-[13px] font-medium">{tr("أيام العمل")}</legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEK_ORDER.map((n) => (
                <button key={n} type="button" aria-pressed={days.includes(String(n))} onClick={() => toggleDay(n)}
                  className={cx('h-9 rounded-full px-3 font-medium cursor-pointer', days.includes(String(n)) ? 'bg-accent text-on-accent' : 'border border-line bg-surface')}>{DAY_NAMES[n]}</button>
              ))}
            </div>
          </fieldset>
        </>}
        {kind === 'holiday' && (
          <div className="grid grid-cols-2 gap-3">
            <TextInput label={tr("من")} type="date" value={s('date')} onChange={set('date')} />
            <TextInput label={tr("إلى (اختياري)")} type="date" min={s('date')} value={s('dateTo')} onChange={set('dateTo')} />
          </div>
        )}
        {kind === 'leaveType' && <>
          <TextInput label={tr("الأيام السنوية")} type="number" min={0} max={365} value={s('annualDays')} onChange={set('annualDays')} hint={tr("0 = بلا سقف")} />
          <Checkbox label={tr("إجازة مدفوعة")} checked={f.paid !== false} onChange={(v) => setF((x) => ({ ...x, paid: v }))} />
        </>}
        {kind !== 'holiday' && <Checkbox label={tr("نشط")} description={tr("الموقوف لا يظهر في الاختيارات الجديدة")} checked={f.active !== false} onChange={(v) => setF((x) => ({ ...x, active: v }))} />}
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}
