/**
 * السلسلة — المرحلة 3: شروط المراحل وتخطيها، قواعد التوجيه، سجل الإصدارات، والمحاكاة.
 * أحمد موظف مستندات ومديرته المباشرة سارة، وهدى مديرة المستندات.
 */
import { eq, test, truthy } from './harness.mjs';
import { company, at, SUN } from './phase1.test.mjs';

function setup() {
  const c = company(at(SUN, '07:00'));
  const users = c.ok('users.list', {}, c.A).users;
  const uid = (u) => users.find((x) => x.username === u).id;
  c.ok('users.setRoles', { id: uid('ahmad'), roles: { correspondence: 'clerk' } }, c.A);
  c.ok('users.setRoles', { id: uid('huda'), roles: { attendance: 'hr', hr: 'hr', correspondence: 'manager' } }, c.A);
  const U = { sara: uid('sara'), ahmad: uid('ahmad'), huda: uid('huda') };
  let memo = c.ok('cor.types', {}, c.T.huda).find((t) => t.code === 'MEMO');
  memo = c.ok('cor.type.save', { id: memo.id, name: memo.name, code: 'MEMO', direction: 'internal', fields: [{ label: 'المبلغ', kind: 'money' }, { label: 'الأولوية', kind: 'select', options: 'عادي، عاجل' }] }, c.T.huda).find((t) => t.code === 'MEMO');
  const AMOUNT = memo.id + ':f1', PRIORITY = memo.id + ':f2';
  const tpl = (name, steps) => c.ok('wf.template.save', { module: 'correspondence', name, steps }, c.T.huda).find((t) => t.name === name);
  const doc = (amount, subject = 'مذكرة') => c.ok('cor.save', { typeId: memo.id, subject, date: SUN, fields: { f1: amount } }, c.T.ahmad);
  return { ...c, U, memo, AMOUNT, PRIORITY, tpl, doc };
}

test('workflow 3: a step whose condition fails is skipped, and conditions are validated by field kind', () => {
  const c = setup();
  const t = c.tpl('حسب المبلغ', [
    { name: 'مراجعة', kind: 'review', assignee: { type: 'direct_manager' } },
    { name: 'اعتماد المدير للمبالغ الكبيرة', kind: 'approve', assignee: { type: 'role', role: 'manager' }, condition: { field: c.AMOUNT, op: 'gt', value: '5,000' } }
  ]);
  eq([t.steps[1].condition, t.steps[1].conditionLabel], [{ field: c.AMOUNT, op: 'gt', value: 5000000 }, 'مذكرة داخلية: المبلغ أكبر من 5,000.000 د.ك'], 'money stored in fils');
  truthy(c.fail('wf.template.save', { module: 'correspondence', name: 'x', steps: [{ name: 'أ', kind: 'review', assignee: { type: 'direct_manager' }, condition: { field: c.PRIORITY, op: 'gt', value: 'عاجل' } }] }, c.T.huda).message.includes('للأرقام'));
  truthy(c.fail('wf.template.save', { module: 'correspondence', name: 'x', steps: [{ name: 'أ', kind: 'review', assignee: { type: 'direct_manager' }, condition: { field: 'nope', op: 'eq', value: '1' } }] }, c.T.huda).message.includes('حقل الشرط'));
  truthy(c.fail('wf.template.save', { module: 'correspondence', name: 'x', steps: [{ name: 'أ', kind: 'review', assignee: { type: 'direct_manager' }, condition: { field: c.PRIORITY, op: 'eq', value: 'متوسط' } }] }, c.T.huda).message.includes('قائمة'));
  const small = c.doc('1000');
  const s = c.ok('cor.submit', { id: small.id, templateId: t.id }, c.T.ahmad);
  c.ok('wf.act', { instanceId: s.workflow.id, action: 'approve' }, c.T.sara);
  const g = c.ok('cor.get', { id: small.id }, c.T.ahmad);
  eq([g.letter.status, g.workflow.steps.map((x) => x.status)], ['approved', ['done', 'skipped']]);
  truthy(g.workflow.actions.some((a) => a.action === 'skip'));
  const big = c.doc('9000');
  const b = c.ok('cor.submit', { id: big.id, templateId: t.id }, c.T.ahmad);
  c.ok('wf.act', { instanceId: b.workflow.id, action: 'approve' }, c.T.sara);
  eq(c.ok('cor.get', { id: big.id }, c.T.ahmad).workflow.current.name, 'اعتماد المدير للمبالغ الكبيرة');
});

