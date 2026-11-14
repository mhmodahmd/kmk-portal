import { eq, test, truthy } from './harness.mjs';
import { company, at, SUN } from './phase1.test.mjs';
import { virtualAuthenticator } from './authenticator.mjs';

const challenge = (c, token) => c.ok('att.device.challenge', {}, token).challenge;

/** يسجّل جهازاً لموظف ويعيده */
function enroll(c, token, opts, origin) {
  const dev = virtualAuthenticator(opts);
  c.ok('att.device.register', dev.create(challenge(c, token), origin), token);
  return dev;
}

const punchWith = (c, token, dev, kind, origin) =>
  c.call('att.punch', { kind, assertion: dev.get(challenge(c, token), origin) }, token);

test('device self-test verifies ES256 and RS256 vectors', () => {
  const c = company();
  const r = c.ok('system.selftest', {}, c.A);
  eq([r.webauthn.es256, r.webauthn.rs256], [true, true]);
  eq(c.fail('system.selftest', {}, c.T.ahmad).code, 'FORBIDDEN');
});

test('register a device, punch with it, and one device per employee', () => {
  const c = company(at(SUN, '07:55'));
  eq(c.ok('att.today', {}, c.T.ahmad).device, { required: false, registered: false, label: '', since: '' });
  const dev = enroll(c, c.T.ahmad);
  const t = c.ok('att.today', {}, c.T.ahmad);
  eq([t.device.registered, t.device.label], [true, 'جهاز اختبار']);

  const r = punchWith(c, c.T.ahmad, dev, 'in');
  truthy(r.ok, JSON.stringify(r.error));
  eq(r.data.sessions[0].inVerified, true);
  c.clock.set(at(SUN, '16:05'));
  const out = punchWith(c, c.T.ahmad, dev, 'out');
  truthy(out.ok, JSON.stringify(out.error));
  eq(out.data.sessions[0].outVerified, true);

  const second = virtualAuthenticator();
  eq(c.fail('att.device.register', second.create(challenge(c, c.T.ahmad)), c.T.ahmad).code, 'DEVICE_EXISTS');

  const list = c.ok('att.device.list', {}, c.T.huda);
  eq(list.registered, 1);
  truthy(list.rows.find((x) => x.name === 'أحمد').device.lastUsedAt, 'last used is recorded');
  eq(c.fail('att.device.list', {}, c.T.ahmad).code, 'FORBIDDEN');
});

