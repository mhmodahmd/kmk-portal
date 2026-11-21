/**
 * السلسلة — المرحلة 5: المراحل المتوازية، أنماط القرار (الكل/عدد)، التفويض، المدد بأيام العمل والتصعيد، والملخص البريدي.
 * أحمد موظف مستندات ومديرته المباشرة سارة، وهدى مديرة المستندات.
 */
import { eq, test, truthy } from './harness.mjs';
import { company, at, SUN } from './phase1.test.mjs';

function setup(startAt) {
  const c = company(startAt || at(SUN, '07:00'));
  const users = c.ok('users.list', {}, c.A).users;
  const uid = (u) => users.find((x) => x.username === u).id;
  c.ok('users.setRoles', { id: uid('ahmad'), roles: { correspondence: 'clerk' } }, c.A);
  c.ok('users.setRoles', { id: uid('huda'), roles: { attendance: 'hr', hr: 'hr', correspondence: 'manager' } }, c.A);
  const U = { sara: uid('sara'), ahmad: uid('ahmad'), huda: uid('huda'), admin: uid('admin') };
  const memo = c.ok('cor.types', {}, c.T.huda).find((t) => t.code === 'MEMO');
  const tpl = (name, steps) => c.ok('wf.template.save', { module: 'correspondence', name, steps }, c.T.huda).find((t) => t.name === name);
  const send = (tok, templateId, subject = 'مذكرة') => {
    const d = c.ok('cor.save', { typeId: memo.id, subject, date: SUN }, tok);
    return { d, inst: c.ok('cor.submit', { id: d.id, templateId }, tok).workflow.id };
  };
  const view = (id, tok = c.T.ahmad) => c.ok('cor.get', { id }, tok).workflow;
  const inbox = (tok) => c.ok('inbox.list', {}, tok).filter((x) => x.kind === 'wf.step');
  return { ...c, U, memo, tpl, send, view, inbox };
}

test('workflow 5: parallel steps open together, the next group waits for all of them, and returning resumes the whole group', () => {
  const c = setup();
  const t = c.tpl('متوازية', [
    { name: 'مراجعة التصميم', kind: 'review', assignee: { type: 'user', id: c.U.sara } },
    { name: 'مراجعة المستندات', kind: 'review', assignee: { type: 'user', id: c.U.huda }, parallel: true },
    { name: 'اعتماد النظام', kind: 'approve', assignee: { type: 'user', id: c.U.admin } }
  ]);
  eq(t.steps.map((s) => s.group), [1, 1, 2]);
  const { d, inst } = c.send(c.T.ahmad, t.id);
  eq(c.view(d.id).steps.map((s) => [s.status, s.parallel]), [['current', true], ['current', true], ['pending', false]]);
  eq([c.inbox(c.T.sara).length, c.inbox(c.T.huda).length], [1, 1]);
  c.ok('wf.act', { instanceId: inst, action: 'approve' }, c.T.sara);
  eq(c.view(d.id).steps.map((s) => s.status), ['done', 'current', 'pending'], 'the group waits for its other step');
  // الإعادة من مرحلة في المجموعة تعيد المجموعة كلها
  c.ok('wf.act', { instanceId: inst, action: 'return', note: 'أكمل البيانات' }, c.T.huda);
  eq(c.view(d.id).steps.map((s) => s.status), ['done', 'returned', 'pending']);
  c.ok('cor.submit', { id: d.id }, c.T.ahmad);
  eq(c.view(d.id).steps.map((s) => s.status), ['done', 'current', 'pending']);
  c.ok('wf.act', { instanceId: inst, action: 'approve' }, c.T.huda);
  eq(c.view(d.id).steps.map((s) => s.status), ['done', 'done', 'current']);
  c.ok('wf.act', { instanceId: inst, action: 'approve' }, c.A);
  eq(c.ok('cor.get', { id: d.id }, c.T.ahmad).letter.status, 'approved');
});

