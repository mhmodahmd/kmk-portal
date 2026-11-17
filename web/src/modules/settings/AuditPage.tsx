import { tr } from '../../lib/i18n';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { AuditRow } from '../../lib/types';
import { dmy, formatDateTime } from '../../lib/format';
import { kwd } from '../custody/shared';
import { Card, EmptyState, ErrorBox, PageHeader, Skeleton } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { SearchBox, Segmented } from '../../ui/Controls';

/** كل إجراءات Audit.log في الخادم بأسمائها المقروءة */
const ACTIONS: Record<string, string> = {
  // النواة
  'system.setup': tr("إعداد البوابة"), 'user.create': tr("إنشاء مستخدم"), 'user.update': tr("تعديل مستخدم"), 'user.setRoles': tr("تعديل صلاحيات"),
  'user.resetPassword': tr("كلمة مرور مؤقتة"), 'user.changePassword': tr("تغيير كلمة المرور"), 'user.unlock': tr("فك قفل حساب"), 'user.locked': tr("قفل حساب بعد محاولات خاطئة"),
  'settings.update': tr("تعديل الإعدادات"), 'passkey.register': tr("تفعيل الدخول بالبصمة"), 'passkey.revoke': tr("إزالة جهاز البصمة"),
  // الحضور
  'correction.request': tr("طلب تصحيح بصمة"), 'correction.approve': tr("اعتماد تصحيح بصمة"), 'correction.reject': tr("رفض تصحيح بصمة"),
  'record.create': tr("تسجيل حضور يدوي"), 'record.update': tr("تعديل تسجيل حضور"), 'record.delete': tr("حذف تسجيل حضور"), 'device.reset': tr("إعادة ضبط جهاز بصمة"), 'branch.geo': tr("تحديد موقع فرع"),
  // الموارد البشرية
  'employee.create': tr("إضافة موظف"), 'employee.update': tr("تعديل ملف موظف"), 'employee.account.create': tr("إنشاء حساب لموظف"), 'employee.account.link': tr("ربط موظف بحساب"), 'employee.account.unlink': tr("فك ربط موظف"),
  'departments.create': tr("إضافة قسم"), 'departments.update': tr("تعديل قسم"), 'branches.create': tr("إضافة فرع"), 'branches.update': tr("تعديل فرع"),
  'shifts.create': tr("إضافة وردية"), 'shifts.update': tr("تعديل وردية"), 'leavetypes.create': tr("إضافة نوع إجازة"), 'leavetypes.update': tr("تعديل نوع إجازة"),
  'leave.request': tr("طلب إجازة"), 'leave.create': tr("تسجيل إجازة"), 'leave.approve': tr("اعتماد إجازة"), 'leave.reject': tr("رفض إجازة"), 'leave.cancel': tr("إلغاء طلب إجازة"), 'leave.adminCancel': tr("إلغاء إجازة معتمدة"), 'leave.remove': tr("حذف طلب إجازة نهائياً"), 'leave.adjust': tr("تسوية رصيد إجازة"),
  'ot.request': tr("طلب عمل إضافي"), 'ot.add': tr("تسجيل عمل إضافي"), 'ot.approve': tr("اعتماد عمل إضافي"), 'ot.reject': tr("رفض عمل إضافي"), 'ot.cancel': tr("إلغاء عمل إضافي"),
  'holiday.save': tr("حفظ عطلة"), 'holiday.delete': tr("حذف عطلة"),
  // العهد
  'custody.open': tr("فتح عهدة"), 'custody.receive': tr("تأكيد استلام عهدة"), 'custody.requestClose': tr("طلب إقفال عهدة"), 'custody.approve': tr("اعتماد إقفال عهدة"), 'custody.reject': tr("رفض إقفال عهدة"), 'custody.delete': tr("حذف عهدة"),
  'expense.add': tr("إضافة بند"), 'expense.update': tr("تعديل بند"), 'expense.correct': tr("تصحيح بند"), 'expense.delete': tr("حذف بند"), 'expense.note': tr("ملاحظة على بند"),
  'signature.save': tr("حفظ التوقيع"), 'signature.delete': tr("حذف التوقيع"), 'sign.manager': tr("توقيع المدير عبر الرابط"), 'sign.managerReject': tr("رفض المدير عبر الرابط"),
  'attachment.upload': tr("إرفاق ملف"), 'attachment.delete': tr("حذف مرفق"),
  'request.create': tr("طلب عهدة"), 'request.reject': tr("رفض طلب عهدة"), 'request.cancel': tr("إلغاء طلب عهدة"),
  'voucher.request': tr("طلب سند"), 'voucher.create': tr("إصدار سند"), 'voucher.approve': tr("اعتماد سند"), 'voucher.reject': tr("رفض طلب سند"), 'voucher.cancel': tr("إلغاء سند"),
  'voucher.signed': tr("توقيع الإدارة على سند"), 'voucher.signedUpload': tr("رفع سند موقّع"), 'statement.signed': tr("توقيع الإدارة على كشف"), 'statement.signedUpload': tr("رفع كشف موقّع"),
  'sign.send': tr("إرسال رابط توقيع"), 'list.save': tr("حفظ قائمة"),
  // المهام
  'task.create': tr("إنشاء مهمة"), 'task.update': tr("تعديل مهمة"), 'task.status': tr("تغيير حالة مهمة"), 'task.comment': tr("تعليق على مهمة"), 'task.delete': tr("حذف مهمة"), 'file.upload': tr("إرفاق ملف بمهمة"),
  // العملاء
  'client.create': tr("إنشاء عميل"), 'client.update': tr("تعديل عميل"), 'client.stage': tr("نقل مرحلة عميل"), 'client.delete': tr("حذف عميل"),
  'project.create': tr("إنشاء مشروع"), 'project.update': tr("تعديل مشروع"), 'project.delete': tr("حذف مشروع"),
  'payment.collect': tr("تحصيل دفعة"), 'payment.schedule': tr("جدولة دفعة"), 'payment.update': tr("تعديل دفعة"), 'payment.delete': tr("حذف دفعة"),
  'activity.create': tr("تسجيل نشاط"), 'activity.update': tr("تعديل نشاط"), 'proposal.create': tr("إنشاء عرض سعر"), 'proposal.update': tr("تعديل عرض سعر"),
  'proposal.accepted': tr("قبول عرض سعر"), 'proposal.rejected': tr("رفض عرض سعر"), 'proposal.negotiation': tr("عرض سعر قيد التفاوض"), 'proposal.draft': tr("عرض سعر مسودة"), 'proposal.delete': tr("حذف عرض سعر"),
  // المراسلات
  'letter.create': tr("تسجيل خطاب"), 'letter.update': tr("تعديل خطاب"), 'letter.status': tr("تغيير حالة خطاب"), 'letter.forward': tr("إحالة خطاب"), 'letter.delete': tr("حذف خطاب"),
  'letter.file.upload': tr("إرفاق ملف بخطاب"), 'letter.file.delete': tr("حذف مرفق خطاب"), 'category.save': tr("حفظ تصنيف مراسلات"),
  // المنصات
  'import': tr("استيراد ملف بوابة الدفع"), 'month.clear': tr("تفريغ شهر مبيعات"), 'month.approve': tr("اعتماد شهر مبيعات"), 'month.reopen': tr("إعادة فتح شهر مبيعات"),
  'fees.update': tr("تعديل عمولات البوابة"), 'package.create': tr("إضافة باقة"), 'package.update': tr("تعديل باقة"), 'package.remove': tr("حذف باقة"), 'platform.update': tr("تعديل منصة"),
  'center.create': tr("إضافة مركز"), 'center.update': tr("تعديل مركز"), 'center.remove': tr("حذف مركز"),
  'campaign.create': tr("إضافة مسابقة أو تحدٍّ"), 'campaign.update': tr("تعديل مسابقة أو تحدٍّ"), 'campaign.remove': tr("حذف مسابقة أو تحدٍّ"),
  // النظام
  'backup.run': tr("نسخة احتياطية يدوية"), 'migration.legacyAttendance': tr("نقل بيانات الحضور السابق"), 'migration.legacyCustody': tr("نقل بيانات العهد السابق"), 'migration.legacyCrm': tr("نقل بيانات العملاء السابق")
};

