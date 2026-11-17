import { tr } from '../../lib/i18n';
import { useState } from 'react';
import type { Directory, LeaveView, OtView } from '../../lib/types';
import { kwDate } from '../../lib/format';
import { useAction, useApi } from '../../lib/useApi';
import { Card, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { Segmented } from '../../ui/Controls';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Field';
import { ReasonDialog } from '../../ui/Decide';
import { Dialog } from '../../ui/Overlay';
import { useAuth } from '../../app/auth';
import { LeaveDialog, LeaveRow, OtRow } from './shared';
import { useDecision } from './TeamPage';

export default function RequestsPage() {
  const [tab, setTab] = useState<'leave' | 'ot'>('leave');
  const [status, setStatus] = useState('open');
  const [emp, setEmp] = useState('');
  const [year, setYear] = useState(kwDate().slice(0, 4));
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<LeaveView | OtView | null>(null);
  const dir = useApi<Directory>('hr.directory', {}, { staleTime: 60_000 });
  const leaves = useApi<LeaveView[]>('hr.leave.list', { status, employeeId: emp, year }, { enabled: tab === 'leave', placeholderData: (p) => p });
  const ots = useApi<OtView[]>('hr.ot.list', { status: status === 'open' ? 'pending' : status, employeeId: emp }, { enabled: tab === 'ot', placeholderData: (p) => p });
  const { setPick, dialog } = useDecision(['hr.leave.list', 'hr.ot.list']);
  const cancelLeave = useAction('hr.leave.adminCancel', { invalidate: ['hr.leave.list'], success: tr("أُلغيت الإجازة") });
  const cancelOt = useAction('hr.ot.cancel', { invalidate: ['hr.ot.list'], success: tr("أُلغي الإضافي") });
  const isSuper = !!useAuth().user?.isSuperAdmin;
  const [removing, setRemoving] = useState<LeaveView | null>(null);
  const removeLeave = useAction('hr.leave.remove', { invalidate: ['hr.leave.list', 'hr.me', 'hr.dashboard', 'hr.leave.balances', 'home.dashboard'], success: tr("حُذف طلب الإجازة"), onSuccess: () => setRemoving(null) });
  const q = tab === 'leave' ? leaves : ots;
  const employees = (dir.data?.employees || []).filter((e) => e.status !== 'terminated');
  const types = (dir.data?.leaveTypes || []).filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }));
  const years = Array.from({ length: 4 }, (_, i) => String(Number(kwDate().slice(0, 4)) + 1 - i));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Segmented label={tr("نوع الطلب")} value={tab} onChange={(v) => { setTab(v); setStatus('open'); }} options={[{ value: 'leave', label: tr("الإجازات") }, { value: 'ot', label: tr("العمل الإضافي") }]} />
        <span className="flex-1" />
        {tab === 'leave' && <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>{tr("تسجيل إجازة لموظف")}</Button>}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Select label={tr("الحالة")} className="w-[200px]" value={status} onChange={(e) => setStatus(e.target.value)} options={[
          { value: 'open', label: tr("بانتظار القرار") }, { value: 'approved', label: tr("معتمدة") }, { value: 'rejected', label: tr("مرفوضة") }, { value: 'cancelled', label: tr("ملغاة") }, { value: 'all', label: tr("الكل") }
        ]} />
        <Select label={tr("الموظف")} className="w-[220px]" value={emp} onChange={(e) => setEmp(e.target.value)} options={[{ value: '', label: tr("كل الموظفين") }, ...employees.map((e) => ({ value: e.id, label: e.fullName }))]} />
        {tab === 'leave' && <Select label={tr("السنة")} className="w-[120px]" value={year} onChange={(e) => setYear(e.target.value)} options={years.map((y) => ({ value: y, label: y }))} />}
      </div>
      {q.isError && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {!q.data ? <Loader /> : (
        <Card padded={false} className="[&>div:first-child]:border-t-0">
          {!q.data.length ? <EmptyState title={tr("لا طلبات")} /> : tab === 'leave'
            ? (q.data as LeaveView[]).map((l) => (
              <LeaveRow key={l.id} l={l} showName actions={<>
                {(l.status === 'pending_manager' || l.status === 'pending_hr') && <Button size="sm" variant="primary" onClick={() => setPick({ kind: 'leave', item: l })}>{tr("اعتماد أو رفض")}</Button>}
                {l.status === 'approved' && <Button size="sm" variant="ghost" onClick={() => setCancelling(l)}>{tr("إلغاء الطلب")}</Button>}
                {isSuper && <Button size="sm" variant="ghost" icon="trash" aria-label={tr("حذف نهائياً")} onClick={() => setRemoving(l)}>{tr("حذف")}</Button>}
              </>} />
            ))
            : (q.data as OtView[]).map((o) => (
              <OtRow key={o.id} o={o} showName actions={<>
                {o.status === 'pending' && <Button size="sm" variant="primary" onClick={() => setPick({ kind: 'ot', item: o })}>{tr("اعتماد أو رفض")}</Button>}
                {o.status === 'approved' && <Button size="sm" variant="ghost" onClick={() => setCancelling(o)}>{tr("إلغاء الطلب")}</Button>}
              </>} />
            ))}
        </Card>
      )}
      <LeaveDialog open={creating} onClose={() => setCreating(false)} types={types} employees={employees} />
      <ReasonDialog open={!!cancelling} onClose={() => setCancelling(null)} title={tr("إلغاء طلب معتمد")} label={tr("سبب الإلغاء")} confirmLabel={tr("إلغاء الطلب")} danger
        onConfirm={(note) => ('typeId' in cancelling! ? cancelLeave : cancelOt).mutateAsync({ id: cancelling!.id, note })}>
        {cancelling && <p className="m-0 text-muted">{tr("طلب")} <b className="text-fg">{cancelling.name}</b>{tr(". يعود الرصيد للموظف ويُسجَّل الإلغاء في سجل العمليات.")}</p>}
      </ReasonDialog>
      <Dialog open={!!removing} onClose={() => setRemoving(null)} title={tr("حذف طلب الإجازة نهائياً")}
        footer={<><Button variant="danger" className="flex-1" loading={removeLeave.isPending} onClick={() => removeLeave.mutate({ id: removing!.id })}>{tr("حذف نهائياً")}</Button>
          <Button variant="ghost" onClick={() => setRemoving(null)}>{tr("تراجع")}</Button></>}>
        {removing && <p className="m-0">{tr("طلب")} <b>{removing.name}</b> · {removing.typeName} · {removing.days} {tr("يوم")}. {tr("يُحذف الطلب كأنه لم يكن ويعود الرصيد، ولا يمكن التراجع. يبقى أثر الحذف في سجل العمليات. للإلغاء مع بقاء الطلب استخدم «إلغاء الطلب».")}</p>}
      </Dialog>
      {dialog}
    </div>
  );
}
