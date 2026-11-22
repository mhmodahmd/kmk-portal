import { tr } from '../../lib/i18n';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { dmy } from '../../lib/format';
import { useAction } from '../../lib/useApi';
import { Avatar, Badge, Card, CardHeader, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { Facts } from '../../ui/Controls';
import { Button } from '../../ui/Button';
import { BalanceCards, LeaveDialog, LeaveRow, OtDialog, OtRow, useHrMe } from './shared';

function NoFile() {
  return <Card><EmptyState title={tr("لا يوجد ملف وظيفي مرتبط بحسابك")} body={tr("تُنشئ الموارد البشرية ملفك الوظيفي وتربطه بحسابك، ثم تظهر هنا بياناتك وإجازاتك.")} /></Card>;
}

/** ملفي الوظيفي */
export function MyProfilePage() {
  const q = useHrMe();
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  const e = q.data.employee;
  if (!e) return <NoFile />;
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-4">
        <Avatar name={e.fullName} size={56} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[18px] font-bold">{e.fullName}</span>
          <span className="text-muted">{[e.jobTitle, e.departmentName].filter(Boolean).join(' · ')}</span>
        </div>
        <Badge tone={e.status === 'active' ? 'ok' : 'neutral'}>{e.statusLabel}</Badge>
      </Card>
      <BalanceCards balances={q.data.balances} />
      <div className="flex flex-wrap items-start gap-4">
        <Card className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
          <h2 className="m-0 text-[16px] font-semibold">{tr("بيانات العمل")}</h2>
          <Facts items={[
            { k: tr("الرقم الوظيفي"), v: <span className="num">{e.empNo}</span> }, { k: tr("تاريخ التعيين"), v: dmy(e.hireDate) },
            { k: tr("المدير المباشر"), v: e.managerName }, { k: tr("القسم"), v: e.departmentName },
            { k: tr("الفرع"), v: e.branchName }, { k: tr("الوردية"), v: e.shiftName },
            { k: tr("نوع العقد"), v: e.contractType }, { k: tr("نهاية العقد"), v: dmy(e.contractEnd || '') }
          ]} />
        </Card>
        <Card className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
          <h2 className="m-0 text-[16px] font-semibold">{tr("بياناتي الشخصية")}</h2>
          <Facts items={[
            { k: tr("الهاتف"), v: <span className="num ltr">{e.phone}</span> }, { k: tr("البريد"), v: e.email },
            { k: tr("الجنسية"), v: e.nationality }, { k: tr("الرقم المدني"), v: <span className="num">{e.civilId}</span> },
            { k: tr("انتهاء البطاقة المدنية"), v: dmy(e.civilIdExpiry || '') }, { k: tr("انتهاء الإقامة"), v: dmy(e.residencyExpiry || '') },
            { k: tr("انتهاء الجواز"), v: dmy(e.passportExpiry || '') }, { k: tr("جهة الطوارئ"), v: [e.emergencyName, e.emergencyPhone].filter(Boolean).join(' · ') }
          ]} />
          <span className="text-[13px] text-muted">{tr("لتعديل بياناتك تواصل مع الموارد البشرية.")}</span>
        </Card>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Link to="/hr/leave" className="rounded-xl border border-line bg-surface px-4 py-3.5 font-medium text-fg no-underline hover:border-line-strong">{tr("طلب إجازة")}</Link>
        <Link to="/hr/overtime" className="rounded-xl border border-line bg-surface px-4 py-3.5 font-medium text-fg no-underline hover:border-line-strong">{tr("طلب عمل إضافي")}</Link>
      </div>
    </div>
  );
}

/** إجازاتي */
export function MyLeavePage() {
  const q = useHrMe();
  const [open, setOpen] = useState(false);
  const cancel = useAction('hr.leave.cancel', { invalidate: ['hr.me'], success: tr("أُلغي الطلب") });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  if (!q.data.employee) return <NoFile />;
  return (
    <div className="flex flex-col gap-4">
      <BalanceCards balances={q.data.balances} />
      <Card padded={false}>
        <CardHeader title={tr("طلباتي {0}", q.data.year)} action={<Button size="sm" variant="primary" icon="plus" onClick={() => setOpen(true)}>{tr("طلب إجازة")}</Button>} />
        {!q.data.leaves.length ? <EmptyState title={tr("لا طلبات إجازة بعد")} /> : q.data.leaves.map((l) => (
          <LeaveRow key={l.id} l={l} actions={(l.status === 'pending_manager' || l.status === 'pending_hr' || l.status === 'in_chain' || l.status === 'returned') && (
            <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate({ id: l.id })}>{tr("إلغاء الطلب")}</Button>
          )} />
        ))}
      </Card>
      <LeaveDialog open={open} onClose={() => setOpen(false)} types={q.data.types} />
    </div>
  );
}

/** العمل الإضافي */
export function MyOvertimePage() {
  const q = useHrMe();
  const [open, setOpen] = useState(false);
  const cancel = useAction('hr.ot.cancel', { invalidate: ['hr.me'], success: tr("أُلغي الطلب") });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  if (!q.data.employee) return <NoFile />;
  return (
    <Card padded={false}>
      <CardHeader title={tr("طلبات العمل الإضافي")} action={<Button size="sm" variant="primary" icon="plus" onClick={() => setOpen(true)}>{tr("طلب إضافي")}</Button>} />
      <p className="m-0 px-5 pb-3 text-[13px] text-muted">{tr("الإضافي لا يُحتسب تلقائياً من البصمة: يُطلب هنا ويعتمده المدير المباشر.")}</p>
      {!q.data.overtime.length ? <EmptyState title={tr("لا طلبات بعد")} /> : q.data.overtime.map((o) => (
        <OtRow key={o.id} o={o} actions={(o.status === 'pending' || o.status === 'in_chain' || o.status === 'returned') && <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate({ id: o.id })}>{tr("إلغاء الطلب")}</Button>} />
      ))}
      <OtDialog open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}
