/**
 * نقل بيانات نظام العملاء السابق (crm.kmktec.com) من ملف «تصدير كامل (JSON)» — مدير النظام فقط.
 *
 * - المصدر: جداول التصدير كما هي (clients, contacts, projects, payments, proposals, activities, tasks, documents,
 *   pipeline_stages, sales_targets). لا اتصال بالنظام السابق ولا تعديل عليه.
 * - المعرّفات القديمة تُحفظ كما هي، فالتشغيل المتكرر لا يكرر شيئاً (إضافة فقط؛ ما في البوابة لا يُستبدل).
 * - المستخدمون: userMap يربط معرّف المستخدم القديم بحساب في البوابة، ومن لا حساب له يُنسب لـ defaultUser
 *   ويُحفظ اسمه الأصلي (legacyOwner في العميل، وسطر في نشاط المهمة).
 * - المشاريع بلا قيمة عقد تُنقل «اشتراك أو مفتوح» مع needsReview، وما حُصّل فيه أكثر من العقد يُعلَّم للمراجعة.
 * - المهام تذهب إلى وحدة المهام مرتبطة بالعميل والمشروع، وتُرقَّم T-xxxx بترتيب إنشائها.
 * - dryRun: تقرير بما سيحدث دون كتابة. كاستثناء موثّق: تكتب في ملفي العملاء والمهام معاً.
 */
