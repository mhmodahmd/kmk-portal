import { useEffect, useState } from 'react';
import { tr } from '../../lib/i18n';
import { useAction, useApi } from '../../lib/useApi';
import { Badge, Card, CardHeader, ErrorBox, Loader } from '../../ui/Display';
import { Button, IconAction } from '../../ui/Button';
import { Form, Select, TextInput } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { toInput } from './shared';

interface Item { id: string; name: string; type: string; active: boolean }
interface Data {
  settings: { managerName: string; managerPhone: string; alertPercent: number; defaultAmount: number };
  lists: { categories: Item[]; docTypes: Item[]; projects: Item[] };
  projectTypes: Record<string, string>;
}
type ListKey = keyof Data['lists'];

export default function CusSettingsPage() {
  const q = useApi<Data>('cus.settings.get');
  const [f, setF] = useState({ managerName: '', managerPhone: '', alertPercent: '80', defaultAmount: '100' });
  useEffect(() => {
    if (q.data) setF({ managerName: q.data.settings.managerName, managerPhone: q.data.settings.managerPhone, alertPercent: String(q.data.settings.alertPercent), defaultAmount: toInput(q.data.settings.defaultAmount) });
  }, [q.data]);
  const save = useAction('cus.settings.save', { invalidate: ['cus.settings.get', 'cus.lookups'], success: tr("حُفظت الإعدادات") });
  const [editing, setEditing] = useState<{ list: ListKey; item: Item | null } | null>(null);
  const move = useAction('cus.list.move', { invalidate: ['cus.settings.get', 'cus.lookups'] });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const titles: Record<ListKey, string> = { categories: tr("تصنيفات المصروفات"), docTypes: tr("أنواع المستندات"), projects: tr("المشاريع") };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <Form className="flex flex-col gap-3" onSubmit={() => save.mutate(f)}>
          <h2 className="m-0 text-[16px] font-semibold">{tr("الإدارة والتنبيهات")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label={tr("اسم المدير (يوقّع السندات والكشوف)")} required value={f.managerName} onChange={set('managerName')} />
            <TextInput label={tr("جوال المدير لواتساب")} ltr inputMode="tel" value={f.managerPhone} onChange={set('managerPhone')} hint={tr("بالمفتاح الدولي، مثل 9655xxxxxxx")} />
            <TextInput label={tr("نسبة التنبيه عند الصرف (%)")} type="number" required min={10} max={100} value={f.alertPercent} onChange={set('alertPercent')} />
            <TextInput label={tr("المبلغ الافتراضي للعهدة (د.ك)")} required inputMode="decimal" ltr value={f.defaultAmount} onChange={set('defaultAmount')} />
          </div>
          <Button type="submit" variant="primary" className="self-start" loading={save.isPending}>{tr("حفظ")}</Button>
        </Form>
      </Card>

      {(Object.keys(titles) as ListKey[]).map((k) => (
        <Card key={k} padded={false}>
          <CardHeader title={titles[k]} action={<Button size="sm" icon="plus" onClick={() => setEditing({ list: k, item: null })}>{tr("إضافة")}</Button>} />
          {q.data.lists[k].map((it, i, arr) => (
            <div key={it.id} className="flex items-center gap-2 border-t border-line px-5 py-2.5">
              <span className={it.active ? 'flex-1' : 'flex-1 text-muted line-through'}>{it.name}</span>
              {k === 'projects' && <Badge>{q.data.projectTypes[it.type] || it.type}</Badge>}
              {!it.active && <Badge>{tr("موقوف")}</Badge>}
              <IconAction icon="chevronDown" rotate label={tr("أعلى")} disabled={i === 0} onClick={() => move.mutate({ list: k, id: it.id, dir: 'up' })} />
              <IconAction icon="chevronDown" label={tr("أسفل")} disabled={i === arr.length - 1} onClick={() => move.mutate({ list: k, id: it.id, dir: 'down' })} />
              <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing({ list: k, item: it })}>{tr("تعديل")}</Button>
            </div>
          ))}
        </Card>
      ))}
      <ItemDialog editing={editing} types={q.data.projectTypes} onClose={() => setEditing(null)} />
    </div>
  );
}

function ItemDialog({ editing, types, onClose }: { editing: { list: ListKey; item: Item | null } | null; types: Record<string, string>; onClose: () => void }) {
  const [f, setF] = useState({ name: '', type: 'project', active: 'true' });
  const [error, setError] = useState('');
  useEffect(() => { if (editing) { setError(''); setF({ name: editing.item?.name || '', type: editing.item?.type || 'project', active: String(editing.item ? editing.item.active : true) }); } }, [editing]);
  const save = useAction('cus.list.save', { invalidate: ['cus.settings.get', 'cus.lookups'], success: tr("حُفظ"), silentError: true, onSuccess: onClose });
  return (
    <Dialog open={!!editing} onClose={onClose} title={editing?.item ? tr("تعديل") : tr("إضافة")}
      onSubmit={() => { setError(''); save.mutate({ list: editing!.list, id: editing!.item?.id, name: f.name, type: f.type, active: f.active === 'true' }, { onError: (e) => setError(e.message) }); }} footer={<><Button type="submit" variant="primary" className="flex-1" loading={save.isPending}>{tr("حفظ")}</Button>
        <Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <div className="flex flex-col gap-3">
        <TextInput label={tr("الاسم")} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} hint={editing?.item ? tr("إعادة التسمية تُطبَّق على البنود المسجلة") : undefined} />
        {editing?.list === 'projects' && <Select label={tr("النوع")} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={Object.entries(types).map(([value, label]) => ({ value, label }))} />}
        <Select label={tr("الحالة")} value={f.active} onChange={(e) => setF({ ...f, active: e.target.value })} options={[{ value: 'true', label: tr("نشط") }, { value: 'false', label: tr("موقوف (لا يظهر في الاختيارات)") }]} />
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}
