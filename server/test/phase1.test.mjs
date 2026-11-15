import { eq, test, truthy } from './harness.mjs';
import { withAdmin } from './core.test.mjs';

// 2026-11-15 يوم أحد. 05:00Z = 08:00 بتوقيت الكويت
export const SUN = '2026-11-15';
export const at = (date, hm) => `${date}T${String(Number(hm.slice(0, 2)) - 3).padStart(2, '0')}:${hm.slice(3)}:00Z`;

/** شركة صغيرة: وردية، قسم، فرع، مديرة (سارة) وموظف تحتها (أحمد) وموظفة موارد بشرية (هدى) */
export function company(startAt = at(SUN, '07:00')) {
  const s = withAdmin(startAt);
  const A = s.admin;
  const shift = s.ok('hr.shift.save', { name: 'صباحي', start: '08:00', end: '16:00', graceMin: 10, workDays: '0,1,2,3,4' }, A);
  const branch = s.ok('hr.branch.save', { name: 'المقر', lat: '29.3759', lng: '47.9774', geoRadius: 150 }, A);
  const sara = s.ok('hr.employee.save', { fullName: 'سارة', jobTitle: 'مديرة التصميم', shiftId: shift.id, branchId: branch.id, hireDate: '2026-01-01' }, A);
  const dept = s.ok('hr.dept.save', { name: 'التصميم', managerId: sara.id }, A);
  const ahmad = s.ok('hr.employee.save', { fullName: 'أحمد', jobTitle: 'مصمم', shiftId: shift.id, departmentId: dept.id, branchId: branch.id, hireDate: '2026-01-01' }, A);
  const huda = s.ok('hr.employee.save', { fullName: 'هدى', jobTitle: 'موارد بشرية', shiftId: shift.id, hireDate: '2026-01-01' }, A);
  const account = (emp, username, roles) => {
    const r = s.ok('hr.employee.account', { id: emp.id, action: 'create', username }, A);
    const login = s.ok('auth.login', { username, password: r.tempPassword });
    s.ok('auth.changePassword', { current: r.tempPassword, next: 'pass12345' }, login.token);
    if (roles) {
      const list = s.ok('users.list', {}, A);
      const u = list.users.find((x) => x.username === username);
      s.ok('users.setRoles', { id: u.id, roles }, A);
    }
  };
  account(sara, 'sara');
  account(ahmad, 'ahmad');
  account(huda, 'huda', { attendance: 'hr', hr: 'hr' });
  // الجلسة تنتهي بعد 6 ساعات والاختبارات تقفز أياماً: كل وصول يعيد تسجيل الدخول عند الحاجة
  const tokens = {};
  const tokenOf = (username) => {
    const t = tokens[username];
    if (t && s.call('auth.me', {}, t).ok) return t;
    return (tokens[username] = s.ok('auth.login', { username, password: 'pass12345' }).token);
  };
  const T = {
    get sara() { return tokenOf('sara'); },
    get ahmad() { return tokenOf('ahmad'); },
    get huda() { return tokenOf('huda'); }
  };
  const adminLogin = () => s.ok('auth.login', { username: 'admin', password: 'admin1234' }).token;
  let admin = A;
  return {
    ...s, shift, branch, dept, emp: { sara, ahmad, huda }, T,
    get A() { if (!s.call('auth.me', {}, admin).ok) admin = adminLogin(); return admin; },
    get admin() { return this.A; }
  };
}

test('employee numbers, duplicates and manager rules', () => {
  const c = company();
  eq(c.emp.sara.empNo, '1001');
  eq(c.emp.ahmad.empNo, '1002');
  eq(c.emp.ahmad.effectiveManagerId, c.emp.sara.id, 'department manager is the effective manager');
  truthy(c.fail('hr.employee.save', { id: c.emp.ahmad.id, fullName: 'أحمد', empNo: '1001' }, c.A).message.includes('مستخدم'));
  truthy(c.fail('hr.employee.save', { id: c.emp.sara.id, fullName: 'سارة', managerId: c.emp.ahmad.id }, c.A).message.includes('فريق'));
  eq(c.fail('hr.directory', {}, c.T.ahmad).code, 'FORBIDDEN');
  const dir = c.ok('hr.directory', {}, c.T.huda);
  eq(dir.employees.length, 3);
});

