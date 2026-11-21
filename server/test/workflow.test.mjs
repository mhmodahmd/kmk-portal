/**
 * السلسلة الإجرائية — المرحلة 2 (docs/08 القسم 4): القوالب بإصدارات، المثيل كنسخة ثابتة، الإجراءات،
 * صندوق الموافقات والإشعارات، قفل المستند المعتمد، واطلاع المشاركين.
 *
 * أحمد موظف مستندات في قسم التصميم ومديره المباشر سارة (بلا دور في المستندات)، وهدى مديرة المستندات.
 */
import { eq, test, truthy } from './harness.mjs';
import { company, at, SUN } from './phase1.test.mjs';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n').toString('base64');

function setup() {
  const c = company(at(SUN, '07:00'));
  const users = c.ok('users.list', {}, c.A).users;
  const uid = (u) => users.find((x) => x.username === u).id;
  c.ok('users.setRoles', { id: uid('ahmad'), roles: { correspondence: 'clerk' } }, c.A);
  c.ok('users.setRoles', { id: uid('huda'), roles: { attendance: 'hr', hr: 'hr', correspondence: 'manager' } }, c.A);
  const U = { sara: uid('sara'), ahmad: uid('ahmad'), huda: uid('huda'), admin: uid('admin') };
  const memo = c.ok('cor.types', {}, c.T.huda).find((t) => t.code === 'MEMO');
  /** سلسلة: مراجعة المدير المباشر ← اعتماد مدير المستندات ← إحاطة موظفي المستندات */
  const tpl = (extra = {}) => c.ok('wf.template.save', {
    module: 'correspondence', name: 'اعتماد المذكرات', steps: [
      { name: 'مراجعة المدير المباشر', kind: 'review', assignee: { type: 'direct_manager' } },
      { name: 'اعتماد مدير المستندات', kind: 'approve', assignee: { type: 'role', role: 'manager' } },
      { name: 'إحاطة الموظفين', kind: 'inform', assignee: { type: 'role', role: 'clerk' } }
    ], ...extra
  }, c.T.huda).find((t) => t.name === (extra.name || 'اعتماد المذكرات'));
  const doc = (tok = c.T.ahmad, subject = 'مذكرة شراء طابعة') => c.ok('cor.save', { typeId: memo.id, subject, date: SUN }, tok);
  const notes = (tok) => c.ok('notify.list', {}, tok).items;
  const inbox = (tok) => c.ok('inbox.list', {}, tok).filter((x) => x.kind === 'wf.step');
  return { ...c, U, memo, tpl, doc, notes, inbox };
}

test('workflow: templates are managed by the module manager, validated, and versioned on each save', () => {
  const c = setup();
  const steps = [{ name: 'اعتماد', kind: 'approve', assignee: { type: 'role', role: 'manager' } }];
  eq(c.fail('wf.template.save', { module: 'correspondence', name: 'س', steps }, c.T.ahmad).code, 'FORBIDDEN');
  truthy(c.fail('wf.template.save', { module: 'tasks', name: 'س', steps }, c.A).message.includes('لا تدعم'));
  truthy(c.fail('wf.template.save', { module: 'correspondence', name: 'س', steps: [] }, c.T.huda).message.includes('مرحلة واحدة'));
  truthy(c.fail('wf.template.save', { module: 'correspondence', name: 'س', steps: [{ name: 'أ', kind: 'stamp', assignee: { type: 'user', id: c.U.sara } }] }, c.T.huda).message.includes('نوع المرحلة'));
  truthy(c.fail('wf.template.save', { module: 'correspondence', name: 'س', steps: [{ name: 'أ', kind: 'review', assignee: {} }] }, c.T.huda).message.includes('المسؤول'));
  truthy(c.fail('wf.template.save', { module: 'correspondence', name: 'س', steps: [{ name: 'أ', kind: 'review', assignee: { type: 'role', role: 'boss' } }] }, c.T.huda).message.includes('الدور'));
  truthy(c.fail('wf.template.save', { module: 'correspondence', name: 'س', steps: [{ name: 'أ', kind: 'inform', assignee: { type: 'user', id: c.U.sara } }] }, c.T.huda).message.includes('اطلاع'));
  const t = c.tpl();
  eq([t.version, t.status, t.steps.map((s) => [s.kind, s.assigneeLabel])], [1, 'published', [['review', 'المدير المباشر للمنشئ'], ['approve', 'مدير المستندات'], ['inform', 'موظف مستندات']]]);
  truthy(c.fail('wf.template.save', { module: 'correspondence', name: 'اعتماد المذكرات', steps }, c.T.huda).message.includes('مستخدم'));
  // إصدار جديد لا يمس السلسلة الجارية
  const d = c.doc();
  c.ok('cor.submit', { id: d.id, templateId: t.id }, c.T.ahmad);
  const t2 = c.ok('wf.template.save', { id: t.id, name: t.name, steps }, c.T.huda).find((x) => x.id === t.id);
  eq([t2.version, t2.steps.length, t2.running], [2, 1, 1]);
  eq(c.ok('cor.get', { id: d.id }, c.T.ahmad).workflow.steps.length, 3, 'the running chain keeps its snapshot');
  eq(c.ok('wf.templates', { module: 'correspondence' }, c.T.ahmad).length, 1, 'clerks see published templates');
  const lk = c.ok('wf.lookups', { module: 'correspondence' }, c.T.sara);
  eq([lk.kinds.map((k) => k.id), lk.roles.map((r) => r.id), lk.people.length > 0], [['review', 'approve', 'sign', 'execute', 'inform'], ['clerk', 'manager'], true]);
});

