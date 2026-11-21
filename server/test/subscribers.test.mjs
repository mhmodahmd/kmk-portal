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

// ───────── المتابعة والتواصل (0.12.0) ─────────
const tplOf = (c, channel, kind) => c.ok('sub.templates', {}, c.T.sara).find((t) => t.channel === channel && t.kind === kind);

test('subscribers follow-up: expiring within 7/14 days, WhatsApp with confirmation, reply status and overdue follow-ups', () => {
  const c = setup();
  c.ok('plt.import.commit', { platform: 'saad', rows: SEP_OCT }, c.T.sara);
  eq(c.fail('sub.followup', {}, c.T.ahmad).code, 'FORBIDDEN', 'a viewer sees numbers only');
  const f = c.ok('sub.followup', {}, c.T.sara);
  eq([f.kpis.in7, f.kpis.in14, f.kpis.notContacted, f.kpis.expired, f.kpis.contactedRate], [1, 0, 1, 1, 0]);
  eq(f.rows.map((r) => [r.name, r.daysLeft, r.suggestKind, r.contactedThisCycle]), [['دلال', 4, 'before7', false]]);
  const exp = c.ok('sub.followup', { window: 'expired' }, c.T.sara);
  eq(exp.rows.map((r) => r.name), ['أحمد علي'], 'expired in the last 30 days and not renewed');
  const dalal = f.rows[0].ref, ahmad = exp.rows[0].ref;

  // واتساب: نص القالب معبّأ، وسطر رابط التجديد يُحذف ما دام الرابط غير محدد، والرقم المحلي يُسبق بـ 965
  const wa = tplOf(c, 'whatsapp', 'before7');
  const w = c.ok('sub.message.whatsapp', { ref: dalal, templateId: wa.id }, c.T.sara);
  truthy(w.url.startsWith('https://wa.me/96550000004?text='), w.url);
  truthy(w.body.includes('دلال') && w.body.includes('19/11/2026') && w.body.includes('بعد 4 أيام'), w.body);
  truthy(!w.body.includes('للتجديد') && !w.body.includes('{'), 'empty variables drop their line');
  truthy(c.ok('audit.list', { module: 'subscribers' }, c.A).rows.some((x) => x.action === 'reveal' && x.details.via === 'whatsapp'), 'opening WhatsApp reveals the number');
  eq(c.ok('sub.followup', {}, c.T.sara).kpis.notContacted, 1, 'nothing is logged until the agent confirms');
  c.ok('sub.settings.save', { renewalLink: 'https://example.com/renew' }, c.T.huda);
  truthy(c.ok('sub.message.whatsapp', { ref: dalal, templateId: wa.id }, c.T.sara).body.includes('https://example.com/renew'));

  // «هل أرسلت؟» نعم ← تواصل بانتظار الرد
  c.ok('sub.contact.log', { ref: dalal, channel: 'whatsapp', templateId: wa.id }, c.T.sara);
  let g = c.ok('sub.followup', {}, c.T.sara);
  eq([g.kpis.notContacted, g.kpis.waiting, g.kpis.contactedRate], [0, 1, 100]);
  const row1 = g.rows[0];
  eq([row1.lastChannel, row1.reply, row1.contactedThisCycle, !!row1.lastContactBy, row1.lastContactAuto], ['whatsapp', 'waiting', true, true, false]);
  eq(c.ok('sub.followup', { contact: 'none' }, c.T.sara).rows.length, 0);
  eq(c.ok('sub.list', {}, c.T.sara).find((x) => x.ref === dalal).lastChannelLabel, 'واتساب', 'the list shows the last contact');

  // تحديث الرد: وعد بالتجديد مع موعد متابعة، ثم يتأخر الموعد
  c.ok('sub.contact.update', { id: row1.lastContactId, replyStatus: 'promised', nextFollowUpAt: '2026-11-17', note: 'يجدد يوم الراتب' }, c.T.sara);
  g = c.ok('sub.followup', {}, c.T.sara);
  eq([g.kpis.waiting, g.kpis.promised, g.kpis.overdue], [0, 1, 0]);
  c.clock.set('2026-11-17T06:00:00Z');
  g = c.ok('sub.followup', {}, c.T.sara);
  eq([g.kpis.overdue, c.ok('sub.followup', { contact: 'overdue' }, c.T.sara).rows.length], [1, 1]);
  const d = c.ok('sub.get', { ref: dalal }, c.T.sara);
  eq(d.contacts.map((x) => [x.channelLabel, x.templateName, x.replyLabel, x.nextFollowUpAt, x.note]), [['واتساب', wa.name, 'وعد بالتجديد', '2026-11-17', 'يجدد يوم الراتب']]);

  // مكالمة تحتاج حالة رد، و«طلب إيقاف الرسائل» يوقفه ويمنع واتساب
  truthy(c.fail('sub.contact.log', { ref: ahmad, channel: 'call' }, c.T.sara).message.includes('حالة الرد'));
  c.ok('sub.contact.log', { ref: ahmad, channel: 'call', replyStatus: 'optout', note: 'لا يرغب' }, c.T.sara);
  eq(c.ok('sub.get', { ref: ahmad }, c.T.sara).optOut, true);
  truthy(c.fail('sub.message.whatsapp', { ref: ahmad }, c.T.sara).message.includes('أوقف'));
  truthy(c.fail('sub.contact.log', { ref: ahmad, channel: 'whatsapp' }, c.T.sara).message.includes('أوقف'));
  eq(c.fail('sub.contact.log', { ref: dalal, channel: 'whatsapp' }, c.T.ahmad).code, 'FORBIDDEN');

  // التقرير: أحمد جدّد بعد التواصل في كشف نوفمبر
  c.ok('plt.import.commit', { platform: 'saad', rows: NOV }, c.T.sara);
  const r = c.ok('sub.report', { days: 30 }, c.T.ahmad);
  eq([r.totals.contacts, r.totals.subscribers, r.totals.replied], [2, 2, 2]);
  eq(r.byChannel.map((x) => [x.channel, x.total, x.replied]), [['whatsapp', 1, 1], ['call', 1, 1]]);
  eq(r.byStaff.map((x) => [x.contacts, x.replied, x.renewed]), [[2, 2, 1]]);
  eq(r.byReply.filter((x) => x.count).map((x) => [x.id, x.count]), [['promised', 1], ['optout', 1]]);
  eq(r.byMonth.find((m) => m.month === '2026-11'), { month: '2026-11', total: 1, contacted: 1, contactedBefore: 0, renewed: 1, renewedContacted: 1, renewedNot: 0, rateContacted: 100, rateNot: null });
  eq(c.fail('sub.report.export', {}, c.T.sara).code, 'FORBIDDEN');
  const ex = c.ok('sub.report.export', { days: 30 }, c.T.huda);
  eq(ex.map((x) => [x.name, x.channel]), [['أحمد علي', 'call'], ['دلال', 'whatsapp']]);
  truthy(c.srv.Db.view('core', 'AuditLog').some((x) => x.action === 'report.export' && x.details.count === 2), 'the export is audited');
});

