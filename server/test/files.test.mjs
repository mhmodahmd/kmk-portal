import { eq, test, truthy } from './harness.mjs';
import { company, at, SUN } from './phase1.test.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function setup() {
  const c = company(at(SUN, '07:00'));
  const users = c.ok('users.list', {}, c.A).users;
  const id = (u) => users.find((x) => x.username === u).id;
  c.ok('users.setRoles', { id: id('huda'), roles: { custody: 'accountant' } }, c.A);
  c.ok('users.setRoles', { id: id('ahmad'), roles: { custody: 'holder' } }, c.A);
  const cu = c.ok('cus.open', { employeeId: c.emp.ahmad.id, amount: '100' }, c.T.huda);
  return { ...c, cu };
}

test('attachments on Drive: upload, view, block when closed, delete', () => {
  const c = setup();
  eq(c.ok('cus.lookups', {}, c.T.ahmad).drive, true);
  // سند الصرف الموقّع ورقياً يُرفع ملفاً فتنتقل العهدة إلى «جاري الصرف»
  eq(c.fail('cus.signed.upload', { kind: 'voucher', id: c.cu.openVoucherId, fileName: 'x.exe', mimeType: 'application/x-msdownload', data: PNG }, c.T.huda).message.includes('غير مسموح'), true);
  c.ok('cus.signed.upload', { kind: 'voucher', id: c.cu.openVoucherId, fileName: 'pv.png', mimeType: 'image/png', data: PNG }, c.T.huda);
  const d = c.ok('cus.get', { id: c.cu.id }, c.T.ahmad);
  eq([d.custody.stage, d.vouchers[0].hasSignedFile], ['disbursing', true]);
  eq(c.ok('cus.signed.content', { kind: 'voucher', id: c.cu.openVoucherId }, c.T.ahmad).data, PNG);
  c.ok('cus.confirmReceipt', { id: c.cu.id }, c.T.ahmad);

  c.ok('cus.expense.save', { custodyId: c.cu.id, date: SUN, amount: '12', description: 'ورق', category: 'أدوات ومعدات مكتبية' }, c.T.ahmad);
  const e = c.ok('cus.get', { id: c.cu.id }, c.T.ahmad).expenses[0];
  const a = c.ok('cus.attachment.upload', { expenseId: e.id, fileName: 'فاتورة.png', mimeType: 'image/png', data: 'data:image/png;base64,' + PNG }, c.T.ahmad);
  eq(a.fileName, c.cu.id + '_1_فاتورة.png');
  eq(c.ok('cus.attachment.content', { id: a.id }, c.T.huda).data, PNG);
  eq(c.fail('cus.attachment.content', { id: a.id }, c.T.sara).code, 'FORBIDDEN', 'no custody role');

  // البند صار له مرفق، فيُقبل طلب الإقفال بلا سبب
  c.ok('cus.requestClose', { id: c.cu.id }, c.T.ahmad);
  eq(c.fail('cus.attachment.upload', { expenseId: e.id, fileName: 'b.png', mimeType: 'image/png', data: PNG }, c.T.ahmad).message.includes('الاعتماد'), true);
  c.ok('cus.approve', { id: c.cu.id, settlementMethod: 'carry' }, c.T.huda);
  c.ok('cus.signed.upload', { kind: 'statement', id: c.cu.id, fileName: 'st.pdf', mimeType: 'application/pdf', data: PNG }, c.T.huda);
  const closed = c.ok('cus.get', { id: c.cu.id }, c.T.ahmad).custody;
  eq([closed.status, closed.hasCloseSignedFile], ['closed', true]);
  truthy(c.ok('audit.list', {}, c.A).rows.some((r) => r.action === 'attachment.upload'));
});
