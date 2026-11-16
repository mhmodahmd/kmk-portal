import { eq, test, truthy } from './harness.mjs';
import { company, at, SUN } from './phase1.test.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** سارة موظفة مراسلات، هدى مديرة مراسلات، أحمد بلا دور في المراسلات. */
function setup() {
  const c = company(at(SUN, '07:00'));
  const users = c.ok('users.list', {}, c.A).users;
  const uid = (u) => users.find((x) => x.username === u).id;
  c.ok('users.setRoles', { id: uid('sara'), roles: { correspondence: 'clerk' } }, c.A);
  c.ok('users.setRoles', { id: uid('huda'), roles: { attendance: 'hr', hr: 'hr', correspondence: 'manager' } }, c.A);
  return { ...c, uid: { sara: uid('sara'), ahmad: uid('ahmad'), huda: uid('huda') } };
}

test('correspondence: yearly serials per direction, statuses at registration, and visibility scope', () => {
  const c = setup();
  eq(c.fail('cor.lookups', {}, c.T.ahmad).code, 'FORBIDDEN', 'no role, no access');
  const lk = c.ok('cor.lookups', {}, c.T.sara);
  eq([lk.isManager, lk.categories.length > 0, lk.years.includes('2026')], [false, true, true]);
  const a = c.ok('cor.save', { direction: 'in', subject: 'طلب عرض سعر', party: 'وزارة التربية', date: SUN, channel: 'email', category: lk.categories[0], dueDate: '2026-11-20' }, c.T.sara);
  eq([a.number, a.status, a.statusLabel, a.directionLabel, a.assigneeName, a.channelLabel], ['IN-2026-0001', 'received', 'مستلَم', 'وارد', 'سارة', 'بريد إلكتروني']);
  truthy(a.receivedAt, 'incoming letters are received on registration');
  const b = c.ok('cor.save', { direction: 'out', subject: 'خطاب تعريف', party: 'البنك الأهلي', date: '2026-11-16' }, c.T.sara);
  eq([b.number, b.status], ['OUT-2026-0001', 'draft']);
  const b2 = c.ok('cor.save', { direction: 'out', subject: 'خطاب تعريف آخر', party: 'البنك الأهلي', date: '2026-11-16', status: 'sent' }, c.T.sara);
  eq([b2.number, b2.status], ['OUT-2026-0002', 'sent']);
  truthy(b2.sentAt);
  const old = c.ok('cor.save', { direction: 'out', subject: 'خطاب قديم', party: 'جهة', date: '2025-03-01' }, c.T.sara);
  eq(old.number, 'OUT-2025-0001', 'serials restart with the letter year');
  // التحقق من المدخلات
  truthy(c.fail('cor.save', { direction: 'in', subject: 'بلا جهة', date: SUN }, c.T.sara).message.includes('الجهة'));
  truthy(c.fail('cor.save', { direction: 'sideways', subject: 'x', party: 'y', date: SUN }, c.T.sara).message.includes('اتجاه'));
  truthy(c.fail('cor.save', { direction: 'in', subject: 'x', party: 'y', date: SUN, category: 'غير موجود' }, c.T.sara).message.includes('التصنيف'));
  truthy(c.fail('cor.save', { id: a.id, direction: 'out', subject: 'x', party: 'y', date: SUN }, c.T.sara).message.includes('اتجاه'));
  // الرؤية: المديرة ترى الكل، والموظفة ما سجّلته، وأحمد لا شيء
  eq(c.ok('cor.list', {}, c.T.huda).length, 4);
  eq(c.ok('cor.list', { direction: 'in' }, c.T.sara).map((x) => x.number), ['IN-2026-0001']);
  eq(c.ok('cor.list', { year: '2025' }, c.T.huda).length, 1);
  eq(c.ok('cor.list', { q: 'البنك' }, c.T.huda).length, 2);
  eq(c.fail('cor.list', {}, c.T.ahmad).code, 'FORBIDDEN');
  const mgrLetter = c.ok('cor.save', { direction: 'in', subject: 'سري', party: 'الديوان', date: SUN }, c.T.huda);
  eq(c.fail('cor.get', { id: mgrLetter.id }, c.T.sara).code, 'NOT_FOUND', 'a clerk does not see letters of others');
  eq(c.ok('cor.get', { id: mgrLetter.id }, c.A).letter.number, 'IN-2026-0002', 'super admin sees everything');
});