test('created account gets employee roles and link', () => {
  const c = company();
  const me = c.ok('auth.me', {}, c.T.ahmad);
  eq(me.roles, { attendance: 'employee', hr: 'employee', tasks: 'member' });
  const hr = c.ok('hr.me', {}, c.T.ahmad);
  eq(hr.employee.fullName, 'أحمد');
  eq(hr.employee.managerName, 'سارة');
  eq(c.ok('hr.me', {}, c.T.sara).isManager, true);
});

test('punch in late, double punch, punch out, month summary', () => {
  const c = company(at(SUN, '08:20'));
  const t = c.ok('att.punch', { kind: 'in' }, c.T.ahmad);
  eq(t.isIn, true);
  eq(t.late, 20);
  c.clock.advance(30000);
  truthy(c.fail('att.punch', { kind: 'in' }, c.T.ahmad).message.includes('دقيقة'));
  c.clock.set(at(SUN, '15:30'));
  eq(c.fail('att.punch', { kind: 'in' }, c.T.ahmad).code, 'ALREADY_IN');
  const out = c.ok('att.punch', { kind: 'out' }, c.T.ahmad);
  eq(out.isIn, false);
  eq(out.closedMinutes, 430);
  c.clock.advance(120000);
  eq(c.fail('att.punch', { kind: 'out' }, c.T.ahmad).code, 'NOT_IN');
  c.clock.advance(-120000);
  const m = c.ok('att.myMonth', { month: '2026-11' }, c.T.ahmad);
  const day = m.days.find((d) => d.date === SUN);
  eq([day.status, day.late, day.early, day.minutes], ['present', 20, 30, 430]);
  eq(m.summary.lateDays, 1);
});

test('absence, weekend and holidays in month report', () => {
  const c = company(at('2026-11-20', '10:00')); // الجمعة
  c.ok('hr.holiday.save', { name: 'عطلة تجريبية', date: '2026-11-17' }, c.A);
  // قبل أول بصمة في النظام لا يُحتسب غياب
  const before = c.ok('att.myMonth', { month: '2026-11' }, c.T.ahmad);
  eq(before.summary.absentDays, 0, 'no absence before the system started');
  c.ok('att.settings.save', { startDate: '2026-11-15' }, c.T.huda);
  const m = c.ok('att.myMonth', { month: '2026-11' }, c.T.ahmad);
  eq(m.days.find((d) => d.date === '2026-11-12').status, 'none', 'before start date');
  const by = Object.fromEntries(m.days.map((d) => [d.date, d.status]));
  eq(by['2026-11-16'], 'absent');
  eq(by['2026-11-17'], 'holiday');
  eq(by['2026-11-20'], 'weekend');
  eq(by['2026-11-23'], 'future');
});

test('geo fencing', () => {
  const c = company(at(SUN, '07:55'));
  c.ok('att.settings.save', { geoRequired: true }, c.T.huda);
  eq(c.fail('att.punch', { kind: 'in' }, c.T.ahmad).code, 'GEO_REQUIRED');
  eq(c.fail('att.punch', { kind: 'in', lat: '29.40', lng: '47.99', acc: 10 }, c.T.ahmad).code, 'GEO_OUT');
  eq(c.ok('att.punch', { kind: 'in', lat: '29.3760', lng: '47.9775', acc: 10 }, c.T.ahmad).isIn, true);
});

test('two-stage leave approval through the inbox', () => {
  const c = company();
  const r = c.ok('hr.leave.request', { typeId: 'lt_annual', from: '2026-11-22', to: '2026-11-26', reason: 'سفر' }, c.T.ahmad);
  eq([r.status, r.days], ['pending_manager', 5]);
  eq(c.ok('inbox.list', {}, c.T.huda).length, 0, 'HR waits for the manager stage');
  const inbox = c.ok('inbox.list', {}, c.T.sara);
  eq(inbox.length, 1);
  eq(c.fail('inbox.decide', { kind: 'hr.leave', id: r.id, approve: false }, c.T.sara).message.includes('سبب'), true);
  c.ok('inbox.decide', { kind: 'hr.leave', id: r.id, approve: true }, c.T.sara);
  eq(c.ok('inbox.list', {}, c.T.sara).length, 0);
  const hrInbox = c.ok('inbox.list', {}, c.T.huda);
  eq(hrInbox[0].status, 'بانتظار الموارد البشرية');
  c.ok('inbox.decide', { kind: hrInbox[0].kind, id: hrInbox[0].refId, approve: true }, c.T.huda);
  const me = c.ok('hr.me', {}, c.T.ahmad);
  eq(me.leaves[0].status, 'approved');
  const annual = me.balances.find((b) => b.typeId === 'lt_annual');
  eq([annual.used, annual.available], [5, 25]);
  c.clock.set(at('2026-11-30', '09:00'));
  const m = c.ok('att.myMonth', { month: '2026-11' }, c.T.ahmad);
  eq(m.days.find((d) => d.date === '2026-11-23').status, 'leave');
  eq(m.summary.leaveDays, 5);
});

