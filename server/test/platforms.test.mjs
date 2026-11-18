import { eq, test, truthy } from './harness.mjs';
import { company } from './phase1.test.mjs';

/** سارة محاسبة منصات، هدى مديرة منصات ومحاسبة عملاء، أحمد مشاهد. */
function setup() {
  const c = company();
  const users = c.ok('users.list', {}, c.A).users;
  const uid = (u) => users.find((x) => x.username === u).id;
  c.ok('users.setRoles', { id: uid('sara'), roles: { platforms: 'accountant' } }, c.A);
  c.ok('users.setRoles', { id: uid('huda'), roles: { attendance: 'hr', hr: 'hr', platforms: 'manager', crm: 'accountant' } }, c.A);
  c.ok('users.setRoles', { id: uid('ahmad'), roles: { platforms: 'viewer' } }, c.A);
  return c;
}

// ───────── ملف بوابة مصطنع بنفس شكل الملف الحقيقي (19 عنواناً و20 عموداً في البيانات) ─────────
const HEAD = ['Payment id', 'Student', 'Mobile', 'Email', 'Nationality', 'Type', 'Package name/Sponsorship page', 'Payment Method', 'Payment time',
  'Status', 'Type', 'Message', 'Amount', 'Currency', 'tracking_id', 'transaction_id', 'reference_num', 'payment_id', 'Gateway payment time'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function kuwait(utc) {
  const d = new Date(utc.replace(' ', 'T') + 'Z');
  d.setUTCHours(d.getUTCHours() + 3);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())} ${MON[d.getUTCMonth()]}, ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
function row(id, { pkg, amount, utc, method = 'Knet', mobile = '', email = '', nat = '', status = 'CAPTURED' }) {
  const gift = pkg === 'علم وتعلم';
  return [String(id), gift ? '' : 'مشترك تجريبي', mobile, email, nat, gift ? 'كفالات' : 'شراء باقة', pkg, gift ? '' : pkg, method, utc, status,
    gift ? 'web' : 'sdk', 'Captured', String(amount), 'KWD', 'tck_' + id, '01' + id, '02' + id, 'chg_' + id, kuwait(utc)];
}
const FILE = [
  HEAD,
  row(1001, { pkg: 'برونزي', amount: 6, utc: '2026-10-01 07:00:00', mobile: '96550000001', nat: 'Kuwait' }),
  row(1002, { pkg: 'فضي', amount: 15, utc: '2026-10-10 07:00:00', method: 'Apple Pay', mobile: '+965 5000 0001', nat: 'Kuwait' }),
  row(1003, { pkg: 'ذهبي', amount: 30, utc: '2026-10-12 07:00:00', method: 'card', email: 'B@Example.com', nat: 'Qatar' }),
  row(1004, { pkg: 'برونزي', amount: 6, utc: '2026-10-20 10:00:00', method: 'Apple', mobile: '50000003', nat: 'Kuwait' }),
  row(1005, { pkg: 'علم وتعلم', amount: 20, utc: '2026-10-21 10:00:00' }),
  row(1006, { pkg: 'علم وتعلم', amount: 10, utc: '2026-10-22 10:00:00', method: 'Apple Pay' }),
  row(1007, { pkg: 'علم وتعلم', amount: 15, utc: '2026-10-23 10:00:00', method: 'card' }),
  row(1008, { pkg: 'باقة تجريبية', amount: 1, utc: '2026-10-14 08:00:00', mobile: '50000009' }),
  row(1009, { pkg: 'برونزي', amount: 6, utc: '2026-10-14 08:00:00', mobile: '50000010', status: 'FAILED' }),
  row(1004, { pkg: 'برونزي', amount: 6, utc: '2026-10-20 10:00:00', method: 'Apple', mobile: '50000003', nat: 'Kuwait' }),
  row(1010, { pkg: 'برونزي', amount: 6, utc: '2026-10-31 22:30:00', mobile: '50000004', nat: 'Kuwait' }),
  row(1011, { pkg: 'ماسي', amount: 30, utc: '2026-10-15 09:00:00', mobile: '50000005', nat: 'Saudi Arabia' })
];

