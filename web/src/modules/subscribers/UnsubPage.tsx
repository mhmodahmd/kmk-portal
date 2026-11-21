import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tr } from '../../lib/i18n';
import { api, ApiError } from '../../lib/api';
import { Card, EmptyState, Loader } from '../../ui/Display';
import { Button } from '../../ui/Button';

interface UnsubView { platformName: string; optedOut: boolean }

/** صفحة «إيقاف الرسائل» من رابط البريد (بلا حساب): الرمز في الرابط هو الصلاحية */
export default function UnsubPage({ token }: { token: string }) {
  const q = useQuery({ queryKey: ['sub.unsub.view', token], queryFn: () => api<UnsubView>('sub.unsub.view', { token }), retry: false, gcTime: 0 });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    setBusy(true); setError('');
    try { await api('sub.unsub.confirm', { token }); setDone(true); }
    catch (e) { setError(e instanceof ApiError ? e.message : tr("تعذّر الإرسال. حاول مرة أخرى.")); }
    finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto w-full max-w-[520px]">
        {q.isPending ? <Loader /> : q.isError ? (
          <Card><EmptyState title={tr("لا يمكن فتح الرابط")} body={(q.error as Error).message} /></Card>
        ) : done || q.data.optedOut ? (
          <Card><EmptyState title={tr("أُوقفت الرسائل")} body={tr("لن تصلك رسائل التذكير من {0} بعد الآن.", q.data.platformName)} /></Card>
        ) : (
          <Card className="flex flex-col gap-4">
            <h1 className="m-0 text-[20px] font-semibold">{tr("إيقاف رسائل {0}", q.data.platformName)}</h1>
            <p className="m-0 text-[15px]">{tr("بالضغط على الزر لن تصلك رسائل التذكير بانتهاء الاشتراك أو التجديد.")}</p>
            {error && <p className="m-0 text-[13px] text-bad">{error}</p>}
            <div><Button variant="primary" loading={busy} onClick={confirm}>{tr("إيقاف الرسائل")}</Button></div>
          </Card>
        )}
      </div>
    </div>
  );
}
