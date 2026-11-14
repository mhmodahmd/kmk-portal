import { useState } from 'react';
import type { Directory, LeaveView, OtView } from '../../lib/types';
import { kwDate } from '../../lib/format';
import { useAction, useApi } from '../../lib/useApi';
import { Card, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { Segmented } from '../../ui/Controls';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Field';
import { ReasonDialog } from '../../ui/Decide';
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
  const cancelLeave = useAction('hr.leave.adminCancel', { invalidate: ['hr.leave.list'], success: 'أُلغيت الإجازة' });
  const cancelOt = useAction('hr.ot.cancel', { invalidate: ['hr.ot.list'], success: 'أُلغي الإضافي' });
  const q = tab === 'leave' ? leaves : ots;
  const employees = (dir.data?.employees || []).filter((e) => e.status !== 'terminated');
  const types = (dir.data?.leaveTypes || []).filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }));
  const years = Array.from({ length: 4 }, (_, i) => String(Number(kwDate().slice(0, 4)) + 1 - i));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Segmented label="نوع الطلب" value={tab} onChange={(v) => { setTab(v); setStatus('open'); }} options={[{ value: 'leave', label: 'الإجازات' }, { value: 'ot', label: 'العمل الإضافي' }]} />
        <span className="flex-1" />
        {tab === 'leave' && <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>تسجيل إجازة لموظف</Button>}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Select label="الحالة" className="w-[200px]" value={status} onChange={(e) => setStatus(e.target.value)} options={[
          { value: 'open', label: 'بانتظار القرار' }, { value: 'approved', label: 'معتمدة' }, { value: 'rejected', label: 'مرفوضة' }, { value: 'cancelled', label: 'ملغاة' }, { value: 'all', label: 'الكل' }
        ]} />
        <Select label="الموظف" className="w-[220px]" value={emp} onChange={(e) => setEmp(e.target.value)} options={[{ value: '', label: 'كل الموظفين' }, ...employees.map((e) => ({ value: e.id, label: e.fullName }))]} />
        {tab === 'leave' && <Select label="السنة" className="w-[120px]" value={year} onChange={(e) => setYear(e.target.value)} options={years.map((y) => ({ value: y, label: y }))} />}
      </div>
      {q.isError && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {!q.data ? <Loader /> : (
        <Card padded={false} className="[&>div:first-child]:border-t-0">
          {!q.data.length ? <EmptyState title="لا طلبات" /> : tab === 'leave'
            ? (q.data as LeaveView[]).map((l) => (
              <LeaveRow key={l.id} l={l} showName actions={<>
                {(l.status === 'pending_manager' || l.status === 'pending_hr') && <Button size="sm" variant="primary" onClick={() => setPick({ kind: 'leave', item: l })}>البت</Button>}
                {l.status === 'approved' && <Button size="sm" variant="ghost" onClick={() => setCancelling(l)}>إلغاء</Button>}
              </>} />
            ))
            : (q.data as OtView[]).map((o) => (
              <OtRow key={o.id} o={o} showName actions={<>
                {o.status === 'pending' && <Button size="sm" variant="primary" onClick={() => setPick({ kind: 'ot', item: o })}>البت</Button>}
                {o.status === 'approved' && <Button size="sm" variant="ghost" onClick={() => setCancelling(o)}>إلغاء</Button>}
              </>} />
            ))}
        </Card>
      )}
      <LeaveDialog open={creating} onClose={() => setCreating(false)} types={types} employees={employees} />
      <ReasonDialog open={!!cancelling} onClose={() => setCancelling(null)} title="إلغاء طلب معتمد" label="سبب الإلغاء" confirmLabel="إلغاء الطلب" danger
        onConfirm={(note) => ('typeId' in cancelling! ? cancelLeave : cancelOt).mutateAsync({ id: cancelling!.id, note })}>
        {cancelling && <p className="m-0 text-muted">طلب <b className="text-fg">{cancelling.name}</b>. يعود الرصيد للموظف ويُسجَّل الإلغاء في سجل العمليات.</p>}
      </ReasonDialog>
      {dialog}
    </div>
  );
}
