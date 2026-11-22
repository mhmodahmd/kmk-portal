/**
 * السلسلة في كل النظام (docs/09): ربط طلبات الوحدات بسلاسل عامة، «مدير الشركة» والأدوار من كل الوحدات،
 * وأثر النتيجة في الوحدة، والمسار المدمج معروضاً مراحل.
 * أحمد في قسم التصميم ومديرته المباشرة سارة، وهدى الموارد البشرية، ومدير النظام هو «مدير الشركة».
 */
import { eq, test, truthy } from './harness.mjs';
import { company, at, SUN } from './phase1.test.mjs';

function setup() {
  const c = company(at(SUN, '07:00'));
  const users = c.ok('users.list', {}, c.A).users;
  const uid = (u) => users.find((x) => x.username === u).id;
  const U = { sara: uid('sara'), ahmad: uid('ahmad'), huda: uid('huda'), admin: uid('admin') };
  const sysTpl = (name, steps) => c.ok('wf.template.save', { module: 'system', name, steps }, c.A).find((t) => t.name === name);
  const leave = (from = '2026-11-22', to = '2026-11-23') => c.ok('hr.leave.request', { typeId: 'lt_annual', from, to, reason: 'سفر' }, c.T.ahmad);
  const inbox = (tok) => c.ok('inbox.list', {}, tok);
  return { ...c, U, sysTpl, leave, inbox };
}

test('everywhere: company manager and roles from any module in system chains; bindings are for the system admin', () => {
  const c = setup();
  const steps = [{ name: 'المدير المباشر', kind: 'approve', assignee: { type: 'direct_manager' } }, { name: 'مدير الشركة', kind: 'approve', assignee: { type: 'company_manager' } }];
  truthy(c.fail('wf.template.save', { module: 'system', name: 'إجازات', steps }, c.A).message.includes('مدير الشركة'), 'needs the company manager first');
  c.ok('settings.update', { company: { name: 'كي ام كي', managerUserId: c.U.admin } }, c.A);
  eq(c.ok('settings.get', {}, c.A).company.managerUserId, c.U.admin);
  eq(c.fail('wf.template.save', { module: 'system', name: 'إجازات', steps }, c.T.huda).code, 'FORBIDDEN', 'system chains are for the system admin');
  const t = c.sysTpl('إجازات', steps);
  eq(t.steps.map((s) => s.assigneeLabel), ['المدير المباشر للمنشئ', 'مدير الشركة (مدير النظام)']);
  const hrRole = c.sysTpl('بالموارد البشرية', [{ name: 'الموارد البشرية', kind: 'approve', assignee: { type: 'role', role: 'hr|hr' } }]);
  eq(hrRole.steps[0].assigneeLabel, 'الموارد البشرية · الموارد البشرية');
  truthy(c.fail('wf.template.save', { module: 'system', name: 'x', steps: [{ name: 'أ', kind: 'approve', assignee: { type: 'role', role: 'hr|boss' } }] }, c.A).message.includes('الدور'));
  truthy(c.fail('wf.template.save', { module: 'system', name: 'x', steps: [{ name: 'أ', kind: 'sign', assignee: { type: 'company_manager' } }] }, c.A).message.includes('التوقيع'));
  const lk = c.ok('wf.lookups', { module: 'system' }, c.A);
  truthy(lk.roles.some((r) => r.id === 'custody|accountant') && lk.assignees.some((a) => a.id === 'company_manager'));
  eq(lk.conditionFields.map((f) => f.key), ['$dept', 'hr.leave:type', 'hr.leave:days', 'hr.overtime:minutes', 'att.correction:kind', 'tsk.review:priority', 'cus.request:amount', 'cus.voucher:type', 'cus.voucher:amount', 'cus.voucher:opening', 'cus.close:spent']);
  // الربط
  eq(c.fail('wf.bindings', {}, c.T.huda).code, 'FORBIDDEN');
  eq(c.ok('wf.bindings', {}, c.A).map((b) => [b.requestType, b.templateId, b.builtin]), [
    ['hr.leave', '', 'المدير المباشر ← الموارد البشرية'], ['hr.overtime', '', 'المدير المباشر أو الموارد البشرية'], ['att.correction', '', 'المدير المباشر أو الموارد البشرية'], ['tsk.review', '', 'من أسند المهمة'],
    ['cus.request', '', 'المحاسب يفتح العهدة مباشرة'], ['cus.voucher', '', 'رابط توقيع المدير'], ['cus.close', '', 'رابط توقيع المدير على الكشف']
  ]);
  const doc = c.ok('wf.template.save', { module: 'correspondence', name: 'مستندات', steps: [{ name: 'أ', kind: 'review', assignee: { type: 'direct_manager' } }] }, c.A)[0];
  truthy(c.fail('wf.binding.save', { requestType: 'hr.leave', templateId: doc.id }, c.A).message.includes('عامة'));
  truthy(c.fail('wf.binding.save', { requestType: 'cor', templateId: t.id }, c.A).message.includes('غير معروف'));
  eq(c.ok('wf.binding.save', { requestType: 'hr.leave', templateId: t.id }, c.A)[0].templateName, 'إجازات');
  truthy(c.ok('audit.list', { module: 'workflow' }, c.A).rows.some((r) => r.action === 'wf.binding'));
});

