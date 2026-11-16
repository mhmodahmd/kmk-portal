import { eq, test, truthy } from './harness.mjs';
import { company, at, SUN } from './phase1.test.mjs';

/** لوحات الوحدات: النطاق والمؤشرات الأساسية */

test('attendance dashboard: managers see their team, HR sees everyone, employees are refused', () => {
  const c = company(at(SUN, '08:20'));
  c.ok('att.punch', { kind: 'in' }, c.T.ahmad);
  c.clock.set(at(SUN, '16:30'));
  c.ok('att.punch', { kind: 'out' }, c.T.ahmad);
  c.clock.set(at('2026-11-17', '12:00'));
  eq(c.fail('att.dashboard', {}, c.T.ahmad).code, 'FORBIDDEN');
  const team = c.ok('att.dashboard', { month: '2026-11' }, c.T.sara);
  eq([team.scope, team.employees, team.kpis.presentDays, team.kpis.lateDays, team.kpis.lateMin], ['team', 1, 1, 1, 20]);
  truthy(team.kpis.absentDays >= 1, 'Monday is absent');
  eq(team.kpis.attendanceRate, Math.round(100 / (1 + team.kpis.absentDays)));
  eq(team.topLate[0].name, 'أحمد');
  const sun = team.byDay.find((d) => d.date === SUN);
  eq([sun.present, sun.late, sun.absent], [1, 1, 0]);
  const all = c.ok('att.dashboard', { month: '2026-11' }, c.T.huda);
  eq([all.scope, all.employees], ['all', 3]);
  eq(all.byDepartment.find((d) => d.department === 'التصميم').employees, 1);
  eq(all.todayCounts.total, 3);
});

test('hr dashboard: headcount, pending leaves, people on leave today, and team scope for managers', () => {
  const c = company();
  const r = c.ok('hr.leave.request', { typeId: 'lt_annual', from: '2026-11-22', to: '2026-11-26', reason: 'سفر' }, c.T.ahmad);
  eq(c.fail('hr.dashboard', {}, c.T.ahmad).code, 'FORBIDDEN');
  const d = c.ok('hr.dashboard', {}, c.T.huda);
  eq([d.scope, d.kpis.headcount, d.kpis.pendingLeaves, d.kpis.pendingManager, d.kpis.onLeaveToday, d.kpis.withoutAccount], ['all', 3, 1, 1, 0, 0]);
  eq(d.byDepartment.find((x) => x.department === 'التصميم').count, 1);
  eq(d.byStatus.find((x) => x.status === 'active').count, 3);
  eq(d.hiresByMonth.length, 12);
  eq(d.pendingLeaves[0].name, 'أحمد');
  const team = c.ok('hr.dashboard', {}, c.T.sara);
  eq([team.scope, team.kpis.headcount], ['team', 1], 'a manager sees her team only');
  c.ok('inbox.decide', { kind: 'hr.leave', id: r.id, approve: true }, c.T.sara);
  c.ok('inbox.decide', { kind: 'hr.leave', id: r.id, approve: true }, c.T.huda);
  c.clock.set(at('2026-11-23', '09:00'));
  const later = c.ok('hr.dashboard', {}, c.T.huda);
  eq([later.kpis.onLeaveToday, later.kpis.leaveDaysYear, later.onLeaveToday[0].name], [1, 5, 'أحمد']);
  eq(later.leaveByType[0].days, 5);
});

