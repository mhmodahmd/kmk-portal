/**
 * السلسلة الإجرائية (docs/08 القسم 4، المرحلة 2): محرك اعتماد عام لا يعرف المستندات.
 *
 * - القالب (WfTemplates) ومراحله (WfSteps) بإصدارات: كل حفظ إصدار جديد، والإصدارات السابقة تبقى.
 * - المثيل (WfInstances) لسجل في وحدة (module + entityId)، ومراحله (WfInstanceSteps) نسخة ثابتة من القالب وقت البدء،
 *   فتعديل القالب لا يمس السلاسل الجارية.
 * - المراحل تسلسلية في هذه المرحلة (فردي: يقرر أي واحد من المسؤولين). المتوازية والتفويض والمدد في المرحلة 5.
 * - الإجراءات: اعتماد · رفض · إعادة للتعديل · إحالة · طلب استيضاح (ويجيب المنشئ) · إلغاء · إعادة إسناد (المدير).
 *   سجل الإجراءات (WfActions) إضافة فقط.
 * - المنشئ لا يعتمد مستنده: يُستبعد من مراحل «اعتماد»، وتنتقل إلى مديره المباشر إن لم يبقَ غيره.
 * - الوحدة المضيفة تقدّم في ModuleProviders_ الحقل workflowHost: { entity_(id), onEvent_(ctx, event, inst), link_(id, userId) }.
 * - صندوق الموافقات: المرحلة الحالية لمسؤوليها (always: لمن ليس له دور في الوحدة المضيفة أيضاً).
 */
var WF_SCHEMA = {
  WfTemplates: [
    ['id', 'text'], ['name', 'text'], ['description', 'text'], ['module', 'text'], ['version', 'num'], ['status', 'text'],
    ['createdBy', 'text'], ['createdAt', 'ts'], ['updatedBy', 'text'], ['updatedAt', 'ts']
  ],
  WfSteps: [
    ['id', 'text'], ['templateId', 'text'], ['templateVersion', 'num'], ['order', 'num'], ['group', 'num'], ['name', 'text'], ['kind', 'text'],
    ['assignee', 'json'], ['mode', 'text'], ['count', 'num'], ['actions', 'json'], ['noteRequired', 'json'], ['fields', 'json'], ['condition', 'json'],
    ['slaHours', 'num'], ['workingDays', 'bool'], ['escalation', 'json'], ['onReject', 'text']
  ],
  WfInstances: [
    ['id', 'text'], ['module', 'text'], ['entityId', 'text'], ['templateId', 'text'], ['templateVersion', 'num'], ['templateName', 'text'],
    ['status', 'text'], ['currentGroup', 'num'], ['startedBy', 'text'], ['startedAt', 'ts'], ['endedAt', 'ts']
  ],
  WfInstanceSteps: [
    ['id', 'text'], ['instanceId', 'text'], ['order', 'num'], ['group', 'num'], ['name', 'text'], ['kind', 'text'], ['mode', 'text'], ['count', 'num'],
    ['assignees', 'json'], ['status', 'text'], ['dueAt', 'ts'], ['escalationLevel', 'num'], ['startedAt', 'ts'], ['endedAt', 'ts'],
    ['actedBy', 'text'], ['asking', 'bool'], ['fallback', 'bool'], ['config', 'json']
  ],
  WfActions: [
    ['id', 'text'], ['instanceId', 'text'], ['stepId', 'text'], ['action', 'text'], ['byId', 'text'], ['onBehalfOf', 'text'],
    ['entityVersion', 'num'], ['note', 'text'], ['toId', 'text'], ['at', 'ts']
  ]
};

var WF = {
  KIND: { review: 'مراجعة', approve: 'اعتماد', execute: 'تنفيذ', inform: 'اطلاع' },
  ASSIGNEE: { user: 'مستخدم محدد', role: 'دور في الوحدة', direct_manager: 'المدير المباشر للمنشئ', dept_manager: 'مدير قسم محدد', creator_dept_manager: 'مدير قسم المنشئ' },
  ON_REJECT: { end: 'إنهاء السلسلة (مرفوض)', creator: 'إعادة إلى المنشئ للتعديل' },
  STATUS: { running: 'جارية', returned: 'معادة للتعديل', approved: 'معتمدة', rejected: 'مرفوضة', cancelled: 'ملغاة' },
  STEP: { pending: 'لم تبدأ', current: 'حالية', done: 'مكتملة', rejected: 'مرفوضة', returned: 'معادة', skipped: 'متخطاة', cancelled: 'ملغاة' },
  ACTION: {
    start: 'بدء السلسلة', approve: 'اعتماد', reject: 'رفض', return: 'إعادة للتعديل', forward: 'إحالة', ask: 'طلب استيضاح', answer: 'إيضاح',
    resubmit: 'إعادة الإرسال', cancel: 'إلغاء السلسلة', reassign: 'إعادة إسناد', inform: 'إحاطة', assign: 'إسناد'
  },
  TEMPLATE_STATUS: { published: 'منشور', retired: 'موقوف' },
  MAX_STEPS: 15
};