test('correspondence: forwarding gives the assignee visibility and a notification; status transitions follow the direction', () => {
  const c = setup();
  const l = c.ok('cor.save', { direction: 'in', subject: 'استفسار عن الفاتورة', party: 'شركة النور', date: SUN }, c.T.huda);
  eq(c.fail('cor.get', { id: l.id }, c.T.sara).code, 'NOT_FOUND');
  truthy(c.fail('cor.forward', { id: l.id, assigneeId: c.uid.huda }, c.T.huda).message.includes('مسبقاً'));
  const f = c.ok('cor.forward', { id: l.id, assigneeId: c.uid.sara, note: 'راجعي الفاتورة وردّي خلال يومين' }, c.T.huda);
  eq(f.assigneeName, 'سارة');
  const d = c.ok('cor.get', { id: l.id }, c.T.sara);
  eq(d.letter.canEdit, true, 'the assignee can work on it');
  truthy(d.log.some((x) => x.kind === 'forward' && x.body.includes('راجعي الفاتورة')));
  const n = c.ok('notify.list', {}, c.T.sara).items.find((x) => x.title.includes('أحال إليك'));
  truthy(n && n.detail.includes('IN-2026-0001') && n.link === '/correspondence/' + l.id, 'forward notification');
  // الحالات
  truthy(c.fail('cor.status', { id: l.id, status: 'sent' }, c.T.sara).message.includes('للصادر'));
  eq(c.ok('cor.status', { id: l.id, status: 'replied', note: 'رُدّ هاتفياً' }, c.T.sara).status, 'replied');
  const out = c.ok('cor.save', { direction: 'out', subject: 'رد', party: 'شركة النور', date: SUN }, c.T.sara);
  truthy(c.fail('cor.status', { id: out.id, status: 'received' }, c.T.sara).message.includes('للوارد'));
  const sent = c.ok('cor.status', { id: out.id, status: 'sent' }, c.T.sara);
  truthy(sent.sentAt);
  eq(c.fail('cor.status', { id: out.id, status: 'draft' }, c.T.sara).code, 'FORBIDDEN', 'only the manager returns a letter to draft');
  eq(c.ok('cor.status', { id: out.id, status: 'draft' }, c.T.huda).status, 'draft');
  eq(c.fail('cor.status', { id: out.id, status: 'nope' }, c.T.huda).ok, undefined);
  eq(c.fail('cor.forward', { id: l.id, assigneeId: c.uid.ahmad }, c.T.ahmad).code, 'FORBIDDEN', 'no role, cannot forward');
});

test('correspondence: a reply is registered in the opposite direction and marks the original as replied', () => {
  const c = setup();
  const orig = c.ok('cor.save', { direction: 'in', subject: 'طلب تمديد العقد', party: 'شركة الأفق', date: SUN, dueDate: '2026-11-25' }, c.T.sara);
  truthy(c.fail('cor.save', { direction: 'in', subject: 'رد خاطئ', party: 'x', date: SUN, replyToId: orig.id }, c.T.sara).message.includes('المقابل'));
  const reply = c.ok('cor.save', { direction: 'out', subject: 'الموافقة على التمديد', party: 'شركة الأفق', date: '2026-11-17', replyToId: orig.id, status: 'sent' }, c.T.sara);
  eq([reply.number, reply.replyToNumber, reply.status], ['OUT-2026-0001', 'IN-2026-0001', 'sent']);
  const d = c.ok('cor.get', { id: orig.id }, c.T.sara);
  eq([d.letter.status, d.letter.repliesCount, d.replies.map((x) => x.number)], ['replied', 1, ['OUT-2026-0001']]);
  truthy(d.log.some((x) => x.kind === 'reply' && x.body.includes('OUT-2026-0001')));
  eq(c.ok('cor.get', { id: reply.id }, c.T.sara).original.number, 'IN-2026-0001');
  // الأصل لا يُحذف وله ردود؛ الحذف لمدير المراسلات
  eq(c.fail('cor.remove', { id: orig.id }, c.T.sara).code, 'FORBIDDEN');
  truthy(c.fail('cor.remove', { id: orig.id }, c.T.huda).message.includes('ردود'));
  c.ok('cor.remove', { id: reply.id }, c.T.huda);
  eq(c.fail('cor.get', { id: reply.id }, c.T.sara).code, 'NOT_FOUND');
  truthy(c.ok('audit.list', { module: 'correspondence' }, c.A).rows.some((r) => r.action === 'letter.delete'));
});

