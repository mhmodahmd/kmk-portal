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

test('auth: a password stored with the old 1000-round hash still works and is rehashed to v2 on login', () => {
  const s = withAdmin();
  const Auth = s.srv.Auth, Db = s.srv.Db;
  const u0 = Db.find('core', 'Users', (r) => r.username === 'admin')[0];
  truthy(u0.passwordHash.startsWith('v2$'), 'new accounts use v2');
  Db.update('core', 'Users', u0.id, { passwordHash: Auth.hashPassword_('admin1234', u0.salt, 1000) });
  truthy(!Db.get('core', 'Users', u0.id).passwordHash.startsWith('v2$'));
  truthy(s.ok('auth.login', { username: 'admin', password: 'admin1234' }).token, 'old hash accepted');
  const u1 = Db.get('core', 'Users', u0.id);
  truthy(u1.passwordHash.startsWith('v2$') && u1.salt !== u0.salt, 'rehashed with a fresh salt');
  eq(s.fail('auth.login', { username: 'admin', password: 'admin1235' }).code, 'BAD_LOGIN');
});

test('auth: changing the password keeps this session and ends every other one (and old device tokens)', () => {
  const s = withAdmin();
  const a = s.ok('auth.login', { username: 'admin', password: 'admin1234', remember: true });
  const b = s.ok('auth.login', { username: 'admin', password: 'admin1234' });
  truthy(s.ok('auth.me', {}, b.token).user);
  s.ok('auth.changePassword', { current: 'admin1234', next: 'newpass123' }, a.token);
  truthy(s.ok('auth.me', {}, a.token).user, 'the session that changed it continues');
  eq(s.fail('auth.me', {}, b.token).code, 'SESSION_EXPIRED', 'the other session is gone');
  eq(s.fail('auth.resume', { deviceToken: a.deviceToken }).code, 'SESSION_EXPIRED', 'old device token too');
  truthy(s.ok('auth.login', { username: 'admin', password: 'newpass123' }).token);
});

test('auth: bursts of failed logins are throttled per username and portal-wide', () => {
  const s = withAdmin();
  for (let i = 0; i < 10; i++) eq(s.fail('auth.login', { username: 'nobody', password: 'x' }).code, 'BAD_LOGIN');
  eq(s.fail('auth.login', { username: 'nobody', password: 'x' }).code, 'TOO_MANY_ATTEMPTS', 'unknown usernames are counted too');
  truthy(s.ok('auth.login', { username: 'admin', password: 'admin1234' }).token, 'others are unaffected');
  for (let i = 0; i < 20; i++) s.fail('auth.login', { username: 'ghost' + i, password: 'x' });
  eq(s.fail('auth.login', { username: 'admin', password: 'admin1234' }).code, 'TOO_MANY_ATTEMPTS', '30 failures in a minute: everyone waits');
  s.clock.advance(61_000);
  // the per-minute counter has expired; the per-username counters live 15 minutes
  truthy(s.ok('auth.login', { username: 'admin', password: 'admin1234' }).token);
  eq(s.fail('auth.login', { username: 'nobody', password: 'x' }).code, 'TOO_MANY_ATTEMPTS');
});

test('settings: company update goes through Db and is read back', () => {
  const s = withAdmin();
  s.ok('settings.update', { company: { name: 'كي ام كي للتجارة', address: 'الكويت', phone: '12345678' } }, s.admin);
  s.ok('settings.update', { company: { name: 'كي ام كي للتجارة', address: 'حولي', phone: '12345678' } }, s.admin);
  eq(s.ok('settings.get', {}, s.admin).company, { name: 'كي ام كي للتجارة', address: 'حولي', phone: '12345678' });
  eq(s.srv.Db.view('core', 'Settings').filter((r) => r.key === 'company').length, 1, 'one row per key');
});
