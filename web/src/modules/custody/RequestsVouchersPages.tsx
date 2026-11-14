import { useState } from 'react';
import { Link } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useAction, useApi } from '../../lib/useApi';
import { relativeTime } from '../../lib/format';
import { Avatar, Badge, Card, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { DataTable, SearchBox, Segmented } from '../../ui/Controls';
import { ReasonDialog } from '../../ui/Decide';
import { Icon } from '../../ui/Icon';
import { Money, OpenCustodyDialog, V_TONE, VoucherFormDialog, dateLabel, useCustodyRole } from './shared';
import type { CusRequest, VoucherView } from './types';

const REQ_TONE = { pending: 'warn', approved: 'ok', rejected: 'bad', cancelled: 'neutral' } as const;

/** طلبات العهد الجديدة: الموظف يرى طلباته، والمحاسب يعتمد بفتح العهدة أو يرفض */
export function CusRequestsPage() {
  const { staff } = useCustodyRole();
  const q = useApi<CusRequest[]>('cus.request.list', {});
  const [opening, setOpening] = useState<CusRequest | null>(null);
  const [rejecting, setRejecting] = useState<CusRequest | null>(null);
  const reject = useAction('cus.request.reject', { invalidate: ['cus.request.list', 'cus.home'], success: tr("رُفض الطلب"), silentError: true });
  const cancel = useAction('cus.request.cancel', { invalidate: ['cus.request.list', 'cus.home'], success: tr("أُلغي الطلب") });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  return (
    <Card padded={false}>
      {q.data.length === 0 ? <EmptyState title={tr("لا طلبات")} body={tr("يطلب الموظف عهدة جديدة من «عهدتي» بعد إقفال عهدته السابقة.")} /> : q.data.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3.5 first:border-t-0">
          <Avatar name={r.employeeName} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{r.employeeName} · <Money fils={r.amount} /></span>
            <span className="text-[13px] text-muted">{relativeTime(r.createdAt)}{r.reason ? ' · ' + r.reason : ''}{r.rejectReason ? ' · ' + r.rejectReason : ''}</span>
            {r.custodyId && <Link to={'/custody/' + r.custodyId} className="text-[13px] text-accent-fg no-underline">{r.custodyId}</Link>}
          </span>
          <Badge tone={REQ_TONE[r.status]}>{r.statusLabel}</Badge>
          {staff && r.status === 'pending' && (
            <span className="flex gap-2">
              <Button size="sm" variant="primary" icon="check" disabled={!!r.activeCustodyId} onClick={() => setOpening(r)}>{tr("فتح العهدة")}</Button>
              <Button size="sm" variant="danger-outline" icon="x" onClick={() => setRejecting(r)}>{tr("رفض")}</Button>
            </span>
          )}
          {!staff && r.status === 'pending' && <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate({ id: r.id })}>{tr("إلغاء")}</Button>}
        </div>
      ))}
      <OpenCustodyDialog open={!!opening} onClose={() => setOpening(null)} preset={opening ? { employeeId: opening.employeeId, amount: opening.amount, requestId: opening.id } : undefined} />
      <ReasonDialog open={!!rejecting} onClose={() => setRejecting(null)} title={tr("رفض طلب العهدة")} label={tr("سبب الرفض")} confirmLabel={tr("رفض")} danger
        onConfirm={(reason) => reject.mutateAsync({ id: rejecting!.id, reason })} />
    </Card>
  );
}

