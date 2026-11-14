import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { InboxItem } from '../../lib/types';
import { relativeTime } from '../../lib/format';
import { Avatar, Badge, Card, EmptyState, ErrorBox, PageHeader, Skeleton } from '../../ui/Display';
import { cx } from '../../ui/cx';

export default function InboxPage() {
  const q = useQuery({ queryKey: ['inbox.list'], queryFn: () => api<InboxItem[]>('inbox.list'), staleTime: 15_000 });
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const items = q.data || [];
  const modules = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    items.forEach((x) => m.set(x.module, { label: x.moduleLabel, count: (m.get(x.module)?.count || 0) + 1 }));
    return [...m.entries()];
  }, [items]);
  const visible = items.filter((x) => filter === 'all' || x.module === filter);
  const sel = visible.find((x) => x.id === selected) || visible[0];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="صندوق الموافقات" subtitle="كل ما ينتظر قرارك من كل الوحدات في مكان واحد" />
      {q.isError && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}

      {items.length > 0 && (
        <div role="tablist" aria-label="تصفية حسب الوحدة" className="flex flex-wrap gap-2">
          {[['all', { label: 'الكل', count: items.length }] as const, ...modules].map(([key, m]) => (
            <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}
              className={cx('inline-flex h-9 items-center gap-2 rounded-full px-3.5 font-medium cursor-pointer', filter === key ? 'bg-fg text-bg' : 'border border-line bg-surface')}>
              {m.label}<span className={cx('rounded-full px-1.5 text-[12px] font-semibold', filter === key ? 'bg-bg text-fg' : 'bg-chip text-muted')}>{m.count}</span>
            </button>
          ))}
        </div>
      )}

      {q.isPending ? (
        <Card className="flex flex-col gap-4">{[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-4 flex-1" /></div>)}</Card>
      ) : items.length === 0 ? (
        <Card><EmptyState title="لا شيء ينتظر قرارك" body="طلبات الإجازات وإغلاق العهد والعمل الإضافي ومراجعة المهام ستصل هنا فور تفعيل وحداتها." /></Card>
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          <Card padded={false} className="min-w-0 flex-[3_1_460px] overflow-hidden">
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
          {sel && (
            <Card as="aside" className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
              <div className="flex items-center gap-2"><Badge tone="warn">{sel.status}</Badge><span className="text-[13px] text-muted">{sel.moduleLabel}</span></div>
              <h2 className="m-0 text-[18px] font-bold">{sel.title}</h2>
              {sel.facts && (
                <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
                  {sel.facts.map((f) => <div key={f.k}><dt className="text-[12px] text-muted">{f.k}</dt><dd className="m-0 font-medium">{f.v}</dd></div>)}
                </dl>
              )}
              {sel.note && <div className="rounded-lg bg-bg p-3 text-[13px] leading-relaxed text-muted">{sel.note}</div>}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
