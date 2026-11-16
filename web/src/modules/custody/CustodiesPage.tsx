import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { Card, EmptyState, ErrorBox, Loader, StatTile } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { DataTable, Pager, SearchBox, Segmented, useTable } from '../../ui/Controls';
import { Money, OpenCustodyDialog, StatusBadge, dateLabel, kwd } from './shared';
import type { CusHome, CustodyView } from './types';

const custodySortValue = (c: CustodyView, k: string) => (k === 'total' ? c.amount + c.carriedBalance : (c as unknown as Record<string, unknown>)[k]);

/** المحاسب: كل العهد وما ينتظر الإجراء */
export default function CustodiesPage() {
  const [status, setStatus] = useState<'' | 'open' | 'pending' | 'signing' | 'closed'>('');
  const [q, setQ] = useState('');
  const [opening, setOpening] = useState(false);
  const nav = useNavigate();
  const list = useApi<CustodyView[]>('cus.list', {});
  const home = useApi<CusHome>('cus.home');
  const rows = useMemo(() => (list.data || []).filter((c) => (!status || c.status === status) && (!q || (c.id + ' ' + c.periodLabel + ' ' + c.employeeName).includes(q.trim()))), [list.data, status, q]);
  const t = useTable(rows, { sort: { key: 'openDate', dir: 'desc' }, get: custodySortValue });
  if (list.isError) return <ErrorBox message={(list.error as Error).message} onRetry={() => list.refetch()} />;
  const s = home.data?.staff;
  const count = (st: string) => (list.data || []).filter((c) => c.status === st).length;
  return (
    <div className="flex flex-col gap-4">
      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label={tr("عهد مفتوحة")} value={s.openCount} foot={tr("رصيدها {0}", kwd(s.openBalance))} icon="wallet" />
          <StatTile label={tr("بانتظار اعتماد الإقفال")} value={s.pendingClose.length} icon="inbox" />
          <StatTile label={tr("بانتظار توقيع الإدارة")} value={s.awaitingOpenSign.length + s.awaitingCloseSign.length} icon="key" />
          <StatTile label={tr("مصروف هذا الشهر")} value={<span className="text-[20px]">{kwd(s.monthSpent)}</span>} icon="finance" />
        </div>
      )}
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox id="cus-q" value={q} onChange={setQ} placeholder={tr("بحث برقم العهدة أو الفترة أو الموظف")} />
          <Button variant="primary" icon="plus" onClick={() => setOpening(true)}>{tr("فتح عهدة")}</Button>
        </div>
        <Segmented label={tr("تصفية حسب الحالة")} value={status} onChange={setStatus} options={[
          { value: '', label: tr("الكل"), count: list.data?.length },
          { value: 'open', label: tr("مفتوحة"), count: count('open') },
          { value: 'pending', label: tr("بانتظار الاعتماد"), count: count('pending') },
          { value: 'signing', label: tr("بانتظار توقيع الإدارة"), count: count('signing') },
          { value: 'closed', label: tr("مغلقة"), count: count('closed') }
        ]} />
      </Card>
      <Card padded={false}>
        {list.isPending ? <Loader /> : rows.length === 0 ? <EmptyState title={tr("لا عهد")} /> : (
          <DataTable sticky sort={t.sort} onSort={t.onSort} pager={<Pager {...t.pager} />} minWidth={860}
            head={[{ key: 'periodLabel', label: tr("العهدة") }, { key: 'employeeName', label: tr("الموظف") }, { key: 'openDate', label: tr("تاريخ الفتح") }, { key: 'total', label: tr("المبلغ") }, { key: 'totalSpent', label: tr("المصروف") }, { key: 'remaining', label: tr("المتبقي") }, { key: 'statusLabel', label: tr("الحالة") }]}>
            {t.rows.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-chip/40" onClick={() => nav('/custody/' + c.id)}>
                <td><Link to={'/custody/' + c.id} className="font-semibold text-fg no-underline">{c.periodLabel}</Link><div className="text-[12px] text-muted num">{c.id}</div></td>
                <td>{c.employeeName}</td>
                <td className="num">{dateLabel(c.openDate)}</td>
                <td><Money fils={c.amount + c.carriedBalance} /></td>
                <td><Money fils={c.totalSpent} /></td>
                <td><Money fils={c.remaining} strong /></td>
                <td><StatusBadge c={c} /></td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
      <OpenCustodyDialog open={opening} onClose={(id) => { setOpening(false); if (id) nav('/custody/' + id); }} />
    </div>
  );
}