test('everywhere: a bound leave goes to the direct manager then the company manager, and is approved in HR', () => {
  const c = setup();
  c.ok('settings.update', { company: { name: 'كي ام كي', managerUserId: c.U.admin } }, c.A);
  const t = c.sysTpl('إجازات', [{ name: 'المدير المباشر', kind: 'approve', assignee: { type: 'direct_manager' } }, { name: 'مدير الشركة', kind: 'approve', assignee: { type: 'company_manager' } }]);
  c.ok('wf.binding.save', { requestType: 'hr.leave', templateId: t.id }, c.A);
  const r = c.leave();
  eq([r.status, !!r.wfInstanceId], ['in_chain', true]);
  const my = c.ok('hr.me', {}, c.T.ahmad);
  const v = my.leaves.find((x) => x.id === r.id);
  eq([v.statusLabel, v.wf.stepName, v.wf.assigneeNames, v.steps], ['قيد الإجراء في السلسلة', 'المدير المباشر', ['سارة'], []]);
  eq(my.balances.find((b) => b.typeId === 'lt_annual').pending, 2, 'held from the balance while in the chain');
  // في صندوق سارة من السلسلة فقط، ولا يظهر في صندوق الموارد البشرية بالمسار القديم
  eq(c.inbox(c.T.sara).filter((x) => x.kind === 'hr.leave').length, 0);
  const item = c.inbox(c.T.sara).find((x) => x.kind === 'wf.step');
  eq([item.title, item.link.startsWith('/chain/')], ['إجازة سنوية · 2 يوم · أحمد · 22/11/2026 – 23/11/2026', true]);
  eq(c.inbox(c.T.huda).filter((x) => x.kind === 'hr.leave').length, 0);
  truthy(c.fail('hr.leave.decide', { id: r.id, approve: true }, c.T.huda).message.includes('مسبقاً'), 'the old path cannot decide a chained leave');
  // صفحة السلسلة العامة
  const g = c.ok('wf.get', { instanceId: r.wfInstanceId }, c.T.ahmad);
  eq([g.entity.moduleLabel, g.entity.link, g.chain.steps.map((s) => s.status)], ['إجازة', '/hr/leave', ['current', 'pending']]);
  eq(c.ok('wf.get', { instanceId: r.wfInstanceId }, c.T.huda).entity.link, '/hr/requests', 'HR sees it from its module');
  c.ok('inbox.decide', { kind: 'wf.step', id: r.wfInstanceId, approve: true }, c.T.sara);
  eq(c.ok('wf.get', { instanceId: r.wfInstanceId }, c.T.sara).chain.steps.map((s) => s.status), ['done', 'current']);
  c.ok('wf.act', { instanceId: r.wfInstanceId, action: 'approve', note: 'موافق' }, c.A);
  const done = c.ok('hr.me', {}, c.T.ahmad);
  const dv = done.leaves.find((x) => x.id === r.id);
  eq([dv.status, dv.decisionNote, done.balances.find((b) => b.typeId === 'lt_annual').used], ['approved', 'اعتُمد في السلسلة «إجازات»: موافق', 2]);
  truthy(c.ok('notify.list', {}, c.T.ahmad).items.some((n) => n.title === 'اعتُمد طلبك'));
});