test('device punch rejects replay, wrong key, tampering, other origins and missing user verification', () => {
  const c = company(at(SUN, '07:55'));
  const dev = enroll(c, c.T.ahmad);
  const ch = challenge(c, c.T.ahmad);

  // تحدٍّ مستخدم مرة لا يُقبل ثانية
  const a = dev.get(ch);
  truthy(c.call('att.punch', { kind: 'in', assertion: a }, c.T.ahmad).ok);
  c.clock.set(at(SUN, '12:00'));
  eq(c.fail('att.punch', { kind: 'out', assertion: a }, c.T.ahmad).code, 'DEVICE_CHALLENGE');

  // مفتاح آخر يدّعي معرّف الجهاز المسجّل
  const thief = virtualAuthenticator();
  eq(c.fail('att.punch', { kind: 'out', assertion: thief.get(challenge(c, c.T.ahmad), undefined, { credentialId: dev.credentialId }) }, c.T.ahmad).code, 'DEVICE_FAILED');

  // توقيع معدّل
  const t = dev.get(challenge(c, c.T.ahmad));
  t.signature = t.signature.slice(0, -4) + (t.signature.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
  eq(c.fail('att.punch', { kind: 'out', assertion: t }, c.T.ahmad).code, 'DEVICE_FAILED');

  // موقع غير معتمد
  eq(c.fail('att.punch', { kind: 'out', assertion: dev.get(challenge(c, c.T.ahmad), 'https://evil.example') }, c.T.ahmad).code, 'DEVICE_FAILED');

  // تحدي موظف آخر
  eq(c.fail('att.punch', { kind: 'out', assertion: dev.get(challenge(c, c.T.sara)) }, c.T.ahmad).code, 'DEVICE_FAILED');

  // جهاز لم يتحقق من صاحبه (بلا وجه أو بصمة أو رمز)
  eq(c.fail('att.device.register', virtualAuthenticator({ uv: false }).create(challenge(c, c.T.sara)), c.T.sara).code, 'DEVICE_FAILED');

  // ما زال مسجّل حضور: لم تُقبل أي محاولة
  eq(c.ok('att.today', {}, c.T.ahmad).isIn, true);
  truthy(punchWith(c, c.T.ahmad, dev, 'out').ok, 'the real device still works');
});

test('required device setting, HR reset, RSA keys and local development origin', () => {
  const c = company(at(SUN, '07:55'));
  c.ok('att.settings.save', { geoRequired: false, deviceRequired: true, openMaxHours: 16 }, c.T.huda);
  eq(c.ok('att.today', {}, c.T.ahmad).device.required, true);
  eq(c.fail('att.punch', { kind: 'in' }, c.T.ahmad).code, 'DEVICE_NOT_REGISTERED');

  const dev = enroll(c, c.T.ahmad, { alg: 'RS256', backup: true });
  eq(c.fail('att.punch', { kind: 'in' }, c.T.ahmad).code, 'DEVICE_REQUIRED');
  truthy(punchWith(c, c.T.ahmad, dev, 'in').ok, 'RSA device punches');
  eq(c.ok('att.device.list', {}, c.T.huda).rows.find((x) => x.name === 'أحمد').device.synced, true);

  // إعادة الضبط تتطلب سبباً، وبعدها لا يعمل الجهاز القديم ويمكن تسجيل جديد
  truthy(c.fail('att.device.reset', { employeeId: c.emp.ahmad.id }, c.T.huda).message.includes('سبب'));
  eq(c.fail('att.device.reset', { employeeId: c.emp.ahmad.id, reason: 'x' }, c.T.ahmad).code, 'FORBIDDEN');
  c.ok('att.device.reset', { employeeId: c.emp.ahmad.id, reason: 'غيّر هاتفه' }, c.T.huda);
  c.clock.set(at(SUN, '16:05'));
  eq(punchWith(c, c.T.ahmad, dev, 'out').error.code, 'DEVICE_NOT_REGISTERED');
  const local = enroll(c, c.T.ahmad, {}, 'http://localhost:5173');
  truthy(punchWith(c, c.T.ahmad, local, 'out', 'http://localhost:5173').ok, 'localhost device punches');
  // مفتاح سُجّل على localhost لا يُقبل من الموقع الحقيقي
  c.clock.set(at(SUN, '16:30'));
  eq(punchWith(c, c.T.ahmad, local, 'in').error.code, 'DEVICE_FAILED');
  truthy(c.ok('audit.list', {}, c.A).rows.some((r) => r.action === 'device.reset'), 'reset is audited');
});

// ───────── الدخول بالبصمة ─────────
const loginWith = (c, dev, extra = {}) => {
  const { challenge: ch } = c.ok('auth.passkey.options', {});
  return c.call('auth.passkey.login', { assertion: { ...dev.get(ch), ...extra }, remember: true });
};

test('sign in with the same passkey used for attendance', () => {
  const c = company(at(SUN, '07:55'));
  const dev = enroll(c, c.T.ahmad);
  const r = loginWith(c, dev);
  truthy(r.ok, JSON.stringify(r.error));
  eq(r.data.user.username, 'ahmad');
  truthy(r.data.deviceToken, 'remember me works with passkey sign-in');
  eq(c.ok('auth.me', {}, r.data.token).user.username, 'ahmad');
  truthy(c.ok('att.device.list', {}, c.T.huda).rows.find((x) => x.name === 'أحمد').device.lastUsedAt);

  // التحدي لمرة واحدة، ولا يُقبل تحدي مستخدم داخل البوابة للدخول
  const { challenge: ch } = c.ok('auth.passkey.options', {});
  const a = dev.get(ch);
  truthy(c.call('auth.passkey.login', { assertion: a }).ok);
  eq(c.fail('auth.passkey.login', { assertion: a }).code, 'DEVICE_CHALLENGE');
  eq(c.fail('auth.passkey.login', { assertion: dev.get(challenge(c, c.T.ahmad)) }).code, 'BAD_LOGIN');

  // مفتاح غير مسجّل، أو مستخدم معطّل، أو جهاز أُعيد ضبطه
  eq(loginWith(c, virtualAuthenticator()).error.code, 'BAD_LOGIN');
  eq(loginWith(c, dev, { userHandle: 'AAAA' }).error.code, 'BAD_LOGIN');
  c.ok('att.device.reset', { employeeId: c.emp.ahmad.id, reason: 'فقد هاتفه' }, c.T.huda);
  eq(loginWith(c, dev).error.code, 'BAD_LOGIN');

  const sara = enroll(c, c.T.sara);
  const u = c.ok('users.list', {}, c.A).users.find((x) => x.username === 'sara');
  c.ok('users.update', { id: u.id, fullName: 'سارة', active: false }, c.A);
  eq(loginWith(c, sara).error.code, 'BAD_LOGIN');
});

test('passkeys for users without an employee record, and who may remove them', () => {
  const c = company();
  eq(c.ok('auth.passkey.mine', {}, c.A), { passkey: null, canRemove: true });
  const dev = virtualAuthenticator();
  c.ok('auth.passkey.register', dev.create(c.ok('auth.passkey.challenge', {}, c.A).challenge), c.A);
  eq(c.fail('auth.passkey.register', virtualAuthenticator().create(c.ok('auth.passkey.challenge', {}, c.A).challenge), c.A).code, 'DEVICE_EXISTS');
  truthy(loginWith(c, dev).ok, 'admin signs in with passkey');
  eq(c.ok('auth.passkey.remove', {}, c.A).passkey, null);
  eq(loginWith(c, dev).error.code, 'BAD_LOGIN');

  // الموظف لا يزيل جهازه بنفسه حتى لا يتجاوز ضبط الموارد البشرية
  enroll(c, c.T.ahmad);
  eq(c.ok('auth.passkey.mine', {}, c.T.ahmad).canRemove, false);
  eq(c.fail('auth.passkey.remove', {}, c.T.ahmad).code, 'FORBIDDEN');
});
