/**
 * وحدة المهام (المرحلة 3).
 *
 * - المهمة تُسند إلى مستخدم في البوابة (assigneeId = userId)، ولها متابعون (watchers).
 * - الحالات: جديدة ← قيد العمل ← بانتظار مراجعة ← منجزة، أو ملغاة.
 *   المسؤول عن مهمة أسندها غيره لا يُنجزها مباشرة: «منجزة» منه تعني «بانتظار مراجعة»،
 *   ويعتمدها من أسندها (أو مدير المسؤول أو مدير المهام) من صندوق الموافقات.
 * - الأدوار (docs/05): كل مستخدم «عضو» تلقائياً (defaultRole). العضو يُسند لنفسه ولفريقه ويرى ما يخصه وفريقه،
 *   و«مدير المهام» يُسند للجميع ويرى الكل ويضبط التكرار ويحذف.
 * - التكرار (أسبوعي/شهري): عند إنجاز المهمة تُنشأ التالية تلقائياً بموعد جديد وقائمتها الفرعية غير مؤشّرة.
 * - الربط: بمشروع (projectId) وبعميل أو عهدة أو موظف (linkedType/linkedId) — خيارات الربط في lookups.links حسب أدوار المستخدم،
 *   ومهام فرعية بمستوى واحد (parentId).
 * - المهمة الخاصة (private): لا يراها إلا منشئها (ولا مدير المهام ولا مدير النظام)، مسندة إليه دائماً وبلا متابعين،
 *   وتُنجز مباشرة بلا مراجعة، ويحذفها منشئها. الفرعية من خاصة تكون خاصة.
 */
var TSK_SCHEMA = {
  Tasks: [
    ['id', 'text'], ['number', 'text'], ['title', 'text'], ['description', 'text'], ['status', 'text'], ['priority', 'text'],
    ['assigneeId', 'text'], ['watchers', 'json'], ['dueDate', 'date'], ['startDate', 'date'], ['completedAt', 'ts'],
    ['projectId', 'text'], ['linkedType', 'text'], ['linkedId', 'text'], ['parentId', 'text'], ['recurrence', 'json'],
    ['nextTaskId', 'text'], ['sortOrder', 'num'], ['reviewAt', 'ts'], ['createdBy', 'text'], ['createdAt', 'ts'], ['updatedBy', 'text'], ['updatedAt', 'ts'],
    ['private', 'bool']
  ],
  TaskChecklist: [['id', 'text'], ['taskId', 'text'], ['text', 'text'], ['done', 'bool'], ['sortOrder', 'num'], ['doneBy', 'text'], ['doneAt', 'ts']],
  TaskComments: [['id', 'text'], ['taskId', 'text'], ['kind', 'text'], ['body', 'text'], ['mentions', 'json'], ['createdBy', 'text'], ['createdAt', 'ts']],
  TaskFiles: [
    ['id', 'text'], ['taskId', 'text'], ['fileName', 'text'], ['driveFileId', 'text'], ['mimeType', 'text'], ['fileSize', 'num'],
    ['uploadedBy', 'text'], ['uploadedAt', 'ts']
  ]
};

var TSK = {
  STATUS: { todo: 'جديدة', doing: 'قيد العمل', review: 'بانتظار مراجعة', done: 'منجزة', cancelled: 'ملغاة' },
  ORDER: ['todo', 'doing', 'review', 'done', 'cancelled'],
  OPEN: ['todo', 'doing', 'review'],
  PRIORITY: { urgent: 'عاجلة', high: 'مرتفعة', normal: 'عادية', low: 'منخفضة' },
  P_RANK: { urgent: 0, high: 1, normal: 2, low: 3 },
  FREQ: { weekly: 'أسبوعية', monthly: 'شهرية' },
  LINKS: { custody: 'عهدة', employee: 'موظف', client: 'عميل', project: 'مشروع' },
  DONE_DAYS: 30,
  MAX_CHECK: 50,
  MAX_WATCHERS: 20
};

