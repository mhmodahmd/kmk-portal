import { tr } from '../../lib/i18n';
import { useEffect, useState } from 'react';
import type { Balance, HrMe, LeaveStatus, LeaveView, OtStatus, OtView } from '../../lib/types';
import { daysWord, dmy, duration, kwDate } from '../../lib/format';
import { useAction, useApi } from '../../lib/useApi';
import { useAuth } from '../../app/auth';
import { Badge, Card, ListRow } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Select, TextInput, Textarea } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';
export const LEAVE_TONE: Record<LeaveStatus, Tone> = { pending_manager: 'warn', pending_hr: 'warn', approved: 'ok', rejected: 'bad', cancelled: 'neutral' };
export const OT_TONE: Record<OtStatus, Tone> = { pending: 'warn', approved: 'ok', rejected: 'bad', cancelled: 'neutral' };

export function useHrMe() {
  return useApi<HrMe>('hr.me', {}, { staleTime: 30_000 });
}

export function useHrRole() {
  const { user, roles } = useAuth();
  return { isHr: !!user?.isSuperAdmin || roles.hr === 'hr', isSuper: !!user?.isSuperAdmin };
}

export function BalanceCards({ balances }: { balances: Balance[] }) {
  if (!balances.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {balances.map((b) => {
        const pct = b.unlimited || !b.entitled ? 0 : Math.min(100, Math.round(((b.used + b.pending) / (b.entitled + b.adjustment || 1)) * 100));
        return (
          <Card key={b.typeId} className="flex flex-col gap-2 !p-4">
            <span className="font-medium text-muted">{b.name}</span>
            <span className="text-[24px] font-bold leading-none num">{b.unlimited ? '∞' : b.available}<span className="ms-1 text-[13px] font-normal text-muted">{b.unlimited ? tr("بلا سقف") : tr("يوم متاح")}</span></span>
            {!b.unlimited && <div className="h-1.5 overflow-hidden rounded-full bg-chip"><div className="h-full rounded-full bg-accent" style={{ width: pct + '%' }} /></div>}
            <span className="text-[12px] text-muted">{tr("مستخدم")} {b.used}{b.pending ? tr(" · معلّق {0}", b.pending) : ''}{b.adjustment ? tr(" · تسوية {0}{1}", b.adjustment > 0 ? '+' : '', b.adjustment) : ''}</span>
          </Card>
        );
      })}
    </div>
  );
}

export function LeaveRow({ l, showName, actions }: { l: LeaveView; showName?: boolean; actions?: React.ReactNode }) {
  return (
    <ListRow
      title={<>{showName ? `${l.name} · ` : ''}{l.typeName} <span className="font-normal text-muted">· {daysWord(l.days)}</span></>}
      sub={<span className="num">{dmy(l.from)}{l.to !== l.from ? ` ← ${dmy(l.to)}` : ''}{l.reason ? ` · ${l.reason}` : ''}</span>}
      note={l.managerNote || l.decisionNote ? (l.decisionNote ? `${l.decidedBy}: ${l.decisionNote}` : `${l.managerName}: ${l.managerNote}`) : undefined}
      badge={<Badge tone={LEAVE_TONE[l.status]}>{l.statusLabel}</Badge>} actions={actions} />
  );
}

export function OtRow({ o, showName, actions }: { o: OtView; showName?: boolean; actions?: React.ReactNode }) {
  return (
    <ListRow
      title={<>{showName ? `${o.name} · ` : ''}{duration(o.minutes)} <span className="font-normal text-muted">· {dmy(o.date)}</span></>}
      sub={<>{o.reason || '—'}{o.createdByName && o.createdByName !== o.name ? tr(" · سجّله {0}", o.createdByName) : ''}</>}
      note={o.decisionNote ? `${o.decidedBy}: ${o.decisionNote}` : undefined}
      badge={<Badge tone={OT_TONE[o.status]}>{o.statusLabel}</Badge>} actions={actions} />
  );
}