test('everywhere: return and resubmit, cancel by the employee, and rejection reach the HR record', () => {
  const c = setup();
  const t = c.sysTpl('مراجعة', [{ name: 'المدير المباشر', kind: 'approve', assignee: { type: 'direct_manager' }, onReject: 'creator' }]);
  c.ok('wf.binding.save', { requestType: 'hr.leave', templateId: t.id }, c.A);
  const r = c.leave();
  c.ok('wf.act', { instanceId: r.wfInstanceId, action: 'reject', note: 'غيّر التاريخ' }, c.T.sara);
  let v = c.ok('hr.me', {}, c.T.ahmad).leaves.find((x) => x.id === r.id);
  eq([v.status, v.decisionNote], ['returned', 'غيّر التاريخ']);
  const g = c.ok('wf.get', { instanceId: r.wfInstanceId }, c.T.ahmad);
  eq(g.entity.canResubmit, true);
  eq(c.fail('wf.resubmit', { instanceId: r.wfInstanceId }, c.T.sara).code, 'FORBIDDEN');
  c.ok('wf.resubmit', { instanceId: r.wfInstanceId, note: 'التاريخ مناسب للفريق' }, c.T.ahmad);
  eq(c.ok('hr.me', {}, c.T.ahmad).leaves.find((x) => x.id === r.id).status, 'in_chain');
  c.ok('hr.leave.cancel', { id: r.id }, c.T.ahmad);
  v = c.ok('hr.me', {}, c.T.ahmad).leaves.find((x) => x.id === r.id);
  eq([v.status, c.ok('wf.get', { instanceId: r.wfInstanceId }, c.T.ahmad).chain.status], ['cancelled', 'cancelled']);
  // الرفض النهائي (مرحلة بلا إعادة)
  const hard = c.sysTpl('صارمة', [{ name: 'المدير المباشر', kind: 'approve', assignee: { type: 'direct_manager' } }]);
  c.ok('wf.binding.save', { requestType: 'hr.leave', templateId: hard.id }, c.A);
  const r2 = c.leave('2026-11-29', '2026-11-29');
  c.ok('wf.act', { instanceId: r2.wfInstanceId, action: 'reject', note: 'ضغط عمل' }, c.T.sara);
  v = c.ok('hr.me', {}, c.T.ahmad).leaves.find((x) => x.id === r2.id);
  eq([v.status, v.decisionNote], ['rejected', 'ضغط عمل']);
  // فك الربط: الطلب الجديد على المسار المدمج، بمراحله
  c.ok('wf.binding.save', { requestType: 'hr.leave', templateId: '' }, c.A);
  const r3 = c.leave('2026-12-06', '2026-12-06');
  eq(r3.status, 'pending_manager');
  v = c.ok('hr.me', {}, c.T.ahmad).leaves.find((x) => x.id === r3.id);
  eq([v.wf, v.steps.map((s) => [s.name, s.status])], [null, [['المدير المباشر', 'current'], ['الموارد البشرية', 'pending']]]);
  c.ok('hr.leave.decide', { id: r3.id, approve: true, note: 'تمام' }, c.T.sara);
  v = c.ok('hr.me', {}, c.T.ahmad).leaves.find((x) => x.id === r3.id);
  eq(v.steps.map((s) => [s.status, s.actorName, s.note]), [['done', 'سارة', 'تمام'], ['current', '', '']]);
});

test('everywhere: routing rules per request type pick a chain by leave length', () => {
  const c = setup();
  c.ok('settings.update', { company: { name: 'كي ام كي', managerUserId: c.U.admin } }, c.A);
  const short = c.sysTpl('قصيرة', [{ name: 'المدير المباشر', kind: 'approve', assignee: { type: 'direct_manager' } }]);
  const long = c.sysTpl('طويلة', [{ name: 'المدير المباشر', kind: 'approve', assignee: { type: 'direct_manager' } }, { name: 'مدير الشركة', kind: 'approve', assignee: { type: 'company_manager' } }]);
  c.ok('wf.binding.save', { requestType: 'hr.leave', templateId: short.id }, c.A);
  c.ok('wf.rule.save', { module: 'hr.leave', name: 'أكثر من 3 أيام', field: 'hr.leave:days', op: 'gt', value: '3', templateId: long.id }, c.A);
  eq(c.ok('wf.bindings', {}, c.A)[0].rules, 1);
  const a = c.leave('2026-11-22', '2026-11-23');
  const b = c.leave('2026-11-29', '2026-12-03');
  eq(c.ok('wf.get', { instanceId: a.wfInstanceId }, c.A).chain.templateName, 'قصيرة');
  eq(c.ok('wf.get', { instanceId: b.wfInstanceId }, c.A).chain.templateName, 'طويلة');
  const sim = c.ok('wf.simulate', { module: 'hr.leave', createdBy: c.U.ahmad, values: { 'hr.leave:days': 5 } }, c.A);
  eq([sim.template.name, sim.source, sim.steps.map((s) => s.assignees)], ['طويلة', 'rule', [['سارة'], ['مدير النظام']]]);
});

