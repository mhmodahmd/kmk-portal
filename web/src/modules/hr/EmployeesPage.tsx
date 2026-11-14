import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Balance, Directory, EmployeeView } from '../../lib/types';
import { dmy, kwDate } from '../../lib/format';
import { useAction, useApi } from '../../lib/useApi';
import { Avatar, Badge, Card, CardHeader, EmptyState, ErrorBox, Loader, Skeleton } from '../../ui/Display';
import { SearchBox, Segmented } from '../../ui/Controls';
import { Button } from '../../ui/Button';
import { Select, TextInput, Textarea } from '../../ui/Field';
import { Dialog, useToast } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';

type Draft = Record<string, string>;
const FIELDS = ['fullName', 'empNo', 'jobTitle', 'departmentId', 'branchId', 'shiftId', 'managerId', 'status', 'hireDate', 'phone', 'email',
  'nationality', 'birthDate', 'civilId', 'civilIdExpiry', 'residencyNo', 'residencyExpiry', 'passportNo', 'passportExpiry',
  'contractType', 'contractEnd', 'address', 'emergencyName', 'emergencyPhone', 'notes'];
const blank = (): Draft => Object.fromEntries(FIELDS.map((f) => [f, f === 'status' ? 'active' : ''])) as Draft;
const toDraft = (e: EmployeeView): Draft => Object.fromEntries(FIELDS.map((f) => [f, String((e as unknown as Record<string, unknown>)[f] ?? '')])) as Draft;

