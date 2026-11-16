import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { tr } from '../../lib/i18n';
import { api } from '../../lib/api';
import { useAction, useApi } from '../../lib/useApi';
import { dmy, kwDate } from '../../lib/format';
import { Badge } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Select, TextInput, Textarea } from '../../ui/Field';
import { Dialog, useToast } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import { ACCEPT, filePayload } from '../custody/files';
import type { CorLookups, Direction, LetterStatus, LetterView, LinkType } from './types';

export const COR_KEYS = ['cor.list', 'cor.get', 'cor.report', 'cor.lookups', 'home.summary'];

export const useCorLookups = () => useApi<CorLookups>('cor.lookups', {}, { staleTime: 5 * 60_000 });

const S_TONE: Record<LetterStatus, 'neutral' | 'info' | 'warn' | 'ok' | 'bad'> = { draft: 'neutral', sent: 'info', received: 'warn', replied: 'ok', archived: 'neutral' };
export const StatusBadge = ({ l }: { l: Pick<LetterView, 'status' | 'statusLabel'> }) => <Badge tone={S_TONE[l.status]}>{l.statusLabel}</Badge>;

/** سهم الاتجاه: الوارد أخضر والصادر أزرق، مع النص */
export function DirectionMark({ l, short }: { l: Pick<LetterView, 'direction' | 'directionLabel'>; short?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1 text-[12px] font-semibold', l.direction === 'in' ? 'text-ok' : 'text-accent-fg')}>
      <Icon name={l.direction === 'in' ? 'login' : 'logoutArrow'} size={14} />{short ? null : l.directionLabel}
    </span>
  );
}

/** موعد الرد بلون أحمر للمتأخر */
export function DueText({ l }: { l: Pick<LetterView, 'dueDate' | 'overdue' | 'open' | 'daysLeft'> }) {
  if (!l.dueDate || !l.open) return null;
  const label = l.overdue ? tr("متأخر · {0}", dmy(l.dueDate)) : l.daysLeft === 0 ? tr("الرد اليوم") : dmy(l.dueDate);
  return <span className={cx('inline-flex items-center gap-1 text-[12px] num', l.overdue ? 'font-semibold text-bad' : 'text-muted')}><Icon name="calendar" size={14} />{label}</span>;
}

/** رابط العنصر المرتبط إن كانت له صفحة */
export function linkTo(l: Pick<LetterView, 'linkedType' | 'linkedId'>) {
  switch (l.linkedType) {
    case 'client': return '/crm/clients/' + l.linkedId;
    case 'project': return '/crm/projects/' + l.linkedId;
    case 'custody': return '/custody/' + l.linkedId;
    case 'task': return '/tasks/' + l.linkedId;
    default: return '';
  }
}

/** صف خطاب مختصر في صفحات العميل والمشروع والرئيسية */
export function LetterLine({ l }: { l: LetterView }) {
  return (
    <Link to={'/correspondence/' + l.id} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3 text-fg no-underline first:border-t-0 hover:bg-chip/40">
      <DirectionMark l={l} short />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{l.subject}</span>
        <span className="text-[12px] text-muted"><span className="num">{l.number}</span> · {l.party} · <span className="num">{dmy(l.date)}</span></span>
      </span>
      <span className="flex flex-col items-end gap-1"><StatusBadge l={l} /><DueText l={l} /></span>
    </Link>
  );
}

/** يرفع عدة ملفات إلى خطاب على التوالي، ويعيد عدد ما نجح وأول خطأ */
export async function uploadLetterFiles(letterId: string, files: File[]) {
  let done = 0, error = '';
  for (const f of files) {
    try { await api('cor.file.upload', { letterId, ...(await filePayload(f)) }); done++; }
    catch (e) { error = error || (e instanceof Error ? e.message : tr("تعذّر رفع الملف.")); }
  }
  return { done, error };
}

/**
 * زر «إضافة مرفقات» يفتح منتقي الملفات (عدة ملفات) ويرفعها إلى الخطاب فوراً.
 * يظهر الحالة أثناء الرفع ويحدّث صفحة الخطاب بعده.
 */