test('leave rules: own decision, overlap, balance, no manager', () => {
  const c = company();
  const own = c.ok('hr.leave.request', { typeId: 'lt_annual', from: '2026-11-22', to: '2026-11-22' }, c.T.huda);
  eq(own.status, 'pending_hr', 'no manager goes straight to HR');
  eq(c.fail('hr.leave.decide', { id: own.id, approve: true }, c.T.huda).code, 'FORBIDDEN');
  truthy(c.fail('hr.leave.request', { typeId: 'lt_annual', from: '2026-11-22', to: '2026-11-23' }, c.T.huda).message.includes('يتداخل'));
  truthy(c.fail('hr.leave.request', { typeId: 'lt_emergency', from: '2026-12-01', to: '2026-12-10' }, c.T.ahmad).message.includes('غير كافٍ'));
  truthy(c.fail('hr.leave.request', { typeId: 'lt_annual', from: '2026-11-20', to: '2026-11-21' }, c.T.ahmad).message.includes('عطلات'));
  c.ok('hr.leave.adjust', { employeeId: c.emp.ahmad.id, typeId: 'lt_emergency', year: '2026', adjustment: 5, note: 'تعويض' }, c.T.huda);
  eq(c.ok('hr.leave.request', { typeId: 'lt_emergency', from: '2026-12-01', to: '2026-12-10' }, c.T.ahmad).days, 8);
});

test('overtime needs attendance and is decided by the manager', () => {
  const c = company(at(SUN, '08:00'));
  truthy(c.fail('hr.ot.request', { date: SUN, minutes: 60 }, c.T.ahmad).message.includes('حضور'));
  c.ok('att.punch', { kind: 'in' }, c.T.ahmad);
  c.clock.set(at(SUN, '18:00'));
  c.ok('att.punch', { kind: 'out' }, c.T.ahmad);
  const o = c.ok('hr.ot.request', { date: SUN, minutes: 120, reason: 'تسليم مشروع' }, c.T.ahmad);
  truthy(c.fail('hr.ot.request', { date: SUN, minutes: 30 }, c.T.ahmad).message.includes('مسبقاً'));
  const item = c.ok('inbox.list', {}, c.T.sara).find((x) => x.kind === 'hr.ot');
  c.ok('inbox.decide', { kind: 'hr.ot', id: o.id, approve: true }, c.T.sara);
  eq(item.refId, o.id);
  const m = c.ok('att.myMonth', { month: '2026-11' }, c.T.ahmad);
  eq(m.summary.overtimeMin, 120);
});

test('punch correction: forgot to clock out', () => {
  const c = company(at(SUN, '08:00'));
  c.ok('att.punch', { kind: 'in' }, c.T.ahmad);
  c.clock.set(at('2026-11-16', '08:30'));
  const corr = c.ok('att.correction.request', { date: SUN, kind: 'missingOut', outTime: '16:05', reason: 'نسيت' }, c.T.ahmad);
  eq(corr.status, 'pending');
  const item = c.ok('inbox.list', {}, c.T.sara).find((x) => x.kind === 'att.correction');
  truthy(item, 'manager sees the correction');
  c.ok('inbox.decide', { kind: 'att.correction', id: corr.id, approve: true }, c.T.sara);
  const m = c.ok('att.myMonth', { month: '2026-11' }, c.T.ahmad);
  const d = m.days.find((x) => x.date === SUN);
  eq([d.status, d.minutes, d.edited], ['present', 485, true]);
});