test('platforms: seeded platforms and packages, roles, and column detection from content', () => {
  const c = setup();
  const lk = c.ok('plt.lookups', {}, c.T.ahmad);
  eq(lk.platforms.map((p) => [p.key, p.name, p.hasAppSales]), [['saad', 'صاد القرآني', true], ['maqraa', 'مقرأة تراث', false]]);
  eq(lk.packages.map((p) => [p.code, p.kind, p.price, p.durationDays, p.unitPrice, p.rank]), [
    ['برونزي', 'subscription', 6000, 30, 0, 1], ['فضي', 'subscription', 15000, 90, 0, 2], ['ذهبي', 'subscription', 30000, 120, 0, 3],
    ['علم وتعلم', 'gift', 10000, 0, 10000, 0], ['باقة تجريبية', 'test', 1000, 0, 0, 0]
  ]);
  eq([lk.isManager, lk.isAccountant], [false, false]);
  eq(c.fail('plt.import.preview', { platform: 'saad', rows: FILE }, c.T.ahmad).code, 'FORBIDDEN', 'a viewer cannot import');
  // المعاينة لا تحفظ شيئاً، وتكشف الباقة غير المعروفة
  const pv = c.ok('plt.import.preview', { platform: 'saad', rows: FILE }, c.T.sara);
  eq(pv.stats, { rows: 12, accepted: 8, duplicates: 1, notCaptured: 1, test: 1, invalid: 0, amount: 108000 });
  eq(pv.unmatched, [{ name: 'ماسي', count: 1, amount: 30000, type: 'شراء باقة' }]);
  eq(pv.months, [{ month: '2026-10', count: 7, status: 'draft' }, { month: '2026-11', count: 1, status: 'draft' }], 'Kuwait time puts 22:30 UTC on Oct 31 in November');
  eq(c.ok('plt.months', {}, c.T.sara), [], 'preview stores nothing');
  truthy(c.fail('plt.import.commit', { platform: 'saad', rows: FILE }, c.T.sara).message.includes('ماسي'), 'unknown packages must be matched first');
  truthy(c.fail('plt.import.preview', { platform: 'maqraa', rows: FILE }, c.T.sara).message.includes('مبيعات تطبيق'));
  truthy(c.fail('plt.import.preview', { platform: 'saad', rows: [['a', 'b'], ['c', 'd']] }, c.T.sara).message.includes('أعمدة'));
});

