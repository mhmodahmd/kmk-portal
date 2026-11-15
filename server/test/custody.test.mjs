import { eq, test, truthy } from './harness.mjs';
import { company, at, SUN } from './phase1.test.mjs';

/** الشركة مع أدوار العهد: هدى وسارة محاسبتان، وأحمد صاحب عهدة */
function setup() {
  const c = company(at(SUN, '07:00'));
  const users = c.ok('users.list', {}, c.A).users;
  const id = (u) => users.find((x) => x.username === u).id;
  c.ok('users.setRoles', { id: id('huda'), roles: { attendance: 'hr', hr: 'hr', custody: 'accountant' } }, c.A);
  c.ok('users.setRoles', { id: id('sara'), roles: { custody: 'accountant' } }, c.A);
  c.ok('users.setRoles', { id: id('ahmad'), roles: { custody: 'holder' } }, c.A);
  c.ok('cus.settings.save', { managerName: 'المدير العام', managerPhone: '96550000000', alertPercent: 80, defaultAmount: '100' }, c.A);
  return c;
}

/** يفتح عهدة لأحمد ويوصلها إلى «تم الاستلام» */
function openReceived(c, amount = '100') {
  const cu = c.ok('cus.open', { employeeId: c.emp.ahmad.id, amount, paymentMethod: 'cash' }, c.T.huda);
  c.ok('cus.markSigned', { kind: 'voucher', id: cu.openVoucherId }, c.T.huda);
  c.ok('cus.confirmReceipt', { id: cu.id }, c.T.ahmad);
  return cu;
}

const expense = (c, id, amount, extra = {}) => c.ok('cus.expense.save', {
  custodyId: id, date: SUN, amount, description: 'ضيافة', category: 'ضيافة وبوفيه', noAttachmentReason: 'فاتورة ورقية', ...extra
}, c.T.ahmad);

test('custody lifecycle: open, sign, receive, spend, close, approve, sign statement, carry to next', () => {
  const c = setup();
  const cu = c.ok('cus.open', { employeeId: c.emp.ahmad.id, amount: '100', paymentMethod: 'transfer' }, c.T.huda);
  eq([cu.id, cu.stage, cu.amount, cu.remaining], ['NTH-2026-001', 'awaiting_signature', 100000, 100000]);
  const pv = c.ok('cus.voucher.get', { id: cu.openVoucherId }, c.T.huda).voucher;
  eq([pv.number, pv.amount, pv.amountInWords], ['PV-2026-0001', 100000, 'مائة دينار كويتي لا غير']);

  // لا مصروفات قبل الاستلام، ولا تأكيد استلام قبل توقيع الإدارة
  eq(c.fail('cus.expense.save', { custodyId: cu.id, date: SUN, amount: '5', description: 'x', category: 'طباعة' }, c.T.ahmad).code, 'NOT_RECEIVED');
  truthy(c.fail('cus.confirmReceipt', { id: cu.id }, c.T.ahmad).message.includes('الإدارة'));
  c.ok('cus.markSigned', { kind: 'voucher', id: cu.openVoucherId, note: 'وقّعها ورقياً' }, c.T.huda);
  eq(c.ok('cus.get', { id: cu.id }, c.T.ahmad).custody.stage, 'disbursing');
  c.ok('cus.confirmReceipt', { id: cu.id }, c.T.ahmad);

  // مصروفات ومقبوض إضافي، والمرفق أو سببه شرط للإقفال
  expense(c, cu.id, '30.250');
  c.ok('cus.expense.save', { custodyId: cu.id, entryType: 'receipt', date: SUN, amount: '10', description: 'استرداد' }, c.T.ahmad);
  const noDoc = c.ok('cus.expense.save', { custodyId: cu.id, date: SUN, amount: '85', description: 'أدوات', category: 'أدوات ومعدات مكتبية' }, c.T.ahmad);
  eq(noDoc.custody.remaining, 100000 + 10000 - 30250 - 85000);
  eq(c.fail('cus.requestClose', { id: cu.id }, c.T.ahmad).code, 'MISSING_ATTACHMENTS');
  const items = c.ok('cus.get', { id: cu.id }, c.T.ahmad).expenses;
  const tools = items.find((x) => x.description === 'أدوات');
  c.ok('cus.expense.save', { id: tools.id, date: SUN, amount: '85', description: 'أدوات', category: 'أدوات ومعدات مكتبية', noAttachmentReason: 'ضاعت' }, c.T.ahmad);
  eq(c.fail('cus.requestClose', { id: cu.id }, c.T.ahmad).code, 'OVERSPEND_CONFIRM');

  // ملاحظة المحاسب، ثم رفض بسبب، ثم إعادة الإرسال والاعتماد بالترحيل
  c.ok('cus.expense.note', { id: tools.id, note: 'أرفق الإيصال' }, c.T.huda);
  c.ok('cus.requestClose', { id: cu.id, acknowledgeOverspend: true }, c.T.ahmad);
  eq(c.fail('cus.expense.save', { custodyId: cu.id, date: SUN, amount: '1', description: 'x', category: 'طباعة' }, c.T.ahmad).message.includes('الاعتماد'), true);
  truthy(c.fail('cus.reject', { id: cu.id }, c.T.huda).message.includes('سبب'));
  eq(c.ok('cus.reject', { id: cu.id, reason: 'راجع البند الأخير' }, c.T.huda).status, 'open');
  c.ok('cus.requestClose', { id: cu.id, acknowledgeOverspend: true }, c.T.ahmad);
  const ap = c.ok('cus.approve', { id: cu.id, settlementMethod: 'carry' }, c.T.huda);
  eq([ap.custody.status, ap.voucher], ['signing', null]);
  truthy(c.fail('cus.open', { employeeId: c.emp.ahmad.id, amount: '100' }, c.T.huda).message.includes('كشف تسويتها'), 'blocked until statement signed');
  c.ok('cus.markSigned', { kind: 'statement', id: cu.id }, c.T.huda);
  const done = c.ok('cus.get', { id: cu.id }, c.T.ahmad);
  eq([done.custody.status, done.custody.statusLabel], ['closed', 'مغلقة نهائياً']);
  eq(done.stages.every((s) => s.state === 'done'), true);

  // العهدة التالية: العجز (−5.250) يُحتسب ضمن المبلغ فيرتفع سند الصرف
  const next = c.ok('cus.open', { employeeId: c.emp.ahmad.id, amount: '100', carryMode: 'include' }, c.T.huda);
  eq([next.id, next.carriedBalance, next.amount, next.remaining, next.previousCustodyId], ['NTH-2026-002', -5250, 105250, 100000, cu.id]);
  eq(c.ok('cus.voucher.get', { id: next.openVoucherId }, c.T.huda).voucher.number, 'PV-2026-0002');
});

