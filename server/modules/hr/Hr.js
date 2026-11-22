/**
 * وحدة الموارد البشرية: الهيكل، ملفات الموظفين، الورديات والعطل، الإجازات، العمل الإضافي.
 * ملف بياناتها: hr (الورديات والإجازات والإضافي). الموظفون والأقسام والفروع في النواة (Staff).
 */
var HR_SCHEMA = {
  Shifts: [
    ['id', 'text'], ['name', 'text'], ['start', 'text'], ['end', 'text'], ['graceMin', 'num'],
    ['workDays', 'text'], ['active', 'bool'], ['createdAt', 'ts']
  ],
  Holidays: [['id', 'text'], ['date', 'date'], ['dateTo', 'date'], ['name', 'text'], ['createdAt', 'ts']],
  LeaveTypes: [
    ['id', 'text'], ['name', 'text'], ['annualDays', 'num'], ['paid', 'bool'], ['active', 'bool'], ['sortOrder', 'num']
  ],
  LeaveBalances: [
    ['id', 'text'], ['employeeId', 'text'], ['typeId', 'text'], ['year', 'text'], ['adjustment', 'num'],
    ['note', 'text'], ['updatedAt', 'ts'], ['updatedBy', 'text']
  ],
  LeaveRequests: [
    ['id', 'text'], ['employeeId', 'text'], ['typeId', 'text'], ['from', 'date'], ['to', 'date'], ['days', 'num'],
    ['reason', 'text'], ['status', 'text'], ['managerId', 'text'], ['managerAt', 'ts'], ['managerNote', 'text'],
    ['decidedBy', 'text'], ['decidedAt', 'ts'], ['decisionNote', 'text'], ['createdAt', 'ts'], ['createdBy', 'text'], ['wfInstanceId', 'text']
  ],
  OvertimeRequests: [
    ['id', 'text'], ['employeeId', 'text'], ['date', 'date'], ['minutes', 'num'], ['reason', 'text'], ['status', 'text'],
    ['createdBy', 'text'], ['createdByName', 'text'], ['decidedBy', 'text'], ['decidedAt', 'ts'], ['decisionNote', 'text'],
    ['createdAt', 'ts'], ['wfInstanceId', 'text']
  ]
};

var HR_DEFAULT_WORKDAYS = [6, 0, 1, 2, 3, 4]; // السبت إلى الخميس (0 = الأحد)
var LEAVE_OPEN = ['pending_manager', 'pending_hr'];
/** محجوزة من الرصيد وتمنع التداخل: المسار المدمج والسلسلة (docs/09) */
var LEAVE_HOLD = LEAVE_OPEN.concat(['in_chain', 'returned']);
var LEAVE_STATUS = {
  pending_manager: 'بانتظار المدير المباشر', pending_hr: 'بانتظار الموارد البشرية', in_chain: 'قيد الإجراء في السلسلة', returned: 'معادة للتعديل',
  approved: 'معتمدة', rejected: 'مرفوضة', cancelled: 'ملغاة'
};
var OT_STATUS = { pending: 'بانتظار الموافقة', approved: 'معتمد', rejected: 'مرفوض', cancelled: 'ملغى', in_chain: 'قيد الإجراء في السلسلة', returned: 'معاد للتعديل' };
var OT_MAX_MIN = 720;

