import { tr } from '../../lib/i18n';
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
  return [c.inTime && tr("الحضور {0}", c.inTime), c.outTime && tr("الانصراف {0}", c.outTime)].filter(Boolean).join(' · ');
}

export default function CorrectionsPage() {
  const { canSeeTeam } = useAttendanceScope();
  const [creating, setCreating] = useState(false);
  const mine = useApi<Correction[]>('att.correction.mine');
  const cancel = useAction('att.correction.cancel', { invalidate: ['att.correction.mine', 'att.today'], success: tr("أُلغي الطلب") });

  return (
    <div className="flex flex-col gap-5">
      {canSeeTeam && <TeamCorrections />}
      <Card padded={false}>
        <CardHeader title={tr("طلباتي")} action={<Button size="sm" variant="primary" icon="plus" onClick={() => setCreating(true)}>{tr("طلب تصحيح")}</Button>} />
        {mine.isError && <div className="px-5 pb-4"><ErrorBox message={(mine.error as Error).message} /></div>}
        {mine.isPending ? <div className="p-5"><Skeleton className="h-10" /></div> : !mine.data?.length ? (
          <EmptyState title={tr("لا طلبات تصحيح")} body={tr("إذا نسيت البصمة أو سُجّل وقت خطأ، اطلب تصحيحه هنا خلال 31 يوماً.")} />
        ) : mine.data.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3.5">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{c.kindLabel} · <span className="font-normal text-muted">{c.dayName} {dmy(c.date)}</span></span>
              <span className="text-[13px] text-muted">{times(c)}{c.reason ? ' · ' + c.reason : ''}</span>
              {c.decisionNote && <span className="text-[13px]">{tr("ملاحظة")} {c.decidedBy}: {c.decisionNote}</span>}
            </span>
            <Badge tone={CORR_TONE[c.status]}>{c.statusLabel}</Badge>
            {c.status === 'pending' && <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate({ id: c.id })}>{tr("إلغاء")}</Button>}
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
      <CardHeader title={tr("طلبات الموظفين")} action={<Segmented label={tr("الحالة")} value={status} onChange={setStatus} options={[{ value: 'pending', label: tr("بانتظار القرار") }, { value: 'all', label: tr("الكل") }]} />} />
      {q.isPending ? <div className="p-5"><Skeleton className="h-10" /></div> : !q.data?.length ? (
        <EmptyState title={status === 'pending' ? tr("لا طلبات بانتظار قرارك") : tr("لا طلبات")} />
      ) : q.data.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3.5">
          <Avatar name={c.name} size={34} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{c.name} · <span className="font-normal">{c.kindLabel}</span></span>
            <span className="text-[13px] text-muted">{c.dayName} {dmy(c.date)} · {times(c)} · {relativeTime(c.createdAt)}</span>
          </span>
          <Badge tone={CORR_TONE[c.status]}>{c.statusLabel}</Badge>
          {c.status === 'pending' && <Button size="sm" variant="primary" onClick={() => setSel(c)}>{tr("البت")}</Button>}
        </div>
      ))}
      <DecideDialog open={!!sel} onClose={() => setSel(null)} title={tr("طلب تصحيح بصمة")}
        onDecide={async (approve, note) => {
          await api('att.correction.decide', { id: sel!.id, approve, note });
          ['att.correction.list', 'inbox.list', 'home.summary', 'att.records', 'att.board'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
        }}>
        {sel && <>
          <Facts items={[{ k: tr("الموظف"), v: sel.name }, { k: tr("النوع"), v: sel.kindLabel }, { k: tr("اليوم"), v: `${sel.dayName} ${dmy(sel.date)}` }, { k: tr("الوقت المطلوب"), v: times(sel) }]} />
          <div className="rounded-lg bg-bg p-3 text-[13px] leading-relaxed text-muted">{tr("السبب:")} {sel.reason}</div>
        </>}
      </DecideDialog>
    </Card>
  );
}
