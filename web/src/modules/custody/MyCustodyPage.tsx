import { useState } from 'react';
import { Link } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useAction, useApi } from '../../lib/useApi';
import { relativeTime } from '../../lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { TextInput } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { BalanceBar, Money, StatusBadge, dateLabel, kwd, toInput, useCustodyRole } from './shared';
import type { CusHome, CustodyView } from './types';

/** صاحب العهدة: عهدته الحالية، وطلب عهدة جديدة، وعهده السابقة */
export default function MyCustodyPage() {
  const home = useApi<CusHome>('cus.home');
  const list = useApi<CustodyView[]>('cus.list', {});
  const { staff } = useCustodyRole();
  const [asking, setAsking] = useState(false);
  if (home.isError) return <ErrorBox message={(home.error as Error).message} onRetry={() => home.refetch()} />;
  if (!home.data) return <Loader />;
  const h = home.data;
  if (!h.isHolder) {
    return <Card><EmptyState title={tr("حسابك غير مرتبط بملف موظف")} body={staff ? tr("كمحاسب، تجد كل العهد في «كل العهد».") : tr("العهد تُفتح للموظفين المسجلين في الدليل. تواصل مع الموارد البشرية.")} /></Card>;
  }
  const c = h.myCustody, r = h.myRequest;
  const history = (list.data || []).filter((x) => x.id !== c?.id);
  return (
    <div className="flex flex-col gap-4">
      {c ? (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-[18px] font-bold">{c.periodLabel}</h2>
            <span className="text-muted num">{c.id}</span>
            <StatusBadge c={c} />
            <Link to={'/custody/' + c.id} className="ms-auto inline-flex items-center gap-1 font-semibold text-accent-fg no-underline">{tr("فتح العهدة")}<Icon name="chevron" size={16} /></Link>
          </div>
          <BalanceBar c={c} />
          {c.rejectReason && c.status === 'open' && <div className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{tr("رُفض طلب الإقفال: {0}", c.rejectReason)}</div>}
          {c.stage === 'disbursing' && <div className="rounded-lg bg-warn-bg px-3 py-2.5 text-warn">{tr("وقّعت الإدارة سند الصرف. افتح العهدة وأكّد استلام المبلغ لتبدأ تسجيل المصروفات.")}</div>}
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <CardHeader title={tr("لا توجد لديك عهدة مفتوحة")} />
          {r?.status === 'pending' ? (
            <div className="flex flex-wrap items-center gap-3 px-5 pb-5">
              <Badge tone="warn">{r.statusLabel}</Badge>
              <span>{tr("طلبت عهدة بمبلغ {0} {1}", kwd(r.amount), relativeTime(r.createdAt))}</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 px-5 pb-5">
              {r?.status === 'rejected' && <span className="text-bad">{tr("رُفض طلبك الأخير: {0}", r.rejectReason)}</span>}
              <Button variant="primary" icon="plus" onClick={() => setAsking(true)}>{tr("طلب عهدة جديدة")}</Button>
            </div>
          )}
        </Card>
      )}

      <Card padded={false}>
        <CardHeader title={tr("عهدي السابقة")} />
        {list.isPending ? <Loader /> : history.length === 0 ? <EmptyState title={tr("لا عهد سابقة")} /> : history.map((x) => (
          <Link key={x.id} to={'/custody/' + x.id} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3 text-fg no-underline hover:bg-chip/40">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{x.periodLabel} <span className="text-[13px] font-normal text-muted num">{x.id}</span></span>
              <span className="text-[13px] text-muted">{dateLabel(x.openDate)} · {tr("المصروف")} <Money fils={x.totalSpent} /></span>
            </span>
            <span className="flex flex-col items-end gap-1"><StatusBadge c={x} /><Money fils={x.remaining} className="text-[13px]" /></span>
          </Link>
        ))}
      </Card>
      <RequestDialog open={asking} onClose={() => setAsking(false)} amount={h.defaultAmount} />
    </div>
  );
}

function RequestDialog({ open, onClose, amount }: { open: boolean; onClose: () => void; amount: number }) {
  const [f, setF] = useState({ amount: toInput(amount), reason: '' });
  const [error, setError] = useState('');
  const act = useAction('cus.request.create', { invalidate: ['cus.home', 'cus.request.list'], success: tr("أُرسل الطلب إلى المحاسب"), silentError: true, onSuccess: onClose });
  return (
    <Dialog open={open} onClose={onClose} title={tr("طلب عهدة جديدة")}
      footer={<><Button variant="primary" className="flex-1" loading={act.isPending} onClick={() => { setError(''); act.mutate(f, { onError: (e) => setError(e.message) }); }}>{tr("إرسال الطلب")}</Button>
        <Button variant="ghost" onClick={onClose}>{tr("إلغاء")}</Button></>}>
      <div className="flex flex-col gap-3">
        <TextInput label={tr("المبلغ المطلوب (د.ك)")} inputMode="decimal" ltr value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <TextInput label={tr("السبب (اختياري)")} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={300} />
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}