/** السندات: الكل للمحاسب، وطلبات المستخدم وسندات عهده لغيره */
export function VouchersPage() {
  const { staff, admin } = useCustodyRole();
  const [type, setType] = useState<'' | 'payment' | 'receipt'>('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<'' | 'request' | 'create'>('');
  const [acting, setActing] = useState<{ v: VoucherView; kind: 'reject' | 'cancel' } | null>(null);
  const q = useApi<VoucherView[]>('cus.voucher.list', {});
  const inv = { invalidate: ['cus.voucher.list', 'cus.home'] };
  const approve = useAction('cus.voucher.approve', { ...inv, success: tr("اعتُمد السند") });
  const reject = useAction('cus.voucher.reject', { ...inv, success: tr("رُفض الطلب"), silentError: true });
  const cancel = useAction('cus.voucher.cancel', { ...inv, success: tr("أُلغي السند"), silentError: true });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const rows = (q.data || []).filter((v) => (!type || v.type === type) && (!search || (v.number + ' ' + v.partyName + ' ' + v.reason).includes(search.trim())));
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox id="v-q" value={search} onChange={setSearch} placeholder={tr("بحث بالرقم أو الاسم أو البيان")} />
          <Button icon="plus" onClick={() => setForm('request')}>{tr("طلب سند")}</Button>
          {staff && <Button variant="primary" icon="plus" onClick={() => setForm('create')}>{tr("إصدار سند")}</Button>}
        </div>
        <Segmented label={tr("نوع السند")} value={type} onChange={setType} options={[{ value: '', label: tr("الكل") }, { value: 'payment', label: tr("صرف") }, { value: 'receipt', label: tr("قبض") }]} />
      </Card>
      <Card padded={false}>
        {q.isPending ? <Loader /> : rows.length === 0 ? <EmptyState title={tr("لا سندات")} /> : (
          <DataTable head={[tr("السند"), tr("التاريخ"), tr("الطرف"), tr("البيان"), tr("المبلغ"), tr("الحالة"), '']} minWidth={900}>
            {rows.map((v) => (
              <tr key={v.id}>
                <td><span className="font-semibold">{v.typeLabel}</span><div className="text-[12px] text-muted num">{v.number || '—'}</div></td>
                <td className="num whitespace-nowrap">{dateLabel(v.date)}</td>
                <td>{v.partyName}</td>
                <td className="max-w-[280px]"><div className="truncate" title={v.reason}>{v.reason}</div>{v.custodyId && <Link to={'/custody/' + v.custodyId} className="text-[12px] text-accent-fg no-underline">{v.custodyId}</Link>}</td>
                <td><Money fils={v.amount} strong /></td>
                <td>
                  <Badge tone={V_TONE[v.status]}>{v.statusLabel}</Badge>
                  {v.status === 'active' && <div className="mt-1 text-[12px] text-muted">{v.signed ? tr("موقّع") : tr("بانتظار توقيع الإدارة")}</div>}
                </td>
                <td className="text-left whitespace-nowrap">
                  {v.number && <Link to={'/custody/print/voucher/' + v.id} className="inline-flex items-center gap-1 px-2 text-accent-fg no-underline"><Icon name="printer" size={16} />{tr("طباعة")}</Link>}
                  {staff && v.status === 'requested' && <Button size="sm" variant="ghost" icon="check" loading={approve.isPending} onClick={() => approve.mutate({ id: v.id })}>{tr("اعتماد")}</Button>}
                  {staff && v.status === 'requested' && <Button size="sm" variant="ghost" icon="x" onClick={() => setActing({ v, kind: 'reject' })}>{tr("رفض")}</Button>}
                  {(admin && (v.status === 'active' || v.status === 'requested')) && <Button size="sm" variant="ghost" icon="trash" onClick={() => setActing({ v, kind: 'cancel' })}>{tr("إلغاء")}</Button>}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
      <VoucherFormDialog open={!!form} request={form === 'request'} onClose={() => setForm('')} />
      <ReasonDialog open={!!acting} onClose={() => setActing(null)} title={acting?.kind === 'reject' ? tr("رفض طلب السند") : tr("إلغاء السند")}
        label={acting?.kind === 'reject' ? tr("سبب الرفض") : tr("سبب الإلغاء")} confirmLabel={acting?.kind === 'reject' ? tr("رفض") : tr("إلغاء السند")} danger
        onConfirm={(reason) => (acting!.kind === 'reject' ? reject : cancel).mutateAsync({ id: acting!.v.id, reason })} />
    </div>
  );
}
