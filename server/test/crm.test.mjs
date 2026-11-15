import { eq, test, truthy } from './harness.mjs';
import { company, at, SUN } from './phase1.test.mjs';

/** سارة مديرة أحمد. أحمد «مبيعات»، هدى «محاسب» في العملاء */
function setup() {
  const c = company(at(SUN, '07:00'));
  const users = c.ok('users.list', {}, c.A).users;
  const u = (n) => users.find((x) => x.username === n);
  c.ok('users.setRoles', { id: u('ahmad').id, roles: { crm: 'sales' } }, c.A);
  c.ok('users.setRoles', { id: u('sara').id, roles: { crm: 'sales' } }, c.A);
  c.ok('users.setRoles', { id: u('huda').id, roles: { attendance: 'hr', hr: 'hr', crm: 'accountant' } }, c.A);
  return { ...c, u };
}

test('crm: clients by owner and team; pipeline; projects fixed vs open; payments by accountants', () => {
  const c = setup();
  const lead = c.ok('crm.client.save', { name: 'شركة الأفق', type: 'company', category: 'lead', phone: '٥٥٥١٢٣٤٥' }, c.T.ahmad);
  eq([lead.stageName, lead.assignedName, lead.phone], ['عميل جديد', 'أحمد', '55512345']);
  eq(c.ok('crm.clients', {}, c.T.sara).length, 1, 'manager in the structure sees the team clients');
  const other = c.ok('crm.client.save', { name: 'عميل هدى', category: 'current' }, c.A);
  eq(c.ok('crm.clients', {}, c.T.ahmad).map((x) => x.name), ['شركة الأفق'], 'sales sees only own clients');
  eq(c.fail('crm.client', { id: other.id }, c.T.ahmad).code, 'NOT_FOUND');
  eq(c.ok('crm.clients', {}, c.T.huda).length, 2, 'accountant sees all');

  truthy(c.fail('crm.client.stage', { id: lead.id, stageId: 'st_lost' }, c.T.ahmad).message.includes('سبب'));
  const won = c.ok('crm.client.stage', { id: lead.id, stageId: 'st_won' }, c.T.ahmad);
  eq([won.category, won.stageName], ['current', 'إغلاق ناجح']);

  const fixed = c.ok('crm.project.save', { clientId: lead.id, name: 'موقع الأفق', billing: 'fixed', contractValue: '1,500', type: 'تصميم' }, c.T.ahmad);
  const open = c.ok('crm.project.save', { clientId: lead.id, name: 'صيانة شهرية', billing: 'open', contractValue: '999' }, c.T.ahmad);
  eq([fixed.contractValue, open.contractValue, open.billingLabel], [1500000, 0, 'اشتراك أو مفتوح']);
  eq(c.fail('crm.payment.save', { projectId: fixed.id, amount: '500' }, c.T.ahmad).code, 'FORBIDDEN', 'sales do not record payments');
  c.ok('crm.payment.save', { projectId: fixed.id, amount: '500', method: 'cash', date: SUN, invoiceNo: '0001-2026' }, c.T.huda);
  c.ok('crm.payment.save', { projectId: fixed.id, amount: '1000', status: 'scheduled', date: '2026-11-17' }, c.T.huda);
  c.ok('crm.payment.save', { projectId: open.id, amount: '200', date: SUN }, c.T.huda);
  truthy(c.fail('crm.payment.save', { projectId: fixed.id, amount: '1', date: '2026-12-01' }, c.T.huda).message.includes('مجدولة'));
  const d = c.ok('crm.project', { id: fixed.id }, c.T.ahmad).project;
  eq([d.paid, d.scheduled, d.remaining, d.percent, d.nextDue], [500000, 1000000, 1000000, 33, '2026-11-17']);
  eq(c.ok('crm.project', { id: open.id }, c.T.ahmad).project.remaining, 0, 'open billing has no remaining');
  eq(c.ok('crm.client', { id: lead.id }, c.T.ahmad).client.remaining, 1000000);

  // تذكير التحصيل يصل للمحاسب ولمسؤول العميل
  c.ok('home.summary', {}, c.T.huda);
  const n = c.ok('notify.list', {}, c.T.huda).items;
  truthy(n.some((x) => x.title === 'دفعة يحين موعدها قريباً' && x.link === '/crm/projects/' + fixed.id));
  truthy(c.ok('notify.list', {}, c.T.ahmad).items.some((x) => x.title === 'دفعة يحين موعدها قريباً'));
  eq(c.fail('crm.client.remove', { id: lead.id }, c.T.ahmad).code, 'FORBIDDEN');
});