test('workflow 5: decision modes — all of the role, or a set count — and validation', () => {
  const c = setup();
  c.ok('users.setRoles', { id: c.U.sara, roles: { correspondence: 'manager' } }, c.A);
  truthy(c.fail('wf.template.save', { module: 'correspondence', name: 'x', steps: [{ name: 'أ', kind: 'approve', assignee: { type: 'role', role: 'manager' }, mode: 'count', count: 1 }] }, c.T.huda).message.includes('بين 2'));
  truthy(c.fail('wf.template.save', { module: 'correspondence', name: 'x', steps: [{ name: 'أ', kind: 'sign', assignee: { type: 'role', role: 'manager' }, mode: 'all' }] }, c.T.huda).message.includes('واحد'));
  const t = c.tpl('لجنة', [{ name: 'اعتماد اللجنة', kind: 'approve', assignee: { type: 'role', role: 'manager' }, mode: 'all' }]);
  const { d, inst } = c.send(c.T.ahmad, t.id);
  eq(c.view(d.id).steps[0].assignees.map((a) => a.name).sort(), ['سارة', 'هدى']);
  c.ok('wf.act', { instanceId: inst, action: 'approve' }, c.T.huda);
  const v = c.view(d.id);
  eq([v.status, v.steps[0].status, v.steps[0].approvals, v.steps[0].need, v.steps[0].assignees.find((a) => a.name === 'هدى').done], ['running', 'current', 1, 2, true]);
  eq(c.inbox(c.T.huda).length, 0, 'she already approved');
  eq(c.fail('wf.act', { instanceId: inst, action: 'approve' }, c.T.huda).code, 'FORBIDDEN');
  c.ok('wf.act', { instanceId: inst, action: 'approve' }, c.T.sara);
  eq(c.view(d.id).status, 'approved');
});

test('workflow 5: delegation lets a colleague act on your steps for a period, recorded on behalf of you', () => {
  const c = setup();
  const t = c.tpl('مراجعة', [{ name: 'مراجعة المدير المباشر', kind: 'review', assignee: { type: 'direct_manager' } }, { name: 'اعتماد', kind: 'approve', assignee: { type: 'role', role: 'manager' } }]);
  truthy(c.fail('wf.delegation.save', { toUserId: c.U.sara, from: SUN, to: '2026-11-18' }, c.T.sara).message.includes('غيرك'));
  truthy(c.fail('wf.delegation.save', { toUserId: c.U.huda, from: SUN, to: '2027-03-01' }, c.T.sara).message.includes('90'));
  truthy(c.fail('wf.delegation.save', { toUserId: c.U.huda, from: '2026-11-18', to: SUN }, c.T.sara).message.includes('قبل'));
  const mine = c.ok('wf.delegation.save', { toUserId: c.U.huda, from: SUN, to: '2026-11-18', reason: 'إجازة' }, c.T.sara);
  eq(mine.given.map((x) => [x.toName, x.current]), [['هدى', true]]);
  truthy(c.ok('notify.list', {}, c.T.huda).items.some((n) => n.title.includes('فوّضك')));
  const { d, inst } = c.send(c.T.ahmad, t.id);
  const item = c.inbox(c.T.huda)[0];
  truthy(item.who.includes('نيابةً عن سارة'), 'the delegate sees it in their inbox');
  eq(c.ok('cor.get', { id: d.id }, c.T.huda).workflow.current.onBehalfOfName, 'سارة');
  c.ok('wf.act', { instanceId: inst, action: 'approve' }, c.T.huda);
  const acts = c.view(d.id).actions;
  eq([acts[1].action, acts[1].byName, acts[1].onBehalfOfName], ['approve', 'هدى', 'سارة']);
  // لا يتسلسل: هدى تفوّض أحمد، فلا يرى مراحل سارة؛ والمنشئ لا يعتمد مستنده نيابةً
  c.ok('wf.delegation.save', { toUserId: c.U.ahmad, from: SUN, to: '2026-11-18' }, c.T.huda);
  eq(c.inbox(c.T.ahmad).length, 0, 'ahmad created it and the step is an approval');
  const second = c.send(c.T.huda, t.id, 'مذكرة هدى');
  eq(c.view(second.d.id, c.T.huda).steps[0].assignees.map((a) => a.name), ['هدى'], 'no manager: falls back to the manager role');
  eq(c.inbox(c.T.ahmad).map((x) => x.title.includes('مذكرة هدى')), [true], 'ahmad acts for huda on her review step');
  // الإنهاء
  const h = c.ok('wf.delegation.mine', {}, c.T.huda).given[0];
  c.ok('wf.delegation.end', { id: h.id }, c.T.huda);
  eq(c.inbox(c.T.ahmad).length, 0);
  eq(c.fail('wf.delegation.end', { id: mine.given[0].id }, c.T.ahmad).code, 'FORBIDDEN');
});