export function AttachButton({ letterId, size = 'sm', variant = 'secondary', label = tr("إضافة مرفقات") }: { letterId: string; size?: 'sm' | 'md'; variant?: 'ghost' | 'secondary' | 'primary'; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(0);
  const pick = async (list: FileList | null) => {
    const files = Array.from(list || []);
    if (!files.length) return;
    setBusy(files.length);
    const r = await uploadLetterFiles(letterId, files);
    setBusy(0);
    if (r.done) toast(r.done === 1 ? tr("أُرفق الملف") : tr("أُرفقت {0} ملفات", r.done));
    if (r.error) toast(r.error, 'bad');
    await qc.invalidateQueries({ queryKey: ['cor.get'] });
    await qc.invalidateQueries({ queryKey: ['cor.list'] });
  };
  return (
    <>
      <Button size={size} variant={variant} icon={busy ? 'refresh' : 'plus'} loading={!!busy} onClick={() => ref.current?.click()}>{busy ? tr("جارٍ رفع {0} ملف", busy) : label}</Button>
      <input ref={ref} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
    </>
  );
}

/** قائمة ملفات مختارة قبل الرفع (داخل حوار التسجيل) */
function PendingFiles({ files, onRemove, onAdd }: { files: File[]; onRemove: (i: number) => void; onAdd: (list: FileList | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium">{files.length ? tr("المرفقات · {0}", files.length) : tr("المرفقات (اختياري)")}</span>
        <Button size="sm" variant="ghost" icon="plus" onClick={() => ref.current?.click()}>{tr("إضافة مرفقات")}</Button>
        <input ref={ref} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { onAdd(e.target.files); e.target.value = ''; }} />
      </div>
      {files.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {files.map((f, i) => (
            <li key={f.name + i} className="flex items-center gap-2 text-[13px]">
              <Icon name="file" size={14} className="shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="num text-[12px] text-muted">{Math.max(1, Math.round(f.size / 1024))} KB</span>
              <button type="button" aria-label={tr("إزالة")} className="text-muted hover:text-bad cursor-pointer" onClick={() => onRemove(i)}><Icon name="x" size={14} /></button>
            </li>
          ))}
        </ul>
      ) : <span className="text-[12px] text-muted">{tr("صورة الخطاب أو ملف PDF حتى 10 ميجابايت لكل ملف، وتُرفع بعد التسجيل.")}</span>}
    </div>
  );
}

export interface LetterDraft {
  id?: string; direction?: Direction; subject?: string; summary?: string; party?: string; clientId?: string; date?: string; refNo?: string;
  channel?: string; category?: string; dueDate?: string; assigneeId?: string; projectId?: string; linkedType?: string; linkedId?: string; linkedLabel?: string;
  tags?: string; replyToId?: string; replyToNumber?: string; sent?: boolean;
}

const LINK_LABELS: Record<LinkType, string> = { client: tr("عميل"), project: tr("مشروع"), custody: tr("عهدة"), employee: tr("موظف"), task: tr("مهمة") };

