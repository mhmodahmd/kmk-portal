/**
 * «النظام ← السلاسل الإجرائية» (مدير النظام، docs/09): ربط كل نوع طلب بسلسلة أو مساره المدمج، والسلاسل العامة،
 * وقواعد التوجيه لكل نوع، والمحاكاة، وبريد السلاسل.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useAction, useApi } from '../../lib/useApi';
import { Badge, Card, CardHeader, ErrorBox, Loader, PageHeader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Select, TextInput } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import { ChainSettingsCard, RulesCard, TemplatesCard } from '../correspondence/Chain';
import type { WfLookups, WfSimulation, WfTemplate } from '../correspondence/types';

interface Binding { requestType: string; label: string; moduleLabel: string; builtin: string; templateId: string; templateName: string; templateLive: boolean; running: number; rules: number }

export default function WorkflowPage() {
  const lk = useApi<WfLookups>('wf.lookups', { module: 'system' }, { staleTime: 60_000 });
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <PageHeader eyebrow={tr("النظام")} title={tr("السلاسل الإجرائية")} subtitle={tr("اربط كل نوع طلب بسلسلة، أو اتركه على مساره الحالي. الطلبات الجارية تكمل على ما بدأت به.")} />
      {lk.data && !lk.data.companyManager && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warn-bg px-4 py-3 text-warn">
          <Icon name="alert" size={16} />{tr("لم يُحدَّد «مدير الشركة» بعد، فلا يمكن استخدامه في السلاسل.")}
          <Link to="/settings/company" className="font-semibold text-warn">{tr("تحديده من بيانات الشركة")}</Link>
        </div>
      )}
      <BindingsCard />
      <TemplatesCard module="system" />
      <ChainSettingsCard />
    </div>
  );
}

function BindingsCard() {
  const q = useApi<Binding[]>('wf.bindings');
  const tq = useApi<WfTemplate[]>('wf.templates', { module: 'system' });
  const save = useAction<{ requestType: string; templateId: string }>('wf.binding.save', { invalidate: ['wf.bindings'], success: tr("حُفظ الربط") });
  const [rules, setRules] = useState('');
  const [sim, setSim] = useState<Binding | null>(null);
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  const live = (tq.data || []).filter((t) => t.status === 'published');
  return (
    <Card padded={false}>
      <CardHeader title={tr("ربط الطلبات")} />
      {q.data.map((b) => (
        <div key={b.requestType} className="border-t border-line first:border-t-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
            <span className="flex min-w-0 flex-1 basis-48 flex-col">
              <span className="font-semibold">{b.label} <span className="text-[12px] font-normal text-muted">· {b.moduleLabel}</span></span>
              <span className="text-[12px] text-muted">{b.templateId ? tr("سلسلة «{0}»", b.templateName) : tr("المسار الحالي: {0}", b.builtin)}{b.running ? ' · ' + tr("{0} جارية", b.running) : ''}</span>
            </span>
            <Select label={tr("المسار")} className="min-w-[220px]" value={b.templateId} onChange={(e) => save.mutate({ requestType: b.requestType, templateId: e.target.value })}
              options={[{ value: '', label: tr("المسار الحالي (المدمج)") }, ...live.map((t) => ({ value: t.id, label: t.name })), ...(b.templateId && !live.some((t) => t.id === b.templateId) ? [{ value: b.templateId, label: b.templateName }] : [])]} />
            <Button size="sm" variant="ghost" icon="sliders" onClick={() => setSim(b)}>{tr("محاكاة")}</Button>
            <Button size="sm" variant="ghost" icon="filter" aria-expanded={rules === b.requestType} onClick={() => setRules((x) => (x === b.requestType ? '' : b.requestType))}>
              {b.rules ? tr("القواعد · {0}", b.rules) : tr("القواعد")}
            </Button>
            {b.templateId && <Badge tone="info">{tr("مربوط")}</Badge>}
          </div>
          {rules === b.requestType && <div className="border-t border-line bg-bg"><RulesCard module={b.requestType} templatesModule="system" embedded /></div>}
        </div>
      ))}
      <p className="m-0 border-t border-line px-5 py-3 text-[13px] text-muted">{tr("أنشئ السلسلة من «السلاسل الإجرائية» أدناه ثم اخترها هنا. القواعد تختار سلسلة أخرى لحالات محددة، مثل إجازة أطول من 5 أيام.")}</p>
      {sim && <SimulateType b={sim} onClose={() => setSim(null)} />}
    </Card>
  );
}

/** محاكاة نوع طلب: موظف وقيم حقوله ← المسار ومن سيقرر */
function SimulateType({ b, onClose }: { b: Binding; onClose: () => void }) {
  const lk = useApi<WfLookups>('wf.lookups', { module: b.requestType }, { staleTime: 60_000 });
  const [createdBy, setCreatedBy] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [res, setRes] = useState<WfSimulation | null>(null);
  const [error, setError] = useState('');
  const run = useAction<Record<string, unknown>, WfSimulation>('wf.simulate', { silentError: true, onSuccess: setRes });
  const fields = (lk.data?.conditionFields || []).filter((f) => f.key.startsWith(b.requestType + ':'));
  const submit = () => {
    setError('');
    const v: Record<string, string | number> = {};
    fields.forEach((f) => { if (values[f.key]) v[f.key] = f.kind === 'number' ? Number(values[f.key]) : values[f.key]; });
    run.mutate({ module: b.requestType, createdBy, values: v }, { onError: (e) => setError(e.message) });
  };
  return (
    <Dialog open onClose={onClose} wide title={tr("محاكاة: {0}", b.label)} onSubmit={submit}
      footer={<><Button type="submit" variant="primary" className="flex-1" loading={run.isPending}>{tr("عرض المسار")}</Button><Button variant="ghost" onClick={onClose}>{tr("إغلاق")}</Button></>}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={tr("مقدّم الطلب")} value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} options={[{ value: '', label: tr("أنا") }, ...(lk.data?.people || []).map((p) => ({ value: p.id, label: p.name }))]} />
          {fields.map((f) => f.options.length
            ? <Select key={f.key} label={f.label} value={values[f.key] || ''} onChange={(e) => setValues((x) => ({ ...x, [f.key]: e.target.value }))} options={[{ value: '', label: tr("اختر") }, ...f.options.map((o) => ({ value: o.id, label: o.label }))]} />
            : <TextInput key={f.key} label={f.label} ltr inputMode="numeric" value={values[f.key] || ''} onChange={(e) => setValues((x) => ({ ...x, [f.key]: e.target.value }))} />)}
        </div>
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
        {res && (res.template ? (
          <ol className="m-0 flex list-none flex-col gap-1.5 rounded-lg border border-line p-3 text-[13px]">
            <li className="font-semibold">{res.template.name}{res.ruleName ? ' · ' + tr("حسب قاعدة «{0}»", res.ruleName) : ''}</li>
            {res.steps.map((s) => (
              <li key={s.order} className={cx('flex flex-wrap gap-2', s.skipped && 'text-muted line-through')}>
                <span className="num">{s.order}.</span><b>{s.name}</b><span>{s.skipped ? tr("تُتخطى") : '← ' + (s.assignees.join('، ') || '—') + (s.fallback ? ' (' + tr("بديل") + ')' : '')}</span>
              </li>
            ))}
          </ol>
        ) : <p className="m-0 rounded-lg bg-chip px-3 py-2.5">{tr("يسير على مساره الحالي: {0}", b.builtin)}</p>)}
      </div>
    </Dialog>
  );
}