test('platforms: commit stores payments without personal data; the dashboard reproduces the monthly report', () => {
  const c = setup();
  const lk = c.ok('plt.lookups', {}, c.T.sara);
  const gold = lk.packages.find((p) => p.code === 'ذهبي').id;
  const r = c.ok('plt.import.commit', { platform: 'saad', rows: FILE, map: { 'ماسي': gold }, fileName: 'payment-report.xlsx' }, c.T.sara);
  eq([r.months, r.stats.accepted, r.stats.duplicates], [['2026-10', '2026-11'], 9, 1]);
  eq(r.matched.map((m) => [m.name, m.packageName]), [['ماسي', 'الباقة الذهبية']], 'the manual match is kept as an alias');
  eq(c.ok('plt.lookups', {}, c.T.sara).packages.find((p) => p.id === gold).aliases, ['ماسي']);
  // لا بيانات شخصية في المخزَّن
  const stored = JSON.stringify(['Sales', 'Imports', 'Months'].map((t) => c.srv.Db.view('platforms', t)));
  ['مشترك تجريبي', '50000001', 'b@example.com', 'B@Example.com', '50000003'].forEach((s) => truthy(!stored.includes(s), 'personal data must not be stored: ' + s));
  // إعادة الملف نفسه لا تضيف شيئاً
  // (مع وحدة المتابعة المفعّلة يُمرَّر التواصل فقط، ولا تُضاف مبيعات)
  const again = c.ok('plt.import.commit', { platform: 'saad', rows: FILE }, c.T.sara);
  eq([again.importId, again.stats.accepted, again.stats.duplicates, again.contacts], ['', 0, 10, 5]);
  eq(c.srv.Db.view('platforms', 'Sales').length, 9, 'no sales added on re-import');

  const d = c.ok('plt.dashboard', { platform: 'saad', month: '2026-10' }, c.T.ahmad);
  eq([d.summary.count, d.summary.amount, d.summary.fee, d.summary.net, d.summary.prevCount], [8, 132000, 0, 132000, 0]);
  eq(d.byPackage.map((p) => [p.name, p.count, p.amount]), [['الباقة البرونزية', 2, 12000], ['الباقة الفضية', 1, 15000], ['الباقة الذهبية', 2, 60000], ['باقة الإهداء (علم وتعلم)', 3, 45000]]);
  eq([d.gift.count, d.gift.amount, d.gift.people, d.gift.one, d.gift.two, d.gift.review], [3, 45000, 4.5, 1, 1, 1]);
  eq(d.buyers, { buyers: 4, newBuyers: 4, returning: 0, repeat: 1, upgrades: 1, active: 4, expiring: 1, historyFrom: '2026-10' }, 'mobile formats of the same buyer are one buyer; bronze→silver is an upgrade');
  eq(d.methods.map((m) => [m.key, m.count, m.amount]), [['knet', 3, 56000], ['card', 2, 45000], ['applepay', 3, 31000]]);
  eq(d.channels.map((m) => [m.key, m.count, m.amount]), [['app', 5, 87000], ['web', 3, 45000]]);
  eq(d.countries.map((m) => [m.label, m.count]), [['', 3], ['قطر', 1], ['السعودية', 1], ['الكويت', 3]]);
  eq(d.trend.length, 12);
  eq(d.trend[11], { month: '2026-10', sales: 132000, sponsorship: 0 });
  // نوفمبر: المشتري د جديد
  const n = c.ok('plt.dashboard', { platform: 'saad', month: '2026-11' }, c.T.ahmad);
  eq([n.summary.count, n.summary.prevCount, n.buyers.newBuyers, n.buyers.returning], [1, 8, 1, 0]);
  // ما وراء الأرقام
  eq(c.ok('plt.sales', { platform: 'saad', month: '2026-10', buyer: 'upgrade' }, c.T.ahmad).map((s) => s.gatewayId), ['1002']);
  eq(c.ok('plt.sales', { platform: 'saad', month: '2026-10', method: 'card' }, c.T.ahmad).map((s) => s.gatewayId), ['1007', '1003']);
  eq(c.ok('plt.sales', { platform: 'saad', month: '2026-10', kind: 'gift' }, c.T.ahmad).map((s) => s.people), [1.5, 1, 2]);
  eq(c.ok('plt.sales', { platform: 'saad', month: '2026-10', country: 'qatar' }, c.T.ahmad).length, 1);
});