test('workflow: a document goes through review and approval, participants see it, and the approved document is locked', () => {
  const c = setup();
  const t = c.tpl();
  const d = c.doc();
  c.ok('cor.file.upload', { letterId: d.id, role: 'main', fileName: 'm.pdf', mimeType: 'application/pdf', data: PDF }, c.T.ahmad);
  eq(c.fail('cor.get', { id: d.id }, c.T.sara).code, 'NOT_FOUND', 'not yet a participant');
  truthy(c.fail('cor.submit', { id: d.id }, c.T.ahmad).message.includes('اختر السلسلة'));
  const g = c.ok('cor.submit', { id: d.id, templateId: t.id, note: 'عاجلة' }, c.T.ahmad);
  eq([g.letter.status, g.letter.locked, g.workflow.status, g.workflow.current.name], ['in_review', true, 'running', 'مراجعة المدير المباشر']);
  eq(g.workflow.steps.map((s) => [s.status, s.assignees.map((a) => a.name)]), [['current', ['سارة']], ['pending', []], ['pending', []]]);
  eq(g.letter.wf.dots, ['current', 'pending', 'pending']);
  // مقفل وهو قيد الإجراء
  truthy(c.fail('cor.save', { id: d.id, typeId: c.memo.id, subject: 'x', date: SUN }, c.T.ahmad).message.includes('قيد الإجراء'));
  truthy(c.fail('cor.file.upload', { letterId: d.id, role: 'main', fileName: 'v2.pdf', mimeType: 'application/pdf', data: PDF }, c.T.ahmad).message.includes('قيد الإجراء'));
  truthy(c.fail('cor.status', { id: d.id, status: 'sent' }, c.T.ahmad).message.includes('السلسلة'));
  truthy(c.fail('cor.status', { id: d.id, status: 'approved' }, c.T.huda).message.includes('السلسلة'));
  // سارة بلا دور في المستندات: تراه وتجده في صندوقها مع إشعار
  const s = c.ok('cor.get', { id: d.id }, c.T.sara);
  eq([s.workflow.can.act, s.can.edit, s.can.attach, s.main.fileName.endsWith('m.pdf')], [true, false, true, true]);
  const item = c.inbox(c.T.sara)[0];
  eq([item.title, item.approveLabel, item.link], [d.number + ' · مذكرة شراء طابعة', 'تمت المراجعة', '/correspondence/' + d.id]);
  truthy(c.notes(c.T.sara).some((n) => n.kind === 'approval' && n.detail.includes(d.number)));
  eq(c.inbox(c.T.huda).length, 0, 'the next step is not visible before its turn');
  eq(c.fail('wf.act', { instanceId: g.workflow.id, action: 'approve' }, c.T.huda).code, 'FORBIDDEN', 'not her step yet');
  // صاحب المرحلة يرفق ملفاً، ثم يعتمد من الصندوق
  c.ok('cor.file.upload', { letterId: d.id, fileName: 'ملاحظات.pdf', mimeType: 'application/pdf', data: PDF }, c.T.sara);
  c.ok('inbox.decide', { kind: 'wf.step', id: g.workflow.id, approve: true }, c.T.sara);
  eq(c.inbox(c.T.huda).map((x) => x.status), ['اعتماد']);
  c.ok('wf.act', { instanceId: g.workflow.id, action: 'approve', note: 'موافق' }, c.T.huda);
  const done = c.ok('cor.get', { id: d.id }, c.T.ahmad);
  eq([done.letter.status, done.letter.locked, !!done.letter.lockedAt, done.workflow.status], ['approved', true, true, 'approved']);
  eq(done.workflow.steps.map((x) => x.status), ['done', 'done', 'done']);
  eq(done.workflow.actions.map((a) => a.action), ['start', 'approve', 'approve', 'inform']);
  eq(done.workflow.actions[2].note, 'موافق');
  truthy(done.log.some((x) => x.kind === 'chain' && x.body.includes('اعتُمد')));
  truthy(c.notes(c.T.ahmad).some((n) => n.title === 'اعتُمد مستندك'));
  truthy(c.notes(c.T.ahmad).some((n) => n.title === 'مستند للاطلاع'), 'the inform step reaches the clerks');
  eq(c.ok('cor.get', { id: d.id }, c.T.sara).letter.number, d.number, 'past participants keep access');
  // المعتمد مقفل: لا تعديل ولا ملفات، والإرسال مسموح، والفتح للتعديل لمدير المستندات بسبب
  truthy(c.fail('cor.save', { id: d.id, typeId: c.memo.id, subject: 'x', date: SUN }, c.T.ahmad).message.includes('مقفل'));
  truthy(c.fail('cor.file.upload', { letterId: d.id, fileName: 'a.pdf', mimeType: 'application/pdf', data: PDF }, c.T.ahmad).message.includes('مقفل'));
  truthy(c.fail('cor.status', { id: d.id, status: 'draft' }, c.T.huda).message.includes('افتحه'));
  eq(c.fail('cor.reopen', { id: d.id, note: 'x' }, c.T.ahmad).code, 'FORBIDDEN');
  truthy(c.fail('cor.reopen', { id: d.id }, c.T.huda).message.includes('سبب'));
  const re = c.ok('cor.reopen', { id: d.id, note: 'تعديل السعر' }, c.T.huda);
  eq([re.letter.status, re.letter.locked, re.can.modify, re.submit && re.submit.templates.length], ['draft', false, true, 1], 'reopened: editable again');
  eq(c.ok('cor.get', { id: d.id }, c.T.ahmad).can.modify, true);
  c.ok('cor.submit', { id: d.id, templateId: t.id }, c.T.ahmad);
  eq(c.ok('cor.get', { id: d.id }, c.T.ahmad).workflow.actions.map((a) => a.action), ['start'], 'a new chain after reopening');
});

