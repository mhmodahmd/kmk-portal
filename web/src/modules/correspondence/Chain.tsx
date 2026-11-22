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
import { Checkbox, Select, TextInput, Textarea } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import { COR_KEYS } from './shared';
import type { AssigneeType, ChainSummary, ChainView, CondField, CondOp, LetterDetail, StepKind, StepMode, StepStatus, WfLookups, WfRule, WfSimulation, WfTemplate, WfVersion } from './types';
import { useCorLookups } from './shared';
import { Timeline } from '../../ui/Timeline';
import { SignDialog } from './Sign';

const KEYS = [...COR_KEYS, 'notify.list', 'wf.get', 'hr.me', 'hr.team', 'hr.leave.list', 'hr.ot.list', 'att.correction.mine', 'att.correction.list', 'att.today', 'tsk.get', 'tsk.list', 'tsk.dashboard', 'cus.get', 'cus.list', 'cus.home', 'cus.voucher.list', 'cus.request.list'];

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
      <span className={cx('text-[12px]', wf.overdue ? 'font-semibold text-bad' : 'text-muted')}>{live ? [wf.stepName, wf.assigneeNames.join('، '), wf.asking ? tr("بانتظار إيضاح") : '', wf.overdue ? tr("متأخرة") : ''].filter(Boolean).join(' · ') : wf.statusLabel}</span>
    </span>
  );
}

const CHAIN_TONE = { running: 'info', returned: 'warn', approved: 'ok', rejected: 'bad', cancelled: 'neutral' } as const;

type ActKind = 'approve' | 'reject' | 'return' | 'ask' | 'answer' | 'forward' | 'cancel' | 'reassign';

/** بطاقة السلسلة تحت المستند: المراحل، والسجل، وأزرار القرار لصاحب المرحلة الحالية */
/** ما تحتاجه بطاقة السلسلة: المستند يمرّر LetterDetail، وطلبات الوحدات تمرّر السلسلة وحدها */
type ChainHost = { workflow: ChainView | null; submit: LetterDetail['submit']; signatures: LetterDetail['signatures']; letter: { id: string } };