test('platforms: fees recalculate draft months only; approve, reopen with a reason, and the month lock', () => {
  const c = setup();
  const gold = c.ok('plt.lookups', {}, c.T.sara).packages.find((p) => p.code === 'ذهبي').id;
  c.ok('plt.import.commit', { platform: 'saad', rows: FILE, map: { 'ماسي': gold } }, c.T.sara);
  eq(c.fail('plt.fees.save', { fees: { knet: { pct: 1 } } }, c.T.sara).code, 'FORBIDDEN', 'only the manager sets fees');
  truthy(c.fail('plt.fees.save', { fees: { knet: { pct: 50 } } }, c.T.huda).message.includes('نسبة العمولة'));
  const f = c.ok('plt.fees.save', { fees: { knet: { pct: '1', fixed: '0.100' } } }, c.T.huda);
  eq([f.fees.knet, f.recalculated], [{ pct: 1, fixed: 100 }, 4]);
  const d = c.ok('plt.dashboard', { platform: 'saad', month: '2026-10' }, c.T.huda);
  eq([d.summary.fee, d.summary.net], [860, 131140], 'knet: 6→0.160, 20→0.300, 30→0.400');
  // الاعتماد للمدير فقط
  eq(c.fail('plt.month.approve', { platform: 'saad', month: '2026-10' }, c.T.sara).code, 'FORBIDDEN');
  c.ok('plt.month.approve', { platform: 'saad', month: '2026-10' }, c.T.huda);
  truthy(c.fail('plt.month.approve', { platform: 'saad', month: '2026-10' }, c.T.huda).message.includes('مسبقاً'));
  truthy(c.fail('plt.month.approve', { platform: 'saad', month: '2026-12' }, c.T.huda).message.includes('لا مبيعات'));
  const months = c.ok('plt.months', { platform: 'saad' }, c.T.sara);
  eq(months.map((m) => [m.month, m.status, m.count]), [['2026-11', 'draft', 1], ['2026-10', 'approved', 8]]);
  eq(months[1].approvedByName, 'هدى');
  // الشهر المعتمد لا يتغير: لا تفريغ، ولا عمولة جديدة، ولا عمليات جديدة
  truthy(c.fail('plt.month.clear', { platform: 'saad', month: '2026-10' }, c.T.sara).message.includes('معتمد'));
  eq(c.ok('plt.fees.save', { fees: { knet: { pct: 2 } } }, c.T.huda).recalculated, 1, 'only the November draft is recalculated');
  eq(c.ok('plt.dashboard', { platform: 'saad', month: '2026-10' }, c.T.huda).summary.fee, 860);
  const extra = [HEAD, row(2001, { pkg: 'برونزي', amount: 6, utc: '2026-10-05 08:00:00', mobile: '50000020' })];
  truthy(c.fail('plt.import.commit', { platform: 'saad', rows: extra }, c.T.sara).message.includes('أعد فتحه'));
  // إعادة الفتح بسبب
  truthy(c.fail('plt.month.reopen', { platform: 'saad', month: '2026-10' }, c.T.huda).message.includes('سبب'));
  c.ok('plt.month.reopen', { platform: 'saad', month: '2026-10', reason: 'نسيت دفعة متأخرة' }, c.T.huda);
  eq(c.ok('plt.import.commit', { platform: 'saad', rows: extra }, c.T.sara).stats.accepted, 1);
  // التفريغ لإعادة الاستيراد
  eq(c.ok('plt.month.clear', { platform: 'saad', month: '2026-11' }, c.T.sara).removed, 1);
  const audit = c.ok('audit.list', { module: 'platforms' }, c.A).rows.map((x) => x.action);
  ['import', 'fees.update', 'month.approve', 'month.reopen', 'month.clear'].forEach((a) => truthy(audit.includes(a), 'audited: ' + a));
});

