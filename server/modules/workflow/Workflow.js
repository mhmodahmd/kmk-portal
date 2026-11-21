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
 *
 * المرحلة 3: شرط ظهور لكل مرحلة ({ field, op, value } على قيم السجل التي يقدّمها المضيف في entity_.values)،
 * فالمرحلة التي لا يتحقق شرطها «متخطاة»؛ قواعد التوجيه (WfRules) تختار السلسلة عند الإرسال؛ سجل الإصدارات؛ والمحاكاة.
 * المضيف يقدّم أيضاً: conditionFields_() للحقول المتاحة في الشروط، و simEntity_(ctx, p) لسجل افتراضي في المحاكاة.
 *
 * المرحلة 5: المراحل المتوازية (مجموعة واحدة تُفعَّل معاً وتكتمل باكتمالها كلها)، وأنماط القرار داخل المرحلة
 * (أي واحد · الكل · عدد محدد)، والتفويض (Delegations، لا يتسلسل، ويُسجَّل «نيابةً عن»)، ومدة كل مرحلة بأيام العمل
 * والتصعيد (تذكير ← مدير المسؤول ← بديل)، والملخص البريدي اليومي بدل رسالة لكل حدث.
 */
var WF_SCHEMA = {
  WfTemplates: [
    ['id', 'text'], ['name', 'text'], ['description', 'text'], ['module', 'text'], ['version', 'num'], ['status', 'text'],
    ['createdBy', 'text'], ['createdAt', 'ts'], ['updatedBy', 'text'], ['updatedAt', 'ts']
  ],
  WfSteps: [
    ['id', 'text'], ['templateId', 'text'], ['templateVersion', 'num'], ['order', 'num'], ['group', 'num'], ['name', 'text'], ['kind', 'text'],
    ['assignee', 'json'], ['mode', 'text'], ['count', 'num'], ['actions', 'json'], ['noteRequired', 'json'], ['fields', 'json'], ['condition', 'json'],
    ['slaHours', 'num'], ['workingDays', 'bool'], ['escalation', 'json'], ['onReject', 'text'], ['savedAt', 'ts'], ['savedBy', 'text']
  ],
  WfRules: [
    ['id', 'text'], ['module', 'text'], ['name', 'text'], ['typeId', 'text'], ['departmentId', 'text'], ['field', 'text'], ['op', 'text'], ['value', 'json'],
    ['confidentiality', 'text'], ['templateId', 'text'], ['priority', 'num'], ['active', 'bool'], ['createdAt', 'ts'], ['updatedAt', 'ts']
  ],
  WfInstances: [
    ['id', 'text'], ['module', 'text'], ['entityId', 'text'], ['templateId', 'text'], ['templateVersion', 'num'], ['templateName', 'text'],
    ['status', 'text'], ['currentGroup', 'num'], ['startedBy', 'text'], ['startedAt', 'ts'], ['endedAt', 'ts']
  ],
  WfInstanceSteps: [
    ['id', 'text'], ['instanceId', 'text'], ['order', 'num'], ['group', 'num'], ['name', 'text'], ['kind', 'text'], ['mode', 'text'], ['count', 'num'],
    ['assignees', 'json'], ['status', 'text'], ['dueAt', 'ts'], ['escalationLevel', 'num'], ['startedAt', 'ts'], ['endedAt', 'ts'],
    ['actedBy', 'text'], ['asking', 'bool'], ['fallback', 'bool'], ['config', 'json'], ['approvals', 'json']
  ],
  Delegations: [
    ['id', 'text'], ['fromUserId', 'text'], ['toUserId', 'text'], ['from', 'date'], ['to', 'date'], ['module', 'text'], ['reason', 'text'],
    ['active', 'bool'], ['createdAt', 'ts'], ['endedAt', 'ts']
  ],
  WfActions: [
    ['id', 'text'], ['instanceId', 'text'], ['stepId', 'text'], ['action', 'text'], ['byId', 'text'], ['onBehalfOf', 'text'],
    ['entityVersion', 'num'], ['note', 'text'], ['toId', 'text'], ['at', 'ts']
  ]
};