test('workflow 5: step deadlines count working days only, and late steps escalate: reminder, manager, then the fallback', () => {
  const THU = '2026-11-19';
  const c = setup(at(THU, '09:00'));
  const admin = () => c.ok('auth.login', { username: 'admin', password: 'admin1234' }).token;
  const t = c.tpl('بمدة', [{ name: 'تنفيذ', kind: 'execute', assignee: { type: 'user', id: c.U.ahmad }, slaHours: 24, workingDays: true, escalation: { notifyManager: true, reassignTo: c.U.admin } }]);
  eq([t.steps[0].slaHours, t.steps[0].workingDays, t.steps[0].escalation], [24, true, { notifyManager: true, reassignTo: c.U.admin }]);
  const { d } = c.send(c.T.huda, t.id, 'مهمة عاجلة');
  const step = c.view(d.id, c.T.huda).steps[0];
  eq(step.dueAt.slice(0, 16), new Date(at('2026-11-22', '09:00')).toISOString().slice(0, 16), 'Friday and Saturday (his days off) are skipped');
  c.clock.set(at('2026-11-22', '10:00'));
  c.ok('wf.sweep', {}, admin());
  truthy(c.ok('notify.list', {}, c.T.ahmad).items.some((n) => n.title.includes('تأخرت مرحلة')));
  eq(c.view(d.id, c.T.huda).steps[0].overdue, true);
  eq(c.ok('cor.list', {}, c.T.huda)[0].wf.overdue, true);
  c.ok('wf.sweep', {}, admin());
  eq(c.ok('notify.list', {}, c.T.ahmad).items.filter((n) => n.title.includes('تأخرت مرحلة')).length, 1, 'once per level');
  c.clock.set(at('2026-11-23', '11:00'));
  c.ok('wf.sweep', {}, admin());
  truthy(c.ok('notify.list', {}, c.T.sara).items.some((n) => n.title.includes('لدى أحد فريقك')), 'his direct manager is told');
  c.clock.set(at('2026-11-24', '11:00'));
  c.ok('wf.sweep', {}, admin());
  const v = c.view(d.id, c.T.huda);
  eq([v.steps[0].assignees.map((a) => a.name), v.steps[0].escalationLevel, v.actions.at(-1).action], [['مدير النظام'], 3, 'escalate']);
  eq(c.fail('wf.sweep', {}, c.T.huda).code, 'FORBIDDEN');
});

test('workflow 5: with the daily digest on, chain notifications skip email and one summary mail goes out per person', () => {
  const c = setup();
  const sara = c.ok('users.list', {}, c.A).users.find((u) => u.username === 'sara');
  c.ok('users.update', { id: sara.id, fullName: sara.fullName, email: 'sara@example.com', active: true }, c.A);
  const t = c.tpl('مراجعة', [{ name: 'مراجعة', kind: 'review', assignee: { type: 'user', id: c.U.sara } }]);
  eq(c.fail('wf.settings.save', { digest: true }, c.T.ahmad).code, 'FORBIDDEN');
  eq(c.ok('wf.settings.save', { digest: true }, c.T.huda), { digest: true });
  const before = c.srv.Db.view('core', 'MailQueue').length;
  c.send(c.T.ahmad, t.id, 'أولى');
  c.send(c.T.ahmad, t.id, 'ثانية');
  eq(c.srv.Db.view('core', 'MailQueue').length, before, 'no email per event');
  truthy(c.ok('notify.list', {}, c.T.sara).items.some((n) => n.kind === 'approval'), 'in-app notifications still arrive');
  c.srv.dailyMaintenance();
  const mails = c.gas.mail.concat(c.srv.Db.view('core', 'MailQueue')).filter((m) => (m.to || '') === 'sara@example.com' && String(m.subject || m.title || '').includes('مراحل'));
  eq(mails.length, 1);
});