test('platforms: approval survives Sheets turning the month into a date; dashboards and sales take several months or a year', () => {
  const c = setup();
  const gold = c.ok('plt.lookups', {}, c.T.sara).packages.find((p) => p.code === 'ذهبي').id;
  c.ok('plt.import.commit', { platform: 'saad', rows: FILE, map: { 'ماسي': gold } }, c.T.sara);
  // خلية نصية حوّلها Sheets إلى تاريخ: التاريخ الكامل يعود «YYYY-MM-DD» والوقت وحده «HH:mm»
  eq(c.srv.Db.fromCell_(new Date(Date.UTC(2026, 9, 1, 9)), 'text'), '2026-10-01');
  eq(c.srv.Db.fromCell_(new Date(Date.UTC(1899, 11, 30, 5, 30)), 'text'), '08:30');
  // صفوف الأشهر كما تُقرأ بعد التحويل، مع صف مكرر قديم من محاولات اعتماد سابقة
  c.srv.Db.updateWhere('platforms', 'Months', (r) => ({ month: r.month + '-01' }));
  c.srv.Db.insert('platforms', 'Months', { platformId: c.ok('plt.lookups', {}, c.T.sara).platforms[0].id, month: '2026-10-01', status: 'draft', updatedAt: '2026-01-01T00:00:00.000Z' });
  c.ok('plt.month.approve', { platform: 'saad', month: '2026-10' }, c.T.huda);
  eq(c.ok('plt.months', { platform: 'saad' }, c.T.sara).map((m) => [m.month, m.status]), [['2026-11', 'draft'], ['2026-10', 'approved']], 'the approval shows, with no stray rows');
  truthy(c.fail('plt.month.approve', { platform: 'saad', month: '2026-10' }, c.T.huda).message.includes('مسبقاً'));
  eq(c.ok('plt.dashboard', { platform: 'saad', month: '2026-10' }, c.T.huda).monthStatus, 'approved');

  // السنة كاملة: تنتهي الفترة الفعلية بالشهر الحالي، والمقارنة بالسنة السابقة
  const y = c.ok('plt.dashboard', { platform: 'saad', period: '2026' }, c.T.ahmad);
  eq([y.periodKey, y.period.length, y.prevKey, y.month, y.summary.count, y.summary.amount, y.monthStatus], ['2026', 12, '2025', '2026-11', 9, 138000, 'draft']);
  eq(y.trend[11].month, '2026-11');
  // عدة أشهر: المقارنة بالأشهر السابقة بالعدد نفسه
  const two = c.ok('plt.dashboard', { platform: 'saad', period: ['2026-11', '2026-10'] }, c.T.ahmad);
  eq([two.periodKey, two.prevKey, two.summary.count, two.byPackage.reduce((s, p) => s + p.count, 0)], ['2026-10,2026-11', '2026-08,2026-09', 9, 9]);
  eq(c.ok('plt.sales', { platform: 'saad', month: '2026' }, c.T.ahmad).length, 9);
  eq(c.ok('plt.sales', { platform: 'saad', month: '2026-10,2026-11', buyer: 'new' }, c.T.ahmad).length, 5);
  truthy(c.fail('plt.sales', { platform: 'saad', month: '2026-13' }, c.T.ahmad).message.includes('الشهر'));
});

