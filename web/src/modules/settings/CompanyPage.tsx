import { tr } from '../../lib/i18n';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { CompanySettings } from '../../lib/types';
import { formatDateTime } from '../../lib/format';
import { useAction, useApi } from '../../lib/useApi';
import { Card, ErrorBox, Loader, PageHeader } from '../../ui/Display';
import { cx } from '../../ui/cx';
import { Facts } from '../../ui/Controls';
import { Button } from '../../ui/Button';
import { Form, TextInput } from '../../ui/Field';
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
    onSuccess: () => { toast(tr("تم حفظ بيانات الشركة")); setError(''); qc.invalidateQueries({ queryKey: ['settings.get'] }); qc.invalidateQueries({ queryKey: ['home.summary'] }); },
    onError: (e) => setError(e instanceof ApiError ? e.message : tr("تعذّر الحفظ."))
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={tr("النظام")} title={tr("بيانات الشركة")} subtitle={tr("تظهر في رأس المطبوعات مثل السندات والكشوف.")} />
      {q.isError && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      <Card className="max-w-2xl">
        {q.isPending ? <Loader /> : (
          <Form className="flex flex-col gap-4" onSubmit={() => save.mutate()}>
            <TextInput label={tr("اسم الشركة")} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <TextInput label={tr("العنوان")} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
            <TextInput label={tr("الهاتف")} ltr inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
            <Button type="submit" variant="primary" loading={save.isPending} className="self-start">{tr("حفظ")}</Button>
          </Form>
        )}
      </Card>
      <StorageCard />
      <SystemCard />
    </div>
  );
}

interface JobsStatus {
  available: boolean; expected: string[]; triggers: string[]; mailQueue: number;
  backup?: { available: boolean; keepDays: number; last: { at: string; day: string; copied: string[]; skipped: string[]; removed: string[]; folderUrl: string } | null };
}

/** النسخ الاحتياطي والمشغّلات الزمنية (مدير النظام) */
function SystemCard() {
  const q = useApi<JobsStatus>('system.jobs', {}, { staleTime: 60_000 });
  const backup = useAction<Record<string, never>, { copied: string[]; folderUrl: string }>('system.backup', {
    invalidate: ['system.jobs'], success: (r) => (r.copied.length ? tr("نُسخت {0} قاعدة بيانات إلى درايف", r.copied.length) : tr("نسخة اليوم موجودة مسبقاً"))
  });
  const install = useAction<{ install: 1 }, JobsStatus>('system.jobs', { invalidate: ['system.jobs'], success: tr("رُكّبت المشغّلات") });
  const s = q.data;
  const missing = s ? s.expected.filter((j) => !s.triggers.includes(j)) : [];
  const last = s?.backup?.last;
  return (
    <Card className="flex max-w-2xl flex-col gap-3">
      <div className="flex flex-col">
        <h2 className="m-0 text-[16px] font-semibold">{tr("النسخ الاحتياطي والمهام المؤجّلة")}</h2>
        <span className="text-[13px] text-muted">{tr("نسخة يومية من ملفات البيانات إلى درايف مالك البوابة (تبقى 30 يوماً)، وإرسال البريد كل دقيقة.")}</span>
      </div>
      {q.isError ? <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} /> : !s ? <Loader /> : (
        <>
          <Facts items={[
            { k: tr("آخر نسخة احتياطية"), v: last ? <span className="num">{formatDateTime(last.at)}</span> : tr("لم تُنفَّذ بعد") },
            { k: tr("ملفات النسخة"), v: last ? tr("{0} نُسخت · {1} مكرّرة", last.copied.length, last.skipped.length) : '—' },
            { k: tr("المشغّلات الزمنية"), v: !s.available ? tr("غير متاحة (تحتاج موافقة المالك بعد النشر)") : missing.length ? tr("ناقصة: {0}", missing.join(', ')) : tr("مركّبة ({0})", s.triggers.length) },
            { k: tr("بريد بانتظار الإرسال"), v: <span className="num">{s.mailQueue}</span> }
          ]} />
          <div className="flex flex-wrap gap-2">
            <Button icon="copy" loading={backup.isPending} disabled={!s.backup?.available} onClick={() => backup.mutate({})}>{tr("نسخة احتياطية الآن")}</Button>
            {s.available && missing.length > 0 && <Button variant="ghost" icon="refresh" loading={install.isPending} onClick={() => install.mutate({ install: 1 })}>{tr("تركيب المشغّلات")}</Button>}
            {last?.folderUrl && <a href={last.folderUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-1.5 px-2 text-accent-fg no-underline sm:h-10">{tr("مجلد النسخ على درايف")}</a>}
          </div>
          {!s.backup?.available && <p className="m-0 text-[13px] text-muted">{tr("النسخ الاحتياطي يحتاج صلاحية درايف المفعّلة من مالك البوابة.")}</p>}
        </>
      )}
    </Card>
  );
}

/** مساحة Google Drive لحساب البوابة: تنبيه لمدير النظام عند 80% و95% (الصيانة اليومية) */
function StorageCard() {
  const q = useApi<{ used: number; limit: number; percent: number; warnAt: number } | null>('system.storage', {}, { staleTime: 10 * 60_000 });
  const s = q.data;
  const gb = (n: number) => (n / 1073741824).toFixed(n < 10737418240 ? 2 : 1);
  const tone = !s ? '' : s.percent >= 95 ? 'bg-bad' : s.percent >= s.warnAt ? 'bg-warn' : 'bg-ok';
  return (
    <Card className="flex max-w-2xl flex-col gap-3">
      <div className="flex flex-col">
        <h2 className="m-0 text-[16px] font-semibold">{tr("مساحة Google Drive")}</h2>
        <span className="text-[13px] text-muted">{tr("المرفقات والمستندات والنسخ الاحتياطية في حساب البوابة، ومعها بريده وصوره.")}</span>
      </div>
      {q.isError ? <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} /> : q.isPending ? <Loader /> : !s ? (
        <p className="m-0 text-[13px] text-muted">{tr("صلاحية درايف غير مفعّلة بعد.")}</p>
      ) : (
        <>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-chip" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.percent} aria-label={tr("المستخدم من المساحة")}>
            <div className={cx('h-full rounded-full', tone)} style={{ width: Math.min(100, s.percent) + '%' }} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className="num">{tr("{0} من {1} جيجابايت ({2}%)", gb(s.used), gb(s.limit), s.percent)}</span>
            {s.percent >= s.warnAt && <span className="font-semibold text-bad">{tr("المساحة تقترب من الامتلاء: وسّعها من Google One أو احذف ما لا يلزم")}</span>}
          </div>
        </>
      )}
    </Card>
  );
}
