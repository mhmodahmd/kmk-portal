import { tr } from '../../lib/i18n';
import { useEffect, useState } from 'react';
import type { RecordRow } from '../../lib/types';
import { dmy, formatTime, hm, kwDate, kwMonth } from '../../lib/format';
import { useAction, useApi } from '../../lib/useApi';
import { Badge, Card, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { DataTable, MonthPicker } from '../../ui/Controls';
import { Button } from '../../ui/Button';
import { Select, TextInput, Textarea } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { ReasonDialog } from '../../ui/Decide';
import { Icon } from '../../ui/Icon';
import { MapLink } from './shared';

interface Records { month: string; rows: RecordRow[]; people: { id: string; name: string }[]; canEdit: boolean }
const toHm = (iso: string) => (iso ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '');

export default function RecordsPage() {
  const [month, setMonth] = useState(kwMonth());
  const [emp, setEmp] = useState('');
  const [editing, setEditing] = useState<Partial<RecordRow> | null>(null);
  const [deleting, setDeleting] = useState<RecordRow | null>(null);
  const q = useApi<Records>('att.records', { month, employeeId: emp }, { placeholderData: (p) => p });
  const d = q.data;
  const del = useAction('att.record.delete', { invalidate: ['att.records', 'att.board', 'att.report'], success: tr("حُذف التسجيل") });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <MonthPicker value={month} onChange={setMonth} max={kwMonth()} />
        <Select label={tr("الموظف")} className="w-[220px]" value={emp} onChange={(e) => setEmp(e.target.value)}
          options={[{ value: '', label: tr("كل الموظفين") }, ...(d?.people || []).map((p) => ({ value: p.id, label: p.name }))]} />
        <span className="flex-1" />
        {d?.canEdit && <Button variant="primary" icon="plus" onClick={() => setEditing({ employeeId: emp, date: kwDate() })}>{tr("تسجيل يدوي")}</Button>}
      </div>
      {q.isError && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {!d ? <Loader /> : (
        <Card padded={false} className="overflow-hidden">
          {d.rows.length === 0 ? <EmptyState title={tr("لا تسجيلات في هذا الشهر")} /> : (
            <DataTable head={[tr("الموظف"), tr("اليوم"), tr("الحضور"), tr("الانصراف"), tr("المدة"), tr("المصدر"), tr("الموقع"), '']} minWidth={900}>
              {d.rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-semibold">{r.name}</td>
                  <td className="whitespace-nowrap">{r.dayName} <span className="text-muted num">{dmy(r.date)}</span></td>
                  <td className="num">{formatTime(r.inTs)}</td>
                  <td className="num">{r.outTs ? formatTime(r.outTs) : <Badge tone="warn">{tr("مفتوح")}</Badge>}</td>
                  <td className="num ltr text-right">{r.outTs ? hm(r.minutes) : '—'}</td>
                  <td>
                    {r.source === 'app' && !r.edited ? <span className="inline-flex items-center gap-1 text-muted">{(r.inVerified || r.outVerified) && <Icon name="fingerprint" size={16} />}{r.inVerified || r.outVerified ? tr("بصمة الجهاز") : tr("البصمة")}</span> :
                      <span title={r.note} className="flex flex-col"><Badge tone="info">{r.source === 'correction' ? tr("تصحيح") : r.source === 'manual' ? tr("يدوي") : tr("معدّل")}</Badge><span className="text-[12px] text-muted">{r.editedBy}</span></span>}
                  </td>
                  <td><MapLink loc={r.inLoc} /></td>
                  <td className="text-left whitespace-nowrap">
                    {d.canEdit && <>
                      <button type="button" aria-label={tr("تعديل")} title={tr("تعديل")} onClick={() => setEditing(r)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-chip hover:text-fg cursor-pointer"><Icon name="edit" size={17} /></button>
                      <button type="button" aria-label={tr("حذف")} title={tr("حذف")} onClick={() => setDeleting(r)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-bad-bg hover:text-bad cursor-pointer"><Icon name="trash" size={17} /></button>
                    </>}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      )}
      <RecordDialog record={editing} people={d?.people || []} onClose={() => setEditing(null)} />
      <ReasonDialog open={!!deleting} onClose={() => setDeleting(null)} title={tr("حذف تسجيل")} label={tr("سبب الحذف")} confirmLabel={tr("حذف التسجيل")} danger
        onConfirm={(note) => del.mutateAsync({ id: deleting!.id, note })}>
        {deleting && <p className="m-0 text-muted">{tr("تسجيل")} <b className="text-fg">{deleting.name}</b> {tr("يوم")} {dmy(deleting.date)} ({formatTime(deleting.inTs)}{tr("). يبقى الحذف مسجّلاً في سجل العمليات.")}</p>}
      </ReasonDialog>
    </div>
  );
}

function RecordDialog({ record, people, onClose }: { record: Partial<RecordRow> | null; people: { id: string; name: string }[]; onClose: () => void }) {
  const [f, setF] = useState({ id: '', employeeId: '', date: '', inTime: '', outTime: '', note: '' });
  const [error, setError] = useState('');
  useEffect(() => {
    if (record) setF({ id: record.id || '', employeeId: record.employeeId || '', date: record.date || kwDate(), inTime: toHm(record.inTs || ''), outTime: toHm(record.outTs || ''), note: '' });
    setError('');
  }, [record]);
  const save = useAction('att.record.save', { invalidate: ['att.records', 'att.board', 'att.report'], success: tr("حُفظ التسجيل"), silentError: true, onSuccess: onClose });
  return (
    <Dialog open={!!record} onClose={onClose} title={f.id ? tr("تعديل تسجيل") : tr("تسجيل حضور يدوي")}
      footer={<><Button variant="primary" className="flex-1" loading={save.isPending} onClick={() => { setError(''); save.mutate(f, { onError: (e) => setError(e.message) }); }}>{tr("حفظ")}</Button><Button variant="ghost" onClick={onClose}>{tr("إلغاء")}</Button></>}>
      <div className="flex flex-col gap-3">
        <Select label={tr("الموظف")} value={f.employeeId} disabled={!!f.id} onChange={(e) => setF({ ...f, employeeId: e.target.value })}
          options={[{ value: '', label: tr("اختر الموظف") }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
        <TextInput label={tr("اليوم")} type="date" max={kwDate()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <TextInput label={tr("الحضور")} type="time" value={f.inTime} onChange={(e) => setF({ ...f, inTime: e.target.value })} />
          <TextInput label={tr("الانصراف")} type="time" value={f.outTime} onChange={(e) => setF({ ...f, outTime: e.target.value })} hint={tr("بعد منتصف الليل يُحسب لليوم التالي")} />
        </div>
        <Textarea label={tr("سبب التعديل")} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} hint={tr("يظهر في السجل وسجل العمليات")} />
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}

