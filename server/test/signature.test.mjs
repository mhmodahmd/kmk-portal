/**
 * المرحلة 4: التوقيع من النظام — التوقيع المحفوظ واعتماده، مرحلة «توقيع» بإعادة التحقق، الملف الموقّع إصداراً جديداً،
 * سجل التواقيع ورمز التحقق.
 */
import { eq, test, truthy } from './harness.mjs';
import { company, at, SUN } from './phase1.test.mjs';

const b64 = (s) => Buffer.from(s).toString('base64');
const PDF = b64('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
const SIGNED = b64('%PDF-1.4\n% signed copy\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const DOCX = b64(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26), Buffer.from('[Content_Types].xml\nword/document.xml')]));

function setup() {
  const c = company(at(SUN, '07:00'));
  const users = c.ok('users.list', {}, c.A).users;
  const uid = (u) => users.find((x) => x.username === u).id;
  c.ok('users.setRoles', { id: uid('ahmad'), roles: { correspondence: 'clerk', custody: 'holder' } }, c.A);
  c.ok('users.setRoles', { id: uid('huda'), roles: { attendance: 'hr', hr: 'hr', correspondence: 'manager' } }, c.A);
  const U = { sara: uid('sara'), ahmad: uid('ahmad'), huda: uid('huda') };
  const memo = c.ok('cor.types', {}, c.T.huda).find((t) => t.code === 'MEMO');
  const tpl = c.ok('wf.template.save', { module: 'correspondence', name: 'توقيع المديرة', steps: [{ name: 'توقيع المدير المباشر', kind: 'sign', assignee: { type: 'direct_manager' } }] }, c.T.huda)[0];
  const doc = (data = PDF, fileName = 'm.pdf') => {
    const d = c.ok('cor.save', { typeId: memo.id, subject: 'قرار تعيين', date: SUN }, c.T.ahmad);
    c.ok('cor.file.upload', { letterId: d.id, role: 'main', fileName, mimeType: '', data }, c.T.ahmad);
    const inst = c.ok('cor.submit', { id: d.id, templateId: tpl.id }, c.T.ahmad).workflow.id;
    return { d, inst };
  };
  const approveSig = (who) => { const s = c.ok('sign.list', {}, c.A).find((x) => x.userId === U[who]); c.ok('sign.decide', { id: s.id, approve: true }, c.A); };
  return { ...c, U, memo, tpl, doc, approveSig };
}

test('signatures: saved per user, approved by the system admin, copied from custody, and validated', () => {
  const c = setup();
  eq(c.ok('sign.mine', {}, c.T.sara), { signature: null, hasCustody: false });
  truthy(c.fail('sign.save', { data: 'data:image/jpeg;base64,AAAA' }, c.T.sara).message.includes('PNG'));
  eq(c.ok('sign.save', { data: PNG }, c.T.sara).signature.status, 'pending');
  eq(c.ok('sign.save', { data: PNG }, c.A).signature.status, 'approved', 'the system admin signature needs no approval');
  eq(c.fail('sign.list', {}, c.T.huda).code, 'FORBIDDEN');
  eq(c.ok('sign.list', {}, c.A).map((s) => [s.name, s.status]), [['سارة', 'pending'], ['مدير النظام', 'approved']]);
  c.approveSig('sara');
  eq(c.ok('sign.mine', {}, c.T.sara).signature.status, 'approved');
  // تغيير التوقيع يعيده بانتظار الاعتماد
  eq(c.ok('sign.save', { data: PNG.replace('ggg', 'ggh') }, c.T.sara).signature.status, 'pending');
  // نسخ توقيع العهد
  c.ok('cus.signature.save', { data: PNG }, c.T.ahmad);
  eq(c.ok('sign.mine', {}, c.T.ahmad).hasCustody, true);
  eq(c.ok('sign.save', { fromCustody: true }, c.T.ahmad).signature.data, PNG);
  truthy(c.fail('sign.save', { fromCustody: true }, c.T.huda).message.includes('العهد'));
  // الرفض يحذفه
  const s = c.ok('sign.list', {}, c.A).find((x) => x.userId === c.U.ahmad);
  c.ok('sign.decide', { id: s.id, approve: false }, c.A);
  eq(c.ok('sign.mine', {}, c.T.ahmad).signature, null);
});

test('signatures: a sign step needs an approved signature and re-authentication, and stores the signed PDF as a new version', () => {
  const c = setup();
  const { d, inst } = c.doc();
  const item = c.ok('inbox.list', {}, c.T.sara).find((x) => x.kind === 'wf.step');
  eq([item.linkOnly, item.status], [true, 'توقيع']);
  truthy(c.fail('inbox.decide', { kind: 'wf.step', id: inst, approve: true }, c.T.sara).message.includes('توقيع'));
  truthy(c.fail('wf.act', { instanceId: inst, action: 'approve' }, c.T.sara).message.includes('توقيع'));
  eq(c.ok('cor.get', { id: d.id }, c.T.sara).workflow.can.sign, true);
  truthy(c.fail('cor.sign.source', { id: d.id }, c.T.sara).message.includes('توقيع معتمد'));
  c.ok('sign.save', { data: PNG }, c.T.sara);
  truthy(c.fail('cor.sign.source', { id: d.id }, c.T.sara).message.includes('توقيع معتمد'), 'pending is not enough');
  c.approveSig('sara');
  eq(c.fail('cor.sign.source', { id: d.id }, c.T.huda).code, 'FORBIDDEN', 'not her step');
  const src = c.ok('cor.sign.source', { id: d.id }, c.T.sara);
  eq([src.data, src.signature, src.signer, src.jobTitle, src.step, src.number, src.code.length], [PDF, PNG, 'سارة', 'مديرة التصميم', 'توقيع المدير المباشر', d.number, 10]);
  // إعادة التحقق ثم الرمز
  eq(c.fail('wf.act', { instanceId: inst, action: 'sign', pdf: SIGNED, method: 'password', password: 'wrong', code: src.code }, c.T.sara).code, 'BAD_PASSWORD');
  truthy(c.fail('wf.act', { instanceId: inst, action: 'sign', pdf: SIGNED, method: 'password', password: 'pass12345', code: 'XXXXXXXXXX' }, c.T.sara).message.includes('جلسة التوقيع'));
  const src2 = c.ok('cor.sign.source', { id: d.id }, c.T.sara);
  truthy(c.fail('wf.act', { instanceId: inst, action: 'sign', pdf: PDF.slice(4), method: 'password', password: 'pass12345', code: src2.code }, c.T.sara).message.length > 0);
  const src3 = c.ok('cor.sign.source', { id: d.id }, c.T.sara);
  c.ok('wf.act', { instanceId: inst, action: 'sign', pdf: SIGNED, method: 'password', password: 'pass12345', code: src3.code, note: 'موافقة' }, c.T.sara);
  const g = c.ok('cor.get', { id: d.id }, c.T.ahmad);
  eq([g.letter.status, g.letter.version, g.main.fileName.includes('موقّع'), g.versions.length], ['approved', 2, true, 2]);
  eq(g.signatures.map((s) => [s.name, s.method, s.code, s.version, s.step]), [['سارة', 'password', src3.code, 2, 'توقيع المدير المباشر']]);
  eq(c.ok('cor.file.content', { id: g.main.id }, c.T.ahmad).data, SIGNED);
  eq(g.workflow.actions.map((a) => a.action), ['start', 'sign']);
  truthy(g.log.some((x) => x.kind === 'sign' && x.body.includes(src3.code)));
  truthy(c.ok('notify.list', {}, c.T.ahmad).items.some((n) => n.title === 'اعتُمد مستندك'));
  // التحقق بالرمز لأي مستخدم مسجّل
  const v = c.ok('sign.verify', { code: src3.code.toLowerCase() }, c.T.huda);
  eq([v.found, v.signer, v.number, v.version], [true, 'سارة', d.number, 2]);
  eq(c.ok('sign.verify', { code: 'ABCDEF1234' }, c.T.huda).found, false);
  truthy(c.fail('sign.verify', { code: '!!' }, c.T.huda).message.includes('رمز'));
});

test('signatures: a Word main file is converted to PDF for signing; the creator cannot hold a sign step', () => {
  const c = setup();
  c.ok('sign.save', { data: PNG }, c.T.sara);
  c.approveSig('sara');
  const { d } = c.doc(DOCX, 'قرار.docx');
  const src = c.ok('cor.sign.source', { id: d.id }, c.T.sara);
  eq([src.fileName, Buffer.from(src.data, 'base64').toString().startsWith('%PDF')], ['MEMO-2026-0001_v1_قرار.pdf', true]);
  // سارة تنشئ مستنداً بمرحلة توقيع موجهة لها: تُستبعد وتنتقل للبديل
  const t = c.ok('wf.template.save', { module: 'correspondence', name: 'توقيع سارة', steps: [{ name: 'توقيع', kind: 'sign', assignee: { type: 'user', id: c.U.sara } }] }, c.T.huda).find((x) => x.name === 'توقيع سارة');
  c.ok('users.setRoles', { id: c.U.sara, roles: { correspondence: 'clerk' } }, c.A);
  const own = c.ok('cor.save', { typeId: c.memo.id, subject: 'من سارة', date: SUN }, c.T.sara);
  const g = c.ok('cor.submit', { id: own.id, templateId: t.id }, c.T.sara);
  eq([g.workflow.steps[0].assignees.map((a) => a.name), g.workflow.steps[0].fallback], [['هدى'], true]);
});