test('board scope: team for managers, all for HR, none for employees', () => {
  const c = company(at(SUN, '09:00'));
  c.ok('att.punch', { kind: 'in' }, c.T.ahmad);
  const team = c.ok('att.board', {}, c.T.sara);
  eq([team.scope, team.rows.length, team.rows[0].status], ['team', 1, 'in']);
  const all = c.ok('att.board', {}, c.T.huda);
  eq([all.scope, all.counts.total, all.counts.in, all.counts.absent], ['all', 3, 1, 2]);
  eq(c.fail('att.board', {}, c.T.ahmad).code, 'FORBIDDEN');
  const sum = c.ok('home.summary', {}, c.T.sara);
  truthy(sum.cards.some((x) => x.kind === 'att.board') && sum.cards.some((x) => x.kind === 'att.today'));
});

test('manual record edit requires a reason and rejects overlaps', () => {
  const c = company(at('2026-11-16', '12:00'));
  truthy(c.fail('att.record.save', { employeeId: c.emp.ahmad.id, date: SUN, inTime: '08:00', outTime: '16:00' }, c.T.huda).message.includes('سبب'));
  c.ok('att.record.save', { employeeId: c.emp.ahmad.id, date: SUN, inTime: '08:00', outTime: '16:00', note: 'جهاز معطل' }, c.T.huda);
  truthy(c.fail('att.record.save', { employeeId: c.emp.ahmad.id, date: SUN, inTime: '15:00', outTime: '17:00', note: 'x' }, c.T.huda).message.includes('يتداخل'));
  eq(c.fail('att.record.save', { employeeId: c.emp.ahmad.id, date: SUN, inTime: '18:00', note: 'x' }, c.T.sara).code, 'FORBIDDEN');
  const rec = c.ok('att.records', { month: '2026-11' }, c.T.huda);
  eq([rec.rows.length, rec.rows[0].minutes, rec.canEdit], [1, 480, true]);
  const audit = c.ok('audit.list', { module: 'attendance' }, c.A);
  truthy(audit.rows.some((r) => r.action === 'record.create'));
});

test('night shift crossing midnight', () => {
  const c = company(at('2026-11-16', '09:00'));
  c.ok('att.record.save', { employeeId: c.emp.ahmad.id, date: SUN, inTime: '22:00', outTime: '02:00', note: 'مناوبة' }, c.T.huda);
  const r = c.ok('att.records', { month: '2026-11' }, c.T.huda).rows[0];
  eq(r.minutes, 240);
});

test('report and document alerts', () => {
  const c = company(at(SUN, '09:00'));
  c.ok('hr.employee.save', { id: c.emp.ahmad.id, fullName: 'أحمد', residencyExpiry: '2026-12-01', shiftId: c.shift.id, departmentId: c.dept.id }, c.A);
  const dir = c.ok('hr.directory', {}, c.T.huda);
  eq(dir.expiring[0].doc, 'الإقامة');
  const rep = c.ok('att.report', { month: '2026-11' }, c.T.huda);
  eq(rep.rows.length, 3);
  const single = c.ok('att.report', { month: '2026-11', employeeId: c.emp.ahmad.id }, c.T.sara);
  eq(single.single, true);
  eq(c.fail('att.report', { month: '2026-11', employeeId: c.emp.huda.id }, c.T.sara).code, 'FORBIDDEN');
  const sum = c.ok('home.summary', {}, c.T.huda);
  truthy(sum.cards.some((x) => x.kind === 'hr.docs' && x.count === 1));
});

test('board: an employee hired after the date is not counted absent (same rule as the monthly report)', () => {
  const c = company(at(SUN, '09:00'));
  // عُيّن بعد اليوم المفحوص (الأحد 15): اللوحة ليوم الخميس 12 يجب ألا تحسبه غائباً
  c.ok('hr.employee.save', { fullName: 'جديد', jobTitle: 'مصمم', shiftId: c.shift.id, hireDate: '2026-11-15' }, c.A);
  c.ok('att.punch', { kind: 'in' }, c.T.ahmad); // بداية الاحتساب = اليوم؛ نجعلها أقدم لاختبار يوم سابق
  c.ok('att.settings.save', { startDate: '2026-11-01', openMaxHours: 16 }, c.T.huda);
  const b = c.ok('att.board', { date: '2026-11-12' }, c.T.huda);
  const row = b.rows.find((r) => r.name === 'جديد');
  eq(row.status, 'none', 'hired later → not absent');
  eq(b.counts.absent, 3, 'the three earlier hires are absent that day');
  const rep = c.ok('att.report', { month: '2026-11', employeeId: row.employeeId }, c.T.huda).report;
  eq(rep.days.find((d) => d.date === '2026-11-12').status, 'none', 'monthly report agrees');
});
