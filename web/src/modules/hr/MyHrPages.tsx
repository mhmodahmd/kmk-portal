import { useState } from 'react';
import { Link } from 'react-router-dom';
import { dmy } from '../../lib/format';
import { useAction } from '../../lib/useApi';
import { Avatar, Badge, Card, CardHeader, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { Facts } from '../../ui/Controls';
import { Button } from '../../ui/Button';
import { BalanceCards, LeaveDialog, LeaveRow, OtDialog, OtRow, useHrMe } from './shared';

function NoFile() {
  return <Card><EmptyState title="لا يوجد ملف وظيفي مرتبط بحسابك" body="تُنشئ الموارد البشرية ملفك الوظيفي وتربطه بحسابك، ثم تظهر هنا بياناتك وإجازاتك." /></Card>;
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
          <h2 className="m-0 text-[16px] font-semibold">بيانات العمل</h2>
          <Facts items={[
            { k: 'الرقم الوظيفي', v: <span className="num">{e.empNo}</span> }, { k: 'تاريخ التعيين', v: dmy(e.hireDate) },
            { k: 'المدير المباشر', v: e.managerName }, { k: 'القسم', v: e.departmentName },
            { k: 'الفرع', v: e.branchName }, { k: 'الوردية', v: e.shiftName },
            { k: 'نوع العقد', v: e.contractType }, { k: 'نهاية العقد', v: dmy(e.contractEnd || '') }
          ]} />
        </Card>
        <Card className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
          <h2 className="m-0 text-[16px] font-semibold">بياناتي الشخصية</h2>
          <Facts items={[
            { k: 'الهاتف', v: <span className="num ltr">{e.phone}</span> }, { k: 'البريد', v: e.email },
            { k: 'الجنسية', v: e.nationality }, { k: 'الرقم المدني', v: <span className="num">{e.civilId}</span> },
            { k: 'انتهاء البطاقة المدنية', v: dmy(e.civilIdExpiry || '') }, { k: 'انتهاء الإقامة', v: dmy(e.residencyExpiry || '') },
            { k: 'انتهاء الجواز', v: dmy(e.passportExpiry || '') }, { k: 'جهة الطوارئ', v: [e.emergencyName, e.emergencyPhone].filter(Boolean).join(' · ') }
          ]} />
          <span className="text-[13px] text-muted">لتعديل بياناتك تواصل مع الموارد البشرية.</span>
        </Card>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Link to="/hr/leave" className="rounded-xl border border-line bg-surface px-4 py-3.5 font-medium text-fg no-underline hover:border-line-strong">طلب إجازة</Link>
        <Link to="/hr/overtime" className="rounded-xl border border-line bg-surface px-4 py-3.5 font-medium text-fg no-underline hover:border-line-strong">طلب عمل إضافي</Link>
      </div>
    </div>
  );
}

/** إجازاتي */
export function MyLeavePage() {
  const q = useHrMe();
  const [open, setOpen] = useState(false);
  const cancel = useAction('hr.leave.cancel', { invalidate: ['hr.me'], success: 'أُلغي الطلب' });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  if (!q.data.employee) return <NoFile />;
  return (
    <div className="flex flex-col gap-4">
      <BalanceCards balances={q.data.balances} />
      <Card padded={false}>
        <CardHeader title={`طلباتي ${q.data.year}`} action={<Button size="sm" variant="primary" icon="plus" onClick={() => setOpen(true)}>طلب إجازة</Button>} />
        {!q.data.leaves.length ? <EmptyState title="لا طلبات إجازة بعد" /> : q.data.leaves.map((l) => (
          <LeaveRow key={l.id} l={l} actions={(l.status === 'pending_manager' || l.status === 'pending_hr') && (
            <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate({ id: l.id })}>إلغاء</Button>
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
  const cancel = useAction('hr.ot.cancel', { invalidate: ['hr.me'], success: 'أُلغي الطلب' });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  if (!q.data.employee) return <NoFile />;
  return (
    <Card padded={false}>
      <CardHeader title="طلبات العمل الإضافي" action={<Button size="sm" variant="primary" icon="plus" onClick={() => setOpen(true)}>طلب إضافي</Button>} />
      <p className="m-0 px-5 pb-3 text-[13px] text-muted">الإضافي لا يُحتسب تلقائياً من البصمة: يُطلب هنا ويعتمده المدير المباشر.</p>
      {!q.data.overtime.length ? <EmptyState title="لا طلبات بعد" /> : q.data.overtime.map((o) => (
        <OtRow key={o.id} o={o} actions={o.status === 'pending' && <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate({ id: o.id })}>إلغاء</Button>} />
      ))}
      <OtDialog open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}
