/**
 * السلسلة الإجرائية في المستندات: شريط المراحل تحت المستند بأزرار القرار، والنقاط المصغّرة في القائمة،
 * والإرسال للسلسلة، ومحرر السلاسل في الإعدادات.
 */
import { useState } from 'react';
import { tr, trServer } from '../../lib/i18n';
import { useAction, useApi } from '../../lib/useApi';
import { formatDateTime, relativeTime } from '../../lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { Button, IconAction } from '../../ui/Button';
import { Select, TextInput, Textarea } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import { COR_KEYS } from './shared';
import type { AssigneeType, ChainStep, ChainSummary, ChainView, LetterDetail, StepKind, StepStatus, WfLookups, WfTemplate } from './types';

const KEYS = [...COR_KEYS, 'notify.list'];

const DOT: Record<StepStatus, string> = {
  pending: 'bg-chip border border-line', current: 'bg-accent', done: 'bg-ok', rejected: 'bg-bad', returned: 'bg-warn', skipped: 'bg-chip', cancelled: 'bg-chip'
};

/** نقاط المراحل المصغّرة مع المرحلة الحالية وصاحبها (عمود القائمة) */
export function ChainDots({ wf }: { wf: ChainSummary | null }) {
  if (!wf) return <span className="text-muted">—</span>;
  const live = wf.status === 'running' || wf.status === 'returned';
  return (
    <span className="flex flex-col gap-1" title={wf.templateName}>
      <span className="flex items-center gap-1" aria-label={tr("{0} من {1} مراحل", wf.done, wf.total)}>
        {wf.dots.map((d, i) => <span key={i} className={cx('h-2 w-2 rounded-full', DOT[d])} />)}
      </span>
      <span className="text-[12px] text-muted">{live ? [wf.stepName, wf.assigneeNames.join('، '), wf.asking ? tr("بانتظار إيضاح") : ''].filter(Boolean).join(' · ') : wf.statusLabel}</span>
    </span>
  );
}

const STEP_TONE: Record<StepStatus, 'neutral' | 'info' | 'warn' | 'ok' | 'bad'> = { pending: 'neutral', current: 'info', done: 'ok', rejected: 'bad', returned: 'warn', skipped: 'neutral', cancelled: 'neutral' };
const CHAIN_TONE = { running: 'info', returned: 'warn', approved: 'ok', rejected: 'bad', cancelled: 'neutral' } as const;

function StepNode({ s, last }: { s: ChainStep; last: boolean }) {
  return (
    <li className="relative flex min-w-0 flex-1 gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center">
      {!last && <span aria-hidden="true" className={cx('absolute start-[11px] top-7 bottom-[-12px] w-0.5 sm:start-[calc(50%+16px)] sm:end-[calc(-50%+16px)] sm:top-[11px] sm:bottom-auto sm:h-0.5 sm:w-auto', s.status === 'done' ? 'bg-ok' : 'bg-line')} />}
      <span className={cx('relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-bg', DOT[s.status], s.status === 'pending' && 'text-muted')}>
        {s.status === 'done' ? <Icon name="check" size={14} /> : s.status === 'rejected' ? <Icon name="x" size={14} /> : <span className="num">{s.order}</span>}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 pb-3 sm:pb-0">
        <span className="font-semibold leading-tight">{s.name}</span>
        <span className="text-[12px] text-muted">{s.kindLabel}{s.assignees.length ? ' · ' + s.assignees.map((a) => a.name).join('، ') : ''}</span>
        <span className="flex flex-wrap items-center gap-1 sm:justify-center">
          <Badge tone={STEP_TONE[s.status]}>{s.asking ? tr("بانتظار إيضاح") : s.statusLabel}</Badge>
          {s.fallback && <span className="text-[11px] text-muted" title={tr("لم يُحدَّد مسؤول بالقاعدة، فأُسندت إلى البديل")}>{tr("بديل")}</span>}
        </span>
        {s.endedAt && <span className="num text-[11px] text-muted" title={formatDateTime(s.endedAt)}>{s.actedByName ? s.actedByName + ' · ' : ''}{relativeTime(s.endedAt)}</span>}
      </span>
    </li>
  );
}