test('workflow: return for edits, ask and answer, and resubmitting resumes at the same step', () => {
  const c = setup();
  const t = c.tpl();
  const d = c.doc();
  const inst = c.ok('cor.submit', { id: d.id, templateId: t.id }, c.T.ahmad).workflow.id;
  truthy(c.fail('wf.act', { instanceId: inst, action: 'ask' }, c.T.sara).message.includes('سؤال'));
  c.ok('wf.act', { instanceId: inst, action: 'ask', note: 'ما الميزانية؟' }, c.T.sara);
  eq(c.inbox(c.T.sara).length, 0, 'while asking, the step leaves the inbox');
  truthy(c.fail('wf.act', { instanceId: inst, action: 'approve' }, c.T.sara).message.includes('إيضاح'));
  truthy(c.notes(c.T.ahmad).some((n) => n.title.includes('استيضاح') && n.detail.includes('ما الميزانية؟')));
  eq(c.ok('cor.get', { id: d.id }, c.T.ahmad).workflow.can.answer, true);
  eq(c.fail('wf.act', { instanceId: inst, action: 'answer', note: 'x' }, c.T.huda).code, 'FORBIDDEN');
  c.ok('wf.act', { instanceId: inst, action: 'answer', note: '300 د.ك' }, c.T.ahmad);
  truthy(c.notes(c.T.sara).some((n) => n.title.includes('الاستيضاح')));
  eq(c.inbox(c.T.sara).length, 1);
  // الإعادة من الصندوق تتطلب سبباً
  truthy(c.fail('inbox.decide', { kind: 'wf.step', id: inst, approve: false }, c.T.sara).message.includes('المطلوب تعديله'));
  c.ok('inbox.decide', { kind: 'wf.step', id: inst, approve: false, note: 'أضف عرض سعر' }, c.T.sara);
  const r = c.ok('cor.get', { id: d.id }, c.T.ahmad);
  eq([r.letter.status, r.letter.locked, r.can.modify, r.workflow.status, r.submit.resubmit], ['returned', false, true, 'returned', true]);
  eq(r.workflow.steps.map((s) => s.status), ['returned', 'pending', 'pending']);
  truthy(c.notes(c.T.ahmad).some((n) => n.title.includes('للتعديل') && n.detail.includes('أضف عرض سعر')));
  c.ok('cor.save', { id: d.id, typeId: c.memo.id, subject: 'مذكرة شراء طابعة مع عرض السعر', date: SUN }, c.T.ahmad);
  c.ok('cor.file.upload', { letterId: d.id, role: 'main', fileName: 'v2.pdf', mimeType: 'application/pdf', data: PDF }, c.T.ahmad);
  const back = c.ok('cor.submit', { id: d.id, note: 'أُضيف العرض' }, c.T.ahmad);
  eq([back.letter.status, back.workflow.status, back.workflow.current.name], ['in_review', 'running', 'مراجعة المدير المباشر']);
  eq(back.workflow.actions.map((a) => [a.action, a.version]).slice(-2), [['return', 0], ['resubmit', 1]], 'actions record the document version');
  eq(c.inbox(c.T.sara).length, 1);
});