test('workflow 3: routing rules pick the chain by type, field value and priority; only the manager edits them', () => {
  const c = setup();
  const step = [{ name: 'مراجعة', kind: 'review', assignee: { type: 'direct_manager' } }];
  const small = c.tpl('مذكرات صغيرة', step), large = c.tpl('مذكرات كبيرة', step), urgent = c.tpl('عاجلة', step);
  eq(c.fail('wf.rules', { module: 'correspondence' }, c.T.ahmad).code, 'FORBIDDEN');
  c.ok('wf.rule.save', { module: 'correspondence', name: 'الكبيرة', typeId: c.memo.id, field: c.AMOUNT, op: 'gte', value: '10000', templateId: large.id }, c.T.huda);
  let rules = c.ok('wf.rule.save', { module: 'correspondence', name: 'كل المذكرات', typeId: c.memo.id, templateId: small.id }, c.T.huda);
  eq(rules.map((r) => [r.name, r.priority, r.summary]), [['الكبيرة', 1, 'النوع: مذكرة داخلية · مذكرة داخلية: المبلغ أكبر من أو يساوي 10,000.000 د.ك'], ['كل المذكرات', 2, 'النوع: مذكرة داخلية']]);
  truthy(c.fail('wf.rule.save', { module: 'correspondence', templateId: 'nope' }, c.T.huda).message.includes('سلسلة منشورة'));
  const d1 = c.doc('20000', 'شراء سيارة'), d2 = c.doc('100', 'شراء أقلام');
  const opt = c.ok('cor.get', { id: d1.id }, c.T.ahmad).submit;
  eq([opt.defaultTemplateId, opt.defaultSource, opt.ruleName], [large.id, 'rule', 'الكبيرة']);
  eq(c.ok('cor.submit', { id: d1.id }, c.T.ahmad).workflow.templateName, 'مذكرات كبيرة');
  eq(c.ok('cor.submit', { id: d2.id }, c.T.ahmad).workflow.templateName, 'مذكرات صغيرة');
  // الأولوية: «كل المذكرات» أولاً يغلب الكبيرة
  rules = c.ok('wf.rule.move', { id: rules[1].id, dir: 'up' }, c.T.huda);
  eq(rules.map((r) => r.name), ['كل المذكرات', 'الكبيرة']);
  eq(c.ok('cor.get', { id: c.doc('50000').id }, c.T.ahmad).submit.defaultTemplateId, small.id);
  // القاعدة الموقوفة لا تُطبَّق، وقاعدة الحقل القائمة
  c.ok('wf.rule.save', { id: rules[0].id, name: 'كل المذكرات', typeId: c.memo.id, templateId: small.id, active: false }, c.T.huda);
  c.ok('wf.rule.save', { module: 'correspondence', name: 'العاجلة', field: c.PRIORITY, op: 'eq', value: 'عاجل', templateId: urgent.id }, c.T.huda);
  const d3 = c.ok('cor.save', { typeId: c.memo.id, subject: 'عاجلة', date: SUN, fields: { f1: '10', f2: 'عاجل' } }, c.T.ahmad);
  eq(c.ok('cor.get', { id: d3.id }, c.T.ahmad).submit.defaultTemplateId, urgent.id);
  // بلا قاعدة منطبقة: سلسلة النوع الافتراضية
  c.ok('cor.type.save', { id: c.memo.id, name: c.memo.name, code: 'MEMO', direction: 'internal', templateId: small.id, fields: c.memo.fields }, c.T.huda);
  eq(c.ok('cor.get', { id: c.doc('10').id }, c.T.ahmad).submit.defaultSource, 'type');
  rules = c.ok('wf.rule.remove', { id: c.ok('wf.rules', { module: 'correspondence' }, c.T.huda)[0].id }, c.T.huda);
  eq(rules.length, 2);
});

test('workflow 3: template versions keep their steps and how many documents used each', () => {
  const c = setup();
  const t = c.tpl('مراجعة', [{ name: 'مراجعة', kind: 'review', assignee: { type: 'direct_manager' } }]);
  c.ok('cor.submit', { id: c.doc('1').id, templateId: t.id }, c.T.ahmad);
  c.ok('wf.template.save', { id: t.id, name: 'مراجعة', steps: [{ name: 'مراجعة', kind: 'review', assignee: { type: 'direct_manager' } }, { name: 'اعتماد', kind: 'approve', assignee: { type: 'role', role: 'manager' } }] }, c.T.huda);
  const v = c.ok('wf.template.versions', { id: t.id }, c.T.huda);
  eq(v.map((x) => [x.version, x.current, x.documents, x.steps.map((s) => s.name), x.savedByName]), [[2, true, 0, ['مراجعة', 'اعتماد'], 'هدى'], [1, false, 1, ['مراجعة'], 'هدى']]);
  eq(c.fail('wf.template.versions', { id: t.id }, c.T.ahmad).code, 'FORBIDDEN');
});

test('workflow 3: simulation shows the chain a document would take, its skipped steps and owners, without writing anything', () => {
  const c = setup();
  const t = c.tpl('حسب المبلغ', [
    { name: 'مراجعة', kind: 'review', assignee: { type: 'direct_manager' } },
    { name: 'اعتماد', kind: 'approve', assignee: { type: 'role', role: 'manager' }, condition: { field: c.AMOUNT, op: 'gt', value: '5000' } }
  ]);
  c.ok('wf.rule.save', { module: 'correspondence', name: 'المذكرات', typeId: c.memo.id, templateId: t.id }, c.T.huda);
  eq(c.fail('wf.simulate', { module: 'correspondence', typeId: c.memo.id }, c.T.ahmad).code, 'FORBIDDEN');
  const small = c.ok('wf.simulate', { module: 'correspondence', typeId: c.memo.id, createdBy: c.U.ahmad, fields: { f1: '100' } }, c.T.huda);
  eq([small.template.name, small.source, small.ruleName, small.steps.map((s) => [s.skipped, s.assignees])], ['حسب المبلغ', 'rule', 'المذكرات', [[false, ['سارة']], [true, []]]]);
  const big = c.ok('wf.simulate', { module: 'correspondence', typeId: c.memo.id, createdBy: c.U.huda, fields: { f1: '9000' } }, c.T.huda);
  eq(big.steps.map((s) => [s.skipped, s.assignees, s.fallback]), [[false, ['هدى'], true], [false, ['مدير النظام'], true]], 'huda has no manager; she cannot approve her own');
  eq(c.ok('wf.simulate', { module: 'correspondence', typeId: c.ok('cor.types', {}, c.T.huda).find((x) => x.code === 'DEC').id }, c.T.huda).source, 'none');
  eq(c.ok('cor.list', {}, c.T.huda).length, 0, 'nothing was written');
});
