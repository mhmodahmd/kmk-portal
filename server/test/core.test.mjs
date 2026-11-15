import { boot, eq, test, truthy } from './harness.mjs';

/** خادم مُعدّ بمدير نظام، يُستخدم في معظم الاختبارات */
export function withAdmin(startAt) {
  const s = boot(startAt);
  const r = s.ok('auth.setup', { username: 'admin', fullName: 'مدير النظام', password: 'admin1234', companyName: 'شركة كي ام كي' });
  return { ...s, admin: r.token };
}

/** ينشئ مستخدماً ويغيّر كلمة مروره المؤقتة، ويعيد رمز جلسته */
export function makeUser(s, data) {
  const c = s.ok('users.create', data, s.admin);
  const login = s.ok('auth.login', { username: data.username, password: c.tempPassword });
  s.ok('auth.changePassword', { current: c.tempPassword, next: 'pass12345' }, login.token);
  return { id: c.user.id, token: login.token };
}

test('system.status before setup', () => {
  const s = boot();
  const st = s.ok('system.status');
  eq(st.needsSetup, true);
});

test('setup creates super admin once', () => {
  const s = withAdmin();
  eq(s.ok('system.status').needsSetup, false);
  const e = s.fail('auth.setup', { username: 'x', fullName: 'x', password: 'abc12345' });
  eq(e.code, 'ALREADY_SETUP');
});

test('login, wrong password and lockout', () => {
  const s = withAdmin();
  eq(s.fail('auth.login', { username: 'admin', password: 'nope1234' }).code, 'BAD_LOGIN');
  for (let i = 0; i < 4; i++) s.fail('auth.login', { username: 'admin', password: 'nope1234' });
  eq(s.fail('auth.login', { username: 'admin', password: 'admin1234' }).code, 'LOCKED');
  s.clock.advance(16 * 60000);
  truthy(s.ok('auth.login', { username: 'admin', password: 'admin1234' }).token);
});

test('device token resumes session', () => {
  const s = withAdmin();
  const r = s.ok('auth.login', { username: 'admin', password: 'admin1234', remember: true });
  truthy(r.deviceToken);
  const again = s.ok('auth.resume', { deviceToken: r.deviceToken });
  truthy(again.token);
  eq(s.fail('auth.resume', { deviceToken: r.deviceToken + 'x' }).code, 'SESSION_EXPIRED');
});

test('new user must change password and has roles', () => {
  const s = withAdmin();
  const c = s.ok('users.create', { username: 'ahmad', fullName: 'أحمد', roles: { attendance: 'employee' } }, s.admin);
  const login = s.ok('auth.login', { username: 'ahmad', password: c.tempPassword });
  eq(s.fail('home.summary', {}, login.token).code, 'MUST_CHANGE_PASSWORD');
  s.ok('auth.changePassword', { current: c.tempPassword, next: 'pass12345' }, login.token);
  const me = s.ok('auth.me', {}, login.token);
  eq(me.roles, { attendance: 'employee', tasks: 'member' });
  eq(s.fail('users.list', {}, login.token).code, 'FORBIDDEN');
});

test('last super admin cannot be removed', () => {
  const s = withAdmin();
  const list = s.ok('users.list', {}, s.admin);
  const me = list.users[0];
  const e = s.fail('users.update', { id: me.id, fullName: me.fullName, isSuperAdmin: false }, s.admin);
  truthy(e.message.includes('مدير نظام'));
});

test('audit records actions', () => {
  const s = withAdmin();
  s.ok('users.create', { username: 'sara', fullName: 'سارة' }, s.admin);
  const a = s.ok('audit.list', {}, s.admin);
  truthy(a.rows.some((r) => r.action === 'user.create'));
});
