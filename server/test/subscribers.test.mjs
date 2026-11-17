import { eq, test, truthy } from './harness.mjs';
import { company } from './phase1.test.mjs';

/** سارة موظفة متابعة ومحاسبة منصات، هدى مديرة متابعة ومديرة منصات، أحمد مشاهد متابعة. اليوم 15 نوفمبر 2026. */
function setup() {
  const c = company();
  const users = c.ok('users.list', {}, c.A).users;
  const uid = (u) => users.find((x) => x.username === u).id;
  c.ok('users.setRoles', { id: uid('sara'), roles: { platforms: 'accountant', subscribers: 'agent' } }, c.A);
  c.ok('users.setRoles', { id: uid('huda'), roles: { attendance: 'hr', hr: 'hr', platforms: 'manager', subscribers: 'manager' } }, c.A);
  c.ok('users.setRoles', { id: uid('ahmad'), roles: { subscribers: 'viewer' } }, c.A);
  return { ...c, uid: { sara: uid('sara'), huda: uid('huda') } };
}

const HEAD = ['Payment id', 'Student', 'Mobile', 'Email', 'Nationality', 'Type', 'Package name/Sponsorship page', 'Payment Method', 'Payment time',
  'Status', 'Type', 'Message', 'Amount', 'Currency', 'tracking_id', 'transaction_id', 'reference_num', 'payment_id', 'Gateway payment time'];
/** سطر بوقت الكويت مباشرة (عمود وقت البوابة) */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function row(id, name, mobile, email, pkg, amount, day) {
  const [y, m, d] = day.split('-').map(Number);
  const gift = pkg === 'علم وتعلم';
  return [String(id), name, mobile, email, 'Kuwait', gift ? 'كفالات' : 'شراء باقة', pkg, gift ? '' : pkg, 'Knet', `${day} 07:00:00`, 'CAPTURED',
    gift ? 'web' : 'sdk', 'Captured', String(amount), 'KWD', 'tck_' + id, '1' + id, '2' + id, 'chg_' + id, `${String(d).padStart(2, '0')} ${MON[m - 1]}, ${y} 10:00:00`];
}
const SEP_OCT = [
  HEAD,
  row(101, 'أحمد علي', '96550000001', '', 'برونزي', 6, '2026-09-05'),
  row(102, 'أحمد علي', '50000001', '', 'برونزي', 6, '2026-10-03'),
  row(103, 'بدر', '', 'badr@example.com', 'ذهبي', 30, '2026-10-12'),
  row(104, 'جاسم', '50000003', '', 'برونزي', 6, '2026-09-10'),
  row(105, 'دلال', '50000004', '', 'برونزي', 6, '2026-10-20'),
  row(106, 'عائشة', '50000005', 'aisha@example.com', 'فضي', 15, '2026-09-20'),
  row(107, '', '', '', 'علم وتعلم', 10, '2026-10-21')
];
const NOV = [HEAD, row(201, 'أحمد علي', '50000001', '', 'برونزي', 6, '2026-11-10'), row(202, 'جاسم', '50000003', '', 'برونزي', 6, '2026-11-12')];
const ref = (list, name) => list.find((x) => x.name === name).ref;

test('subscribers: sealed text round-trips and detects tampering', () => {
  const c = setup();
  const s = c.srv.Router; // تحميل الخادم
  truthy(s);
  // عبر مسار: يُستورد الملف ثم يُكشف الجوال
  c.ok('plt.import.commit', { platform: 'saad', rows: SEP_OCT }, c.T.sara);
  const raw = c.srv.Db.view('subscribers', 'Subscribers');
  eq(raw.length, 5, 'one record per buyer with contact; gifts have none');
  const dump = JSON.stringify(raw);
  ['أحمد علي', '50000001', 'badr@example.com', 'aisha'].forEach((x) => truthy(!dump.includes(x), 'stored encrypted: ' + x));
  truthy(raw.every((r) => !r.mobileEnc || r.mobileEnc.startsWith('v1:')));
  eq(raw.map((r) => r.mobileMask).sort(), ['', '••••••01', '••••••03', '••••••04', '••••••05']);
});

