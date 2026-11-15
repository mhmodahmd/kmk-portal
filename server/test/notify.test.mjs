import { eq, test, truthy } from './harness.mjs';
import { company, at, SUN } from './phase1.test.mjs';

function setup() {
  const c = company(at(SUN, '07:00'));
  const users = c.ok('users.list', {}, c.A).users;
  const u = (n) => users.find((x) => x.username === n);
  const titles = (tok) => c.ok('notify.list', {}, tok).items.map((n) => n.title);
  return { ...c, u, titles };
}

test('notify: tasks — assignment, review request (once), comment, approval; never the actor', () => {
  const c = setup();
  const t = c.ok('tsk.save', { title: 'تصميم الغلاف', assigneeId: c.u('ahmad').id, dueDate: SUN, watchers: [c.u('huda').id] }, c.T.sara);
  eq(c.titles(c.T.ahmad), ['أسند إليك سارة مهمة']);
  eq(c.titles(c.T.huda), ['أضافك سارة متابعاً لمهمة']);
  eq(c.titles(c.T.sara), [], 'the actor is not notified');
  const first = c.ok('notify.list', {}, c.T.ahmad);
  eq([first.unread, first.items[0].link, first.items[0].detail], [1, '/tasks/' + t.id, t.number + ' · تصميم الغلاف']);

  c.ok('tsk.status', { id: t.id, status: 'done' }, c.T.ahmad);
  eq(c.titles(c.T.sara), ['بانتظار قرارك: مراجعة مهمة']);
  // تعليق على مهمة بانتظار المراجعة لا يكرر طلب المراجعة
  c.ok('tsk.comment.add', { taskId: t.id, body: 'جاهزة للمراجعة' }, c.T.ahmad);
  eq(c.titles(c.T.sara), ['علّق أحمد على مهمة', 'بانتظار قرارك: مراجعة مهمة']);
  eq(c.titles(c.T.huda)[0], 'علّق أحمد على مهمة');

  c.ok('inbox.decide', { kind: 'tsk.review', id: t.id, approve: true }, c.T.sara);
  eq(c.titles(c.T.ahmad)[0], 'اعتُمد إنجاز مهمتك');
});

test('notify: leave goes manager → HR → employee; read state', () => {
  const c = setup();
  const r = c.ok('hr.leave.request', { typeId: 'lt_annual', from: '2026-11-22', to: '2026-11-26', reason: 'سفر' }, c.T.ahmad);
  eq(c.titles(c.T.sara), ['بانتظار قرارك: الإجازات'], 'direct manager first');
  eq(c.titles(c.T.huda), [], 'HR waits for the manager');
  c.ok('hr.leave.decide', { id: r.id, approve: true }, c.T.sara);
  eq(c.titles(c.T.ahmad), ['وافق مديرك على إجازتك، وهي الآن لدى الموارد البشرية']);
  eq(c.titles(c.T.huda), ['بانتظار قرارك: الإجازات'], 'HR stage');
  truthy(c.titles(c.A).includes('بانتظار قرارك: الإجازات'), 'system admin sees HR approvals too');
  c.ok('hr.leave.decide', { id: r.id, approve: true }, c.T.huda);
  eq(c.titles(c.T.ahmad)[0], 'اعتُمدت إجازتك');

  eq(c.ok('notify.list', {}, c.T.ahmad).unread, 2);
  const one = c.ok('notify.list', {}, c.T.ahmad).items[1];
  c.ok('notify.read', { id: one.id }, c.T.ahmad);
  eq(c.ok('notify.list', {}, c.T.ahmad).unread, 1);
  c.ok('notify.read', { all: true }, c.T.ahmad);
  eq(c.ok('notify.list', {}, c.T.ahmad).unread, 0);
  eq(c.fail('notify.read', { id: one.id }, c.T.sara).code, 'NOT_FOUND', 'only your own');
  c.clock.advance(60_000);
  c.ok('tsk.save', { title: 'أخرى', assigneeId: c.u('ahmad').id }, c.T.sara);
  eq(c.ok('notify.list', {}, c.T.ahmad).unread, 1, 'new after mark-all is unread');
});