test('custody settlement by voucher, separation of duties and visibility', () => {
  const c = setup();
  const cu = openReceived(c);
  expense(c, cu.id, '60');
  c.ok('cus.requestClose', { id: cu.id }, c.T.ahmad);
  const ap = c.ok('cus.approve', { id: cu.id, settlementMethod: 'voucher', paymentMethod: 'cash' }, c.T.sara);
  eq([ap.voucher.type, ap.voucher.number, ap.voucher.amount], ['receipt', 'RV-2026-0001', 40000]);

  // لا أحد يفتح عهدة لنفسه، وأحمد لا يرى إلا عهده
  eq(c.fail('cus.open', { employeeId: c.emp.huda.id, amount: '50' }, c.T.huda).code, 'FORBIDDEN');
  const hudaC = c.ok('cus.open', { employeeId: c.emp.huda.id, amount: '50' }, c.T.sara);
  eq(c.fail('cus.get', { id: hudaC.id }, c.T.ahmad).code, 'NOT_FOUND');
  eq(c.ok('cus.list', {}, c.T.ahmad).length, 1);
  eq(c.ok('cus.list', {}, c.T.huda).length, 2);
  // هدى لا تؤكد توقيع سند عهدتها
  eq(c.fail('cus.markSigned', { kind: 'voucher', id: hudaC.openVoucherId }, c.T.huda).code, 'FORBIDDEN');
  eq(c.fail('cus.open', { employeeId: c.emp.ahmad.id, amount: '50' }, c.T.ahmad).code, 'FORBIDDEN', 'holders cannot open custodies');
});

test('custody requests through the approvals inbox, and voucher requests', () => {
  const c = setup();
  const r = c.ok('cus.request.create', { amount: '150', reason: 'مشتريات المعرض' }, c.T.ahmad);
  truthy(c.fail('cus.request.create', {}, c.T.ahmad).message.includes('بانتظار'));
  const inbox = c.ok('inbox.list', {}, c.T.huda);
  const item = inbox.find((x) => x.kind === 'cus.request');
  eq(item.refId, r.id);
  c.ok('inbox.decide', { kind: 'cus.request', id: r.id, approve: true }, c.T.huda);
  const mine = c.ok('cus.home', {}, c.T.ahmad);
  eq([mine.myCustody.amount, mine.myRequest.status], [150000, 'approved']);
  const pv = c.ok('cus.voucher.get', { id: mine.myCustody.openVoucherId }, c.T.ahmad).voucher;
  truthy(pv.reason.includes('مشتريات المعرض'));
  eq(pv.requestedByName, 'أحمد');
  truthy(c.fail('cus.request.create', {}, c.T.ahmad).message.includes('عهدة'), 'no new request while one is active');

  // طلب سند عام: بلا رقم حتى يوافق المحاسب، ورفضه يحتاج سبباً
  const vr = c.ok('cus.voucher.request', { type: 'receipt', partyName: 'عميل', amount: '30', reason: 'دفعة', paymentMethod: 'transfer' }, c.T.ahmad);
  eq([vr.number, vr.status], ['', 'requested']);
  truthy(c.ok('inbox.list', {}, c.T.huda).some((x) => x.kind === 'cus.voucher'));
  eq(c.ok('cus.voucher.approve', { id: vr.id }, c.T.huda).number, 'RV-2026-0001');
  const vr2 = c.ok('cus.voucher.request', { type: 'payment', partyName: 'مورد', amount: '12.5', reason: 'شراء' }, c.T.ahmad);
  truthy(c.fail('cus.voucher.reject', { id: vr2.id }, c.T.huda).message.includes('سبب'));
  c.ok('cus.voucher.reject', { id: vr2.id, reason: 'بلا فاتورة' }, c.T.huda);
  eq(c.fail('cus.voucher.cancel', { id: vr.id, reason: 'x' }, c.T.huda).code, 'FORBIDDEN', 'only super admin cancels active vouchers');
  eq(c.ok('cus.voucher.cancel', { id: vr.id, reason: 'خطأ' }, c.A).status, 'cancelled');
  eq(c.ok('cus.voucher.list', {}, c.T.ahmad).length, 3, 'holder sees own requests and own custody vouchers');
});