/** فهارس للقراءة داخل التنفيذ: تُبنى مرة لكل نسخة من الجداول */
var WF_MEMO_ = { rows: null, steps: null, byEntity: null, participants: null };

var Workflow = {
  rows_: function (t) { return Db.view('workflow', t); },

  host_: function (module) {
    var p = ModuleProviders_().filter(function (x) { return x.key === module && x.workflowHost; })[0];
    if (!p) throw appError('الوحدة لا تدعم السلسلة الإجرائية.');
    return p.workflowHost;
  },

  isModuleMgr_: function (ctx, module) { return Permissions.has(ctx, module, ['manager']); },

  userName_: function (users, id) { var u = id && users[id]; return u ? u.fullName : ''; },

  // ───────── الفهارس ─────────
  /** آخر مثيل لكل سجل، ومراحل كل مثيل، والمشاركون في كل سجل (من أُسندت إليه مرحلة أو اتخذ إجراءً) */
  index_: function () {
    var inst = Workflow.rows_('WfInstances'), steps = Workflow.rows_('WfInstanceSteps'), acts = Workflow.rows_('WfActions');
    if (WF_MEMO_.rows === inst && WF_MEMO_.steps === steps && WF_MEMO_.acts === acts) return WF_MEMO_;
    var byInst = {}, latest = {}, part = {};
    steps.forEach(function (s) { (byInst[s.instanceId] = byInst[s.instanceId] || []).push(s); });
    Object.keys(byInst).forEach(function (k) { byInst[k].sort(function (a, b) { return a.order - b.order; }); });
    var instById = {};
    inst.forEach(function (i) {
      instById[i.id] = i;
      var key = i.module + '|' + i.entityId, cur = latest[key];
      if (!cur || (i.startedAt || '') >= (cur.startedAt || '')) latest[key] = i;
      var pk = part[key] = part[key] || {};
      (byInst[i.id] || []).forEach(function (s) { if (s.status !== 'pending') (s.assignees || []).forEach(function (u) { pk[u] = true; }); });
    });
    acts.forEach(function (a) { var i = instById[a.instanceId]; if (i) (part[i.module + '|' + i.entityId] = part[i.module + '|' + i.entityId] || {})[a.byId] = true; });
    WF_MEMO_ = { rows: inst, steps: steps, acts: acts, byInst: byInst, latest: latest, participants: part, instById: instById };
    return WF_MEMO_;
  },

  /** هل المستخدم مشارك في سلسلة السجل (مرحلة حالية أو سابقة أو إجراء)؟ يمنحه الاطلاع على السجل */
  isParticipant_: function (module, entityId, userId) {
    var p = Workflow.index_().participants[module + '|' + entityId];
    return !!(p && p[userId]);
  },

  latestOf_: function (module, entityId) { return Workflow.index_().latest[module + '|' + entityId] || null; },
  stepsOf_: function (instanceId) { return Workflow.index_().byInst[instanceId] || []; },
  currentStep_: function (inst) { return Workflow.stepsOf_(inst.id).filter(function (s) { return s.status === 'current'; })[0] || null; },

  /** ملخص لعمود القائمة: الحالة والمرحلة الحالية ومسؤولوها ونقاط المراحل */
  summary__: function (module, entityId, users) {
    var inst = Workflow.latestOf_(module, entityId);
    if (!inst) return null;
    var steps = Workflow.stepsOf_(inst.id), cur = steps.filter(function (s) { return s.status === 'current' || s.status === 'returned'; })[0] || null;
    return {
      instanceId: inst.id, status: inst.status, statusLabel: WF.STATUS[inst.status] || inst.status, templateName: inst.templateName || '',
      stepName: cur ? cur.name : '', assigneeNames: cur ? (cur.assignees || []).map(function (u) { return Workflow.userName_(users, u); }).filter(Boolean) : [],
      asking: !!(cur && cur.asking), dots: steps.map(function (s) { return s.status; }), done: steps.filter(function (s) { return s.status === 'done' || s.status === 'skipped'; }).length, total: steps.length
    };
  },

  // ───────── تحديد المسؤولين ─────────
  /** مستخدمو الدور في الوحدة (بلا مديري النظام) */
  roleUsers_: function (module, role) {
    return Db.view('core', 'UserRoles').filter(function (r) { return r.module === module && (!role || r.role === role); }).map(function (r) { return r.userId; });
  },

  empUser_: function (empId, emps) { var e = empId && emps[empId]; return e && e.userId && e.status !== 'terminated' ? e.userId : ''; },

  /** المسؤولون عن مرحلة لسجل منشئه createdBy. يعيد { ids, fallback } */
  resolve_: function (cfg, module, createdBy) {
    var users = indexBy_(Db.view('core', 'Users')), emps = indexBy_(Staff.all_()), depts = indexBy_(Staff.depts_());
    var creatorEmp = Staff.byUser_(createdBy), a = cfg.assignee || {}, ids = [];
    var deptMgr = function (deptId) { var d = deptId && depts[deptId]; return d && d.active !== false ? Workflow.empUser_(d.managerId, emps) : ''; };
    if (a.type === 'user') ids = [a.id];
    else if (a.type === 'role') ids = Workflow.roleUsers_(a.module || module, a.role);
    else if (a.type === 'direct_manager') ids = [Workflow.empUser_(Staff.managerIdOf_(creatorEmp, depts), emps)];
    else if (a.type === 'dept_manager') ids = [deptMgr(a.id)];
    else if (a.type === 'creator_dept_manager') ids = [deptMgr(creatorEmp && creatorEmp.departmentId)];
    var ok = function (list) { return list.filter(function (id, i, arr) { return id && users[id] && users[id].active && arr.indexOf(id) === i; }); };
    ids = ok(ids);
    // المنشئ لا يعتمد مستنده
    if (cfg.kind === 'approve') ids = ids.filter(function (id) { return id !== createdBy; });
    if (ids.length) return { ids: ids, fallback: false };
    // البديل: مدير المنشئ المباشر، ثم مديرو الوحدة، ثم مديرو النظام (بلا المنشئ في مرحلة اعتماد)
    var notCreator = function (list) { return cfg.kind === 'approve' ? list.filter(function (id) { return id !== createdBy; }) : list; };
    var supers = Db.view('core', 'Users').filter(function (u) { return u.isSuperAdmin; }).map(function (u) { return u.id; });
    var tiers = [[Workflow.empUser_(Staff.managerIdOf_(creatorEmp, depts), emps)], Workflow.roleUsers_(module, 'manager'), supers];
    for (var i = 0; i < tiers.length; i++) {
      var alt = notCreator(ok(tiers[i]));
      if (alt.length) return { ids: alt, fallback: true };
    }
    // مدير النظام هو المنشئ ولا أحد غيره: يبقى هو
    return { ids: ok(supers), fallback: true };
  },

  // ───────── القوالب ─────────
  templateSteps_: function (t) {
    return Workflow.rows_('WfSteps').filter(function (s) { return s.templateId === t.id && s.templateVersion === t.version; })
      .sort(function (a, b) { return a.order - b.order; });
  },

  assigneeLabel_: function (a, maps) {
    a = a || {};
    if (a.type === 'user') return Workflow.userName_(maps.users, a.id) || WF.ASSIGNEE.user;
    if (a.type === 'role') { var m = moduleDef_(a.module); return (m && m.roles[a.role]) || a.role; }
    if (a.type === 'dept_manager') { var d = maps.depts[a.id]; return 'مدير ' + (d ? d.name : 'القسم'); }
    return WF.ASSIGNEE[a.type] || '';
  },

  templateView_: function (t, maps) {
    return {
      id: t.id, name: t.name, description: t.description || '', module: t.module, version: t.version, status: t.status,
      statusLabel: WF.TEMPLATE_STATUS[t.status] || t.status, updatedAt: t.updatedAt,
      running: Workflow.rows_('WfInstances').filter(function (i) { return i.templateId === t.id && (i.status === 'running' || i.status === 'returned'); }).length,
      steps: Workflow.templateSteps_(t).map(function (s) {
        return { order: s.order, name: s.name, kind: s.kind, kindLabel: WF.KIND[s.kind] || s.kind, assignee: s.assignee || {}, assigneeLabel: Workflow.assigneeLabel_(s.assignee, maps), onReject: s.onReject || 'end' };
      })
    };
  },

  maps_: function () { return { users: indexBy_(Db.view('core', 'Users')), depts: indexBy_(Staff.depts_()) }; },

  /** قوالب وحدة (المنشور فقط إلا مع all) */
  templatesOf_: function (module, all) {
    var maps = Workflow.maps_();
    return Workflow.rows_('WfTemplates').filter(function (t) { return t.module === module && (all || t.status === 'published'); })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); }).map(function (t) { return Workflow.templateView_(t, maps); });
  },

  templates: function (ctx, p) {
    var module = String((p && p.module) || '');
    if (!Permissions.has(ctx, module)) throw appError('ليست لديك صلاحية لهذا الإجراء.', 'FORBIDDEN');
    return Workflow.templatesOf_(module, Workflow.isModuleMgr_(ctx, module));
  },

  /** خيارات محرر القالب: أنواع المراحل والمسؤولين وأدوار الوحدة والأقسام والمستخدمون */
  lookups: function (ctx, p) {
    // متاحة لكل مستخدم: صاحب المرحلة قد لا يكون له دور في الوحدة ويحتاج قائمة الأشخاص للإحالة
    var module = String((p && p.module) || ''), def = moduleDef_(module);
    if (!def) throw appError('الوحدة غير معروفة.');
    var dict = function (d) { return Object.keys(d).map(function (k) { return { id: k, label: d[k] }; }); };
    return {
      kinds: dict(WF.KIND), assignees: dict(WF.ASSIGNEE), onReject: dict(WF.ON_REJECT),
      roles: Object.keys(def.roles).map(function (k) { return { id: k, label: def.roles[k] }; }),
      departments: Staff.depts_().filter(function (d) { return d.active !== false; }).map(function (d) { return { id: d.id, name: d.name }; }),
      people: Db.view('core', 'Users').filter(function (u) { return u.active; }).map(function (u) { return { id: u.id, name: u.fullName }; })
        .sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); })
    };
  },

  /** حفظ قالب: { id?, module, name, description, status, steps: [{ name, kind, assignee: { type, id, role }, onReject }] } — كل حفظ إصدار جديد */
  templateSave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var cur = p.id ? Db.getOrThrow('workflow', 'WfTemplates', String(p.id), 'السلسلة') : null;
      var module = cur ? cur.module : String(p.module || '');
      if (!moduleDef_(module) || !ModuleProviders_().some(function (x) { return x.key === module && x.workflowHost; })) throw appError('الوحدة لا تدعم السلسلة الإجرائية.');
      if (!Workflow.isModuleMgr_(ctx, module)) throw appError('يضبط السلاسل مدير الوحدة.', 'FORBIDDEN');
      var name = requireText(p.name, 'اسم السلسلة', 80);
      if (Workflow.rows_('WfTemplates').some(function (t) { return t.module === module && t.name === name && (!cur || t.id !== cur.id); })) throw appError('اسم السلسلة مستخدم مسبقاً.');
      var list = Array.isArray(p.steps) ? p.steps : [];
      if (!list.length) throw appError('أضف مرحلة واحدة على الأقل.');
      if (list.length > WF.MAX_STEPS) throw appError('الحد الأقصى ' + WF.MAX_STEPS + ' مرحلة.');
      if (!list.some(function (s) { return s && s.kind !== 'inform'; })) throw appError('السلسلة تحتاج مرحلة واحدة على الأقل غير «اطلاع».');
      var users = indexBy_(Db.view('core', 'Users')), depts = indexBy_(Staff.depts_()), def = moduleDef_(module);
      var steps = list.map(function (s, i) {
        s = s || {};
        var label = 'المرحلة ' + (i + 1);
        var stepName = requireText(s.name, 'اسم ' + label, 60);
        var kind = s.kind && WF.KIND[s.kind] ? s.kind : null;
        if (!kind) throw appError(label + ': نوع المرحلة غير صحيح.');
        var a = s.assignee || {}, type = WF.ASSIGNEE[a.type] ? a.type : null, assignee = { type: type };
        if (!type) throw appError(label + ': حدّد المسؤول عن المرحلة.');
        if (type === 'user') { if (!users[a.id] || !users[a.id].active) throw appError(label + ': المستخدم غير موجود أو حسابه معطّل.'); assignee.id = a.id; }
        if (type === 'role') { if (!def.roles[a.role]) throw appError(label + ': الدور غير معروف.'); assignee.module = module; assignee.role = a.role; }
        if (type === 'dept_manager') { if (!depts[a.id]) throw appError(label + ': القسم غير موجود.'); assignee.id = a.id; }
        var onReject = s.onReject && WF.ON_REJECT[s.onReject] ? s.onReject : 'end';
        return { order: i + 1, group: i + 1, name: stepName, kind: kind, assignee: assignee, mode: 'single', count: 1, actions: null, noteRequired: null, fields: null, condition: null, slaHours: 0, workingDays: false, escalation: null, onReject: onReject };
      });
      var rec = {
        name: name, description: optionalText(p.description, 300),
        status: p.status === 'retired' ? 'retired' : 'published', updatedBy: ctx.user.id, updatedAt: nowIso()
      };
      var version = cur ? (cur.version || 1) + 1 : 1, saved;
      if (cur) saved = Db.update('workflow', 'WfTemplates', cur.id, Object.assign(rec, { version: version }));
      else saved = Db.insert('workflow', 'WfTemplates', Object.assign(rec, { module: module, version: version, createdBy: ctx.user.id, createdAt: nowIso() }));
      Db.insertMany('workflow', 'WfSteps', steps.map(function (s) { return Object.assign(s, { templateId: saved.id, templateVersion: version }); }));
      Audit.log(ctx.user, 'workflow', cur ? 'wf.template.update' : 'wf.template.create', 'WfTemplate', saved.id, { name: name, module: module, version: version, steps: steps.length, status: rec.status });
      return Workflow.templatesOf_(module, true);
    });
  },

  // ───────── المثيل ─────────
  record_: function (ctx, inst, step, action, note, extra) {
    extra = extra || {};
    var ent = Workflow.host_(inst.module).entity_(inst.entityId) || {};
    Db.insert('workflow', 'WfActions', {
      instanceId: inst.id, stepId: step ? step.id : '', action: action, byId: ctx && ctx.user ? ctx.user.id : '', onBehalfOf: '',
      entityVersion: ent.version || 0, note: note || '', toId: extra.toId || '', at: nowIso()
    });
  },

  /** يفعّل المرحلة التالية بعد after (ترتيب)، ويتخطى «اطلاع» بعد إحاطة مسؤوليها. يعيد المرحلة الحالية أو null إن انتهت المراحل */
  advance_: function (ctx, inst, after, ent) {
    var steps = Workflow.stepsOf_(inst.id).filter(function (s) { return s.order > after && s.status === 'pending'; });
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i], cfg = s.config || {}, r = Workflow.resolve_(cfg, inst.module, ent.createdBy);
      if (cfg.kind === 'inform') {
        Db.update('workflow', 'WfInstanceSteps', s.id, { assignees: r.ids, status: 'done', startedAt: nowIso(), endedAt: nowIso(), fallback: r.fallback });
        Workflow.record_(ctx, inst, s, 'inform', '');
        Audit.log(ctx.user, 'workflow', 'wf.inform', 'WfInstance', inst.id, { step: s.name, to: r.ids, number: ent.number });
        continue;
      }
      Db.update('workflow', 'WfInstanceSteps', s.id, { assignees: r.ids, status: 'current', startedAt: nowIso(), fallback: r.fallback, asking: false });
      Db.update('workflow', 'WfInstances', inst.id, { currentGroup: s.group, status: 'running' });
      return Db.get('workflow', 'WfInstanceSteps', s.id);
    }
    return null;
  },

  /** يبدأ سلسلة لسجل. تستدعيه الوحدة المضيفة داخل قفلها */
  start_: function (ctx, module, entityId, templateId) {
    var host = Workflow.host_(module), ent = host.entity_(entityId);
    if (!ent) throw appError('السجل غير موجود.', 'NOT_FOUND');
    var prev = Workflow.latestOf_(module, entityId);
    if (prev && (prev.status === 'running' || prev.status === 'returned')) throw appError('للمستند سلسلة جارية.');
    var t = Db.getOrThrow('workflow', 'WfTemplates', String(templateId || ''), 'السلسلة');
    if (t.module !== module || t.status !== 'published') throw appError('السلسلة غير متاحة.');
    var tsteps = Workflow.templateSteps_(t);
    if (!tsteps.length) throw appError('السلسلة بلا مراحل.');
    var inst = Db.insert('workflow', 'WfInstances', {
      module: module, entityId: entityId, templateId: t.id, templateVersion: t.version, templateName: t.name,
      status: 'running', currentGroup: 0, startedBy: ctx.user.id, startedAt: nowIso(), endedAt: ''
    });
    Db.insertMany('workflow', 'WfInstanceSteps', tsteps.map(function (s) {
      return {
        instanceId: inst.id, order: s.order, group: s.group, name: s.name, kind: s.kind, mode: s.mode || 'single', count: s.count || 1,
        assignees: [], status: 'pending', dueAt: '', escalationLevel: 0, startedAt: '', endedAt: '', actedBy: '', asking: false, fallback: false,
        config: { kind: s.kind, assignee: s.assignee, onReject: s.onReject || 'end', name: s.name }
      };
    }));
    Workflow.record_(ctx, inst, null, 'start', '');
    var cur = Workflow.advance_(ctx, inst, 0, ent);
    Audit.log(ctx.user, 'workflow', 'wf.start', 'WfInstance', inst.id, { number: ent.number, template: t.name, step: cur ? cur.name : '' });
    if (!cur) Workflow.finish_(ctx, inst, 'approved', ent);
    return Db.get('workflow', 'WfInstances', inst.id);
  },

  /** نهاية السلسلة: تُبلَّغ الوحدة المضيفة */
  finish_: function (ctx, inst, status, ent) {
    Db.update('workflow', 'WfInstances', inst.id, { status: status, endedAt: status === 'returned' ? '' : nowIso() });
    Workflow.host_(inst.module).onEvent_(ctx, status, Db.get('workflow', 'WfInstances', inst.id), ent);
  },

  /** إعادة إرسال سلسلة معادة للتعديل: تعود إلى المرحلة التي أعادتها، بمسؤوليها */
  resubmit_: function (ctx, instanceId, note) {
    var inst = Db.getOrThrow('workflow', 'WfInstances', instanceId, 'السلسلة');
    if (inst.status !== 'returned') throw appError('السلسلة ليست معادة للتعديل.');
    var step = Workflow.stepsOf_(inst.id).filter(function (s) { return s.status === 'returned'; })[0];
    if (!step) throw appError('تعذّر تحديد المرحلة المعادة.');
    Db.update('workflow', 'WfInstanceSteps', step.id, { status: 'current', startedAt: nowIso(), endedAt: '', actedBy: '', asking: false });
    Db.update('workflow', 'WfInstances', inst.id, { status: 'running', endedAt: '' });
    Workflow.record_(ctx, inst, step, 'resubmit', note || '');
    var ent = Workflow.host_(inst.module).entity_(inst.entityId) || {};
    Audit.log(ctx.user, 'workflow', 'wf.resubmit', 'WfInstance', inst.id, { number: ent.number, step: step.name });
    return Db.get('workflow', 'WfInstances', inst.id);
  },

  /** يحذف سلاسل سجل حُذف نهائياً (تستدعيه الوحدة المضيفة) */
  removeFor_: function (module, entityId) {
    var ids = Workflow.rows_('WfInstances').filter(function (i) { return i.module === module && i.entityId === entityId; }).map(function (i) { return i.id; });
    if (!ids.length) return;
    Db.removeWhere('workflow', 'WfInstanceSteps', function (s) { return ids.indexOf(s.instanceId) >= 0; });
    Db.removeWhere('workflow', 'WfActions', function (a) { return ids.indexOf(a.instanceId) >= 0; });
    Db.removeWhere('workflow', 'WfInstances', function (i) { return ids.indexOf(i.id) >= 0; });
  },

  /** ما يحق للمستخدم في السلسلة الآن */
  can_: function (ctx, inst, step, ent) {
    var u = ctx.user.id, holder = !!(step && (step.assignees || []).indexOf(u) >= 0), live = inst.status === 'running';
    var mgr = Workflow.isModuleMgr_(ctx, inst.module) || ctx.user.isSuperAdmin;
    var approvedOnce = Workflow.rows_('WfActions').some(function (a) { return a.instanceId === inst.id && a.action === 'approve'; });
    return {
      act: live && holder && !step.asking, ask: live && holder && !step.asking, answer: live && !!(step && step.asking) && ent.createdBy === u,
      cancel: (live || inst.status === 'returned') && (mgr || (ent.createdBy === u && !approvedOnce)),
      reassign: live && mgr && !!step
    };
  },

  /** عرض السلسلة الكامل لصفحة السجل */
  view_: function (ctx, inst) {
    var users = indexBy_(Db.view('core', 'Users')), ent = Workflow.host_(inst.module).entity_(inst.entityId) || {};
    var steps = Workflow.stepsOf_(inst.id), step = steps.filter(function (s) { return s.status === 'current'; })[0] || null;
    var acts = Workflow.rows_('WfActions').filter(function (a) { return a.instanceId === inst.id; }).sort(function (a, b) { return (a.at || '').localeCompare(b.at || ''); });
    var stepById = indexBy_(steps);
    var lastAct = {};
    acts.forEach(function (a) { if (a.stepId && ['approve', 'reject', 'return'].indexOf(a.action) >= 0) lastAct[a.stepId] = a; });
    return {
      id: inst.id, status: inst.status, statusLabel: WF.STATUS[inst.status] || inst.status, templateName: inst.templateName || '', templateVersion: inst.templateVersion,
      startedAt: inst.startedAt, endedAt: inst.endedAt || '', startedByName: Workflow.userName_(users, inst.startedBy),
      steps: steps.map(function (s) {
        var la = lastAct[s.id];
        return {
          id: s.id, order: s.order, name: s.name, kind: s.kind, kindLabel: WF.KIND[s.kind] || s.kind, status: s.status, statusLabel: WF.STEP[s.status] || s.status,
          assignees: (s.assignees || []).map(function (u) { return { id: u, name: Workflow.userName_(users, u) }; }), fallback: !!s.fallback, asking: !!s.asking,
          startedAt: s.startedAt || '', endedAt: s.endedAt || '', actedByName: Workflow.userName_(users, s.actedBy), note: la ? la.note : ''
        };
      }),
      actions: acts.map(function (a) {
        var st = a.stepId && stepById[a.stepId];
        return { id: a.id, action: a.action, label: WF.ACTION[a.action] || a.action, byName: Workflow.userName_(users, a.byId), toName: Workflow.userName_(users, a.toId), step: st ? st.name : '', note: a.note || '', version: a.entityVersion || 0, at: a.at };
      }),
      current: step ? { id: step.id, name: step.name, kind: step.kind, asking: !!step.asking } : null,
      can: Workflow.can_(ctx, inst, step, ent)
    };
  },

  // ───────── الإجراءات ─────────
  /** wf.act: { instanceId, action: approve | reject | return | forward | ask | answer, note, toId } */
  act: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var inst = Db.getOrThrow('workflow', 'WfInstances', String(p.instanceId || ''), 'السلسلة');
      var host = Workflow.host_(inst.module), ent = host.entity_(inst.entityId);
      if (!ent) throw appError('السجل غير موجود.', 'NOT_FOUND');
      if (inst.status !== 'running') throw appError('السلسلة ليست جارية.');
      var step = Workflow.currentStep_(inst), action = String(p.action || ''), note = optionalText(p.note, 1000), can = Workflow.can_(ctx, inst, step, ent);
      if (!WF.ACTION[action] || ['approve', 'reject', 'return', 'forward', 'ask', 'answer'].indexOf(action) < 0) throw appError('الإجراء غير معروف.');
      var d = { number: ent.number, step: step ? step.name : '', note: note };
      if (action === 'answer') {
        if (!can.answer) throw appError('لا يوجد استيضاح بانتظار ردك.', 'FORBIDDEN');
        if (!note) throw appError('اكتب الإيضاح.');
        Db.update('workflow', 'WfInstanceSteps', step.id, { asking: false });
        Workflow.record_(ctx, inst, step, 'answer', note);
        Audit.log(ctx.user, 'workflow', 'wf.answer', 'WfInstance', inst.id, Object.assign(d, { to: step.assignees || [] }));
        return Workflow.view_(ctx, Db.get('workflow', 'WfInstances', inst.id));
      }
      if (!step || (step.assignees || []).indexOf(ctx.user.id) < 0) throw appError('ليست هذه مرحلتك في السلسلة.', 'FORBIDDEN');
      if (step.asking) throw appError('المرحلة بانتظار إيضاح من المنشئ.');
      if ((action === 'reject' || action === 'return' || action === 'ask') && !note) {
        throw appError(action === 'ask' ? 'اكتب سؤال الاستيضاح.' : action === 'reject' ? 'اكتب سبب الرفض.' : 'اكتب ما المطلوب تعديله.');
      }
      var cfg = step.config || {};
      if (action === 'reject' && cfg.onReject === 'creator') action = 'return';
      if (action === 'approve') {
        Db.update('workflow', 'WfInstanceSteps', step.id, { status: 'done', endedAt: nowIso(), actedBy: ctx.user.id });
        Workflow.record_(ctx, inst, step, 'approve', note);
        var next = Workflow.advance_(ctx, inst, step.order, ent);
        Audit.log(ctx.user, 'workflow', 'wf.approve', 'WfInstance', inst.id, Object.assign(d, { next: next ? next.name : '', final: !next }));
        if (!next) Workflow.finish_(ctx, inst, 'approved', ent);
      } else if (action === 'reject') {
        Db.update('workflow', 'WfInstanceSteps', step.id, { status: 'rejected', endedAt: nowIso(), actedBy: ctx.user.id });
        Db.updateWhere('workflow', 'WfInstanceSteps', function (s) { return s.instanceId === inst.id && s.status === 'pending' ? { status: 'cancelled' } : null; });
        Workflow.record_(ctx, inst, step, 'reject', note);
        Audit.log(ctx.user, 'workflow', 'wf.reject', 'WfInstance', inst.id, d);
        Workflow.finish_(ctx, inst, 'rejected', ent);
      } else if (action === 'return') {
        Db.update('workflow', 'WfInstanceSteps', step.id, { status: 'returned', endedAt: nowIso(), actedBy: ctx.user.id });
        Workflow.record_(ctx, inst, step, 'return', note);
        Audit.log(ctx.user, 'workflow', 'wf.return', 'WfInstance', inst.id, d);
        Workflow.finish_(ctx, inst, 'returned', ent);
      } else if (action === 'forward') {
        var to = String(p.toId || ''), tu = Db.get('core', 'Users', to);
        if (!tu || !tu.active) throw appError('المحال إليه غير موجود أو حسابه معطّل.');
        if (to === ctx.user.id) throw appError('اختر شخصاً غيرك.');
        if (cfg.kind === 'approve' && to === ent.createdBy) throw appError('لا يُحال الاعتماد إلى منشئ المستند.');
        Db.update('workflow', 'WfInstanceSteps', step.id, { assignees: [to] });
        Workflow.record_(ctx, inst, step, 'forward', note, { toId: to });
        Audit.log(ctx.user, 'workflow', 'wf.forward', 'WfInstance', inst.id, Object.assign(d, { to: to }));
      } else if (action === 'ask') {
        Db.update('workflow', 'WfInstanceSteps', step.id, { asking: true });
        Workflow.record_(ctx, inst, step, 'ask', note);
        Audit.log(ctx.user, 'workflow', 'wf.ask', 'WfInstance', inst.id, d);
      }
      return Workflow.view_(ctx, Db.get('workflow', 'WfInstances', inst.id));
    });
  },

  /** wf.cancel: المنشئ قبل أول اعتماد، أو مدير الوحدة بسبب */
  cancel: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var inst = Db.getOrThrow('workflow', 'WfInstances', String(p.instanceId || ''), 'السلسلة');
      var ent = Workflow.host_(inst.module).entity_(inst.entityId) || {}, step = Workflow.currentStep_(inst);
      if (!Workflow.can_(ctx, inst, step, ent).cancel) throw appError('لا يمكنك إلغاء هذه السلسلة.', 'FORBIDDEN');
      var note = optionalText(p.note, 500);
      if (!note) throw appError('اكتب سبب الإلغاء.');
      var holders = step ? step.assignees || [] : [];
      Db.updateWhere('workflow', 'WfInstanceSteps', function (s) { return s.instanceId === inst.id && (s.status === 'pending' || s.status === 'current' || s.status === 'returned') ? { status: 'cancelled', asking: false } : null; });
      Workflow.record_(ctx, inst, step, 'cancel', note);
      Audit.log(ctx.user, 'workflow', 'wf.cancel', 'WfInstance', inst.id, { number: ent.number, note: note, to: holders });
      Workflow.finish_(ctx, inst, 'cancelled', ent);
      return true;
    });
  },

  /** wf.reassign: مدير الوحدة يسند المرحلة الحالية لشخص آخر بسبب */
  reassign: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var inst = Db.getOrThrow('workflow', 'WfInstances', String(p.instanceId || ''), 'السلسلة');
      var ent = Workflow.host_(inst.module).entity_(inst.entityId) || {}, step = Workflow.currentStep_(inst);
      if (!Workflow.can_(ctx, inst, step, ent).reassign) throw appError('يعيد إسناد المرحلة مدير الوحدة.', 'FORBIDDEN');
      var to = String(p.toId || ''), tu = Db.get('core', 'Users', to), note = optionalText(p.note, 500);
      if (!tu || !tu.active) throw appError('المسؤول الجديد غير موجود أو حسابه معطّل.');
      if (!note) throw appError('اكتب سبب إعادة الإسناد.');
      if ((step.config || {}).kind === 'approve' && to === ent.createdBy) throw appError('لا يُسند الاعتماد إلى منشئ المستند.');
      Db.update('workflow', 'WfInstanceSteps', step.id, { assignees: [to], asking: false });
      Workflow.record_(ctx, inst, step, 'reassign', note, { toId: to });
      Audit.log(ctx.user, 'workflow', 'wf.reassign', 'WfInstance', inst.id, { number: ent.number, step: step.name, to: to, note: note });
      return Workflow.view_(ctx, Db.get('workflow', 'WfInstances', inst.id));
    });
  },

  // ───────── صندوق الموافقات والإشعارات ─────────
  inbox_: function (ctx) {
    var u = ctx.user.id, out = [], users = null;
    Workflow.rows_('WfInstanceSteps').forEach(function (s) {
      if (s.status !== 'current' || s.asking || (s.assignees || []).indexOf(u) < 0) return;
      var inst = Workflow.index_().instById[s.instanceId];
      if (!inst || inst.status !== 'running') return;
      var host, ent;
      try { host = Workflow.host_(inst.module); ent = host.entity_(inst.entityId); } catch (e) { return; }
      if (!ent) return;
      users = users || indexBy_(Db.view('core', 'Users'));
      var steps = Workflow.stepsOf_(inst.id);
      out.push({
        id: 'wf.step:' + s.id, kind: 'wf.step', refId: inst.id, module: 'workflow', moduleLabel: ent.moduleLabel + ' · ' + s.name,
        title: ent.number + ' · ' + ent.title, who: Workflow.userName_(users, ent.createdBy), createdAt: s.startedAt, status: WF.KIND[s.kind] || s.kind,
        note: '', needsNoteOnReject: true,
        facts: [{ k: 'السلسلة', v: inst.templateName || '' }, { k: 'المرحلة', v: s.order + ' من ' + steps.length }].concat(ent.facts || []),
        approveLabel: s.kind === 'review' ? 'تمت المراجعة' : s.kind === 'execute' ? 'تم التنفيذ' : 'اعتماد', rejectLabel: 'إعادة للتعديل',
        link: host.link_(inst.entityId, u)
      });
    });
    return out;
  },

  /** القرار من الصندوق: الاعتماد، والرفض فيه «إعادة للتعديل» بسبب. الرفض النهائي من صفحة المستند */
  decide_: function (ctx, kind, p) {
    if (kind !== 'wf.step') return null;
    return Workflow.act(ctx, { instanceId: p.id, action: p.approve ? 'approve' : 'return', note: p.note });
  },

  approvers_: function (instanceId) {
    var s = Workflow.rows_('WfInstanceSteps').filter(function (x) { return x.instanceId === instanceId && x.status === 'current'; })[0];
    return s ? s.assignees || [] : [];
  },

  notify_: function (ev) {
    var inst = Db.get('workflow', 'WfInstances', ev.id), d = ev.details || {}, a = ev.actor ? ev.actor.fullName : '', out = [];
    if (!inst) return out;
    var host = Workflow.host_(inst.module), ent = host.entity_(inst.entityId);
    if (!ent) return out;
    var detail = ent.number + ' · ' + ent.title + (d.note ? ' — ' + d.note : '');
    var to = function (ids, title) { [].concat(ids || []).forEach(function (uid) { if (uid) out.push({ to: uid, title: title, detail: detail, link: host.link_(inst.entityId, uid) }); }); };
    if (ev.action === 'wf.approve' && d.final) to(ent.createdBy, 'اعتُمد مستندك');
    else if (ev.action === 'wf.reject') to(ent.createdBy, 'رفض ' + a + ' مستندك');
    else if (ev.action === 'wf.return') to(ent.createdBy, 'أعاد ' + a + ' مستندك للتعديل');
    else if (ev.action === 'wf.ask') to(ent.createdBy, 'يطلب ' + a + ' استيضاحاً على مستندك');
    else if (ev.action === 'wf.answer') to(d.to, 'ردّ ' + a + ' على الاستيضاح');
    else if (ev.action === 'wf.inform') to(d.to, 'مستند للاطلاع');
    else if (ev.action === 'wf.cancel') to(d.to, 'أُلغيت سلسلة مستند كان بانتظارك');
    return out;
  },

  routes_: function () {
    return {
      'wf.templates': { fn: Workflow.templates },
      'wf.lookups': { fn: Workflow.lookups },
      'wf.template.save': { fn: Workflow.templateSave },
      'wf.act': { fn: Workflow.act },
      'wf.cancel': { fn: Workflow.cancel },
      'wf.reassign': { fn: Workflow.reassign }
    };
  }
};
