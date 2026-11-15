import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { ApiError } from '../../lib/api';
import { useAction, useApi } from '../../lib/useApi';
import { formatDateTime } from '../../lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { DataTable } from '../../ui/Controls';
import { Checkbox, Select, TextInput, Textarea } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { ReasonDialog } from '../../ui/Decide';
import { Icon } from '../../ui/Icon';
import { BalanceBar, ExpenseDialog, Money, SignActions, StageBar, StatusBadge, V_TONE, dateLabel, kwd, useLookups } from './shared';
import { ACCEPT, filePayload, openFile } from './files';
import { QuickTaskButton } from '../tasks/shared';
import { useToast } from '../../ui/Overlay';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { CustodyDetail, ExpenseView } from './types';

export default function CustodyDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const q = useApi<CustodyDetail>('cus.get', { id });
  const [editing, setEditing] = useState<ExpenseView | null | 'new'>(null);
  const [deleting, setDeleting] = useState<ExpenseView | null>(null);
  const [noting, setNoting] = useState<ExpenseView | null>(null);
  const [closing, setClosing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const inv = ['cus.get', 'cus.list', 'cus.home'];
  const receive = useAction('cus.confirmReceipt', { invalidate: inv, success: tr("تم تأكيد استلام العهدة") });
  const del = useAction('cus.expense.delete', { invalidate: inv, success: tr("حُذف البند"), silentError: true });
  const lk = useLookups();
  const toast = useToast();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState('');
  const view = (action: string, p: Record<string, unknown>, fallback?: string) => openFile(action, p, fallback).catch((e) => toast(e instanceof ApiError ? e.message : tr("تعذّر فتح الملف."), 'bad'));
  const attach = async (expenseId: string, file?: File) => {
    if (!file) return;
    setUploading(expenseId);
    try { await api('cus.attachment.upload', { expenseId, ...(await filePayload(file)) }); toast(tr("أُرفق الملف")); await qc.invalidateQueries({ queryKey: ['cus.get'] }); }
    catch (e) { toast(e instanceof Error ? e.message : tr("تعذّر رفع الملف."), 'bad'); }
    finally { setUploading(''); }
  };
  const unattach = useAction('cus.attachment.delete', { invalidate: ['cus.get'], success: tr("حُذف المرفق") });
  const reject = useAction('cus.reject', { invalidate: inv, success: tr("رُفض الإقفال وأُعيدت العهدة للموظف"), silentError: true });
  const remove = useAction('cus.delete', { invalidate: ['cus.list', 'cus.home'], success: tr("حُذفت العهدة"), silentError: true, onSuccess: () => nav('/custody/all') });

  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  const { custody: c, can, stages, expenses, vouchers } = q.data;
  const openVoucher = vouchers.find((v) => v.id === c.openVoucherId);
  let n = 0;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 text-[20px] font-bold">{c.periodLabel}</h2>
          <span className="text-muted num">{c.id}</span>
          <StatusBadge c={c} />
          {c.isImported && <Badge>{tr("مستوردة")}</Badge>}
          <div className="ms-auto flex flex-wrap gap-2 no-print">
            <Link to={'/custody/print/statement/' + c.id} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 font-medium text-fg no-underline hover:border-line-strong"><Icon name="printer" size={16} />{tr("كشف التسوية")}</Link>
            <QuickTaskButton variant="secondary" draft={{ linkedType: 'custody', linkedId: c.id, linkedLabel: c.id + ' · ' + c.employeeName }} />
            {can.delete && <Button size="sm" variant="danger-outline" icon="trash" onClick={() => setRemoving(true)}>{tr("حذف")}</Button>}
          </div>
        </div>
        <span className="text-muted">{c.employeeName} · {tr("فُتحت {0}", dateLabel(c.openDate))}{c.previousCustodyId ? ' · ' + tr("تلي {0}", c.previousCustodyId) : ''}</span>
        <BalanceBar c={c} />
        {q.data.requestReason && <div className="rounded-lg bg-bg px-3 py-2.5 text-[13px]">{tr("سبب الطلب: {0}", q.data.requestReason)}</div>}
        {c.notes && <div className="rounded-lg bg-bg px-3 py-2.5 text-[13px] text-muted">{c.notes}</div>}
        {c.rejectReason && c.status === 'open' && <div className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{tr("رُفض طلب الإقفال: {0}", c.rejectReason)}</div>}
        {c.closeNote && c.status !== 'open' && <div className="rounded-lg bg-bg px-3 py-2.5 text-[13px]">{tr("ملاحظة الإقفال: {0}", c.closeNote)}</div>}

        <div className="flex flex-wrap gap-2 no-print">
          {can.confirmReceipt && <Button variant="primary" icon="check" loading={receive.isPending} onClick={() => receive.mutate({ id: c.id })}>{tr("تأكيد استلام العهدة")}</Button>}
          {can.edit && <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>{tr("إضافة بند")}</Button>}
          {can.requestClose && <Button icon="logoutArrow" onClick={() => setClosing(true)}>{tr("طلب الإقفال")}</Button>}
          {can.review && <Button variant="primary" icon="check" onClick={() => setApproving(true)}>{tr("اعتماد الإقفال")}</Button>}
          {can.review && <Button variant="danger-outline" icon="x" onClick={() => setRejecting(true)}>{tr("رفض")}</Button>}
        </div>
        {can.signOpen && openVoucher && (
          <div className="flex flex-col gap-2 rounded-lg border border-line p-3 no-print">
            <span className="font-semibold">{tr("سند الصرف {0} بانتظار موافقة الإدارة", openVoucher.number)}</span>
            <SignActions kind="voucher" id={openVoucher.id} info={q.data.signLinks.openVoucher} />
          </div>
        )}
        {can.signStatement && (
          <div className="flex flex-col gap-2 rounded-lg border border-line p-3 no-print">
            <span className="font-semibold">{tr("كشف التسوية بانتظار توقيع الإدارة")}</span>
            <SignActions kind="statement" id={c.id} info={q.data.signLinks.statement} />
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-start gap-4">
        <Card padded={false} className="min-w-0 flex-[3_1_560px]">
          <CardHeader title={tr("البنود ({0})", expenses.length)} />
          {expenses.length === 0 ? <EmptyState title={tr("لا بنود بعد")} body={can.edit ? tr("سجّل كل مصروف فور حدوثه مع صورة الفاتورة أو سبب عدم وجودها.") : undefined} /> : (
            <DataTable head={['#', tr("التاريخ"), tr("البيان"), tr("التصنيف"), tr("المبلغ"), '']} minWidth={720}>
              {expenses.map((e) => {
                if (e.entryType === 'expense') n++;
                return (
                  <tr key={e.id} className="align-top">
                    <td className="num text-muted">{e.entryType === 'expense' ? n : '+'}</td>
                    <td className="num whitespace-nowrap">{dateLabel(e.date)}</td>
                    <td>
                      <div>{e.description}</div>
                      <div className="text-[12px] text-muted">
                        {[e.project, e.docType, e.vendor, e.invoiceNo, e.noAttachmentReason && tr("بلا مرفق: {0}", e.noAttachmentReason)].filter(Boolean).join(' · ')}
                      </div>
                      {e.attachments.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {e.attachments.map((a) => (
                            <span key={a.id} className="inline-flex items-center gap-1 rounded-md bg-chip px-2 py-0.5 text-[12px]">
                              <button type="button" className="inline-flex items-center gap-1 text-accent-fg cursor-pointer" onClick={() => view('cus.attachment.content', { id: a.id }, a.url)}>
                                <Icon name={a.isImage ? 'eye' : 'file'} size={14} />{a.fileName.replace(/^NTH-\d{4}-\d+_\d+_/, '')}
                              </button>
                              {can.edit && lk.data?.drive && <button type="button" aria-label={tr("حذف المرفق")} className="text-muted hover:text-bad cursor-pointer" onClick={() => unattach.mutate({ id: a.id })}><Icon name="x" size={12} /></button>}
                            </span>
                          ))}
                        </div>
                      )}
                      {e.reviewNote && <div className="mt-1 rounded bg-warn-bg px-2 py-1 text-[12px] text-warn">{tr("ملاحظة المحاسب: {0}", e.reviewNote)}</div>}
                    </td>
                    <td>{e.entryType === 'receipt' ? <Badge tone="info">{e.entryLabel}</Badge> : e.category}</td>
                    <td className={e.entryType === 'receipt' ? 'text-ok' : ''}><Money fils={e.entryType === 'receipt' ? e.amount : -e.amount} className={e.entryType === 'expense' ? '!text-fg' : ''} /></td>
                    <td className="text-left whitespace-nowrap no-print">
                      {can.edit && lk.data?.drive && e.entryType === 'expense' && (
                        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-accent-fg hover:bg-chip">
                          <Icon name={uploading === e.id ? 'refresh' : 'file'} size={16} />{uploading === e.id ? tr("جارٍ الرفع") : tr("إرفاق")}
                          <input type="file" accept={ACCEPT} className="sr-only" disabled={!!uploading} onChange={(ev) => { attach(e.id, ev.target.files?.[0]); ev.target.value = ''; }} />
                        </label>
                      )}
                      {can.edit && <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing(e)}>{tr("تعديل")}</Button>}
                      {can.edit && <Button size="sm" variant="ghost" icon="trash" onClick={() => setDeleting(e)}>{tr("حذف")}</Button>}
                      {can.note && <Button size="sm" variant="ghost" icon="edit" onClick={() => setNoting(e)}>{tr("ملاحظة")}</Button>}
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          )}
        </Card>

        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <h3 className="m-0 text-[15px] font-semibold">{tr("مراحل العهدة")}</h3>
            <StageBar steps={stages} />
          </Card>
          <Card padded={false}>
            <CardHeader title={tr("السندات")} />
            {vouchers.length === 0 ? <EmptyState title={tr("لا سندات")} /> : vouchers.map((v) => (
              <Link key={v.id} to={'/custody/print/voucher/' + v.id} className="flex items-center gap-3 border-t border-line px-5 py-3 text-fg no-underline hover:bg-chip/40">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{v.typeLabel} <span className="num">{v.number}</span></span>
                  <span className="text-[12px] text-muted">{v.signed ? tr("وقّعته الإدارة · {0}", v.signedByName) : tr("لم توقّعه الإدارة بعد")}</span>
                  {v.hasSignedFile && <button type="button" className="self-start text-[12px] text-accent-fg cursor-pointer" onClick={(ev) => { ev.preventDefault(); view('cus.signed.content', { kind: 'voucher', id: v.id }); }}>{tr("عرض النسخة الموقّعة")}</button>}
                </span>
                <span className="flex flex-col items-end gap-1"><Badge tone={V_TONE[v.status]}>{v.statusLabel}</Badge><Money fils={v.amount} className="text-[13px]" /></span>
              </Link>
            ))}
          </Card>
          {(c.reviewedByName || c.closeSignedAt) && (
            <Card className="flex flex-col gap-1 text-[13px]">
              {c.reviewedByName && <span>{tr("راجعها: {0} · {1}", c.reviewedByName, formatDateTime(c.reviewDate))}</span>}
              {c.settlementLabel && <span>{tr("التسوية: {0}", c.settlementLabel)}</span>}
              {c.closeSignedAt && <span>{tr("وقّع الكشف: {0} · {1}", c.closeSignedByName, formatDateTime(c.closeSignedAt))}</span>}
              {c.closeSignedNote && <span className="text-muted">{c.closeSignedNote}</span>}
              {c.hasCloseSignedFile && <button type="button" className="self-start text-accent-fg cursor-pointer" onClick={() => view('cus.signed.content', { kind: 'statement', id: c.id })}>{tr("عرض الكشف الموقّع")}</button>}
            </Card>
          )}
        </div>
      </div>

      <ExpenseDialog open={!!editing} onClose={() => setEditing(null)} custodyId={c.id} expense={editing === 'new' ? null : editing} />
      <ReasonDialog open={!!deleting} onClose={() => setDeleting(null)} title={tr("حذف بند")} label={tr("سبب الحذف (للسجل)")} confirmLabel={tr("حذف")} danger
        onConfirm={(reason) => del.mutateAsync({ id: deleting!.id, reason })}>
        <p className="m-0 text-muted">{deleting?.description} · {kwd(deleting?.amount || 0)}</p>
      </ReasonDialog>
      <NoteDialog item={noting} onClose={() => setNoting(null)} />
      <CloseDialog open={closing} onClose={() => setClosing(false)} id={c.id} overspent={c.overspent} remaining={c.remaining} />
      <ApproveDialog open={approving} onClose={() => setApproving(false)} id={c.id} remaining={c.remaining} />
      <ReasonDialog open={rejecting} onClose={() => setRejecting(false)} title={tr("رفض طلب الإقفال")} label={tr("سبب الرفض")} confirmLabel={tr("رفض وإعادتها للموظف")} danger
        onConfirm={(reason) => reject.mutateAsync({ id: c.id, reason })} />
      <DeleteCustodyDialog open={removing} onClose={() => setRemoving(false)} id={c.id} onConfirm={(p) => remove.mutateAsync(p)} />
    </div>
  );
}

function NoteDialog({ item, onClose }: { item: ExpenseView | null; onClose: () => void }) {
  const [note, setNote] = useState('');
  const act = useAction('cus.expense.note', { invalidate: ['cus.get'], success: tr("حُفظت الملاحظة"), onSuccess: onClose });
  return (
    <Dialog open={!!item} onClose={onClose} title={tr("ملاحظة على البند")}
      footer={<><Button variant="primary" className="flex-1" loading={act.isPending} onClick={() => act.mutate({ id: item!.id, note })}>{tr("حفظ")}</Button><Button variant="ghost" onClick={onClose}>{tr("إلغاء")}</Button></>}>
      <div className="flex flex-col gap-3" key={item?.id}>
        <p className="m-0 text-muted">{item?.description}</p>
        <Textarea label={tr("الملاحظة (فارغة لمسحها)")} defaultValue={item?.reviewNote} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </div>
    </Dialog>
  );
}

function CloseDialog({ open, onClose, id, overspent, remaining }: { open: boolean; onClose: () => void; id: string; overspent: boolean; remaining: number }) {
  const [note, setNote] = useState('');
  const [ack, setAck] = useState(false);
  const [error, setError] = useState('');
  const act = useAction('cus.requestClose', { invalidate: ['cus.get', 'cus.list', 'cus.home'], success: tr("أُرسل طلب الإقفال إلى المحاسب"), silentError: true, onSuccess: onClose });
  return (
    <Dialog open={open} onClose={onClose} title={tr("طلب إقفال العهدة")}
      footer={<><Button variant="primary" className="flex-1" loading={act.isPending} onClick={() => { setError(''); act.mutate({ id, closeNote: note, acknowledgeOverspend: ack }, { onError: (e) => setError(e instanceof ApiError ? e.message : tr("تعذّر الإرسال.")) }); }}>{tr("إرسال للمحاسب")}</Button>
        <Button variant="ghost" onClick={onClose}>{tr("إلغاء")}</Button></>}>
      <div className="flex flex-col gap-3">
        <p className="m-0">{tr("بعد الإرسال تُقفل العهدة للتعديل حتى يعتمدها المحاسب أو يعيدها. المتبقي:")} <Money fils={remaining} strong /></p>
        {overspent && <Checkbox label={tr("أؤكد أن المصروفات تجاوزت المبلغ المتاح")} checked={ack} onChange={setAck} />}
        <Textarea label={tr("ملاحظة للمحاسب (اختياري)")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}

function ApproveDialog({ open, onClose, id, remaining }: { open: boolean; onClose: () => void; id: string; remaining: number }) {
  const lk = useLookups();
  const [f, setF] = useState({ settlementMethod: 'carry', paymentMethod: 'cash', chequeNo: '' });
  const [error, setError] = useState('');
  const act = useAction('cus.approve', { invalidate: ['cus.get', 'cus.list', 'cus.home', 'cus.voucher.list'], success: tr("اعتُمد الإقفال وينتظر توقيع الإدارة على الكشف"), silentError: true, onSuccess: onClose });
  const voucherText = remaining > 0 ? tr("سند قبض بالمتبقي {0} من الموظف", kwd(remaining)) : remaining < 0 ? tr("سند صرف بالتجاوز {0} للموظف", kwd(-remaining)) : tr("لا سند: الرصيد صفر");
  return (
    <Dialog open={open} onClose={onClose} title={tr("اعتماد إقفال العهدة")}
      footer={<><Button variant="primary" className="flex-1" loading={act.isPending} onClick={() => { setError(''); act.mutate({ id, ...f }, { onError: (e) => setError(e.message) }); }}>{tr("اعتماد")}</Button>
        <Button variant="ghost" onClick={onClose}>{tr("إلغاء")}</Button></>}>
      <div className="flex flex-col gap-3">
        <p className="m-0">{tr("المتبقي في العهدة:")} <Money fils={remaining} strong /></p>
        <Select label={tr("طريقة التسوية")} value={f.settlementMethod} onChange={(e) => setF({ ...f, settlementMethod: e.target.value })}
          options={[{ value: 'carry', label: tr("ترحيل الرصيد إلى العهدة التالية") }, { value: 'voucher', label: voucherText }]} />
        {f.settlementMethod === 'voucher' && remaining !== 0 && (
          <div className="grid grid-cols-2 gap-3">
            <Select label={tr("طريقة الدفع")} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })} options={(lk.data?.paymentMethods || []).map((m) => ({ value: m.id, label: m.label }))} />
            {f.paymentMethod === 'cheque' && <TextInput label={tr("رقم الشيك")} value={f.chequeNo} onChange={(e) => setF({ ...f, chequeNo: e.target.value })} />}
          </div>
        )}
        <p className="m-0 text-[13px] text-muted">{tr("بعد الاعتماد يُرسل كشف التسوية للإدارة لتوقيعه، ثم تُغلق العهدة نهائياً.")}</p>
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}

function DeleteCustodyDialog({ open, onClose, id, onConfirm }: { open: boolean; onClose: () => void; id: string; onConfirm: (p: Record<string, unknown>) => Promise<unknown> }) {
  const [confirmId, setConfirmId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} title={tr("حذف العهدة نهائياً")}
      footer={<><Button variant="danger" className="flex-1" loading={busy} onClick={async () => {
        setBusy(true); setError('');
        try { await onConfirm({ id, confirmId, reason }); onClose(); } catch (e) { setError(e instanceof ApiError ? e.message : tr("تعذّر الحذف.")); } finally { setBusy(false); }
      }}>{tr("حذف نهائي")}</Button><Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-bad">{tr("تُحذف العهدة مع بنودها وسنداتها، ويبقى ملخصها في سجل العمليات.")}</p>
        <TextInput label={tr("اكتب رقم العهدة للتأكيد ({0})", id)} ltr value={confirmId} onChange={(e) => setConfirmId(e.target.value)} />
        <Textarea label={tr("سبب الحذف")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}
