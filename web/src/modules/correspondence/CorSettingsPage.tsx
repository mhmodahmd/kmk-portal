import { useEffect, useState } from 'react';
import { tr } from '../../lib/i18n';
import { useAction, useApi } from '../../lib/useApi';
import { Badge, Card, CardHeader, ErrorBox, Loader } from '../../ui/Display';
import { Button, IconAction } from '../../ui/Button';
import { Select, TextInput } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import type { Category } from './types';

const KEYS = ['cor.categories', 'cor.lookups'];

/** تصنيفات المراسلات (مدير المراسلات): إضافة، تعديل، إيقاف، ترتيب */
export default function CorSettingsPage() {
  const q = useApi<Category[]>('cor.categories');
  const [editing, setEditing] = useState<{ item: Category | null } | null>(null);
  const move = useAction('cor.category.move', { invalidate: KEYS });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
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
    </div>
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