test('correspondence: archiving hides letters from the lists, and only the manager restores; due reminders and the report', () => {
  const c = setup();
  c.clock.set(at(SUN, '08:00'));
  const l = c.ok('cor.save', { direction: 'in', subject: 'مطالبة', party: 'جهة حكومية', date: SUN, dueDate: '2026-11-16' }, c.T.sara);
  const soonLetter = c.ok('cor.save', { direction: 'in', subject: 'طلب اجتماع', party: 'جهة', date: SUN, dueDate: '2026-11-10' }, c.T.sara);
  c.ok('cor.save', { direction: 'out', subject: 'إشعار', party: 'جهة', date: '2026-10-05', status: 'sent' }, c.T.sara);
  const arch = c.ok('cor.status', { id: l.id, status: 'archived' }, c.T.sara);
  truthy(arch.archivedAt);
  eq(c.ok('cor.list', {}, c.T.sara).some((x) => x.id === l.id), false, 'archived letters are hidden by default');
  eq(c.ok('cor.list', { archived: true }, c.T.sara).map((x) => x.id), [l.id]);
  eq(c.ok('cor.list', { withArchived: true }, c.T.sara).length, 3);
  eq(c.fail('cor.status', { id: l.id, status: 'received' }, c.T.sara).code, 'FORBIDDEN', 'the clerk does not restore from the archive');
  const back = c.ok('cor.status', { id: l.id, status: 'received' }, c.T.huda);
  eq([back.status, back.archivedAt], ['received', '']);
  // التذكير بالموعد يصل لمن يتابع الخطاب عند قراءة الرئيسية (الموعد الماضي = متأخر)
  const card = c.ok('home.summary', {}, c.T.sara).cards.find((x) => x.kind === 'cor.home');
  eq([card.open, card.overdue, card.scope], [3, 1, 'mine']);
  truthy(c.ok('notify.list', {}, c.T.sara).items.some((x) => x.title.includes('تأخر الرد') && x.detail.includes(soonLetter.number)));
  // التقرير
  const r = c.ok('cor.report', { year: '2026' }, c.T.huda);
  eq([r.total, r.in, r.out, r.overdueCount], [3, 2, 1, 1]);
  eq(r.byMonth.find((m) => m.month === '2026-11').in, 2);
  eq(r.byMonth.find((m) => m.month === '2026-10').out, 1);
  eq(r.overdue[0].number, soonLetter.number);
  truthy(c.fail('cor.report', { year: '20x6' }, c.T.huda).message.includes('السنة'));
});