test('custody dashboard: open balances, monthly spend, categories, alerts; accountant only', () => {
  const c = company(at(SUN, '07:00'));
  const users = c.ok('users.list', {}, c.A).users;
  const id = (u) => users.find((x) => x.username === u).id;
  c.ok('users.setRoles', { id: id('huda'), roles: { attendance: 'hr', hr: 'hr', custody: 'accountant' } }, c.A);
  c.ok('users.setRoles', { id: id('ahmad'), roles: { custody: 'holder' } }, c.A);
  c.ok('cus.settings.save', { managerName: 'المدير', alertPercent: 50, defaultAmount: '100' }, c.A);
  const cu = c.ok('cus.open', { employeeId: c.emp.ahmad.id, amount: '100', paymentMethod: 'cash' }, c.T.huda);
  c.ok('cus.markSigned', { kind: 'voucher', id: cu.openVoucherId }, c.T.huda);
  c.ok('cus.confirmReceipt', { id: cu.id }, c.T.ahmad);
  c.ok('cus.expense.save', { custodyId: cu.id, date: SUN, amount: '60', description: 'ضيافة', category: 'ضيافة وبوفيه', noAttachmentReason: 'ورقية' }, c.T.ahmad);
  c.ok('cus.expense.save', { custodyId: cu.id, date: '2026-10-05', amount: '10', description: 'طباعة', category: 'طباعة', noAttachmentReason: 'ورقية' }, c.T.ahmad);
  eq(c.fail('cus.dashboard', {}, c.T.ahmad).code, 'FORBIDDEN');
  const d = c.ok('cus.dashboard', {}, c.T.huda);
  eq([d.kpis.openCount, d.kpis.openBalance, d.kpis.monthSpent, d.kpis.prevMonthSpent, d.kpis.yearSpent, d.kpis.alerts], [1, 30000, 60000, 10000, 70000, 1]);
  eq(d.byCategory[0], { category: 'ضيافة وبوفيه', amount: 60000, count: 1 });
  eq(d.spendByMonth.length, 12);
  eq(d.spendByMonth[11], { month: '2026-11', spent: 60000, count: 1 });
  eq([d.custodies[0].employeeName, d.custodies[0].percent, d.custodies[0].alert], ['أحمد', 70, true]);
  eq(d.kpis.noAttachment, 2);
});

test('tasks dashboard: open, overdue, review, weekly trend and per-assignee load within the user scope', () => {
  const c = company(at(SUN, '08:00'));
  const users = c.ok('users.list', {}, c.A).users;
  const uid = (u) => users.find((x) => x.username === u).id;
  const t1 = c.ok('tsk.save', { title: 'متأخرة', assigneeId: uid('ahmad'), dueDate: '2026-11-10', priority: 'high' }, c.T.sara);
  const t2 = c.ok('tsk.save', { title: 'قريبة', assigneeId: uid('ahmad'), dueDate: '2026-11-18' }, c.T.sara);
  const t3 = c.ok('tsk.save', { title: 'منجزة', assigneeId: uid('sara') }, c.T.sara);
  c.ok('tsk.save', { title: 'خاصة', private: true }, c.T.sara);
  c.ok('tsk.status', { id: t3.id, status: 'done' }, c.T.sara);
  c.ok('tsk.status', { id: t2.id, status: 'done' }, c.T.ahmad); // تصبح بانتظار مراجعة
  const d = c.ok('tsk.dashboard', {}, c.T.sara);
  eq([d.scope, d.kpis.open, d.kpis.overdue, d.kpis.review, d.kpis.dueWeek, d.kpis.urgent, d.kpis.done30, d.kpis.total], ['team', 2, 1, 1, 1, 1, 1, 3]);
  eq(d.kpis.completionRate, 33);
  eq(d.overdue[0].id, t1.id);
  eq(d.byAssignee[0], { id: uid('ahmad'), name: 'أحمد', open: 2, overdue: 1 });
  eq(d.weekly.length, 8);
  eq(d.weekly[7].created, 3, 'private tasks are excluded');
  const mine = c.ok('tsk.dashboard', {}, c.T.ahmad);
  eq([mine.scope, mine.kpis.open, mine.kpis.mine], ['mine', 2, 2]);
  eq(c.fail('tsk.dashboard', {}, 'bad-token').code, 'SESSION_EXPIRED');
});

