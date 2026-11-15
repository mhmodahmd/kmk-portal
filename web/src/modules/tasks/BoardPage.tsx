import { useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { tr } from '../../lib/i18n';
import { useAction, useApi } from '../../lib/useApi';
import { ErrorBox, Loader } from '../../ui/Display';
import { Segmented } from '../../ui/Controls';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import { DueText, PriorityMark, TASK_KEYS, useTaskLookups } from './shared';
import type { TaskStatus, TaskView } from './types';

const COLS: TaskStatus[] = ['todo', 'doing', 'review', 'done'];
type View = 'mine' | 'created' | 'team' | 'all';

/** لوحة كانبان: سحب البطاقة بين الأعمدة يغيّر حالتها، وعلى الجوال قائمة الحالة في البطاقة */
export default function BoardPage() {
  const lk = useTaskLookups();
  const L = lk.data;
  const [view, setView] = useState<View>('mine');
  const q = useApi<TaskView[]>('tsk.list', { view });
  const qc = useQueryClient();
  const [over, setOver] = useState<TaskStatus | null>(null);
  const move = useAction<{ id: string; status: TaskStatus; sortOrder?: number }, TaskView>('tsk.status', {
    invalidate: TASK_KEYS,
    success: (r) => (r.review ? tr("أُرسلت للمراجعة") : r.nextNumber ? tr("أُنجزت، وأُنشئت المهمة التالية {0}", r.nextNumber) : ''),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tsk.list'] })
  });
  const views = [
    { value: 'mine' as View, label: tr("مهامي") }, { value: 'created' as View, label: tr("أسندتها") },
    ...(L?.hasTeam || L?.isManager ? [{ value: 'team' as View, label: tr("فريقي") }] : []),
    ...(L?.isManager ? [{ value: 'all' as View, label: tr("الكل") }] : [])
  ];
  const rows = (q.data || []).filter((t) => t.status !== 'cancelled');
  const col = (s: TaskStatus) => rows.filter((t) => t.status === s).sort((a, b) => a.sortOrder - b.sortOrder);

  const drop = (s: TaskStatus, e: DragEvent) => {
    e.preventDefault(); setOver(null);
    const id = e.dataTransfer.getData('text/plain');
    const t = rows.find((x) => x.id === id);
    if (!t || !t.canWork) return;
    const list = col(s).filter((x) => x.id !== id);
    const sortOrder = list.length ? list[list.length - 1].sortOrder + 1000 : Date.now();
    if (t.status !== s || t.sortOrder !== sortOrder) move.mutate({ id, status: s, sortOrder });
  };

  return (
    <div className="flex flex-col gap-3">
      <Segmented label={tr("عرض")} value={view} onChange={setView} options={views} />
      {q.isError ? <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} /> : !q.data ? <Loader /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLS.map((s) => {
            const items = col(s);
            const label = L?.statuses.find((x) => x.id === s)?.label || s;
            return (
              <section key={s} aria-label={label}
                onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver((o) => (o === s ? null : o))} onDrop={(e) => drop(s, e)}
                className={cx('flex min-h-[160px] flex-col gap-2 rounded-xl bg-chip/50 p-2.5 transition-colors', over === s && 'bg-accent-soft ring-2 ring-accent')}>
                <h2 className="m-0 flex items-center gap-2 px-1.5 pt-1 text-[14px] font-bold">{label}<span className="rounded-full bg-surface px-2 text-[12px] font-semibold text-muted num">{items.length}</span></h2>
                {items.map((t) => (
                  <article key={t.id} draggable={t.canWork} onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; }}
                    className={cx('flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 shadow-sm', t.canWork && 'cursor-grab active:cursor-grabbing')}>
                    <Link to={'/tasks/' + t.id} className="font-semibold text-fg no-underline">{t.title}</Link>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                      <span className="num">{t.number}</span>
                      {view !== 'mine' && <span className="inline-flex items-center gap-1"><Icon name="user" size={13} />{t.assigneeName}</span>}
                      {t.checklistTotal > 0 && <span className="num">{t.checklistDone}/{t.checklistTotal}</span>}
                      <PriorityMark t={t} />
                      {s !== 'done' && <DueText t={t} today={L?.today} />}
                    </div>
                    {t.canWork && (
                      <label className="flex items-center gap-2 text-[12px] text-muted md:hidden">
                        {tr("الحالة")}
                        <select value={t.status} onChange={(e) => move.mutate({ id: t.id, status: e.target.value as TaskStatus })}
                          className="h-8 flex-1 rounded-md border border-line bg-surface px-2 text-fg">
                          {COLS.map((c) => <option key={c} value={c}>{L?.statuses.find((x) => x.id === c)?.label}</option>)}
                        </select>
                      </label>
                    )}
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}
      <p className="m-0 hidden text-[13px] text-muted md:block">{tr("اسحب البطاقة إلى عمود آخر لتغيير حالتها. المهمة التي أسندها غيرك تذهب إلى «بانتظار مراجعة» حتى يعتمدها.")}</p>
    </div>
  );
}