test('correspondence: party from a client, letters on a project show under its client, generic links are validated, and lists filter by client/project', () => {
  const c = setup();
  const client = c.ok('crm.client.save', { name: 'شركة الأفق', type: 'company', category: 'current' }, c.A);
  const project = c.ok('crm.project.save', { name: 'موقع الأفق', clientId: client.id, type: 'موقع', billing: 'fixed', contractValue: '1000', startDate: SUN }, c.A);
  const a = c.ok('cor.save', { direction: 'out', subject: 'عرض سعر', clientId: client.id, date: SUN }, c.T.sara);
  eq([a.party, a.clientName], ['شركة الأفق', 'شركة الأفق'], 'the party name comes from the client');
  const b = c.ok('cor.save', { direction: 'in', subject: 'ملاحظات على التصميم', party: 'مكتب الأفق', projectId: project.id, date: SUN, linkedType: 'employee', linkedId: c.emp.ahmad.id, tags: 'عاجل, تصميم' }, c.T.sara);
  eq([b.clientId, b.party, b.projectName, b.linkedTypeLabel, b.linkedLabel, b.tags], ['', 'مكتب الأفق', 'موقع الأفق', 'موظف', 'أحمد', ['عاجل', 'تصميم']]);
  eq(c.ok('cor.list', { clientId: client.id }, c.T.sara).length, 2, 'a letter on the client project appears under the client');
  eq(c.ok('cor.list', { projectId: project.id }, c.T.sara).map((x) => x.id), [b.id]);
  eq(c.ok('cor.list', { linkedType: 'employee', linkedId: c.emp.ahmad.id }, c.T.sara).map((x) => x.id), [b.id]);
  eq(c.fail('cor.save', { direction: 'in', subject: 'x', party: 'y', date: SUN, clientId: 'nope' }, c.T.sara).code, 'NOT_FOUND');
  eq(c.fail('cor.save', { direction: 'in', subject: 'x', party: 'y', date: SUN, linkedType: 'invoice', linkedId: '1' }, c.T.sara).ok, undefined);
  // ربط بمهمة: المهام التي يراها المستخدم فقط
  const t = c.ok('tsk.save', { title: 'متابعة العقد' }, c.T.sara);
  const lt = c.ok('cor.save', { direction: 'in', subject: 'بخصوص العقد', party: 'الأفق', date: SUN, linkedType: 'task', linkedId: t.id }, c.T.sara);
  eq(lt.linkedLabel, t.number + ' · متابعة العقد');
  eq(c.fail('cor.save', { direction: 'in', subject: 'x', party: 'y', date: SUN, linkedType: 'task', linkedId: t.id }, c.T.huda).code, 'NOT_FOUND', 'the manager does not see that task');
  const lk = c.ok('cor.lookups', {}, c.T.sara);
  eq([lk.clients.length, lk.projects.length, lk.links.task.length], [1, 1, 1]);
});

test('correspondence: attachments on Drive, log entries, and manager-only categories applied to letters on rename', () => {
  const c = setup();
  const l = c.ok('cor.save', { direction: 'in', subject: 'عقد موقّع', party: 'الأفق', date: SUN, category: 'تعاقدي' }, c.T.sara);
  const f = c.ok('cor.file.upload', { letterId: l.id, fileName: 'العقد.png', mimeType: 'image/png', data: PNG }, c.T.sara);
  eq(f.fileName, 'IN-2026-0001_العقد.png');
  eq(c.ok('cor.file.content', { id: f.id }, c.T.huda).data, PNG);
  eq(c.fail('cor.file.content', { id: f.id }, c.T.ahmad).code, 'FORBIDDEN');
  const d = c.ok('cor.get', { id: l.id }, c.T.sara);
  eq([d.files.length, d.letter.filesCount, d.log.map((x) => x.kind)], [1, 1, ['create', 'file']]);
  c.ok('cor.file.remove', { id: f.id }, c.T.sara);
  eq(c.ok('cor.get', { id: l.id }, c.T.sara).files.length, 0);
  // التصنيفات
  eq(c.fail('cor.category.save', { name: 'مناقصات' }, c.T.sara).code, 'FORBIDDEN');
  const cats = c.ok('cor.category.save', { name: 'مناقصات' }, c.T.huda);
  truthy(cats.some((x) => x.name === 'مناقصات'));
  truthy(c.fail('cor.category.save', { name: 'مناقصات' }, c.T.huda).message.includes('مستخدم'));
  const contract = cats.find((x) => x.name === 'تعاقدي');
  c.ok('cor.category.save', { id: contract.id, name: 'عقود', active: true }, c.T.huda);
  eq(c.ok('cor.get', { id: l.id }, c.T.sara).letter.category, 'عقود', 'renaming a category updates its letters');
  c.ok('cor.category.save', { id: contract.id, name: 'عقود', active: false }, c.T.huda);
  eq(c.ok('cor.lookups', {}, c.T.sara).categories.includes('عقود'), false, 'inactive categories are not offered');
  truthy(c.ok('cor.save', { id: l.id, subject: 'عقد موقّع', party: 'الأفق', date: SUN, category: 'عقود' }, c.T.sara), 'but an existing letter keeps it');
});
