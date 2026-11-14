/**
 * الموظف الموحد والهيكل (الأقسام والفروع) في النواة.
 * تستخدمه كل الوحدات للوصول إلى الموظف ومديره المباشر وفريقه.
 * التعديل يتم عبر مسارات الموارد البشرية (Hr) فقط.
 */
var EMP_STATUS = { active: 'على رأس العمل', leave: 'إجازة طويلة', terminated: 'انتهت خدمته' };
var EMP_DOCS = [
  ['civilIdExpiry', 'البطاقة المدنية'], ['residencyExpiry', 'الإقامة'],
  ['passportExpiry', 'جواز السفر'], ['contractEnd', 'العقد']
];
var EMP_SENSITIVE = ['civilId', 'civilIdExpiry', 'residencyNo', 'residencyExpiry', 'passportNo', 'passportExpiry',
  'birthDate', 'nationality', 'address', 'emergencyName', 'emergencyPhone', 'notes', 'contractType', 'contractEnd'];
var DOC_ALERT_DAYS = 60;

var Staff = {
  all_: function () { return Db.view('core', 'Employees'); },
  current_: function () { return Staff.all_().filter(function (e) { return e.status !== 'terminated'; }); },
  get_: function (id) { return Db.get('core', 'Employees', id); },
  getOrThrow_: function (id) { return Db.getOrThrow('core', 'Employees', id, 'الموظف'); },

  byUser_: function (userId) {
    if (!userId) return null;
    var list = Staff.all_();
    for (var i = 0; i < list.length; i++) if (list[i].userId === userId) return list[i];
    return null;
  },

  /** موظف المستخدم الحالي (أو null إن لم يكن حسابه مرتبطاً بملف موظف) */
  ofCtx_: function (ctx) {
    if (ctx.employee === undefined) ctx.employee = Staff.byUser_(ctx.user.id);
    return ctx.employee;
  },

  requireOfCtx_: function (ctx) {
    var e = Staff.ofCtx_(ctx);
    if (!e) throw appError('حسابك غير مرتبط بملف موظف. تواصل مع الموارد البشرية.', 'NO_EMPLOYEE');
    if (e.status === 'terminated') throw appError('ملفك الوظيفي منتهٍ.', 'NO_EMPLOYEE');
    return e;
  },

  depts_: function () { return Db.view('core', 'Departments'); },
  branches_: function () { return Db.view('core', 'Branches'); },

  /** المدير المباشر: المحدد في ملف الموظف، وإلا مدير القسم (إن لم يكن هو نفسه) */
  managerIdOf_: function (e, deptsById) {
    if (!e) return '';
    if (e.managerId && e.managerId !== e.id) return e.managerId;
    var d = e.departmentId && (deptsById || indexBy_(Staff.depts_()))[e.departmentId];
    return d && d.active !== false && d.managerId && d.managerId !== e.id ? d.managerId : '';
  },

  /** كل من تحت المدير مباشرة أو بشكل غير مباشر (بلا المدير نفسه) */
  teamIds_: function (managerEmpId) {
    if (!managerEmpId) return [];
    var depts = indexBy_(Staff.depts_());
    var emps = Staff.current_();
    var byMgr = {};
    emps.forEach(function (e) {
      var m = Staff.managerIdOf_(e, depts);
      if (m) (byMgr[m] = byMgr[m] || []).push(e.id);
    });
    var out = [], seen = {}, queue = [managerEmpId];
    seen[managerEmpId] = true;
    while (queue.length) {
      var cur = queue.shift();
      (byMgr[cur] || []).forEach(function (id) {
        if (!seen[id]) { seen[id] = true; out.push(id); queue.push(id); }
      });
    }
    return out;
  },

  /** هل الموظف managerEmpId مدير (مباشر أو أعلى) للموظف empId؟ */
  manages_: function (managerEmpId, empId) {
    return !!managerEmpId && Staff.teamIds_(managerEmpId).indexOf(empId) >= 0;
  },

  /** نطاق المستخدم: all لمن يملك الأدوار المحددة، وإلا فريقه إن كان مديراً */
  scope_: function (ctx, module, allRoles) {
    if (Permissions.has(ctx, module, allRoles)) return { all: true, ids: null };
    var me = Staff.ofCtx_(ctx);
    var ids = me ? Staff.teamIds_(me.id) : [];
    return { all: false, ids: ids };
  },

  inScope_: function (scope, empId) { return scope.all || scope.ids.indexOf(empId) >= 0; },

  maps_: function () {
    return {
      emps: indexBy_(Staff.all_()),
      depts: indexBy_(Staff.depts_()),
      branches: indexBy_(Staff.branches_()),
      users: indexBy_(Db.view('core', 'Users'))
    };
  },

  name_: function (maps, empId) { var e = maps.emps[empId]; return e ? e.fullName : ''; },

  /** عرض الموظف. sensitive=false يخفي البيانات الشخصية. */
  view_: function (e, maps, opts) {
    opts = opts || {};
    var mid = Staff.managerIdOf_(e, maps.depts);
    var user = e.userId ? maps.users[e.userId] : null;
    var v = {
      id: e.id, empNo: e.empNo, fullName: e.fullName, jobTitle: e.jobTitle, status: e.status || 'active',
      statusLabel: EMP_STATUS[e.status || 'active'] || '', phone: e.phone, email: e.email, hireDate: e.hireDate,
      departmentId: e.departmentId, departmentName: (maps.depts[e.departmentId] || {}).name || '',
      branchId: e.branchId, branchName: (maps.branches[e.branchId] || {}).name || '',
      managerId: e.managerId, effectiveManagerId: mid, managerName: Staff.name_(maps, mid),
      shiftId: e.shiftId, shiftName: opts.shifts && opts.shifts[e.shiftId] ? opts.shifts[e.shiftId].name : '',
      userId: e.userId, username: user ? user.username : '', userActive: user ? user.active : false
    };
    if (opts.sensitive) EMP_SENSITIVE.forEach(function (f) { v[f] = e[f]; });
    return v;
  },

  /** المستندات التي تنتهي خلال days يوماً (أو انتهت) */
  expiring_: function (days) {
    var today = localDate_(), out = [];
    Staff.current_().forEach(function (e) {
      EMP_DOCS.forEach(function (d) {
        if (!e[d[0]] || !isDate_(e[d[0]])) return;
        var left = daysBetween_(today, e[d[0]]);
        if (left <= (days || DOC_ALERT_DAYS)) out.push({ employeeId: e.id, name: e.fullName, doc: d[1], field: d[0], date: e[d[0]], daysLeft: left });
      });
    });
    return out.sort(function (a, b) { return a.daysLeft - b.daysLeft; });
  },

  nextEmpNo_: function () {
    var max = Staff.all_().map(function (e) { return parseInt(e.empNo, 10); })
      .filter(function (n) { return !isNaN(n); })
      .reduce(function (a, b) { return Math.max(a, b); }, 1000);
    return String(max + 1);
  }
};