test('platforms: centers, campaigns and CRM projects linked to them feed sponsorship revenue', () => {
  const c = setup();
  const lk = c.ok('plt.lookups', {}, c.T.sara);
  const saad = lk.platforms[0].id, maqraa = lk.platforms[1].id;
  eq(c.fail('plt.center.save', { platformId: saad, name: 'مركز' }, c.T.ahmad).code, 'FORBIDDEN');
  const center = c.ok('plt.center.save', { platformId: saad, name: 'مركز المعلم المتقن' }, c.T.sara);
  truthy(c.fail('plt.center.save', { platformId: saad, name: 'مركز المعلم المتقن' }, c.T.sara).message.includes('الاسم نفسه'));
  const other = c.ok('plt.center.save', { platformId: maqraa, name: 'حلقات المقرأة' }, c.T.sara);
  truthy(c.fail('plt.campaign.save', { platformId: saad, centerId: other.id, name: 'x' }, c.T.sara).message.includes('المركز'));
  const camp = c.ok('plt.campaign.save', { platformId: saad, centerId: center.id, kind: 'challenge', name: 'تحدي قراءة سورة القلم', status: 'running', startDate: '2026-10-01', endDate: '2026-11-30' }, c.T.sara);
  eq([camp.kindLabel, camp.statusLabel, camp.centerName], ['تحدٍّ', 'جارٍ', 'مركز المعلم المتقن']);
  // مشروع رعاية في العملاء مربوط بالمنصة
  const crmLk = c.ok('crm.lookups', {}, c.A);
  eq(crmLk.platformLinks.platforms.map((p) => p.name), ['صاد القرآني', 'مقرأة تراث']);
  const client = c.ok('crm.client.save', { name: 'شركة الراعي', category: 'current' }, c.A);
  truthy(c.fail('crm.project.save', { clientId: client.id, name: 'رعاية', billing: 'fixed', contractValue: '500', platformId: saad, centerId: other.id }, c.A).message.includes('المركز'));
  const pr = c.ok('crm.project.save', { clientId: client.id, name: 'رعاية تحدي القلم', billing: 'fixed', contractValue: '500', platformId: saad, centerId: center.id, campaignId: camp.id, revenueKind: 'sponsorship' }, c.A);
  eq([pr.platformName, pr.centerName, pr.campaignName, pr.revenueKindLabel], ['صاد القرآني', 'مركز المعلم المتقن', 'تحدي قراءة سورة القلم', 'رعاية']);
  // تعديل المشروع دون حقول الربط لا يمسحها
  eq(c.ok('crm.project.save', { id: pr.id, clientId: client.id, name: 'رعاية تحدي القلم', billing: 'fixed', contractValue: '500' }, c.A).centerName, 'مركز المعلم المتقن');
  c.ok('crm.payment.save', { projectId: pr.id, amount: '200', date: '2026-10-05' }, c.T.huda);
  c.ok('crm.payment.save', { projectId: pr.id, amount: '300', status: 'scheduled', date: '2026-11-01' }, c.T.huda);
  const d = c.ok('plt.dashboard', { platform: 'saad', month: '2026-10' }, c.T.ahmad);
  eq([d.summary.sponsorship, d.summary.revenue, d.summary.ytdSponsorship], [200000, 200000, 200000]);
  eq(d.campaigns.map((x) => [x.name, x.pledged, x.collected, x.remaining]), [['تحدي قراءة سورة القلم', 500000, 200000, 300000]]);
  eq(d.centers.find((x) => x.id === center.id).collected, 200000);
  eq(d.clients.map((x) => [x.name, x.collected, x.scheduled, x.overdue, x.rate]), [['شركة الراعي', 200000, 300000, 300000, 40]]);
  eq(c.ok('plt.dashboard', { platform: 'maqraa', month: '2026-10' }, c.T.ahmad).summary.sponsorship, 0, 'platform filter');
  eq(c.ok('crm.projects', { centerId: center.id }, c.A).map((x) => x.name), ['رعاية تحدي القلم']);
  // لا يُحذف مركز أو مسابقة لهما مشاريع مربوطة
  truthy(c.fail('plt.center.remove', { id: center.id }, c.T.sara).message.includes('مشاريع'));
  truthy(c.fail('plt.campaign.remove', { id: camp.id }, c.T.sara).message.includes('رعاة'));
  eq(c.ok('plt.center.remove', { id: other.id }, c.T.sara).removed, true);
  const centers = c.ok('plt.centers', { platform: 'saad' }, c.T.ahmad);
  eq(centers.map((x) => [x.name, x.projectsCount, x.campaignsCount, x.sponsors.map((s) => s.name)]), [['مركز المعلم المتقن', 1, 1, ['شركة الراعي']]]);
});

test('platforms: package settings are manager-only and gateway names stay unique', () => {
  const c = setup();
  const lk = c.ok('plt.lookups', {}, c.T.huda);
  eq(c.fail('plt.package.save', { name: 'x', code: 'y', kind: 'subscription', price: '1', durationDays: 30 }, c.T.sara).code, 'FORBIDDEN');
  truthy(c.fail('plt.package.save', { platformId: lk.platforms[0].id, name: 'مكرر', code: 'فضي', kind: 'subscription', price: '1', durationDays: 30 }, c.T.huda).message.includes('مستخدم'));
  const p = c.ok('plt.package.save', { platformId: lk.platforms[0].id, name: 'الباقة الماسية', code: 'ماسي', kind: 'subscription', price: '45', durationDays: 180, rank: 4 }, c.T.huda);
  eq([p.price, p.durationDays, p.rank, p.kindLabel], [45000, 180, 4, 'اشتراك']);
  truthy(c.fail('plt.package.save', { platformId: lk.platforms[0].id, name: 'إهداء', code: 'هدية', kind: 'gift', price: '0' }, c.T.huda).message.includes('رعاية الفرد'));
  eq(c.ok('plt.package.remove', { id: p.id }, c.T.huda).removed, true);
});

