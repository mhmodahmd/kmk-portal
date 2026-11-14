import { tr } from '../lib/i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../lib/api';
import { Button } from './Button';
import { Textarea } from './Field';
import { Dialog } from './Overlay';

/**
 * نافذة قرار (اعتماد أو رفض) مع ملاحظة. الرفض يتطلب سبباً.
 * onDecide يعيد Promise، والخطأ يظهر داخل النافذة.
 */
export function DecideDialog({ open, onClose, title, children, onDecide, approveLabel = tr("اعتماد"), rejectLabel = tr("رفض"), initial = 'approve' }: {
  open: boolean; onClose: () => void; title: string; children?: ReactNode;
  onDecide: (approve: boolean, note: string) => Promise<unknown>;
  approveLabel?: string; rejectLabel?: string; initial?: 'approve' | 'reject';
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  useEffect(() => { if (open) { setNote(''); setError(''); setBusy(null); } }, [open]);

  const go = async (approve: boolean) => {
    if (!approve && !note.trim()) { setError(tr("اكتب سبب الرفض ليصل إلى صاحب الطلب.")); return; }
    setError(''); setBusy(approve ? 'approve' : 'reject');
    try { await onDecide(approve, note.trim()); onClose(); }
    catch (e) { setError(e instanceof ApiError ? e.message : tr("تعذّر حفظ القرار.")); }
    finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onClose={onClose} title={title}
      footer={<>
        <Button variant="primary" icon="check" className="flex-1" loading={busy === 'approve'} disabled={!!busy} onClick={() => go(true)}>{approveLabel}</Button>
        <Button variant="danger-outline" icon="x" className="flex-1" loading={busy === 'reject'} disabled={!!busy} onClick={() => go(false)}>{rejectLabel}</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {children}
        <Textarea label={initial === 'reject' ? tr("سبب الرفض") : tr("ملاحظة (مطلوبة عند الرفض)")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}

/** تأكيد إجراء مع سبب إلزامي (حذف، إلغاء) */
export function ReasonDialog({ open, onClose, title, label, confirmLabel, danger, onConfirm, children }: {
  open: boolean; onClose: () => void; title: string; label: string; confirmLabel: string; danger?: boolean;
  onConfirm: (reason: string) => Promise<unknown>; children?: ReactNode;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setReason(''); setError(''); setBusy(false); } }, [open]);
  const go = async () => {
    if (!reason.trim()) { setError(tr("اكتب السبب.")); return; }
    setBusy(true); setError('');
    try { await onConfirm(reason.trim()); onClose(); }
    catch (e) { setError(e instanceof ApiError ? e.message : tr("تعذّر تنفيذ الإجراء.")); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={title}
      footer={<>
        <Button variant={danger ? 'danger' : 'primary'} className="flex-1" loading={busy} onClick={go}>{confirmLabel}</Button>
        <Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {children}
        <Textarea label={label} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}