test('manager signs through a one-time link, and amounts in words', () => {
  const c = setup();
  const cu = c.ok('cus.open', { employeeId: c.emp.ahmad.id, amount: '125.5' }, c.T.huda);
  const first = c.ok('cus.sign.create', { kind: 'voucher', id: cu.openVoucherId }, c.T.huda);
  const link = c.ok('cus.sign.create', { kind: 'voucher', id: cu.openVoucherId }, c.T.huda);
  eq(c.fail('cus.sign.view', { token: first.token }).code, 'REVOKED');
  const v = c.ok('cus.sign.view', { token: link.token });
  eq([v.kind, v.managerName, v.doc.voucher.amountInWords], ['voucher', 'المدير العام', 'مائة وخمسة وعشرون دينار كويتي وخمسمائة فلس لا غير']);
  truthy(c.fail('cus.sign.submit', { token: link.token, data: 'not-an-image' }).message.includes('صورة'));
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  c.ok('cus.sign.submit', { token: link.token, data: png });
  eq(c.fail('cus.sign.view', { token: link.token }).code, 'USED');
  const g = c.ok('cus.get', { id: cu.id }, c.T.ahmad);
  eq([g.custody.stage, g.signLinks.openVoucher.status], ['disbursing', 'signed']);
  const printed = c.ok('cus.voucher.get', { id: cu.openVoucherId }, c.T.ahmad);
  eq(printed.signs.find((s) => s.label === 'المدير').image, png);
  eq(c.fail('cus.sign.view', { token: 'ab'.repeat(32) }).code, 'BAD_LINK');
  eq(c.fail('cus.sign.create', { kind: 'voucher', id: cu.openVoucherId }, c.T.huda).message.includes('موقّع'), true);
});

test('custody lists and settings are for the system admin', () => {
  const c = setup();
  c.ok('cus.lookups', {}, c.T.ahmad);
  const s = c.ok('cus.list.save', { list: 'projects', name: 'صاد', type: 'project' }, c.A);
  truthy(s.lists.projects.some((p) => p.name === 'صاد'));
  eq(c.fail('cus.list.save', { list: 'projects', name: 'صاد' }, c.A).message.includes('مستخدم'), true);
  eq(c.fail('cus.settings.get', {}, c.T.huda).code, 'FORBIDDEN');
  const cu = openReceived(c);
  expense(c, cu.id, '5', { project: 'صاد' });
  const cat = c.ok('cus.settings.get', {}, c.A).lists.categories.find((x) => x.name === 'ضيافة وبوفيه');
  c.ok('cus.list.save', { list: 'categories', id: cat.id, name: 'ضيافة' }, c.A);
  eq(c.ok('cus.get', { id: cu.id }, c.T.ahmad).expenses[0].category, 'ضيافة', 'renaming updates recorded items');
});

test('HR cannot end the service of an employee holding an unclosed custody', () => {
  const c = setup();
  const cu = openReceived(c);
  const emp = { ...c.emp.ahmad, status: 'terminated' };
  const err = c.fail('hr.employee.save', emp, c.A);
  eq(err.code, 'OFFBOARD_BLOCKED');
  truthy(err.message.includes(cu.id) && err.message.includes('أحمد'), err.message);
  // بعد الإقفال والاعتماد يُسمح
  expense(c, cu.id, '10');
  c.ok('cus.requestClose', { id: cu.id }, c.T.ahmad);
  c.ok('cus.approve', { id: cu.id, settlementMethod: 'voucher' }, c.T.huda);
  c.ok('cus.markSigned', { kind: 'statement', id: cu.id }, c.T.huda);
  eq(c.ok('cus.get', { id: cu.id }, c.T.huda).custody.status, 'closed');
  eq(c.ok('hr.employee.save', emp, c.A).status, 'terminated');
});
