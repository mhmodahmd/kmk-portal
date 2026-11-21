import { useEffect, useState } from 'react';
import { tr } from '../../lib/i18n';
import { useAction, useApi } from '../../lib/useApi';
import { Badge, Card, CardHeader, ErrorBox, Loader } from '../../ui/Display';
import { Button, IconAction } from '../../ui/Button';
import { Checkbox, Select, TextInput } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { cx } from '../../ui/cx';
import { useCorLookups } from './shared';
import type { Category, DocType, FieldKind } from './types';

const KEYS = ['cor.categories', 'cor.lookups'];
const TYPE_KEYS = ['cor.types', 'cor.lookups', 'cor.list', 'cor.get'];

/** إعدادات المستندات (مدير المستندات): أنواع المستندات وحقولها، والتصنيفات */
export default function CorSettingsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <TypesCard />
      <CategoriesCard />
    </div>
  );
}

/** التصنيفات: إضافة، تعديل، إيقاف، ترتيب */
function CategoriesCard() {
  const q = useApi<Category[]>('cor.categories');
  const [editing, setEditing] = useState<{ item: Category | null } | null>(null);
  const move = useAction('cor.category.move', { invalidate: KEYS });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  return (
    <>
      <Card padded={false}>
        <CardHeader title={tr("تصنيفات المراسلات")} action={<Button size="sm" icon="plus" onClick={() => setEditing({ item: null })}>{tr("إضافة")}</Button>} />
        {q.data.map((it, i, arr) => (
          <div key={it.id} className="flex items-center gap-2 border-t border-line px-5 py-2.5">
            <span className={it.active ? 'flex-1' : 'flex-1 text-muted line-through'}>{it.name}</span>
            {!it.active && <Badge>{tr("موقوف")}</Badge>}
            <IconAction icon="chevronDown" rotate label={tr("أعلى")} disabled={i === 0} onClick={() => move.mutate({ id: it.id, dir: 'up' })} />
            <IconAction icon="chevronDown" label={tr("أسفل")} disabled={i === arr.length - 1} onClick={() => move.mutate({ id: it.id, dir: 'down' })} />
            <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing({ item: it })}>{tr("تعديل")}</Button>
          </div>
        ))}
        <p className="m-0 border-t border-line px-5 py-3 text-[13px] text-muted">{tr("التصنيف الموقوف لا يظهر في الاختيارات، وتبقى الخطابات المسجلة به كما هي. إعادة التسمية تُطبَّق على الخطابات المسجلة.")}</p>
      </Card>
      <CategoryDialog editing={editing} onClose={() => setEditing(null)} />
    </>
  );
}

/** أنواع المستندات (مدير المستندات): الاسم والرمز والاتجاه ونمط الترقيم والسرية الافتراضية والحقول الخاصة */
function TypesCard() {
  const q = useApi<DocType[]>('cor.types');
  const [editing, setEditing] = useState<{ item: DocType | null } | null>(null);
  const move = useAction('cor.type.move', { invalidate: TYPE_KEYS });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  return (
    <Card padded={false}>
      <CardHeader title={tr("أنواع المستندات")} action={<Button size="sm" icon="plus" onClick={() => setEditing({ item: null })}>{tr("نوع جديد")}</Button>} />
      {q.data.map((t, i, arr) => (
        <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-5 py-2.5">
          <span className="flex min-w-0 flex-1 basis-52 flex-col">
            <span className={cx('font-semibold', !t.active && 'text-muted line-through')}>{t.name} <span className="num text-[12px] font-normal text-muted">{t.code}</span></span>
            <span className="text-[12px] text-muted">{[t.directionLabel, t.fields.filter((f) => f.active).length ? tr("{0} حقل", t.fields.filter((f) => f.active).length) : '', tr("{0} مستند", t.documents)].filter(Boolean).join(' · ')}</span>
          </span>
          {t.builtin && <Badge tone="info">{tr("مدمج")}</Badge>}
          {!t.active && <Badge>{tr("موقوف")}</Badge>}
          <IconAction icon="chevronDown" rotate label={tr("أعلى")} disabled={i === 0} onClick={() => move.mutate({ id: t.id, dir: 'up' })} />
          <IconAction icon="chevronDown" label={tr("أسفل")} disabled={i === arr.length - 1} onClick={() => move.mutate({ id: t.id, dir: 'down' })} />
          <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing({ item: t })}>{tr("تعديل")}</Button>
        </div>
      ))}
      <p className="m-0 border-t border-line px-5 py-3 text-[13px] text-muted">{tr("الوارد والصادر نوعان مدمجان: يتغيّر اسمهما وحقولهما فقط. النوع الموقوف لا يظهر عند التسجيل، وتبقى مستنداته كما هي.")}</p>
      {editing && <TypeDialog item={editing.item} onClose={() => setEditing(null)} />}
    </Card>
  );
}

