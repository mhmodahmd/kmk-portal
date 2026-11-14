import crypto from 'node:crypto';
import { eq, test, truthy } from './harness.mjs';
import { withAdmin } from './core.test.mjs';

/** تجزئة كلمة المرور كما في نظام الحضور السابق */
function legacyHash(pw, salt) {
  let h = salt + '|' + pw;
  for (let i = 0; i < 64; i++) h = crypto.createHash('sha256').update(h + salt, 'utf8').digest('base64');
  return h;
}

const ms = (iso) => String(Date.parse(iso));

/** نسخة مصغّرة من ملف النظام السابق ببيانات مختلقة */
function legacy() {
  const user = (id, username, name, role, pw, jobTitle) => ({ id, username, passHash: legacyHash(pw, 's' + id), salt: 's' + id, name, role, active: '1', jobTitle, createdAt: '2026-10-05T17:20:46.272Z' });
  return {
    Users: [
      user('boss000000000001', 'boss name', 'المدير', 'admin', 'bosspass1', 'مدير النظام'),
      user('emp0000000000001', 'sami', 'سامي', 'employee', 'oldpass1', 'محاسب'),
      user('emp0000000000002', 'mona', 'منى', 'employee', 'oldpass2', 'مصممة'),
      user('view000000000001', 'chief', 'الرئيس', 'viewer', 'chief123', 'مدير الشركة'),
      user('bad0000000000001', 'x y', 'خطأ', 'viewer', 'x', '')
    ],
    Employees: [
      { id: 'boss000000000001', empNo: '1001', departmentId: 'dep0000000000001', branchId: 'br00000000000001', hireDate: '2024-10-01', nationality: 'مصري', contractType: 'دوام جزئي', updatedAt: '1793712517502' },
      { id: 'emp0000000000001', empNo: '1002', departmentId: 'dep0000000000002', managerId: '', civilIdExpiry: '2027-06-01', updatedAt: '1793712378223' }
    ],
    Departments: [
      { id: 'dep0000000000001', name: 'إدارة المشاريع', managerId: '', active: '1' },
      { id: 'dep0000000000002', name: 'الإدارة المالية', managerId: 'emp0000000000001', active: '1' }
    ],
    Branches: [{ id: 'br00000000000001', name: 'الرئيسي', address: 'المرقاب', active: '1' }],
    Shifts: [], Holidays: [],
    LeaveTypes: [{ id: 'lt_annual', name: 'إجازة سنوية', annualDays: '30', paid: '1', active: '1' }, { id: 'lt_unpaid', name: 'إجازة بدون راتب', annualDays: '0', paid: '0', active: '1' }],
    LeaveBalances: [],
    LeaveRequests: [{ id: 'lr00000000000001', userId: 'boss000000000001', typeId: 'lt_unpaid', from: '2026-11-03', to: '2026-11-11', days: '8', status: 'approved', decidedBy: 'المدير', decidedAt: '1793712593200', decisionNote: 'تسجيل مباشر', createdAt: '1793712593200' }],
    OvertimeRequests: [],
    Attendance: [
      { id: 'at00000000000001', userId: 'emp0000000000001', date: '2026-10-05', inTs: ms('2026-10-05T05:00:00Z'), outTs: ms('2026-10-05T13:30:00Z'), inLat: '29.367591', inLng: '47.980250', note: '', editedBy: '', updatedAt: ms('2026-10-05T13:30:00Z') },
      { id: 'at00000000000002', userId: 'emp0000000000001', date: '2026-11-01', inTs: ms('2026-11-01T05:10:00Z'), outTs: ms('2026-11-01T12:00:00Z'), note: '', editedBy: 'المدير', updatedAt: ms('2026-11-02T08:00:00Z') },
      { id: 'at00000000000003', userId: 'boss000000000001', date: '2026-11-02', inTs: ms('2026-11-02T05:00:00Z'), outTs: '', note: '', editedBy: '', updatedAt: ms('2026-11-02T05:00:00Z') },
      { id: 'at00000000000004', userId: 'view000000000001', date: '2026-11-02', inTs: ms('2026-11-02T05:00:00Z'), outTs: '', updatedAt: '' }
    ]
  };
}

