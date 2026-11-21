import { tr } from '../../lib/i18n';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import type { InboxItem } from '../../lib/types';
import { relativeTime } from '../../lib/format';
import { useAction } from '../../lib/useApi';
import { Avatar, Badge, Card, EmptyState, ErrorBox, Skeleton } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Textarea } from '../../ui/Field';
import { cx } from '../../ui/cx';

export default function InboxPage() {
  const q = useQuery({ queryKey: ['inbox.list'], queryFn: () => api<InboxItem[]>('inbox.list'), staleTime: 15_000 });
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const items = q.data || [];
  const modules = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    items.forEach((x) => m.set(x.moduleLabel, { label: x.moduleLabel, count: (m.get(x.moduleLabel)?.count || 0) + 1 }));
    return [...m.entries()];
  }, [items]);
  const visible = items.filter((x) => filter === 'all' || x.moduleLabel === filter);
  const sel = visible.find((x) => x.id === selected) || visible[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[22px] font-bold sm:text-[24px]">{tr("صندوق الموافقات")}</h1>
        <span className="text-muted">{tr("كل ما ينتظر قرارك من كل الوحدات في مكان واحد")}</span>
      </div>
      {q.isError && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}

      {items.length > 0 && modules.length > 1 && (
        <div role="tablist" aria-label={tr("تصفية حسب النوع")} className="flex flex-wrap gap-2">
          {[['all', { label: tr("الكل"), count: items.length }] as const, ...modules].map(([key, m]) => (
            <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}
              className={cx('inline-flex h-11 items-center gap-2 rounded-full px-3.5 font-medium cursor-pointer sm:h-9', filter === key ? 'bg-fg text-bg' : 'border border-line bg-surface')}>
              {m.label}<span className={cx('rounded-full px-1.5 text-[12px] font-semibold', filter === key ? 'bg-bg text-fg' : 'bg-chip text-muted')}>{m.count}</span>
            </button>
          ))}
        </div>
      )}

      {q.isPending ? (
        <Card className="flex flex-col gap-4">{[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-4 flex-1" /></div>)}</Card>
      ) : items.length === 0 ? (
        <Card><EmptyState title={tr("لا شيء ينتظر قرارك")} body={tr("طلبات الإجازات والعمل الإضافي وتصحيح البصمة تصل هنا، ومع الوحدات القادمة: إغلاق العهد ومراجعة المهام.")} /></Card>
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          <Card padded={false} className="min-w-0 flex-[3_1_420px] overflow-hidden">
            {visible.map((x, i) => (
              <button key={x.id} type="button" onClick={() => setSelected(x.id)}
                className={cx('flex w-full items-center gap-3 px-5 py-3.5 text-right cursor-pointer', i > 0 && 'border-t border-line', sel?.id === x.id ? 'bg-accent-soft shadow-[inset_-3px_0_0_var(--c-accent)]' : 'hover:bg-chip/50')}>
                <Avatar name={x.who} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-semibold">{x.title}</span>
                  <span className="text-[13px] text-muted">{x.who} · {relativeTime(x.createdAt)}</span>
                </span>
                <Badge>{x.moduleLabel}</Badge>
              </button>
            ))}
          </Card>
          {sel && <Detail key={sel.id} item={sel} onDone={() => setSelected(null)} />}
        </div>
      )}
    </div>
  );
}

function Detail({ item, onDone }: { item: InboxItem; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'a' | 'r' | null>(null);
  useEffect(() => { setNote(''); setError(''); }, [item.id]);
  const decide = useAction('inbox.decide', {
    invalidate: ['hr.me', 'hr.team', 'hr.leave.list', 'hr.ot.list', 'att.correction.list', 'att.records', 'att.board', 'tsk.list', 'tsk.get', 'cus.get', 'cus.list', 'cus.home'],
    silentError: true, success: (r) => (r ? tr("تم حفظ القرار") : '')
  });
  const go = (approve: boolean) => {
    if (!approve && item.needsNoteOnReject && !note.trim()) { setError(tr("اكتب سبب الرفض ليصل إلى صاحب الطلب.")); return; }
    setError(''); setBusy(approve ? 'a' : 'r');
    decide.mutate({ kind: item.kind, id: item.refId, approve, note: note.trim() }, {
      onSuccess: onDone,
      onError: (e) => setError(e instanceof ApiError ? e.message : tr("تعذّر حفظ القرار.")),
      onSettled: () => setBusy(null)
    });
  };
  return (
    <Card as="aside" className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
      <div className="flex items-center gap-2"><Badge tone="warn">{item.status}</Badge><span className="text-[13px] text-muted">{item.moduleLabel}</span></div>
      <div className="flex items-center gap-3">
        <Avatar name={item.who} size={40} />
        <div className="flex flex-col"><h2 className="m-0 text-[18px] font-bold">{item.title}</h2><span className="text-muted">{item.who}</span></div>
      </div>
      {item.facts && (
        <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
          {item.facts.map((f) => <div key={f.k}><dt className="text-[12px] text-muted">{f.k}</dt><dd className="m-0 font-medium num">{f.v}</dd></div>)}
        </dl>
      )}
      {item.note && <div className="rounded-lg bg-bg p-3 text-[13px] leading-relaxed text-muted">{item.note}</div>}
      {item.link && <Link to={item.link} className="self-start text-[13px] font-semibold text-accent-fg no-underline">{tr("فتح التفاصيل")}</Link>}
      {item.linkOnly && item.link ? <Link to={item.link} className="inline-flex h-11 items-center justify-center rounded-lg bg-accent px-4 font-semibold text-on-accent no-underline sm:h-10">{item.approveLabel || tr("فتح التفاصيل")}</Link> : <>
      <Textarea label={tr("ملاحظة (مطلوبة عند الرفض)")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="[&_textarea]:min-h-[64px]" />
      {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      <div className="flex gap-2">
        <Button variant="primary" icon="check" className="flex-1" loading={busy === 'a'} disabled={!!busy} onClick={() => go(true)}>{item.approveLabel || tr("اعتماد")}</Button>
        <Button variant="danger-outline" icon="x" className="flex-1" loading={busy === 'r'} disabled={!!busy} onClick={() => go(false)}>{item.rejectLabel || tr("رفض")}</Button>
      </div></>}
    </Card>
  );
}
