import { useState } from 'react';
import { tr } from '../../lib/i18n';
import { useAction, useApi } from '../../lib/useApi';
import { Card } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { SignaturePad } from '../../ui/SignaturePad';

/** توقيع المستخدم الذي يظهر على السندات وكشوف التسوية */
export default function SignatureCard() {
  const q = useApi<{ data: string }>('cus.signature.get');
  const [drawing, setDrawing] = useState(false);
  const [sig, setSig] = useState('');
  const save = useAction('cus.signature.save', { invalidate: ['cus.signature.get'], success: tr("حُفظ التوقيع"), onSuccess: () => setDrawing(false) });
  const current = q.data?.data;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col">
        <h2 className="m-0 text-[16px] font-semibold">{tr("توقيعي")}</h2>
        <span className="text-[13px] text-muted">{tr("يظهر على السندات وكشوف التسوية التي تطلبها أو تعتمدها.")}</span>
      </div>
      {drawing ? (
        <>
          <SignaturePad onChange={setSig} height={150} />
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" disabled={!sig} loading={save.isPending} onClick={() => save.mutate({ data: sig })}>{tr("حفظ التوقيع")}</Button>
            <Button variant="ghost" onClick={() => setDrawing(false)}>{tr("تراجع")}</Button>
          </div>
        </>
      ) : (
        <>
          {current ? <img src={current} alt={tr("توقيعي")} className="max-h-[90px] self-start rounded-lg border border-line bg-white p-2" /> : <span className="text-muted">{tr("لم تضف توقيعك بعد.")}</span>}
          <div className="flex gap-2">
            <Button size="sm" icon="edit" onClick={() => { setSig(''); setDrawing(true); }}>{current ? tr("تغيير التوقيع") : tr("إضافة توقيع")}</Button>
            {current && <Button size="sm" variant="ghost" icon="trash" loading={save.isPending} onClick={() => save.mutate({ data: '' })}>{tr("حذف")}</Button>}
          </div>
        </>
      )}
    </Card>
  );
}