type ActKind = 'approve' | 'reject' | 'return' | 'ask' | 'answer' | 'forward' | 'cancel' | 'reassign';

/** بطاقة السلسلة تحت المستند: المراحل، والسجل، وأزرار القرار لصاحب المرحلة الحالية */
export function ChainCard({ d }: { d: LetterDetail }) {
  const wf = d.workflow;
  const [act, setAct] = useState<ActKind | null>(null);
  const [showLog, setShowLog] = useState(false);
  if (!wf) return d.submit ? <SubmitCard d={d} /> : null;
  const cur = wf.current;
  const approveLabel = cur?.kind === 'review' ? tr("تمت المراجعة") : cur?.kind === 'execute' ? tr("تم التنفيذ") : tr("اعتماد");
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <span className="flex min-w-0 flex-col">
          <span className="text-[16px] font-semibold">{tr("السلسلة الإجرائية")}</span>
          <span className="text-[12px] text-muted">{tr("«{0}» · الإصدار {1} · بدأها {2}", wf.templateName, wf.templateVersion, wf.startedByName)}</span>
        </span>
        <Badge tone={CHAIN_TONE[wf.status]}>{wf.statusLabel}</Badge>
      </div>
      <ol className="m-0 flex list-none flex-col gap-0 px-5 py-4 sm:flex-row sm:gap-2">
        {wf.steps.map((s, i) => <StepNode key={s.id} s={s} last={i === wf.steps.length - 1} />)}
      </ol>
      {cur?.asking && <div className="mx-5 mb-3 rounded-lg bg-warn-bg px-3 py-2.5 text-[13px] text-warn">{tr("المرحلة بانتظار إيضاح من منشئ المستند.")}</div>}
      {d.submit?.resubmit && <div className="mx-5 mb-3"><SubmitCard d={d} inline /></div>}
      {(wf.can.act || wf.can.answer || wf.can.cancel || wf.can.reassign) && (
        <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
          {wf.can.act && <Button variant="primary" icon="check" onClick={() => setAct('approve')}>{approveLabel}</Button>}
          {wf.can.act && <Button variant="secondary" onClick={() => setAct('return')}>{tr("إعادة للتعديل")}</Button>}
          {wf.can.act && <Button variant="secondary" icon="user" onClick={() => setAct('forward')}>{tr("إحالة")}</Button>}
          {wf.can.ask && <Button variant="ghost" icon="chat" onClick={() => setAct('ask')}>{tr("طلب استيضاح")}</Button>}
          {wf.can.act && <Button variant="ghost" icon="x" onClick={() => setAct('reject')}>{tr("رفض")}</Button>}
          {wf.can.answer && <Button variant="primary" icon="chat" onClick={() => setAct('answer')}>{tr("الرد على الاستيضاح")}</Button>}
          {wf.can.reassign && <Button variant="ghost" icon="refresh" onClick={() => setAct('reassign')}>{tr("إعادة إسناد")}</Button>}
          {wf.can.cancel && <Button variant="ghost" icon="trash" onClick={() => setAct('cancel')}>{tr("إلغاء السلسلة")}</Button>}
        </div>
      )}
      <div className="border-t border-line">
        <button type="button" className="flex w-full items-center justify-between px-5 py-2.5 text-[13px] font-semibold text-fg cursor-pointer" aria-expanded={showLog} onClick={() => setShowLog((x) => !x)}>
          {tr("سجل السلسلة · {0}", wf.actions.length)}<Icon name="chevronDown" size={14} className={cx('transition-transform', showLog && 'rotate-180')} />
        </button>
        {showLog && (
          <ol className="m-0 flex list-none flex-col p-0">
            {wf.actions.map((a) => (
              <li key={a.id} className="flex gap-2 border-t border-line px-5 py-2.5 text-[13px]">
                <Icon name={a.action === 'approve' ? 'check' : a.action === 'reject' ? 'x' : a.action === 'ask' || a.action === 'answer' ? 'chat' : 'history'} size={14} className="mt-0.5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <b className="font-semibold">{a.byName || tr("النظام")}</b> <span className="text-muted">{a.label}{a.step ? ' · ' + a.step : ''}{a.toName ? ' ← ' + a.toName : ''}{a.version ? ' · ' + tr("الإصدار {0}", a.version) : ''}</span>
                  {a.note && <span className="block whitespace-pre-wrap">{trServer(a.note)}</span>}
                </span>
                <span className="shrink-0 text-[12px] text-muted" title={formatDateTime(a.at)}>{relativeTime(a.at)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {act && <ActDialog kind={act} wf={wf} approveLabel={approveLabel} onClose={() => setAct(null)} />}
    </Card>
  );
}

const ACT_TEXT: Record<ActKind, { title: string; label: string; confirm: string; required: boolean; hint?: string }> = {
  approve: { title: tr("قرار المرحلة"), label: tr("ملاحظة (اختياري)"), confirm: '', required: false },
  return: { title: tr("إعادة للتعديل"), label: tr("ما المطلوب تعديله؟"), confirm: tr("إعادة للمنشئ"), required: true, hint: tr("يعود المستند إلى منشئه، وبعد تعديله وإعادة إرساله يرجع إلى هذه المرحلة.") },
  reject: { title: tr("رفض المستند"), label: tr("سبب الرفض"), confirm: tr("رفض"), required: true, hint: tr("ينتهي المستند مرفوضاً حسب إعداد هذه المرحلة، ويصل السبب إلى منشئه.") },
  ask: { title: tr("طلب استيضاح"), label: tr("السؤال"), confirm: tr("إرسال السؤال"), required: true, hint: tr("تبقى المرحلة عندك حتى يرد المنشئ.") },
  answer: { title: tr("الرد على الاستيضاح"), label: tr("الإيضاح"), confirm: tr("إرسال الإيضاح"), required: true },
  forward: { title: tr("إحالة المرحلة"), label: tr("ملاحظة (اختياري)"), confirm: tr("إحالة"), required: false, hint: tr("تنتقل المرحلة إلى من تختاره ليقرر فيها بدلاً منك.") },
  reassign: { title: tr("إعادة إسناد المرحلة"), label: tr("السبب"), confirm: tr("إعادة الإسناد"), required: true, hint: tr("يُسجَّل السبب في سجل السلسلة.") },
  cancel: { title: tr("إلغاء السلسلة"), label: tr("سبب الإلغاء"), confirm: tr("إلغاء السلسلة"), required: true, hint: tr("يعود المستند مسودة ويمكن إرساله في سلسلة جديدة.") }
};

function ActDialog({ kind, wf, approveLabel, onClose }: { kind: ActKind; wf: ChainView; approveLabel: string; onClose: () => void }) {
  const lk = useApi<WfLookups>('wf.lookups', { module: 'correspondence' }, { staleTime: 5 * 60_000 });
  const people = lk.data?.people || [];
  const [note, setNote] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const route = kind === 'cancel' ? 'wf.cancel' : kind === 'reassign' ? 'wf.reassign' : 'wf.act';
  const done = kind === 'approve' ? tr("سُجّل القرار") : kind === 'cancel' ? tr("أُلغيت السلسلة") : tr("تم");
  const run = useAction<Record<string, unknown>>(route, { invalidate: KEYS, silentError: true, success: done, onSuccess: onClose });
  const T = ACT_TEXT[kind];
  const needsTo = kind === 'forward' || kind === 'reassign';
  const holders = wf.steps.find((s) => s.status === 'current')?.assignees.map((a) => a.id) || [];
  const submit = () => {
    setError('');
    if (T.required && !note.trim()) { setError(tr("اكتب {0}.", T.label)); return; }
    if (needsTo && !to) { setError(tr("اختر الشخص.")); return; }
    run.mutate({ instanceId: wf.id, action: kind, note: note.trim(), toId: to || undefined }, { onError: (e) => setError(e.message) });
  };
  return (
    <Dialog open onClose={onClose} title={kind === 'approve' ? approveLabel : T.title} onSubmit={submit}
      footer={<><Button type="submit" variant={kind === 'reject' || kind === 'cancel' ? 'danger' : 'primary'} className="flex-1" loading={run.isPending}>{kind === 'approve' ? approveLabel : T.confirm}</Button>
        <Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <div className="flex flex-col gap-3">
        {T.hint && <p className="m-0 text-[13px] text-muted">{T.hint}</p>}
        {needsTo && <Select label={tr("إلى")} required value={to} onChange={(e) => setTo(e.target.value)}
          options={[{ value: '', label: tr("اختر") }, ...people.filter((p) => !holders.includes(p.id)).map((p) => ({ value: p.id, label: p.name }))]} />}
        <Textarea label={T.label} required={T.required} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} autoFocus />
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}

/** الإرسال للسلسلة (أو إعادة الإرسال بعد التعديل) */
function SubmitCard({ d, inline }: { d: LetterDetail; inline?: boolean }) {
  const s = d.submit!;
  const [open, setOpen] = useState(false);
  const [tpl, setTpl] = useState(s.defaultTemplateId || s.templates[0]?.id || '');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const run = useAction<Record<string, unknown>>('cor.submit', { invalidate: KEYS, silentError: true, success: s.resubmit ? tr("أُعيد إرساله للسلسلة") : tr("أُرسل للسلسلة"), onSuccess: () => setOpen(false) });
  if (!s.resubmit && !s.templates.length) return inline ? null : (
    <Card><p className="m-0 text-[13px] text-muted">{tr("لا توجد سلاسل إجرائية بعد. يضيفها مدير المستندات من الإعدادات.")}</p></Card>
  );
  const picked = s.templates.find((t) => t.id === tpl);
  const body = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold">{s.resubmit ? tr("عدّلت المستند؟ أعد إرساله") : tr("السلسلة الإجرائية")}</span>
        <span className="text-[13px] text-muted">{s.resubmit ? tr("يعود إلى المرحلة التي أعادته.") : tr("أرسل المستند ليمر بمراحل المراجعة والاعتماد. يُقفل وهو قيد الإجراء.")}</span>
      </span>
      <Button variant="primary" icon="check" onClick={() => { setError(''); setOpen(true); }}>{s.resubmit ? tr("إعادة الإرسال") : tr("إرسال للسلسلة")}</Button>
    </div>
  );
  return (
    <>
      {inline ? body : <Card>{body}</Card>}
      {open && (
        <Dialog open onClose={() => setOpen(false)} title={s.resubmit ? tr("إعادة الإرسال للسلسلة") : tr("إرسال للسلسلة")}
          onSubmit={() => { setError(''); run.mutate({ id: d.letter.id, templateId: s.resubmit ? undefined : tpl, note: note.trim() }, { onError: (e) => setError(e.message) }); }}
          footer={<><Button type="submit" variant="primary" className="flex-1" loading={run.isPending}>{tr("إرسال")}</Button><Button variant="ghost" onClick={() => setOpen(false)}>{tr("تراجع")}</Button></>}>
          <div className="flex flex-col gap-3">
            {!s.resubmit && <Select label={tr("السلسلة")} required value={tpl} onChange={(e) => setTpl(e.target.value)}
              options={s.templates.map((t) => ({ value: t.id, label: t.id === s.defaultTemplateId ? tr("{0} (الافتراضية للنوع)", t.name) : t.name }))} />}
            {picked && <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-[13px]">
              {picked.steps.map((n, i) => <li key={i} className="flex items-center gap-1.5">{i > 0 && <Icon name="chevron" size={12} className="text-muted" />}<span className="rounded-md bg-chip px-2 py-0.5">{n}</span></li>)}
            </ol>}
            <TextInput label={tr("ملاحظة (اختياري)")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
          </div>
        </Dialog>
      )}
    </>
  );
}

// ───────── الإعدادات: السلاسل الإجرائية ─────────
const TPL_KEYS = ['wf.templates', 'cor.types', 'cor.get'];

export function TemplatesCard() {
  const q = useApi<WfTemplate[]>('wf.templates', { module: 'correspondence' });
  const [editing, setEditing] = useState<{ item: WfTemplate | null } | null>(null);
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  return (
    <Card padded={false}>
      <CardHeader title={tr("السلاسل الإجرائية")} action={<Button size="sm" icon="plus" onClick={() => setEditing({ item: null })}>{tr("سلسلة جديدة")}</Button>} />
      {q.data.length === 0 ? <EmptyState title={tr("لا سلاسل بعد")} body={tr("السلسلة مراحل يمر بها المستند: مراجعة ثم اعتماد مثلاً. اربطها بنوع المستند لتكون الافتراضية له.")} /> : q.data.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-5 py-2.5">
          <span className="flex min-w-0 flex-1 basis-60 flex-col">
            <span className={cx('font-semibold', t.status === 'retired' && 'text-muted line-through')}>{t.name}</span>
            <span className="text-[12px] text-muted">{t.steps.map((s) => s.name).join(' ← ')}</span>
          </span>
          <span className="num text-[12px] text-muted">{tr("الإصدار {0}", t.version)}{t.running ? ' · ' + tr("{0} جارية", t.running) : ''}</span>
          {t.status === 'retired' && <Badge>{t.statusLabel}</Badge>}
          <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing({ item: t })}>{tr("تعديل")}</Button>
        </div>
      ))}
      <p className="m-0 border-t border-line px-5 py-3 text-[13px] text-muted">{tr("كل حفظ إصدار جديد. السلاسل الجارية تكمل على الإصدار الذي بدأت به.")}</p>
      {editing && <TemplateDialog item={editing.item} onClose={() => setEditing(null)} />}
    </Card>
  );
}

interface StepDraft { name: string; kind: StepKind; type: AssigneeType; id: string; role: string; onReject: 'end' | 'creator' }

function TemplateDialog({ item, onClose }: { item: WfTemplate | null; onClose: () => void }) {
  const lk = useApi<WfLookups>('wf.lookups', { module: 'correspondence' }, { staleTime: 5 * 60_000 });
  const [name, setName] = useState(item?.name || '');
  const [description, setDescription] = useState(item?.description || '');
  const [status, setStatus] = useState(item?.status || 'published');
  const [steps, setSteps] = useState<StepDraft[]>(() => item ? item.steps.map((s) => ({ name: s.name, kind: s.kind, type: s.assignee.type, id: s.assignee.id || '', role: s.assignee.role || '', onReject: s.onReject })) : [
    { name: tr("مراجعة المدير المباشر"), kind: 'review', type: 'direct_manager', id: '', role: '', onReject: 'creator' },
    { name: tr("اعتماد مدير المستندات"), kind: 'approve', type: 'role', id: '', role: 'manager', onReject: 'end' }
  ]);
  const [error, setError] = useState('');
  const save = useAction('wf.template.save', { invalidate: TPL_KEYS, success: tr("حُفظت السلسلة"), silentError: true, onSuccess: onClose });
  const L = lk.data;
  const set = (i: number, ch: Partial<StepDraft>) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, ...ch } : x)));
  const move = (i: number, d: -1 | 1) => setSteps((l) => { const n = l.slice(); const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const submit = () => {
    setError('');
    save.mutate({
      id: item?.id, module: 'correspondence', name, description, status,
      steps: steps.map((s) => ({ name: s.name, kind: s.kind, onReject: s.onReject, assignee: { type: s.type, id: s.id || undefined, role: s.role || undefined } }))
    }, { onError: (e) => setError(e.message) });
  };
  return (
    <Dialog open onClose={onClose} wide title={item ? tr("تعديل السلسلة") : tr("سلسلة جديدة")} onSubmit={submit}
      footer={<><Button type="submit" variant="primary" className="flex-1" loading={save.isPending}>{item ? tr("حفظ إصداراً جديداً") : tr("حفظ")}</Button><Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      {!L ? <Loader /> : (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label={tr("اسم السلسلة")} required value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus placeholder={tr("اعتماد المذكرات، صادر للجهات الحكومية…")} />
            <Select label={tr("الحالة")} value={status} onChange={(e) => setStatus(e.target.value as WfTemplate['status'])} options={[{ value: 'published', label: tr("منشورة (تُختار عند الإرسال)") }, { value: 'retired', label: tr("موقوفة") }]} />
          </div>
          <TextInput label={tr("وصف (اختياري)")} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
          <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-semibold">{tr("المراحل · {0}", steps.length)}</span>
              <Button size="sm" variant="ghost" icon="plus" disabled={steps.length >= 15} onClick={() => setSteps((l) => [...l, { name: '', kind: 'approve', type: 'role', id: '', role: 'manager', onReject: 'end' }])}>{tr("إضافة مرحلة")}</Button>
            </div>
            {steps.map((s, i) => (
              <div key={i} className="flex flex-col gap-2 border-t border-line pt-2 first-of-type:border-t-0">
                <div className="flex items-center gap-2">
                  <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-chip text-[12px] font-bold">{i + 1}</span>
                  <TextInput label={tr("اسم المرحلة")} required value={s.name} onChange={(e) => set(i, { name: e.target.value })} maxLength={60} className="flex-1" />
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Select label={tr("النوع")} value={s.kind} onChange={(e) => set(i, { kind: e.target.value as StepKind })} options={L.kinds.map((k) => ({ value: k.id, label: k.label }))}
                    hint={s.kind === 'inform' ? tr("إحاطة فقط: لا تنتظر قراراً") : s.kind === 'approve' ? tr("لا يعتمدها منشئ المستند") : undefined} />
                  <Select label={tr("المسؤول")} value={s.type} onChange={(e) => set(i, { type: e.target.value as AssigneeType, id: '', role: e.target.value === 'role' ? 'manager' : '' })} options={L.assignees.map((a) => ({ value: a.id, label: a.label }))} />
                  {s.type === 'user' && <Select label={tr("المستخدم")} required value={s.id} onChange={(e) => set(i, { id: e.target.value })} options={[{ value: '', label: tr("اختر") }, ...L.people.map((p) => ({ value: p.id, label: p.name }))]} />}
                  {s.type === 'role' && <Select label={tr("الدور")} required value={s.role} onChange={(e) => set(i, { role: e.target.value })} options={L.roles.map((r) => ({ value: r.id, label: r.label }))} />}
                  {s.type === 'dept_manager' && <Select label={tr("القسم")} required value={s.id} onChange={(e) => set(i, { id: e.target.value })} options={[{ value: '', label: tr("اختر") }, ...L.departments.map((d) => ({ value: d.id, label: d.name }))]} />}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  {s.kind !== 'inform' && <Select label={tr("عند الرفض")} className="min-w-[220px] flex-1" value={s.onReject} onChange={(e) => set(i, { onReject: e.target.value as StepDraft['onReject'] })} options={L.onReject.map((o) => ({ value: o.id, label: o.label }))} />}
                  <span className="flex-1" />
                  <IconAction icon="chevronDown" rotate label={tr("أعلى")} disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconAction icon="chevronDown" label={tr("أسفل")} disabled={i === steps.length - 1} onClick={() => move(i, 1)} />
                  <Button size="sm" variant="ghost" icon="trash" disabled={steps.length === 1} onClick={() => setSteps((l) => l.filter((_, j) => j !== i))}>{tr("حذف")}</Button>
                </div>
              </div>
            ))}
            <p className="m-0 text-[12px] text-muted">{tr("إن لم يوجد المسؤول (مثلاً منشئ بلا مدير) تُسند المرحلة إلى مدير المنشئ، ثم مدير المستندات، ثم مدير النظام.")}</p>
          </div>
          {item && item.running > 0 && <p className="m-0 text-[13px] text-muted">{tr("{0} مستند يمر بهذه السلسلة الآن ويكمل على إصدارها الحالي.", item.running)}</p>}
          {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
        </div>
      )}
    </Dialog>
  );
}