test('everywhere: overtime and attendance corrections through chains; the correction is applied on final approval', () => {
  const c = setup();
  const t = c.sysTpl('الموارد البشرية', [{ name: 'الموارد البشرية', kind: 'approve', assignee: { type: 'role', role: 'hr|hr' } }]);
  c.ok('wf.binding.save', { requestType: 'hr.overtime', templateId: t.id }, c.A);
  c.ok('wf.binding.save', { requestType: 'att.correction', templateId: t.id }, c.A);
  c.ok('att.punch', { kind: 'in' }, c.T.ahmad);
  const o = c.ok('hr.ot.request', { date: SUN, minutes: 60, reason: 'تسليم' }, c.T.ahmad);
  eq(o.status, 'in_chain');
  truthy(c.fail('hr.ot.request', { date: SUN, minutes: 30 }, c.T.ahmad).message.includes('مسبقاً'));
  c.ok('hr.ot.cancel', { id: o.id }, c.T.ahmad);
  eq(c.ok('hr.me', {}, c.T.ahmad).overtime.find((x) => x.id === o.id).status, 'cancelled');
  c.clock.set(at(SUN, '16:00'));
  const cr = c.ok('att.correction.request', { date: SUN, kind: 'missingOut', outTime: '15:00', reason: 'نسيت' }, c.T.ahmad);
  eq([cr.status, cr.wf.stepName], ['in_chain', 'الموارد البشرية']);
  eq(c.ok('inbox.list', {}, c.T.huda).filter((x) => x.kind === 'att.correction').length, 0, 'not in the old inbox');
  c.ok('inbox.decide', { kind: 'wf.step', id: cr.wfInstanceId, approve: true }, c.T.huda);
  const mine = c.ok('att.correction.mine', {}, c.T.ahmad).find((x) => x.id === cr.id);
  eq(mine.status, 'approved');
  const rec = c.srv.Db.view('attendance', 'Attendance').find((x) => x.date === SUN);
  eq([!!rec.outTs, rec.note], [true, 'تصحيح: نسيت'], 'the missing check-out was added to the day');
});

