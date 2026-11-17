import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useAction, useApi } from '../../lib/useApi';
import { dmy } from '../../lib/format';
import { Badge, Card, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { DataTable } from '../../ui/Controls';
import { Select, TextInput, Textarea } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { cx } from '../../ui/cx';
import { kwd } from '../custody/shared';
import { PLT_KEYS, usePlatform, usePltLookups } from './shared';
import type { CampaignView, CenterView, PltLookups } from './types';

const opts = (o: { id: string; label: string }[]) => o.map((x) => ({ value: x.id, label: x.label }));
const C_TONE = { active: 'ok', paused: 'warn', closed: 'neutral' } as const;
const K_TONE = { planned: 'info', running: 'ok', ended: 'neutral', cancelled: 'bad' } as const;

/** المنصة الافتراضية لنموذج جديد: المختارة، أو الأولى */
const defaultPlatform = (L: PltLookups | undefined, key: string) => (L?.platforms.find((p) => p.key === key) || L?.platforms[0])?.id || '';

/** المراكز: بطاقة لكل مركز بمشاريعه ورعاته والمحصّل والمستحق */
export function CentersPage() {
  const L = usePltLookups().data;
  const [platform] = usePlatform();
  const [params] = useSearchParams();
  const focus = params.get('center');
  const q = useApi<CenterView[]>('plt.centers', { platform });
  const [editing, setEditing] = useState<{ item: CenterView | null } | null>(null);
  useEffect(() => { if (focus && q.data) document.getElementById('center-' + focus)?.scrollIntoView({ block: 'center' }); }, [focus, q.data]);
  const pName = (id: string) => L?.platforms.find((p) => p.id === id)?.name || '';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-2xl text-[13px] text-muted">{tr("رعاة المركز مشاريع في «العملاء» مربوطة به من نموذج المشروع (ينفّذ في ← المركز). تُسجَّل دفعاتهم هناك، وتظهر هنا.")}</p>
        {L?.isAccountant && <Button variant="primary" icon="plus" onClick={() => setEditing({ item: null })}>{tr("مركز جديد")}</Button>}
      </div>
      {q.isError ? <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} /> : !q.data ? <Loader /> : q.data.length === 0 ? (
        <Card><EmptyState title={tr("لا مراكز بعد")} body={tr("أضف المراكز التي تعمل داخل التطبيق، مثل مركز المعلم المتقن.")} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {q.data.map((c) => (
            <Card key={c.id} className={cx('flex flex-col gap-3', focus === c.id && 'ring-2 ring-accent')}>
              <div id={'center-' + c.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="m-0 text-[16px] font-semibold">{c.name}</h3>
                  <span className="text-[12px] text-muted">{[pName(c.platformId), c.managerName, c.startDate ? tr("منذ {0}", dmy(c.startDate)) : ''].filter(Boolean).join(' · ')}</span>
                </div>
                <Badge tone={C_TONE[c.status]}>{c.statusLabel}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[13px]">
                <div className="rounded-lg bg-chip px-3 py-2"><div className="text-[12px] text-muted">{tr("المحصّل")}</div><b className="num">{kwd(c.collected)}</b></div>
                <div className="rounded-lg bg-chip px-3 py-2"><div className="text-[12px] text-muted">{tr("المجدول")}</div><b className="num">{kwd(c.scheduled)}</b></div>
              </div>
              {c.projects.length > 0 ? (
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
                  {c.projects.map((p) => <li key={p.id}><Link to={'/crm/projects/' + p.id} className="text-fg no-underline hover:underline">{p.name}</Link> <span className="text-muted">· {p.clientName}</span></li>)}
                </ul>
              ) : <p className="m-0 text-[13px] text-muted">{tr("لا مشاريع رعاية مربوطة بعد.")}</p>}
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2 text-[12px] text-muted">
                <span>{tr("{0} مسابقة أو تحدٍّ", c.campaignsCount)}</span>
                {L?.isAccountant && <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing({ item: c })}>{tr("تعديل")}</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <CenterDialog item={editing.item} platformId={editing.item?.platformId || defaultPlatform(L, platform)} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CenterDialog({ item, platformId, onClose }: { item: CenterView | null; platformId: string; onClose: () => void }) {
  const L = usePltLookups().data;
  const [f, setF] = useState({ platformId, name: item?.name || '', status: item?.status || 'active', startDate: item?.startDate || '', endDate: item?.endDate || '', managerName: item?.managerName || '', notes: item?.notes || '' });
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useAction('plt.center.save', { invalidate: PLT_KEYS, success: tr("حُفظ المركز"), silentError: true, onSuccess: onClose });
  const remove = useAction('plt.center.remove', { invalidate: PLT_KEYS, success: tr("حُذف المركز"), silentError: true, onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title={item ? tr("تعديل المركز") : tr("مركز جديد")}
      onSubmit={() => { setError(''); save.mutate({ ...f, id: item?.id }, { onError: (e) => setError(e.message) }); }}
      footer={<>
        <Button type="submit" variant="primary" className="flex-1" loading={save.isPending}>{tr("حفظ")}</Button>
        {item && item.projectsCount === 0 && item.campaignsCount === 0 && <Button variant="danger-outline" loading={remove.isPending} onClick={() => remove.mutate({ id: item.id }, { onError: (e) => setError(e.message) })}>{tr("حذف")}</Button>}
        <Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button>
      </>}>
      <div className="flex flex-col gap-3">
        <Select label={tr("المنصة")} value={f.platformId} onChange={set('platformId')} options={(L?.platforms || []).map((p) => ({ value: p.id, label: p.name }))} />
        <TextInput label={tr("اسم المركز")} required value={f.name} onChange={set('name')} maxLength={120} autoFocus />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={tr("الحالة")} value={f.status} onChange={set('status')} options={opts(L?.centerStatuses || [])} />
          <TextInput label={tr("المسؤول")} value={f.managerName} onChange={set('managerName')} maxLength={80} />
          <TextInput label={tr("البداية")} type="date" ltr value={f.startDate} onChange={set('startDate')} />
          <TextInput label={tr("النهاية")} type="date" ltr value={f.endDate} onChange={set('endDate')} />
        </div>
        <Textarea label={tr("ملاحظات")} value={f.notes} onChange={set('notes')} />
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}

/** المسابقات والتحديات: الحالة والمدة والمركز، والرعاية المتعهَّد بها مقابل المحصّل */
export function CampaignsPage() {
  const L = usePltLookups().data;
  const [platform] = usePlatform();
  const q = useApi<CampaignView[]>('plt.campaigns', { platform });
  const [editing, setEditing] = useState<{ item: CampaignView | null } | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-2xl text-[13px] text-muted">{tr("الراعي مشروع في «العملاء» مربوط بالمسابقة: قيمة عقده هي المتعهَّد به، ودفعاته المحصّلة تُحسب هنا. للمسابقة أكثر من راعٍ.")}</p>
        {L?.isAccountant && <Button variant="primary" icon="plus" onClick={() => setEditing({ item: null })}>{tr("مسابقة أو تحدٍّ")}</Button>}
      </div>
      <Card padded={false}>
        {q.isError ? <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} /> : !q.data ? <Loader /> : q.data.length === 0 ? (
          <EmptyState title={tr("لا مسابقات ولا تحديات بعد")} body={tr("مثل: تحدي قراءة سورة القلم، أو مسابقة في سورة الطور.")} />
        ) : (
          <DataTable minWidth={820} head={[tr("الاسم"), tr("المركز"), tr("المدة"), tr("الحالة"), tr("المتعهَّد به"), tr("المحصّل"), tr("المتبقي"), tr("الرعاة"), '']}>
            {q.data.map((c) => (
              <tr key={c.id}>
                <td><span className="font-semibold">{c.name}</span><div className="text-[12px] text-muted">{c.kindLabel}{c.participants ? ' · ' + tr("{0} مشارك", c.participants) : ''}</div></td>
                <td className="text-[13px]">{c.centerName || '—'}</td>
                <td className="num whitespace-nowrap text-[12px]">{c.startDate ? dmy(c.startDate) : '—'}{c.endDate ? ' ← ' + dmy(c.endDate) : ''}</td>
                <td><Badge tone={K_TONE[c.status]}>{c.statusLabel}</Badge></td>
                <td className="num">{kwd(c.pledged)}</td>
                <td className="num font-semibold">{kwd(c.collected)}</td>
                <td className={c.remaining ? 'num text-warn' : 'num'}>{kwd(c.remaining)}</td>
                <td className="text-[12px]">{c.sponsors.length ? c.sponsors.map((s) => <div key={s.projectId}><Link to={'/crm/projects/' + s.projectId} className="text-fg no-underline hover:underline">{s.clientName || s.projectName}</Link></div>) : <span className="text-muted">{tr("لا رعاة")}</span>}</td>
                <td>{L?.isAccountant && <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing({ item: c })}>{tr("تعديل")}</Button>}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
      {editing && <CampaignDialog item={editing.item} platformId={editing.item?.platformId || defaultPlatform(L, platform)} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CampaignDialog({ item, platformId, onClose }: { item: CampaignView | null; platformId: string; onClose: () => void }) {
  const L = usePltLookups().data;
  const [f, setF] = useState({
    platformId, centerId: item?.centerId || '', kind: item?.kind || 'competition', name: item?.name || '', status: item?.status || 'planned',
    startDate: item?.startDate || '', endDate: item?.endDate || '', participants: item?.participants ? String(item.participants) : '', notes: item?.notes || ''
  });
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useAction('plt.campaign.save', { invalidate: PLT_KEYS, success: tr("حُفظ"), silentError: true, onSuccess: onClose });
  const remove = useAction('plt.campaign.remove', { invalidate: PLT_KEYS, success: tr("حُذف"), silentError: true, onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title={item ? tr("تعديل المسابقة أو التحدي") : tr("مسابقة أو تحدٍّ جديد")}
      onSubmit={() => { setError(''); save.mutate({ ...f, id: item?.id }, { onError: (e) => setError(e.message) }); }}
      footer={<>
        <Button type="submit" variant="primary" className="flex-1" loading={save.isPending}>{tr("حفظ")}</Button>
        {item && item.sponsors.length === 0 && <Button variant="danger-outline" loading={remove.isPending} onClick={() => remove.mutate({ id: item.id }, { onError: (e) => setError(e.message) })}>{tr("حذف")}</Button>}
        <Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button>
      </>}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={tr("المنصة")} value={f.platformId} onChange={(e) => setF({ ...f, platformId: e.target.value, centerId: '' })} options={(L?.platforms || []).map((p) => ({ value: p.id, label: p.name }))} />
          <Select label={tr("النوع")} value={f.kind} onChange={set('kind')} options={opts(L?.campaignKinds || [])} />
        </div>
        <TextInput label={tr("الاسم")} required value={f.name} onChange={set('name')} maxLength={160} autoFocus placeholder={tr("مثال: تحدي قراءة سورة القلم")} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={tr("المركز")} value={f.centerId} onChange={set('centerId')} options={[{ value: '', label: tr("بلا مركز") }, ...(L?.centers || []).filter((c) => c.platformId === f.platformId).map((c) => ({ value: c.id, label: c.name }))]} />
          <Select label={tr("الحالة")} value={f.status} onChange={set('status')} options={opts(L?.campaignStatuses || [])} />
          <TextInput label={tr("البداية")} type="date" ltr value={f.startDate} onChange={set('startDate')} />
          <TextInput label={tr("النهاية")} type="date" ltr value={f.endDate} onChange={set('endDate')} />
          <TextInput label={tr("عدد المشاركين")} ltr inputMode="numeric" value={f.participants} onChange={set('participants')} />
        </div>
        <Textarea label={tr("ملاحظات")} value={f.notes} onChange={set('notes')} />
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}