test('crm dashboard: collected by month, pipeline stages, top clients and proposal win rate', () => {
  const c = company(at(SUN, '08:00'));
  const client = c.ok('crm.client.save', { name: 'شركة الأفق', type: 'company', category: 'current' }, c.A);
  const lead = c.ok('crm.client.save', { name: 'مؤسسة النور', type: 'company', category: 'lead' }, c.A);
  const project = c.ok('crm.project.save', { name: 'موقع الأفق', clientId: client.id, type: 'موقع', billing: 'fixed', contractValue: '1000', startDate: SUN }, c.A);
  c.ok('crm.payment.save', { projectId: project.id, amount: '400', status: 'paid', date: SUN, kind: 'advance', method: 'transfer' }, c.A);
  c.ok('crm.payment.save', { projectId: project.id, amount: '100', status: 'paid', date: '2026-10-10', kind: 'partial', method: 'cash' }, c.A);
  c.ok('crm.proposal.save', { name: 'عرض', clientId: lead.id, value: '500', issueDate: SUN }, c.A);
  const d = c.ok('crm.dashboard', {}, c.A);
  eq([d.kpis.clients, d.kpis.leads, d.kpis.ongoing, d.kpis.collected, d.kpis.collectedMonth, d.kpis.collectedPrev, d.kpis.collectedYear, d.kpis.remaining], [2, 1, 1, 500000, 400000, 100000, 500000, 500000]);
  eq(d.byMonth.length, 12);
  eq(d.byMonth[11], { month: '2026-11', amount: 400000 });
  eq(d.topClients[0], { clientId: client.id, name: 'شركة الأفق', amount: 500000 });
  eq(d.projectsByStatus.find((x) => x.status === 'ongoing').count, 1);
  truthy(d.pipeline.length > 0 && d.pipeline.reduce((a, s) => a + s.count, 0) === 1, 'the lead sits in a stage');
  eq([d.kpis.proposalsYear, d.kpis.winRate], [1, null]);
});

test('home dashboard: attention items follow the user roles, with a personal month summary and the inbox head', () => {
  const c = company(at(SUN, '08:00'));
  const users = c.ok('users.list', {}, c.A).users;
  const uid = (u) => users.find((x) => x.username === u).id;
  c.ok('users.setRoles', { id: uid('sara'), roles: { attendance: 'employee', hr: 'employee', correspondence: 'clerk' } }, c.A);
  c.ok('tsk.save', { title: 'متأخرة', assigneeId: uid('sara'), dueDate: '2026-11-10' }, c.T.sara);
  c.ok('tsk.save', { title: 'اليوم', assigneeId: uid('sara'), dueDate: SUN }, c.T.sara);
  c.ok('cor.save', { direction: 'in', subject: 'خطاب متأخر', party: 'جهة', date: SUN, dueDate: '2026-11-12' }, c.T.sara);
  const d = c.ok('home.dashboard', {}, c.T.sara);
  eq(d.attention.map((x) => x.kind), ['att.punch', 'tsk.overdue', 'cor.overdue', 'tsk.today'], 'ordered: punch, overdue, then today');
  eq([d.my.tasks.open, d.my.tasks.overdue, d.my.tasks.dueWeek, d.my.attendance.month, d.my.leave.name], [2, 1, 1, '2026-11', 'إجازة سنوية']);
  c.ok('att.punch', { kind: 'in' }, c.T.sara);
  eq(c.ok('home.dashboard', {}, c.T.sara).attention.some((x) => x.kind === 'att.punch'), false, 'punched in: no reminder');
  const r = c.ok('hr.leave.request', { typeId: 'lt_annual', from: '2026-11-22', to: '2026-11-23', reason: 'سفر' }, c.T.ahmad);
  const mgr = c.ok('home.dashboard', {}, c.T.sara);
  eq([mgr.inbox.length, mgr.inbox[0].refId], [1, r.id], 'the inbox head shows the team leave request');
  eq(c.ok('home.dashboard', {}, c.A).my.attendance, null, 'the admin has no employee file');
});