test('everywhere: task review through a chain — the assigner as a party, return and resubmit, then done', () => {
  const c = setup();
  c.ok('settings.update', { company: { name: 'كي ام كي', managerUserId: c.U.admin } }, c.A);
  const lk = c.ok('wf.lookups', { module: 'system' }, c.A);
  eq(lk.parties, [{ id: 'assigner', label: 'من أسند المهمة' }]);
  truthy(c.fail('wf.template.save', { module: 'system', name: 'x', steps: [{ name: 'أ', kind: 'approve', assignee: { type: 'party', key: 'boss' } }] }, c.A).message.includes('الطرف'));
  const t = c.sysTpl('مراجعة', [
    { name: 'من أسندها', kind: 'approve', assignee: { type: 'party', key: 'assigner' }, onReject: 'return' },
    { name: 'مدير الشركة', kind: 'approve', assignee: { type: 'company_manager' } }
  ]);
  eq(t.steps[0].assigneeLabel, 'من أسند المهمة');
  // غير مربوطة: المسار المدمج مرحلة واحدة «من أسندها»
  const free = c.ok('tsk.save', { title: 'قبل الربط', assigneeId: c.U.ahmad }, c.T.sara);
  const f = c.ok('tsk.status', { id: free.id, status: 'done' }, c.T.ahmad);
  eq([f.status, f.wf, f.steps.map((s) => [s.status, s.assignees])], ['review', null, [['current', ['سارة']]]]);
  eq(c.inbox(c.T.sara).filter((x) => x.kind === 'tsk.review').length, 1);

  c.ok('wf.binding.save', { requestType: 'tsk.review', templateId: t.id }, c.A);
  const task = c.ok('tsk.save', { title: 'تقرير الربع', assigneeId: c.U.ahmad }, c.T.sara);
  const v = c.ok('tsk.status', { id: task.id, status: 'done' }, c.T.ahmad);
  eq([v.status, v.review, v.wf.stepName, v.wf.assigneeNames, v.steps], ['review', true, 'من أسندها', ['سارة'], []]);
  const box = c.inbox(c.T.sara);
  eq([box.filter((x) => x.kind === 'tsk.review' && x.refId === task.id).length, box.filter((x) => x.kind === 'wf.step' && x.refId === v.wfInstanceId).length], [0, 1], 'from the chain only');
  truthy(c.fail('tsk.status', { id: task.id, status: 'done' }, c.T.sara).message.includes('السلسلة'), 'decided in the chain');
  truthy(c.fail('inbox.decide', { kind: 'tsk.review', id: task.id, approve: true }, c.T.sara).message.includes('السلسلة'));
  // إعادة للتعديل ← قيد العمل، ثم يرسلها المسؤول ثانية بنقلها «منجزة»
  c.ok('inbox.decide', { kind: 'wf.step', id: v.wfInstanceId, approve: false, note: 'أضف الملحق' }, c.T.sara);
  let g = c.ok('tsk.get', { id: task.id }, c.T.ahmad).task;
  eq([g.status, g.wf.status], ['doing', 'returned']);
  const again = c.ok('tsk.status', { id: task.id, status: 'done' }, c.T.ahmad);
  eq([again.status, again.wfInstanceId, again.wf.stepName], ['review', v.wfInstanceId, 'من أسندها'], 'same chain, back to the step that returned it');
  c.ok('inbox.decide', { kind: 'wf.step', id: v.wfInstanceId, approve: true }, c.T.sara);
  c.ok('inbox.decide', { kind: 'wf.step', id: v.wfInstanceId, approve: true }, c.A);
  g = c.ok('tsk.get', { id: task.id }, c.T.ahmad).task;
  eq([g.status, !!g.completedAt, g.wf.status], ['done', true, 'approved']);
  truthy(c.ok('notify.list', {}, c.T.ahmad).items.some((n) => n.title === 'اعتُمد طلبك') && !c.ok('notify.list', {}, c.T.ahmad).items.some((n) => n.title === 'اعتُمد إنجاز مهمتك'), 'one notification, from the chain');
  // الإلغاء ممن أسندها يلغي سلسلتها
  const t2 = c.ok('tsk.save', { title: 'ثانية', assigneeId: c.U.ahmad }, c.T.sara);
  const v2 = c.ok('tsk.status', { id: t2.id, status: 'done' }, c.T.ahmad);
  c.ok('tsk.status', { id: t2.id, status: 'cancelled', note: 'لم تعد مطلوبة' }, c.T.sara);
  eq([c.ok('tsk.get', { id: t2.id }, c.T.sara).task.status, c.ok('wf.get', { instanceId: v2.wfInstanceId }, c.T.sara).chain.status], ['cancelled', 'cancelled']);
});