test('crm: proposals become projects; follow-up activities create tasks; shared project list', () => {
  const c = setup();
  const cl = c.ok('crm.client.save', { name: 'مؤسسة النور', category: 'lead' }, c.T.ahmad);
  const pr = c.ok('crm.proposal.save', { clientId: cl.id, name: 'تطبيق النور', value: '3000', type: 'تطوير' }, c.T.ahmad);
  eq([pr.number, pr.statusLabel], ['QT-2026-001', 'قيد التفاوض']);
  eq(c.ok('crm.client', { id: cl.id }, c.T.ahmad).client.stageName, 'عرض سعر');
  const acc = c.ok('crm.proposal.decide', { id: pr.id, status: 'accepted' }, c.T.ahmad);
  truthy(acc.projectId);
  const p = c.ok('crm.project', { id: acc.projectId }, c.T.ahmad).project;
  eq([p.name, p.contractValue, p.billing, p.status], ['تطبيق النور', 3000000, 'fixed', 'ongoing']);
  eq(c.ok('crm.client', { id: cl.id }, c.T.ahmad).client.category, 'current');

  const a = c.ok('crm.activity.save', { clientId: cl.id, type: 'meeting', title: 'اجتماع التصميم', followUpDate: '2026-11-20', projectId: p.id }, c.T.ahmad);
  truthy(a.followUpTaskId);
  const t = c.ok('tsk.get', { id: a.followUpTaskId }, c.T.ahmad).task;
  eq([t.title, t.dueDate, t.linkedType, t.linkedLabel, t.projectName], ['متابعة: مؤسسة النور — اجتماع التصميم', '2026-11-20', 'client', 'مؤسسة النور', 'تطبيق النور']);
  truthy(c.ok('tsk.lookups', {}, c.T.ahmad).projects.some((x) => x.id === p.id), 'tasks pick from the CRM projects');
  c.ok('users.setRoles', { id: c.u('ahmad').id, roles: { crm: 'sales', custody: 'holder' } }, c.A);
  truthy(c.ok('cus.lookups', {}, c.T.ahmad).projects.some((x) => x.name === 'تطبيق النور'), 'custody expenses pick CRM projects');
  const rep = c.ok('crm.report', {}, c.T.huda);
  eq([rep.proposals.total, rep.proposals.accepted, rep.activities[0].total, rep.activitiesTotal], [1, 1, 1, 1]);
  eq([rep.from, rep.to, rep.byMonth.length, rep.receivables.items.length], ['2026-01-01', SUN, 11, 0]);
  // فترة محددة ومقارنة بالسابقة: دفعة محصّلة اليوم فقط
  c.ok('crm.payment.save', { projectId: p.id, amount: '200', date: SUN }, c.T.huda);
  const r2 = c.ok('crm.report', { from: '2026-11-01', to: SUN }, c.T.huda);
  eq([r2.collected, r2.previousCollected, r2.collectedChange, r2.byMonth.length, r2.byMonth[0].amount], [200000, 0, 100, 1, 200000]);
});