test('workflow: rejecting ends the chain unless the step sends it back to the creator', () => {
  const c = setup();
  const t = c.tpl();
  const d = c.doc();
  const inst = c.ok('cor.submit', { id: d.id, templateId: t.id }, c.T.ahmad).workflow.id;
  truthy(c.fail('wf.act', { instanceId: inst, action: 'reject' }, c.T.sara).message.includes('سبب الرفض'));
  c.ok('wf.act', { instanceId: inst, action: 'reject', note: 'غير ضروري' }, c.T.sara);
  const g = c.ok('cor.get', { id: d.id }, c.T.ahmad);
  eq([g.letter.status, g.workflow.status, g.workflow.steps.map((s) => s.status), g.submit], ['rejected', 'rejected', ['rejected', 'cancelled', 'cancelled'], null]);
  truthy(c.notes(c.T.ahmad).some((n) => n.title.includes('رفض')));
  eq(c.ok('cor.get', { id: d.id }, c.T.huda).can.reopen, true);
  // «عند الرفض: إعادة للمنشئ»
  const soft = c.ok('wf.template.save', { module: 'correspondence', name: 'مرنة', steps: [{ name: 'مراجعة', kind: 'review', assignee: { type: 'user', id: c.U.sara }, onReject: 'creator' }] }, c.T.huda).find((x) => x.name === 'مرنة');
  const d2 = c.doc(c.T.ahmad, 'مذكرة ثانية');
  const i2 = c.ok('cor.submit', { id: d2.id, templateId: soft.id }, c.T.ahmad).workflow.id;
  c.ok('wf.act', { instanceId: i2, action: 'reject', note: 'راجع الصياغة' }, c.T.sara);
  eq(c.ok('cor.get', { id: d2.id }, c.T.ahmad).letter.status, 'returned');
});