test('platforms: a campaign links its sponsor projects from its own form, and counts registrations', () => {
  const c = setup();
  const lk = c.ok('plt.lookups', {}, c.A);
  const saad = lk.platforms[0].id, maqraa = lk.platforms[1].id;
  const center = c.ok('plt.center.save', { platformId: saad, name: 'مركز جود' }, c.A);
  const client = c.ok('crm.client.save', { name: 'وقف الخير', category: 'current' }, c.A);
  const p1 = c.ok('crm.project.save', { clientId: client.id, name: 'رعاية تحدي الطور', billing: 'fixed', contractValue: '300' }, c.A);
  const p2 = c.ok('crm.project.save', { clientId: client.id, name: 'عقد المقرأة', billing: 'fixed', contractValue: '100', platformId: maqraa }, c.A);
  // الخيارات: من لا يدخل «العملاء» لا يرى مشاريعها
  eq(c.ok('plt.campaign.options', {}, c.T.sara).crm, false);
  const opt = c.ok('plt.campaign.options', {}, c.A);
  eq([opt.crm, opt.clients.map((x) => x.name), opt.projects.map((x) => [x.name, x.contractValue])], [true, ['وقف الخير'], [['رعاية تحدي الطور', 300000], ['عقد المقرأة', 100000]]]);
  // مشروع منصة أخرى يُرفض ولا يُحفظ شيء
  truthy(c.fail('plt.campaign.save', { platformId: saad, name: 'x', projectIds: [p2.id] }, c.A).message.includes('منصة أخرى'));
  eq(c.ok('plt.campaigns', { platform: 'saad' }, c.A).length, 0, 'nothing saved when a link fails');
  eq(c.fail('plt.campaign.save', { platformId: saad, name: 'y', projectIds: [p1.id] }, c.T.sara).code, 'NOT_FOUND', 'no CRM access');
  truthy(c.fail('plt.campaign.save', { platformId: saad, name: 'z', registered: '-1' }, c.A).message.includes('المسجلين'));
  // الربط من نموذج المسابقة يضبط المنصة والمركز ونوع الإيراد في المشروع
  const camp = c.ok('plt.campaign.save', { platformId: saad, centerId: center.id, kind: 'challenge', name: 'تحدي سورة الطور', registered: '120', participants: '85', projectIds: [p1.id] }, c.A);
  eq([camp.registered, camp.participants, camp.pledged, camp.sponsors.map((s) => s.projectName)], [120, 85, 300000, ['رعاية تحدي الطور']]);
  const linked = c.ok('crm.projects', { campaignId: camp.id }, c.A);
  eq(linked.map((x) => [x.name, x.platformName, x.centerName, x.campaignName, x.revenueKindLabel]), [['رعاية تحدي الطور', 'صاد القرآني', 'مركز جود', 'تحدي سورة الطور', 'رعاية']]);
  // تعديل المسابقة دون المشاريع، أو بالمشاريع نفسها، لا يمسّها ولا يحتاج صلاحية «العملاء»
  eq(c.ok('plt.campaign.save', { id: camp.id, platformId: saad, centerId: center.id, name: 'تحدي سورة الطور', registered: '130' }, c.T.sara).sponsors.length, 1);
  eq(c.ok('plt.campaign.save', { id: camp.id, platformId: saad, centerId: center.id, name: 'تحدي سورة الطور', registered: '130', projectIds: [p1.id] }, c.T.sara).registered, 130);
  // فك الربط يُبقي المشروع على المنصة
  eq(c.ok('plt.campaign.save', { id: camp.id, platformId: saad, centerId: center.id, name: 'تحدي سورة الطور', projectIds: [] }, c.A).sponsors.length, 0);
  eq(c.ok('crm.projects', { centerId: center.id }, c.A).map((x) => [x.name, x.campaignName]), [['رعاية تحدي الطور', '']]);
  eq(c.ok('plt.campaign.remove', { id: camp.id }, c.A).removed, true);
});