function setup() {
  const s = withAdmin('2026-11-15T05:00:00Z');
  const adminId = s.ok('auth.me', {}, s.admin).user.id;
  const run = (extra = {}, src = legacy()) => s.ok('system.migrate.legacyAttendance', { source: src, userMap: { boss000000000001: adminId }, ...extra }, s.admin);
  return { ...s, adminId, run };
}

test('legacy migration dry run writes nothing and reports what will happen', () => {
  const s = setup();
  const r = s.run({ dryRun: true });
  eq(r.created.Employees, 3, 'two HR rows plus the employee without one');
  eq(r.created.Users, 3);
  eq(r.created.Attendance, 3);
  truthy(r.warnings.some((w) => w.includes('x y')), 'invalid username is reported');
  truthy(r.warnings.some((w) => w.includes('at00000000000004')), 'non-employee punches are reported');
  eq(r.reconcile.ok, true);
  eq(s.ok('hr.directory', {}, s.admin).employees.length, 0, 'nothing written');
  eq(s.fail('auth.login', { username: 'sami', password: 'oldpass1' }).code, 'BAD_LOGIN');
});

test('legacy migration moves people, structure, punches and leaves, and keeps old passwords', () => {
  const s = setup();
  const r = s.run();
  eq(r.reconcile.ok, true);
  eq(r.reconcile.records, 3);
  const sami = r.reconcile.rows.find((x) => x.name === 'سامي' && x.month === '2026-10');
  eq([sami.sourceMinutes, sami.portalMinutes], [510, 510]);

  const dir = s.ok('hr.directory', {}, s.admin).employees;
  eq(dir.length, 3);
  const boss = dir.find((e) => e.fullName === 'المدير');
  eq(boss.empNo, '1001');
  eq(dir.find((e) => e.fullName === 'منى').empNo, '1003', 'employee without HR row gets the next number');

  // كلمة المرور القديمة تعمل، ثم تُعاد بطريقة البوابة
  const login = s.ok('auth.login', { username: 'sami', password: 'oldpass1' });
  eq(login.roles, { attendance: 'employee', hr: 'employee' });
  eq(s.fail('auth.login', { username: 'sami', password: 'wrong' }).code, 'BAD_LOGIN');
  truthy(s.ok('auth.login', { username: 'sami', password: 'oldpass1' }).token, 'works again after rehash');
  eq(s.ok('auth.login', { username: 'chief', password: 'chief123' }).roles, { attendance: 'viewer' });

  // سجل سامي الشهري والمدير مرتبط بموظفه
  const month = s.ok('att.myMonth', { month: '2026-10' }, login.token);
  eq(month.summary.totalMinutes, 510);
  const recs = s.ok('att.records', { month: '2026-11' }, s.admin).rows;
  eq(recs.find((x) => x.id === 'at00000000000002').source, 'manual');
  eq(s.ok('hr.me', {}, s.admin).employee.fullName, 'المدير');
  truthy(s.ok('hr.leave.list', { status: 'all' }, s.admin).some((x) => x.id === 'lr00000000000001'), 'leave moved');
});

test('legacy migration is safe to run again and picks up new punches', () => {
  const s = setup();
  s.run();
  const src = legacy();
  src.Attendance[2].outTs = ms('2026-11-02T13:00:00Z');
  src.Attendance.push({ id: 'at00000000000005', userId: 'emp0000000000001', date: '2026-11-03', inTs: ms('2026-11-03T05:00:00Z'), outTs: '', updatedAt: '' });
  src.Users[1].name = 'اسم معدّل في النظام القديم';
  const r = s.run({}, src);
  eq(r.created, { Attendance: 1 });
  eq(r.updated, { Attendance: 1 });
  eq(r.reconcile.ok, true);
  eq(s.ok('hr.directory', {}, s.admin).employees.find((e) => e.empNo === '1002').fullName, 'سامي', 'people are not overwritten after the first run');
  eq(s.fail('system.migrate.legacyAttendance', { source: src }, s.ok('auth.login', { username: 'sami', password: 'oldpass1' }).token).code, 'FORBIDDEN');
});
