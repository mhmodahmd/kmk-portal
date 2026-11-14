import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { CompanySettings } from '../../lib/types';
import { Card, ErrorBox, Loader, PageHeader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { TextInput } from '../../ui/Field';
import { useToast } from '../../ui/Overlay';

export default function CompanyPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['settings.get'], queryFn: () => api<{ company: CompanySettings }>('settings.get') });
  const [f, setF] = useState<CompanySettings>({ name: '', address: '', phone: '' });
  const [error, setError] = useState('');
  useEffect(() => { if (q.data) setF(q.data.company); }, [q.data]);
  const save = useMutation({
    mutationFn: () => api('settings.update', { company: f }),
    onSuccess: () => { toast('تم حفظ بيانات الشركة'); setError(''); qc.invalidateQueries({ queryKey: ['settings.get'] }); qc.invalidateQueries({ queryKey: ['home.summary'] }); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'تعذّر الحفظ.')
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="النظام" title="بيانات الشركة" subtitle="تظهر في رأس المطبوعات مثل السندات والكشوف." />
      {q.isError && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      <Card className="max-w-2xl">
        {q.isPending ? <Loader /> : (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <TextInput label="اسم الشركة" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <TextInput label="العنوان" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
            <TextInput label="الهاتف" ltr inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
            <Button type="submit" variant="primary" loading={save.isPending} className="self-start">حفظ</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