export default function EmployeesPage() {
  const q = useApi<Directory>('hr.directory');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'current' | 'terminated'>('current');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const d = q.data;
  const list = useMemo(() => (d?.employees || []).filter((e) => (status === 'terminated') === (e.status === 'terminated') &&
    (!search || (e.fullName + ' ' + e.empNo + ' ' + e.jobTitle).toLowerCase().includes(search.toLowerCase()))), [d, search, status]);
  const selected = d?.employees.find((e) => e.id === selectedId) || null;
  useEffect(() => { if (!selectedId && !creating && list[0]) setSelectedId(list[0].id); }, [list, selectedId, creating]);
  // على الجوال تظهر البطاقة تحت القائمة: ننزل إليها عند الاختيار
  const toCard = () => { if (window.innerWidth < 1024) setTimeout(() => document.getElementById('emp-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); };

  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!d) return <Loader />;
  const terminatedCount = d.employees.filter((e) => e.status === 'terminated').length;

  return (
    <div className="flex flex-col gap-4">
      {d.expiring.length > 0 && <ExpiringCard items={d.expiring} onOpen={(id) => { setCreating(false); setSelectedId(id); toCard(); }} />}
      <div className="flex flex-wrap items-start gap-4">
        <Card padded={false} className="min-w-0 flex-[2_1_340px] overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <SearchBox id="emp-search" value={search} onChange={setSearch} placeholder="بحث بالاسم أو الرقم" />
            <Button variant="primary" icon="plus" onClick={() => { setCreating(true); setSelectedId(null); toCard(); }}>موظف جديد</Button>
          </div>
          {terminatedCount > 0 && <div className="border-b border-line px-3 py-2"><Segmented label="الحالة" value={status} onChange={setStatus} options={[{ value: 'current', label: 'الحاليون' }, { value: 'terminated', label: 'انتهت خدمتهم', count: terminatedCount }]} /></div>}
          {!list.length ? <EmptyState title={d.employees.length ? 'لا نتائج' : 'لا موظفين بعد'} body={d.employees.length ? undefined : 'ابدأ بإضافة الأقسام والورديات من «الهيكل»، ثم أضف الموظفين.'} /> : (
            <ul className="m-0 max-h-[70vh] list-none overflow-y-auto p-0">
              {list.map((e) => (
                <li key={e.id} className="border-t border-line first:border-t-0">
                  <button type="button" onClick={() => { setCreating(false); setSelectedId(e.id); toCard(); }}
                    className={cx('flex w-full items-center gap-3 px-4 py-3 text-right cursor-pointer', !creating && selectedId === e.id ? 'bg-accent-soft' : 'hover:bg-chip/50')}>
                    <Avatar name={e.fullName} size={34} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold">{e.fullName}</span>
                      <span className="truncate text-[12px] text-muted">{[e.jobTitle, e.departmentName].filter(Boolean).join(' · ') || '—'}</span>
                    </span>
                    <span className="text-[12px] text-muted num">{e.empNo}</span>
                    {!e.userId && <span title="بلا حساب دخول" className="text-muted"><Icon name="lock" size={15} /></span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {(creating || selected) && (
          <div id="emp-card" className="flex min-w-0 flex-[3_1_480px] scroll-mt-20">
            <EmployeeCard key={creating ? 'new' : selected!.id} emp={creating ? null : selected} dir={d}
              onCreated={(id) => { setCreating(false); setSelectedId(id); }} onCancel={() => setCreating(false)} />
          </div>
        )}
      </div>
    </div>
  );
}

function ExpiringCard({ items, onOpen }: { items: Directory['expiring']; onOpen: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 4);
  return (
    <Card padded={false}>
      <CardHeader title={`تنبيهات المستندات (${items.length})`} action={items.length > 4 && <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>{all ? 'أقل' : 'عرض الكل'}</Button>} />
      <div className="grid grid-cols-1 gap-px border-t border-line bg-line md:grid-cols-2">
        {shown.map((x) => (
          <button key={x.employeeId + x.field} type="button" onClick={() => onOpen(x.employeeId)} className="flex items-center gap-3 bg-surface px-5 py-3 text-right cursor-pointer hover:bg-chip/40">
            <Icon name="file" className={x.daysLeft < 0 ? 'text-bad' : 'text-warn'} />
            <span className="flex min-w-0 flex-1 flex-col"><span className="font-semibold">{x.name}</span><span className="text-[13px] text-muted">{x.doc} · {dmy(x.date)}</span></span>
            <Badge tone={x.daysLeft < 0 ? 'bad' : x.daysLeft <= 30 ? 'warn' : 'neutral'}>{x.daysLeft < 0 ? `منتهية منذ ${-x.daysLeft} يوم` : x.daysLeft === 0 ? 'تنتهي اليوم' : `بعد ${x.daysLeft} يوم`}</Badge>
          </button>
        ))}
      </div>
    </Card>
  );
}

function Section({ title, children, open: initial = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="border-t border-line pt-3">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between py-1 font-semibold cursor-pointer">
        {title}<Icon name="chevronDown" size={18} className={cx('text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>}
    </div>
  );
}

function EmployeeCard({ emp, dir, onCreated, onCancel }: { emp: EmployeeView | null; dir: Directory; onCreated: (id: string) => void; onCancel: () => void }) {
  const [f, setF] = useState<Draft>(() => (emp ? toDraft(emp) : blank()));
  const [error, setError] = useState('');
  const save = useAction<Draft, EmployeeView>('hr.employee.save', {
    invalidate: ['hr.directory', 'hr.me', 'hr.team'], silentError: true,
    success: emp ? 'حُفظت التغييرات' : 'أُضيف الموظف', onSuccess: (r) => { if (!emp) onCreated(r.id); }
  });
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const opt = (rows: { id: string; name: string; active?: boolean }[], none: string) => [{ value: '', label: none }, ...rows.filter((r) => r.active !== false || r.id === f.departmentId || r.id === f.branchId || r.id === f.shiftId).map((r) => ({ value: r.id, label: r.name }))];
  const managers = dir.employees.filter((x) => x.status !== 'terminated' && x.id !== emp?.id).map((x) => ({ id: x.id, name: x.fullName }));
  const dept = dir.departments.find((x) => x.id === f.departmentId);
  const deptMgr = dept?.managerId && dept.managerId !== emp?.id ? dir.employees.find((x) => x.id === dept.managerId)?.fullName : '';

  return (
    <Card as="aside" className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={f.fullName || '+'} size={48} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[18px] font-bold">{emp ? emp.fullName : 'موظف جديد'}</span>
          {emp && <span className="text-[13px] text-muted">رقم {emp.empNo}{emp.username ? ` · حساب ${emp.username}` : ' · بلا حساب دخول'}</span>}
        </div>
        {emp && <Link to={`/attendance/report/${emp.id}`} className="text-[13px] text-accent-fg no-underline">الحضور</Link>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextInput label="الاسم الكامل" value={f.fullName} onChange={set('fullName')} />
        <TextInput label="المسمى الوظيفي" value={f.jobTitle} onChange={set('jobTitle')} />
      </div>
      <Section title="العمل">
        <TextInput label="الرقم الوظيفي" ltr value={f.empNo} onChange={set('empNo')} hint={emp ? undefined : 'يُولَّد تلقائياً إن تُرك فارغاً'} />
        <TextInput label="تاريخ التعيين" type="date" value={f.hireDate} onChange={set('hireDate')} />
        <Select label="القسم" value={f.departmentId} onChange={set('departmentId')} options={opt(dir.departments, 'بلا قسم')} />
        <Select label="المدير المباشر" value={f.managerId} onChange={set('managerId')} options={[{ value: '', label: deptMgr ? `مدير القسم (${deptMgr})` : 'بلا مدير' }, ...managers.map((m) => ({ value: m.id, label: m.name }))]} />
        <Select label="الفرع" value={f.branchId} onChange={set('branchId')} options={opt(dir.branches, 'بلا فرع')} />
        <Select label="الوردية" value={f.shiftId} onChange={set('shiftId')} options={opt(dir.shifts, 'بلا وردية (لا يُحتسب تأخير)')} />
        <Select label="الحالة" value={f.status} onChange={set('status')} options={[{ value: 'active', label: 'على رأس العمل' }, { value: 'leave', label: 'إجازة طويلة' }, { value: 'terminated', label: 'انتهت خدمته' }]} />
        <TextInput label="نوع العقد" value={f.contractType} onChange={set('contractType')} placeholder="دائم، مؤقت، جزئي…" />
        <TextInput label="نهاية العقد" type="date" value={f.contractEnd} onChange={set('contractEnd')} />
      </Section>
      <Section title="التواصل" open={!emp}>
        <TextInput label="الهاتف" ltr inputMode="tel" value={f.phone} onChange={set('phone')} />
        <TextInput label="البريد الإلكتروني" ltr type="email" value={f.email} onChange={set('email')} />
        <TextInput label="العنوان" value={f.address} onChange={set('address')} className="sm:col-span-2" />
        <TextInput label="جهة الطوارئ" value={f.emergencyName} onChange={set('emergencyName')} />
        <TextInput label="هاتف الطوارئ" ltr inputMode="tel" value={f.emergencyPhone} onChange={set('emergencyPhone')} />
      </Section>
      <Section title="المستندات" open={!emp}>
        <TextInput label="الجنسية" value={f.nationality} onChange={set('nationality')} />
        <TextInput label="تاريخ الميلاد" type="date" value={f.birthDate} onChange={set('birthDate')} />
        <TextInput label="الرقم المدني" ltr inputMode="numeric" value={f.civilId} onChange={set('civilId')} />
        <TextInput label="انتهاء البطاقة المدنية" type="date" value={f.civilIdExpiry} onChange={set('civilIdExpiry')} />
        <TextInput label="رقم الإقامة" ltr value={f.residencyNo} onChange={set('residencyNo')} />
        <TextInput label="انتهاء الإقامة" type="date" value={f.residencyExpiry} onChange={set('residencyExpiry')} />
        <TextInput label="رقم الجواز" ltr value={f.passportNo} onChange={set('passportNo')} />
        <TextInput label="انتهاء الجواز" type="date" value={f.passportExpiry} onChange={set('passportExpiry')} />
        <Textarea label="ملاحظات" value={f.notes} onChange={set('notes')} className="sm:col-span-2" />
      </Section>

      {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" className="flex-[1_1_160px]" loading={save.isPending} onClick={() => { setError(''); save.mutate({ ...f, id: emp?.id || '' }, { onError: (e) => setError(e.message) }); }}>{emp ? 'حفظ التغييرات' : 'إضافة الموظف'}</Button>
        {!emp && <Button variant="ghost" onClick={onCancel}>إلغاء</Button>}
      </div>

      {emp && <BalancesBlock emp={emp} />}
      {emp && dir.canManageAccounts && <AccountBlock emp={emp} dir={dir} />}
    </Card>
  );
}

function BalancesBlock({ emp }: { emp: EmployeeView }) {
  const year = kwDate().slice(0, 4);
  const q = useApi<{ balances: Balance[] }>('hr.leave.balances', { employeeId: emp.id, year });
  const [adj, setAdj] = useState<Balance | null>(null);
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <span className="font-semibold">أرصدة الإجازات {year}</span>
      {!q.data ? <Skeleton className="h-16" /> : (
        <div className="flex flex-col">
          {q.data.balances.map((b) => (
            <div key={b.typeId} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
              <span className="flex-1">{b.name}</span>
              <span className="text-[13px] text-muted">مستخدم {b.used}{b.pending ? ` · معلّق ${b.pending}` : ''}{b.adjustment ? ` · تسوية ${b.adjustment > 0 ? '+' : ''}${b.adjustment}` : ''}</span>
              <b className="w-12 text-left num">{b.unlimited ? '∞' : b.available}</b>
              <button type="button" onClick={() => setAdj(b)} aria-label={'تسوية ' + b.name} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-chip hover:text-fg cursor-pointer"><Icon name="edit" size={16} /></button>
            </div>
          ))}
        </div>
      )}
      <AdjustDialog emp={emp} year={year} balance={adj} onClose={() => setAdj(null)} />
    </div>
  );
}

function AdjustDialog({ emp, year, balance, onClose }: { emp: EmployeeView; year: string; balance: Balance | null; onClose: () => void }) {
  const [v, setV] = useState('0');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (balance) { setV(String(balance.adjustment || 0)); setNote(balance.adjNote || ''); setError(''); } }, [balance]);
  const save = useAction('hr.leave.adjust', { invalidate: ['hr.leave.balances', 'hr.me'], success: 'حُفظت التسوية', silentError: true, onSuccess: onClose });
  return (
    <Dialog open={!!balance} onClose={onClose} title={`تسوية رصيد ${balance?.name || ''}`}
      footer={<><Button variant="primary" className="flex-1" loading={save.isPending} onClick={() => save.mutate({ employeeId: emp.id, typeId: balance!.typeId, year, adjustment: v, note }, { onError: (e) => setError(e.message) })}>حفظ</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-muted">{emp.fullName} · الاستحقاق السنوي {balance?.entitled} يوم. التسوية تُضاف أو تُطرح (مثل رصيد مُرحّل من السنة السابقة).</p>
        <TextInput label="أيام التسوية (+ أو −)" type="number" min={-365} max={365} value={v} onChange={(e) => setV(e.target.value)} />
        <TextInput label="ملاحظة" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}

function AccountBlock({ emp, dir }: { emp: EmployeeView; dir: Directory }) {
  const toast = useToast();
  const [mode, setMode] = useState<'create' | 'link'>('create');
  const [username, setUsername] = useState('');
  const [userId, setUserId] = useState('');
  const [temp, setTemp] = useState<{ username: string; password: string } | null>(null);
  const act = useAction<Record<string, string>, { username?: string; tempPassword?: string }>('hr.employee.account', {
    invalidate: ['hr.directory', 'users.list'],
    onSuccess: (r) => { if (r.tempPassword) setTemp({ username: r.username!, password: r.tempPassword }); else toast('تم'); }
  });
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <span className="font-semibold">حساب الدخول</span>
      {emp.userId ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex-1">مرتبط بالحساب <b className="ltr">{emp.username}</b>{!emp.userActive && <Badge tone="bad">معطّل</Badge>}</span>
          <Link to="/settings/users" className="text-[13px] text-accent-fg no-underline">الصلاحيات</Link>
          <Button size="sm" variant="ghost" loading={act.isPending} onClick={() => act.mutate({ id: emp.id, action: 'unlink' })}>فك الربط</Button>
        </div>
      ) : (
        <>
          <Segmented label="طريقة الربط" value={mode} onChange={setMode} options={[{ value: 'create', label: 'حساب جديد' }, { value: 'link', label: 'ربط حساب موجود', count: dir.freeUsers?.length }]} />
          {mode === 'create' ? (
            <div className="flex flex-wrap items-end gap-2">
              <TextInput label="اسم المستخدم" ltr autoCapitalize="none" className="flex-1" value={username} onChange={(e) => setUsername(e.target.value)} hint="بصلاحيات «موظف» في الحضور والموارد البشرية" />
              <Button variant="primary" loading={act.isPending} onClick={() => act.mutate({ id: emp.id, action: 'create', username })}>إنشاء</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <Select label="الحساب" className="flex-1" value={userId} onChange={(e) => setUserId(e.target.value)} options={[{ value: '', label: 'اختر حساباً' }, ...(dir.freeUsers || []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` }))]} />
              <Button variant="primary" loading={act.isPending} disabled={!userId} onClick={() => act.mutate({ id: emp.id, action: 'link', userId })}>ربط</Button>
            </div>
          )}
        </>
      )}
      <Dialog open={!!temp} onClose={() => setTemp(null)} title="كلمة المرور المؤقتة" footer={<Button variant="primary" onClick={() => setTemp(null)}>تم، سلّمتها</Button>}>
        {temp && (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-muted">سلّمها إلى <b className="text-fg">{emp.fullName}</b>. لن تظهر مرة أخرى، وسيختار كلمة مرور خاصة عند أول دخول.</p>
            <div className="flex flex-col gap-1 rounded-xl bg-bg p-4">
              <span className="text-[13px] text-muted">اسم المستخدم</span><span className="ltr text-right text-[17px] font-semibold">{temp.username}</span>
              <span className="mt-2 text-[13px] text-muted">كلمة المرور المؤقتة</span><span className="ltr text-right font-mono text-[20px] font-bold tracking-wider">{temp.password}</span>
            </div>
            <Button icon="copy" onClick={() => navigator.clipboard?.writeText(`اسم المستخدم: ${temp.username}\nكلمة المرور المؤقتة: ${temp.password}\n${location.origin}${import.meta.env.BASE_URL}`).then(() => toast('تم النسخ'))}>نسخ البيانات مع الرابط</Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