export function ChainCard({ d }: { d: ChainHost }) {
  const wf = d.workflow;
  const [act, setAct] = useState<ActKind | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [signing, setSigning] = useState(false);
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
      <div className="px-5 py-4">
        <Timeline start={{ by: wf.startedByName, at: wf.startedAt }} steps={wf.steps.map((s) => ({
          key: s.id, name: s.name, status: s.status, kindLabel: s.kindLabel, assignees: s.assignees.map((a) => a.name + (a.done ? ' ✓' : '')),
          actorName: s.actedByName, at: s.endedAt, note: s.note, dueAt: s.dueAt, overdue: s.overdue, parallel: s.parallel, fallback: s.fallback, asking: s.asking,
          progress: s.need > 1 ? tr("{0} من {1} موافقات", s.approvals, s.need) : ''
        }))} />
      </div>
      {cur?.asking && <div className="mx-5 mb-3 rounded-lg bg-warn-bg px-3 py-2.5 text-[13px] text-warn">{tr("المرحلة بانتظار إيضاح من منشئ المستند.")}</div>}
      {cur?.onBehalfOfName && wf.can.act && <div className="mx-5 mb-3 rounded-lg bg-accent-soft px-3 py-2.5 text-[13px]">{tr("تقرر في هذه المرحلة نيابةً عن {0} بالتفويض.", cur.onBehalfOfName)}</div>}
      {d.submit?.resubmit && <div className="mx-5 mb-3"><SubmitCard d={d} inline /></div>}
      {(wf.can.act || wf.can.answer || wf.can.cancel || wf.can.reassign) && (
        <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
          {wf.can.sign && <Button variant="primary" icon="edit" onClick={() => setSigning(true)}>{tr("توقيع")}</Button>}
          {wf.can.act && cur?.kind !== 'sign' && <Button variant="primary" icon="check" onClick={() => setAct('approve')}>{approveLabel}</Button>}
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
                  <b className="font-semibold">{a.byName || tr("النظام")}</b>{a.onBehalfOfName ? <span className="text-muted"> {tr("نيابةً عن {0}", a.onBehalfOfName)}</span> : null} <span className="text-muted">{a.label}{a.step ? ' · ' + a.step : ''}{a.toName ? ' ← ' + a.toName : ''}{a.version ? ' · ' + tr("الإصدار {0}", a.version) : ''}</span>
                  {a.note && <span className="block whitespace-pre-wrap">{trServer(a.note)}</span>}
                </span>
                <span className="shrink-0 text-[12px] text-muted" title={formatDateTime(a.at)}>{relativeTime(a.at)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {act && <ActDialog kind={act} wf={wf} approveLabel={approveLabel} onClose={() => setAct(null)} />}
      {signing && <SignDialog instanceId={wf.id} letterId={d.letter.id} onClose={() => setSigning(false)} />}
      {d.signatures.length > 0 && (
        <div className="border-t border-line px-5 py-3">
          <span className="text-[13px] font-semibold">{tr("التواقيع")}</span>
          <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0 text-[13px]">
            {d.signatures.map((s) => <li key={s.code} className="flex flex-wrap gap-x-2"><b>{s.name}</b><span className="text-muted">{s.step} · {formatDateTime(s.at)} · {tr("الإصدار {0}", s.version)}</span><span className="num text-muted">{tr("رمز التحقق: {0}", s.code)}</span></li>)}
          </ul>
        </div>
      )}
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
function SubmitCard({ d, inline }: { d: ChainHost; inline?: boolean }) {
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
              options={s.templates.map((t) => ({ value: t.id, label: t.id === s.defaultTemplateId ? (s.defaultSource === 'rule' ? tr("{0} (حسب قاعدة «{1}»)", t.name, s.ruleName || '') : tr("{0} (الافتراضية للنوع)", t.name)) : t.name }))} />}
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

export function TemplatesCard({ module = 'correspondence' }: { module?: string }) {
  const q = useApi<WfTemplate[]>('wf.templates', { module });
  const [editing, setEditing] = useState<{ item: WfTemplate | null } | null>(null);
  const [versions, setVersions] = useState<WfTemplate | null>(null);
  const [simulating, setSimulating] = useState(false);
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  return (
    <Card padded={false}>
      <CardHeader title={tr("السلاسل الإجرائية")} action={<span className="flex gap-2">
        {module === 'correspondence' && <Button size="sm" variant="ghost" icon="sliders" disabled={!q.data.length} onClick={() => setSimulating(true)}>{tr("محاكاة")}</Button>}
        <Button size="sm" icon="plus" onClick={() => setEditing({ item: null })}>{tr("سلسلة جديدة")}</Button>
      </span>} />
      {q.data.length === 0 ? <EmptyState title={tr("لا سلاسل بعد")} body={module === 'system' ? tr("السلسلة مراحل يمر بها الطلب: المدير المباشر ثم مدير الشركة مثلاً. اربطها بنوع الطلب من «ربط الطلبات».") : tr("السلسلة مراحل يمر بها المستند: مراجعة ثم اعتماد مثلاً. اربطها بنوع المستند لتكون الافتراضية له.")} /> : q.data.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-5 py-2.5">
          <span className="flex min-w-0 flex-1 basis-60 flex-col">
            <span className={cx('font-semibold', t.status === 'retired' && 'text-muted line-through')}>{t.name}</span>
            <span className="text-[12px] text-muted">{t.steps.map((s) => s.name + (s.conditionLabel ? ' (' + tr("إن {0}", s.conditionLabel) + ')' : '')).join(' ← ')}</span>
          </span>
          <span className="num text-[12px] text-muted">{tr("الإصدار {0}", t.version)}{t.running ? ' · ' + tr("{0} جارية", t.running) : ''}</span>
          {t.status === 'retired' && <Badge>{t.statusLabel}</Badge>}
          {t.version > 1 && <Button size="sm" variant="ghost" icon="history" onClick={() => setVersions(t)}>{tr("الإصدارات")}</Button>}
          <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing({ item: t })}>{tr("تعديل")}</Button>
        </div>
      ))}
      <p className="m-0 border-t border-line px-5 py-3 text-[13px] text-muted">{tr("كل حفظ إصدار جديد. السلاسل الجارية تكمل على الإصدار الذي بدأت به.")}</p>
      {editing && <TemplateDialog module={module} item={editing.item} onClose={() => setEditing(null)} />}
      {versions && <VersionsDialog t={versions} onClose={() => setVersions(null)} />}
      {simulating && <SimulateDialog templates={q.data} onClose={() => setSimulating(false)} />}
    </Card>
  );
}

function VersionsDialog({ t, onClose }: { t: WfTemplate; onClose: () => void }) {
  const q = useApi<WfVersion[]>('wf.template.versions', { id: t.id });
  return (
    <Dialog open onClose={onClose} title={tr("إصدارات «{0}»", t.name)} footer={<Button variant="ghost" className="flex-1" onClick={onClose}>{tr("إغلاق")}</Button>}>
      {q.isError ? <ErrorBox message={(q.error as Error).message} /> : !q.data ? <Loader /> : (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {q.data.map((v) => (
            <li key={v.version} className="flex flex-col gap-1 rounded-lg border border-line p-3">
              <span className="flex flex-wrap items-center gap-2"><Badge tone={v.current ? 'ok' : 'neutral'}>{tr("الإصدار {0}", v.version)}</Badge>
                {v.current && <span className="text-[12px] font-semibold text-ok">{tr("الحالي")}</span>}
                <span className="text-[12px] text-muted">{[v.savedByName, v.savedAt ? relativeTime(v.savedAt) : '', v.documents ? tr("{0} مستند", v.documents) : ''].filter(Boolean).join(' · ')}</span></span>
              <span className="text-[13px]">{v.steps.map((s) => s.name + (s.condition ? ' (' + tr("إن {0}", s.condition) + ')' : '')).join(' ← ')}</span>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

/** المحاكاة: نوع وقيم ومنشئ افتراضي ← السلسلة التي ستُختار ومراحلها ومسؤولوها */
function SimulateDialog({ templates, onClose }: { templates: WfTemplate[]; onClose: () => void }) {
  const lk = useCorLookups();
  const wl = useApi<WfLookups>('wf.lookups', { module: 'correspondence' }, { staleTime: 5 * 60_000 });
  const [typeId, setTypeId] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [conf, setConf] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<WfSimulation | null>(null);
  const [error, setError] = useState('');
  const run = useAction<Record<string, unknown>, WfSimulation>('wf.simulate', { silentError: true, onSuccess: setResult });
  const type = (lk.data?.types || []).find((t) => t.id === typeId);
  const submit = () => { setError(''); run.mutate({ module: 'correspondence', typeId, createdBy, confidentiality: conf, templateId: templateId || undefined, fields }, { onError: (e) => setError(e.message) }); };
  const SOURCE: Record<WfSimulation['source'], string> = { chosen: tr("السلسلة المختارة"), rule: tr("حسب قاعدة التوجيه"), default: tr("الافتراضية للنوع"), none: '' };
  return (
    <Dialog open onClose={onClose} wide title={tr("محاكاة السلسلة")} onSubmit={submit}
      footer={<><Button type="submit" variant="primary" className="flex-1" loading={run.isPending}>{tr("عرض المسار")}</Button><Button variant="ghost" onClick={onClose}>{tr("إغلاق")}</Button></>}>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-[13px] text-muted">{tr("اختر مستنداً افتراضياً لترى السلسلة التي ستُختار له ومراحلها ومن سيقرر فيها. لا يُحفظ شيء.")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={tr("نوع المستند")} value={typeId} onChange={(e) => { setTypeId(e.target.value); setFields({}); setResult(null); }}
            options={[{ value: '', label: tr("اختر") }, ...(lk.data?.types || []).map((t) => ({ value: t.id, label: t.name }))]} />
          <Select label={tr("المنشئ")} value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} options={[{ value: '', label: tr("أنا") }, ...(wl.data?.people || []).map((p) => ({ value: p.id, label: p.name }))]} />
          <Select label={tr("درجة السرية")} value={conf} onChange={(e) => setConf(e.target.value)} options={[{ value: '', label: tr("الافتراضية للنوع") }, ...(lk.data?.confidentialities || []).map((c) => ({ value: c.id, label: c.label }))]} />
          <Select label={tr("السلسلة")} value={templateId} onChange={(e) => setTemplateId(e.target.value)} options={[{ value: '', label: tr("كما ستُختار تلقائياً") }, ...templates.filter((t) => t.status === 'published').map((t) => ({ value: t.id, label: t.name }))]} />
          {type?.fields.filter((f) => ['money', 'number', 'select', 'text'].includes(f.kind)).map((f) => f.kind === 'select'
            ? <Select key={f.key} label={f.label} value={fields[f.key] || ''} onChange={(e) => setFields((x) => ({ ...x, [f.key]: e.target.value }))} options={[{ value: '', label: tr("اختر") }, ...f.options.map((o) => ({ value: o, label: o }))]} />
            : <TextInput key={f.key} label={f.label} ltr={f.kind !== 'text'} value={fields[f.key] || ''} onChange={(e) => setFields((x) => ({ ...x, [f.key]: e.target.value }))} />)}
        </div>
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
        {result && (result.template ? (
          <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <span className="font-semibold">{result.template.name} <span className="text-[12px] font-normal text-muted">{[SOURCE[result.source], result.ruleName ? '«' + result.ruleName + '»' : ''].filter(Boolean).join(' ')}</span></span>
            <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
              {result.steps.map((s) => (
                <li key={s.order} className={cx('flex flex-wrap items-center gap-2 text-[13px]', s.skipped && 'text-muted')}>
                  <span className="num flex h-6 w-6 items-center justify-center rounded-full bg-chip text-[12px] font-bold">{s.order}</span>
                  <span className={cx('font-semibold', s.skipped && 'line-through')}>{s.name}</span>
                  <span>{s.kindLabel}</span>
                  {s.skipped ? <Badge>{tr("تُتخطى")}</Badge> : <span>← {s.assignees.join('، ') || '—'}{s.fallback ? ' (' + tr("بديل") + ')' : ''}</span>}
                  {s.condition && <span className="basis-full text-[12px] text-muted">{tr("الشرط: {0}", s.condition)}</span>}
                </li>
              ))}
            </ol>
          </div>
        ) : <p className="m-0 rounded-lg bg-warn-bg px-3 py-2.5 text-warn">{tr("لا قاعدة توجيه تنطبق ولا سلسلة افتراضية لهذا النوع: يختار المرسل السلسلة بنفسه.")}</p>)}
      </div>
    </Dialog>
  );
}

/** إعدادات السلاسل: الملخص البريدي اليومي بدل رسالة لكل حدث (حصة البريد) */
export function ChainSettingsCard() {
  const q = useApi<{ digest: boolean }>('wf.settings');
  const save = useAction<{ digest: boolean }>('wf.settings.save', { invalidate: ['wf.settings'], success: tr("حُفظ") });
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="m-0 text-[16px] font-semibold">{tr("بريد السلاسل")}</h2>
      {!q.data ? <Loader /> : (
        <Checkbox label={tr("ملخص يومي واحد بدل رسالة لكل حدث")} description={tr("تبقى الإشعارات داخل النظام كما هي. مناسب لحساب Gmail العادي (نحو 100 رسالة يومياً).")}
          checked={q.data.digest} onChange={(v) => save.mutate({ digest: v })} />
      )}
    </Card>
  );
}

// ───────── قواعد التوجيه ─────────
export function RulesCard({ module = 'correspondence', templatesModule, embedded }: { module?: string; templatesModule?: string; embedded?: boolean }) {
  const q = useApi<WfRule[]>('wf.rules', { module });
  const [editing, setEditing] = useState<{ item: WfRule | null } | null>(null);
  const move = useAction<{ id: string; dir: 'up' | 'down' }>('wf.rule.move', { invalidate: ['wf.rules', 'cor.get'] });
  const remove = useAction<{ id: string }>('wf.rule.remove', { invalidate: ['wf.rules', 'cor.get'], success: tr("حُذفت القاعدة") });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  return (
    <Card padded={false} className={embedded ? '!border-0 !rounded-none' : undefined}>
      <CardHeader title={tr("قواعد التوجيه")} action={<Button size="sm" icon="plus" onClick={() => setEditing({ item: null })}>{tr("قاعدة جديدة")}</Button>} />
      {q.data.length === 0 ? <EmptyState title={tr("لا قواعد")} body={tr("القاعدة تختار السلسلة تلقائياً حسب النوع والقسم والسرية وقيمة حقل، مثل: مذكرة بمبلغ أكبر من 5,000 ← سلسلة المدير العام.")} /> : q.data.map((r, i, arr) => (
        <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-5 py-2.5">
          <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-chip text-[12px] font-bold">{i + 1}</span>
          <span className="flex min-w-0 flex-1 basis-56 flex-col">
            <span className={cx('font-semibold', !r.active && 'text-muted line-through')}>{r.name || r.summary}</span>
            <span className="text-[12px] text-muted">{r.summary} ← {r.templateName}{!r.templateLive ? ' (' + tr("موقوفة") + ')' : ''}</span>
          </span>
          {!r.active && <Badge>{tr("موقوفة")}</Badge>}
          <IconAction icon="chevronDown" rotate label={tr("أعلى")} disabled={i === 0} onClick={() => move.mutate({ id: r.id, dir: 'up' })} />
          <IconAction icon="chevronDown" label={tr("أسفل")} disabled={i === arr.length - 1} onClick={() => move.mutate({ id: r.id, dir: 'down' })} />
          <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing({ item: r })}>{tr("تعديل")}</Button>
          <IconAction icon="trash" label={tr("حذف القاعدة")} onClick={() => remove.mutate({ id: r.id })} />
        </div>
      ))}
      <p className="m-0 border-t border-line px-5 py-3 text-[13px] text-muted">{tr("تُفحص بالترتيب، وأول قاعدة تنطبق تحدد السلسلة. إن لم تنطبق قاعدة فالسلسلة الافتراضية للنوع، ويبقى للمرسل أن يغيّرها.")}</p>
      {editing && <RuleDialog module={module} templatesModule={templatesModule || module} item={editing.item} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function RuleDialog({ module, templatesModule, item, onClose }: { module: string; templatesModule: string; item: WfRule | null; onClose: () => void }) {
  const wl = useApi<WfLookups>('wf.lookups', { module }, { staleTime: 5 * 60_000 });
  const tq = useApi<WfTemplate[]>('wf.templates', { module: templatesModule });
  const [f, setF] = useState(() => ({ name: item?.name || '', typeId: item?.typeId || '', departmentId: item?.departmentId || '', confidentiality: item?.confidentiality || '', templateId: item?.templateId || '', active: item ? item.active : true }));
  const [cond, setCond] = useState<{ field: string; op: CondOp; value: string }>({ field: item?.field || '', op: item?.op || 'eq', value: item?.value == null ? '' : condInput(item, wl.data?.conditionFields) });
  const [error, setError] = useState('');
  const save = useAction('wf.rule.save', { invalidate: ['wf.rules', 'cor.get'], success: tr("حُفظت القاعدة"), silentError: true, onSuccess: onClose });
  const fields = wl.data?.conditionFields || [];
  const opts = (key: string) => (fields.find((x) => x.key === key)?.options || []).map((o) => ({ value: o.id, label: o.label }));
  const submit = () => { setError(''); save.mutate({ id: item?.id, module, ...f, field: cond.field, op: cond.op, value: cond.value }, { onError: (e) => setError(e.message) }); };
  return (
    <Dialog open onClose={onClose} wide title={item ? tr("تعديل القاعدة") : tr("قاعدة توجيه جديدة")} onSubmit={submit}
      footer={<><Button type="submit" variant="primary" className="flex-1" loading={save.isPending}>{tr("حفظ")}</Button><Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      {!wl.data ? <Loader /> : (
        <div className="flex flex-col gap-3">
          <TextInput label={tr("اسم القاعدة (اختياري)")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} placeholder={tr("المبالغ الكبيرة، مذكرات التصميم…")} />
          <span className="text-[13px] font-semibold">{tr("تنطبق على")}</span>
          <div className="grid gap-3 sm:grid-cols-3">
            {opts('$type').length > 0 && <Select label={tr("نوع المستند")} value={f.typeId} onChange={(e) => setF({ ...f, typeId: e.target.value })} options={[{ value: '', label: tr("كل الأنواع") }, ...opts('$type')]} />}
            <Select label={tr("قسم المنشئ")} value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })} options={[{ value: '', label: tr("كل الأقسام") }, ...opts('$dept')]} />
            {opts('$conf').length > 0 && <Select label={tr("درجة السرية")} value={f.confidentiality} onChange={(e) => setF({ ...f, confidentiality: e.target.value })} options={[{ value: '', label: tr("كل الدرجات") }, ...opts('$conf')]} />}
          </div>
          <ConditionEditor fields={fields.filter((x) => !x.key.startsWith('$') && (!f.typeId || x.typeId === f.typeId))} ops={wl.data.ops} value={cond} onChange={setCond} label={tr("وحقل (اختياري)")} />
          <Select label={tr("السلسلة")} required value={f.templateId} onChange={(e) => setF({ ...f, templateId: e.target.value })}
            options={[{ value: '', label: tr("اختر") }, ...(tq.data || []).filter((t) => t.status === 'published' || t.id === f.templateId).map((t) => ({ value: t.id, label: t.name }))]} />
          <Select label={tr("الحالة")} value={String(f.active)} onChange={(e) => setF({ ...f, active: e.target.value === 'true' })} options={[{ value: 'true', label: tr("نشطة") }, { value: 'false', label: tr("موقوفة") }]} />
          {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
        </div>
      )}
    </Dialog>
  );
}

/** قيمة الشرط كما تُكتب في النموذج: المبلغ من الفلس إلى الدينار */
function condInput(c: { field: string; value: string | number } | null | undefined, fields?: CondField[]) {
  if (!c || c.value == null || c.value === '') return '';
  const f = (fields || []).find((x) => x.key === c.field);
  return f?.kind === 'money' ? (Number(c.value) / 1000).toString() : String(c.value);
}

/** محرر شرط: الحقل، والعملية (الأكبر والأصغر للأرقام والمبالغ)، والقيمة */
function ConditionEditor({ fields, ops, value, onChange, label }: { fields: CondField[]; ops: { id: string; label: string }[]; value: { field: string; op: CondOp; value: string }; onChange: (v: { field: string; op: CondOp; value: string }) => void; label: string }) {
  const f = fields.find((x) => x.key === value.field);
  const numeric = f?.kind === 'money' || f?.kind === 'number';
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <Select label={label} value={value.field} onChange={(e) => onChange({ field: e.target.value, op: 'eq', value: '' })} options={[{ value: '', label: tr("بلا شرط") }, ...fields.map((x) => ({ value: x.key, label: x.label }))]} />
      {f && <Select label={tr("العملية")} value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value as CondOp })} options={ops.filter((o) => numeric || o.id === 'eq' || o.id === 'neq').map((o) => ({ value: o.id, label: o.label }))} />}
      {f && (f.options.length ? <Select label={tr("القيمة")} required value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value })} options={[{ value: '', label: tr("اختر") }, ...f.options.map((o) => ({ value: o.id, label: o.label }))]} />
        : <TextInput label={f.kind === 'money' ? tr("القيمة (د.ك)") : tr("القيمة")} required ltr={numeric} inputMode={numeric ? 'decimal' : undefined} value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value })} />)}
    </div>
  );
}