test('workflow: the creator never approves their own document; forward, reassign and cancel', () => {
  const c = setup();
  const t = c.ok('wf.template.save', { module: 'correspondence', name: 'اعتماد المدير', steps: [{ name: 'اعتماد', kind: 'approve', assignee: { type: 'role', role: 'manager' } }] }, c.T.huda).find((x) => x.name === 'اعتماد المدير');
  // هدى مديرة المستندات تنشئ مستنداً: تُستبعد، ولا مدير لها ولا مدير مستندات غيرها، فيُسند لمدير النظام
  const d = c.doc(c.T.huda, 'مذكرة من المديرة');
  const g = c.ok('cor.submit', { id: d.id, templateId: t.id }, c.T.huda);
  eq([g.workflow.steps[0].assignees.map((a) => a.name), g.workflow.steps[0].fallback], [['مدير النظام'], true]);
  // الإحالة: لا تُحال إلى المنشئ في مرحلة اعتماد
  truthy(c.fail('wf.act', { instanceId: g.workflow.id, action: 'forward', toId: c.U.huda }, c.A).message.includes('منشئ'));
  c.ok('wf.act', { instanceId: g.workflow.id, action: 'forward', toId: c.U.sara, note: 'للاختصاص' }, c.A);
  eq(c.inbox(c.T.sara).length, 1);
  truthy(c.notes(c.T.sara).some((n) => n.kind === 'approval'));
  // إعادة الإسناد للمدير بسبب، والمنشئ يلغي قبل أي اعتماد
  const d2 = c.doc(c.T.ahmad, 'مذكرة للإلغاء');
  const i2 = c.ok('cor.submit', { id: d2.id, templateId: t.id }, c.T.ahmad).workflow.id;
  eq(c.fail('wf.reassign', { instanceId: i2, toId: c.U.sara, note: 'إجازة' }, c.T.ahmad).code, 'FORBIDDEN');
  truthy(c.fail('wf.reassign', { instanceId: i2, toId: c.U.sara }, c.T.huda).message.includes('سبب'));
  eq(c.ok('wf.reassign', { instanceId: i2, toId: c.U.sara, note: 'هدى في إجازة' }, c.T.huda).steps[0].assignees.map((a) => a.name), ['سارة']);
  truthy(c.fail('wf.cancel', { instanceId: i2 }, c.T.ahmad).message.includes('سبب'));
  c.ok('wf.cancel', { instanceId: i2, note: 'لم تعد مطلوبة' }, c.T.ahmad);
  const cg = c.ok('cor.get', { id: d2.id }, c.T.ahmad);
  eq([cg.letter.status, cg.letter.locked, cg.workflow.status], ['draft', false, 'cancelled']);
  truthy(c.notes(c.T.sara).some((n) => n.title.includes('أُلغيت')));
  // بعد أول اعتماد لا يلغيها المنشئ
  const t2 = c.tpl();
  const d3 = c.doc();
  const i3 = c.ok('cor.submit', { id: d3.id, templateId: t2.id }, c.T.ahmad).workflow.id;
  c.ok('wf.act', { instanceId: i3, action: 'approve' }, c.T.sara);
  eq(c.fail('wf.cancel', { instanceId: i3, note: 'x' }, c.T.ahmad).code, 'FORBIDDEN');
  c.ok('wf.cancel', { instanceId: i3, note: 'إلغاء إداري' }, c.T.huda);
});

test('workflow: the type default chain, submit rules, and deleting a document removes its chains', () => {
  const c = setup();
  const t = c.tpl();
  truthy(c.fail('cor.type.save', { id: c.memo.id, name: c.memo.name, code: 'MEMO', direction: 'internal', templateId: 'nope' }, c.T.huda).message.includes('غير متاحة'));
  c.ok('cor.type.save', { id: c.memo.id, name: c.memo.name, code: 'MEMO', direction: 'internal', templateId: t.id }, c.T.huda);
  const d = c.doc();
  eq(c.ok('cor.get', { id: d.id }, c.T.ahmad).submit.defaultTemplateId, t.id);
  eq(c.ok('cor.submit', { id: d.id }, c.T.ahmad).workflow.templateName, 'اعتماد المذكرات', 'the type default chain');
  truthy(c.fail('cor.submit', { id: d.id }, c.T.ahmad).message.includes('المسودة'));
  // الوارد المستلم يُرسل للسلسلة أيضاً، والصادر المرسل لا
  const inc = c.ok('cor.save', { direction: 'in', subject: 'طلب جهة', party: 'وزارة', date: SUN }, c.T.ahmad);
  eq(c.ok('cor.submit', { id: inc.id, templateId: t.id }, c.T.ahmad).letter.status, 'in_review');
  const out = c.ok('cor.save', { direction: 'out', subject: 'صادر', party: 'جهة', date: SUN, status: 'sent' }, c.T.ahmad);
  truthy(c.fail('cor.submit', { id: out.id, templateId: t.id }, c.T.ahmad).message.includes('المسودة'));
  // القائمة تحمل ملخص السلسلة
  const row = c.ok('cor.list', { typeId: c.memo.id }, c.T.ahmad).find((x) => x.id === d.id);
  eq([row.wf.stepName, row.wf.assigneeNames, row.wf.done, row.wf.total, row.statusLabel], ['مراجعة المدير المباشر', ['سارة'], 0, 3, 'قيد الإجراء']);
  // الحذف النهائي
  c.ok('cor.remove', { id: d.id }, c.T.huda);
  eq(c.inbox(c.T.sara).length, 1, 'only the incoming letter is left');
  eq(c.fail('cor.get', { id: d.id }, c.T.sara).code, 'NOT_FOUND');
});
