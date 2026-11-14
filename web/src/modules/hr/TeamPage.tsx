import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { HrTeam, LeaveView, OtView } from '../../lib/types';
import { daysWord, dmy, duration } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { Avatar, Badge, Card, CardHeader, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { Facts } from '../../ui/Controls';
import { Button } from '../../ui/Button';
import { DecideDialog } from '../../ui/Decide';
import { LeaveRow, OtDialog, OtRow } from './shared';

type Pick = { kind: 'leave'; item: LeaveView } | { kind: 'ot'; item: OtView } | null;

/** نافذة القرار المشتركة لطلبات الإجازة والإضافي */
export function useDecision(refresh: string[]) {
  const qc = useQueryClient();
  const [pick, setPick] = useState<Pick>(null);
  const dialog = (
    <DecideDialog open={!!pick} onClose={() => setPick(null)} title={pick?.kind === 'leave' ? 'طلب إجازة' : 'طلب عمل إضافي'}
      onDecide={async (approve, note) => {
        await api(pick!.kind === 'leave' ? 'hr.leave.decide' : 'hr.ot.decide', { id: pick!.item.id, approve, note });
        [...refresh, 'hr.me', 'inbox.list', 'home.summary'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      }}>
      {pick?.kind === 'leave' && <>
        <Facts items={[{ k: 'الموظف', v: pick.item.name }, { k: 'النوع', v: pick.item.typeName }, { k: 'الفترة', v: `${dmy(pick.item.from)} ← ${dmy(pick.item.to)}` }, { k: 'أيام العمل', v: daysWord(pick.item.days) }]} />
        {pick.item.managerNote && <div className="text-[13px]">ملاحظة {pick.item.managerName}: {pick.item.managerNote}</div>}
        {pick.item.reason && <div className="rounded-lg bg-bg p-3 text-[13px] text-muted">السبب: {pick.item.reason}</div>}
      </>}
      {pick?.kind === 'ot' && <>
        <Facts items={[{ k: 'الموظف', v: pick.item.name }, { k: 'اليوم', v: dmy(pick.item.date) }, { k: 'المدة', v: duration(pick.item.minutes) }]} />
        {pick.item.reason && <div className="rounded-lg bg-bg p-3 text-[13px] text-muted">{pick.item.reason}</div>}
      </>}
    </DecideDialog>
  );
  return { setPick, dialog };
}

export default function TeamPage() {
  const q = useApi<HrTeam>('hr.team');
  const [otOpen, setOtOpen] = useState(false);
  const { setPick, dialog } = useDecision(['hr.team']);
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  const { members, leaves, overtime } = q.data;
  const pendingLeaves = leaves.filter((l) => l.status === 'pending_manager');
  const pendingOt = overtime.filter((o) => o.status === 'pending');
  return (
    <div className="flex flex-col gap-4">
      {(pendingLeaves.length > 0 || pendingOt.length > 0) && (
        <Card padded={false}>
          <CardHeader title="بانتظار قرارك" action={<Badge tone="warn">{pendingLeaves.length + pendingOt.length}</Badge>} />
          {pendingLeaves.map((l) => <LeaveRow key={l.id} l={l} showName actions={<Button size="sm" variant="primary" onClick={() => setPick({ kind: 'leave', item: l })}>البت</Button>} />)}
          {pendingOt.map((o) => <OtRow key={o.id} o={o} showName actions={<Button size="sm" variant="primary" onClick={() => setPick({ kind: 'ot', item: o })}>البت</Button>} />)}
        </Card>
      )}

      <Card padded={false}>
        <CardHeader title={`أعضاء الفريق (${members.length})`} action={<Button size="sm" icon="plus" onClick={() => setOtOpen(true)}>تسجيل إضافي</Button>} />
        {!members.length ? <EmptyState title="لا أعضاء في فريقك" /> : (
          <div className="grid grid-cols-1 gap-px border-t border-line bg-line sm:grid-cols-2">
            {members.map((m) => (
              <Link key={m.id} to={`/attendance/report/${m.id}`} className="flex items-center gap-3 bg-surface px-5 py-3.5 text-fg no-underline hover:bg-chip/40">
                <Avatar name={m.fullName} size={36} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{m.fullName}</span>
                  <span className="truncate text-[13px] text-muted">{m.jobTitle || '—'}{m.shiftName ? ' · ' + m.shiftName : ''}</span>
                </span>
                {m.status !== 'active' && <Badge>{m.statusLabel}</Badge>}
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card padded={false}>
        <CardHeader title="إجازات الفريق" />
        {!leaves.length ? <EmptyState title="لا إجازات" /> : leaves.slice(0, 30).map((l) => <LeaveRow key={l.id} l={l} showName />)}
      </Card>
      <Card padded={false}>
        <CardHeader title="العمل الإضافي للفريق" />
        {!overtime.length ? <EmptyState title="لا طلبات" /> : overtime.slice(0, 30).map((o) => <OtRow key={o.id} o={o} showName />)}
      </Card>
      <OtDialog open={otOpen} onClose={() => setOtOpen(false)} employees={members.filter((m) => m.status !== 'terminated')} />
      {dialog}
    </div>
  );
}
