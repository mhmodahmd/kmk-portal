import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tr } from '../../lib/i18n';
import { api, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { Card, EmptyState, Loader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Textarea } from '../../ui/Field';
import { SignaturePad } from '../../ui/SignaturePad';
import { StatementDocument, VoucherDocument } from './Documents';
import { kwd } from './shared';
import type { StatementDoc, VoucherDoc } from './types';

interface SignViewData { kind: 'voucher' | 'statement'; kindLabel: string; title: string; amount: number; managerName: string; expiresAt: string; doc: VoucherDoc | StatementDoc }

/** صفحة توقيع المدير (بلا حساب): الرمز السرّي في الرابط هو الصلاحية */
export default function SignPage({ token }: { token: string }) {
  const q = useQuery({ queryKey: ['cus.sign.view', token], queryFn: () => api<SignViewData>('cus.sign.view', { token }), retry: false, gcTime: 0 });
  const [sig, setSig] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const go = async (action: 'cus.sign.submit' | 'cus.sign.reject', p: Record<string, unknown>) => {
    setBusy(true); setError('');
    try { const r = await api<{ message: string }>(action, { token, ...p }); setDone(r.message); }
    catch (e) { setError(e instanceof ApiError ? e.message : tr("تعذّر الإرسال. حاول مرة أخرى.")); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-bg px-4 py-6">
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4">
        {q.isPending ? <Loader /> : q.isError ? (
          <Card><EmptyState title={tr("لا يمكن فتح الرابط")} body={(q.error as Error).message} /></Card>
        ) : done ? (
          <Card><EmptyState title={done} body={tr("يمكنك إغلاق هذه الصفحة.")} /></Card>
        ) : (
          <>
            <Card className="flex flex-col gap-1">
              <h1 className="m-0 text-[20px] font-bold">{q.data.title}</h1>
              <span className="text-muted">{tr("بمبلغ {0} · بانتظار توقيع {1} · الرابط صالح حتى {2}", kwd(q.data.amount), q.data.managerName, formatDateTime(q.data.expiresAt))}</span>
            </Card>
            <div className="overflow-x-auto rounded-xl border border-line">
              {q.data.kind === 'voucher' ? <VoucherDocument doc={q.data.doc as VoucherDoc} /> : <StatementDocument doc={q.data.doc as StatementDoc} />}
            </div>
            <Card className="flex flex-col gap-3">
              {!rejecting ? (
                <>
                  <h2 className="m-0 text-[16px] font-semibold">{tr("توقيعك")}</h2>
                  <SignaturePad onChange={setSig} />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" icon="check" className="flex-1" disabled={!sig} loading={busy} onClick={() => go('cus.sign.submit', { data: sig })}>{tr("اعتماد وتوقيع")}</Button>
                    <Button variant="danger-outline" icon="x" onClick={() => setRejecting(true)}>{tr("رفض")}</Button>
                  </div>
                </>
              ) : (
                <>
                  <Textarea label={tr("سبب الرفض")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
                  <div className="flex gap-2">
                    <Button variant="danger" className="flex-1" loading={busy} onClick={() => go('cus.sign.reject', { reason })}>{tr("إرسال الرفض")}</Button>
                    <Button variant="ghost" onClick={() => setRejecting(false)}>{tr("تراجع")}</Button>
                  </div>
                </>
              )}
              {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
