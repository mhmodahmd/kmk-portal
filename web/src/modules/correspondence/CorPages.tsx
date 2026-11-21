import { useMemo, useState } from 'react';
import { Link, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { dmy, monthLabel } from '../../lib/format';
import { Card, CardHeader, EmptyState, ErrorBox, Loader, PageHeader, StatTile } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { DataTable, Pager, SearchBox, Segmented, TabNav, useTable } from '../../ui/Controls';
import { Select } from '../../ui/Field';
import { cx } from '../../ui/cx';
import { downloadCsv } from '../attendance/shared';
import { ConfBadge, DirectionMark, DueText, LetterDialog, LetterLine, StatusBadge, useCorLookups, type LetterDraft } from './shared';
import type { CorReport, LetterView } from './types';

export function CorLayout() {
  const lk = useCorLookups();
  const [creating, setCreating] = useState<LetterDraft | null>(null);
  const L = lk.data;
  const items = [
    { to: '/correspondence', label: tr("نظرة عامة"), end: true },
    { to: '/correspondence/in', label: tr("الوارد") },
    { to: '/correspondence/out', label: tr("الصادر") },
    { to: '/correspondence/docs', label: tr("كل المستندات") },
    { to: '/correspondence/archive', label: tr("الأرشيف") },
    { to: '/correspondence/report', label: tr("التقرير") },
    ...(L?.isManager ? [{ to: '/correspondence/settings', label: tr("الإعدادات") }] : [])
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={tr("العمل")} title={tr("المستندات")} actions={<>
        <Button variant="primary" icon="plus" onClick={() => setCreating({ direction: 'in' })}>{tr("تسجيل وارد")}</Button>
        <Button variant="secondary" icon="plus" onClick={() => setCreating({ direction: 'out' })}>{tr("تسجيل صادر")}</Button>
        <Button variant="secondary" icon="file" disabled={!L?.types.some((t) => t.direction === 'internal')}
          onClick={() => setCreating({ direction: 'internal', typeId: L?.types.find((t) => t.direction === 'internal')?.id })}>{tr("مستند داخلي")}</Button>
      </>} />
      <TabNav label={tr("أقسام المستندات")} items={items} />
      <Outlet />
      {creating && <LetterDialog open onClose={() => setCreating(null)} initial={creating} />}
    </div>
  );
}

const sortValue = (l: LetterView, k: string) => (k === 'status' ? l.statusLabel : k === 'party' ? l.party : k === 'dueDate' ? l.dueDate : (l as unknown as Record<string, unknown>)[k]);

/** جدول الوارد أو الصادر أو كل المستندات أو الأرشيف مع التصفية */
export function LettersPage({ view }: { view: 'in' | 'out' | 'docs' | 'archive' }) {
  const lk = useCorLookups();
  const nav = useNavigate();
  const L = lk.data;
  const [params] = useSearchParams();
  const initialStatus = params.get('status');
  const [status, setStatus] = useState<'all' | 'open' | 'replied' | 'overdue'>(initialStatus === 'overdue' || initialStatus === 'open' || initialStatus === 'replied' ? initialStatus : 'all');
  const [year, setYear] = useState('');
  const [assignee, setAssignee] = useState('');
  const [category, setCategory] = useState('');
  const [client, setClient] = useState('');
  const [direction, setDirection] = useState('');
  const [search, setSearch] = useState('');
  const [typeId, setTypeId] = useState(params.get('type') || '');
  const [conf, setConf] = useState('');
  const showType = view === 'docs' || view === 'archive';
  const payload = view === 'archive'
    ? { archived: true, direction: direction || undefined }
    : { direction: view === 'docs' ? undefined : view, status: status === 'replied' ? 'replied' : undefined, overdue: status === 'overdue' || undefined };
  const q = useApi<LetterView[]>('cor.list', {
    ...payload, typeId: showType ? typeId || undefined : undefined, confidentiality: conf || undefined,
    year: year || undefined, assigneeId: assignee || undefined, category: category || undefined, clientId: client || undefined
  });
  const rows = useMemo(() => (q.data || []).filter((l) => {
    if (status === 'open' && !l.open) return false;
    const s = search.trim().toLowerCase();
    return !s || [l.subject, l.number, l.party, l.refNo, l.assigneeName, l.typeName, l.tags.join(' '), ...l.listFields.map((x) => x.display)].join(' ').toLowerCase().includes(s);
  }), [q.data, status, search]);
  const t = useTable(rows, { sort: { key: 'date', dir: 'desc' }, get: sortValue });
  const exportCsv = () => downloadCsv(tr("المستندات.csv"), [
    [tr("الرقم"), tr("النوع"), tr("الموضوع"), tr("الجهة"), tr("التاريخ"), tr("القناة"), tr("التصنيف"), tr("الحالة"), tr("موعد الرد"), tr("المسؤول"), tr("المشروع"), tr("رقم المرجع")],
    ...rows.map((l) => [l.number, l.typeName, l.subject, l.party, dmy(l.date), l.channelLabel, l.category, l.statusLabel, dmy(l.dueDate), l.assigneeName, l.projectName, l.refNo])
  ]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {view === 'archive' ? (
          <Segmented label={tr("الاتجاه")} value={direction} onChange={setDirection} options={[{ value: '', label: tr("الكل") }, { value: 'in', label: tr("وارد") }, { value: 'out', label: tr("صادر") }, { value: 'internal', label: tr("داخلي") }]} />
        ) : (
          <Segmented label={tr("الحالة")} value={status} onChange={setStatus}
            options={[{ value: 'all', label: tr("الكل") }, { value: 'open', label: tr("بانتظار الرد") }, { value: 'overdue', label: tr("متأخرة") }, { value: 'replied', label: tr("تم الرد") }]} />
        )}
        {showType && <Select label={tr("النوع")} className="w-40" value={typeId} onChange={(e) => setTypeId(e.target.value)} options={[{ value: '', label: tr("كل الأنواع") }, ...(L?.types || []).map((t) => ({ value: t.id, label: t.name }))]} />}
        <Select label={tr("السرية")} className="w-32" value={conf} onChange={(e) => setConf(e.target.value)} options={[{ value: '', label: tr("الكل") }, ...(L?.confidentialities || []).map((c) => ({ value: c.id, label: c.label }))]} />
        <Select label={tr("السنة")} className="w-28" value={year} onChange={(e) => setYear(e.target.value)} options={[{ value: '', label: tr("الكل") }, ...(L?.years || []).map((y) => ({ value: y, label: y }))]} />
        {(L?.categories.length || 0) > 0 && <Select label={tr("التصنيف")} className="w-36" value={category} onChange={(e) => setCategory(e.target.value)} options={[{ value: '', label: tr("الكل") }, ...(L?.categories || []).map((c) => ({ value: c, label: c }))]} />}
        {(L?.clients.length || 0) > 0 && <Select label={tr("العميل")} className="w-44" value={client} onChange={(e) => setClient(e.target.value)} options={[{ value: '', label: tr("الكل") }, ...(L?.clients || []).map((c) => ({ value: c.id, label: c.name }))]} />}
        {L?.isManager && <Select label={tr("المسؤول")} className="w-40" value={assignee} onChange={(e) => setAssignee(e.target.value)} options={[{ value: '', label: tr("الكل") }, ...(L?.people || []).map((p) => ({ value: p.id, label: p.name }))]} />}
        <div className="min-w-[200px] flex-1"><SearchBox id="cor-search" value={search} onChange={setSearch} placeholder={tr("بحث بالموضوع أو الرقم أو الجهة")} /></div>
        <Button size="sm" variant="ghost" icon="download" onClick={exportCsv} disabled={!rows.length}>{tr("تصدير CSV (Excel)")}</Button>
      </div>
      <Card padded={false}>
        {q.isError ? <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} /> : !q.data ? <Loader /> : rows.length === 0 ? (
          <EmptyState title={view === 'archive' ? tr("لا مستندات مؤرشفة") : view === 'in' ? tr("لا خطابات واردة") : view === 'out' ? tr("لا خطابات صادرة") : tr("لا مستندات")}
            body={view === 'archive' ? tr("الخطابات المنتهية تُنقل إلى الأرشيف من صفحتها، وتبقى قابلة للبحث هنا.") : tr("سجّل الخطاب من الزر أعلى الصفحة، واربطه بالعميل أو المشروع ليظهر في صفحتهما.")} />
        ) : (
          <DataTable sticky sort={t.sort} onSort={t.onSort} pager={<Pager {...t.pager} />} minWidth={820}
            head={[{ key: 'number', label: tr("الرقم") }, { key: 'subject', label: tr("الموضوع") }, { key: 'party', label: tr("الجهة") }, { key: 'date', label: tr("التاريخ") },
              { key: 'category', label: tr("التصنيف") }, { key: 'assigneeName', label: tr("المسؤول") }, { key: 'status', label: tr("الحالة") }, { key: 'dueDate', label: tr("موعد الرد") }]}>
            {t.rows.map((l) => (
              <tr key={l.id} className="cursor-pointer hover:bg-chip/40" onClick={() => nav('/correspondence/' + l.id)}>
                <td className="whitespace-nowrap"><span className="flex items-center gap-1.5">{showType && <DirectionMark l={l} short />}<span className="num">{l.number}</span></span>{showType && <span className="block text-[12px] text-muted">{l.typeName}</span>}</td>
                <td><span className="flex flex-col"><span className="flex flex-wrap items-center gap-1.5"><Link to={'/correspondence/' + l.id} className="font-semibold text-fg no-underline">{l.subject}</Link><ConfBadge l={l} /></span>
                  <span className="text-[12px] text-muted">{[...l.listFields.map((x) => x.label + ': ' + x.display), l.channelLabel, l.refNo, l.projectName, l.replyToNumber ? tr("رد على {0}", l.replyToNumber) : '', l.filesCount ? tr("{0} مرفق", l.filesCount) : ''].filter(Boolean).join(' · ')}</span></span></td>
                <td className="text-[13px]">{l.clientId ? <Link to={'/crm/clients/' + l.clientId} className="text-fg no-underline hover:underline" onClick={(e) => e.stopPropagation()}>{l.party}</Link> : l.party}</td>
                <td className="num whitespace-nowrap">{dmy(l.date)}</td>
                <td className="text-[13px]">{l.category || '—'}</td>
                <td className="text-[13px]">{l.assigneeName}</td>
                <td><StatusBadge l={l} /></td>
                <td className="whitespace-nowrap">{l.open ? <DueText l={l} /> : l.dueDate ? <span className="num text-[12px] text-muted">{dmy(l.dueDate)}</span> : '—'}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  );
}

/** التقرير السنوي: الصادر والوارد شهرياً، المتأخر، التوزيع */
export function CorReportPage() {
  const lk = useCorLookups();
  const [year, setYear] = useState('');
  const y = year || lk.data?.today.slice(0, 4) || '';
  const q = useApi<CorReport>('cor.report', { year: y || undefined });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const r = q.data;
  const exportMonths = () => r && downloadCsv(tr("المراسلات-{0}.csv", r.year), [[tr("الشهر"), tr("وارد"), tr("صادر")], ...r.byMonth.map((m) => [monthLabel(m.month), m.in, m.out])]);
  return (
    <div className="flex flex-col gap-4">
      <div className="no-print flex flex-wrap items-end gap-3">
        <Select label={tr("السنة")} className="w-32" value={y} onChange={(e) => setYear(e.target.value)} options={(lk.data?.years || [y]).map((v) => ({ value: v, label: v }))} />
        <Button size="sm" variant="ghost" icon="download" onClick={exportMonths} disabled={!r}>{tr("تصدير CSV (Excel)")}</Button>
        <Button size="sm" variant="ghost" icon="printer" onClick={() => window.print()}>{tr("طباعة")}</Button>
      </div>
      {!r ? <Loader /> : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
            <StatTile label={tr("خطابات {0}", r.year)} value={r.total} icon="mail" foot={tr("{0} وارد · {1} صادر", r.in, r.out)} />
            <StatTile label={tr("بانتظار الرد")} value={r.awaiting} icon="clock" foot={tr("لها موعد رد لم يحن بعد")} />
            <StatTile label={tr("متأخرة عن موعد الرد")} value={<span className={cx(r.overdueCount > 0 && 'text-bad')}>{r.overdueCount}</span>} icon="alert" foot={r.overdueCount ? tr("تحتاج متابعة الآن") : tr("لا تأخير")} />
            <StatTile label={tr("مؤرشفة")} value={r.archived} icon="archive" foot={tr("رُدّ على {0} من الوارد", r.repliedIn)} />
          </div>
          <Card className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3"><h2 className="m-0 text-[16px] font-semibold">{tr("الصادر والوارد شهرياً")}</h2>
              <span className="flex items-center gap-3 text-[12px] text-muted"><span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-ok" />{tr("وارد")}</span><span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-accent" />{tr("صادر")}</span></span></div>
            {r.total === 0 ? <EmptyState title={tr("لا خطابات في هذه السنة")} /> : <MonthBars data={r.byMonth} />}
          </Card>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card padded={false}>
              <CardHeader title={tr("متأخرة عن موعد الرد · {0}", r.overdueCount)} />
              {r.overdue.length === 0 ? <EmptyState title={tr("لا خطابات متأخرة")} /> : r.overdue.map((l) => <LetterLine key={l.id} l={l} />)}
            </Card>
            <div className="flex flex-col gap-4">
              <Card padded={false}>
                <CardHeader title={tr("حسب التصنيف")} />
                {r.byCategory.length === 0 ? <EmptyState title={tr("لا بيانات")} /> : (
                  <DataTable head={[tr("التصنيف"), tr("العدد")]} minWidth={240}>
                    {r.byCategory.map((x) => <tr key={x.category || '-'}><td>{x.category || tr("بلا تصنيف")}</td><td className="num">{x.count}</td></tr>)}
                  </DataTable>
                )}
              </Card>
              <Card padded={false}>
                <CardHeader title={tr("حسب الحالة والقناة")} />
                <DataTable head={[tr("الحالة"), tr("العدد")]} minWidth={240}>
                  {r.byStatus.filter((x) => x.count).map((x) => <tr key={x.status}><td>{x.label}</td><td className="num">{x.count}</td></tr>)}
                  {r.byChannel.map((x) => <tr key={'c' + x.channel}><td className="text-muted">{x.label || tr("قناة غير محددة")}</td><td className="num">{x.count}</td></tr>)}
                </DataTable>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** أعمدة شهرية مزدوجة: وارد (أخضر) وصادر (أزرق) */
function MonthBars({ data }: { data: { month: string; in: number; out: number }[] }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.in, d.out)));
  const W = 720, H = 160, pad = 24, step = (W - pad * 2) / data.length, bw = Math.max(6, Math.min(20, step / 2 - 4));
  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} className="w-full" role="img" aria-label={tr("الصادر والوارد شهرياً")}>
      {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={pad} x2={W - pad} y1={H - H * f} y2={H - H * f} stroke="var(--c-border)" strokeDasharray="3 4" />)}
      {data.map((d, i) => {
        const x = pad + i * step + (step - bw * 2 - 3) / 2;
        const hi = Math.round((d.in / max) * (H - 12)), ho = Math.round((d.out / max) * (H - 12));
        return (
          <g key={d.month}>
            <rect x={x} y={H - hi} width={bw} height={hi} rx={3} fill={d.in ? 'var(--c-ok)' : 'var(--c-chip)'}><title>{monthLabel(d.month)} · {tr("وارد")}: {d.in}</title></rect>
            <rect x={x + bw + 3} y={H - ho} width={bw} height={ho} rx={3} fill={d.out ? 'var(--c-accent)' : 'var(--c-chip)'}><title>{monthLabel(d.month)} · {tr("صادر")}: {d.out}</title></rect>
            {d.in > 0 && <text x={x + bw / 2} y={H - hi - 4} textAnchor="middle" fontSize="10" fill="var(--c-muted)" className="num">{d.in}</text>}
            {d.out > 0 && <text x={x + bw * 1.5 + 3} y={H - ho - 4} textAnchor="middle" fontSize="10" fill="var(--c-muted)" className="num">{d.out}</text>}
            <text x={x + bw + 1.5} y={H + 18} textAnchor="middle" fontSize="11" fill="var(--c-muted)">{monthLabel(d.month).replace(/ \d{4}$/, '')}</text>
          </g>
        );
      })}
    </svg>
  );
}