test('everywhere: custody — request through a chain, the opening voucher and the close statement approved inside the system', () => {
  const c = setup();
  c.ok('users.setRoles', { id: c.U.huda, roles: { attendance: 'hr', hr: 'hr', custody: 'accountant' } }, c.A);
  c.ok('users.setRoles', { id: c.U.ahmad, roles: { custody: 'holder' } }, c.A);
  c.ok('settings.update', { company: { name: 'كي ام كي', managerUserId: c.U.admin } }, c.A);
  const mgr = c.sysTpl('المدير المباشر', [{ name: 'المدير المباشر', kind: 'approve', assignee: { type: 'direct_manager' } }]);
  const top = c.sysTpl('الإدارة', [{ name: 'مدير الشركة', kind: 'approve', assignee: { type: 'company_manager' } }]);
  const open = c.sysTpl('صرف عهدة', [{ name: 'مدير الشركة', kind: 'approve', assignee: { type: 'company_manager' } }]);
  c.ok('wf.binding.save', { requestType: 'cus.request', templateId: mgr.id }, c.A);
  c.ok('wf.binding.save', { requestType: 'cus.voucher', templateId: top.id }, c.A);
  c.ok('wf.binding.save', { requestType: 'cus.close', templateId: top.id }, c.A);
  c.ok('wf.rule.save', { module: 'cus.voucher', name: 'صرف العهد', field: 'cus.voucher:opening', op: 'eq', value: 'yes', templateId: open.id }, c.A);

  // الطلب: المدير المباشر قبل المحاسب
  const r = c.ok('cus.request.create', { amount: '100', reason: 'مشتريات' }, c.T.ahmad);
  eq([r.status, r.wf.stepName, r.wf.assigneeNames], ['in_chain', 'المدير المباشر', ['سارة']]);
  truthy(c.fail('cus.request.create', { amount: '50' }, c.T.ahmad).message.includes('بانتظار'));
  eq(c.inbox(c.T.huda).filter((x) => x.kind === 'cus.request').length, 0, 'not with the accountant yet');
  c.ok('inbox.decide', { kind: 'wf.step', id: r.wfInstanceId, approve: true }, c.T.sara);
  eq(c.ok('cus.request.list', {}, c.T.ahmad)[0].status, 'pending');
  eq(c.inbox(c.T.huda).filter((x) => x.kind === 'cus.request').length, 1, 'now with the accountant');

  // فتح العهدة: سند الصرف في سلسلته (قاعدة «صرف عهدة») بدل رابط المدير
  c.ok('inbox.decide', { kind: 'cus.request', id: r.id, approve: true }, c.T.huda);
  const cu = c.ok('cus.list', {}, c.T.huda).find((x) => x.employeeId === c.emp.ahmad.id);
  let g = c.ok('cus.get', { id: cu.id }, c.T.huda);
  eq([g.custody.stage, g.chains.openVoucher.wf.stepName, g.chains.openVoucher.canStart], ['awaiting_signature', 'مدير الشركة', false]);
  const pvId = g.custody.openVoucherId;
  eq(c.ok('wf.get', { instanceId: c.ok('cus.voucher.get', { id: pvId }, c.T.huda).voucher.chain.wf.instanceId }, c.A).chain.templateName, 'صرف عهدة', 'the opening voucher matched the rule');
  truthy(c.fail('cus.markSigned', { kind: 'voucher', id: pvId }, c.T.huda).message.includes('السلسلة'));
  truthy(c.fail('cus.sign.create', { kind: 'voucher', id: pvId }, c.T.huda).message.includes('السلسلة'));
  c.ok('inbox.decide', { kind: 'wf.step', id: g.chains.openVoucher.wf.instanceId, approve: true }, c.A);
  g = c.ok('cus.get', { id: cu.id }, c.T.ahmad);
  eq(g.custody.stage, 'disbursing');
  const box = c.ok('cus.voucher.get', { id: pvId }, c.T.huda).signs.find((s) => s.label === 'المدير');
  eq(box.name, 'مدير النظام', 'signed by whoever approved in the chain');

  // الإقفال: الرفض في السلسلة يبقيه بانتظار الإدارة، ويعيد المحاسب إرساله
  c.ok('cus.confirmReceipt', { id: cu.id }, c.T.ahmad);
  c.ok('cus.expense.save', { custodyId: cu.id, date: SUN, amount: '30', description: 'ضيافة', category: 'ضيافة وبوفيه', noAttachmentReason: 'فاتورة ورقية' }, c.T.ahmad);
  c.ok('cus.requestClose', { id: cu.id }, c.T.ahmad);
  c.ok('cus.approve', { id: cu.id, settlementMethod: 'carry' }, c.T.huda);
  g = c.ok('cus.get', { id: cu.id }, c.T.huda);
  const first = g.chains.statement.wf.instanceId;
  c.ok('inbox.decide', { kind: 'wf.step', id: first, approve: false, note: 'ناقص توقيع' }, c.A);
  g = c.ok('cus.get', { id: cu.id }, c.T.huda);
  eq([g.custody.status, g.chains.statement.wf.status, g.chains.statement.canStart], ['signing', 'returned', false]);
  c.ok('wf.resubmit', { instanceId: first, note: 'أُرفق' }, c.T.huda);
  // إلغاء السلسلة من المحاسب يعيده إلى المسار المدمج، ثم يرسله للسلسلة من جديد
  c.ok('wf.cancel', { instanceId: first, note: 'سنعيد الإرسال' }, c.T.huda);
  g = c.ok('cus.get', { id: cu.id }, c.T.huda);
  eq([g.custody.status, g.chains.statement.wf.status, g.chains.statement.canStart], ['signing', 'cancelled', true]);
  const again = c.ok('cus.chain.start', { kind: 'statement', id: cu.id }, c.T.huda).instanceId;
  truthy(again !== first);
  truthy(c.fail('cus.chain.start', { kind: 'statement', id: cu.id }, c.T.huda).message.includes('جارية'));
  c.ok('inbox.decide', { kind: 'wf.step', id: again, approve: true }, c.A);
  g = c.ok('cus.get', { id: cu.id }, c.T.ahmad);
  eq(g.custody.status, 'closed');
  eq(c.ok('cus.statement', { id: cu.id }, c.T.huda).signs.manager.name, 'مدير النظام');
});