var WF = {
  KIND: { review: 'مراجعة', approve: 'اعتماد', sign: 'توقيع', execute: 'تنفيذ', inform: 'اطلاع' },
  ASSIGNEE: { user: 'مستخدم محدد', role: 'دور في الوحدة', direct_manager: 'المدير المباشر للمنشئ', dept_manager: 'مدير قسم محدد', creator_dept_manager: 'مدير قسم المنشئ' },
  ON_REJECT: { end: 'إنهاء السلسلة (مرفوض)', creator: 'إعادة إلى المنشئ للتعديل' },
  STATUS: { running: 'جارية', returned: 'معادة للتعديل', approved: 'معتمدة', rejected: 'مرفوضة', cancelled: 'ملغاة' },
  STEP: { pending: 'لم تبدأ', current: 'حالية', done: 'مكتملة', rejected: 'مرفوضة', returned: 'معادة', skipped: 'متخطاة', cancelled: 'ملغاة' },
  ACTION: {
    start: 'بدء السلسلة', approve: 'اعتماد', reject: 'رفض', return: 'إعادة للتعديل', forward: 'إحالة', ask: 'طلب استيضاح', answer: 'إيضاح',
    resubmit: 'إعادة الإرسال', cancel: 'إلغاء السلسلة', reassign: 'إعادة إسناد', inform: 'إحاطة', assign: 'إسناد', skip: 'تخطٍّ', sign: 'توقيع', escalate: 'تصعيد'
  },
  MODE: { any: 'أي واحد منهم', all: 'كلهم', count: 'عدد محدد' },
  OPS: { eq: 'يساوي', neq: 'لا يساوي', gt: 'أكبر من', gte: 'أكبر من أو يساوي', lt: 'أصغر من', lte: 'أصغر من أو يساوي' },
  MAX_RULES: 50,
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
      asking: !!(cur && cur.asking), overdue: steps.some(function (s) { return s.status === 'current' && s.dueAt && s.dueAt < nowIso(); }), dots: steps.map(function (s) { return s.status; }), done: steps.filter(function (s) { return s.status === 'done' || s.status === 'skipped'; }).length, total: steps.length
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
    // المنشئ لا يعتمد مستنده ولا يوقّعه
    var approving = cfg.kind === 'approve' || cfg.kind === 'sign';
    if (approving) ids = ids.filter(function (id) { return id !== createdBy; });
    if (ids.length) return { ids: ids, fallback: false };
    // البديل: مدير المنشئ المباشر، ثم مديرو الوحدة، ثم مديرو النظام (بلا المنشئ في مرحلة اعتماد)
    var notCreator = function (list) { return approving ? list.filter(function (id) { return id !== createdBy; }) : list; };
    var supers = Db.view('core', 'Users').filter(function (u) { return u.isSuperAdmin; }).map(function (u) { return u.id; });
    var tiers = [[Workflow.empUser_(Staff.managerIdOf_(creatorEmp, depts), emps)], Workflow.roleUsers_(module, 'manager'), supers];
    for (var i = 0; i < tiers.length; i++) {
      var alt = notCreator(ok(tiers[i]));
      if (alt.length) return { ids: alt, fallback: true };
    }
    // مدير النظام هو المنشئ ولا أحد غيره: يبقى هو
    return { ids: ok(supers), fallback: true };
  },

  // ───────── الشروط ─────────
  /** هل تتحقق القيمة؟ الأرقام والمبالغ (بالفلس) تُقارن رقمياً، وغيرها نصياً */
  test_: function (cond, values) {
    if (!cond || !cond.field) return true;
    var v = values ? values[cond.field] : undefined, w = cond.value;
    if (v === undefined || v === null || v === '') return cond.op === 'neq' && w !== '' && w != null;
    var num = typeof w === 'number' || (typeof v === 'number' && !isNaN(Number(w)));
    var a = num ? Number(v) : String(v), b = num ? Number(w) : String(w);
    switch (cond.op) {
      case 'neq': return a !== b;
      case 'gt': return num && a > b;
      case 'gte': return num && a >= b;
      case 'lt': return num && a < b;
      case 'lte': return num && a <= b;
      default: return a === b;
    }
  },

  /** يتحقق من شرط ويطبّعه بنوع الحقل (المبلغ بالدينار يُحفظ بالفلس). label للرسائل */
  normalizeCond_: function (module, c, label) {
    if (!c || !c.field) return null;
    var f = Workflow.condFields_(module).filter(function (x) { return x.key === c.field; })[0];
    if (!f) throw appError(label + ': حقل الشرط غير موجود.');
    var op = WF.OPS[c.op] ? c.op : null;
    if (!op) throw appError(label + ': عملية الشرط غير صحيحة.');
    var numeric = f.kind === 'number' || f.kind === 'money';
    if (!numeric && ['gt', 'gte', 'lt', 'lte'].indexOf(op) >= 0) throw appError(label + ': المقارنة بالأكبر والأصغر للأرقام والمبالغ فقط.');
    var raw = c.value == null ? '' : String(c.value).trim(), value;
    if (raw === '') throw appError(label + ': أدخل قيمة الشرط.');
    if (f.kind === 'money') value = parseMoney_(raw, 'قيمة الشرط', { allowZero: true });
    else if (f.kind === 'number') { value = Number(normalizeDigits(raw)); if (!isFinite(value)) throw appError(label + ': قيمة الشرط غير صحيحة.'); }
    else if (f.options && f.options.length) {
      if (!f.options.some(function (o) { return o.id === raw; })) throw appError(label + ': القيمة غير موجودة في قائمة الحقل.');
      value = raw;
    } else value = raw;
    return { field: f.key, op: op, value: value };
  },

  condFields_: function (module) {
    var host = Workflow.host_(module);
    return host.conditionFields_ ? host.conditionFields_() : [];
  },

  condLabel_: function (module, c, fields) {
    if (!c || !c.field) return '';
    var f = (fields || Workflow.condFields_(module)).filter(function (x) { return x.key === c.field; })[0];
    if (!f) return '';
    var v = c.value;
    if (f.kind === 'money') v = kwd_(v);
    else if (f.options && f.options.length) { var o = f.options.filter(function (x) { return x.id === String(c.value); })[0]; v = o ? o.label : c.value; }
    return f.label + ' ' + (WF.OPS[c.op] || '') + ' ' + v;
  },

  // ───────── قواعد التوجيه ─────────
  /** أول قاعدة نشطة تنطبق (بالأولوية) ← معرّف السلسلة، أو '' */
  route_: function (module, values) {
    values = values || {};
    var rules = Workflow.rows_('WfRules').filter(function (r) { return r.module === module && r.active; }).sort(function (a, b) { return a.priority - b.priority; });
    var live = indexBy_(Workflow.rows_('WfTemplates').filter(function (t) { return t.status === 'published'; }));
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (!live[r.templateId]) continue;
      if (r.typeId && values.$type !== r.typeId) continue;
      if (r.departmentId && values.$dept !== r.departmentId) continue;
      if (r.confidentiality && values.$conf !== r.confidentiality) continue;
      if (r.field && !Workflow.test_({ field: r.field, op: r.op, value: r.value }, values)) continue;
      return r.id ? { templateId: r.templateId, ruleId: r.id, ruleName: r.name || '' } : null;
    }
    return null;
  },

  ruleView_: function (r, maps, fields, types) {
    var t = maps.templates[r.templateId], d = r.departmentId && maps.depts[r.departmentId], ty = r.typeId && types[r.typeId];
    var parts = [];
    if (ty) parts.push('النوع: ' + ty);
    if (d) parts.push('القسم: ' + d.name);
    if (r.confidentiality) parts.push('السرية: ' + ((fields.filter(function (f) { return f.key === '$conf'; })[0] || { options: [] }).options.filter(function (o) { return o.id === r.confidentiality; }).map(function (o) { return o.label; })[0] || r.confidentiality));
    if (r.field) parts.push(Workflow.condLabel_(r.module, { field: r.field, op: r.op, value: r.value }, fields));
    return {
      id: r.id, name: r.name || '', typeId: r.typeId || '', departmentId: r.departmentId || '', confidentiality: r.confidentiality || '',
      field: r.field || '', op: r.op || 'eq', value: r.value == null ? '' : r.value, templateId: r.templateId, templateName: t ? t.name : '', templateLive: !!(t && t.status === 'published'),
      priority: r.priority, active: !!r.active, summary: parts.length ? parts.join(' · ') : 'كل المستندات'
    };
  },

  rules: function (ctx, p) {
    var module = String((p && p.module) || '');
    if (!Workflow.isModuleMgr_(ctx, module)) throw appError('يضبط قواعد التوجيه مدير الوحدة.', 'FORBIDDEN');
    var maps = Workflow.maps_(), fields = Workflow.condFields_(module);
    maps.templates = indexBy_(Workflow.rows_('WfTemplates'));
    var typeOpt = (fields.filter(function (f) { return f.key === '$type'; })[0] || { options: [] }).options, types = {};
    typeOpt.forEach(function (o) { types[o.id] = o.label; });
    return Workflow.rows_('WfRules').filter(function (r) { return r.module === module; }).sort(function (a, b) { return a.priority - b.priority; })
      .map(function (r) { return Workflow.ruleView_(r, maps, fields, types); });
  },

  /** حفظ قاعدة: { id?, module, name, typeId, departmentId, confidentiality, field, op, value, templateId, active } */
  ruleSave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var cur = p.id ? Db.getOrThrow('workflow', 'WfRules', String(p.id), 'القاعدة') : null;
      var module = cur ? cur.module : String(p.module || '');
      if (!Workflow.isModuleMgr_(ctx, module)) throw appError('يضبط قواعد التوجيه مدير الوحدة.', 'FORBIDDEN');
      var t = Db.get('workflow', 'WfTemplates', String(p.templateId || ''));
      if (!t || t.module !== module || t.status !== 'published') throw appError('اختر سلسلة منشورة للقاعدة.');
      var fields = Workflow.condFields_(module), opt = function (key, v) {
        if (!v) return '';
        var f = fields.filter(function (x) { return x.key === key; })[0];
        if (!f || !f.options.some(function (o) { return o.id === String(v); })) throw appError('قيمة غير موجودة في القاعدة.');
        return String(v);
      };
      var cond = p.field ? Workflow.normalizeCond_(module, { field: p.field, op: p.op, value: p.value }, 'القاعدة') : null;
      var rec = {
        name: optionalText(p.name, 80), typeId: opt('$type', p.typeId), departmentId: opt('$dept', p.departmentId), confidentiality: opt('$conf', p.confidentiality),
        field: cond ? cond.field : '', op: cond ? cond.op : '', value: cond ? cond.value : '', templateId: t.id,
        active: p.active !== false && p.active !== 'false', updatedAt: nowIso()
      };
      var rows = Workflow.rows_('WfRules').filter(function (r) { return r.module === module; });
      if (!cur && rows.length >= WF.MAX_RULES) throw appError('الحد الأقصى ' + WF.MAX_RULES + ' قاعدة.');
      var saved = cur ? Db.update('workflow', 'WfRules', cur.id, rec)
        : Db.insert('workflow', 'WfRules', Object.assign(rec, { module: module, priority: rows.reduce(function (mx, r) { return Math.max(mx, r.priority || 0); }, 0) + 1, createdAt: nowIso() }));
      Audit.log(ctx.user, 'workflow', cur ? 'wf.rule.update' : 'wf.rule.create', 'WfRule', saved.id, { template: t.name, active: rec.active });
      return Workflow.rules(ctx, { module: module });
    });
  },

  ruleMove: function (ctx, p) {
    var r = Db.getOrThrow('workflow', 'WfRules', String((p && p.id) || ''), 'القاعدة');
    if (!Workflow.isModuleMgr_(ctx, r.module)) throw appError('يضبط قواعد التوجيه مدير الوحدة.', 'FORBIDDEN');
    var rows = Workflow.rows_('WfRules').filter(function (x) { return x.module === r.module; }).sort(function (a, b) { return a.priority - b.priority; });
    var i = rows.map(function (x) { return x.id; }).indexOf(r.id), j = i + (p.dir === 'up' ? -1 : 1);
    if (j >= 0 && j < rows.length) {
      Db.update('workflow', 'WfRules', rows[i].id, { priority: rows[j].priority });
      Db.update('workflow', 'WfRules', rows[j].id, { priority: rows[i].priority });
    }
    return Workflow.rules(ctx, { module: r.module });
  },

  ruleRemove: function (ctx, p) {
    var r = Db.getOrThrow('workflow', 'WfRules', String((p && p.id) || ''), 'القاعدة');
    if (!Workflow.isModuleMgr_(ctx, r.module)) throw appError('يضبط قواعد التوجيه مدير الوحدة.', 'FORBIDDEN');
    Db.remove('workflow', 'WfRules', r.id);
    Audit.log(ctx.user, 'workflow', 'wf.rule.delete', 'WfRule', r.id, {});
    return Workflow.rules(ctx, { module: r.module });
  },

  // ───────── المحاكاة ─────────
  /**
   * wf.simulate: { module, templateId?, ...سجل افتراضي يبنيه المضيف (simEntity_) } — السلسلة التي ستُختار ومسارها:
   * المراحل المتخطاة بشرطها، والمسؤولون كما سيُحسبون الآن. لا يكتب شيئاً.
   */
  simulate: function (ctx, p) {
    p = p || {};
    var module = String(p.module || '');
    if (!Workflow.isModuleMgr_(ctx, module)) throw appError('المحاكاة لمدير الوحدة.', 'FORBIDDEN');
    var host = Workflow.host_(module), ent = host.simEntity_(ctx, p);
    var picked = p.templateId ? { templateId: String(p.templateId), ruleName: '' } : Workflow.route_(module, ent.values) || (ent.defaultTemplateId ? { templateId: ent.defaultTemplateId, ruleName: '' } : null);
    if (!picked) return { template: null, source: 'none', steps: [] };
    var t = Db.getOrThrow('workflow', 'WfTemplates', picked.templateId, 'السلسلة'), users = indexBy_(Db.view('core', 'Users'));
    var fields = Workflow.condFields_(module);
    return {
      template: { id: t.id, name: t.name, version: t.version }, source: p.templateId ? 'chosen' : picked.ruleId ? 'rule' : 'default', ruleName: picked.ruleName || '',
      steps: Workflow.templateSteps_(t).map(function (s) {
        var cfg = { kind: s.kind, assignee: s.assignee }, skipped = !Workflow.test_(s.condition, ent.values);
        var r = skipped ? { ids: [], fallback: false } : Workflow.resolve_(cfg, module, ent.createdBy);
        return { order: s.order, name: s.name, kind: s.kind, kindLabel: WF.KIND[s.kind] || s.kind, skipped: skipped, condition: Workflow.condLabel_(module, s.condition, fields),
          assignees: r.ids.map(function (u) { return Workflow.userName_(users, u); }), fallback: r.fallback };
      })
    };
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
        return { order: s.order, group: s.group || s.order, name: s.name, kind: s.kind, kindLabel: WF.KIND[s.kind] || s.kind, assignee: s.assignee || {}, assigneeLabel: Workflow.assigneeLabel_(s.assignee, maps), onReject: s.onReject || 'end',
          mode: s.mode === 'single' ? 'any' : s.mode || 'any', count: s.count || 1, slaHours: s.slaHours || 0, workingDays: s.workingDays !== false, escalation: s.escalation || null,
          condition: s.condition || null, conditionLabel: Workflow.condLabel_(t.module, s.condition, maps.condFields && maps.condFields[t.module]) };
      })
    };
  },

  maps_: function () { return { users: indexBy_(Db.view('core', 'Users')), depts: indexBy_(Staff.depts_()), condFields: {} }; },

  /** قوالب وحدة (المنشور فقط إلا مع all) */
  templatesOf_: function (module, all) {
    var maps = Workflow.maps_();
    maps.condFields[module] = Workflow.condFields_(module);
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
      kinds: dict(WF.KIND), assignees: dict(WF.ASSIGNEE), onReject: dict(WF.ON_REJECT), ops: dict(WF.OPS), modes: dict(WF.MODE), conditionFields: Workflow.condFields_(module),
      roles: Object.keys(def.roles).map(function (k) { return { id: k, label: def.roles[k] }; }),
      departments: Staff.depts_().filter(function (d) { return d.active !== false; }).map(function (d) { return { id: d.id, name: d.name }; }),
      people: Db.view('core', 'Users').filter(function (u) { return u.active; }).map(function (u) { return { id: u.id, name: u.fullName }; })
        .sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); })
    };
  },

  /** wf.template.versions: إصدارات قالب بمراحل كل إصدار، الأحدث أولاً */
  templateVersions: function (ctx, p) {
    var t = Db.getOrThrow('workflow', 'WfTemplates', String((p && p.id) || ''), 'السلسلة');
    if (!Workflow.isModuleMgr_(ctx, t.module)) throw appError('ليست لديك صلاحية لهذا الإجراء.', 'FORBIDDEN');
    var users = indexBy_(Db.view('core', 'Users')), by = {}, fields = Workflow.condFields_(t.module);
    Workflow.rows_('WfSteps').forEach(function (s) { if (s.templateId === t.id) (by[s.templateVersion] = by[s.templateVersion] || []).push(s); });
    var used = {};
    Workflow.rows_('WfInstances').forEach(function (i) { if (i.templateId === t.id) used[i.templateVersion] = (used[i.templateVersion] || 0) + 1; });
    return Object.keys(by).map(Number).sort(function (a, b) { return b - a; }).map(function (v) {
      var steps = by[v].sort(function (a, b) { return a.order - b.order; });
      return {
        version: v, current: v === t.version, savedAt: steps[0].savedAt || '', savedByName: Workflow.userName_(users, steps[0].savedBy), documents: used[v] || 0,
        steps: steps.map(function (s) { return { name: s.name, kindLabel: WF.KIND[s.kind] || s.kind, condition: Workflow.condLabel_(t.module, s.condition, fields) }; })
      };
    });
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
      var users = indexBy_(Db.view('core', 'Users')), depts = indexBy_(Staff.depts_()), def = moduleDef_(module), group = 0;
      var steps = list.map(function (s, i) {
        s = s || {};
        var label = 'المرحلة ' + (i + 1);
        var stepName = requireText(s.name, 'اسم ' + label, 60);
        var kind = s.kind && WF.KIND[s.kind] ? s.kind : null;
        if (!kind) throw appError(label + ': نوع المرحلة غير صحيح.');
        if (kind === 'sign' && !Workflow.host_(module).sign_) throw appError(label + ': الوحدة لا تدعم التوقيع.');
        var a = s.assignee || {}, type = WF.ASSIGNEE[a.type] ? a.type : null, assignee = { type: type };
        if (!type) throw appError(label + ': حدّد المسؤول عن المرحلة.');
        if (type === 'user') { if (!users[a.id] || !users[a.id].active) throw appError(label + ': المستخدم غير موجود أو حسابه معطّل.'); assignee.id = a.id; }
        if (type === 'role') { if (!def.roles[a.role]) throw appError(label + ': الدور غير معروف.'); assignee.module = module; assignee.role = a.role; }
        if (type === 'dept_manager') { if (!depts[a.id]) throw appError(label + ': القسم غير موجود.'); assignee.id = a.id; }
        var onReject = s.onReject && WF.ON_REJECT[s.onReject] ? s.onReject : 'end';
        var condition = s.condition && s.condition.field ? Workflow.normalizeCond_(module, s.condition, label) : null;
        var mode = WF.MODE[s.mode] ? s.mode : 'any', count = mode === 'count' ? Math.floor(Number(s.count) || 0) : 1;
        if (mode === 'count' && (count < 2 || count > 20)) throw appError(label + ': العدد المطلوب بين 2 و20.');
        if (mode !== 'any' && kind === 'sign') throw appError(label + ': مرحلة التوقيع يقرر فيها واحد.');
        var sla = Math.round(Number(s.slaHours) || 0);
        if (sla < 0 || sla > 24 * 60) throw appError(label + ': المدة بين 0 و1440 ساعة.');
        var esc = s.escalation || {}, reTo = esc.reassignTo ? String(esc.reassignTo) : '';
        if (reTo && (!users[reTo] || !users[reTo].active)) throw appError(label + ': بديل التصعيد غير موجود أو حسابه معطّل.');
        var parallel = i > 0 && bool_(s.parallel);
        group = parallel ? group : group + 1;
        return { order: i + 1, group: group, name: stepName, kind: kind, assignee: assignee, mode: mode, count: count, actions: null, noteRequired: null, fields: null, condition: condition,
          slaHours: sla, workingDays: s.workingDays !== false && s.workingDays !== 'false', escalation: sla ? { notifyManager: esc.notifyManager !== false, reassignTo: reTo } : null,
          onReject: onReject, savedAt: nowIso(), savedBy: ctx.user.id };
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

  // ───────── التفويض (المرحلة 5) ─────────
  /** من فوّض userId اليوم (مباشرة فقط: التفويض لا يتسلسل) */
  delegatorsOf_: function (userId) {
    var today = localDate_();
    return Workflow.rows_('Delegations').filter(function (d) { return d.active && d.toUserId === userId && d.from <= today && today <= d.to; }).map(function (d) { return d.fromUserId; });
  },
  /** المفوَّض إليهم اليوم عن userId */
  delegatesOf_: function (userId) {
    var today = localDate_();
    return Workflow.rows_('Delegations').filter(function (d) { return d.active && d.fromUserId === userId && d.from <= today && today <= d.to; }).map(function (d) { return d.toUserId; });
  },

  /** باسم من يتصرف المستخدم في المرحلة: نفسه ('')، أو من فوّضه، أو null إن لم تكن له. ومن اعتمد في وضع «الكل» لا يعيد */
  actingFor_: function (ctx, step, ent) {
    var u = ctx.user.id, list = step.assignees || [], done = step.approvals || [];
    var approving = step.kind === 'approve' || step.kind === 'sign';
    if (list.indexOf(u) >= 0 && done.indexOf(u) < 0) return '';
    if (approving && ent && ent.createdBy === u) return null;
    var from = Workflow.delegatorsOf_(u).filter(function (x) { return list.indexOf(x) >= 0 && done.indexOf(x) < 0; })[0];
    return from || null;
  },

  delegationView_: function (d, users) {
    var today = localDate_();
    return { id: d.id, fromId: d.fromUserId, fromName: Workflow.userName_(users, d.fromUserId), toId: d.toUserId, toName: Workflow.userName_(users, d.toUserId),
      from: d.from, to: d.to, reason: d.reason || '', active: !!d.active && d.to >= today, current: !!d.active && d.from <= today && today <= d.to };
  },

  /** wf.delegation.mine: ما فوّضته وما فُوّضت فيه */
  delegationMine: function (ctx) {
    var users = indexBy_(Db.view('core', 'Users')), u = ctx.user.id, rows = Workflow.rows_('Delegations');
    var sort = function (a, b) { return (b.from || '').localeCompare(a.from || ''); };
    return {
      given: rows.filter(function (d) { return d.fromUserId === u; }).sort(sort).slice(0, 20).map(function (d) { return Workflow.delegationView_(d, users); }),
      received: rows.filter(function (d) { return d.toUserId === u && d.active; }).sort(sort).slice(0, 20).map(function (d) { return Workflow.delegationView_(d, users); })
    };
  },

  /** wf.delegation.save: { toUserId, from, to, reason } — تفويض واحد نشط لكل مستخدم، حتى 90 يوماً */
  delegationSave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var to = String(p.toUserId || ''), tu = Db.get('core', 'Users', to);
      if (!tu || !tu.active) throw appError('المفوَّض إليه غير موجود أو حسابه معطّل.');
      if (to === ctx.user.id) throw appError('اختر شخصاً غيرك.');
      var from = requireDate_(p.from, 'تاريخ البداية'), end = requireDate_(p.to, 'تاريخ النهاية');
      if (end < from) throw appError('تاريخ النهاية قبل البداية.');
      if (end < localDate_()) throw appError('تاريخ النهاية مضى.');
      if (daysBetween_(from, end) > 90) throw appError('التفويض 90 يوماً كحد أقصى.');
      Db.updateWhere('workflow', 'Delegations', function (d) { return d.fromUserId === ctx.user.id && d.active ? { active: false, endedAt: nowIso() } : null; });
      var row = Db.insert('workflow', 'Delegations', { fromUserId: ctx.user.id, toUserId: to, from: from, to: end, module: '', reason: optionalText(p.reason, 200), active: true, createdAt: nowIso(), endedAt: '' });
      Audit.log(ctx.user, 'workflow', 'wf.delegate', 'WfDelegation', row.id, { to: to, from: from, until: end });
      return Workflow.delegationMine(ctx);
    });
  },

  delegationEnd: function (ctx, p) {
    var d = Db.getOrThrow('workflow', 'Delegations', String((p && p.id) || ''), 'التفويض');
    if (d.fromUserId !== ctx.user.id && !ctx.user.isSuperAdmin) throw appError('لا يمكنك إنهاء هذا التفويض.', 'FORBIDDEN');
    Db.update('workflow', 'Delegations', d.id, { active: false, endedAt: nowIso() });
    Audit.log(ctx.user, 'workflow', 'wf.delegate.end', 'WfDelegation', d.id, { to: d.toUserId });
    return Workflow.delegationMine(ctx);
  },

  // ───────── المدد (المرحلة 5) ─────────
  /** يوم عمل لصاحب المرحلة: من تقويم الموارد البشرية (ورديته والعطل)، وإلا الجمعة والسبت عطلة */
  workDay_: function (ds, cal, emp) {
    try { return Hr.isWorkDay_(cal || Hr.calendar_(), emp || null, ds); } catch (e) { var d = dowOf_(ds); return d !== 5 && d !== 6; }
  },

  /** موعد انتهاء مدة المرحلة: hours ساعة، ولا تُحسب ساعات أيام عطلة صاحبها (userId) إن كان workingDays */
  dueAt_: function (startIso, hours, workingDays, userId) {
    hours = Number(hours) || 0;
    if (hours <= 0) return '';
    var t = new Date(startIso).getTime();
    if (!workingDays) return new Date(t + hours * 3600000).toISOString();
    var cal = null;
    try { cal = Hr.calendar_(); } catch (e) { cal = null; }
    var left = hours, days = {}, emp = userId ? Staff.byUser_(userId) : null;
    for (var i = 0; left > 0 && i < 24 * 400; i++) {
      t += 3600000;
      var ds = localDate_(t);
      if (days[ds] === undefined) days[ds] = Workflow.workDay_(ds, cal, emp);
      if (days[ds]) left--;
    }
    return new Date(t).toISOString();
  },

  // ───────── المثيل ─────────
  record_: function (ctx, inst, step, action, note, extra) {
    extra = extra || {};
    var ent = Workflow.host_(inst.module).entity_(inst.entityId) || {};
    Db.insert('workflow', 'WfActions', {
      instanceId: inst.id, stepId: step ? step.id : '', action: action, byId: ctx && ctx.user ? ctx.user.id : '', onBehalfOf: extra.onBehalfOf || '',
      entityVersion: ent.version || 0, note: note || '', toId: extra.toId || '', at: nowIso()
    });
  },

  /**
   * يفعّل المجموعة التالية بعد afterGroup: مراحلها معاً (المتوازية تشترك في رقم المجموعة).
   * المرحلة التي لا يتحقق شرطها «متخطاة»، و«اطلاع» تُحاط وتكتمل. يعيد المراحل المفعّلة، أو [] إن انتهت المجموعات.
   */
  advance_: function (ctx, inst, afterGroup, ent) {
    var pending = Workflow.stepsOf_(inst.id).filter(function (s) { return s.group > afterGroup && s.status === 'pending'; });
    var groups = pending.map(function (s) { return s.group; }).filter(function (g, i, a) { return a.indexOf(g) === i; }).sort(function (a, b) { return a - b; });
    for (var gi = 0; gi < groups.length; gi++) {
      var activated = [];
      pending.filter(function (s) { return s.group === groups[gi]; }).forEach(function (s) {
        var cfg = s.config || {};
        if (cfg.condition && !Workflow.test_(cfg.condition, ent.values)) {
          Db.update('workflow', 'WfInstanceSteps', s.id, { status: 'skipped', startedAt: nowIso(), endedAt: nowIso() });
          Workflow.record_(ctx, inst, s, 'skip', 'لم يتحقق شرط المرحلة');
          return;
        }
        var r = Workflow.resolve_(cfg, inst.module, ent.createdBy);
        if (cfg.kind === 'inform') {
          Db.update('workflow', 'WfInstanceSteps', s.id, { assignees: r.ids, status: 'done', startedAt: nowIso(), endedAt: nowIso(), fallback: r.fallback });
          Workflow.record_(ctx, inst, s, 'inform', '');
          Audit.log(ctx.user, 'workflow', 'wf.inform', 'WfInstance', inst.id, { step: s.name, to: r.ids, number: ent.number });
          return;
        }
        var now = nowIso();
        Db.update('workflow', 'WfInstanceSteps', s.id, { assignees: r.ids, approvals: [], status: 'current', startedAt: now, fallback: r.fallback, asking: false, escalationLevel: 0, dueAt: Workflow.dueAt_(now, cfg.slaHours, cfg.workingDays, r.ids[0]) });
        activated.push(s.id);
      });
      if (activated.length) {
        Db.update('workflow', 'WfInstances', inst.id, { currentGroup: groups[gi], status: 'running' });
        return activated.map(function (id) { return Db.get('workflow', 'WfInstanceSteps', id); });
      }
    }
    return [];
  },

  /** بعد اكتمال مرحلة: إن اكتملت مجموعتها تُفعَّل التالية، وإن لم يبقَ شيء تنتهي السلسلة معتمدة. يعيد { next, final } */
  afterDone_: function (ctx, inst, step, ent) {
    var open = Workflow.stepsOf_(inst.id).filter(function (s) { return s.group === step.group && s.status === 'current'; });
    if (open.length) return { next: [], final: false, waiting: true };
    var next = Workflow.advance_(ctx, inst, step.group, ent);
    if (!next.length) Workflow.finish_(ctx, inst, 'approved', ent);
    return { next: next, final: !next.length };
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
        instanceId: inst.id, order: s.order, group: s.group || s.order, name: s.name, kind: s.kind, mode: s.mode || 'any', count: s.count || 1,
        assignees: [], approvals: [], status: 'pending', dueAt: '', escalationLevel: 0, startedAt: '', endedAt: '', actedBy: '', asking: false, fallback: false,
        config: { kind: s.kind, assignee: s.assignee, onReject: s.onReject || 'end', name: s.name, condition: s.condition || null, mode: s.mode || 'any', count: s.count || 1,
          slaHours: s.slaHours || 0, workingDays: s.workingDays !== false, escalation: s.escalation || null }
      };
    }));
    Workflow.record_(ctx, inst, null, 'start', '');
    var cur = Workflow.advance_(ctx, inst, 0, ent);
    Audit.log(ctx.user, 'workflow', 'wf.start', 'WfInstance', inst.id, { number: ent.number, template: t.name, step: cur.map(function (s) { return s.name; }).join('، ') });
    if (!cur.length) Workflow.finish_(ctx, inst, 'approved', ent);
    return Db.get('workflow', 'WfInstances', inst.id);
  },

  /** نهاية السلسلة: تُبلَّغ الوحدة المضيفة */
  finish_: function (ctx, inst, status, ent) {
    Db.update('workflow', 'WfInstances', inst.id, { status: status, endedAt: status === 'returned' ? '' : nowIso() });
    Workflow.host_(inst.module).onEvent_(ctx, status, Db.get('workflow', 'WfInstances', inst.id), ent);
  },

  /** إعادة إرسال سلسلة معادة للتعديل: تعود مراحل المجموعة التي أعادتها، بمسؤوليها، من جديد */
  resubmit_: function (ctx, instanceId, note) {
    var inst = Db.getOrThrow('workflow', 'WfInstances', instanceId, 'السلسلة');
    if (inst.status !== 'returned') throw appError('السلسلة ليست معادة للتعديل.');
    var back = Workflow.stepsOf_(inst.id).filter(function (s) { return s.status === 'returned'; });
    if (!back.length) throw appError('تعذّر تحديد المرحلة المعادة.');
    var now = nowIso();
    back.forEach(function (step) {
      var cfg = step.config || {};
      Db.update('workflow', 'WfInstanceSteps', step.id, { status: 'current', approvals: [], startedAt: now, endedAt: '', actedBy: '', asking: false, escalationLevel: 0, dueAt: Workflow.dueAt_(now, cfg.slaHours, cfg.workingDays, (step.assignees || [])[0]) });
    });
    Db.update('workflow', 'WfInstances', inst.id, { status: 'running', endedAt: '' });
    Workflow.record_(ctx, inst, back[0], 'resubmit', note || '');
    var ent = Workflow.host_(inst.module).entity_(inst.entityId) || {};
    Audit.log(ctx.user, 'workflow', 'wf.resubmit', 'WfInstance', inst.id, { number: ent.number, step: back.map(function (s) { return s.name; }).join('، ') });
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

  currentSteps_: function (inst) { return Workflow.stepsOf_(inst.id).filter(function (s) { return s.status === 'current'; }); },

  /** مرحلة المستخدم الحالية في السلسلة (المحددة بـ stepId، أو أول مرحلة له)، أو null */
  myStep_: function (ctx, inst, ent, stepId) {
    var list = Workflow.currentSteps_(inst).filter(function (s) { return !stepId || s.id === stepId; });
    for (var i = 0; i < list.length; i++) if (Workflow.actingFor_(ctx, list[i], ent) !== null) return list[i];
    return null;
  },

  /** ما يحق للمستخدم في السلسلة الآن */
  can_: function (ctx, inst, step, ent) {
    var u = ctx.user.id, live = inst.status === 'running', mine = step && Workflow.actingFor_(ctx, step, ent) !== null;
    var mgr = Workflow.isModuleMgr_(ctx, inst.module) || ctx.user.isSuperAdmin;
    var approvedOnce = Workflow.rows_('WfActions').some(function (a) { return a.instanceId === inst.id && (a.action === 'approve' || a.action === 'sign'); });
    var asking = Workflow.currentSteps_(inst).some(function (s) { return s.asking; });
    return {
      act: live && !!mine && !step.asking, ask: live && !!mine && !step.asking, sign: live && !!mine && !step.asking && step.kind === 'sign',
      answer: live && asking && ent.createdBy === u,
      cancel: (live || inst.status === 'returned') && (mgr || (ent.createdBy === u && !approvedOnce)),
      reassign: live && mgr && Workflow.currentSteps_(inst).length > 0
    };
  },

  /** عرض السلسلة الكامل لصفحة السجل */
  view_: function (ctx, inst) {
    var users = indexBy_(Db.view('core', 'Users')), ent = Workflow.host_(inst.module).entity_(inst.entityId) || {};
    var steps = Workflow.stepsOf_(inst.id), currents = steps.filter(function (s) { return s.status === 'current'; });
    var step = Workflow.myStep_(ctx, inst, ent) || currents[0] || null, now = nowIso();
    var acts = Workflow.rows_('WfActions').filter(function (a) { return a.instanceId === inst.id; }).sort(function (a, b) { return (a.at || '').localeCompare(b.at || ''); });
    var stepById = indexBy_(steps), lastAct = {}, groupSize = {};
    steps.forEach(function (s) { groupSize[s.group] = (groupSize[s.group] || 0) + 1; });
    acts.forEach(function (a) { if (a.stepId && ['approve', 'sign', 'reject', 'return'].indexOf(a.action) >= 0) lastAct[a.stepId] = a; });
    var acting = step ? Workflow.actingFor_(ctx, step, ent) : null;
    return {
      id: inst.id, status: inst.status, statusLabel: WF.STATUS[inst.status] || inst.status, templateName: inst.templateName || '', templateVersion: inst.templateVersion,
      startedAt: inst.startedAt, endedAt: inst.endedAt || '', startedByName: Workflow.userName_(users, inst.startedBy),
      steps: steps.map(function (s) {
        var la = lastAct[s.id], need = s.mode === 'all' ? (s.assignees || []).length : s.mode === 'count' ? Math.min(s.count || 1, (s.assignees || []).length) : 1;
        return {
          id: s.id, order: s.order, group: s.group, parallel: groupSize[s.group] > 1, name: s.name, kind: s.kind, kindLabel: WF.KIND[s.kind] || s.kind,
          status: s.status, statusLabel: WF.STEP[s.status] || s.status, mode: s.mode || 'any', modeLabel: WF.MODE[s.mode || 'any'] || '',
          approvals: (s.approvals || []).length, need: need,
          assignees: (s.assignees || []).map(function (u) { return { id: u, name: Workflow.userName_(users, u), done: (s.approvals || []).indexOf(u) >= 0 }; }), fallback: !!s.fallback, asking: !!s.asking,
          startedAt: s.startedAt || '', endedAt: s.endedAt || '', dueAt: s.dueAt || '', overdue: s.status === 'current' && !!s.dueAt && s.dueAt < now, escalationLevel: s.escalationLevel || 0,
          actedByName: Workflow.userName_(users, s.actedBy), note: la ? la.note : ''
        };
      }),
      actions: acts.map(function (a) {
        var st = a.stepId && stepById[a.stepId];
        return { id: a.id, action: a.action, label: WF.ACTION[a.action] || a.action, byName: Workflow.userName_(users, a.byId), onBehalfOfName: Workflow.userName_(users, a.onBehalfOf), toName: Workflow.userName_(users, a.toId), step: st ? st.name : '', note: a.note || '', version: a.entityVersion || 0, at: a.at };
      }),
      current: step ? { id: step.id, name: step.name, kind: step.kind, asking: !!step.asking, onBehalfOfName: acting ? Workflow.userName_(users, acting) : '' } : null,
      can: Workflow.can_(ctx, inst, step, ent)
    };
  },

  // ───────── الإجراءات ─────────
  /** wf.act: { instanceId, stepId?, action: approve | sign | reject | return | forward | ask | answer, note, toId } */
  act: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var inst = Db.getOrThrow('workflow', 'WfInstances', String(p.instanceId || ''), 'السلسلة');
      var host = Workflow.host_(inst.module), ent = host.entity_(inst.entityId);
      if (!ent) throw appError('السجل غير موجود.', 'NOT_FOUND');
      if (inst.status !== 'running') throw appError('السلسلة ليست جارية.');
      var action = String(p.action || ''), note = optionalText(p.note, 1000);
      if (!WF.ACTION[action] || ['approve', 'sign', 'reject', 'return', 'forward', 'ask', 'answer'].indexOf(action) < 0) throw appError('الإجراء غير معروف.');
      if (action === 'answer') {
        var asking = Workflow.currentSteps_(inst).filter(function (s) { return s.asking; });
        if (!asking.length || ent.createdBy !== ctx.user.id) throw appError('لا يوجد استيضاح بانتظار ردك.', 'FORBIDDEN');
        if (!note) throw appError('اكتب الإيضاح.');
        var holders = [];
        asking.forEach(function (s) { Db.update('workflow', 'WfInstanceSteps', s.id, { asking: false }); holders = holders.concat(s.assignees || []); Workflow.record_(ctx, inst, s, 'answer', note); });
        Audit.log(ctx.user, 'workflow', 'wf.answer', 'WfInstance', inst.id, { number: ent.number, step: asking[0].name, note: note, to: holders });
        return Workflow.view_(ctx, Db.get('workflow', 'WfInstances', inst.id));
      }
      var step = Workflow.myStep_(ctx, inst, ent, p.stepId ? String(p.stepId) : '');
      if (!step) throw appError('ليست هذه مرحلتك في السلسلة.', 'FORBIDDEN');
      if (step.asking) throw appError('المرحلة بانتظار إيضاح من المنشئ.');
      var behalf = Workflow.actingFor_(ctx, step, ent), key = behalf || ctx.user.id;
      if ((action === 'reject' || action === 'return' || action === 'ask') && !note) {
        throw appError(action === 'ask' ? 'اكتب سؤال الاستيضاح.' : action === 'reject' ? 'اكتب سبب الرفض.' : 'اكتب ما المطلوب تعديله.');
      }
      var cfg = step.config || {}, d = { number: ent.number, step: step.name, note: note, onBehalfOf: behalf };
      if (action === 'reject' && cfg.onReject === 'creator') action = 'return';
      if (action === 'approve' && cfg.kind === 'sign') throw appError('هذه مرحلة توقيع: وقّع من صفحة المستند.');
      if (action === 'approve' || action === 'sign') {
        var extra = {};
        if (action === 'sign') {
          if (cfg.kind !== 'sign') throw appError('ليست هذه مرحلة توقيع.');
          if (!Signature.approvedOf_(ctx.user.id)) throw appError('ليس لديك توقيع معتمد. أضفه من «ملفي» ويعتمده مدير النظام.');
          var method = Signature.reauth_(ctx, p), code = Signature.takeCode_(ctx.user.id, inst.id, p.code);
          var res = host.sign_(ctx, inst, step, { data: p.pdf, code: code });
          Signature.log_({ module: inst.module, entityId: inst.entityId, entityVersion: res.version, userId: ctx.user.id, onBehalfOf: behalf || '', method: method,
            sourceSha256: res.sourceSha256, signedSha256: res.signedSha256, fileId: res.fileId, code: code, step: step.name });
          extra = { method: method, code: code };
          ent = host.entity_(inst.entityId);
        }
        var approvals = (step.approvals || []).concat([key]).filter(function (x, i, a) { return a.indexOf(x) === i; });
        var need = step.mode === 'all' ? (step.assignees || []).length : step.mode === 'count' ? Math.min(step.count || 1, (step.assignees || []).length) : 1;
        Workflow.record_(ctx, inst, step, action, note, { onBehalfOf: behalf });
        if (approvals.length < need) {
          Db.update('workflow', 'WfInstanceSteps', step.id, { approvals: approvals });
          Audit.log(ctx.user, 'workflow', 'wf.' + action, 'WfInstance', inst.id, Object.assign(d, extra, { partial: approvals.length + '/' + need }));
          return Workflow.view_(ctx, Db.get('workflow', 'WfInstances', inst.id));
        }
        Db.update('workflow', 'WfInstanceSteps', step.id, { approvals: approvals, status: 'done', endedAt: nowIso(), actedBy: ctx.user.id });
        var after = Workflow.afterDone_(ctx, inst, Db.get('workflow', 'WfInstanceSteps', step.id), ent);
        Audit.log(ctx.user, 'workflow', 'wf.' + action, 'WfInstance', inst.id, Object.assign(d, extra, { next: after.next.map(function (s) { return s.name; }).join('، '), final: after.final }));
      } else if (action === 'reject') {
        Db.update('workflow', 'WfInstanceSteps', step.id, { status: 'rejected', endedAt: nowIso(), actedBy: ctx.user.id });
        Db.updateWhere('workflow', 'WfInstanceSteps', function (s) { return s.instanceId === inst.id && (s.status === 'pending' || s.status === 'current') && s.id !== step.id ? { status: 'cancelled', asking: false } : null; });
        Workflow.record_(ctx, inst, step, 'reject', note, { onBehalfOf: behalf });
        Audit.log(ctx.user, 'workflow', 'wf.reject', 'WfInstance', inst.id, d);
        Workflow.finish_(ctx, inst, 'rejected', ent);
      } else if (action === 'return') {
        // تُعاد مجموعتها كلها: بعد التعديل تعود مراحلها معاً
        Db.updateWhere('workflow', 'WfInstanceSteps', function (s) { return s.instanceId === inst.id && s.status === 'current' ? { status: 'returned', endedAt: nowIso(), asking: false } : null; });
        Db.update('workflow', 'WfInstanceSteps', step.id, { actedBy: ctx.user.id });
        Workflow.record_(ctx, inst, step, 'return', note, { onBehalfOf: behalf });
        Audit.log(ctx.user, 'workflow', 'wf.return', 'WfInstance', inst.id, d);
        Workflow.finish_(ctx, inst, 'returned', ent);
      } else if (action === 'forward') {
        var to = String(p.toId || ''), tu = Db.get('core', 'Users', to);
        if (!tu || !tu.active) throw appError('المحال إليه غير موجود أو حسابه معطّل.');
        if (to === ctx.user.id) throw appError('اختر شخصاً غيرك.');
        if ((cfg.kind === 'approve' || cfg.kind === 'sign') && to === ent.createdBy) throw appError('لا يُحال الاعتماد إلى منشئ المستند.');
        var list = (step.assignees || []).map(function (x) { return x === key ? to : x; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
        Db.update('workflow', 'WfInstanceSteps', step.id, { assignees: list });
        Workflow.record_(ctx, inst, step, 'forward', note, { toId: to, onBehalfOf: behalf });
        Audit.log(ctx.user, 'workflow', 'wf.forward', 'WfInstance', inst.id, Object.assign(d, { to: to }));
      } else if (action === 'ask') {
        Db.update('workflow', 'WfInstanceSteps', step.id, { asking: true });
        Workflow.record_(ctx, inst, step, 'ask', note, { onBehalfOf: behalf });
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
      var ent = Workflow.host_(inst.module).entity_(inst.entityId) || {}, currents = Workflow.currentSteps_(inst);
      if (!Workflow.can_(ctx, inst, currents[0] || null, ent).cancel) throw appError('لا يمكنك إلغاء هذه السلسلة.', 'FORBIDDEN');
      var note = optionalText(p.note, 500);
      if (!note) throw appError('اكتب سبب الإلغاء.');
      var holders = [];
      currents.forEach(function (s) { holders = holders.concat(s.assignees || []); });
      Db.updateWhere('workflow', 'WfInstanceSteps', function (s) { return s.instanceId === inst.id && (s.status === 'pending' || s.status === 'current' || s.status === 'returned') ? { status: 'cancelled', asking: false } : null; });
      Workflow.record_(ctx, inst, currents[0] || null, 'cancel', note);
      Audit.log(ctx.user, 'workflow', 'wf.cancel', 'WfInstance', inst.id, { number: ent.number, note: note, to: holders });
      Workflow.finish_(ctx, inst, 'cancelled', ent);
      return true;
    });
  },

  /** wf.reassign: مدير الوحدة يسند مرحلة حالية (stepId، أو الأولى) لشخص آخر بسبب */
  reassign: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var inst = Db.getOrThrow('workflow', 'WfInstances', String(p.instanceId || ''), 'السلسلة');
      var ent = Workflow.host_(inst.module).entity_(inst.entityId) || {};
      var step = Workflow.currentSteps_(inst).filter(function (s) { return !p.stepId || s.id === p.stepId; })[0] || null;
      if (!step || !Workflow.can_(ctx, inst, step, ent).reassign) throw appError('يعيد إسناد المرحلة مدير الوحدة.', 'FORBIDDEN');
      var to = String(p.toId || ''), tu = Db.get('core', 'Users', to), note = optionalText(p.note, 500);
      if (!tu || !tu.active) throw appError('المسؤول الجديد غير موجود أو حسابه معطّل.');
      if (!note) throw appError('اكتب سبب إعادة الإسناد.');
      if (['approve', 'sign'].indexOf((step.config || {}).kind) >= 0 && to === ent.createdBy) throw appError('لا يُسند الاعتماد إلى منشئ المستند.');
      Db.update('workflow', 'WfInstanceSteps', step.id, { assignees: [to], approvals: [], asking: false });
      Workflow.record_(ctx, inst, step, 'reassign', note, { toId: to });
      Audit.log(ctx.user, 'workflow', 'wf.reassign', 'WfInstance', inst.id, { number: ent.number, step: step.name, to: to, note: note });
      return Workflow.view_(ctx, Db.get('workflow', 'WfInstances', inst.id));
    });
  },

  // ───────── المدد والتصعيد والملخص اليومي (المرحلة 5) ─────────
  SYSTEM_: { id: 'system', fullName: 'النظام', isSuperAdmin: false },

  /**
   * فحص المراحل المتأخرة: 1) تذكير مسؤوليها عند انتهاء المدة، 2) بعد يوم: إشعار مديريهم المباشرين،
   * 3) بعد يومين: نقلها للبديل المحدد في المرحلة إن وُجد. مرة لكل مستوى.
   */
  sweep_: function () {
    return withLock(function () {
      var now = Date.now(), done = [], ctx = { user: Workflow.SYSTEM_, roles: {} };
      var emps = indexBy_(Staff.all_()), depts = indexBy_(Staff.depts_());
      Workflow.rows_('WfInstanceSteps').forEach(function (s) {
        if (s.status !== 'current' || !s.dueAt || s.asking) return;
        var inst = Workflow.index_().instById[s.instanceId];
        if (!inst || inst.status !== 'running') return;
        var late = now - new Date(s.dueAt).getTime(), level = s.escalationLevel || 0, esc = (s.config || {}).escalation || {};
        if (late < 0) return;
        var ent = Workflow.host_(inst.module).entity_(inst.entityId) || {};
        if (level < 1) {
          Db.update('workflow', 'WfInstanceSteps', s.id, { escalationLevel: 1 });
          Audit.log(ctx.user, 'workflow', 'wf.overdue', 'WfInstance', inst.id, { number: ent.number, step: s.name, to: s.assignees || [] });
          done.push(s.id + ':1');
        } else if (level < 2 && late >= 86400000) {
          var mgrs = (s.assignees || []).map(function (u) { var e = Staff.byUser_(u); return e ? Workflow.empUser_(Staff.managerIdOf_(e, depts), emps) : ''; }).filter(Boolean);
          Db.update('workflow', 'WfInstanceSteps', s.id, { escalationLevel: 2 });
          if (esc.notifyManager !== false && mgrs.length) Audit.log(ctx.user, 'workflow', 'wf.escalate', 'WfInstance', inst.id, { number: ent.number, step: s.name, level: 2, to: mgrs });
          done.push(s.id + ':2');
        } else if (level < 3 && late >= 2 * 86400000 && esc.reassignTo) {
          var tu = Db.get('core', 'Users', esc.reassignTo);
          Db.update('workflow', 'WfInstanceSteps', s.id, { escalationLevel: 3 });
          if (tu && tu.active && (s.assignees || []).indexOf(tu.id) < 0) {
            Db.update('workflow', 'WfInstanceSteps', s.id, { assignees: [tu.id], approvals: [] });
            Workflow.record_(ctx, inst, s, 'escalate', 'انتهت مدة المرحلة وتأخرت يومين', { toId: tu.id });
            Audit.log(ctx.user, 'workflow', 'wf.escalate', 'WfInstance', inst.id, { number: ent.number, step: s.name, level: 3, to: [tu.id] });
          }
          done.push(s.id + ':3');
        }
      });
      return done;
    });
  },

  /** من المشغّل كل دقيقة: الفحص مرة في الساعة */
  sweepIfDue_: function () {
    var cache = CacheService.getScriptCache();
    if (cache.get('wf.sweep')) return null;
    cache.put('wf.sweep', '1', 3600);
    return Workflow.sweep_();
  },

  /** wf.sweep (مدير النظام): تشغيل الفحص الآن */
  sweepNow: function () { return { escalated: Workflow.sweep_() }; },

  settings_: function () { return Object.assign({ digest: false }, Settings.get_('workflow', {}) || {}); },

  /** wf.settings / wf.settings.save: { digest } — مدير وحدة تستضيف السلاسل أو مدير النظام */
  settings: function () { return Workflow.settings_(); },
  settingsSave: function (ctx, p) {
    var canEdit = ctx.user.isSuperAdmin || ModuleProviders_().some(function (x) { return x.workflowHost && Workflow.isModuleMgr_(ctx, x.key); });
    if (!canEdit) throw appError('ليست لديك صلاحية لهذا الإجراء.', 'FORBIDDEN');
    Settings.set_('workflow', Object.assign(Workflow.settings_(), { digest: bool_(p && p.digest) }), ctx.user);
    Audit.log(ctx.user, 'workflow', 'wf.settings', 'Settings', 'workflow', { digest: bool_(p && p.digest) });
    return Workflow.settings_();
  },

  /** الملخص البريدي اليومي (عند تفعيله): رسالة واحدة لكل من لديه مراحل بانتظاره، بدل رسالة لكل حدث */
  digest_: function () {
    if (!Workflow.settings_().digest || !Notify.mailAvailable_()) return 0;
    var users = indexBy_(Db.view('core', 'Users')), states = indexBy_(Db.view('core', 'NotifyState')), per = {};
    Workflow.rows_('WfInstanceSteps').forEach(function (s) {
      if (s.status !== 'current' || s.asking) return;
      var inst = Workflow.index_().instById[s.instanceId];
      if (!inst || inst.status !== 'running') return;
      var ent;
      try { ent = Workflow.host_(inst.module).entity_(inst.entityId); } catch (e) { ent = null; }
      if (!ent) return;
      var who = [];
      (s.assignees || []).forEach(function (u) { if ((s.approvals || []).indexOf(u) < 0) who = who.concat([u], Workflow.delegatesOf_(u)); });
      who.filter(function (u, i, a) { return a.indexOf(u) === i; }).forEach(function (u) { (per[u] = per[u] || []).push(ent.number + ' · ' + s.name); });
    });
    var q = [];
    Object.keys(per).forEach(function (uid) {
      var u = users[uid], st = states[uid];
      if (!u || !u.active || !u.email || (st && st.email === false)) return;
      q.push({ to: u.email, title: 'لديك ' + per[uid].length + ' مراحل بانتظار قرارك', detail: per[uid].slice(0, 10).join('\n'), link: '/inbox', actorName: '', createdAt: nowIso(), attempts: 0 });
    });
    if (q.length) Db.insertMany('core', 'MailQueue', q);
    return q.length;
  },

  // ───────── صندوق الموافقات والإشعارات ─────────
  inbox_: function (ctx) {
    var u = ctx.user.id, out = [], users = null, from = Workflow.delegatorsOf_(u);
    Workflow.rows_('WfInstanceSteps').forEach(function (s) {
      if (s.status !== 'current' || s.asking) return;
      var list = s.assignees || [];
      if (list.indexOf(u) < 0 && !from.some(function (x) { return list.indexOf(x) >= 0; })) return;
      var inst = Workflow.index_().instById[s.instanceId];
      if (!inst || inst.status !== 'running') return;
      var host, ent;
      try { host = Workflow.host_(inst.module); ent = host.entity_(inst.entityId); } catch (e) { return; }
      if (!ent) return;
      var behalf = Workflow.actingFor_(ctx, s, ent);
      if (behalf === null) return;
      users = users || indexBy_(Db.view('core', 'Users'));
      var steps = Workflow.stepsOf_(inst.id), now = nowIso();
      out.push({
        id: 'wf.step:' + s.id, kind: 'wf.step', refId: inst.id, module: 'workflow', moduleLabel: ent.moduleLabel + ' · ' + s.name,
        title: ent.number + ' · ' + ent.title, who: Workflow.userName_(users, ent.createdBy) + (behalf ? ' · نيابةً عن ' + Workflow.userName_(users, behalf) : ''),
        createdAt: s.startedAt, status: (WF.KIND[s.kind] || s.kind) + (s.dueAt && s.dueAt < now ? ' · متأخرة' : ''),
        note: '', needsNoteOnReject: true,
        facts: [{ k: 'السلسلة', v: inst.templateName || '' }, { k: 'المرحلة', v: s.order + ' من ' + steps.length }].concat(s.dueAt ? [{ k: 'الموعد', v: dmy_(localDate_(new Date(s.dueAt).getTime())) }] : []).concat(ent.facts || []),
        approveLabel: s.kind === 'review' ? 'تمت المراجعة' : s.kind === 'execute' ? 'تم التنفيذ' : s.kind === 'sign' ? 'التوقيع من صفحة المستند' : 'اعتماد', rejectLabel: 'إعادة للتعديل',
        linkOnly: s.kind === 'sign',
        link: host.link_(inst.entityId, u)
      });
    });
    return out;
  },

  /** القرار من الصندوق: الاعتماد، والرفض فيه «إعادة للتعديل» بسبب. الرفض النهائي من صفحة المستند */
  decide_: function (ctx, kind, p) {
    if (kind !== 'wf.step') return null;
    var inst = Db.get('workflow', 'WfInstances', String(p.id || ''));
    var st = inst ? Workflow.myStep_(ctx, inst, Workflow.host_(inst.module).entity_(inst.entityId) || {}) : null;
    if (st && st.kind === 'sign' && p.approve) throw appError('هذه مرحلة توقيع: وقّع من صفحة المستند.');
    return Workflow.act(ctx, { instanceId: p.id, stepId: st ? st.id : '', action: p.approve ? 'approve' : 'return', note: p.note });
  },

  /** مرشّحو «بانتظار قرارك»: مسؤولو المراحل الحالية ومن فوّضوهم */
  approvers_: function (instanceId) {
    var out = [];
    Workflow.rows_('WfInstanceSteps').forEach(function (x) {
      if (x.instanceId !== instanceId || x.status !== 'current') return;
      (x.assignees || []).forEach(function (u) { out = out.concat([u], Workflow.delegatesOf_(u)); });
    });
    return out.filter(function (u, i, a) { return a.indexOf(u) === i; });
  },

  notify_: function (ev) {
    var d = ev.details || {}, a = ev.actor ? ev.actor.fullName : '', out = [];
    if (ev.action === 'wf.delegate') return [{ to: d.to, title: 'فوّضك ' + a + ' في سلاسل الاعتماد', detail: dmy_(d.from) + ' – ' + dmy_(d.until), link: '/inbox' }];
    var inst = Db.get('workflow', 'WfInstances', ev.id);
    if (!inst) return out;
    var host = Workflow.host_(inst.module), ent = host.entity_(inst.entityId);
    if (!ent) return out;
    var detail = ent.number + ' · ' + ent.title + (d.note ? ' — ' + d.note : '');
    var to = function (ids, title) { [].concat(ids || []).forEach(function (uid) { if (uid) out.push({ to: uid, title: title, detail: detail, link: host.link_(inst.entityId, uid) }); }); };
    if ((ev.action === 'wf.approve' || ev.action === 'wf.sign') && d.final) to(ent.createdBy, 'اعتُمد مستندك');
    else if (ev.action === 'wf.sign') to(ent.createdBy, 'وقّع ' + a + ' مستندك');
    else if (ev.action === 'wf.reject') to(ent.createdBy, 'رفض ' + a + ' مستندك');
    else if (ev.action === 'wf.return') to(ent.createdBy, 'أعاد ' + a + ' مستندك للتعديل');
    else if (ev.action === 'wf.ask') to(ent.createdBy, 'يطلب ' + a + ' استيضاحاً على مستندك');
    else if (ev.action === 'wf.answer') to(d.to, 'ردّ ' + a + ' على الاستيضاح');
    else if (ev.action === 'wf.inform') to(d.to, 'مستند للاطلاع');
    else if (ev.action === 'wf.cancel') to(d.to, 'أُلغيت سلسلة مستند كان بانتظارك');
    else if (ev.action === 'wf.overdue') to(d.to, 'تأخرت مرحلة بانتظارك: ' + d.step);
    else if (ev.action === 'wf.escalate' && d.level === 2) to(d.to, 'مرحلة متأخرة لدى أحد فريقك: ' + d.step);
    else if (ev.action === 'wf.escalate' && d.level === 3) to(d.to, 'انتقلت إليك مرحلة متأخرة: ' + d.step);
    return out;
  },

  routes_: function () {
    return {
      'wf.templates': { fn: Workflow.templates },
      'wf.lookups': { fn: Workflow.lookups },
      'wf.template.save': { fn: Workflow.templateSave },
      'wf.template.versions': { fn: Workflow.templateVersions },
      'wf.rules': { fn: Workflow.rules },
      'wf.rule.save': { fn: Workflow.ruleSave },
      'wf.rule.move': { fn: Workflow.ruleMove },
      'wf.rule.remove': { fn: Workflow.ruleRemove },
      'wf.simulate': { fn: Workflow.simulate },
      'wf.act': { fn: Workflow.act },
      'wf.cancel': { fn: Workflow.cancel },
      'wf.reassign': { fn: Workflow.reassign },
      'wf.delegation.mine': { fn: Workflow.delegationMine },
      'wf.delegation.save': { fn: Workflow.delegationSave },
      'wf.delegation.end': { fn: Workflow.delegationEnd },
      'wf.settings': { fn: Workflow.settings },
      'wf.settings.save': { fn: Workflow.settingsSave },
      'wf.sweep': { perm: 'super', fn: Workflow.sweepNow }
    };
  }
};
