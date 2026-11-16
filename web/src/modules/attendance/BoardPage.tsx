import { tr } from '../../lib/i18n';
import { useMemo, useState } from 'react';
import type { Board, BoardStatus } from '../../lib/types';
import { formatTime, hm, kwDate } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { Avatar, Badge, Card, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { DataTable, SearchBox, Segmented } from '../../ui/Controls';
import { TextInput } from '../../ui/Field';
import { BOARD_LABEL, BOARD_TONE, MapLink } from './shared';

type Filter = 'all' | BoardStatus | 'late';

export default function BoardPage() {
  const [date, setDate] = useState(kwDate());
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const q = useApi<Board>('att.board', { date }, { refetchInterval: date === kwDate() ? 60_000 : false, refetchIntervalInBackground: false, placeholderData: (p) => p });
  const b = q.data;
  const rows = useMemo(() => (b?.rows || []).filter((r) =>
    (filter === 'all' || (filter === 'late' ? r.late > 0 : r.status === filter)) && (!search || r.name.includes(search))), [b, filter, search]);
  const c = b?.counts;
  const options = c ? ([
    { value: 'all', label: tr("الكل"), count: c.total }, { value: 'in', label: tr("داخل الدوام"), count: c.in }, { value: 'late', label: tr("متأخرون"), count: c.late },
    { value: 'out', label: tr("انصرفوا"), count: c.out }, { value: 'absent', label: tr("غائبون"), count: c.absent }, { value: 'none', label: tr("لم يسجّلوا بعد"), count: c.none },
    { value: 'leave', label: tr("إجازة"), count: c.leave }, { value: 'off', label: tr("عطلة"), count: c.off }
  ] as { value: Filter; label: string; count: number }[]).filter((o) => o.value === 'all' || o.count > 0) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <TextInput label={tr("اليوم")} type="date" value={date} max={kwDate()} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-[180px]" />
        <div className="flex flex-1 flex-col gap-0.5 pb-1">
          {b && <span className="font-semibold">{b.dayName}{b.isToday ? tr(" · الآن") : ''}</span>}
          {b && <span className="text-[13px] text-muted">{b.scope === 'team' ? tr("فريقك فقط") : tr("كل الموظفين")}</span>}
        </div>
        <SearchBox id="board-search" value={search} onChange={setSearch} placeholder={tr("ابحث بالاسم")} />
      </div>
      {q.isError && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {!b ? <Loader /> : (
        <>
          <Segmented label={tr("تصفية حسب الحالة")} value={filter} onChange={setFilter} options={options} />
          <Card padded={false} className="overflow-hidden">
            {rows.length === 0 ? <EmptyState title={tr("لا أحد في هذه الحالة")} /> : (
              <DataTable head={[tr("الموظف"), tr("الحالة"), tr("أول حضور"), tr("آخر انصراف"), tr("الساعات"), tr("الموقع")]} minWidth={760}>
                {rows.map((r) => (
                  <tr key={r.employeeId}>
                    <td>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={r.name} size={32} />
                        <span className="flex flex-col"><span className="font-semibold">{r.name}</span><span className="text-[12px] text-muted">{r.jobTitle || r.departmentName}</span></span>
                      </span>
                    </td>
                    <td><span className="flex flex-wrap gap-1"><Badge tone={BOARD_TONE[r.status]}>{BOARD_LABEL[r.status]}</Badge>{r.late > 0 && <Badge tone="warn">{tr("تأخير")} {r.late} {tr("د")}</Badge>}{r.detail && <span className="text-[12px] text-muted">{r.detail}</span>}</span></td>
                    <td className="num whitespace-nowrap">{r.firstIn ? formatTime(r.firstIn) : '—'}</td>
                    <td className="num whitespace-nowrap">{r.lastOut ? formatTime(r.lastOut) : '—'}</td>
                    <td className="num ltr text-right">{r.sessions ? hm(r.minutes) : '—'}</td>
                    <td><MapLink loc={r.inLoc} /></td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