test('notify: email is queued inside the request and sent by the minute trigger', () => {
  const c = setup();
  const ah = c.u('ahmad');
  c.ok('users.update', { id: ah.id, fullName: ah.fullName, email: 'ahmad@example.com', active: true }, c.A);
  c.ok('tsk.save', { title: 'مهمة ١', assigneeId: ah.id }, c.T.sara);
  eq(c.gas.mail.length, 0, 'nothing is sent inside the request');
  eq(c.srv.Db.view('core', 'MailQueue').length, 1, 'queued');
  eq(c.srv.processMailQueue(), 1, 'the trigger sends it');
  eq(c.gas.mail.length, 1);
  eq(c.srv.Db.view('core', 'MailQueue').length, 0, 'queue drained');
  eq([c.gas.mail[0].to, c.gas.mail[0].subject], ['ahmad@example.com', 'أسند إليك سارة مهمة — بوابة KMK']);
  truthy(c.gas.mail[0].htmlBody.includes('https://mhmodahmd.github.io/kmk-portal/#/tasks/'));
  const tok = c.T.ahmad;
  eq(c.ok('notify.list', {}, tok).email, { on: true, available: true, address: 'ahmad@example.com' });
  c.ok('notify.prefs', { email: false }, tok);
  c.ok('tsk.save', { title: 'مهمة ٢', assigneeId: ah.id }, c.T.sara);
  eq(c.srv.Db.view('core', 'MailQueue').length, 0, 'turned off: not even queued');
  eq(c.titles(tok).length, 2, 'still notified inside the portal');
});

test('notify: without the trigger, a stale queue is drained when someone polls notifications', () => {
  const c = setup();
  const ah = c.u('ahmad');
  c.ok('users.update', { id: ah.id, fullName: ah.fullName, email: 'ahmad@example.com', active: true }, c.A);
  c.ok('tsk.save', { title: 'مهمة', assigneeId: ah.id }, c.T.sara);
  c.ok('notify.list', {}, c.T.ahmad);
  eq(c.gas.mail.length, 0, 'fresh queue waits for the trigger');
  c.clock.advance(61_000);
  c.ok('notify.list', {}, c.T.ahmad);
  eq(c.gas.mail.length, 1, 'older than a minute: sent on poll');
});

test('notify: a failing message is retried twice then dropped; the rest still go out', () => {
  const c = setup();
  const ah = c.u('ahmad'), hu = c.u('huda');
  c.ok('users.update', { id: ah.id, fullName: ah.fullName, email: 'bad@example.com', active: true }, c.A);
  c.ok('users.update', { id: hu.id, fullName: hu.fullName, email: 'huda@example.com', active: true }, c.A);
  c.ok('tsk.save', { title: 'مهمة', assigneeId: ah.id, watchers: [hu.id] }, c.T.sara);
  eq(c.srv.Db.view('core', 'MailQueue').length, 2);
  const real = c.gas.globals.MailApp.sendEmail;
  c.gas.globals.MailApp.sendEmail = (o) => { if (o.to === 'bad@example.com') throw new Error('Invalid email'); real(o); };
  eq(c.srv.processMailQueue(), 1);
  eq(c.gas.mail.map((m) => m.to), ['huda@example.com']);
  eq(c.srv.Db.view('core', 'MailQueue').map((r) => r.attempts), [1], 'failed one stays with a retry count');
  eq(c.srv.processMailQueue(), 0);
  eq(c.srv.Db.view('core', 'MailQueue').map((r) => r.attempts), [2]);
  eq(c.srv.processMailQueue(), 0);
  eq(c.srv.Db.view('core', 'MailQueue').length, 0, 'dropped after the third failure');
});

test('notify: approval notices build the inbox for likely approvers only, not every user', () => {
  const c = setup();
  const seen = [];
  const inbox = c.srv.Hr.inbox_;
  c.srv.Hr.inbox_ = (ctx) => { seen.push(ctx.user.username); return inbox(ctx); };
  const r = c.ok('hr.leave.request', { typeId: 'lt_annual', from: '2026-11-22', to: '2026-11-26', reason: 'سفر' }, c.T.ahmad);
  truthy(seen.includes('sara') && seen.includes('huda') && seen.includes('admin'), 'manager, HR and the system admin are checked: ' + seen.join(','));
  truthy(!seen.includes('ahmad') && !seen.includes('khalid'), 'the requester and unrelated users are not: ' + seen.join(','));
  seen.length = 0;
  c.ok('hr.leave.cancel', { id: r.id }, c.T.ahmad);
  eq(seen, [], 'actions that cannot create an inbox item do not build any inbox');
  c.srv.Hr.inbox_ = inbox;
});

test('notify: events of a failed request are discarded, never notified', () => {
  const c = setup();
  c.srv.Notify.queue_({ id: 'x', fullName: 'x' }, 'tasks', 'task.create', 'Task', 'none', {});
  c.fail('tsk.save', { title: '' }, c.T.sara);
  eq(c.ok('notify.list', {}, c.T.ahmad).items.length, 0);
});