/** ملف تصدير صغير بالشكل نفسه (بيانات وهمية) */
function legacyExport() {
  const C1 = '11111111-0000-0000-0000-000000000001', C2 = '11111111-0000-0000-0000-000000000002';
  const P1 = '22222222-0000-0000-0000-000000000001', P2 = '22222222-0000-0000-0000-000000000002';
  const U1 = 'aaaaaaaa-0000-0000-0000-000000000001', U2 = 'aaaaaaaa-0000-0000-0000-000000000002';
  return {
    users: { U1, U2 },
    tables: {
      pipeline_stages: [{ id: 'ps1', name: 'تواصل أولي' }],
      clients: [
        { id: C1, full_name: 'شركة تجريبية', client_type: 'company', client_category: 'current', client_status: 'active', pipeline_stage: 'new', assigned_employee_id: U1, created_by: U1, created_at: '2026-03-01T10:00:00Z', phone: '50000000' },
        { id: C2, full_name: 'عميل محتمل', client_type: 'individual', client_category: 'possible', client_status: 'active', pipeline_stage: 'ps1', assigned_employee_id: U2, created_at: '2026-04-01T10:00:00Z' }
      ],
      contacts: [{ id: 'ct1', full_name: 'جهة اتصال', job_title: 'مدير', client_id: C1, status: 'active' }],
      projects: [
        { id: P1, name: 'مشروع بعقد', client_id: C1, project_type: 'تصميم', contract_value: 1000, start_date: '2026-03-01', status: 'ongoing' },
        { id: P2, name: 'مشروع بلا عقد', client_id: C1, project_type: 'أخرى', contract_value: 0, status: 'completed' }
      ],
      payments: [
        { id: 'pay1', project_id: P1, amount: 400, payment_type: 'partial', payment_method: 'transfer', payment_date: '2026-03-10', payment_status: 'paid', invoice_number: '0001-2026' },
        { id: 'pay2', project_id: P1, amount: 600.5, payment_type: 'final', payment_method: 'check', payment_date: '2026-12-10', payment_status: 'scheduled', invoice_number: '0002-2026' },
        { id: 'pay3', project_id: P2, amount: 2500, payment_type: 'partial', payment_method: 'cash', payment_date: '2026-05-01', payment_status: 'paid' }
      ],
      proposals: [{ id: 'pr1', proposal_number: 'Q-7', proposal_name: 'عرض قديم', client_id: C2, contract_value: 750, issue_date: '2026-06-01', status: 'negotiation' }],
      activities: [{ id: 'ac1', activity_type: 'meeting', client_id: C1, employee_id: U2, mission: 'اجتماع', scheduled_at: '2026-06-21T09:00:00Z' }],
      documents: [{ id: 'doc1', file_name: 'عقد', backblaze_url: 'https://example.com/a', linked_to: 'project', linked_id: P1, document_category: 'contract', is_deleted: false }],
      tasks: [
        { id: 'tk1', title: 'مهمة منجزة', task_type: 'تنفيذ', due_date: '2026-03-20', project_id: P1, linked_to: 'project', assigned_to: U1, priority: 'medium', status: 'completed', created_at: '2026-03-02T10:00:00Z' },
        { id: 'tk2', title: 'متابعة شهرية', task_type: 'متابعة', due_date: '2026-11-30', client_id: C1, assigned_to: U2, priority: 'high', status: 'open', is_recurring: true, recurrence_pattern: 'monthly', created_at: '2026-03-03T10:00:00Z' },
        { id: 'tk3', title: 'من نشاط', activity_id: 'ac1', assigned_to: U1, priority: 'medium', status: 'postponed', created_at: '2026-03-04T10:00:00Z' }
      ],
      sales_targets: [{ id: 'sg1', user_id: U1, period_type: 'monthly', period_year: 2026, period_month: 11, target_revenue: 5000 }]
    }
  };
}

test('crm migration: dry run, import, review flags, tasks, legacy owners, idempotent', () => {
  const c = setup();
  const ex = legacyExport();
  const me = c.u('admin').id;
  const args = { source: ex.tables, userMap: { [ex.users.U1]: c.u('sara').id }, userNames: { [ex.users.U2]: 'طه عمر' }, defaultUser: me };
  eq(c.fail('system.migrate.legacyCrm', { ...args, dryRun: true }, c.T.sara).code, 'FORBIDDEN');
  const dry = c.ok('system.migrate.legacyCrm', { ...args, dryRun: true }, c.A);
  eq([dry.created.Clients, dry.created.Tasks, dry.review.length, dry.ok], [2, 3, 1, true]);
  eq(c.ok('crm.clients', {}, c.A).length, 0, 'dry run writes nothing');

  const r = c.ok('system.migrate.legacyCrm', args, c.A);
  eq([r.ok, r.created.Projects, r.created.Payments, r.created.Links, r.created.Targets], [true, 2, 3, 1, 1]);
  eq(r.review[0].project, 'مشروع بلا عقد');
  const cl = c.ok('crm.clients', {}, c.A);
  const lead = cl.find((x) => x.name === 'عميل محتمل');
  eq([lead.category, lead.stageName, lead.assignedName], ['lead', 'تواصل أولي', 'مدير النظام']);
  eq(lead.legacyOwner, 'طه عمر');
  eq(cl.find((x) => x.name === 'شركة تجريبية').assignedName, 'سارة');
  const projects = c.ok('crm.projects', { review: true }, c.A);
  eq(projects.map((p) => [p.name, p.billing, p.paid, p.remaining]), [['مشروع بلا عقد', 'open', 2500000, 0]]);
  const p1 = c.ok('crm.projects', {}, c.A).find((p) => p.name === 'مشروع بعقد');
  eq([p1.paid, p1.scheduled, p1.remaining], [400000, 600500, 600000]);

  const tasks = c.ok('tsk.list', { view: 'all', old: true }, c.A);
  const byTitle = (t) => tasks.find((x) => x.title === t);
  eq([byTitle('مهمة منجزة').status, byTitle('مهمة منجزة').assigneeName, byTitle('مهمة منجزة').projectName, byTitle('مهمة منجزة').linkedLabel], ['done', 'سارة', 'مشروع بعقد', 'شركة تجريبية']);
  eq([byTitle('متابعة شهرية').status, byTitle('متابعة شهرية').priority, byTitle('متابعة شهرية').recurrenceLabel, byTitle('متابعة شهرية').assigneeName], ['todo', 'high', 'شهرية', 'مدير النظام']);
  eq(byTitle('من نشاط').linkedLabel, 'شركة تجريبية', 'linked through its activity');
  eq(tasks.map((x) => x.number).sort(), ['T-0001', 'T-0002', 'T-0003']);
  truthy(c.ok('tsk.get', { id: byTitle('متابعة شهرية').id }, c.A).comments[0].body.includes('طه عمر'));
  eq(c.ok('tsk.save', { title: 'جديدة' }, c.A).number, 'T-0004', 'serial continues after the import');

  const again = c.ok('system.migrate.legacyCrm', args, c.A);
  eq([Object.keys(again.created).length, again.unchanged.Clients, again.unchanged.Tasks, again.ok], [0, 2, 3, true]);
  // دمج اسم سابق في الحساب: تُزال ملاحظاته
  const fix = c.ok('system.migrate.legacyCrm', { ...args, mergedNames: ['طه عمر'] }, c.A);
  eq([fix.cleaned.clients, fix.cleaned.events], [1, 1]);
  eq(c.ok('crm.clients', {}, c.A).find((x) => x.name === 'عميل محتمل').legacyOwner, '');
  eq(c.ok('tsk.get', { id: byTitle('متابعة شهرية').id }, c.A).comments[0].body, 'نُقلت من نظام العملاء السابق');
});

