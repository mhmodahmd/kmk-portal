/**
 * نقل البيانات من نظام الحضور السابق (مدير النظام فقط).
 *
 * - المصدر يُرسل جداولَ كما هي في ملف النظام السابق: Users, Employees, Departments, Branches, Shifts, Holidays,
 *   LeaveTypes, LeaveBalances, LeaveRequests, OvertimeRequests, Attendance. لا يُمس النظام السابق.
 * - آمن للتكرار: المعرّفات القديمة تُحفظ كما هي. الهيكل والحسابات تُضاف مرة واحدة ثم تُدار من البوابة،
 *   والتسجيلات (الحضور والإجازات والإضافي) تُحدَّث من المصدر في كل تشغيل خلال فترة التشغيل المتوازي.
 * - كلمات المرور تُنقل كما هي وتُعاد بطريقة البوابة عند أول دخول (Auth.checkPassword_).
 * - dryRun: تقرير بما سيحدث دون كتابة.
 * - كاستثناء موثّق: تكتب في ملفات النواة والموارد البشرية والحضور معاً.
 */
var Migration = {
  iso_: function (v) {
    if (v === '' || v == null) return '';
    var s = String(v).trim();
    if (/^\d{10,}$/.test(s)) return new Date(Number(s)).toISOString();
    var d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  },

  date_: function (v) { var s = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; },
  on_: function (v) { return String(v) === '1' || String(v).toLowerCase() === 'true'; },
  num_: function (v) { var n = Number(v); return isNaN(n) ? 0 : n; },

  same_: function (cur, next) {
    return Object.keys(next).every(function (k) {
      if (k === 'createdAt') return true;
      var a = cur[k], b = next[k];
      return String(a == null ? '' : a) === String(b == null ? '' : b);
    });
  },

  legacyAttendance: function (ctx, p) {
    p = p || {};
    var src = p.source || {};
    var dry = !!p.dryRun;
    var userMap = p.userMap || {};
    var rows = function (name) { return Array.isArray(src[name]) ? src[name].filter(function (r) { return r && r.id; }) : []; };
    var rep = { dryRun: dry, created: {}, updated: {}, unchanged: {}, warnings: [] };
    var tick = function (kind, table) { rep[kind][table] = (rep[kind][table] || 0) + 1; };
    var now = nowIso();
    var by = 'نقل من النظام السابق';

    /** يضيف الجديد، ويحدّث المتغير إن سُمح، ويترك الباقي */
    var upsert = function (dbKey, table, list, allowUpdate) {
      var have = indexBy_(Db.view(dbKey, table));
      var fresh = [];
      list.forEach(function (r) {
        var cur = have[r.id];
        if (!cur) { fresh.push(r); tick('created', table); }
        else if (allowUpdate && !Migration.same_(cur, r)) { if (!dry) Db.update(dbKey, table, r.id, r); tick('updated', table); }
        else tick('unchanged', table);
      });
      if (!dry && fresh.length) Db.insertMany(dbKey, table, fresh);
    };

    // ───── المستخدمون ─────
    var lUsers = indexBy_(rows('Users'));
    var lEmps = rows('Employees');
    var empIds = {};
    lEmps.forEach(function (e) { empIds[e.id] = true; });
    // موظفون بلا سجل موارد بشرية في النظام السابق (لهم حساب موظف أو مدير)
    rows('Users').forEach(function (u) {
      if (!empIds[u.id] && (u.role === 'employee' || u.role === 'admin') && Migration.on_(u.active)) { lEmps.push({ id: u.id }); empIds[u.id] = true; }
    });

    var newUsers = indexBy_(Db.view('core', 'Users'));
    var byName = {};
    Db.view('core', 'Users').forEach(function (u) { byName[u.username] = u; });
    var userIdOf = {};      // معرّف المستخدم القديم ← معرّف المستخدم في البوابة
    var toCreate = [];
    rows('Users').forEach(function (u) {
      var mapped = userMap[u.id];
      if (mapped) {
        if (!newUsers[mapped]) { rep.warnings.push('المستخدم المحدد لـ ' + u.name + ' غير موجود في البوابة.'); return; }
        userIdOf[u.id] = mapped; tick('unchanged', 'Users');
        return;
      }
      if (newUsers[u.id]) { userIdOf[u.id] = u.id; tick('unchanged', 'Users'); return; }
      var username = String(u.username || '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,32}$/.test(username)) { rep.warnings.push('لم يُنقل حساب ' + u.name + ': اسم المستخدم «' + u.username + '» غير صالح في البوابة.'); return; }
      if (byName[username]) { rep.warnings.push('لم يُنقل حساب ' + u.name + ': اسم المستخدم «' + username + '» مستخدم في البوابة.'); return; }
      userIdOf[u.id] = u.id;
      toCreate.push(u);
    });
    toCreate.forEach(function (u) {
      tick('created', 'Users');
      if (dry) return;
      Db.insert('core', 'Users', {
        id: u.id, username: String(u.username).trim().toLowerCase(), fullName: String(u.name || u.username).trim(), jobTitle: u.jobTitle || '',
        phone: '', email: '', active: Migration.on_(u.active), isSuperAdmin: u.role === 'admin', mustChangePassword: false,
        passwordHash: 'legacy:' + u.passHash, salt: u.salt, failedAttempts: 0, lockedUntil: '', lastLogin: '',
        employeeId: empIds[u.id] ? u.id : '', createdAt: Migration.iso_(u.createdAt) || now, createdBy: by, updatedAt: now
      });
      var roles = u.role === 'viewer' ? { attendance: 'viewer' } : u.role === 'admin' ? { attendance: 'hr', hr: 'hr' } : { attendance: 'employee', hr: 'employee' };
      Permissions.setRoles(ctx.user, u.id, roles);
    });

    // ───── الهيكل ─────
    upsert('core', 'Departments', rows('Departments').map(function (d) {
      return { id: d.id, name: String(d.name || '').trim(), managerId: empIds[d.managerId] ? d.managerId : '', active: Migration.on_(d.active), createdAt: now };
    }), false);
    upsert('core', 'Branches', rows('Branches').map(function (b) {
      return { id: b.id, name: String(b.name || '').trim(), address: b.address || '', lat: b.lat || '', lng: b.lng || '', geoRadius: Migration.num_(b.radius || b.geoRadius), active: Migration.on_(b.active), createdAt: now };
    }), false);
    upsert('hr', 'Shifts', rows('Shifts').map(function (s) {
      return { id: s.id, name: s.name, start: s.start, end: s.end, graceMin: Migration.num_(s.graceMin), workDays: String(s.workDays || ''), active: Migration.on_(s.active), createdAt: now };
    }), false);
    upsert('hr', 'Holidays', rows('Holidays').map(function (h) {
      return { id: h.id, date: Migration.date_(h.date), dateTo: Migration.date_(h.dateTo), name: h.name, createdAt: now };
    }), false);
    upsert('hr', 'LeaveTypes', rows('LeaveTypes').map(function (t, i) {
      return { id: t.id, name: t.name, annualDays: Migration.num_(t.annualDays), paid: Migration.on_(t.paid), active: Migration.on_(t.active), sortOrder: i + 1 };
    }), false);

    // ───── الموظفون ─────
    var taken = {};
    Staff.all_().forEach(function (e) { if (!empIds[e.id]) taken[e.empNo] = true; });
    var nextNo = Number(Staff.nextEmpNo_());
    var legacyNos = {};
    lEmps.forEach(function (e) { if (e.empNo) legacyNos[String(e.empNo).trim()] = true; });
    var F = ['departmentId', 'branchId', 'shiftId', 'nationality', 'phone', 'email', 'civilId', 'residencyNo', 'passportNo', 'contractType', 'address', 'emergencyName', 'emergencyPhone', 'notes'];
    var D = ['hireDate', 'birthDate', 'civilIdExpiry', 'residencyExpiry', 'passportExpiry', 'contractEnd'];
    upsert('core', 'Employees', lEmps.map(function (e) {
      var u = lUsers[e.id] || {};
      var no = String(e.empNo || '').trim();
      if (!no || taken[no]) { while (taken[String(nextNo)] || legacyNos[String(nextNo)]) nextNo++; no = String(nextNo++); }
      taken[no] = true;
      var rec = {
        id: e.id, empNo: no, fullName: String(u.name || e.fullName || '').trim() || 'موظف', userId: userIdOf[e.id] || '',
        managerId: empIds[e.managerId] && e.managerId !== e.id ? e.managerId : '', jobTitle: u.jobTitle || '',
        status: u.id && !Migration.on_(u.active) ? 'terminated' : 'active', createdAt: Migration.iso_(u.createdAt) || now, createdBy: by,
        updatedAt: Migration.iso_(e.updatedAt) || now
      };
      F.forEach(function (k) { rec[k] = String(e[k] == null ? '' : e[k]).trim(); });
      D.forEach(function (k) { rec[k] = Migration.date_(e[k]); });
      return rec;
    }), false);
    // ربط حسابات البوابة المحددة بموظفيها (مثل مدير النظام)
    Object.keys(userMap).forEach(function (oldId) {
      var uid = userMap[oldId];
      if (!empIds[oldId] || !newUsers[uid]) return;
      var linkedEmp = Staff.byUser_(uid);
      if (linkedEmp && linkedEmp.id !== oldId) { rep.warnings.push('حساب البوابة مرتبط بموظف آخر، لم يُربط.'); return; }
      if (!dry && (!linkedEmp || newUsers[uid].employeeId !== oldId)) {
        Db.update('core', 'Users', uid, { employeeId: oldId });
        Db.update('core', 'Employees', oldId, { userId: uid });
      }
    });

    // ───── التسجيلات ─────
    var att = [];
    rows('Attendance').forEach(function (r) {
      if (!empIds[r.userId]) { rep.warnings.push('تسجيل حضور ' + r.id + ' لمستخدم ليس موظفاً، لم يُنقل.'); return; }
      var inTs = Migration.iso_(r.inTs);
      if (!inTs) { rep.warnings.push('تسجيل حضور ' + r.id + ' بلا وقت حضور، لم يُنقل.'); return; }
      att.push({
        id: r.id, employeeId: r.userId, date: Migration.date_(r.date) || localDate_(new Date(inTs).getTime()), inTs: inTs, outTs: Migration.iso_(r.outTs),
        inLat: String(r.inLat || ''), inLng: String(r.inLng || ''), inAcc: 0, outLat: String(r.outLat || ''), outLng: String(r.outLng || ''), outAcc: 0,
        source: r.editedBy ? 'manual' : 'app', note: r.note || '', editedBy: r.editedBy || '',
        createdAt: inTs, updatedAt: Migration.iso_(r.updatedAt) || inTs
      });
    });
    upsert('attendance', 'Attendance', att, true);

    upsert('hr', 'LeaveRequests', rows('LeaveRequests').filter(function (r) { return empIds[r.userId]; }).map(function (r) {
      return {
        id: r.id, employeeId: r.userId, typeId: r.typeId, from: Migration.date_(r.from), to: Migration.date_(r.to), days: Migration.num_(r.days),
        reason: r.reason || '', status: r.status, managerId: r.managerId || '', managerAt: Migration.iso_(r.managerAt), managerNote: r.managerNote || '',
        decidedBy: r.decidedBy || '', decidedAt: Migration.iso_(r.decidedAt), decisionNote: r.decisionNote || '', createdAt: Migration.iso_(r.createdAt) || now, createdBy: by
      };
    }), true);
    upsert('hr', 'LeaveBalances', rows('LeaveBalances').filter(function (r) { return empIds[r.userId]; }).map(function (r) {
      return { id: r.id, employeeId: r.userId, typeId: r.typeId, year: String(r.year), adjustment: Migration.num_(r.adjustment), note: r.note || '', updatedAt: Migration.iso_(r.updatedAt) || now, updatedBy: by };
    }), true);
    upsert('hr', 'OvertimeRequests', rows('OvertimeRequests').filter(function (r) { return empIds[r.userId]; }).map(function (r) {
      return {
        id: r.id, employeeId: r.userId, date: Migration.date_(r.date), minutes: Migration.num_(r.minutes), reason: r.reason || '', status: r.status,
        createdBy: r.createdBy || '', createdByName: r.createdByName || '', decidedBy: r.decidedBy || '', decidedAt: Migration.iso_(r.decidedAt),
        decisionNote: r.decisionNote || '', createdAt: Migration.iso_(r.createdAt) || now
      };
    }), true);

    var names = {};
    Object.keys(lUsers).forEach(function (id) { names[id] = lUsers[id].name; });
    rep.reconcile = Migration.reconcile_(att, dry, names);
    if (!dry) Audit.log(ctx.user, 'system', 'migration.legacyAttendance', 'Migration', 'attendance', { created: rep.created, updated: rep.updated, warnings: rep.warnings.length });
    return rep;
  },

  /** مطابقة عدد التسجيلات والدقائق لكل موظف وشهر بين المصدر والبوابة */
  reconcile_: function (src, dry, names) {
    var mins = function (r) { return r.outTs ? Math.round((new Date(r.outTs) - new Date(r.inTs)) / 60000) : 0; };
    var key = function (r) { return r.employeeId + '|' + r.date.slice(0, 7); };
    var acc = {};
    var add = function (r, side) {
      var k = key(r);
      var a = acc[k] = acc[k] || { employeeId: r.employeeId, month: r.date.slice(0, 7), sourceCount: 0, sourceMinutes: 0, portalCount: 0, portalMinutes: 0 };
      a[side + 'Count']++; a[side + 'Minutes'] += mins(r);
    };
    var ids = {};
    src.forEach(function (r) { ids[r.id] = true; add(r, 'source'); });
    (dry ? src : Db.view('attendance', 'Attendance').filter(function (r) { return ids[r.id]; })).forEach(function (r) { add(r, 'portal'); });
    var list = Object.keys(acc).map(function (k) {
      var a = acc[k];
      a.name = (names || {})[a.employeeId] || a.employeeId;
      a.ok = a.sourceCount === a.portalCount && a.sourceMinutes === a.portalMinutes;
      return a;
    }).sort(function (x, y) { return x.name === y.name ? (x.month < y.month ? -1 : 1) : x.name.localeCompare(y.name, 'ar'); });
    return { rows: list, ok: list.every(function (a) { return a.ok; }), records: src.length };
  }
};
