import { useState } from 'react';
import type { Correction } from '../../lib/types';
import { dmy, relativeTime } from '../../lib/format';
import { useAction, useApi } from '../../lib/useApi';
import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Badge, Card, CardHeader, EmptyState, ErrorBox, Skeleton } from '../../ui/Display';
import { Segmented, Facts } from '../../ui/Controls';
import { Button } from '../../ui/Button';
import { DecideDialog } from '../../ui/Decide';
import { CORR_TONE, CorrectionDialog, useAttendanceScope } from './shared';

function times(c: Correction) {
  return [c.inTime && `الحضور ${c.inTime}`, c.outTime && `الانصراف ${c.outTime}`].filter(Boolean).join(' · ');
}

export default function CorrectionsPage() {
  const { canSeeTeam } = useAttendanceScope();
  const [creating, setCreating] = useState(false);
  const mine = useApi<Correction[]>('att.correction.mine');
  const cancel = useAction('att.correction.cancel', { invalidate: ['att.correction.mine', 'att.today'], success: 'أُلغي الطلب' });

  return (
    <div className="flex flex-col gap-5">
      {canSeeTeam && <TeamCorrections />}
      <Card padded={false}>
        <CardHeader title="طلباتي" action={<Button size="sm" variant="primary" icon="plus" onClick={() => setCreating(true)}>طلب تصحيح</Button>} />
        {mine.isError && <div className="px-5 pb-4"><ErrorBox message={(mine.error as Error).message} /></div>}
        {mine.isPending ? <div className="p-5"><Skeleton className="h-10" /></div> : !mine.data?.length ? (
          <EmptyState title="لا طلبات تصحيح" body="إذا نسيت البصمة أو سُجّل وقت خطأ، اطلب تصحيحه هنا خلال 31 يوماً." />
        ) : mine.data.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3.5">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{c.kindLabel} · <span className="font-normal text-muted">{c.dayName} {dmy(c.date)}</span></span>
              <span className="text-[13px] text-muted">{times(c)}{c.reason ? ' · ' + c.reason : ''}</span>
              {c.decisionNote && <span className="text-[13px]">ملاحظة {c.decidedBy}: {c.decisionNote}</span>}
            </span>
            <Badge tone={CORR_TONE[c.status]}>{c.statusLabel}</Badge>
            {c.status === 'pending' && <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate({ id: c.id })}>إلغاء</Button>}
          </div>
        ))}
      </Card>
      <CorrectionDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function TeamCorrections() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'pending' | 'all'>('pending');
  const q = useApi<Correction[]>('att.correction.list', { status });
  const [sel, setSel] = useState<Correction | null>(null);
  return (
    <Card padded={false}>
      <CardHeader title="طلبات الموظفين" action={<Segmented label="الحالة" value={status} onChange={setStatus} options={[{ value: 'pending', label: 'بانتظار القرار' }, { value: 'all', label: 'الكل' }]} />} />
      {q.isPending ? <div className="p-5"><Skeleton className="h-10" /></div> : !q.data?.length ? (
        <EmptyState title={status === 'pending' ? 'لا طلبات بانتظار قرارك' : 'لا طلبات'} />
      ) : q.data.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3.5">
          <Avatar name={c.name} size={34} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{c.name} · <span className="font-normal">{c.kindLabel}</span></span>
            <span className="text-[13px] text-muted">{c.dayName} {dmy(c.date)} · {times(c)} · {relativeTime(c.createdAt)}</span>
          </span>
          <Badge tone={CORR_TONE[c.status]}>{c.statusLabel}</Badge>
          {c.status === 'pending' && <Button size="sm" variant="primary" onClick={() => setSel(c)}>البت</Button>}
        </div>
      ))}
      <DecideDialog open={!!sel} onClose={() => setSel(null)} title="طلب تصحيح بصمة"
        onDecide={async (approve, note) => {
          await api('att.correction.decide', { id: sel!.id, approve, note });
          ['att.correction.list', 'inbox.list', 'home.summary', 'att.records', 'att.board'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
        }}>
        {sel && <>
          <Facts items={[{ k: 'الموظف', v: sel.name }, { k: 'النوع', v: sel.kindLabel }, { k: 'اليوم', v: `${sel.dayName} ${dmy(sel.date)}` }, { k: 'الوقت المطلوب', v: times(sel) }]} />
          <div className="rounded-lg bg-bg p-3 text-[13px] leading-relaxed text-muted">السبب: {sel.reason}</div>
        </>}
      </DecideDialog>
    </Card>
  );
}