var Tasks = {
  // ───────── أساسيات ─────────
  rows_: function (t) { return Db.view('tasks', t); },
  getOrThrow_: function (id) { return Db.getOrThrow('tasks', 'Tasks', id, 'المهمة'); },
  isMgr_: function (ctx) { return Permissions.has(ctx, 'tasks', ['manager']); },

  /** حسابات فريق المستخدم (من تحته في الهيكل) — تُحسب مرة لكل طلب */
  team_: function (ctx) {
    if (ctx.tskTeam) return ctx.tskTeam;
    var me = Staff.ofCtx_(ctx), ids = me ? Staff.teamIds_(me.id) : [], emps = indexBy_(Staff.all_());
    ctx.tskTeam = ids.map(function (id) { return emps[id] && emps[id].userId; }).filter(Boolean);
    return ctx.tskTeam;
  },

  canSee_: function (ctx, t) {
    var u = ctx.user.id;
    if (t.private) return t.createdBy === u; // الخاصة لمنشئها فقط، حتى عن مدير المهام ومدير النظام
    return Tasks.isMgr_(ctx) || t.assigneeId === u || t.createdBy === u || (t.watchers || []).indexOf(u) >= 0 ||
      Tasks.team_(ctx).indexOf(t.assigneeId) >= 0;
  },

  /** يحذف المهمة مدير المهام، ومنشئ المهمة الخاصة */
  canRemove_: function (ctx, t) { return Tasks.isMgr_(ctx) || (!!t.private && t.createdBy === ctx.user.id); },

  /** من أسندها، أو مدير المسؤول، أو مدير المهام: يعدّل ويعتمد ويلغي */
  canManage_: function (ctx, t) {
    return Tasks.isMgr_(ctx) || t.createdBy === ctx.user.id || Tasks.team_(ctx).indexOf(t.assigneeId) >= 0;
  },

  /** المسؤول أو من يدير المهمة: يغيّر الحالة ويعمل على القائمة الفرعية والمرفقات */
  canWork_: function (ctx, t) { return t.assigneeId === ctx.user.id || Tasks.canManage_(ctx, t); },

  visible_: function (ctx, id) {
    var t = Db.get('tasks', 'Tasks', id);
    if (!t || !Tasks.canSee_(ctx, t)) throw appError('المهمة غير موجودة.', 'NOT_FOUND');
    return t;
  },

  activeUsers_: function () { return Db.view('core', 'Users').filter(function (u) { return u.active; }); },

  assertAssignable_: function (ctx, userId, keep) {
    var u = Db.get('core', 'Users', userId);
    if (!u || !u.active) throw appError('المسؤول غير موجود أو حسابه معطّل.');
    if (userId === keep || userId === ctx.user.id || Tasks.isMgr_(ctx) || Tasks.team_(ctx).indexOf(userId) >= 0) return u;
    throw appError('يمكنك إسناد المهام لنفسك ولفريقك فقط.', 'FORBIDDEN');
  },

  /** المشاريع: سجل المشاريع في وحدة العملاء إن كانت مفعّلة، وإلا قائمة مشاريع العهد. open=true للاختيار فقط */
  projects_: function (open) {
    if ((moduleDef_('crm') || {}).enabled) {
      return Db.view('crm', 'Projects').filter(function (p) { return !open || p.status === 'ongoing' || p.status === 'on_hold'; })
        .slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
    }
    if (!(moduleDef_('custody') || {}).enabled) return [];
    return Db.view('custody', 'Projects').filter(function (p) { return p.active !== false && p.type !== 'debt'; })
      .sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
  },

  maps_: function () {
    var count = function (table) {
      var out = {};
      Tasks.rows_(table).forEach(function (r) { if (table !== 'TaskComments' || r.kind !== 'event') out[r.taskId] = (out[r.taskId] || 0) + 1; });
      return out;
    };
    var checks = {};
    Tasks.rows_('TaskChecklist').forEach(function (c) {
      var x = checks[c.taskId] = checks[c.taskId] || { done: 0, total: 0 };
      x.total++; if (c.done) x.done++;
    });
    var subs = {};
    Tasks.rows_('Tasks').forEach(function (t) { if (t.parentId) subs[t.parentId] = (subs[t.parentId] || 0) + 1; });
    return {
      users: indexBy_(Db.view('core', 'Users')), emps: indexBy_(Staff.all_()), tasks: indexBy_(Tasks.rows_('Tasks')),
      projects: indexBy_(Tasks.projects_()), checks: checks, comments: count('TaskComments'), files: count('TaskFiles'), subs: subs
    };
  },

  userName_: function (m, id) { var u = id && m.users[id]; return u ? u.fullName : ''; },

  linkLabel_: function (m, type, id) {
    if (!type || !id) return '';
    if (type === 'employee') { var e = m.emps[id]; return e ? e.fullName : ''; }
    if (type === 'client' || type === 'project') {
      var x = (moduleDef_('crm') || {}).enabled && Db.get('crm', type === 'client' ? 'Clients' : 'Projects', id);
      return x ? x.name : '';
    }
    if (type === 'custody' && (moduleDef_('custody') || {}).enabled) {
      var c = Db.get('custody', 'Custodies', id);
      if (!c) return id;
      var e2 = m.emps[c.employeeId];
      return id + ' · ' + (e2 ? e2.fullName : c.periodLabel);
    }
    return id;
  },

  view_: function (t, m, ctx) {
    var today = localDate_(), ch = m.checks[t.id] || { done: 0, total: 0 }, rec = t.recurrence && t.recurrence.freq ? t.recurrence : null;
    var parent = t.parentId && m.tasks[t.parentId], proj = t.projectId && m.projects[t.projectId];
    return {
      id: t.id, number: t.number, title: t.title, description: t.description || '', status: t.status, statusLabel: TSK.STATUS[t.status] || t.status,
      priority: t.priority || 'normal', priorityLabel: TSK.PRIORITY[t.priority || 'normal'],
      assigneeId: t.assigneeId, assigneeName: Tasks.userName_(m, t.assigneeId),
      watchers: (t.watchers || []).map(function (id) { return { id: id, name: Tasks.userName_(m, id) }; }).filter(function (w) { return w.name; }),
      dueDate: t.dueDate || '', startDate: t.startDate || '', completedAt: t.completedAt || '',
      overdue: !!t.dueDate && t.dueDate < today && TSK.OPEN.indexOf(t.status) >= 0,
      projectId: t.projectId || '', projectName: proj ? proj.name : '',
      linkedType: t.linkedType || '', linkedTypeLabel: TSK.LINKS[t.linkedType] || '', linkedId: t.linkedId || '', linkedLabel: Tasks.linkLabel_(m, t.linkedType, t.linkedId),
      private: !!t.private,
      parentId: t.parentId || '', parentTitle: parent ? parent.title : '', parentNumber: parent ? parent.number : '',
      recurrence: rec, recurrenceLabel: rec ? TSK.FREQ[rec.freq] || '' : '',
      sortOrder: t.sortOrder || 0, createdBy: t.createdBy, createdByName: Tasks.userName_(m, t.createdBy), createdAt: t.createdAt, updatedAt: t.updatedAt,
      checklistDone: ch.done, checklistTotal: ch.total, commentsCount: m.comments[t.id] || 0, filesCount: m.files[t.id] || 0, subtasksCount: m.subs[t.id] || 0,
      mine: !!ctx && t.assigneeId === ctx.user.id,
      canWork: !!ctx && Tasks.canWork_(ctx, t), canManage: !!ctx && Tasks.canManage_(ctx, t)
    };
  },

  /** ترتيب القوائم: المفتوحة أولاً، ثم الأقرب موعداً، ثم الأهم */
  sort_: function (list) {
    return list.sort(function (a, b) {
      var oa = TSK.OPEN.indexOf(a.status) >= 0 ? 0 : 1, ob = TSK.OPEN.indexOf(b.status) >= 0 ? 0 : 1;
      if (oa !== ob) return oa - ob;
      if (oa === 1) return (b.completedAt || b.updatedAt || '').localeCompare(a.completedAt || a.updatedAt || '');
      var da = a.dueDate || '9999', db = b.dueDate || '9999';
      return da.localeCompare(db) || TSK.P_RANK[a.priority || 'normal'] - TSK.P_RANK[b.priority || 'normal'] || (a.createdAt || '').localeCompare(b.createdAt || '');
    });
  },

  event_: function (ctx, taskId, body) {
    Db.insert('tasks', 'TaskComments', { taskId: taskId, kind: 'event', body: body, mentions: [], createdBy: ctx.user.id, createdAt: nowIso() });
  },

  /** خيارات الربط حسب أدوار المستخدم: العملاء لمن له دور في العملاء، العهد للمحاسب (أو عهد الموظف نفسه)، والموظفون للموارد البشرية (أو فريقه ونفسه) */
  linkOptions_: function (ctx) {
    var out = { client: [], custody: [], employee: [] };
    var byName = function (a, b) { return a.name.localeCompare(b.name, 'ar'); };
    if ((moduleDef_('crm') || {}).enabled && Permissions.has(ctx, 'crm')) {
      out.client = Db.view('crm', 'Clients').filter(function (c) { return c.status === 'active'; }).map(function (c) { return { id: c.id, name: c.name }; }).sort(byName);
    }
    var me = Staff.ofCtx_(ctx), emps = indexBy_(Staff.all_());
    if ((moduleDef_('custody') || {}).enabled && Permissions.has(ctx, 'custody')) {
      var staff = Permissions.has(ctx, 'custody', ['accountant']);
      out.custody = Db.view('custody', 'Custodies').filter(function (c) { return staff || (me && c.employeeId === me.id); })
        .map(function (c) { var e = emps[c.employeeId]; return { id: c.id, name: c.id + ' · ' + (e ? e.fullName : c.periodLabel || '') }; })
        .sort(function (a, b) { return b.id.localeCompare(a.id); });
    }
    var hr = Permissions.has(ctx, 'hr', ['hr']) || Permissions.has(ctx, 'attendance', ['hr']);
    var team = me ? Staff.teamIds_(me.id) : [];
    out.employee = Staff.all_().filter(function (e) { return e.status !== 'terminated' && (hr || (me && (e.id === me.id || team.indexOf(e.id) >= 0))); })
      .map(function (e) { return { id: e.id, name: e.fullName }; }).sort(byName);
    return out;
  },

  // ───────── القراءة ─────────
  lookups: function (ctx) {
    var mgr = Tasks.isMgr_(ctx), team = Tasks.team_(ctx), users = Tasks.activeUsers_(), emps = indexBy_(Staff.all_());
    var person = function (u) {
      var e = u.employeeId && emps[u.employeeId];
      return { id: u.id, name: u.fullName, jobTitle: u.jobTitle || (e ? e.jobTitle : '') || '' };
    };
    var byName = function (a, b) { return a.name.localeCompare(b.name, 'ar'); };
    return {
      me: ctx.user.id,
      people: users.filter(function (u) { return mgr || u.id === ctx.user.id || team.indexOf(u.id) >= 0; }).map(person).sort(byName),
      everyone: users.map(person).sort(byName),
      projects: Tasks.projects_(true).map(function (p) { return { id: p.id, name: p.name }; }),
      statuses: TSK.ORDER.map(function (k) { return { id: k, label: TSK.STATUS[k] }; }),
      priorities: Object.keys(TSK.PRIORITY).map(function (k) { return { id: k, label: TSK.PRIORITY[k] }; }),
      freqs: Object.keys(TSK.FREQ).map(function (k) { return { id: k, label: TSK.FREQ[k] }; }),
      links: Tasks.linkOptions_(ctx),
      isManager: mgr, hasTeam: team.length > 0, drive: Files.available_(), today: localDate_()
    };
  },

  /**
   * القوائم. view: mine | team | all | created | watching | any (كل ما يراه المستخدم، للصفحات المرتبطة بعميل أو مشروع)
   * status, assigneeId, projectId, q, linkedType+linkedId · المنجزة/الملغاة الأقدم من 30 يوماً تُخفى إلا مع old=true
   */
  list: function (ctx, p) {
    p = p || {};
    var u = ctx.user.id, view = String(p.view || 'mine'), team = Tasks.team_(ctx), mgr = Tasks.isMgr_(ctx);
    if (view === 'all' && !mgr) throw appError('كل المهام لمدير المهام فقط.', 'FORBIDDEN');
    var since = new Date(Date.now() - TSK.DONE_DAYS * 86400000).toISOString(), q = String(p.q || '').trim().toLowerCase();
    var rows = Tasks.rows_('Tasks').filter(function (t) {
      if (!Tasks.canSee_(ctx, t)) return false;
      if (view === 'mine' && t.assigneeId !== u) return false;
      if (view === 'team' && team.indexOf(t.assigneeId) < 0) return false;
      if (view === 'created' && t.createdBy !== u) return false;
      if (view === 'watching' && (t.watchers || []).indexOf(u) < 0) return false;
      if (view === 'dash' && t.private) return false; // نطاق «نظرة عامة» نفسه: كل ما يراه المستخدم عدا الخاص
      if (p.status && t.status !== p.status) return false;
      if (p.assigneeId && t.assigneeId !== p.assigneeId) return false;
      if (p.projectId && t.projectId !== p.projectId) return false;
      if (p.linkedType && (t.linkedType !== p.linkedType || t.linkedId !== p.linkedId)) return false;
      if (!p.old && !p.status && TSK.OPEN.indexOf(t.status) < 0 && (t.completedAt || t.updatedAt || '') < since) return false;
      if (q && (t.title + ' ' + (t.description || '') + ' ' + t.number).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var m = Tasks.maps_();
    return Tasks.sort_(rows).map(function (t) { return Tasks.view_(t, m, ctx); });
  },

  get: function (ctx, p) {
    var t = Tasks.visible_(ctx, p && p.id), m = Tasks.maps_();
    var subs = Tasks.sort_(Tasks.rows_('Tasks').filter(function (x) { return x.parentId === t.id && Tasks.canSee_(ctx, x); }));
    return {
      task: Tasks.view_(t, m, ctx),
      checklist: Tasks.rows_('TaskChecklist').filter(function (c) { return c.taskId === t.id; })
        .sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); })
        .map(function (c) { return { id: c.id, text: c.text, done: !!c.done, doneByName: Tasks.userName_(m, c.doneBy), doneAt: c.doneAt || '' }; }),
      comments: Tasks.rows_('TaskComments').filter(function (c) { return c.taskId === t.id; })
        .sort(function (a, b) { return (a.createdAt || '').localeCompare(b.createdAt || ''); })
        .map(function (c) {
          return { id: c.id, kind: c.kind || 'comment', body: c.body, byId: c.createdBy, byName: Tasks.userName_(m, c.createdBy), at: c.createdAt,
            mentions: (c.mentions || []).map(function (id) { return Tasks.userName_(m, id); }).filter(Boolean), mine: c.createdBy === ctx.user.id };
        }),
      files: Tasks.rows_('TaskFiles').filter(function (f) { return f.taskId === t.id; }).map(function (f) {
        return { id: f.id, fileName: f.fileName, mimeType: f.mimeType, isImage: /^image\//.test(f.mimeType || ''), fileSize: f.fileSize || 0,
          uploadedByName: Tasks.userName_(m, f.uploadedBy), uploadedAt: f.uploadedAt, canDelete: f.uploadedBy === ctx.user.id || Tasks.canManage_(ctx, t) };
      }),
      subtasks: subs.map(function (x) { return Tasks.view_(x, m, ctx); }),
      can: { work: Tasks.canWork_(ctx, t), manage: Tasks.canManage_(ctx, t), remove: Tasks.canRemove_(ctx, t), recur: Tasks.isMgr_(ctx), comment: true }
    };
  },

  // ───────── الإنشاء والتعديل ─────────
  /** إنشاء أو تعديل. التعديل لمن يدير المهمة؛ المسؤول يعدّل الوصف فقط */
  save: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var cur = p.id ? Tasks.visible_(ctx, p.id) : null;
      if (cur && !Tasks.canManage_(ctx, cur)) {
        if (cur.assigneeId !== ctx.user.id) throw appError('لا يمكنك تعديل هذه المهمة.', 'FORBIDDEN');
        var d = optionalText(p.description, 4000);
        Db.update('tasks', 'Tasks', cur.id, { description: d, updatedBy: ctx.user.id, updatedAt: nowIso() });
        return Tasks.view_(Db.get('tasks', 'Tasks', cur.id), Tasks.maps_(), ctx);
      }
      var rec = {
        title: requireText(p.title, 'عنوان المهمة', 160),
        description: optionalText(p.description, 4000),
        priority: TSK.PRIORITY[p.priority] ? p.priority : 'normal',
        dueDate: optionalDate_(p.dueDate, 'الموعد'),
        startDate: optionalDate_(p.startDate, 'تاريخ البدء'),
        projectId: '', linkedType: '', linkedId: '',
        updatedBy: ctx.user.id, updatedAt: nowIso()
      };
      if (rec.startDate && rec.dueDate && rec.startDate > rec.dueDate) throw appError('تاريخ البدء بعد الموعد.');
      // الخاصة: يضبطها منشئها فقط، مسندة إليه، وبلا متابعين؛ والفرعية من خاصة خاصة
      var creator = cur ? cur.createdBy : ctx.user.id;
      var priv = p.private !== undefined ? bool_(p.private) : (cur ? !!cur.private : false);
      var parentRow = !cur && p.parentId ? Tasks.visible_(ctx, p.parentId) : null;
      if (parentRow && parentRow.private) priv = true;
      if (priv !== (cur ? !!cur.private : false) && creator !== ctx.user.id) throw appError('المهمة الخاصة يضبطها منشئها فقط.', 'FORBIDDEN');
      rec.private = priv;
      var assignee = priv ? creator : String(p.assigneeId || (cur ? cur.assigneeId : ctx.user.id));
      Tasks.assertAssignable_(ctx, assignee, cur ? cur.assigneeId : '');
      rec.assigneeId = assignee;
      if (p.projectId) {
        if (!indexBy_(Tasks.projects_())[p.projectId]) throw appError('المشروع غير موجود.');
        rec.projectId = p.projectId;
      }
      if (p.linkedType) {
        if (!TSK.LINKS[p.linkedType]) throw appError('نوع الربط غير معروف.');
        var lid = String(p.linkedId || '');
        if (p.linkedType === 'employee') Staff.getOrThrow_(lid);
        if (p.linkedType === 'client' || p.linkedType === 'project') {
          if (!(moduleDef_('crm') || {}).enabled) throw appError('وحدة العملاء غير مفعّلة.');
          Db.getOrThrow('crm', p.linkedType === 'client' ? 'Clients' : 'Projects', lid, p.linkedType === 'client' ? 'العميل' : 'المشروع');
        }
        if (p.linkedType === 'custody') {
          if (!(moduleDef_('custody') || {}).enabled) throw appError('وحدة العهد غير مفعّلة.');
          Db.getOrThrow('custody', 'Custodies', lid, 'العهدة');
        }
        rec.linkedType = p.linkedType; rec.linkedId = lid;
      }
      var users = indexBy_(Tasks.activeUsers_());
      var watchers = priv ? [] : (Array.isArray(p.watchers) ? p.watchers : (cur ? cur.watchers || [] : [])).map(String)
        .filter(function (id, i, a) { return users[id] && id !== assignee && a.indexOf(id) === i; });
      if (watchers.length > TSK.MAX_WATCHERS) throw appError('المتابعون ' + TSK.MAX_WATCHERS + ' كحد أقصى.');
      rec.watchers = watchers;
      if (p.recurrence !== undefined || !cur) {
        var freq = p.recurrence && p.recurrence.freq ? String(p.recurrence.freq) : '';
        if (freq && !TSK.FREQ[freq]) throw appError('نوع التكرار غير معروف.');
        var had = cur && cur.recurrence && cur.recurrence.freq ? cur.recurrence.freq : '';
        if (freq !== had && !Tasks.isMgr_(ctx)) throw appError('المهام المتكررة يضبطها مدير المهام.', 'FORBIDDEN');
        if (freq && !rec.dueDate) throw appError('حدد موعد المهمة المتكررة.');
        rec.recurrence = freq ? { freq: freq } : null;
      }
      var saved;
      if (cur) {
        var changes = [];
        if (cur.assigneeId !== assignee) changes.push('أسندها إلى ' + Tasks.userName_({ users: users }, assignee));
        if ((cur.dueDate || '') !== rec.dueDate) changes.push(rec.dueDate ? 'غيّر الموعد إلى ' + dmy_(rec.dueDate) : 'أزال الموعد');
        if ((cur.priority || 'normal') !== rec.priority) changes.push('الأولوية: ' + TSK.PRIORITY[rec.priority]);
        if (!!cur.private !== priv) changes.push(priv ? 'جعلها خاصة' : 'جعلها عامة');
        saved = Db.update('tasks', 'Tasks', cur.id, rec);
        if (changes.length) Tasks.event_(ctx, cur.id, changes.join(' · '));
        Audit.log(ctx.user, 'tasks', 'task.update', 'Task', cur.id, {
          number: cur.number, changes: changes.join(' · '), assigneeChanged: cur.assigneeId !== assignee,
          newWatchers: watchers.filter(function (w) { return (cur.watchers || []).indexOf(w) < 0; })
        });
      } else {
        var parent = '';
        if (parentRow) {
          var par = parentRow;
          if (par.parentId) throw appError('المهام الفرعية بمستوى واحد فقط.');
          if (!Tasks.canWork_(ctx, par)) throw appError('لا يمكنك إضافة مهام فرعية لهذه المهمة.', 'FORBIDDEN');
          parent = par.id;
          if (!rec.projectId) rec.projectId = par.projectId || '';
        }
        saved = Db.insert('tasks', 'Tasks', Object.assign(rec, {
          number: Db.nextSerial('T', 4), status: 'todo', parentId: parent, sortOrder: Date.now(), nextTaskId: '',
          createdBy: ctx.user.id, createdAt: nowIso()
        }));
        (Array.isArray(p.checklist) ? p.checklist : []).slice(0, TSK.MAX_CHECK).forEach(function (text, i) {
          var s = optionalText(text, 200);
          if (s) Db.insert('tasks', 'TaskChecklist', { taskId: saved.id, text: s, done: false, sortOrder: i + 1, doneBy: '', doneAt: '' });
        });
        // عنوان المهمة الخاصة لا يُسجَّل في سجل العمليات
        Audit.log(ctx.user, 'tasks', 'task.create', 'Task', saved.id, { number: saved.number, title: priv ? '' : saved.title, assignee: assignee, private: priv });
      }
      return Tasks.view_(saved, Tasks.maps_(), ctx);
    });
  },

  /** تغيير الحالة (ومن لوحة كانبان مع الترتيب). يعيد المهمة؛ review=true إن تحوّل «منجزة» إلى مراجعة */
  status: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var t = Tasks.visible_(ctx, p.id), to = String(p.status || t.status);
      if (!TSK.STATUS[to]) throw appError('حالة غير معروفة.');
      if (!Tasks.canWork_(ctx, t)) throw appError('لا يمكنك تغيير حالة هذه المهمة.', 'FORBIDDEN');
      var manage = Tasks.canManage_(ctx, t);
      if (to === 'cancelled' && !manage) throw appError('يلغي المهمة من أسندها أو مديرها.', 'FORBIDDEN');
      if (t.status === 'cancelled' && !manage) throw appError('المهمة ملغاة.', 'FORBIDDEN');
      if (t.status === 'done' && to !== 'done' && !manage) throw appError('المهمة منجزة ومعتمدة. يعيد فتحها من أسندها.', 'FORBIDDEN');
      var review = false;
      if (to === 'done' && !manage) { to = 'review'; review = true; }
      var changes = { updatedBy: ctx.user.id, updatedAt: nowIso() };
      if (typeof p.sortOrder === 'number' && isFinite(p.sortOrder)) changes.sortOrder = p.sortOrder;
      if (to !== t.status) {
        changes.status = to;
        changes.completedAt = to === 'done' ? nowIso() : '';
        if (to === 'review') changes.reviewAt = nowIso();
        Tasks.event_(ctx, t.id, (review ? 'أرسلها للمراجعة' : 'نقلها إلى «' + TSK.STATUS[to] + '»') + (p.note ? ': ' + optionalText(p.note, 500) : ''));
      }
      Db.update('tasks', 'Tasks', t.id, changes);
      if (to !== t.status) Audit.log(ctx.user, 'tasks', 'task.status', 'Task', t.id, { number: t.number, from: t.status, to: to, note: optionalText(p.note, 500) });
      var next = to === 'done' && to !== t.status ? Tasks.spawnNext_(ctx, Db.get('tasks', 'Tasks', t.id)) : null;
      var out = Tasks.view_(Db.get('tasks', 'Tasks', t.id), Tasks.maps_(), ctx);
      out.review = review;
      out.nextNumber = next ? next.number : '';
      return out;
    });
  },

  /** المهمة المتكررة: عند إنجازها تُنشأ التالية مرة واحدة */
  spawnNext_: function (ctx, t) {
    var freq = t.recurrence && t.recurrence.freq;
    if (!freq || t.nextTaskId) return null;
    var base = t.dueDate || localDate_(), due;
    if (freq === 'weekly') due = addDays_(base, 7);
    else {
      var y = Number(base.slice(0, 4)), mo = Number(base.slice(5, 7)), d = Number(base.slice(8, 10));
      mo++; if (mo > 12) { mo = 1; y++; }
      var ym = y + '-' + String(mo).padStart(2, '0');
      due = ym + '-' + String(Math.min(d, daysInMonth_(ym))).padStart(2, '0');
    }
    var shift = t.startDate && t.dueDate ? daysBetween_(t.startDate, t.dueDate) : null;
    var n = Db.insert('tasks', 'Tasks', {
      number: Db.nextSerial('T', 4), title: t.title, description: t.description, status: 'todo', priority: t.priority,
      assigneeId: t.assigneeId, watchers: t.watchers || [], dueDate: due, startDate: shift !== null ? addDays_(due, -shift) : '',
      completedAt: '', projectId: t.projectId, linkedType: t.linkedType, linkedId: t.linkedId, parentId: t.parentId, private: !!t.private,
      recurrence: t.recurrence, nextTaskId: '', sortOrder: Date.now(), createdBy: t.createdBy, createdAt: nowIso(), updatedBy: ctx.user.id, updatedAt: nowIso()
    });
    Tasks.rows_('TaskChecklist').filter(function (c) { return c.taskId === t.id; }).forEach(function (c) {
      Db.insert('tasks', 'TaskChecklist', { taskId: n.id, text: c.text, done: false, sortOrder: c.sortOrder, doneBy: '', doneAt: '' });
    });
    Db.update('tasks', 'Tasks', t.id, { nextTaskId: n.id });
    Tasks.event_(ctx, n.id, 'أُنشئت تلقائياً بعد إنجاز ' + t.number + ' (' + TSK.FREQ[freq] + ')');
    return n;
  },

  remove: function (ctx, p) {
    return withLock(function () {
      var t = Tasks.visible_(ctx, p && p.id);
      if (!Tasks.canRemove_(ctx, t)) throw appError('يحذف المهام مدير المهام.', 'FORBIDDEN');
      var ids = [t.id].concat(Tasks.rows_('Tasks').filter(function (x) { return x.parentId === t.id; }).map(function (x) { return x.id; }));
      ids.forEach(function (id) {
        Tasks.rows_('TaskChecklist').filter(function (c) { return c.taskId === id; }).forEach(function (c) { Db.remove('tasks', 'TaskChecklist', c.id); });
        Tasks.rows_('TaskComments').filter(function (c) { return c.taskId === id; }).forEach(function (c) { Db.remove('tasks', 'TaskComments', c.id); });
        Tasks.rows_('TaskFiles').filter(function (f) { return f.taskId === id; }).forEach(function (f) { Files.trash_(f.driveFileId); Db.remove('tasks', 'TaskFiles', f.id); });
        Db.remove('tasks', 'Tasks', id);
      });
      Audit.log(ctx.user, 'tasks', 'task.delete', 'Task', t.id, { number: t.number, title: t.private ? '' : t.title, subtasks: ids.length - 1 });
      return true;
    });
  },

  // ───────── القائمة الفرعية ─────────
  checkSave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var c = p.id ? Db.getOrThrow('tasks', 'TaskChecklist', p.id, 'البند') : null;
      var t = Tasks.visible_(ctx, c ? c.taskId : p.taskId);
      if (!Tasks.canWork_(ctx, t)) throw appError('لا يمكنك تعديل هذه المهمة.', 'FORBIDDEN');
      if (!c) {
        var items = Tasks.rows_('TaskChecklist').filter(function (x) { return x.taskId === t.id; });
        if (items.length >= TSK.MAX_CHECK) throw appError('القائمة الفرعية ' + TSK.MAX_CHECK + ' بنداً كحد أقصى.');
        var max = items.reduce(function (a, x) { return Math.max(a, x.sortOrder || 0); }, 0);
        Db.insert('tasks', 'TaskChecklist', { taskId: t.id, text: requireText(p.text, 'البند', 200), done: false, sortOrder: max + 1, doneBy: '', doneAt: '' });
      } else {
        var ch = {};
        if (p.text !== undefined) ch.text = requireText(p.text, 'البند', 200);
        if (p.done !== undefined) { ch.done = bool_(p.done); ch.doneBy = ch.done ? ctx.user.id : ''; ch.doneAt = ch.done ? nowIso() : ''; }
        Db.update('tasks', 'TaskChecklist', c.id, ch);
      }
      Db.update('tasks', 'Tasks', t.id, { updatedAt: nowIso(), updatedBy: ctx.user.id });
      return true;
    });
  },

  checkRemove: function (ctx, p) {
    var c = Db.getOrThrow('tasks', 'TaskChecklist', p && p.id, 'البند'), t = Tasks.visible_(ctx, c.taskId);
    if (!Tasks.canWork_(ctx, t)) throw appError('لا يمكنك تعديل هذه المهمة.', 'FORBIDDEN');
    Db.remove('tasks', 'TaskChecklist', c.id);
    return true;
  },

  // ───────── التعليقات ─────────
  /** تعليق؛ من يُشار إليه (mentions) يصبح متابعاً ليرى المهمة */
  comment: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var t = Tasks.visible_(ctx, p.taskId), users = indexBy_(Tasks.activeUsers_());
      var mentions = (Array.isArray(p.mentions) ? p.mentions : []).map(String).filter(function (id, i, a) { return users[id] && a.indexOf(id) === i; }).slice(0, 10);
      var c = Db.insert('tasks', 'TaskComments', { taskId: t.id, kind: 'comment', body: requireText(p.body, 'التعليق', 2000), mentions: mentions, createdBy: ctx.user.id, createdAt: nowIso() });
      var w = (t.watchers || []).slice();
      mentions.forEach(function (id) { if (id !== t.assigneeId && w.indexOf(id) < 0) w.push(id); });
      Db.update('tasks', 'Tasks', t.id, { watchers: w.slice(0, TSK.MAX_WATCHERS) });
      Audit.log(ctx.user, 'tasks', 'task.comment', 'Task', t.id, { number: t.number, mentions: mentions, excerpt: c.body.slice(0, 140) });
      return { id: c.id };
    });
  },

  commentRemove: function (ctx, p) {
    var c = Db.getOrThrow('tasks', 'TaskComments', p && p.id, 'التعليق');
    Tasks.visible_(ctx, c.taskId);
    if (c.kind === 'event' || (c.createdBy !== ctx.user.id && !Tasks.isMgr_(ctx))) throw appError('تحذف تعليقاتك فقط.', 'FORBIDDEN');
    Db.remove('tasks', 'TaskComments', c.id);
    return true;
  },

  // ───────── المرفقات ─────────
  fileUpload: function (ctx, p) {
    Files.require_();
    p = p || {};
    var t = Tasks.visible_(ctx, p.taskId);
    if (!Tasks.canWork_(ctx, t)) throw appError('لا يمكنك إرفاق ملفات بهذه المهمة.', 'FORBIDDEN');
    var up = Files.decode_(p);
    var name = t.number + '_' + Files.safeName_(p.fileName || ('مرفق.' + up.ext)); // i18n:line
    var f = Files.save_(Files.folder_('', ['المهام', t.createdAt.slice(0, 7)]), up, name);
    var row = Db.insert('tasks', 'TaskFiles', { taskId: t.id, fileName: name, driveFileId: f.id, mimeType: up.mime, fileSize: f.size, uploadedBy: ctx.user.id, uploadedAt: nowIso() });
    Tasks.event_(ctx, t.id, 'أرفق ' + name);
    Audit.log(ctx.user, 'tasks', 'file.upload', 'TaskFile', row.id, { task: t.number, file: name, kb: Math.round(f.size / 1024) });
    return { id: row.id, fileName: name };
  },

  fileContent: function (ctx, p) {
    var f = Db.getOrThrow('tasks', 'TaskFiles', p && p.id, 'المرفق');
    Tasks.visible_(ctx, f.taskId);
    return Files.content_(f.driveFileId, f.fileName, f.mimeType);
  },

  fileRemove: function (ctx, p) {
    var f = Db.getOrThrow('tasks', 'TaskFiles', p && p.id, 'المرفق'), t = Tasks.visible_(ctx, f.taskId);
    if (f.uploadedBy !== ctx.user.id && !Tasks.canManage_(ctx, t)) throw appError('لا يمكنك حذف هذا المرفق.', 'FORBIDDEN');
    Files.trash_(f.driveFileId);
    Db.remove('tasks', 'TaskFiles', f.id);
    Tasks.event_(ctx, t.id, 'حذف المرفق ' + f.fileName);
    return true;
  },

  /** لوحة المهام ضمن ما يراه المستخدم: المفتوح والمتأخر وهذا الأسبوع، الإنجاز، التوزيع بالحالة والأولوية والمسؤول والمشروع، والاتجاه الأسبوعي */
  dashboard: function (ctx) {
    var mgr = Tasks.isMgr_(ctx), team = Tasks.team_(ctx), today = localDate_(), week = addDays_(today, 7), m = Tasks.maps_();
    var vis = Tasks.rows_('Tasks').filter(function (t) { return Tasks.canSee_(ctx, t) && !t.private; });
    var open = vis.filter(function (t) { return TSK.OPEN.indexOf(t.status) >= 0; });
    var since30 = new Date(Date.now() - 30 * 86400000).toISOString();
    var done30 = vis.filter(function (t) { return t.status === 'done' && (t.completedAt || '') >= since30; });
    var created30 = vis.filter(function (t) { return (t.createdAt || '') >= since30; });
    var overdue = open.filter(function (t) { return t.dueDate && t.dueDate < today; });
    var count = function (list, fn) {
      var o = {};
      list.forEach(function (t) { var k = fn(t) || ''; o[k] = (o[k] || 0) + 1; });
      return Object.keys(o).map(function (k) { return { key: k, count: o[k] }; }).sort(function (a, b) { return b.count - a.count; });
    };
    // آخر 8 أسابيع: المنشأة والمنجزة
    var weeks = [];
    for (var i = 7; i >= 0; i--) {
      var end = addDays_(today, -7 * i), start = addDays_(end, -6);
      weeks.push({
        week: start, label: dmy_(start).slice(0, 5),
        created: vis.filter(function (t) { var d = (t.createdAt || '').slice(0, 10); return d >= start && d <= end; }).length,
        done: vis.filter(function (t) { var d = (t.completedAt || '').slice(0, 10); return t.status === 'done' && d >= start && d <= end; }).length
      });
    }
    var v = function (t) { return Tasks.view_(t, m, ctx); };
    return {
      today: today, scope: mgr ? 'all' : team.length ? 'team' : 'mine',
      kpis: {
        open: open.length, overdue: overdue.length, dueWeek: open.filter(function (t) { return t.dueDate && t.dueDate >= today && t.dueDate <= week; }).length,
        dueToday: open.filter(function (t) { return t.dueDate === today; }).length, noDue: open.filter(function (t) { return !t.dueDate; }).length,
        review: open.filter(function (t) { return t.status === 'review'; }).length, urgent: open.filter(function (t) { return t.priority === 'urgent' || t.priority === 'high'; }).length,
        done30: done30.length, created30: created30.length, total: vis.length,
        completionRate: done30.length + open.length ? Math.round(done30.length * 100 / (done30.length + open.length)) : null,
        onTimeRate: done30.length ? Math.round(done30.filter(function (t) { return !t.dueDate || (t.completedAt || '').slice(0, 10) <= t.dueDate; }).length * 100 / done30.length) : null,
        mine: open.filter(function (t) { return t.assigneeId === ctx.user.id; }).length
      },
      byStatus: TSK.ORDER.map(function (k) { return { status: k, label: TSK.STATUS[k], count: vis.filter(function (t) { return t.status === k; }).length }; }),
      byPriority: Object.keys(TSK.PRIORITY).map(function (k) { return { priority: k, label: TSK.PRIORITY[k], count: open.filter(function (t) { return (t.priority || 'normal') === k; }).length }; }),
      byAssignee: count(open, function (t) { return t.assigneeId; }).slice(0, 8).map(function (x) {
        return { id: x.key, name: Tasks.userName_(m, x.key), open: x.count, overdue: overdue.filter(function (t) { return t.assigneeId === x.key; }).length };
      }),
      byProject: count(open.filter(function (t) { return t.projectId; }), function (t) { return t.projectId; }).slice(0, 6).map(function (x) {
        return { id: x.key, name: (m.projects[x.key] || {}).name || x.key, open: x.count };
      }),
      weekly: weeks,
      overdue: Tasks.sort_(overdue.slice()).slice(0, 8).map(v),
      dueSoon: Tasks.sort_(open.filter(function (t) { return t.dueDate && t.dueDate >= today && t.dueDate <= week; })).slice(0, 8).map(v)
    };
  },

  // ───────── الرئيسية وصندوق الموافقات ─────────
  summary_: function (ctx) {
    var u = ctx.user.id, today = localDate_(), week = addDays_(today, 7);
    var mine = Tasks.rows_('Tasks').filter(function (t) { return t.assigneeId === u && TSK.OPEN.indexOf(t.status) >= 0; });
    var m = Tasks.maps_();
    return [{
      kind: 'tsk.mine',
      open: mine.length,
      overdue: mine.filter(function (t) { return t.dueDate && t.dueDate < today; }).length,
      today: mine.filter(function (t) { return t.dueDate === today; }).length,
      week: mine.filter(function (t) { return t.dueDate > today && t.dueDate <= week; }).length,
      review: Tasks.inbox_(ctx).length,
      items: Tasks.sort_(mine.filter(function (t) { return t.status !== 'review'; })).slice(0, 5).map(function (t) { return Tasks.view_(t, m, ctx); })
    }];
  },

  inbox_: function (ctx) {
    var u = ctx.user.id, m = null;
    return Tasks.rows_('Tasks').filter(function (t) { return t.status === 'review' && t.assigneeId !== u && Tasks.canManage_(ctx, t); }).map(function (t) {
      m = m || Tasks.maps_();
      var v = Tasks.view_(t, m, ctx);
      return {
        id: 'tsk.review:' + t.id, kind: 'tsk.review', refId: t.id, module: 'tasks', moduleLabel: 'مراجعة مهمة', title: t.number + ' · ' + t.title,
        who: v.assigneeName, createdAt: t.reviewAt || t.updatedAt, status: TSK.STATUS.review, note: '', needsNoteOnReject: true,
        facts: [{ k: 'الموعد', v: t.dueDate ? dmy_(t.dueDate) : '—' }, { k: 'القائمة الفرعية', v: v.checklistTotal ? v.checklistDone + '/' + v.checklistTotal : '—' }],
        approveLabel: 'اعتماد الإنجاز', rejectLabel: 'إعادتها للعمل', link: '/tasks/' + t.id
      };
    });
  },

  decide_: function (ctx, kind, p) {
    if (kind !== 'tsk.review') return null;
    var t = Tasks.visible_(ctx, p.id);
    if (t.status !== 'review') throw appError('لم تعد المهمة بانتظار المراجعة.');
    if (!Tasks.canManage_(ctx, t) || t.assigneeId === ctx.user.id) throw appError('لا يمكنك مراجعة هذه المهمة.', 'FORBIDDEN');
    if (!p.approve && !optionalText(p.note, 500)) throw appError('اكتب سبب الإعادة.');
    return Tasks.status(ctx, { id: t.id, status: p.approve ? 'done' : 'doing', note: p.note });
  },

  /** الإشعارات (Notify): من يُبلَّغ بكل حدث. المراجعة نفسها تصل عبر صندوق الموافقات */
  notify_: function (ev) {
    var t = Db.get('tasks', 'Tasks', ev.id), d = ev.details || {}, a = ev.actor.fullName, out = [];
    if (!t) return out;
    var link = '/tasks/' + t.id, detail = t.number + ' · ' + t.title;
    if (ev.action === 'task.create') {
      out.push({ to: t.assigneeId, title: 'أسند إليك ' + a + ' مهمة', detail: detail, link: link });
      out.push({ to: t.watchers || [], title: 'أضافك ' + a + ' متابعاً لمهمة', detail: detail, link: link });
    } else if (ev.action === 'task.update') {
      if (d.assigneeChanged) out.push({ to: t.assigneeId, title: 'أسند إليك ' + a + ' مهمة', detail: detail, link: link });
      out.push({ to: d.newWatchers || [], title: 'أضافك ' + a + ' متابعاً لمهمة', detail: detail, link: link });
    } else if (ev.action === 'task.status') {
      if (d.from === 'review' && d.to === 'done') out.push({ to: t.assigneeId, title: 'اعتُمد إنجاز مهمتك', detail: detail, link: link });
      else if (d.from === 'review' && d.to === 'doing') out.push({ to: t.assigneeId, title: 'أُعيدت مهمتك للعمل', detail: detail + (d.note ? ' — ' + d.note : ''), link: link });
      else if (d.to === 'cancelled') out.push({ to: [t.assigneeId].concat(t.watchers || []), title: 'أُلغيت مهمة', detail: detail + (d.note ? ' — ' + d.note : ''), link: link });
      else if (d.to === 'done' && ev.actor.id === t.assigneeId) out.push({ to: t.createdBy, title: 'أنجز ' + a + ' مهمة أسندتها', detail: detail, link: link });
    } else if (ev.action === 'task.comment') {
      var m = d.mentions || [];
      out.push({ to: m, title: 'أشار إليك ' + a + ' في مهمة', detail: detail + ' — ' + (d.excerpt || ''), link: link });
      var rest = [t.assigneeId, t.createdBy].concat(t.watchers || []).filter(function (id, i, arr) { return id && arr.indexOf(id) === i && m.indexOf(id) < 0; });
      out.push({ to: rest, title: 'علّق ' + a + ' على مهمة', detail: detail + ' — ' + (d.excerpt || ''), link: link });
    }
    return out;
  },

  /** الإشعارات: المراجعة تضع عنصراً في الصندوق لمن أسند المهمة أو مدير المسؤول أو مديري المهام */
  approvalActions_: ['task.status'],
  approvers_: function (id) {
    var t = Db.get('tasks', 'Tasks', id);
    if (!t) return [];
    var emp = Staff.byUser_(t.assigneeId);
    return [t.createdBy].concat(Notify.usersWithRole_('tasks', ['manager'])).concat(emp ? Notify.managerChainUsers_(emp.id) : []);
  },

  routes_: function () {
    var any = { module: 'tasks' };
    return {
      'tsk.lookups': { perm: any, fn: Tasks.lookups },
      'tsk.list': { perm: any, fn: Tasks.list },
      'tsk.dashboard': { perm: any, fn: Tasks.dashboard },
      'tsk.get': { perm: any, fn: Tasks.get },
      'tsk.save': { perm: any, fn: Tasks.save },
      'tsk.status': { perm: any, fn: Tasks.status },
      'tsk.remove': { perm: any, fn: Tasks.remove }, // التحقق داخلها: مدير المهام أو منشئ المهمة الخاصة
      'tsk.check.save': { perm: any, fn: Tasks.checkSave },
      'tsk.check.remove': { perm: any, fn: Tasks.checkRemove },
      'tsk.comment.add': { perm: any, fn: Tasks.comment },
      'tsk.comment.remove': { perm: any, fn: Tasks.commentRemove },
      'tsk.file.upload': { perm: any, fn: Tasks.fileUpload },
      'tsk.file.content': { perm: any, fn: Tasks.fileContent },
      'tsk.file.remove': { perm: any, fn: Tasks.fileRemove }
    };
  }
};