/** تسجيل خطاب أو تعديله. الرد: direction مقابل الأصل وreplyToId مثبّت */
export function LetterDialog({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial: LetterDraft; onSaved?: (l: LetterView) => void }) {
  const lk = useCorLookups();
  const nav = useNavigate();
  const editing = !!initial.id;
  const [f, setF] = useState<LetterDraft>(() => ({ direction: 'in', channel: 'mail', date: kwDate(), ...initial }));
  const [partyMode, setPartyMode] = useState<'client' | 'free'>(initial.clientId ? 'client' : 'free');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const set = (k: keyof LetterDraft, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const act = useAction<Record<string, unknown>, LetterView>('cor.save', {
    invalidate: COR_KEYS, silentError: true, success: editing ? tr("حُفظ الخطاب") : tr("سُجّل الخطاب"),
    onSuccess: async (l) => {
      // المرفقات المختارة تُرفع بعد التسجيل مباشرة
      if (pending.length) {
        setUploading(true);
        const r = await uploadLetterFiles(l.id, pending);
        setUploading(false);
        if (r.done) toast(r.done === 1 ? tr("أُرفق الملف") : tr("أُرفقت {0} ملفات", r.done));
        if (r.error) toast(r.error, 'bad');
        qc.invalidateQueries({ queryKey: ['cor.get'] });
      }
      onClose(); if (onSaved) onSaved(l); else if (!editing) nav('/correspondence/' + l.id);
    }
  });
  const L = lk.data;
  const addFiles = (list: FileList | null) => setPending((p) => [...p, ...Array.from(list || [])].slice(0, 10));
  const save = () => {
    setError('');
    act.mutate({
      id: f.id, direction: f.direction, subject: f.subject, summary: f.summary, party: partyMode === 'free' ? f.party : f.party || '', clientId: partyMode === 'client' ? f.clientId : '',
      date: f.date, refNo: f.refNo, channel: f.channel, category: f.category, dueDate: f.dueDate, assigneeId: f.assigneeId || L?.me,
      projectId: f.projectId, linkedType: f.linkedId ? f.linkedType : '', linkedId: f.linkedId || '', tags: f.tags || '',
      ...(editing ? {} : { replyToId: f.replyToId, status: f.direction === 'out' && f.sent ? 'sent' : undefined })
    }, { onError: (e) => setError(e.message) });
  };
  const linkTypes = (Object.keys(LINK_LABELS) as LinkType[]).filter((k) => (L?.links[k] || []).length || f.linkedType === k);
  const linkOptions = (() => {
    const list = (L?.links[f.linkedType as LinkType] || []).map((x) => ({ value: x.id, label: x.name }));
    if (f.linkedId && !list.some((x) => x.value === f.linkedId)) list.unshift({ value: f.linkedId, label: f.linkedLabel || f.linkedId });
    return [{ value: '', label: tr("اختر") }, ...list];
  })();
  const projects = (L?.projects || []).filter((p) => partyMode !== 'client' || !f.clientId || p.clientId === f.clientId);
  const title = editing ? tr("تعديل الخطاب") : f.replyToId ? tr("رد على {0}", f.replyToNumber || '') : f.direction === 'in' ? tr("تسجيل خطاب وارد") : tr("تسجيل خطاب صادر");
  return (
    <Dialog open={open} onClose={onClose} wide title={title} onSubmit={save}
      footer={<><Button type="submit" variant="primary" className="flex-1" loading={act.isPending || uploading}>{uploading ? tr("جارٍ رفع المرفقات") : editing ? tr("حفظ") : tr("تسجيل الخطاب")}</Button>
        <Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={tr("الاتجاه")} required value={f.direction || 'in'} disabled={editing || !!f.replyToId} onChange={(e) => set('direction', e.target.value)}
            options={(L?.directions || [{ id: 'in', label: tr("وارد") }, { id: 'out', label: tr("صادر") }]).map((d) => ({ value: d.id, label: d.label }))}
            hint={editing ? tr("لا يُغيَّر الاتجاه بعد التسجيل") : undefined} />
          <TextInput label={tr("تاريخ الخطاب")} type="date" ltr required value={f.date || ''} onChange={(e) => set('date', e.target.value)} />
        </div>
        <TextInput label={tr("الموضوع")} required value={f.subject || ''} onChange={(e) => set('subject', e.target.value)} maxLength={200} autoFocus />
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1.5 text-[13px] font-medium">{tr("الجهة")}<span aria-hidden="true" className="ms-0.5 text-bad">*</span></legend>
          {(L?.clients.length || 0) > 0 && (
            <div role="radiogroup" aria-label={tr("نوع الجهة")} className="flex gap-1.5">
              {([['client', tr("عميل مسجّل")], ['free', tr("اسم حر")]] as const).map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={partyMode === v} onClick={() => setPartyMode(v)}
                  className={cx('h-9 rounded-full px-3.5 text-[13px] font-medium cursor-pointer', partyMode === v ? 'bg-fg text-bg' : 'border border-line bg-surface')}>{label}</button>
              ))}
            </div>
          )}
          {partyMode === 'client' && (L?.clients.length || 0) > 0 ? (
            <Select label={tr("العميل")} required value={f.clientId || ''} onChange={(e) => setF((x) => ({ ...x, clientId: e.target.value, projectId: '' }))}
              options={[{ value: '', label: tr("اختر العميل") }, ...(L?.clients || []).map((c) => ({ value: c.id, label: c.name }))]} />
          ) : (
            <TextInput label={tr("اسم الجهة")} required value={f.party || ''} onChange={(e) => set('party', e.target.value)} maxLength={160} placeholder={tr("وزارة، شركة، شخص…")} />
          )}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={tr("القناة")} value={f.channel || 'mail'} onChange={(e) => set('channel', e.target.value)} options={(L?.channels || []).map((c) => ({ value: c.id, label: c.label }))} />
          <Select label={tr("التصنيف")} value={f.category || ''} onChange={(e) => set('category', e.target.value)}
            options={[{ value: '', label: tr("بلا تصنيف") }, ...(L?.categories || []).map((c) => ({ value: c, label: c })), ...(f.category && !(L?.categories || []).includes(f.category) ? [{ value: f.category, label: f.category }] : [])]} />
          <TextInput label={tr("رقم مرجع الجهة")} ltr value={f.refNo || ''} onChange={(e) => set('refNo', e.target.value)} maxLength={60} />
          <TextInput label={tr("موعد الرد المطلوب")} type="date" ltr value={f.dueDate || ''} onChange={(e) => set('dueDate', e.target.value)} hint={tr("تصل تذكيرات قبل الموعد بيومين وعند التأخر")} />
          <Select label={tr("المسؤول عن المتابعة")} value={f.assigneeId || L?.me || ''} onChange={(e) => set('assigneeId', e.target.value)}
            options={(L?.people || []).map((p) => ({ value: p.id, label: p.id === L?.me ? tr("{0} (أنا)", p.name) : p.name }))} />
          {projects.length > 0 && (
            <Select label={tr("المشروع")} value={f.projectId || ''} onChange={(e) => set('projectId', e.target.value)}
              options={[{ value: '', label: tr("بلا مشروع") }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
          )}
        </div>
        {(linkTypes.length > 0 || f.linkedType) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label={tr("مرتبط بـ")} value={f.linkedType || ''} onChange={(e) => setF((x) => ({ ...x, linkedType: e.target.value, linkedId: '', linkedLabel: '' }))}
              options={[{ value: '', label: tr("بلا ربط") }, ...linkTypes.map((k) => ({ value: k, label: LINK_LABELS[k] }))]}
              hint={tr("يظهر الخطاب في صفحة العنصر المرتبط")} />
            {f.linkedType && (
              <Select label={LINK_LABELS[f.linkedType as LinkType] || tr("العنصر")} required value={f.linkedId || ''} options={linkOptions}
                onChange={(e) => { const o = linkOptions.find((x) => x.value === e.target.value); setF((x) => ({ ...x, linkedId: e.target.value, linkedLabel: o?.label || '' })); }} />
            )}
          </div>
        )}
        <Textarea label={tr("ملخص المحتوى (اختياري)")} value={f.summary || ''} onChange={(e) => set('summary', e.target.value)} maxLength={4000} />
        <TextInput label={tr("وسوم (مفصولة بفاصلة)")} value={f.tags || ''} onChange={(e) => set('tags', e.target.value)} placeholder={tr("عاجل، مناقصة…")} />
        {!editing && L?.drive && <PendingFiles files={pending} onAdd={addFiles} onRemove={(i) => setPending((p) => p.filter((_, j) => j !== i))} />}
        {!editing && f.direction === 'out' && (
          <label className="flex min-h-11 items-center gap-3 cursor-pointer select-none sm:min-h-0">
            <input type="checkbox" className="h-[18px] w-[18px] accent-accent" checked={!!f.sent} onChange={(e) => set('sent', e.target.checked)} />
            <span className="flex flex-col"><span className="font-medium">{tr("أُرسل فعلاً")}</span><span className="text-[12px] text-muted">{tr("وإلا يُسجَّل مسودة حتى تُرسله")}</span></span>
          </label>
        )}
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}

/** زر «خطاب جديد» من صفحة عميل أو مشروع */
export function QuickLetterButton({ draft, label = tr("خطاب جديد"), size = 'sm', variant = 'ghost' }: { draft: LetterDraft; label?: string; size?: 'sm' | 'md'; variant?: 'ghost' | 'secondary' | 'primary' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} icon="mail" onClick={() => setOpen(true)}>{label}</Button>
      {open && <LetterDialog open onClose={() => setOpen(false)} initial={draft} />}
    </>
  );
}

/** قسم «المراسلات» في صفحة عميل أو مشروع (يُعرض لمن له دور في المراسلات فقط) */
export function LinkedLetters({ filter, draft }: { filter: Record<string, unknown>; draft: LetterDraft }) {
  const q = useApi<LetterView[]>('cor.list', { ...filter, withArchived: true });
  const items = q.data || [];
  return (
    <section className="bg-surface border border-line rounded-xl">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5">
        <h2 className="m-0 text-[16px] font-semibold">{items.length ? tr("المراسلات · {0}", items.length) : tr("المراسلات")}</h2>
        <QuickLetterButton draft={draft} />
      </div>
      {q.isError ? <p className="m-0 px-5 pb-4 text-[13px] text-bad">{(q.error as Error).message}</p>
        : items.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا مراسلات مرتبطة.")}</p>
        : items.slice(0, 10).map((l) => <LetterLine key={l.id} l={l} />)}
      {items.length > 10 && <Link to="/correspondence" className="block border-t border-line px-5 py-2.5 text-[13px] font-semibold text-accent-fg no-underline">{tr("كل المراسلات")}</Link>}
    </section>
  );
}
