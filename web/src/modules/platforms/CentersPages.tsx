import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useAction, useApi } from '../../lib/useApi';
import { dmy } from '../../lib/format';
import { Badge, Card, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { DataTable, SearchBox, Segmented, ViewToggle, useStoredView, type Sort } from '../../ui/Controls';
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

type CenterMode = 'cards' | 'rows';
const CENTER_MODES = ['cards', 'rows'] as const;

/** قيمة الفرز لكل عمود */
const centerSortValue = (c: CenterView, key: string): string | number => {
  switch (key) {
    case 'collected': return c.collected;
    case 'scheduled': return c.scheduled;
    case 'campaigns': return c.campaignsCount;
    case 'sponsors': return c.projects.length;
    case 'startDate': return c.startDate;
    case 'status': return c.statusLabel;
    case 'managerName': return c.managerName;
    default: return c.name;
  }
};
const NUM_KEYS = ['collected', 'scheduled', 'campaigns', 'sponsors', 'startDate'];
const SORT_PRESETS: { key: string; dir: Sort['dir']; label: string }[] = [
  { key: 'name', dir: 'asc', label: tr("الاسم") },
  { key: 'collected', dir: 'desc', label: tr("الأعلى تحصيلاً") },
  { key: 'scheduled', dir: 'desc', label: tr("الأعلى مجدولاً") },
  { key: 'startDate', dir: 'desc', label: tr("الأحدث بداية") }
];

/**
 * المراكز ومشاريعها ورعاتها والمحصّل والمجدول، بطريقتي عرض: بطاقات أو سطور (جدول قابل للفرز).
 * البحث في اسم المركز والمسؤول والملاحظات والمشاريع والرعاة، والتصفية بالحالة، والترتيب.
 */
export function CentersPage() {
  const L = usePltLookups().data;
  const [platform] = usePlatform();
  const [params] = useSearchParams();
  const focus = params.get('center');
  const q = useApi<CenterView[]>('plt.centers', { platform });
  const [editing, setEditing] = useState<{ item: CenterView | null } | null>(null);
  const [mode, setMode] = useStoredView<CenterMode>('kmk.plt.centers.view', CENTER_MODES, 'cards');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 'asc' });
  useEffect(() => { if (focus && q.data) document.getElementById('center-' + focus)?.scrollIntoView({ block: 'center' }); }, [focus, q.data, mode]);
  const pName = (id: string) => L?.platforms.find((p) => p.id === id)?.name || '';

  const found = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data || []).filter((c) => !s || [c.name, c.managerName, c.notes, ...c.projects.flatMap((p) => [p.name, p.clientName]), ...c.sponsors.map((x) => x.name)].join(' ').toLowerCase().includes(s));
  }, [q.data, search]);
  const rows = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return found.filter((c) => !status || c.status === status).sort((x, y) => {
      const a = centerSortValue(x, sort.key), b = centerSortValue(y, sort.key);
      if (a === '' || b === '') return a === b ? 0 : a === '' ? 1 : -1; // الفارغ آخراً دائماً
      return (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'ar', { numeric: true })) * dir;
    });
  }, [found, status, sort]);
  const onSort = (key: string) => setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: NUM_KEYS.includes(key) ? 'desc' : 'asc' }));
  const statusOpts = [{ value: '', label: tr("الكل"), count: found.length },
    ...(L?.centerStatuses || []).map((x) => ({ value: x.id, label: x.label, count: found.filter((c) => c.status === x.id).length })).filter((o) => o.count > 0 || o.value === status)];
  const filtered = !!search.trim() || !!status;
  const total = rows.reduce((n, c) => n + c.collected, 0);
  const preset = SORT_PRESETS.some((x) => x.key === sort.key) ? sort.key : '';
  const edit = (c: CenterView) => (L?.isAccountant ? <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing({ item: c })}>{tr("تعديل")}</Button> : null);
  const projectsOf = (c: CenterView, max?: number): ReactNode => (
    <>
      {(max ? c.projects.slice(0, max) : c.projects).map((p) => <div key={p.id}><Link to={'/crm/projects/' + p.id} className="text-fg no-underline hover:underline">{p.name}</Link> <span className="text-muted">· {p.clientName}</span></div>)}
      {max && c.projects.length > max ? <div className="text-muted">{tr("و{0} غيرها", c.projects.length - max)}</div> : null}
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-2xl text-[13px] text-muted">{tr("رعاة المركز مشاريع في «العملاء» مربوطة به من نموذج المشروع (ينفّذ في ← المركز). تُسجَّل دفعاتهم هناك، وتظهر هنا.")}</p>
        {L?.isAccountant && <Button variant="primary" icon="plus" onClick={() => setEditing({ item: null })}>{tr("مركز جديد")}</Button>}
      </div>
      {q.isError ? <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} /> : !q.data ? <Loader /> : q.data.length === 0 ? (
        <Card><EmptyState title={tr("لا مراكز بعد")} body={tr("أضف المراكز التي تعمل داخل التطبيق، مثل مركز المعلم المتقن.")} /></Card>
      ) : (<>
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox id="plt-centers-search" value={search} onChange={setSearch} placeholder={tr("بحث بالمركز أو المسؤول أو الراعي")} />
          <label className="flex shrink-0 items-center gap-2 text-[13px] text-muted">
            {tr("ترتيب حسب")}
            <select value={preset} onChange={(e) => { const x = SORT_PRESETS.find((o) => o.key === e.target.value); if (x) setSort({ key: x.key, dir: x.dir }); }}
              className="h-11 cursor-pointer rounded-lg border border-line bg-surface px-2 text-[14px] text-fg sm:h-10">
              {!preset && <option value="">{tr("حسب العمود")}</option>}
              {SORT_PRESETS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
          </label>
          <ViewToggle value={mode} onChange={setMode} options={[{ value: 'cards', icon: 'grid', label: tr("بطاقات") }, { value: 'rows', icon: 'menu', label: tr("سطور") }]} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented label={tr("الحالة")} value={status} onChange={setStatus} options={statusOpts} />
          <span className="text-[13px] text-muted">{tr("{0} من {1} مركز · المحصّل {2}", rows.length, q.data.length, kwd(total))}</span>
        </div>
        {rows.length === 0 ? (
          <Card><EmptyState title={search.trim() ? tr("لا نتائج لـ «{0}»", search.trim()) : tr("لا مراكز بهذه الحالة")}
            action={filtered ? <Button variant="secondary" onClick={() => { setSearch(''); setStatus(''); }}>{tr("مسح التصفية")}</Button> : undefined} /></Card>
        ) : mode === 'rows' ? (
          <Card padded={false}>
            <DataTable minWidth={960} sort={sort} onSort={onSort}
              head={[{ key: 'name', label: tr("المركز") }, { key: 'managerName', label: tr("المسؤول") }, { key: 'startDate', label: tr("البداية") }, { key: 'status', label: tr("الحالة") },
                { key: 'collected', label: tr("المحصّل") }, { key: 'scheduled', label: tr("المجدول") }, { key: 'sponsors', label: tr("المشاريع والرعاة") }, { key: 'campaigns', label: tr("المسابقات") }, '']}>
              {rows.map((c) => (
                <tr key={c.id} id={'center-' + c.id} className={cx(focus === c.id && 'bg-accent-soft')}>
                  <td className="min-w-[200px]"><span className="font-semibold">{c.name}</span><div className="text-[12px] text-muted">{pName(c.platformId)}</div></td>
                  <td className="text-[13px]">{c.managerName || '—'}</td>
                  <td className="num whitespace-nowrap text-[13px]">{c.startDate ? dmy(c.startDate) : '—'}</td>
                  <td><Badge tone={C_TONE[c.status]}>{c.statusLabel}</Badge></td>
                  <td className="num whitespace-nowrap font-semibold">{kwd(c.collected)}</td>
                  <td className="num whitespace-nowrap">{kwd(c.scheduled)}</td>
                  <td className="text-[12px]">{c.projects.length ? projectsOf(c, 2) : <span className="text-muted">—</span>}</td>
                  <td className="num text-[13px]">{c.campaignsCount}</td>
                  <td>{edit(c)}</td>
                </tr>
              ))}
            </DataTable>
          </Card>
        ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => (
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
              {c.projects.length > 0 ? <div className="flex flex-col gap-1 text-[13px]">{projectsOf(c)}</div>
                : <p className="m-0 text-[13px] text-muted">{tr("لا مشاريع رعاية مربوطة بعد.")}</p>}
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2 text-[12px] text-muted">
                <span>{tr("{0} مسابقة أو تحدٍّ", c.campaignsCount)}</span>
                {edit(c)}
              </div>
            </Card>
          ))}
        </div>
        )}
      </>)}
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