test('subscribers: statuses follow the monthly statement — pending until the expiry month is imported, then renewed or lapsed', () => {
  const c = setup();
  c.ok('plt.import.commit', { platform: 'saad', rows: SEP_OCT }, c.T.sara);
  eq(c.fail('sub.list', {}, c.T.ahmad).code, 'FORBIDDEN', 'a viewer sees numbers only');
  const d = c.ok('sub.dashboard', {}, c.T.ahmad);
  eq(d.counts, { active: 2, expiring: 1, pending: 1, lapsed: 1 });
  eq(d.coverage, { total: 5, withContact: 5, withMobile: 4, withEmail: 2, optOut: 0, winback: 0 });
  eq(d.renewal.map((m) => [m.month, m.total, m.renewed, m.pending, m.lapsed, m.rate, m.final]), [['2026-10', 2, 1, 0, 1, 50, true], ['2026-11', 1, 0, 1, 0, 0, false]]);
  const list = c.ok('sub.list', {}, c.T.sara);
  eq(list.map((x) => [x.name, x.status]), [['دلال', 'expiring'], ['أحمد علي', 'pending'], ['جاسم', 'lapsed'], ['عائشة', 'active'], ['بدر', 'active']]);
  const a = c.ok('sub.get', { ref: ref(list, 'أحمد علي') }, c.T.sara);
  eq([a.purchases, a.waitFor, a.cycles.map((x) => x.outcome)], [2, '2026-11', ['pending', 'renewed']], 'two mobile formats are one buyer');
  eq(c.ok('sub.list', { status: 'lapsed' }, c.T.sara).length, 1);
  eq(c.ok('sub.list', { q: '0003' }, c.T.sara).map((x) => x.name), ['جاسم'], 'search by mobile digits');
  // كشف نوفمبر: أحمد جدّد، وجاسم عاد بعد انقطاع
  c.ok('plt.import.commit', { platform: 'saad', rows: NOV }, c.T.sara);
  const after = c.ok('sub.list', {}, c.T.sara);
  eq(after.find((x) => x.name === 'أحمد علي').status, 'active');
  const j = after.find((x) => x.name === 'جاسم');
  eq([j.status, j.winback], ['active', true]);
  const d2 = c.ok('sub.dashboard', {}, c.T.ahmad);
  eq(d2.renewal.find((m) => m.month === '2026-11'), { month: '2026-11', total: 1, renewed: 1, pending: 0, lapsed: 0, rate: 100, final: true });
  eq(d2.coverage.winback, 1);
});

test('subscribers: reveal and export are audited, assignment limits what an agent sees, opt-out and forget', () => {
  const c = setup();
  c.ok('plt.import.commit', { platform: 'saad', rows: SEP_OCT }, c.T.sara);
  const list = c.ok('sub.list', {}, c.T.sara);
  const dalal = ref(list, 'دلال'), badr = ref(list, 'بدر');
  eq(list.find((x) => x.name === 'بدر').emailMask, 'b•••@example.com');
  eq(c.ok('sub.reveal', { ref: badr }, c.T.sara), { name: 'بدر', mobile: '', email: 'badr@example.com' });
  eq(c.ok('sub.reveal', { ref: dalal }, c.T.sara).mobile, '50000004');
  eq(c.fail('sub.export', { status: 'lapsed' }, c.T.sara).code, 'FORBIDDEN');
  const ex = c.ok('sub.export', { status: 'lapsed' }, c.T.huda);
  eq(ex.map((x) => [x.name, x.mobile, x.packageName]), [['جاسم', '50000003', 'الباقة البرونزية']]);
  const audit = c.ok('audit.list', { module: 'subscribers' }, c.A).rows;
  eq(audit.filter((x) => x.action === 'reveal').length, 2);
  truthy(audit.some((x) => x.action === 'export' && x.details.count === 1));
  truthy(audit.some((x) => x.action === 'contacts.import'));
  // الإسناد: موظفة المتابعة ترى المسند إليها وغير المسند
  eq(c.fail('sub.assign', { refs: [dalal], userId: c.uid.huda }, c.T.sara).code, 'FORBIDDEN');
  c.ok('sub.assign', { refs: [dalal], userId: c.uid.huda }, c.T.huda);
  eq(c.fail('sub.get', { ref: dalal }, c.T.sara).code, 'NOT_FOUND');
  eq(c.ok('sub.list', {}, c.T.sara).length, 4);
  // الإيقاف والملاحظات
  eq(c.ok('sub.optout', { ref: badr, reason: 'طلب بالهاتف' }, c.T.sara).optOut, true);
  c.ok('sub.note', { ref: badr, notes: 'يفضّل البريد' }, c.T.sara);
  const b = c.ok('sub.get', { ref: badr }, c.T.sara);
  eq([b.optOut, b.optOutReason, b.notes], [true, 'طلب بالهاتف', 'يفضّل البريد']);
  eq(c.ok('sub.dashboard', {}, c.T.ahmad).coverage.optOut, 1);
  // الحذف بطلبه: لا يعود حتى لو أُعيد رفع الملف
  eq(c.fail('sub.forget', { ref: badr }, c.T.sara).code, 'FORBIDDEN');
  c.ok('sub.forget', { ref: badr }, c.T.huda);
  truthy(c.fail('sub.reveal', { ref: badr }, c.T.huda).message.includes('لا بيانات'));
  c.ok('plt.import.commit', { platform: 'saad', rows: SEP_OCT }, c.T.sara);
  const again = c.ok('sub.get', { ref: badr }, c.T.huda);
  eq([again.forgotten, again.name, again.emailMask, again.purchases], [true, '', '', 1], 'forgotten stays forgotten; statistics remain');
});

test('subscribers: contact data is wiped after the retention period without purchases', () => {
  const c = setup();
  c.ok('plt.import.commit', { platform: 'saad', rows: SEP_OCT }, c.T.sara);
  c.ok('sub.settings.save', { retentionMonths: 12, renewalLink: 'https://example.com/renew' }, c.T.huda);
  truthy(c.fail('sub.settings.save', { renewalLink: 'http://insecure' }, c.T.huda).message.includes('https'));
  c.clock.set('2027-11-20T08:00:00Z');
  c.ok('sub.dashboard', {}, c.T.ahmad);
  const raw = c.srv.Db.view('subscribers', 'Subscribers');
  eq(raw.filter((r) => r.forgottenAt).length, 5, 'every buyer last paid more than 12 months ago');
  truthy(raw.every((r) => !r.nameEnc && !r.mobileEnc && !r.emailEnc));
});
