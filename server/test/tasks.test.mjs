import { eq, test, truthy } from './harness.mjs';
import { company, at, SUN } from './phase1.test.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** سارة مديرة أحمد. هدى خارج الفريق. */
function setup() {
  const c = company(at(SUN, '07:00'));
  const users = c.ok('users.list', {}, c.A).users;
  const uid = (u) => users.find((x) => x.username === u).id;
  return { ...c, uid: { sara: uid('sara'), ahmad: uid('ahmad'), huda: uid('huda') }, makeMgr: (u) => c.ok('users.setRoles', { id: uid(u), roles: { tasks: 'manager' } }, c.A) };
}

test('tasks: everyone is a member; assign to self and team only; visibility', () => {
  const c = setup();
  eq(c.ok('auth.me', {}, c.T.ahmad).roles.tasks, 'member');
  const lk = c.ok('tsk.lookups', {}, c.T.sara);
  eq(lk.people.map((p) => p.name).sort(), ['أحمد', 'سارة'].sort(), 'sara assigns to herself and her team');
  const t = c.ok('tsk.save', { title: 'تصميم الشعار', assigneeId: c.uid.ahmad, dueDate: SUN, priority: 'high', checklist: ['مسودة', 'ألوان'] }, c.T.sara);
  eq([t.number, t.status, t.assigneeName, t.checklistTotal], ['T-0001', 'todo', 'أحمد', 2]);
  eq(c.fail('tsk.save', { title: 'x', assigneeId: c.uid.huda }, c.T.ahmad).code, 'FORBIDDEN');
  eq(c.fail('tsk.get', { id: t.id }, c.T.huda).code, 'NOT_FOUND', 'outsider cannot see');
  eq(c.ok('tsk.list', { view: 'mine' }, c.T.ahmad).length, 1);
  eq(c.ok('tsk.list', { view: 'team' }, c.T.sara).length, 1);
  eq(c.fail('tsk.list', { view: 'all' }, c.T.sara).code, 'FORBIDDEN');
  // المسؤول يعدّل الوصف فقط
  c.ok('tsk.save', { id: t.id, title: 'عنوان آخر', description: 'بالأزرق' }, c.T.ahmad);
  const g = c.ok('tsk.get', { id: t.id }, c.T.ahmad).task;
  eq([g.title, g.description], ['تصميم الشعار', 'بالأزرق']);
  // الإشارة في تعليق تجعل هدى متابعة فترى المهمة
  c.ok('tsk.comment.add', { taskId: t.id, body: 'هدى، راجعي الألوان', mentions: [c.uid.huda] }, c.T.sara);
  eq(c.ok('tsk.get', { id: t.id }, c.T.huda).task.watchers.map((w) => w.name), ['هدى']);
  eq(c.fail('tsk.status', { id: t.id, status: 'doing' }, c.T.huda).code, 'FORBIDDEN', 'watchers do not work on it');
  eq(c.fail('tsk.remove', { id: t.id }, c.T.sara).code, 'FORBIDDEN', 'delete is for task managers');
});