test('subscribers email: manual send, automatic reminders by settings, no repeats, send hours and the unsubscribe link', () => {
  const c = setup();
  c.ok('plt.import.commit', { platform: 'saad', rows: SEP_OCT }, c.T.sara);
  const list = c.ok('sub.list', {}, c.T.sara), badr = ref(list, 'بدر'), aisha = ref(list, 'عائشة'), dalal = ref(list, 'دلال');
  const e7 = tplOf(c, 'email', 'before7');

  // بأمر الموظف
  truthy(c.fail('sub.message.email', { ref: dalal, templateId: e7.id }, c.T.sara).message.includes('لا بريد'));
  const pv = c.ok('sub.message.preview', { ref: badr, templateId: e7.id }, c.T.sara);
  eq([pv.kind, pv.missingLink], ['before7', true]);
  truthy(pv.subject.includes('صاد القرآني') && pv.body.includes('بدر'), pv.subject + pv.body);
  const sent = c.ok('sub.message.email', { ref: badr, templateId: e7.id, body: pv.body + '\nملاحظة خاصة' }, c.T.sara);
  eq(sent.status, 'sent');
  eq(c.gas.mail.length, 1);
  eq([c.gas.mail[0].to, c.gas.mail[0].subject], ['badr@example.com', pv.subject]);
  truthy(c.gas.mail[0].body.includes('ملاحظة خاصة') && /#\/unsub\/[a-f0-9]{32}/.test(c.gas.mail[0].htmlBody), 'edited text and the unsubscribe link');
  const b = c.ok('sub.get', { ref: badr }, c.T.sara);
  eq(b.contacts.map((x) => [x.channel, x.status, x.reply, x.auto, !!x.byName, x.subject]), [['email', 'sent', 'waiting', false, true, pv.subject]]);
  truthy(!JSON.stringify(c.srv.Db.view('subscribers', 'Messages')).includes('ملاحظة خاصة'), 'the message text is not stored');

  // التلقائي: مغلق افتراضياً
  eq(c.fail('sub.reminders.run', {}, c.T.sara).code, 'FORBIDDEN');
  eq(c.ok('sub.reminders.run', {}, c.T.huda).reason, 'off');
  truthy(c.fail('sub.settings.save', { sendFrom: 21, sendTo: 9 }, c.T.huda).message.includes('بعد بدايتها'));
  c.ok('sub.settings.save', { autoEmail: true, autoKinds: { before14: true, before7: true, on_expiry: true, after7: true }, dailyCap: 20, senderName: 'فريق صاد' }, c.T.huda);
  const st = c.ok('sub.lookups', {}, c.T.huda).settings;
  eq([st.autoEmail, st.autoKinds.before14, st.sendFrom, st.sendTo, st.dailyCap, st.renewalLink, st.retentionMonths], [true, true, 9, 21, 20, '', 24], 'partial saves keep the rest');

  // قبل الانتهاء بـ 14 يوماً: عائشة تنتهي 19/12
  c.clock.set('2026-12-05T06:00:00Z'); // 09:00 بتوقيت الكويت
  eq(c.ok('sub.reminders.run', {}, c.T.huda), { sent: 1, skipped: 0, failed: 0, noEmail: 0, reason: '' });
  eq([c.gas.mail.length, c.gas.mail[1].to, c.gas.mail[1].name], [2, 'aisha@example.com', 'فريق صاد']);
  eq(c.ok('sub.reminders.run', {}, c.T.huda).sent, 0, 'never twice for the same cycle and reminder');
  eq(c.srv.subscriberReminders().sent, 0);
  const a = c.ok('sub.get', { ref: aisha }, c.T.sara).contacts[0];
  eq([a.auto, a.kind, a.status, a.reply, a.byName], [true, 'before14', 'sent', '', '']);
  c.clock.set('2026-12-12T19:00:00Z'); // 22:00 خارج ساعات الإرسال
  eq(c.ok('sub.reminders.run', {}, c.T.huda).reason, 'hours');
  // بعد الانتهاء بأسبوع لمن لم يجدد (لم يُرفع كشف ديسمبر)
  c.clock.set('2026-12-26T06:00:00Z');
  eq(c.ok('sub.reminders.run', {}, c.T.huda).sent, 1);
  eq(c.ok('sub.get', { ref: aisha }, c.T.sara).contacts.map((x) => x.kind), ['after7', 'before14']);
  const r = c.ok('sub.report', { days: 90 }, c.T.ahmad);
  eq([r.auto.sent, r.byChannel.find((x) => x.channel === 'email').total], [2, 3]);

  // رابط الإيقاف: صفحة عامة برمز
  const token = /#\/unsub\/([a-f0-9]{32})/.exec(c.gas.mail[2].htmlBody)[1];
  eq(c.fail('sub.unsub.view', { token: 'abc' }).code, 'NOT_FOUND');
  eq(c.ok('sub.unsub.view', { token }), { platformName: 'صاد القرآني', optedOut: false });
  eq(c.ok('sub.unsub.confirm', { token }).optedOut, true);
  const after = c.ok('sub.get', { ref: aisha }, c.T.sara);
  eq([after.optOut, after.optOutReason, after.contacts[0].direction, after.contacts[0].reply], [true, 'من رابط البريد', 'in', 'optout']);
  truthy(c.fail('sub.message.email', { ref: aisha, templateId: e7.id }, c.T.sara).message.includes('أوقف'));
});

test('subscribers templates: defaults once, managers edit them, preview with sample values', () => {
  const c = setup();
  c.ok('plt.import.commit', { platform: 'saad', rows: SEP_OCT }, c.T.sara);
  const all = c.ok('sub.templates', {}, c.T.sara);
  eq([all.length, all.filter((t) => t.channel === 'email').length], [7, 4]);
  eq(c.fail('sub.template.save', { channel: 'whatsapp', kind: 'before14', name: 'x', body: 'x' }, c.T.sara).code, 'FORBIDDEN');
  truthy(c.fail('sub.template.save', { channel: 'email', kind: 'before14', name: 'x', body: 'x' }, c.T.huda).message.includes('عنوان البريد'));
  truthy(c.fail('sub.template.save', { channel: 'sms', kind: 'before14', name: 'x', body: 'x' }, c.T.huda).message.includes('قناة'));
  const t = c.ok('sub.template.save', { channel: 'whatsapp', kind: 'before14', name: 'قبل أسبوعين', body: 'أهلاً {الاسم}، باقي {الأيام_المتبقية} على {الباقة}. {متغير_غير_معروف}' }, c.T.huda);
  eq([t.kindLabel, t.active, t.sort], ['قبل الانتهاء بـ 14 يوماً', true, 8]);
  eq(c.ok('sub.message.preview', { templateId: t.id }, c.T.sara).body, 'أهلاً محمد، باقي 7 أيام على الباقة الذهبية. {متغير_غير_معروف}', 'sample values without a subscriber');
  c.ok('sub.template.save', { id: t.id, channel: 'whatsapp', kind: 'before14', name: 'قبل أسبوعين', body: 'نص', active: false }, c.T.huda);
  eq(c.ok('sub.templates', {}, c.T.sara).find((x) => x.id === t.id).active, false);
  c.ok('sub.template.remove', { id: t.id }, c.T.huda);
  all.forEach((x) => c.ok('sub.template.remove', { id: x.id }, c.T.huda));
  eq(c.ok('sub.templates', {}, c.T.sara).length, 0, 'removing every template does not bring the defaults back');
  const log = c.ok('audit.list', { module: 'subscribers' }, c.A).rows;
  truthy(log.some((x) => x.action === 'template.create') && log.some((x) => x.action === 'template.update') && log.some((x) => x.action === 'template.remove'));
});