var MigrationCrm = {
  STAGE_BY_NAME: { 'عميل جديد': 'st_new', 'تواصل أولي': 'st_contact', 'اجتماع / عرض': 'st_meeting', 'عرض سعر': 'st_quote', 'تفاوض': 'st_negotiation', 'إغلاق ناجح': 'st_won', 'خسارة': 'st_lost', 'new': 'st_new' },

  run: function (ctx, p) {
    p = p || {};
    var src = p.source || {}, dry = !!p.dryRun, userMap = p.userMap || {}, names = p.userNames || {};
    var rows = function (k) { return Array.isArray(src[k]) ? src[k].filter(function (r) { return r && r.id; }) : []; };
    var users = indexBy_(Db.view('core', 'Users'));
    var def = p.defaultUser && users[p.defaultUser] ? p.defaultUser : ctx.user.id;
    var rep = { dryRun: dry, created: {}, unchanged: {}, warnings: [], review: [] };
    var tick = function (kind, t) { rep[kind][t] = (rep[kind][t] || 0) + 1; };
    var F = function (v) { return Math.round(Number(v || 0) * 1000); };
    var D = function (v) { return Migration.date_(v); };
    var T = function (v) { return Migration.iso_(v); };
    var S = function (v, max) { return String(v == null ? '' : v).trim().slice(0, max || 2000); };
    var pick = function (v, dict, fb) { return Object.prototype.hasOwnProperty.call(dict, v) ? v : fb; };
    Object.keys(userMap).forEach(function (k) { if (userMap[k] && !users[userMap[k]]) { rep.warnings.push('الحساب المحدد لـ ' + (names[k] || k) + ' غير موجود في البوابة، فنُسب لحساب الافتراضي.'); delete userMap[k]; } });
    /** { id, legacy } — id حساب البوابة، legacy اسم صاحبه في النظام السابق إن لم يكن له حساب */
    var who = function (legacyId) {
      if (!legacyId) return { id: '', legacy: '' };
      if (userMap[legacyId]) return { id: userMap[legacyId], legacy: '' };
      return { id: def, legacy: names[legacyId] || 'مستخدم سابق' };
    };
    var upsert = function (dbKey, table, list) {
      var have = indexBy_(Db.view(dbKey, table)), fresh = [];
      list.forEach(function (r) { if (have[r.id]) tick('unchanged', table); else { fresh.push(r); tick('created', table); } });
      if (!dry && fresh.length) Db.insertMany(dbKey, table, fresh);
      return fresh;
    };
    if (!dry) Crm.seed_();

    // ───── العملاء وجهات الاتصال ─────
    var stageName = {};
    rows('pipeline_stages').forEach(function (s) { stageName[s.id] = s.name; });
    upsert('crm', 'Clients', rows('clients').map(function (c) {
      var lead = c.client_category === 'possible', st = MigrationCrm.STAGE_BY_NAME[stageName[c.pipeline_stage] || c.pipeline_stage] || 'st_new';
      var owner = who(c.assigned_employee_id), creator = who(c.created_by);
      return {
        id: c.id, name: S(c.full_name, 120) || 'بلا اسم', type: pick(c.client_type, CRM.TYPE, 'company'), category: lead ? 'lead' : 'current',
        status: pick(c.client_status, CRM.STATUS, 'active'), stageId: lead || st !== 'st_new' ? st : '', lostReason: S(c.lost_reason, 300),
        phone: S(c.phone, 30), phone2: S(c.phone2, 30), email: S(c.email, 120), workplace: S(c.workplace, 120), nationality: S(c.nationality, 40),
        country: S(c.country, 40), city: S(c.city, 60), address: S(c.address, 200), notes: S(c.notes), assignedTo: owner.id, legacyOwner: owner.legacy,
        createdBy: creator.id || def, createdAt: T(c.created_at) || nowIso(), updatedAt: nowIso()
      };
    }));
    upsert('crm', 'Contacts', rows('contacts').map(function (c) {
      return { id: c.id, clientId: c.client_id, name: S(c.full_name, 80), jobTitle: S(c.job_title, 60), phone: S(c.phone, 30), email: S(c.email, 120),
        nationality: S(c.nationality, 40), active: c.status !== 'inactive', notes: S(c.notes, 500), createdAt: T(c.created_at) || nowIso() };
    }));

    // ───── المشاريع والدفعات ─────
    var paidBy = {}, schedBy = {};
    rows('payments').forEach(function (x) {
      if (x.payment_status === 'scheduled') schedBy[x.project_id] = (schedBy[x.project_id] || 0) + F(x.amount);
      else paidBy[x.project_id] = (paidBy[x.project_id] || 0) + F(x.amount);
    });
    var usedNames = {};
    Db.view('crm', 'Projects').forEach(function (x) { usedNames[x.name] = x.id; });
    var clientName = {};
    rows('clients').forEach(function (c) { clientName[c.id] = c.full_name; });
    upsert('crm', 'Projects', rows('projects').map(function (x) {
      var contract = F(x.contract_value), paid = paidBy[x.id] || 0, name = S(x.name, 160) || 'مشروع', n = 2;
      while (usedNames[name] && usedNames[name] !== x.id) name = S(x.name, 150) + ' (' + (n++) + ')';
      usedNames[name] = x.id;
      var review = '', fixed = contract > 0;
      if (!fixed) review = 'نُقل بلا قيمة عقد (محصّل ' + kwd_(paid) + '). حدّد: عقد ثابت بقيمته، أو اشتراك مفتوح.';
      else if (paid > contract) review = 'المحصّل ' + kwd_(paid) + ' أكبر من قيمة العقد ' + kwd_(contract) + '. صحّح القيمة أو الدفعات.';
      if (review) rep.review.push({ project: name, client: clientName[x.client_id] || '', contract: contract, paid: paid, note: review });
      return {
        id: x.id, name: name, clientId: x.client_id, type: S(x.project_type, 60), billing: fixed ? 'fixed' : 'open', contractValue: contract,
        startDate: D(x.start_date), endDate: D(x.end_date), status: pick(x.status, CRM.P_STATUS, 'ongoing'), parentId: x.parent_project_id || '',
        needsReview: !!review, reviewNote: review, notes: S(x.notes), proposalId: '', createdBy: def, createdAt: T(x.created_at) || nowIso(), updatedAt: nowIso()
      };
    }));
    upsert('crm', 'Payments', rows('payments').map(function (x) {
      return {
        id: x.id, projectId: x.project_id, amount: F(x.amount), kind: pick(x.payment_type, CRM.PAY_KIND, 'partial'), method: pick(x.payment_method, CRM.PAY_METHOD, 'transfer'),
        status: x.payment_status === 'scheduled' ? 'scheduled' : 'paid', date: D(x.payment_date), invoiceNo: S(x.invoice_number, 40), recipient: S(x.recipient, 80),
        notes: S(x.notes, 500), attachmentUrl: /^https?:\/\//.test(x.attachment_url || '') ? S(x.attachment_url, 1000) : '', createdBy: def,
        createdAt: T(x.created_at) || nowIso(), updatedAt: nowIso()
      };
    }));

    // ───── العروض والأنشطة والمستندات والأهداف ─────
    upsert('crm', 'Proposals', rows('proposals').map(function (x) {
      return {
        id: x.id, number: S(x.proposal_number, 40) || x.id.slice(0, 8), name: S(x.proposal_name, 160) || 'عرض ' + (x.proposal_number || ''), clientId: x.client_id,
        projectId: x.project_id || '', type: S(x.proposal_type || x.project_type, 60), value: F(x.contract_value), issueDate: D(x.issue_date),
        status: pick(x.status, CRM.PR_STATUS, 'negotiation'), notes: S(x.notes), attachmentUrl: /^https?:\/\//.test(x.attachment_url || '') ? S(x.attachment_url, 1000) : '',
        createdBy: def, createdAt: T(x.created_at) || nowIso(), decidedAt: ''
      };
    }));
    upsert('crm', 'Activities', rows('activities').map(function (a) {
      var u = who(a.employee_id);
      return {
        id: a.id, type: pick(a.activity_type, CRM.ACT, 'follow_up'), clientId: a.client_id, contactId: a.contact_id || '', projectId: a.project_id || '',
        userId: u.id || def, title: S(a.mission, 160), description: S(a.description, 4000), at: T(a.scheduled_at) || T(a.created_at) || nowIso(),
        durationMin: Math.max(0, Math.round(Number(a.duration_minutes) || 0)), location: S(a.location, 160),
        notes: S([a.notes, u.legacy ? 'كان المسؤول في النظام السابق: ' + u.legacy : '', a.requests ? 'الطلبات: ' + (typeof a.requests === 'string' ? a.requests : JSON.stringify(a.requests)) : ''].filter(Boolean).join('\n')),
        followUpDate: '', followUpTaskId: '', createdBy: def, createdAt: T(a.created_at) || nowIso()
      };
    }));
    upsert('crm', 'Links', rows('documents').filter(function (d) { return !d.is_deleted && /^https?:\/\//.test(d.backblaze_url || ''); }).map(function (d) {
      return { id: d.id, ownerType: d.linked_to === 'client' ? 'client' : 'project', ownerId: d.linked_id, title: S(d.file_original_name || d.file_name || d.description, 160) || 'رابط',
        url: S(d.backblaze_url, 1000), driveFileId: '', mimeType: '', category: S(d.document_category, 40), createdBy: def, createdAt: T(d.created_at) || nowIso() };
    }));
    upsert('crm', 'Targets', rows('sales_targets').map(function (t) {
      return { id: t.id, userId: who(t.user_id).id, period: S(t.period_type, 20), year: Number(t.period_year) || 0, month: Number(t.period_month) || 0, quarter: Number(t.period_quarter) || 0,
        data: { newClients: t.target_new_clients, revenue: t.target_revenue, proposals: t.target_proposals, activities: t.target_activities, taskRate: t.target_tasks_completion_rate, notes: t.notes },
        createdAt: T(t.created_at) || nowIso() };
    }));

    // ───── المهام → وحدة المهام ─────
    var acts = indexBy_(rows('activities')), props = indexBy_(rows('proposals')), projs = indexBy_(rows('projects'));
    var haveTasks = indexBy_(Db.view('tasks', 'Tasks'));
    var serial = (Db.view('core', 'Serials').filter(function (s) { return s.key === 'T'; })[0] || { last: 0 }).last;
    var STATUS = { completed: 'done', in_progress: 'doing', open: 'todo', postponed: 'todo', cancelled: 'cancelled' };
    var PRI = { low: 'low', medium: 'normal', high: 'high', urgent: 'urgent' };
    var tasks = [], events = [];
    rows('tasks').slice().sort(function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)); }).forEach(function (t) {
      if (haveTasks[t.id]) { tick('unchanged', 'Tasks'); return; }
      var as = who(t.assigned_to), cr = who(t.created_by), status = STATUS[t.status] || 'todo';
      var clientId = t.client_id || (t.activity_id && acts[t.activity_id] && acts[t.activity_id].client_id) || (t.proposal_id && props[t.proposal_id] && props[t.proposal_id].client_id) ||
        (t.project_id && projs[t.project_id] && projs[t.project_id].client_id) || '';
      var created = T(t.created_at) || nowIso();
      serial++;
      tasks.push({
        id: t.id, number: 'T-' + String(serial).padStart(4, '0'), title: S(t.title, 160) || 'مهمة', status: status, priority: PRI[t.priority] || 'normal',
        description: S([t.task_type ? 'النوع: ' + t.task_type : '', t.description, t.notes].filter(Boolean).join('\n'), 4000),
        assigneeId: as.id || def, watchers: [], dueDate: D(t.due_date), startDate: D(t.start_date),
        completedAt: status === 'done' ? (T(t.due_date) || created) : '', projectId: t.project_id || '', linkedType: clientId ? 'client' : '', linkedId: clientId,
        parentId: '', recurrence: t.is_recurring && status !== 'done' && /month/.test(String(t.recurrence_pattern)) ? { freq: 'monthly' } : (t.is_recurring && status !== 'done' && /week/.test(String(t.recurrence_pattern)) ? { freq: 'weekly' } : null),
        nextTaskId: '', sortOrder: Date.parse(created) || 0, reviewAt: '', createdBy: cr.id || def, createdAt: created, updatedBy: def, updatedAt: created
      });
      tick('created', 'Tasks');
      var note = [as.legacy ? 'كانت مسندة إلى ' + as.legacy : '', t.status === 'postponed' ? 'مؤجلة' : ''].filter(Boolean).join(' · ');
      events.push({ taskId: t.id, kind: 'event', body: 'نُقلت من نظام العملاء السابق' + (note ? ' (' + note + ')' : ''), mentions: [], createdBy: def, createdAt: created });
    });
    if (!dry && tasks.length) {
      Db.insertMany('tasks', 'Tasks', tasks);
      Db.insertMany('tasks', 'TaskComments', events);
      Db.raiseSerial('T', serial);
    }

    // ───── المطابقة ─────
    var m = dry ? null : Crm.maps_();
    rep.reconcile = rows('projects').map(function (x) {
      var portal = dry ? { paid: paidBy[x.id] || 0, scheduled: schedBy[x.id] || 0 } : (m.pays[x.id] || { paid: 0, scheduled: 0 });
      return { project: x.name, contract: F(x.contract_value), sourcePaid: paidBy[x.id] || 0, portalPaid: portal.paid, sourceScheduled: schedBy[x.id] || 0, portalScheduled: portal.scheduled,
        ok: (paidBy[x.id] || 0) === portal.paid && (schedBy[x.id] || 0) === portal.scheduled };
    });
    rep.ok = rep.reconcile.every(function (r) { return r.ok; });
    rep.totals = { clients: rows('clients').length, projects: rows('projects').length, payments: rows('payments').length, tasks: rows('tasks').length,
      paid: Object.keys(paidBy).reduce(function (a, k) { return a + paidBy[k]; }, 0) };
    if (!dry) Audit.log(ctx.user, 'system', 'migration.legacyCrm', 'Migration', 'crm', { created: rep.created, review: rep.review.length, ok: rep.ok });
    return rep;
  }
};
