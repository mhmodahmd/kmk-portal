/** «ملفي»: تفويض مراحل السلاسل الإجرائية لزميل مدة محددة (المرحلة 5) */
import { useState } from 'react';
import { tr } from '../../lib/i18n';
import { useAction, useApi } from '../../lib/useApi';
import { dmy, kwDate } from '../../lib/format';
import { Badge, Card, Loader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Select, TextInput } from '../../ui/Field';
import type { WfLookups } from './types';

interface Deleg { id: string; fromName: string; toName: string; from: string; to: string; reason: string; active: boolean; current: boolean }

export default function DelegationCard() {
  const q = useApi<{ given: Deleg[]; received: Deleg[] }>('wf.delegation.mine');
  const lk = useApi<WfLookups>('wf.lookups', { module: 'correspondence' }, { staleTime: 5 * 60_000 });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ toUserId: '', from: kwDate(), to: kwDate(), reason: '' });
  const [error, setError] = useState('');
  const save = useAction<typeof f>('wf.delegation.save', { invalidate: ['wf.delegation.mine'], success: tr("فُعّل التفويض"), silentError: true, onSuccess: () => setOpen(false) });
  const end = useAction<{ id: string }>('wf.delegation.end', { invalidate: ['wf.delegation.mine'], success: tr("أُنهي التفويض") });
  const active = (q.data?.given || []).find((d) => d.active);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col">
        <h2 className="m-0 text-[16px] font-semibold">{tr("التفويض")}</h2>
        <span className="text-[13px] text-muted">{tr("في إجازتك يقرر زميلك في مراحل السلاسل الإجرائية بدلاً منك، ويُسجَّل قراره «نيابةً عنك». لا يفوّض هو غيره.")}</span>
      </div>
      {!q.data ? <Loader /> : (
        <>
          {active ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent-soft px-3 py-2.5 text-[13px]">
              <Badge tone={active.current ? 'ok' : 'info'}>{active.current ? tr("ساري") : tr("مجدول")}</Badge>
              <span className="flex-1">{tr("إلى {0} من {1} إلى {2}", active.toName, dmy(active.from), dmy(active.to))}{active.reason ? ' · ' + active.reason : ''}</span>
              <Button size="sm" variant="ghost" loading={end.isPending} onClick={() => end.mutate({ id: active.id })}>{tr("إنهاء")}</Button>
            </div>
          ) : !open && <Button size="sm" icon="user" className="self-start" onClick={() => { setError(''); setOpen(true); }}>{tr("تفويض زميل")}</Button>}
          {open && (
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); setError(''); save.mutate(f, { onError: (x) => setError(x.message) }); }}>
              <Select label={tr("إلى")} required value={f.toUserId} onChange={(e) => setF({ ...f, toUserId: e.target.value })} options={[{ value: '', label: tr("اختر") }, ...(lk.data?.people || []).map((p) => ({ value: p.id, label: p.name }))]} />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput label={tr("من")} type="date" ltr required value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
                <TextInput label={tr("إلى تاريخ")} type="date" ltr required value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
              </div>
              <TextInput label={tr("السبب (اختياري)")} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={200} placeholder={tr("إجازة سنوية…")} />
              {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
              <div className="flex gap-2"><Button type="submit" variant="primary" className="flex-1" loading={save.isPending}>{tr("تفعيل التفويض")}</Button><Button variant="ghost" onClick={() => setOpen(false)}>{tr("تراجع")}</Button></div>
            </form>
          )}
          {(q.data.received || []).filter((d) => d.active).map((d) => (
            <div key={d.id} className="rounded-lg border border-line px-3 py-2 text-[13px]">{tr("فوّضك {0} من {1} إلى {2}", d.fromName, dmy(d.from), dmy(d.to))}</div>
          ))}
        </>
      )}
    </Card>
  );
}
