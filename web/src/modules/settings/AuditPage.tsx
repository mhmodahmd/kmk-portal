import { tr } from '../../lib/i18n';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { AuditRow } from '../../lib/types';
import { formatDateTime } from '../../lib/format';
import { Card, EmptyState, ErrorBox, PageHeader, Skeleton } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

const ACTIONS: Record<string, string> = {
  'system.setup': tr("إعداد البوابة"),
  'user.create': tr("إنشاء مستخدم"),
  'user.update': tr("تعديل مستخدم"),
  'user.setRoles': tr("تعديل صلاحيات"),
  'user.resetPassword': tr("كلمة مرور مؤقتة"),
  'user.changePassword': tr("تغيير كلمة المرور"),
  'user.unlock': tr("فك قفل حساب"),
  'user.locked': tr("قفل حساب بعد محاولات خاطئة"),
  'settings.update': tr("تعديل بيانات الشركة")
};

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const res = useQuery({
    queryKey: ['audit.list', page, q],
    queryFn: () => api<{ total: number; page: number; pageSize: number; rows: AuditRow[] }>('audit.list', { page, pageSize: 30, q }),
    placeholderData: keepPreviousData
  });
  const pages = res.data ? Math.max(1, Math.ceil(res.data.total / res.data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={tr("النظام")} title={tr("سجل العمليات")} subtitle={tr("كل تعديل في البوابة: من، ماذا، ومتى.")} />
      {res.isError && <ErrorBox message={(res.error as Error).message} onRetry={() => res.refetch()} />}
      <Card padded={false} className="overflow-hidden">
        <form className="flex gap-2 border-b border-line p-3.5" onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(search); }}>
          <label className="sr-only" htmlFor="audit-search">{tr("بحث في السجل")}</label>
          <div className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-line bg-bg px-3 text-muted">
            <Icon name="search" size={18} />
            <input id="audit-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("ابحث باسم المستخدم أو الإجراء")} className="h-full flex-1 bg-transparent text-fg outline-none" />
          </div>
          <Button type="submit">{tr("بحث")}</Button>
        </form>
        {res.isPending ? <div className="flex flex-col gap-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}</div> :
          !res.data?.rows.length ? <EmptyState title={tr("لا عمليات بعد")} body={tr("ستظهر هنا كل التعديلات فور حدوثها.")} /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="bg-bg text-right text-[12px] text-muted">
                    <th className="px-5 py-2.5 font-medium">{tr("الوقت")}</th>
                    <th className="px-5 py-2.5 font-medium">{tr("المستخدم")}</th>
                    <th className="px-5 py-2.5 font-medium">{tr("الإجراء")}</th>
                    <th className="px-5 py-2.5 font-medium">{tr("التفاصيل")}</th>
                  </tr>
                </thead>
                <tbody>
                  {res.data.rows.map((r) => (
                    <tr key={r.id} className="border-t border-line align-top">
                      <td className="num whitespace-nowrap px-5 py-3 text-muted">{formatDateTime(r.ts)}</td>
                      <td className="px-5 py-3 font-medium">{r.userName || '—'}</td>
                      <td className="px-5 py-3">{ACTIONS[r.action] || r.action}</td>
                      <td className="max-w-[360px] px-5 py-3 text-[13px] text-muted">{describe(r.details)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px]">
            <span className="text-muted">{tr("صفحة {0} من {1}", page, pages)}</span>
            <div className="flex gap-2">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tr("السابق")}</Button>
              <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>{tr("التالي")}</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function describe(d: unknown): string {
  if (!d || typeof d !== 'object') return '';
  const o = d as Record<string, unknown>;
  const parts: string[] = [];
  if (o.username) parts.push(String(o.username));
  const roles = (o.roles || o.changes) as unknown;
  if (Array.isArray(roles) && roles.length) parts.push(roles.join(' · '));
  if (o.name) parts.push(String(o.name));
  return parts.join(' — ');
}