interface FieldDraft { id?: string; label: string; kind: FieldKind; options: string; required: boolean; inList: boolean }
const KINDS: FieldKind[] = ['text', 'number', 'money', 'date', 'select', 'user', 'client', 'project'];
const KIND_LABEL: Record<FieldKind, string> = { text: tr("نص"), number: tr("رقم"), money: tr("مبلغ"), date: tr("تاريخ"), select: tr("قائمة"), user: tr("شخص"), client: tr("عميل"), project: tr("مشروع") };

function TypeDialog({ item, onClose }: { item: DocType | null; onClose: () => void }) {
  const lk = useCorLookups();
  const [f, setF] = useState(() => ({
    name: item?.name || '', code: item?.code || '', direction: item?.direction || 'internal', numberPattern: item?.numberPattern || '{code}-{year}-{seq:4}',
    confidentiality: item?.confidentiality || 'internal', active: item ? item.active : true
  }));
  const [fields, setFields] = useState<FieldDraft[]>(() => (item?.fields || []).filter((x) => x.active).map((x) => ({ id: x.id, label: x.label, kind: x.kind, options: x.options.join('، '), required: x.required, inList: x.inList })));
  const [error, setError] = useState('');
  const save = useAction('cor.type.save', { invalidate: TYPE_KEYS, success: tr("حُفظ النوع"), silentError: true, onSuccess: onClose });
  const builtin = !!item?.builtin;
  const stopped = (item?.fields || []).filter((x) => !x.active);
  const setField = (i: number, ch: Partial<FieldDraft>) => setFields((list) => list.map((x, j) => (j === i ? { ...x, ...ch } : x)));
  const moveField = (i: number, d: -1 | 1) => setFields((list) => { const n = list.slice(); const j = i + d; if (j < 0 || j >= n.length) return list; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const preview = f.numberPattern.replace(/\{code\}/g, (f.code || 'CODE').toUpperCase()).replace(/\{year\}/g, (lk.data?.today || '2026').slice(0, 4)).replace(/\{seq(?::(\d))?\}/, (_, n) => '1'.padStart(Number(n || 4), '0'));
  const submit = () => {
    setError('');
    save.mutate({ id: item?.id, ...f, fields: fields.map((x) => ({ id: x.id, label: x.label, kind: x.kind, options: x.options, required: x.required, inList: x.inList })) }, { onError: (e) => setError(e.message) });
  };
  return (
    <Dialog open onClose={onClose} wide title={item ? tr("تعديل نوع المستند") : tr("نوع مستند جديد")} onSubmit={submit}
      footer={<><Button type="submit" variant="primary" className="flex-1" loading={save.isPending}>{tr("حفظ")}</Button><Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label={tr("الاسم")} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} autoFocus placeholder={tr("مذكرة داخلية، عقد…")} />
          <TextInput label={tr("الرمز")} required ltr value={f.code} disabled={builtin} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} maxLength={10}
            hint={builtin ? tr("رمز النوع المدمج ثابت") : tr("حروف إنجليزية كبيرة وأرقام، يظهر في رقم المستند")} />
          <Select label={tr("الاتجاه")} value={f.direction} disabled={builtin || (item?.documents || 0) > 0} onChange={(e) => setF({ ...f, direction: e.target.value as DocType['direction'] })}
            options={(lk.data?.directions || []).map((d) => ({ value: d.id, label: d.label }))}
            hint={(item?.documents || 0) > 0 ? tr("لا يتغيّر اتجاه نوع له مستندات") : tr("داخلي للمذكرات والتعاميم والقرارات")} />
          <Select label={tr("درجة السرية الافتراضية")} value={f.confidentiality} onChange={(e) => setF({ ...f, confidentiality: e.target.value as DocType['confidentiality'] })}
            options={(lk.data?.confidentialities || []).map((c) => ({ value: c.id, label: c.label }))} hint={tr("يمكن تغييرها لكل مستند عند تسجيله")} />
          <TextInput label={tr("نمط الترقيم")} required ltr value={f.numberPattern} onChange={(e) => setF({ ...f, numberPattern: e.target.value })} maxLength={40}
            hint={tr("مثال الرقم: {0} · المتاح: {code} و{year} و{seq:4} في آخره", preview)} />
          {!builtin && <Select label={tr("الحالة")} value={String(f.active)} onChange={(e) => setF({ ...f, active: e.target.value === 'true' })} options={[{ value: 'true', label: tr("نشط") }, { value: 'false', label: tr("موقوف (لا يظهر عند التسجيل)") }]} />}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[14px] font-semibold">{fields.length ? tr("الحقول الخاصة · {0}", fields.length) : tr("الحقول الخاصة")}</span>
            <Button size="sm" variant="ghost" icon="plus" disabled={fields.length >= 20} onClick={() => setFields((l) => [...l, { label: '', kind: 'text', options: '', required: false, inList: false }])}>{tr("إضافة حقل")}</Button>
          </div>
          {!fields.length && <p className="m-0 text-[13px] text-muted">{tr("بيانات إضافية تُطلب عند تسجيل هذا النوع، مثل المبلغ أو رقم العقد أو تاريخ التنفيذ.")}</p>}
          {fields.map((x, i) => (
            <div key={x.id || 'n' + i} className="flex flex-col gap-2 border-t border-line pt-2 first-of-type:border-t-0">
              <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
                <TextInput label={tr("اسم الحقل")} required value={x.label} onChange={(e) => setField(i, { label: e.target.value })} maxLength={60} />
                <Select label={tr("نوع الحقل")} value={x.kind} disabled={!!x.id} onChange={(e) => setField(i, { kind: e.target.value as FieldKind })}
                  options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} hint={x.id ? tr("لا يتغيّر بعد الإنشاء") : undefined} />
              </div>
              {x.kind === 'select' && <TextInput label={tr("الخيارات (مفصولة بفاصلة)")} required value={x.options} onChange={(e) => setField(i, { options: e.target.value })} placeholder={tr("عادي، عاجل، عاجل جداً")} />}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Checkbox label={tr("إلزامي")} checked={x.required} onChange={(v) => setField(i, { required: v })} />
                <Checkbox label={tr("يظهر في القائمة")} checked={x.inList} onChange={(v) => setField(i, { inList: v })} />
                <span className="flex-1" />
                <IconAction icon="chevronDown" rotate label={tr("أعلى")} disabled={i === 0} onClick={() => moveField(i, -1)} />
                <IconAction icon="chevronDown" label={tr("أسفل")} disabled={i === fields.length - 1} onClick={() => moveField(i, 1)} />
                <Button size="sm" variant="ghost" icon="trash" onClick={() => setFields((l) => l.filter((_, j) => j !== i))}>{x.id ? tr("إيقاف") : tr("حذف")}</Button>
              </div>
            </div>
          ))}
          {stopped.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2 text-[12px] text-muted">
              {tr("حقول موقوفة (تبقى قيمها في المستندات):")}
              {stopped.map((x) => (
                <button key={x.id} type="button" className="rounded-md bg-chip px-2 py-1 text-fg cursor-pointer hover:bg-accent-soft"
                  onClick={() => setFields((l) => [...l, { id: x.id, label: x.label, kind: x.kind, options: x.options.join('، '), required: x.required, inList: x.inList }])}>{tr("إعادة «{0}»", x.label)}</button>
              ))}
            </div>
          )}
        </div>
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}