test('tasks: assignee "done" goes to review; reviewer approves or returns from the inbox', () => {
  const c = setup();
  const t = c.ok('tsk.save', { title: 'تقرير الشهر', assigneeId: c.uid.ahmad, dueDate: SUN }, c.T.sara);
  c.ok('tsk.status', { id: t.id, status: 'doing' }, c.T.ahmad);
  const r = c.ok('tsk.status', { id: t.id, status: 'done' }, c.T.ahmad);
  eq([r.status, r.review], ['review', true]);
  const card = c.ok('home.summary', {}, c.T.sara).cards.find((x) => x.kind === 'tsk.mine');
  eq(card.review, 1);
  const item = c.ok('inbox.list', {}, c.T.sara).find((x) => x.kind === 'tsk.review');
  truthy(item && item.title.includes('تقرير الشهر'));
  eq(c.ok('inbox.list', {}, c.T.ahmad).some((x) => x.kind === 'tsk.review'), false, 'assignee does not review own work');
  truthy(c.fail('inbox.decide', { kind: 'tsk.review', id: t.id, approve: false }, c.T.sara).message.includes('سبب'));
  c.ok('inbox.decide', { kind: 'tsk.review', id: t.id, approve: false, note: 'ينقص الجدول' }, c.T.sara);
  eq(c.ok('tsk.get', { id: t.id }, c.T.ahmad).task.status, 'doing');
  c.ok('tsk.status', { id: t.id, status: 'done' }, c.T.ahmad);
  c.ok('inbox.decide', { kind: 'tsk.review', id: t.id, approve: true }, c.T.sara);
  const d = c.ok('tsk.get', { id: t.id }, c.T.ahmad);
  eq(d.task.status, 'done');
  truthy(d.task.completedAt);
  truthy(d.comments.some((x) => x.kind === 'event' && x.body.includes('ينقص الجدول')));
  eq(c.fail('tsk.status', { id: t.id, status: 'doing' }, c.T.ahmad).code, 'FORBIDDEN', 'approved work is reopened by the reviewer');
  // مهمة أسندها لنفسه تُنجز مباشرة
  const own = c.ok('tsk.save', { title: 'ترتيب الملفات' }, c.T.ahmad);
  eq(c.ok('tsk.status', { id: own.id, status: 'done' }, c.T.ahmad).status, 'done');
});

test('tasks: weekly recurrence (managers only), checklist, subtasks, files, delete', () => {
  const c = setup();
  eq(c.fail('tsk.save', { title: 'جرد', dueDate: SUN, recurrence: { freq: 'weekly' } }, c.T.ahmad).code, 'FORBIDDEN');
  c.makeMgr('huda');
  eq(c.ok('tsk.lookups', {}, c.T.huda).people.length, 4, 'task manager assigns to everyone');
  const t = c.ok('tsk.save', { title: 'جرد المخزن', assigneeId: c.uid.huda, dueDate: SUN, recurrence: { freq: 'weekly' }, checklist: ['الرفوف'] }, c.T.huda);
  eq(t.recurrenceLabel, 'أسبوعية');
  const item = c.ok('tsk.get', { id: t.id }, c.T.huda).checklist[0];
  c.ok('tsk.check.save', { id: item.id, done: true }, c.T.huda);
  c.ok('tsk.check.save', { taskId: t.id, text: 'الثلاجة' }, c.T.huda);
  const done = c.ok('tsk.status', { id: t.id, status: 'done' }, c.T.huda);
  truthy(done.nextNumber);
  const next = c.ok('tsk.list', { view: 'mine' }, c.T.huda).find((x) => x.number === done.nextNumber);
  eq([next.dueDate, next.status, next.checklistDone, next.checklistTotal], ['2026-11-22', 'todo', 0, 2]);
  // إعادة الفتح والإنجاز لا تكرر الإنشاء
  c.ok('tsk.status', { id: t.id, status: 'doing' }, c.T.huda);
  c.ok('tsk.status', { id: t.id, status: 'done' }, c.T.huda);
  eq(c.ok('tsk.list', { view: 'mine' }, c.T.huda).filter((x) => x.title === 'جرد المخزن').length, 2);

  const sub = c.ok('tsk.save', { title: 'شراء ملصقات', parentId: next.id, linkedType: 'employee', linkedId: c.emp.ahmad.id }, c.T.huda);
  eq([sub.parentNumber, sub.linkedLabel], [next.number, 'أحمد']);
  truthy(c.fail('tsk.save', { title: 'أعمق', parentId: sub.id }, c.T.huda).message.includes('مستوى واحد'));
  const f = c.ok('tsk.file.upload', { taskId: next.id, fileName: 'صورة.png', mimeType: 'image/png', data: PNG }, c.T.huda);
  eq(c.ok('tsk.file.content', { id: f.id }, c.T.huda).data, PNG);
  const g = c.ok('tsk.get', { id: next.id }, c.T.huda);
  eq([g.subtasks.length, g.files.length, g.task.filesCount], [1, 1, 1]);
  c.ok('tsk.remove', { id: next.id }, c.T.huda);
  eq(c.fail('tsk.get', { id: sub.id }, c.T.huda).code, 'NOT_FOUND', 'subtasks removed with parent');
  truthy(c.ok('audit.list', {}, c.A).rows.some((r) => r.action === 'task.delete'));
});