test('crm: subscription projects have a billing cycle; due for the current period, reminders, and client remaining', () => {
  const c = setup();
  const cl = c.ok('crm.client.save', { name: 'شركة الاشتراك', category: 'current' }, c.T.sara);
  truthy(c.fail('crm.project.save', { clientId: cl.id, name: 'بلا قيمة', billing: 'open', billingCycle: 'monthly' }, c.T.sara).message.includes('قيمة الدورة'));
  const sub = c.ok('crm.project.save', { clientId: cl.id, name: 'استضافة شهرية', billing: 'open', billingCycle: 'monthly', cycleAmount: '100', startDate: '2026-09-10' }, c.T.sara);
  eq([sub.billingCycleLabel, sub.cycleAmount, sub.contractValue], ['شهري', 100000, 0]);
  // اليوم 2026-11-15 → الدورة الحالية من 10 نوفمبر إلى 9 ديسمبر
  eq([sub.cycle.start, sub.cycle.end, sub.cycle.due, sub.remaining], ['2026-11-10', '2026-12-09', 100000, 100000]);
  c.ok('crm.payment.save', { projectId: sub.id, amount: '40', date: '2026-11-12' }, c.T.huda);
  c.ok('crm.payment.save', { projectId: sub.id, amount: '100', date: '2026-10-15' }, c.T.huda); // الدورة السابقة لا تُحتسب
  const p = c.ok('crm.project', { id: sub.id }, c.T.sara).project;
  eq([p.paid, p.cycle.paid, p.cycle.due, p.remaining, p.percent], [140000, 40000, 60000, 60000, 40]);
  eq(c.ok('crm.client', { id: cl.id }, c.T.sara).client.remaining, 60000, 'client remaining includes the cycle due');
  const home = c.ok('crm.home', {}, c.T.huda);
  eq([home.remaining, home.cycles.length, home.cycles[0].due], [60000, 1, 60000]);
  // تذكير الاشتراك يصل للمحاسب عند بداية الدورة
  c.ok('home.summary', {}, c.T.huda);
  truthy(c.ok('notify.list', {}, c.T.huda).items.some((x) => x.title === 'اشتراك مستحق لدورة جديدة' && x.link === '/crm/projects/' + sub.id));
  // اشتراك يبدأ مستقبلاً لا يُستحق بعد
  const later = c.ok('crm.project.save', { clientId: cl.id, name: 'اشتراك لاحق', billing: 'open', billingCycle: 'yearly', cycleAmount: '500', startDate: '2026-12-01' }, c.T.sara);
  eq([later.cycle.future, later.remaining], [true, 0]);
  // عقد ثابت لا يتأثر
  const fx = c.ok('crm.project.save', { clientId: cl.id, name: 'عقد', billing: 'fixed', contractValue: '300', billingCycle: 'monthly', cycleAmount: '9' }, c.T.sara);
  eq([fx.billingCycle, fx.cycleAmount, fx.remaining], ['', 0, 300000]);
});