const MODULES: { value: string; label: string }[] = [
  { value: '', label: tr("الكل") }, { value: 'core', label: tr("النواة") }, { value: 'attendance', label: tr("الحضور") }, { value: 'hr', label: tr("الموارد البشرية") },
  { value: 'custody', label: tr("العهد") }, { value: 'tasks', label: tr("المهام") }, { value: 'crm', label: tr("العملاء") }, { value: 'correspondence', label: tr("المراسلات") }, { value: 'platforms', label: tr("المنصات") }, { value: 'system', label: tr("النظام") }
];
const MODULE_LABEL: Record<string, string> = Object.fromEntries(MODULES.filter((m) => m.value).map((m) => [m.value, m.label]));

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [module, setModule] = useState('');
  const res = useQuery({
    queryKey: ['audit.list', page, q, module],
    queryFn: () => api<{ total: number; page: number; pageSize: number; rows: AuditRow[] }>('audit.list', { page, pageSize: 30, q, module: module || undefined }),
    placeholderData: keepPreviousData
  });
  const pages = res.data ? Math.max(1, Math.ceil(res.data.total / res.data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={tr("النظام")} title={tr("سجل العمليات")} subtitle={tr("كل تعديل في البوابة: من، ماذا، ومتى.")} />
      {res.isError && <ErrorBox message={(res.error as Error).message} onRetry={() => res.refetch()} />}
      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-3.5">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(search); }}>
            <SearchBox id="audit-search" value={search} onChange={setSearch} placeholder={tr("ابحث باسم المستخدم أو الإجراء أو المعرّف")} />
            <Button type="submit">{tr("بحث")}</Button>
          </form>
          <Segmented label={tr("الوحدة")} value={module} onChange={(v) => { setModule(v); setPage(1); }} options={MODULES} />
        </div>
        {res.isPending ? <div className="flex flex-col gap-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}</div> :
          !res.data?.rows.length ? <EmptyState title={q || module ? tr("لا نتائج تطابق التصفية") : tr("لا عمليات بعد")} body={q || module ? undefined : tr("ستظهر هنا كل التعديلات فور حدوثها.")} /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="bg-bg text-right text-[12px] text-muted">
                    <th className="px-5 py-2.5 font-medium">{tr("الوقت")}</th>
                    <th className="px-5 py-2.5 font-medium">{tr("المستخدم")}</th>
                    <th className="px-5 py-2.5 font-medium">{tr("الوحدة")}</th>
                    <th className="px-5 py-2.5 font-medium">{tr("الإجراء")}</th>
                    <th className="px-5 py-2.5 font-medium">{tr("التفاصيل")}</th>
                  </tr>
                </thead>
                <tbody>
                  {res.data.rows.map((r) => (
                    <tr key={r.id} className="border-t border-line align-top">
                      <td className="num whitespace-nowrap px-5 py-3 text-muted">{formatDateTime(r.ts)}</td>
                      <td className="px-5 py-3 font-medium">{r.userName || '—'}</td>
                      <td className="px-5 py-3 text-[13px] text-muted">{MODULE_LABEL[r.module] || r.module}</td>
                      <td className="px-5 py-3">{ACTIONS[r.action] || r.action}{r.entityId && <span className="ms-1.5 text-[12px] text-muted num">{r.entityId}</span>}</td>
                      <td className="max-w-[380px] px-5 py-3 text-[13px] text-muted">{describe(r.details)}</td>
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

/** مفاتيح التفاصيل الشائعة بترتيب العرض؛ المبالغ بالفلس تُعرض بالدينار والتواريخ بصيغة يوم/شهر/سنة */
const DETAIL_KEYS = ['number', 'name', 'employee', 'username', 'client', 'project', 'custody', 'task', 'label', 'type', 'kind', 'stage', 'status', 'date', 'amount', 'remaining', 'settlement', 'reason', 'note', 'file', 'copied', 'created'];

function describe(d: unknown): string {
  if (!d || typeof d !== 'object') return '';
  const o = d as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of DETAIL_KEYS) {
    const v = o[k];
    if (v === undefined || v === null || v === '' || v === false) continue;
    if (k === 'amount' || k === 'remaining') parts.push(kwd(Number(v)));
    else if (k === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) parts.push(dmy(String(v)));
    else if (Array.isArray(v)) parts.push(v.join('، '));
    else if (typeof v === 'object') continue;
    else parts.push(String(v));
  }
  const roles = (o.roles || o.changes) as unknown;
  if (Array.isArray(roles) && roles.length) parts.push(roles.join(' · '));
  return parts.join(' — ');
}