var Hr = {
  // ───────── أدوات داخلية ─────────
  isHr_: function (ctx) { return Permissions.has(ctx, 'hr', ['hr']); },

  types_: function () {
    var list = Db.view('hr', 'LeaveTypes');
    if (!list.length) {
      // قيم مبدئية تُعدَّل من «أنواع الإجازات»
      Db.insertMany('hr', 'LeaveTypes', [
        { id: 'lt_annual', name: 'إجازة سنوية', annualDays: 30, paid: true, active: true, sortOrder: 1 },
        { id: 'lt_sick', name: 'إجازة مرضية', annualDays: 15, paid: true, active: true, sortOrder: 2 },
        { id: 'lt_emergency', name: 'إجازة طارئة', annualDays: 5, paid: true, active: true, sortOrder: 3 },
        { id: 'lt_unpaid', name: 'إجازة بدون راتب', annualDays: 0, paid: false, active: true, sortOrder: 4 }
      ]);
      list = Db.view('hr', 'LeaveTypes');
    }
    return list.slice().sort(function (a, b) { return a.sortOrder - b.sortOrder; });
  },

  /** كل ما يلزم لتصنيف الأيام: الورديات، العطل، الإجازات والإضافي المعتمدة */
  calendar_: function () {
    return {
      shifts: indexBy_(Db.view('hr', 'Shifts')),
      holidays: Db.view('hr', 'Holidays'),
      leaves: Db.view('hr', 'LeaveRequests').filter(function (r) { return r.status === 'approved'; }),
      ot: Db.view('hr', 'OvertimeRequests').filter(function (o) { return o.status === 'approved'; }),
      types: indexBy_(Hr.types_())
    };
  },

  shiftOf_: function (cal, emp) {
    var s = emp && emp.shiftId ? cal.shifts[emp.shiftId] : null;
    return s && s.active !== false ? s : null;
  },

  workDays_: function (shift) {
    if (!shift) return HR_DEFAULT_WORKDAYS;
    var l = String(shift.workDays || '').split(',').filter(function (x) { return x !== ''; }).map(Number);
    return l.length ? l : HR_DEFAULT_WORKDAYS;
  },

  holidayOn_: function (cal, ds) {
    for (var i = 0; i < cal.holidays.length; i++) {
      var h = cal.holidays[i];
      if (h.date <= ds && ds <= (h.dateTo || h.date)) return h;
    }
    return null;
  },

  leaveOn_: function (cal, empId, ds) {
    for (var i = 0; i < cal.leaves.length; i++) {
      var r = cal.leaves[i];
      if (r.employeeId === empId && r.from <= ds && ds <= r.to) return r;
    }
    return null;
  },

  isWorkDay_: function (cal, emp, ds) {
    return Hr.workDays_(Hr.shiftOf_(cal, emp)).indexOf(dowOf_(ds)) >= 0 && !Hr.holidayOn_(cal, ds);
  },

  approvedOtMinutes_: function (cal, empId, ds) {
    return cal.ot.filter(function (o) { return o.employeeId === empId && o.date === ds; })
      .reduce(function (a, o) { return a + o.minutes; }, 0);
  },

  // ───────── الإجازات ─────────
  workDates_: function (cal, emp, from, to) {
    var out = [];
    for (var d = from, i = 0; d <= to && i < 400; d = addDays_(d, 1), i++) if (Hr.isWorkDay_(cal, emp, d)) out.push(d);
    return out;
  },

  balanceOf_: function (empId, type, year, reqs, bals) {
    var adjRow = null;
    for (var i = 0; i < bals.length; i++) {
      var b = bals[i];
      if (b.employeeId === empId && b.typeId === type.id && String(b.year) === String(year)) { adjRow = b; break; }
    }
    var adj = adjRow ? adjRow.adjustment : 0;
    var mine = reqs.filter(function (r) { return r.employeeId === empId && r.typeId === type.id && r.from.slice(0, 4) === String(year); });
    var used = mine.filter(function (r) { return r.status === 'approved'; }).reduce(function (a, r) { return a + r.days; }, 0);
    var pending = mine.filter(function (r) { return LEAVE_HOLD.indexOf(r.status) >= 0; }).reduce(function (a, r) { return a + r.days; }, 0);
    var unlimited = type.annualDays <= 0;
    return {
      typeId: type.id, name: type.name, paid: type.paid, active: type.active, unlimited: unlimited,
      entitled: type.annualDays, adjustment: adj, used: used, pending: pending,
      available: unlimited ? null : type.annualDays + adj - used - pending, adjNote: adjRow ? adjRow.note : ''
    };
  },

  balancesFor_: function (empId, year) {
    var reqs = Db.view('hr', 'LeaveRequests'), bals = Db.view('hr', 'LeaveBalances');
    return Hr.types_().map(function (t) { return Hr.balanceOf_(empId, t, year, reqs, bals); })
      .filter(function (b) { return b.active || b.used || b.pending || b.adjustment; });
  },

  leaveView_: function (r, maps, types) {
    return {
      id: r.id, employeeId: r.employeeId, name: Staff.name_(maps, r.employeeId),
      typeId: r.typeId, typeName: (types[r.typeId] || {}).name || '—', from: r.from, to: r.to, days: r.days,
      reason: r.reason, status: r.status, statusLabel: LEAVE_STATUS[r.status] || r.status,
      managerId: r.managerId, managerName: Staff.name_(maps, r.managerId), managerNote: r.managerNote,
      decidedBy: r.decidedBy, decidedAt: r.decidedAt, decisionNote: r.decisionNote, createdAt: r.createdAt,
      wfInstanceId: r.wfInstanceId || '', wf: r.wfInstanceId ? Workflow.summaryFor_('hr.leave', r.id) : null, steps: r.wfInstanceId ? [] : Hr.leaveSteps_(r, maps)
    };
  },

  /** مراحل المسار المدمج للإجازة بشكل الخط العمودي: المدير المباشر ← الموارد البشرية */
  leaveSteps_: function (r, maps) {
    var name = function (id) { return Staff.name_(maps, id); };
    if (r.status === 'approved' && !r.managerAt && r.decisionNote === 'سجّلتها الموارد البشرية') {
      return [{ name: 'تسجيل الموارد البشرية', status: 'done', actorName: r.decidedBy, at: r.decidedAt, note: '', assignees: [] }];
    }
    var mgrDone = !!r.managerAt, closed = ['approved', 'rejected', 'cancelled'].indexOf(r.status) >= 0;
    var mgr = { name: 'المدير المباشر', assignees: r.managerId ? [name(r.managerId)] : [], actorName: mgrDone ? name(r.managerId) : '', at: r.managerAt || '', note: r.managerNote || '' };
    if (mgrDone) mgr.status = r.status === 'rejected' && !r.decidedBy ? 'rejected' : (r.status === 'rejected' && r.decidedAt === r.managerAt ? 'rejected' : 'done');
    else mgr.status = r.status === 'pending_manager' ? 'current' : r.managerId ? (closed ? (r.status === 'cancelled' ? 'cancelled' : 'skipped') : 'pending') : 'skipped';
    var hr = { name: 'الموارد البشرية', assignees: [], actorName: '', at: '', note: '' };
    if (r.status === 'pending_hr') hr.status = 'current';
    else if (r.status === 'approved') Object.assign(hr, { status: 'done', actorName: r.decidedBy, at: r.decidedAt, note: r.decisionNote || '' });
    else if (r.status === 'rejected') Object.assign(hr, mgr.status === 'rejected' ? { status: 'cancelled' } : { status: 'rejected', actorName: r.decidedBy, at: r.decidedAt, note: r.decisionNote || '' });
    else if (r.status === 'cancelled') hr.status = 'cancelled';
    else hr.status = 'pending';
    return [mgr, hr];
  },

  /** أثر نتيجة السلسلة على طلب الإجازة أو الإضافي */
  wfApply_: function (table, ctx, event, inst, what) {
    var r = Db.get('hr', table, inst.entityId);
    if (!r) return;
    var now = nowIso(), note = Workflow.lastNote_(inst.id), ch;
    if (event === 'approved') ch = { status: 'approved', decidedBy: ctx.user.fullName, decidedAt: now, decisionNote: 'اعتُمد في السلسلة «' + inst.templateName + '»' + (note ? ': ' + note : '') };
    else if (event === 'rejected') ch = { status: 'rejected', decidedBy: ctx.user.fullName, decidedAt: now, decisionNote: note || 'رُفض في السلسلة' };
    else if (event === 'returned') ch = { status: 'returned', decisionNote: note };
    else if (event === 'cancelled') ch = { status: 'cancelled', decidedBy: ctx.user.fullName, decidedAt: now, decisionNote: note || 'أُلغيت السلسلة' };
    else return;
    Db.update('hr', table, r.id, ch);
    Audit.log(ctx.user, 'hr', what + '.chain', table === 'LeaveRequests' ? 'LeaveRequest' : 'Overtime', r.id, { event: event, template: inst.templateName });
  },

  canSeeRequest_: function (ctx, empId) {
    if (Hr.isHr_(ctx)) return true;
    var me = Staff.ofCtx_(ctx);
    return !!me && (me.id === empId || Staff.manages_(me.id, empId));
  },

  deptOptions_: function () { return Staff.depts_().filter(function (d) { return d.active !== false; }).map(function (d) { return { id: d.id, label: d.name }; }); },

  /** مضيف السلسلة لطلب الإجازة (docs/09) */
  wfLeave_: function () {
    return {
      module: 'hr', managerRoles: ['hr'], label: 'إجازة', system: true, builtinLabel: 'المدير المباشر ← الموارد البشرية',
      entity_: function (id) {
        var r = Db.get('hr', 'LeaveRequests', id);
        if (!r) return null;
        var emp = Staff.get_(r.employeeId), t = indexBy_(Hr.types_())[r.typeId];
        return {
          id: r.id, number: (t ? t.name : 'إجازة') + ' · ' + r.days + (r.days > 2 && r.days < 11 ? ' أيام' : ' يوم'), title: (emp ? emp.fullName : '') + ' · ' + dmy_(r.from) + ' – ' + dmy_(r.to),
          createdBy: r.createdBy || (emp && emp.userId) || '', version: 0, moduleLabel: 'إجازة',
          facts: [{ k: 'من', v: dmy_(r.from) }, { k: 'إلى', v: dmy_(r.to) }, { k: 'أيام العمل', v: String(r.days) }].concat(r.reason ? [{ k: 'السبب', v: r.reason }] : []),
          values: { $dept: emp ? emp.departmentId || '' : '', 'hr.leave:type': r.typeId, 'hr.leave:days': r.days }
        };
      },
      conditionFields_: function () {
        return [
          { key: '$dept', label: 'قسم المنشئ', kind: 'select', options: Hr.deptOptions_() },
          { key: 'hr.leave:type', label: 'الإجازة: النوع', kind: 'select', options: Hr.types_().map(function (t) { return { id: t.id, label: t.name }; }) },
          { key: 'hr.leave:days', label: 'الإجازة: عدد الأيام', kind: 'number', options: [] }
        ];
      },
      onEvent_: function (ctx, event, inst) { Hr.wfApply_('LeaveRequests', ctx, event, inst, 'leave'); },
      resubmit_: function (ctx, inst) { Db.update('hr', 'LeaveRequests', inst.entityId, { status: 'in_chain', decisionNote: '' }); },
      canSee_: function (ctx, id) { var r = Db.get('hr', 'LeaveRequests', id); return !!r && Hr.canSeeRequest_(ctx, r.employeeId); },
      page_: function (id, ctx) { return Hr.isHr_(ctx) ? '/hr/requests' : '/hr/leave'; }
    };
  },

  /** مضيف السلسلة لطلب العمل الإضافي (docs/09) */
  wfOvertime_: function () {
    return {
      module: 'hr', managerRoles: ['hr'], label: 'عمل إضافي', system: true, builtinLabel: 'المدير المباشر أو الموارد البشرية',
      entity_: function (id) {
        var o = Db.get('hr', 'OvertimeRequests', id);
        if (!o) return null;
        var emp = Staff.get_(o.employeeId);
        return {
          id: o.id, number: 'عمل إضافي · ' + o.minutes + ' دقيقة', title: (emp ? emp.fullName : '') + ' · ' + dmy_(o.date),
          createdBy: o.createdBy || (emp && emp.userId) || '', version: 0, moduleLabel: 'عمل إضافي',
          facts: [{ k: 'اليوم', v: dmy_(o.date) }, { k: 'الدقائق', v: String(o.minutes) }].concat(o.reason ? [{ k: 'السبب', v: o.reason }] : []),
          values: { $dept: emp ? emp.departmentId || '' : '', 'hr.overtime:minutes': o.minutes }
        };
      },
      conditionFields_: function () {
        return [{ key: '$dept', label: 'قسم المنشئ', kind: 'select', options: Hr.deptOptions_() }, { key: 'hr.overtime:minutes', label: 'العمل الإضافي: الدقائق', kind: 'number', options: [] }];
      },
      onEvent_: function (ctx, event, inst) { Hr.wfApply_('OvertimeRequests', ctx, event, inst, 'ot'); },
      resubmit_: function (ctx, inst) { Db.update('hr', 'OvertimeRequests', inst.entityId, { status: 'in_chain', decisionNote: '' }); },
      canSee_: function (ctx, id) { var o = Db.get('hr', 'OvertimeRequests', id); return !!o && Hr.canSeeRequest_(ctx, o.employeeId); },
      page_: function (id, ctx) { return Hr.isHr_(ctx) ? '/hr/requests' : '/hr/overtime'; }
    };
  },

  leaveViews_: function (rows) {
    var maps = Staff.maps_(), types = indexBy_(Hr.types_());
    return rows.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; })
      .map(function (r) { return Hr.leaveView_(r, maps, types); });
  },

  /** مدير نشط يستطيع الدخول للموافقة */
  approverOf_: function (emp) {
    var mid = Staff.managerIdOf_(emp);
    if (!mid) return '';
    var m = Staff.get_(mid);
    if (!m || m.status === 'terminated' || !m.userId) return '';
    var u = Db.get('core', 'Users', m.userId);
    return u && u.active ? mid : '';
  },

  createLeave_: function (ctx, emp, p, direct) {
    return withLock(function () {
      var cal = Hr.calendar_();
      var t = cal.types[p.typeId];
      if (!t || !t.active) throw appError('اختر نوع الإجازة.');
      var from = requireDate_(p.from, 'تاريخ البداية');
      var to = requireDate_(p.to, 'تاريخ النهاية');
      if (to < from) throw appError('تاريخ النهاية يجب ألا يسبق تاريخ البداية.');
      if (daysBetween_(from, to) > 365) throw appError('مدة الإجازة أطول من المسموح.');
      var dates = Hr.workDates_(cal, emp, from, to);
      if (!dates.length) throw appError('الفترة المحددة كلها عطلات، لا أيام عمل تُحتسب فيها.');
      var reqs = Db.view('hr', 'LeaveRequests');
      var clash = reqs.filter(function (r) {
        return r.employeeId === emp.id && (r.status === 'approved' || LEAVE_HOLD.indexOf(r.status) >= 0) && r.from <= to && from <= r.to;
      })[0];
      if (clash) throw appError('يوجد طلب إجازة آخر يتداخل مع هذه الفترة (' + clash.from + ' إلى ' + clash.to + ').');
      var bal = Hr.balanceOf_(emp.id, t, from.slice(0, 4), reqs, Db.view('hr', 'LeaveBalances'));
      if (!bal.unlimited && bal.available < dates.length) {
        throw appError('رصيد ' + t.name + ' غير كافٍ: المتاح ' + bal.available + ' يوم والمطلوب ' + dates.length + '.');
      }
      var approver = direct ? '' : Hr.approverOf_(emp);
      var now = nowIso();
      var rec = Db.insert('hr', 'LeaveRequests', {
        employeeId: emp.id, typeId: t.id, from: from, to: to, days: dates.length, reason: optionalText(p.reason, 500),
        status: direct ? 'approved' : (approver ? 'pending_manager' : 'pending_hr'), managerId: approver,
        decidedBy: direct ? ctx.user.fullName : '', decidedAt: direct ? now : '',
        decisionNote: direct ? (optionalText(p.note, 300) || 'سجّلتها الموارد البشرية') : '',
        createdAt: now, createdBy: ctx.user.id
      });
      Audit.log(ctx.user, 'hr', direct ? 'leave.create' : 'leave.request', 'LeaveRequest', rec.id,
        { employee: emp.fullName, type: t.name, from: from, to: to, days: dates.length });
      // السلسلة الإجرائية إن كانت الإجازة مربوطة بها (docs/09)
      if (!direct) {
        var inst = Workflow.startIfBound_(ctx, 'hr.leave', rec.id, function () { Db.update('hr', 'LeaveRequests', rec.id, { status: 'in_chain', managerId: '' }); });
        if (inst) rec = Db.update('hr', 'LeaveRequests', rec.id, { wfInstanceId: inst.id });
      }
      return Db.get('hr', 'LeaveRequests', rec.id);
    });
  },

  /** قرار على طلب إجازة: مرحلة المدير أو القرار النهائي للموارد البشرية */
  decideLeave_: function (ctx, p) {
    return withLock(function () {
      var r = Db.getOrThrow('hr', 'LeaveRequests', p.id, 'طلب الإجازة');
      if (LEAVE_OPEN.indexOf(r.status) < 0) throw appError('تم البت في هذا الطلب مسبقاً.');
      var me = Staff.ofCtx_(ctx);
      if (me && me.id === r.employeeId && !ctx.user.isSuperAdmin) throw appError('لا يمكنك البت في طلبك بنفسك.', 'FORBIDDEN');
      var note = optionalText(p.note, 300);
      var approve = bool_(p.approve);
      if (!approve && !note) throw appError('اكتب سبب الرفض.');
      var now = nowIso(), changes, stage;
      var isManager = me && r.status === 'pending_manager' && (r.managerId === me.id || Staff.manages_(me.id, r.employeeId));
      if (Hr.isHr_(ctx)) {
        stage = 'hr';
        if (approve) {
          var t = indexBy_(Hr.types_())[r.typeId];
          if (t) {
            var bal = Hr.balanceOf_(r.employeeId, t, r.from.slice(0, 4), Db.view('hr', 'LeaveRequests'), Db.view('hr', 'LeaveBalances'));
            if (!bal.unlimited && bal.available < 0) throw appError('الرصيد لا يكفي. عدّل الرصيد أولاً أو ارفض الطلب.');
          }
        }
        changes = { status: approve ? 'approved' : 'rejected', decidedBy: ctx.user.fullName, decidedAt: now, decisionNote: note };
        if (r.status === 'pending_manager' && isManager) Object.assign(changes, { managerId: me.id, managerAt: now, managerNote: note });
      } else if (isManager) {
        stage = 'manager';
        changes = { managerId: me.id, managerAt: now, managerNote: note };
        if (approve) changes.status = 'pending_hr';
        else Object.assign(changes, { status: 'rejected', decidedBy: ctx.user.fullName, decidedAt: now, decisionNote: note });
      } else {
        throw appError('ليست لديك صلاحية البت في هذا الطلب.', 'FORBIDDEN');
      }
      var next = Db.update('hr', 'LeaveRequests', r.id, changes);
      Audit.log(ctx.user, 'hr', 'leave.' + (approve ? 'approve' : 'reject'), 'LeaveRequest', r.id, { stage: stage, status: next.status, note: note });
      return next;
    });
  },

  // ───────── العمل الإضافي ─────────
  otViews_: function (rows) {
    var maps = Staff.maps_();
    return rows.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; }).map(function (o) {
      return {
        id: o.id, employeeId: o.employeeId, name: Staff.name_(maps, o.employeeId), date: o.date, minutes: o.minutes,
        reason: o.reason, status: o.status, statusLabel: OT_STATUS[o.status] || o.status, createdByName: o.createdByName,
        decidedBy: o.decidedBy, decidedAt: o.decidedAt, decisionNote: o.decisionNote, createdAt: o.createdAt,
        wfInstanceId: o.wfInstanceId || '', wf: o.wfInstanceId ? Workflow.summaryFor_('hr.overtime', o.id) : null,
        steps: o.wfInstanceId ? [] : [Hr.singleStep_('المدير المباشر أو الموارد البشرية', o)]
      };
    });
  },

  /** مرحلة المسار المدمج الواحدة (الإضافي، تصحيح البصمة) بشكل الخط العمودي */
  singleStep_: function (name, x) {
    var st = { pending: 'current', approved: 'done', rejected: 'rejected', cancelled: 'cancelled' }[x.status] || 'pending';
    return { name: name, status: st, assignees: [], actorName: st === 'current' ? '' : x.decidedBy || '', at: x.decidedAt || '', note: x.decisionNote || '' };
  },

  canManageOt_: function (ctx, empId) {
    if (Hr.isHr_(ctx)) return true;
    var me = Staff.ofCtx_(ctx);
    return !!me && Staff.manages_(me.id, empId);
  },

  addOt_: function (ctx, emp, p, direct) {
    return withLock(function () {
      var date = requireDate_(p.date, 'التاريخ');
      if (date > localDate_()) throw appError('لا يمكن تسجيل إضافي ليوم لم يأتِ بعد.');
      var mins = intIn_(p.minutes, 1, OT_MAX_MIN, 'عدد دقائق الإضافي');
      if (!direct && !Attendance.hasRecordOn_(emp.id, date)) throw appError('لا يوجد تسجيل حضور في هذا اليوم.');
      var dup = Db.view('hr', 'OvertimeRequests').some(function (o) {
        return o.employeeId === emp.id && o.date === date && ['pending', 'approved', 'in_chain', 'returned'].indexOf(o.status) >= 0;
      });
      if (dup) throw appError('يوجد طلب إضافي لهذا اليوم مسبقاً.');
      var now = nowIso();
      var rec = Db.insert('hr', 'OvertimeRequests', {
        employeeId: emp.id, date: date, minutes: mins, reason: optionalText(p.reason, 300),
        status: direct ? 'approved' : 'pending', createdBy: ctx.user.id, createdByName: ctx.user.fullName,
        decidedBy: direct ? ctx.user.fullName : '', decidedAt: direct ? now : '',
        decisionNote: direct ? 'سجّله المدير مباشرة' : '', createdAt: now
      });
      Audit.log(ctx.user, 'hr', direct ? 'ot.add' : 'ot.request', 'Overtime', rec.id, { employee: emp.fullName, date: date, minutes: mins });
      if (!direct) {
        var inst = Workflow.startIfBound_(ctx, 'hr.overtime', rec.id, function () { Db.update('hr', 'OvertimeRequests', rec.id, { status: 'in_chain' }); });
        if (inst) Db.update('hr', 'OvertimeRequests', rec.id, { wfInstanceId: inst.id });
      }
      return Db.get('hr', 'OvertimeRequests', rec.id);
    });
  },

  decideOt_: function (ctx, p) {
    return withLock(function () {
      var o = Db.getOrThrow('hr', 'OvertimeRequests', p.id, 'طلب الإضافي');
      if (o.status !== 'pending') throw appError('تم البت في هذا الطلب مسبقاً.');
      var me = Staff.ofCtx_(ctx);
      if (me && me.id === o.employeeId && !ctx.user.isSuperAdmin) throw appError('لا يمكنك البت في طلبك بنفسك.', 'FORBIDDEN');
      if (!Hr.canManageOt_(ctx, o.employeeId)) throw appError('ليست لديك صلاحية البت في هذا الطلب.', 'FORBIDDEN');
      var approve = bool_(p.approve), note = optionalText(p.note, 300);
      if (!approve && !note) throw appError('اكتب سبب الرفض.');
      var next = Db.update('hr', 'OvertimeRequests', o.id, {
        status: approve ? 'approved' : 'rejected', decidedBy: ctx.user.fullName, decidedAt: nowIso(), decisionNote: note
      });
      Audit.log(ctx.user, 'hr', 'ot.' + (approve ? 'approve' : 'reject'), 'Overtime', o.id, { note: note });
      return next;
    });
  },

  // ───────── المسارات: الموظف ─────────
  me: function (ctx, p) {
    var year = String((p && p.year) || localDate_().slice(0, 4));
    var emp = Staff.ofCtx_(ctx);
    var types = Hr.types_().filter(function (t) { return t.active; }).map(function (t) { return { id: t.id, name: t.name }; });
    if (!emp) return { employee: null, year: year, types: types, balances: [], leaves: [], overtime: [], isManager: false, isHr: Hr.isHr_(ctx) };
    var maps = Staff.maps_();
    var shifts = indexBy_(Db.view('hr', 'Shifts'));
    var team = Staff.teamIds_(emp.id);
    return {
      employee: Staff.view_(emp, maps, { sensitive: true, shifts: shifts }),
      year: year, types: types,
      balances: Hr.balancesFor_(emp.id, year),
      leaves: Hr.leaveViews_(Db.view('hr', 'LeaveRequests').filter(function (r) { return r.employeeId === emp.id; })),
      overtime: Hr.otViews_(Db.view('hr', 'OvertimeRequests').filter(function (o) { return o.employeeId === emp.id; })),
      isManager: team.length > 0, isHr: Hr.isHr_(ctx), teamCount: team.length
    };
  },

  /** لوحة الموارد البشرية (للموارد البشرية والمديرين ضمن فريقهم): القوى العاملة، الطلبات المعلقة، المستندات، الإجازات، التعيينات */
  dashboard: function (ctx) {
    var scope = Staff.scope_(ctx, 'hr', ['hr']);
    if (!scope.all && !scope.ids.length) throw appError('هذه الشاشة للمديرين والموارد البشرية.', 'FORBIDDEN');
    var today = localDate_(), year = today.slice(0, 4), month = today.slice(0, 7), maps = Staff.maps_(), types = indexBy_(Hr.types_());
    var emps = Staff.all_().filter(function (e) { return Staff.inScope_(scope, e.id); }), inScope = indexBy_(emps);
    var current = emps.filter(function (e) { return e.status !== 'terminated'; });
    var leaves = Db.view('hr', 'LeaveRequests').filter(function (r) { return inScope[r.employeeId]; });
    var ots = Db.view('hr', 'OvertimeRequests').filter(function (o) { return inScope[o.employeeId]; });
    var approved = leaves.filter(function (r) { return r.status === 'approved'; });
    var onLeaveToday = approved.filter(function (r) { return r.from <= today && r.to >= today; });
    var since90 = addDays_(today, -90), soon = addDays_(today, 14);
    var expiring = Staff.expiring_(60).filter(function (x) { return inScope[x.employeeId]; });
    var count = function (list, fn) {
      var o = {};
      list.forEach(function (x) { var k = fn(x); if (k) o[k] = (o[k] || 0) + 1; });
      return Object.keys(o).map(function (k) { return { key: k, count: o[k] }; }).sort(function (a, b) { return b.count - a.count; });
    };
    var hiresByMonth = [];
    for (var i = 11; i >= 0; i--) {
      var y = Number(month.slice(0, 4)), mo = Number(month.slice(5, 7)) - i;
      while (mo < 1) { mo += 12; y--; }
      var key = y + '-' + String(mo).padStart(2, '0');
      hiresByMonth.push({ month: key, hires: emps.filter(function (e) { return (e.hireDate || '').slice(0, 7) === key; }).length });
    }
    var leaveDaysByType = {};
    approved.forEach(function (r) { if ((r.from || '').slice(0, 4) === year) leaveDaysByType[r.typeId] = (leaveDaysByType[r.typeId] || 0) + (r.days || 0); });
    return {
      today: today, scope: scope.all ? 'all' : 'team',
      kpis: {
        headcount: current.length, onLeaveToday: onLeaveToday.length,
        newHires90: current.filter(function (e) { return e.hireDate && e.hireDate >= since90; }).length,
        newHiresYear: emps.filter(function (e) { return (e.hireDate || '').slice(0, 4) === year; }).length,
        terminated: emps.filter(function (e) { return e.status === 'terminated'; }).length,
        pendingLeaves: leaves.filter(function (r) { return LEAVE_OPEN.indexOf(r.status) >= 0; }).length,
        pendingManager: leaves.filter(function (r) { return r.status === 'pending_manager'; }).length,
        pendingOvertime: ots.filter(function (o) { return o.status === 'pending'; }).length,
        expiring30: expiring.filter(function (x) { return x.daysLeft <= 30; }).length, expiring60: expiring.length,
        expired: expiring.filter(function (x) { return x.daysLeft < 0; }).length,
        leaveDaysYear: approved.filter(function (r) { return (r.from || '').slice(0, 4) === year; }).reduce(function (a, r) { return a + (r.days || 0); }, 0),
        overtimeMinMonth: ots.filter(function (o) { return o.status === 'approved' && (o.date || '').slice(0, 7) === month; }).reduce(function (a, o) { return a + (o.minutes || 0); }, 0),
        withoutAccount: current.filter(function (e) { return !e.userId; }).length
      },
      byStatus: Object.keys(EMP_STATUS).map(function (k) { return { status: k, label: EMP_STATUS[k], count: emps.filter(function (e) { return (e.status || 'active') === k; }).length }; }),
      byDepartment: count(current, function (e) { return e.departmentId && maps.depts[e.departmentId] ? maps.depts[e.departmentId].name : 'بلا قسم'; }).map(function (x) { return { department: x.key, count: x.count }; }),
      byBranch: count(current, function (e) { return e.branchId && maps.branches[e.branchId] ? maps.branches[e.branchId].name : ''; }).map(function (x) { return { branch: x.key, count: x.count }; }),
      byNationality: count(current, function (e) { return e.nationality || ''; }).slice(0, 6).map(function (x) { return { nationality: x.key, count: x.count }; }),
      byContract: count(current, function (e) { return e.contractType || ''; }).map(function (x) { return { contract: x.key, count: x.count }; }),
      leaveByType: Object.keys(leaveDaysByType).map(function (k) { return { type: (types[k] || {}).name || k, days: leaveDaysByType[k] }; }).sort(function (a, b) { return b.days - a.days; }),
      hiresByMonth: hiresByMonth,
      onLeaveToday: Hr.leaveViews_(onLeaveToday).slice(0, 8),
      upcomingLeaves: Hr.leaveViews_(approved.filter(function (r) { return r.from > today && r.from <= soon; })).sort(function (a, b) { return a.from.localeCompare(b.from); }).slice(0, 8),
      pendingLeaves: Hr.leaveViews_(leaves.filter(function (r) { return LEAVE_OPEN.indexOf(r.status) >= 0; })).slice(0, 8),
      expiring: expiring.slice(0, 8)
    };
  },

  leaveRequest: function (ctx, p) {
    var emp = Staff.requireOfCtx_(ctx);
    return Hr.createLeave_(ctx, emp, p, false);
  },

  leaveCancel: function (ctx, p) {
    return withLock(function () {
      var r = Db.getOrThrow('hr', 'LeaveRequests', p.id, 'طلب الإجازة');
      var me = Staff.ofCtx_(ctx);
      if (!me || r.employeeId !== me.id) throw appError('ليست لديك صلاحية لهذا الإجراء.', 'FORBIDDEN');
      if ((r.status === 'in_chain' || r.status === 'returned') && r.wfInstanceId) {
        Workflow.cancelFor_(ctx, r.wfInstanceId, 'ألغاه الموظف');
        Audit.log(ctx.user, 'hr', 'leave.cancel', 'LeaveRequest', r.id, null);
        return true;
      }
      if (LEAVE_OPEN.indexOf(r.status) < 0) throw appError('لا يمكن إلغاء الطلب بعد البت فيه. تواصل مع الموارد البشرية.');
      Db.update('hr', 'LeaveRequests', r.id, { status: 'cancelled', decidedBy: ctx.user.fullName, decidedAt: nowIso(), decisionNote: 'ألغاه الموظف' });
      Audit.log(ctx.user, 'hr', 'leave.cancel', 'LeaveRequest', r.id, null);
      return true;
    });
  },

  leaveDecide: function (ctx, p) { return Hr.decideLeave_(ctx, p); },

  otRequest: function (ctx, p) {
    var emp = Staff.requireOfCtx_(ctx);
    return Hr.addOt_(ctx, emp, p, false);
  },

  otCancel: function (ctx, p) {
    return withLock(function () {
      var o = Db.getOrThrow('hr', 'OvertimeRequests', p.id, 'طلب الإضافي');
      var me = Staff.ofCtx_(ctx);
      var own = me && o.employeeId === me.id;
      if ((o.status === 'in_chain' || o.status === 'returned') && own && o.wfInstanceId) {
        Workflow.cancelFor_(ctx, o.wfInstanceId, 'ألغاه الموظف');
      } else if (o.status === 'pending' && own) {
        Db.update('hr', 'OvertimeRequests', o.id, { status: 'cancelled', decidedBy: ctx.user.fullName, decidedAt: nowIso(), decisionNote: 'ألغاه الموظف' });
      } else if (o.status === 'approved' && Hr.canManageOt_(ctx, o.employeeId) && !own) {
        Db.update('hr', 'OvertimeRequests', o.id, { status: 'cancelled', decidedBy: ctx.user.fullName, decidedAt: nowIso(), decisionNote: optionalText(p.note, 300) || 'ألغاه المدير' });
      } else {
        throw appError('لا يمكن إلغاء هذا الطلب.', 'FORBIDDEN');
      }
      Audit.log(ctx.user, 'hr', 'ot.cancel', 'Overtime', o.id, null);
      return true;
    });
  },

  otAdd: function (ctx, p) {
    var emp = Staff.getOrThrow_(p.employeeId);
    if (!Hr.canManageOt_(ctx, emp.id)) throw appError('ليست لديك صلاحية لهذا الإجراء.', 'FORBIDDEN');
    var me = Staff.ofCtx_(ctx);
    if (me && me.id === emp.id && !ctx.user.isSuperAdmin) throw appError('لا يمكنك تسجيل إضافي معتمد لنفسك.', 'FORBIDDEN');
    return Hr.addOt_(ctx, emp, p, true);
  },

  otDecide: function (ctx, p) { return Hr.decideOt_(ctx, p); },

  /** فريق المدير: الأعضاء وطلباتهم */
  team: function (ctx, p) {
    var me = Staff.ofCtx_(ctx);
    var ids = me ? Staff.teamIds_(me.id) : [];
    var maps = Staff.maps_();
    var shifts = indexBy_(Db.view('hr', 'Shifts'));
    var year = String((p && p.year) || localDate_().slice(0, 4));
    return {
      members: ids.map(function (id) { return maps.emps[id]; }).filter(Boolean)
        .map(function (e) { return Staff.view_(e, maps, { shifts: shifts }); })
        .sort(function (a, b) { return a.fullName.localeCompare(b.fullName, 'ar'); }),
      leaves: Hr.leaveViews_(Db.view('hr', 'LeaveRequests').filter(function (r) { return ids.indexOf(r.employeeId) >= 0 && r.from.slice(0, 4) >= String(Number(year) - 1); })),
      overtime: Hr.otViews_(Db.view('hr', 'OvertimeRequests').filter(function (o) { return ids.indexOf(o.employeeId) >= 0; })).slice(0, 200)
    };
  },

  // ───────── المسارات: الموارد البشرية ─────────
  structure_: function () {
    return {
      departments: Staff.depts_().map(function (d) { return { id: d.id, name: d.name, managerId: d.managerId, active: d.active }; }),
      branches: Staff.branches_().map(function (b) { return { id: b.id, name: b.name, address: b.address, lat: b.lat, lng: b.lng, geoRadius: b.geoRadius, active: b.active }; }),
      shifts: Db.view('hr', 'Shifts').map(function (s) { return { id: s.id, name: s.name, start: s.start, end: s.end, graceMin: s.graceMin, workDays: s.workDays, active: s.active }; }),
      holidays: Db.view('hr', 'Holidays').slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })
        .map(function (h) { return { id: h.id, date: h.date, dateTo: h.dateTo, name: h.name }; }),
      leaveTypes: Hr.types_().map(function (t) { return { id: t.id, name: t.name, annualDays: t.annualDays, paid: t.paid, active: t.active }; })
    };
  },

  directory: function (ctx) {
    var maps = Staff.maps_();
    var shifts = indexBy_(Db.view('hr', 'Shifts'));
    var employees = Staff.all_().map(function (e) { return Staff.view_(e, maps, { sensitive: true, shifts: shifts }); })
      .sort(function (a, b) { return (a.status === 'terminated') - (b.status === 'terminated') || a.fullName.localeCompare(b.fullName, 'ar'); });
    var linked = {};
    Staff.all_().forEach(function (e) { if (e.userId) linked[e.userId] = true; });
    var out = Object.assign(Hr.structure_(), { employees: employees, expiring: Staff.expiring_(), canManageAccounts: !!ctx.user.isSuperAdmin });
    if (ctx.user.isSuperAdmin) {
      out.freeUsers = Db.view('core', 'Users').filter(function (u) { return !linked[u.id]; })
        .map(function (u) { return { id: u.id, username: u.username, fullName: u.fullName, active: u.active }; });
    }
    return out;
  },

  structure: function () { return Hr.structure_(); },

  /** يسأل الوحدات المفعّلة (offboard في ModuleProviders_) إن كان لديها ما يمنع إنهاء خدمة الموظف */
  assertCanOffboard_: function (emp) {
    var reasons = ModuleProviders_().filter(function (m) {
      var def = moduleDef_(m.key);
      return m.offboard && def && def.enabled;
    }).map(function (m) { return m.offboard(emp.id); }).filter(Boolean);
    if (reasons.length) throw appError('لا يمكن إنهاء خدمة ' + emp.fullName + ': ' + reasons.join(' '), 'OFFBOARD_BLOCKED');
  },

  employeeSave: function (ctx, p) {
    return withLock(function () {
      var d = p || {};
      var cur = d.id ? Staff.getOrThrow_(d.id) : null;
      var maps = Staff.maps_();
      var refOk = function (id, map, label) {
        if (!id) return '';
        if (!map[id]) throw appError(label + ' غير موجود.');
        return id;
      };
      var rec = {
        fullName: requireText(d.fullName, 'اسم الموظف', 80),
        empNo: optionalText(normalizeDigits(d.empNo), 20) || (cur ? cur.empNo : Staff.nextEmpNo_()),
        jobTitle: optionalText(d.jobTitle, 60),
        departmentId: refOk(d.departmentId, maps.depts, 'القسم'),
        branchId: refOk(d.branchId, maps.branches, 'الفرع'),
        shiftId: refOk(d.shiftId, indexBy_(Db.view('hr', 'Shifts')), 'الوردية'),
        managerId: refOk(d.managerId, maps.emps, 'المدير المباشر'),
        status: EMP_STATUS[d.status] ? d.status : 'active',
        hireDate: optionalDate_(d.hireDate, 'تاريخ التعيين'),
        phone: optionalText(normalizeDigits(d.phone), 30),
        email: optionalEmail(d.email),
        nationality: optionalText(d.nationality, 40),
        birthDate: optionalDate_(d.birthDate, 'تاريخ الميلاد'),
        civilId: optionalText(normalizeDigits(d.civilId), 20),
        civilIdExpiry: optionalDate_(d.civilIdExpiry, 'انتهاء البطاقة المدنية'),
        residencyNo: optionalText(normalizeDigits(d.residencyNo), 30),
        residencyExpiry: optionalDate_(d.residencyExpiry, 'انتهاء الإقامة'),
        passportNo: optionalText(d.passportNo, 30),
        passportExpiry: optionalDate_(d.passportExpiry, 'انتهاء الجواز'),
        contractType: optionalText(d.contractType, 40),
        contractEnd: optionalDate_(d.contractEnd, 'انتهاء العقد'),
        address: optionalText(d.address, 200),
        emergencyName: optionalText(d.emergencyName, 80),
        emergencyPhone: optionalText(normalizeDigits(d.emergencyPhone), 30),
        notes: optionalText(d.notes, 1000),
        updatedAt: nowIso()
      };
      if (cur && rec.managerId === cur.id) throw appError('لا يمكن أن يكون الموظف مديراً لنفسه.');
      if (cur && rec.managerId && Staff.teamIds_(cur.id).indexOf(rec.managerId) >= 0) throw appError('لا يمكن اختيار أحد أفراد فريق الموظف مديراً له.');
      if (cur && rec.status === 'terminated' && cur.status !== 'terminated') Hr.assertCanOffboard_(cur);
      var dupNo = Staff.all_().some(function (e) { return e.empNo === rec.empNo && (!cur || e.id !== cur.id); });
      if (dupNo) throw appError('الرقم الوظيفي ' + rec.empNo + ' مستخدم لموظف آخر.');
      var saved;
      if (cur) {
        saved = Db.update('core', 'Employees', cur.id, rec);
        if (cur.userId && rec.fullName !== cur.fullName) {
          Db.update('core', 'Users', cur.userId, { fullName: rec.fullName, jobTitle: rec.jobTitle || '', updatedAt: nowIso() });
        }
      } else {
        saved = Db.insert('core', 'Employees', Object.assign(rec, { createdAt: nowIso(), createdBy: ctx.user.id }));
      }
      Audit.log(ctx.user, 'hr', cur ? 'employee.update' : 'employee.create', 'Employee', saved.id, { name: saved.fullName, empNo: saved.empNo, status: saved.status });
      return Staff.view_(saved, Staff.maps_(), { sensitive: true, shifts: indexBy_(Db.view('hr', 'Shifts')) });
    });
  },

  /** حساب الدخول للموظف: إنشاء أو ربط أو فك ربط (مدير النظام) */
  employeeAccount: function (ctx, p) {
    return withLock(function () {
      var emp = Staff.getOrThrow_(p.id);
      var out = { employeeId: emp.id };
      if (p.action === 'unlink') {
        if (emp.userId) Db.update('core', 'Users', emp.userId, { employeeId: '' });
        Db.update('core', 'Employees', emp.id, { userId: '' });
      } else if (p.action === 'link') {
        if (emp.userId) throw appError('الموظف مرتبط بحساب مسبقاً.');
        var u = Db.getOrThrow('core', 'Users', p.userId, 'المستخدم');
        if (Staff.byUser_(u.id)) throw appError('هذا الحساب مرتبط بموظف آخر.');
        Db.update('core', 'Users', u.id, { employeeId: emp.id });
        Db.update('core', 'Employees', emp.id, { userId: u.id });
      } else if (p.action === 'create') {
        if (emp.userId) throw appError('الموظف مرتبط بحساب مسبقاً.');
        var created = Users.create(ctx, {
          username: p.username, fullName: emp.fullName, jobTitle: emp.jobTitle, phone: emp.phone, email: emp.email,
          roles: { attendance: 'employee', hr: 'employee' }
        });
        Db.update('core', 'Users', created.user.id, { employeeId: emp.id });
        Db.update('core', 'Employees', emp.id, { userId: created.user.id });
        out.username = created.user.username;
        out.tempPassword = created.tempPassword;
      } else {
        throw appError('إجراء غير معروف.');
      }
      Audit.log(ctx.user, 'hr', 'employee.account.' + p.action, 'Employee', emp.id, { userId: p.userId || '' });
      return out;
    });
  },

  deptSave: function (ctx, p) {
    return Hr.saveNamed_(ctx, 'core', 'Departments', p, 'القسم', function (name) {
      var mid = p.managerId || '';
      if (mid && !Staff.get_(mid)) throw appError('مدير القسم غير موجود.');
      return { name: name, managerId: mid, active: p.active !== false };
    });
  },

  branchSave: function (ctx, p) {
    return Hr.saveNamed_(ctx, 'core', 'Branches', p, 'الفرع', function (name) {
      var geo = Hr.geo_(p);
      return Object.assign({ name: name, address: optionalText(p.address, 200), active: p.active !== false }, geo);
    });
  },

  /** إحداثيات الفرع ونطاق البصمة (اختياري) */
  geo_: function (p) {
    var lat = normalizeDigits(p.lat).trim(), lng = normalizeDigits(p.lng).trim();
    if (!lat && !lng) return { lat: '', lng: '', geoRadius: 0 };
    if (isNaN(Number(lat)) || isNaN(Number(lng)) || !lat || !lng || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180) {
      throw appError('إحداثيات الموقع غير صحيحة.');
    }
    return { lat: lat, lng: lng, geoRadius: intIn_(p.geoRadius || 150, 20, 5000, 'نطاق البصمة بالمتر') };
  },

  shiftSave: function (ctx, p) {
    return Hr.saveNamed_(ctx, 'hr', 'Shifts', p, 'الوردية', function (name) {
      var start = requireTime_(p.start, 'وقت البداية'), end = requireTime_(p.end, 'وقت النهاية');
      if (start === end) throw appError('وقت البداية والنهاية متطابقان.');
      var days = String(p.workDays == null ? '' : p.workDays).split(',').filter(function (x) { return x !== ''; });
      if (!days.length || days.some(function (d) { return !/^[0-6]$/.test(d); })) throw appError('اختر يوم عمل واحداً على الأقل.');
      var uniq = days.filter(function (d, i) { return days.indexOf(d) === i; }).sort();
      return { name: name, start: start, end: end, graceMin: intIn_(p.graceMin || 0, 0, 120, 'فترة السماح'), workDays: uniq.join(','), active: p.active !== false };
    });
  },

  leaveTypeSave: function (ctx, p) {
    Hr.types_();
    return Hr.saveNamed_(ctx, 'hr', 'LeaveTypes', p, 'نوع الإجازة', function (name) {
      return { name: name, annualDays: intIn_(p.annualDays || 0, 0, 365, 'الأيام السنوية'), paid: p.paid !== false, active: p.active !== false, sortOrder: Number(p.sortOrder) || 9 };
    });
  },

  /** حفظ عنصر بسيط له اسم فريد */
  saveNamed_: function (ctx, dbKey, table, p, label, build) {
    return withLock(function () {
      var name = requireText(p.name, 'اسم ' + label, 60);
      var list = Db.view(dbKey, table);
      if (list.some(function (x) { return x.name === name && x.id !== p.id; })) throw appError('الاسم مستخدم مسبقاً.');
      var rec = build(name);
      var saved;
      if (p.id) {
        Db.getOrThrow(dbKey, table, p.id, label);
        saved = Db.update(dbKey, table, p.id, rec);
      } else {
        if (SCHEMA_HAS_(dbKey, table, 'createdAt')) rec.createdAt = nowIso();
        saved = Db.insert(dbKey, table, rec);
      }
      Audit.log(ctx.user, 'hr', table.toLowerCase() + (p.id ? '.update' : '.create'), table, saved.id, rec);
      return saved;
    });
  },

  holidaySave: function (ctx, p) {
    return withLock(function () {
      var name = requireText(p.name, 'اسم العطلة', 60);
      var date = requireDate_(p.date, 'تاريخ العطلة');
      var to = optionalDate_(p.dateTo, 'نهاية العطلة');
      if (to && to < date) throw appError('نهاية العطلة قبل بدايتها.');
      var rec = { name: name, date: date, dateTo: to && to !== date ? to : '' };
      var saved = p.id ? Db.update('hr', 'Holidays', Db.getOrThrow('hr', 'Holidays', p.id, 'العطلة').id, rec)
        : Db.insert('hr', 'Holidays', Object.assign(rec, { createdAt: nowIso() }));
      Audit.log(ctx.user, 'hr', 'holiday.save', 'Holiday', saved.id, rec);
      return saved;
    });
  },

  holidayDelete: function (ctx, p) {
    var h = Db.getOrThrow('hr', 'Holidays', p.id, 'العطلة');
    Db.remove('hr', 'Holidays', h.id);
    Audit.log(ctx.user, 'hr', 'holiday.delete', 'Holiday', h.id, { name: h.name, date: h.date });
    return true;
  },

  leaveList: function (ctx, p) {
    p = p || {};
    var rows = Db.view('hr', 'LeaveRequests').filter(function (r) {
      return (!p.status || p.status === 'all' || (p.status === 'open' ? LEAVE_OPEN.indexOf(r.status) >= 0 : r.status === p.status)) &&
        (!p.employeeId || r.employeeId === p.employeeId) && (!p.year || r.from.slice(0, 4) === String(p.year));
    });
    return Hr.leaveViews_(rows);
  },

  leaveCreate: function (ctx, p) {
    var emp = Staff.getOrThrow_(p.employeeId);
    return Hr.createLeave_(ctx, emp, p, true);
  },

  leaveAdminCancel: function (ctx, p) {
    var r = Db.getOrThrow('hr', 'LeaveRequests', p.id, 'طلب الإجازة');
    if (r.status === 'cancelled' || r.status === 'rejected') throw appError('الطلب ملغى أو مرفوض مسبقاً.');
    var note = requireText(p.note, 'سبب الإلغاء', 300);
    Db.update('hr', 'LeaveRequests', r.id, { status: 'cancelled', decidedBy: ctx.user.fullName, decidedAt: nowIso(), decisionNote: note });
    Audit.log(ctx.user, 'hr', 'leave.adminCancel', 'LeaveRequest', r.id, { note: note, previous: r.status });
    return true;
  },

  /** حذف نهائي لطلب إجازة (للبيانات التجريبية أو المدخلة خطأً). لمدير النظام فقط، ويبقى أثره في السجل */
  leaveRemove: function (ctx, p) {
    var r = Db.getOrThrow('hr', 'LeaveRequests', p.id, 'طلب الإجازة');
    Db.remove('hr', 'LeaveRequests', r.id);
    Audit.log(ctx.user, 'hr', 'leave.remove', 'LeaveRequest', r.id,
      { employeeId: r.employeeId, typeId: r.typeId, from: r.from, to: r.to, days: r.days, status: r.status });
    return true;
  },

  leaveBalances: function (ctx, p) {
    var emp = Staff.getOrThrow_(p.employeeId);
    var year = String(p.year || localDate_().slice(0, 4));
    return { employeeId: emp.id, year: year, balances: Hr.balancesFor_(emp.id, year) };
  },

  leaveAdjust: function (ctx, p) {
    return withLock(function () {
      var emp = Staff.getOrThrow_(p.employeeId);
      var t = indexBy_(Hr.types_())[p.typeId];
      if (!t) throw appError('نوع الإجازة غير صحيح.');
      var year = String(p.year || '');
      if (!/^20\d\d$/.test(year)) throw appError('السنة غير صحيحة.');
      var adj = Number(normalizeDigits(p.adjustment));
      if (isNaN(adj) || adj < -365 || adj > 365) throw appError('التسوية يجب أن تكون بين -365 و 365 يوماً.');
      var note = optionalText(p.note, 200);
      var cur = Db.view('hr', 'LeaveBalances').filter(function (b) { return b.employeeId === emp.id && b.typeId === t.id && String(b.year) === year; })[0];
      var rec = { employeeId: emp.id, typeId: t.id, year: year, adjustment: adj, note: note, updatedAt: nowIso(), updatedBy: ctx.user.fullName };
      if (cur) Db.update('hr', 'LeaveBalances', cur.id, rec); else Db.insert('hr', 'LeaveBalances', rec);
      Audit.log(ctx.user, 'hr', 'leave.adjust', 'Employee', emp.id, { type: t.name, year: year, adjustment: adj, note: note });
      return Hr.leaveBalances(ctx, { employeeId: emp.id, year: year });
    });
  },

  otList: function (ctx, p) {
    p = p || {};
    return Hr.otViews_(Db.view('hr', 'OvertimeRequests').filter(function (o) {
      return (!p.status || p.status === 'all' || o.status === p.status) && (!p.employeeId || o.employeeId === p.employeeId);
    }));
  },

  // ───────── الرئيسية وصندوق الموافقات ─────────
  inbox_: function (ctx) {
    var me = Staff.ofCtx_(ctx);
    var isHr = Hr.isHr_(ctx);
    var team = me ? Staff.teamIds_(me.id) : [];
    if (!isHr && !team.length) return [];
    var maps = Staff.maps_(), types = indexBy_(Hr.types_());
    var items = [];
    Db.view('hr', 'LeaveRequests').forEach(function (r) {
      if (LEAVE_OPEN.indexOf(r.status) < 0 || (me && r.employeeId === me.id && !ctx.user.isSuperAdmin)) return;
      var mine = r.status === 'pending_manager' && team.indexOf(r.employeeId) >= 0;
      if (!(mine || (isHr && r.status === 'pending_hr'))) return;
      var v = Hr.leaveView_(r, maps, types);
      items.push({
        id: 'hr.leave:' + r.id, kind: 'hr.leave', refId: r.id, module: 'hr', moduleLabel: 'الإجازات',
        title: v.typeName + ' · ' + v.days + (v.days > 2 && v.days < 11 ? ' أيام' : ' يوم'), who: v.name, createdAt: r.createdAt,
        status: v.statusLabel,
        facts: [{ k: 'من', v: dmy_(r.from) }, { k: 'إلى', v: dmy_(r.to) }, { k: 'أيام العمل', v: String(r.days) }]
          .concat(r.managerNote ? [{ k: 'ملاحظة المدير', v: r.managerNote }] : []),
        note: r.reason, needsNoteOnReject: true
      });
    });
    Db.view('hr', 'OvertimeRequests').forEach(function (o) {
      if (o.status !== 'pending' || (me && o.employeeId === me.id && !ctx.user.isSuperAdmin)) return;
      if (!(isHr || team.indexOf(o.employeeId) >= 0)) return;
      items.push({
        id: 'hr.ot:' + o.id, kind: 'hr.ot', refId: o.id, module: 'hr', moduleLabel: 'العمل الإضافي',
        title: 'عمل إضافي · ' + Math.floor(o.minutes / 60) + ':' + ('0' + (o.minutes % 60)).slice(-2) + ' ساعة',
        who: Staff.name_(maps, o.employeeId), createdAt: o.createdAt, status: OT_STATUS.pending,
        facts: [{ k: 'اليوم', v: dmy_(o.date) }, { k: 'المدة', v: o.minutes + ' دقيقة' }], note: o.reason, needsNoteOnReject: true
      });
    });
    return items;
  },

  decide_: function (ctx, kind, p) {
    if (kind === 'hr.leave') return Hr.decideLeave_(ctx, p);
    if (kind === 'hr.ot') return Hr.decideOt_(ctx, p);
    return null;
  },

  summary_: function (ctx) {
    var cards = [];
    var emp = Staff.ofCtx_(ctx);
    if (emp && Permissions.has(ctx, 'hr')) {
      var year = localDate_().slice(0, 4);
      var bal = Hr.balancesFor_(emp.id, year).filter(function (b) { return !b.unlimited; });
      var open = Db.view('hr', 'LeaveRequests').filter(function (r) { return r.employeeId === emp.id && LEAVE_OPEN.indexOf(r.status) >= 0; }).length;
      cards.push({ kind: 'hr.leave', balances: bal.slice(0, 3), openRequests: open });
    }
    if (Hr.isHr_(ctx)) {
      var exp = Staff.expiring_(30);
      cards.push({ kind: 'hr.docs', count: exp.length, items: exp.slice(0, 5), employees: Staff.current_().length });
    }
    return cards;
  },

  /** الإشعارات (Notify): نتيجة طلب الإجازة والإضافي لصاحبه. الطلبات الجديدة تصل للمعتمدين عبر صندوق الموافقات */
  notify_: function (ev) {
    var out = [];
    var userOf = function (empId) { var e = Staff.get_(empId); return e ? e.userId : ''; };
    if (ev.entity === 'LeaveRequest') {
      var r = Db.get('hr', 'LeaveRequests', ev.id);
      if (!r) return out;
      var t = indexBy_(Hr.types_())[r.typeId];
      var detail = (t ? t.name + ' · ' : '') + dmy_(r.from) + ' – ' + dmy_(r.to), to = userOf(r.employeeId), link = '/hr/leave';
      var note = r.decisionNote || r.managerNote;
      if (ev.action === 'leave.create') out.push({ to: to, title: 'سُجّلت لك إجازة', detail: detail, link: link });
      else if (ev.action === 'leave.adminCancel') out.push({ to: to, title: 'أُلغيت إجازتك', detail: detail + (r.decisionNote ? ' — ' + r.decisionNote : ''), link: link });
      else if (ev.action === 'leave.approve' || ev.action === 'leave.reject') {
        if (r.status === 'approved') out.push({ to: to, title: 'اعتُمدت إجازتك', detail: detail, link: link });
        else if (r.status === 'rejected') out.push({ to: to, title: 'رُفض طلب إجازتك', detail: detail + (note ? ' — ' + note : ''), link: link });
        else if (r.status === 'pending_hr') out.push({ to: to, title: 'وافق مديرك على إجازتك، وهي الآن لدى الموارد البشرية', detail: detail, link: link });
      }
    } else if (ev.entity === 'Overtime') {
      var o = Db.get('hr', 'OvertimeRequests', ev.id);
      if (!o) return out;
      var od = dmy_(o.date) + ' · ' + o.minutes + ' دقيقة', ou = userOf(o.employeeId), ol = '/hr/overtime';
      if (ev.action === 'ot.add') out.push({ to: ou, title: 'سُجّل لك عمل إضافي', detail: od, link: ol });
      else if (ev.action === 'ot.approve') out.push({ to: ou, title: 'اعتُمد العمل الإضافي', detail: od, link: ol });
      else if (ev.action === 'ot.reject') out.push({ to: ou, title: 'رُفض طلب العمل الإضافي', detail: od + (o.decisionNote ? ' — ' + o.decisionNote : ''), link: ol });
      else if (ev.action === 'ot.cancel') out.push({ to: ou, title: 'أُلغي العمل الإضافي', detail: od + (o.decisionNote ? ' — ' + o.decisionNote : ''), link: ol });
    }
    return out;
  },

  /** الإشعارات: الإجراءات التي تضع عنصراً في صندوق الموافقات، ومن يُحتمل أن يراه */
  approvalActions_: ['leave.request', 'leave.approve', 'ot.request'],
  approvers_: function (id, entity) {
    var r = Db.get('hr', entity === 'Overtime' ? 'OvertimeRequests' : 'LeaveRequests', id);
    return Notify.usersWithRole_('hr', ['hr']).concat(r ? Notify.managerChainUsers_(r.employeeId) : []);
  },

  routes_: function () {
    var any = { module: 'hr' }, hr = { module: 'hr', roles: ['hr'] };
    return {
      'hr.me': { perm: any, fn: Hr.me },
      'hr.dashboard': { perm: any, fn: Hr.dashboard }, // التحقق داخلها: الموارد البشرية أو مدير له فريق
      'hr.leave.request': { perm: any, fn: Hr.leaveRequest },
      'hr.leave.cancel': { perm: any, fn: Hr.leaveCancel },
      'hr.leave.decide': { perm: any, fn: Hr.leaveDecide },
      'hr.ot.request': { perm: any, fn: Hr.otRequest },
      'hr.ot.cancel': { perm: any, fn: Hr.otCancel },
      'hr.ot.add': { perm: any, fn: Hr.otAdd },
      'hr.ot.decide': { perm: any, fn: Hr.otDecide },
      'hr.team': { perm: any, fn: Hr.team },
      'hr.directory': { perm: hr, fn: Hr.directory },
      'hr.structure': { perm: hr, fn: Hr.structure },
      'hr.employee.save': { perm: hr, fn: Hr.employeeSave },
      'hr.employee.account': { perm: 'super', fn: Hr.employeeAccount },
      'hr.dept.save': { perm: hr, fn: Hr.deptSave },
      'hr.branch.save': { perm: hr, fn: Hr.branchSave },
      'hr.shift.save': { perm: hr, fn: Hr.shiftSave },
      'hr.holiday.save': { perm: hr, fn: Hr.holidaySave },
      'hr.holiday.delete': { perm: hr, fn: Hr.holidayDelete },
      'hr.leaveType.save': { perm: hr, fn: Hr.leaveTypeSave },
      'hr.leave.list': { perm: hr, fn: Hr.leaveList },
      'hr.leave.create': { perm: hr, fn: Hr.leaveCreate },
      'hr.leave.adminCancel': { perm: hr, fn: Hr.leaveAdminCancel },
      'hr.leave.remove': { perm: 'super', fn: Hr.leaveRemove },
      'hr.leave.balances': { perm: hr, fn: Hr.leaveBalances },
      'hr.leave.adjust': { perm: hr, fn: Hr.leaveAdjust },
      'hr.ot.list': { perm: hr, fn: Hr.otList }
    };
  }
};

function SCHEMA_HAS_(dbKey, table, col) {
  return schemaOf_(dbKey)[table].some(function (c) { return c[0] === col; });
}