function CategoryDialog({ editing, onClose }: { editing: { item: Category | null } | null; onClose: () => void }) {
  const [f, setF] = useState({ name: '', active: 'true' });
  const [error, setError] = useState('');
  useEffect(() => { if (editing) { setError(''); setF({ name: editing.item?.name || '', active: String(editing.item ? editing.item.active : true) }); } }, [editing]);
  const save = useAction('cor.category.save', { invalidate: KEYS, success: tr("حُفظ"), silentError: true, onSuccess: onClose });
  return (
    <Dialog open={!!editing} onClose={onClose} title={editing?.item ? tr("تعديل التصنيف") : tr("تصنيف جديد")}
      onSubmit={() => { setError(''); save.mutate({ id: editing!.item?.id, name: f.name, active: f.active === 'true' }, { onError: (e) => setError(e.message) }); }}
      footer={<><Button type="submit" variant="primary" className="flex-1" loading={save.isPending}>{tr("حفظ")}</Button><Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <div className="flex flex-col gap-3">
        <TextInput label={tr("الاسم")} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} autoFocus />
        <Select label={tr("الحالة")} value={f.active} onChange={(e) => setF({ ...f, active: e.target.value })} options={[{ value: 'true', label: tr("نشط") }, { value: 'false', label: tr("موقوف (لا يظهر في الاختيارات)") }]} />
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}
