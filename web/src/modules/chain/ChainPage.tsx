/**
 * صفحة السلسلة العامة لطلب أي وحدة (docs/09): بيانات الطلب المختصرة، والخط العمودي وقراراته، وإعادة الإرسال لصاحبه.
 * يفتحها المشارك في السلسلة ولو لم يكن له دور في وحدة الطلب.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useAction, useApi } from '../../lib/useApi';
import { Card, ErrorBox, Loader, PageHeader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Facts } from '../../ui/Controls';
import { TextInput } from '../../ui/Field';
import { ChainCard } from '../correspondence/Chain';
import type { ChainView } from '../correspondence/types';

interface ChainGet {
  entity: { number: string; title: string; moduleLabel: string; facts: { k: string; v: string }[]; link: string; canResubmit: boolean };
  chain: ChainView;
}

export default function ChainPage() {
  const { id = '' } = useParams();
  const q = useApi<ChainGet>('wf.get', { instanceId: id });
  const [note, setNote] = useState('');
  const resubmit = useAction<{ instanceId: string; note: string }>('wf.resubmit', { invalidate: ['wf.get', 'hr.me', 'att.correction.mine', 'tsk.get', 'tsk.list'], success: tr("أُعيد إرساله للسلسلة") });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  const { entity: e, chain } = q.data;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader eyebrow={e.moduleLabel} title={e.number} subtitle={e.title}
        actions={e.link ? <Link to={e.link} className="inline-flex h-11 items-center px-2 text-accent-fg no-underline sm:h-10">{tr("فتح في وحدته")}</Link> : undefined} />
      {e.facts.length > 0 && <Card><Facts cols={3} items={e.facts.map((f) => ({ k: f.k, v: f.v }))} /></Card>}
      {e.canResubmit && (
        <Card className="flex flex-col gap-3">
          <span className="font-semibold">{tr("أُعيد طلبك للتعديل. اكتب ما تغيّر ثم أعد إرساله، فيرجع إلى المرحلة التي أعادته.")}</span>
          <TextInput label={tr("ملاحظة (اختياري)")} value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={500} />
          <Button variant="primary" icon="check" className="self-start" loading={resubmit.isPending} onClick={() => resubmit.mutate({ instanceId: chain.id, note })}>{tr("إعادة الإرسال")}</Button>
        </Card>
      )}
      <ChainCard d={{ workflow: chain, submit: null, signatures: [], letter: { id: '' } }} />
    </div>
  );
}