interface StepDraft {
  name: string; kind: StepKind; type: AssigneeType; id: string; role: string; onReject: 'end' | 'creator'; cond: { field: string; op: CondOp; value: string };
  parallel?: boolean; mode?: StepMode; count?: number; slaHours?: number; workingDays?: boolean; notifyManager?: boolean; reassignTo?: string;
}

function TemplateDialog({ module, item, onClose }: { module: string; item: WfTemplate | null; onClose: () => void }) {
  const lk = useApi<WfLookups>('wf.lookups', { module }, { staleTime: 5 * 60_000 });
  const sys = module === 'system';
  const [name, setName] = useState(item?.name || '');
  const [description, setDescription] = useState(item?.description || '');
  const [status, setStatus] = useState(item?.status || 'published');
  const NONE = { field: '', op: 'eq' as CondOp, value: '' };
  const [steps, setSteps] = useState<StepDraft[]>(() => item ? item.steps.map((s, i, arr) => ({
    name: s.name, kind: s.kind, type: s.assignee.type, id: s.assignee.id || s.assignee.key || '', role: sys && s.assignee.role ? (s.assignee.module || '') + '|' + s.assignee.role : s.assignee.role || '', onReject: s.onReject, cond: NONE, raw: s.condition,
    parallel: i > 0 && s.group === arr[i - 1].group, mode: s.mode, count: s.count, slaHours: s.slaHours, workingDays: s.workingDays,
    notifyManager: s.escalation ? s.escalation.notifyManager : true, reassignTo: s.escalation?.reassignTo || ''
  } as StepDraft & { raw: WfTemplate['steps'][number]['condition'] })) : sys ? [
    { name: tr("المدير المباشر"), kind: 'approve', type: 'direct_manager', id: '', role: '', onReject: 'creator', cond: NONE },
    { name: tr("مدير الشركة"), kind: 'approve', type: 'company_manager', id: '', role: '', onReject: 'end', cond: NONE }
  ] : [
    { name: tr("مراجعة المدير المباشر"), kind: 'review', type: 'direct_manager', id: '', role: '', onReject: 'creator', cond: NONE },
    { name: tr("اعتماد مدير المستندات"), kind: 'approve', type: 'role', id: '', role: 'manager', onReject: 'end', cond: NONE }
  ]);
  const [drag, setDrag] = useState<number | null>(null);
  const [condReady, setCondReady] = useState(!item);
  // قيم الشروط المحفوظة تُحوَّل للنموذج بعد وصول أنواع الحقول (المبلغ بالدينار)
  if (!condReady && lk.data) {
    setCondReady(true);
    setSteps((l) => l.map((s) => { const raw = (s as StepDraft & { raw?: { field: string; op: CondOp; value: string | number } | null }).raw; return raw ? { ...s, cond: { field: raw.field, op: raw.op, value: condInput(raw, lk.data!.conditionFields) } } : s; }));
  }
  const [error, setError] = useState('');
  const save = useAction('wf.template.save', { invalidate: TPL_KEYS, success: tr("حُفظت السلسلة"), silentError: true, onSuccess: onClose });
  const L = lk.data;
  const set = (i: number, ch: Partial<StepDraft>) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, ...ch } : x)));
  const move = (i: number, d: -1 | 1) => setSteps((l) => { const n = l.slice(); const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const submit = () => {
    setError('');
    save.mutate({
      id: item?.id, module, name, description, status,
      steps: steps.map((s, i) => ({
        name: s.name, kind: s.kind, onReject: s.onReject, assignee: { type: s.type, id: s.type !== 'party' && s.id ? s.id : undefined, key: s.type === 'party' ? s.id : undefined, role: s.role || undefined }, condition: s.cond.field ? s.cond : undefined,
        parallel: i > 0 && !!s.parallel, mode: s.mode || 'any', count: s.count || 2, slaHours: s.slaHours || 0, workingDays: s.workingDays !== false,
        escalation: { notifyManager: s.notifyManager !== false, reassignTo: s.reassignTo || '' }
      }))
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
              <Button size="sm" variant="ghost" icon="plus" disabled={steps.length >= 15} onClick={() => setSteps((l) => [...l, { name: '', kind: 'approve', type: 'role', id: '', role: 'manager', onReject: 'end', cond: NONE }])}>{tr("إضافة مرحلة")}</Button>
            </div>
            {steps.map((s, i) => (
              <div key={i} className={cx('flex flex-col gap-2 border-t border-line pt-2 first-of-type:border-t-0', drag === i && 'opacity-50')}
                onDragOver={(e) => { if (drag !== null) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); if (drag === null || drag === i) return; setSteps((l) => { const n = l.slice(); const [x] = n.splice(drag, 1); n.splice(i, 0, x); return n; }); setDrag(null); }}>
                <div className="flex items-center gap-2">
                  <span draggable onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)} title={tr("اسحب لتغيير الترتيب")}
                    className="num flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded-full bg-chip text-[12px] font-bold">{i + 1}</span>
                  <TextInput label={tr("اسم المرحلة")} required value={s.name} onChange={(e) => set(i, { name: e.target.value })} maxLength={60} className="flex-1" />
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Select label={tr("النوع")} value={s.kind} onChange={(e) => set(i, { kind: e.target.value as StepKind })} options={L.kinds.map((k) => ({ value: k.id, label: k.label }))}
                    hint={s.kind === 'inform' ? tr("إحاطة فقط: لا تنتظر قراراً") : s.kind === 'approve' ? tr("لا يعتمدها منشئ المستند") : s.kind === 'sign' ? tr("يختم صاحبها توقيعه على الملف الرئيسي") : undefined} />
                  <Select label={tr("المسؤول")} value={s.type} onChange={(e) => set(i, { type: e.target.value as AssigneeType, id: '', role: e.target.value === 'role' ? (sys ? L.roles[0]?.id || '' : 'manager') : '' })} options={L.assignees.filter((a) => a.id !== 'party' || (L.parties || []).length).map((a) => ({ value: a.id, label: a.label }))} />
                  {s.type === 'user' && <Select label={tr("المستخدم")} required value={s.id} onChange={(e) => set(i, { id: e.target.value })} options={[{ value: '', label: tr("اختر") }, ...L.people.map((p) => ({ value: p.id, label: p.name }))]} />}
                  {s.type === 'role' && <Select label={tr("الدور")} required value={s.role} onChange={(e) => set(i, { role: e.target.value })} options={L.roles.map((r) => ({ value: r.id, label: r.label }))} />}
                  {s.type === 'party' && <Select label={tr("الطرف")} required value={s.id} onChange={(e) => set(i, { id: e.target.value })} options={[{ value: '', label: tr("اختر") }, ...(L.parties || []).map((p) => ({ value: p.id, label: p.label }))]} hint={tr("شخص من الطلب نفسه، مثل من أسند المهمة")} />}
                  {s.type === 'dept_manager' && <Select label={tr("القسم")} required value={s.id} onChange={(e) => set(i, { id: e.target.value })} options={[{ value: '', label: tr("اختر") }, ...L.departments.map((d) => ({ value: d.id, label: d.name }))]} />}
                </div>
                <ConditionEditor fields={L.conditionFields} ops={L.ops} value={s.cond} onChange={(v) => set(i, { cond: v })} label={tr("تظهر المرحلة إن (اختياري)")} />
                <div className="grid gap-2 sm:grid-cols-3">
                  {s.kind !== 'inform' && s.kind !== 'sign' && <Select label={tr("يقرر فيها")} value={s.mode || 'any'} onChange={(e) => set(i, { mode: e.target.value as StepMode })} options={L.modes.map((m) => ({ value: m.id, label: m.label }))}
                    hint={tr("يهم حين يكون المسؤول دوراً فيه أكثر من شخص")} />}
                  {s.mode === 'count' && <TextInput label={tr("عدد الموافقات")} ltr inputMode="numeric" value={String(s.count || 2)} onChange={(e) => set(i, { count: Number(e.target.value) || 0 })} />}
                  {s.kind !== 'inform' && <TextInput label={tr("المدة بالساعات (اختياري)")} ltr inputMode="numeric" value={s.slaHours ? String(s.slaHours) : ''} onChange={(e) => set(i, { slaHours: Number(e.target.value) || 0 })} hint={tr("مثلاً 24 = يوم عمل")} />}
                </div>
                {s.kind !== 'inform' && !!s.slaHours && (
                  <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                    <Checkbox label={tr("أيام العمل فقط")} checked={s.workingDays !== false} onChange={(v) => set(i, { workingDays: v })} />
                    <Checkbox label={tr("إبلاغ مدير المسؤول بعد يوم من التأخر")} checked={s.notifyManager !== false} onChange={(v) => set(i, { notifyManager: v })} />
                    <Select label={tr("بعد يومين من التأخر تنتقل إلى")} className="min-w-[200px]" value={s.reassignTo || ''} onChange={(e) => set(i, { reassignTo: e.target.value })}
                      options={[{ value: '', label: tr("لا تنتقل") }, ...L.people.map((p) => ({ value: p.id, label: p.name }))]} />
                  </div>
                )}
                {i > 0 && <Checkbox label={tr("بالتوازي مع المرحلة السابقة")} description={tr("تُفتحان معاً، والتالية تنتظر اكتمالهما")} checked={!!s.parallel} onChange={(v) => set(i, { parallel: v })} />}
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
