import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useAction, useApi } from '../../lib/useApi';
import { relativeTime } from '../../lib/format';
import { Avatar, Badge, Card, EmptyState, ErrorBox, ListRow, Loader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { DataTable, Pager, SearchBox, Segmented, useTable } from '../../ui/Controls';
import { ReasonDialog } from '../../ui/Decide';
import { Dialog } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { Money, OpenCustodyDialog, SignActions, V_TONE, VoucherFormDialog, dateLabel, kwd, useCustodyRole, useLookups } from './shared';
import type { CusRequest, VoucherView } from './types';

const REQ_TONE = { pending: 'warn', accountant: 'warn', signing: 'info', approved: 'ok', rejected: 'bad', cancelled: 'neutral' } as const;

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
        <ListRow key={r.id} leading={<Avatar name={r.employeeName} />}
          title={<>{r.employeeName} · <Money fils={r.amount} /></>}
          sub={<>{relativeTime(r.createdAt)}{r.reason ? ' · ' + r.reason : ''}{r.rejectReason ? ' · ' + r.rejectReason : ''}</>}
          note={r.custodyId && <Link to={'/custody/' + r.custodyId} className="text-accent-fg no-underline">{r.custodyId}</Link>}
          badge={<Badge tone={REQ_TONE[r.status]}>{r.statusLabel}</Badge>}
          actions={staff && r.status === 'pending' ? <>
            <Button size="sm" variant="primary" icon="check" disabled={!!r.activeCustodyId} onClick={() => setOpening(r)}>{tr("فتح العهدة")}</Button>
            <Button size="sm" variant="danger-outline" icon="x" onClick={() => setRejecting(r)}>{tr("رفض")}</Button>
          </> : !staff && r.status === 'pending' ? <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate({ id: r.id })}>{tr("إلغاء الطلب")}</Button> : null} />
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
  const [signingId, setSigningId] = useState('');
  const lk = useLookups();
  const q = useApi<VoucherView[]>('cus.voucher.list', {});
  const inv = { invalidate: ['cus.voucher.list', 'cus.home'] };
  // بعد اعتماد المحاسب تُفتح نافذة رابط المدير مباشرة
  const approve = useAction<{ id: string }, VoucherView>('cus.voucher.approve', { ...inv, success: tr("اعتمدتَ السند، وهو الآن بانتظار اعتماد المدير"), onSuccess: (v) => setSigningId(v.id) });
  const signing = (q.data || []).find((v) => v.id === signingId) || null;
  const reject = useAction('cus.voucher.reject', { ...inv, success: tr("رُفض الطلب"), silentError: true });
  const cancel = useAction('cus.voucher.cancel', { ...inv, success: tr("أُلغي السند"), silentError: true });
  const rows = useMemo(() => (q.data || []).filter((v) => (!type || v.type === type) && (!search || (v.number + ' ' + v.partyName + ' ' + v.reason).includes(search.trim()))), [q.data, type, search]);
  const t = useTable(rows, { sort: { key: 'date', dir: 'desc' } });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
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
          <DataTable sticky sort={t.sort} onSort={t.onSort} pager={<Pager {...t.pager} />} minWidth={900}
            head={[{ key: 'number', label: tr("السند") }, { key: 'date', label: tr("التاريخ") }, { key: 'partyName', label: tr("الطرف") }, { key: 'reason', label: tr("البيان") }, { key: 'amount', label: tr("المبلغ") }, { key: 'statusLabel', label: tr("الحالة") }, '']}>
            {t.rows.map((v) => (
              <tr key={v.id}>
                <td><span className="font-semibold">{v.typeLabel}</span><div className="text-[12px] text-muted num">{v.number || '—'}</div></td>
                <td className="num whitespace-nowrap">{dateLabel(v.date)}</td>
                <td>{v.partyName}</td>
                <td className="max-w-[280px]"><div className="truncate" title={v.reason}>{v.reason}</div>{v.custodyId && <Link to={'/custody/' + v.custodyId} className="text-[12px] text-accent-fg no-underline">{v.custodyId}</Link>}</td>
                <td><Money fils={v.amount} strong /></td>
                <td>
                  <Badge tone={V_TONE[v.status]}>{v.statusLabel}</Badge>
                  {v.status === 'requested' && !v.canApprove && lk.data?.companyAccountantName && <div className="mt-1 text-[12px] text-muted">{tr("يعتمده {0}", lk.data.companyAccountantName)}</div>}
                  {v.status === 'signing' && v.signLink && <div className="mt-1 text-[12px] text-muted">{v.signLink.status === 'open' ? tr("أُرسل الرابط للمدير") : v.signLink.status === 'rejected' ? tr("رفض المدير: {0}", v.signLink.rejectReason) : v.signLink.status === 'expired' ? tr("انتهت صلاحية الرابط") : ''}</div>}
                  {v.status === 'active' && <div className="mt-1 text-[12px] text-muted">{v.signed ? tr("اعتمده المدير") : tr("بلا توقيع المدير (قبل التحديث)")}</div>}
                </td>
                <td className="text-left whitespace-nowrap">
                  {v.number && <Link to={'/custody/print/voucher/' + v.id} className="inline-flex min-h-11 items-center gap-1 px-2 text-accent-fg no-underline sm:min-h-8"><Icon name="printer" size={16} />{tr("طباعة")}</Link>}
                  {v.canApprove && <Button size="sm" variant="ghost" icon="check" loading={approve.isPending} onClick={() => approve.mutate({ id: v.id })}>{tr("اعتماد المحاسب")}</Button>}
                  {staff && v.status === 'signing' && <Button size="sm" variant="secondary" icon="key" onClick={() => setSigningId(v.id)}>{tr("رابط المدير")}</Button>}
                  {v.canApprove && <Button size="sm" variant="ghost" icon="x" onClick={() => setActing({ v, kind: 'reject' })}>{tr("رفض")}</Button>}
                  {(admin && (v.status === 'active' || v.status === 'signing' || v.status === 'requested')) && <Button size="sm" variant="ghost" icon="trash" onClick={() => setActing({ v, kind: 'cancel' })}>{tr("إلغاء السند")}</Button>}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
      <VoucherFormDialog open={!!form} request={form === 'request'} onClose={() => setForm('')} />
      <Dialog open={!!signing} onClose={() => setSigningId('')} title={tr("اعتماد المدير")}>
        {signing && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5 rounded-lg bg-chip px-3 py-2.5">
              <b>{signing.typeLabel} <span className="num">{signing.number}</span></b>
              <span className="text-[13px] text-muted">{tr("{0} · {1} · اعتمده {2}", signing.partyName, kwd(signing.amount), signing.approvedByName)}</span>
            </div>
            {signing.status === 'signing' ? <>
              <p className="m-0 text-[13px] text-muted">{tr("أنشئ رابطاً وأرسله للمدير. بعد توقيعه يصبح السند سارياً.")}</p>
              <SignActions kind="voucher" id={signing.id} info={signing.signLink} />
            </> : <p className="m-0 text-ok">{tr("اعتمده المدير، والسند ساري.")}</p>}
          </div>
        )}
      </Dialog>
      <ReasonDialog open={!!acting} onClose={() => setActing(null)} title={acting?.kind === 'reject' ? tr("رفض طلب السند") : tr("إلغاء السند")}
        label={acting?.kind === 'reject' ? tr("سبب الرفض") : tr("سبب الإلغاء")} confirmLabel={acting?.kind === 'reject' ? tr("رفض") : tr("إلغاء السند")} danger
        onConfirm={(reason) => (acting!.kind === 'reject' ? reject : cancel).mutateAsync({ id: acting!.v.id, reason })} />
    </div>
  );
}