/** طلب إجازة (للموظف) أو تسجيلها نيابة عن موظف (للموارد البشرية) */
export function LeaveDialog({ open, onClose, types, employees }: {
  open: boolean; onClose: () => void; types: { id: string; name: string }[]; employees?: { id: string; fullName: string }[];
}) {
  const onBehalf = !!employees;
  const [f, setF] = useState({ employeeId: '', typeId: '', from: '', to: '', reason: '' });
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setF({ employeeId: '', typeId: types[0]?.id || '', from: kwDate(), to: kwDate(), reason: '' }); setError(''); } }, [open, types]);
  const act = useAction(onBehalf ? 'hr.leave.create' : 'hr.leave.request', {
    invalidate: ['hr.me', 'hr.leave.list', 'hr.team', 'att.myMonth'], success: onBehalf ? tr("سُجّلت الإجازة") : tr("أُرسل طلب الإجازة"), silentError: true, onSuccess: onClose
  });
  return (
    <Dialog open={open} onClose={onClose} title={onBehalf ? tr("تسجيل إجازة لموظف") : tr("طلب إجازة")}
      onSubmit={() => { setError(''); act.mutate(f, { onError: (e) => setError(e.message) }); }} footer={<><Button type="submit" variant="primary" className="flex-1" loading={act.isPending}>{onBehalf ? tr("تسجيل") : tr("إرسال الطلب")}</Button><Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <div className="flex flex-col gap-3">
        {onBehalf && <Select label={tr("الموظف")} required value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })} options={[{ value: '', label: tr("اختر الموظف") }, ...employees!.map((x) => ({ value: x.id, label: x.fullName }))]} />}
        <Select label={tr("نوع الإجازة")} required value={f.typeId} onChange={(e) => setF({ ...f, typeId: e.target.value })} options={types.map((t) => ({ value: t.id, label: t.name }))} />
        <div className="grid grid-cols-2 gap-3">
          <TextInput label={tr("من")} type="date" required value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to })} />
          <TextInput label={tr("إلى")} type="date" required value={f.to} min={f.from} onChange={(e) => setF({ ...f, to: e.target.value })} />
        </div>
        <p className="m-0 text-[13px] text-muted">{tr("تُحتسب أيام العمل فقط، وتُستثنى العطل الأسبوعية والرسمية.")}</p>
        <Textarea label={tr("السبب (اختياري)")} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={500} />
        {onBehalf && <p className="m-0 text-[13px] text-muted">{tr("الإجازة المسجلة من الموارد البشرية تُعتمد مباشرة.")}</p>}
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}

/** طلب عمل إضافي (للموظف) أو تسجيله مباشرة لعضو في الفريق */
export function OtDialog({ open, onClose, employees }: { open: boolean; onClose: () => void; employees?: { id: string; fullName: string }[] }) {
  const direct = !!employees;
  const [f, setF] = useState({ employeeId: '', date: '', hours: '1', mins: '0', reason: '' });
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setF({ employeeId: '', date: kwDate(), hours: '1', mins: '0', reason: '' }); setError(''); } }, [open]);
  const act = useAction(direct ? 'hr.ot.add' : 'hr.ot.request', {
    invalidate: ['hr.me', 'hr.ot.list', 'hr.team', 'att.myMonth'], success: direct ? tr("سُجّل الإضافي") : tr("أُرسل طلب الإضافي"), silentError: true, onSuccess: onClose
  });
  const submit = () => {
    setError('');
    const minutes = (Number(f.hours) || 0) * 60 + (Number(f.mins) || 0);
    act.mutate({ employeeId: f.employeeId, date: f.date, minutes, reason: f.reason }, { onError: (e) => setError(e.message) });
  };
  return (
    <Dialog open={open} onClose={onClose} title={direct ? tr("تسجيل عمل إضافي") : tr("طلب عمل إضافي")}
      onSubmit={submit} footer={<><Button type="submit" variant="primary" className="flex-1" loading={act.isPending}>{direct ? tr("تسجيل") : tr("إرسال الطلب")}</Button><Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <div className="flex flex-col gap-3">
        {direct && <Select label={tr("الموظف")} required value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })} options={[{ value: '', label: tr("اختر الموظف") }, ...employees!.map((x) => ({ value: x.id, label: x.fullName }))]} />}
        <TextInput label={tr("اليوم")} type="date" required max={kwDate()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <TextInput label={tr("ساعات")} type="number" min={0} max={12} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} />
          <TextInput label={tr("دقائق")} type="number" min={0} max={59} value={f.mins} onChange={(e) => setF({ ...f, mins: e.target.value })} />
        </div>
        <Textarea label={tr("العمل المنجز")} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={300} />
        {!direct && <p className="m-0 text-[13px] text-muted">{tr("يجب أن يكون لك تسجيل حضور في هذا اليوم، ويُعتمد من مديرك المباشر.")}</p>}
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}
