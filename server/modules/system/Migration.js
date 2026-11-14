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

  date_: function (v) {
    var s = String(v || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return localDate_(Date.parse(s));
    return '';
  },

  /**
   * يقرأ ملف Sheets للنظام السابق (نسخة مشاركة للقراءة) إلى جداول: { اسم الورقة: [صفوف] }.
   * استثناء موثّق من قاعدة Db: قراءة فقط لملف خارج البوابة أثناء النقل.
   */
  readSheet_: function (id) {
    var ss;
    try { ss = SpreadsheetApp.openById(String(id)); } catch (e) { throw appError('تعذّر فتح ملف النظام السابق. تأكد من مشاركته مع حساب البوابة.'); }
    var out = {};
    ss.getSheets().forEach(function (sh) {
      var vals = sh.getDataRange().getValues();
      var head = (vals.shift() || []).map(String);
      out[sh.getName()] = vals.filter(function (r) { return r.some(function (x) { return x !== '' && x != null; }); }).map(function (r) {
        var o = {};
        head.forEach(function (h, i) {
          if (!h) return;
          var v = r[i];
          o[h] = v instanceof Date ? v.toISOString() : v === true ? 'TRUE' : v === false ? 'FALSE' : v == null ? '' : String(v);
        });
        return o;
      });
    });
    return out;
  },
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

  /**
   * نقل نظام العهد والنثريات السابق. p: { source, userMap, empMap, dryRun }
   * userMap: مستخدم قديم ← مستخدم البوابة · empMap: مستخدم قديم ← موظف في الدليل.
   * من لا يُطابَق يُنشأ له حساب (بكلمة مرور النظام السابق) وملف موظف إن كان صاحب عهدة.
   * الهيكل والحسابات تُضاف مرة واحدة، والعهد والحركات والسندات تُحدَّث من المصدر في كل تشغيل.
   */
  legacyCustody: function (ctx, p) {
    p = p || {};
    var src = p.sheetId ? Migration.readSheet_(p.sheetId) : (p.source || {}), dry = !!p.dryRun, userMap = p.userMap || {}, empMap = p.empMap || {};
    var rows = function (name) { return Array.isArray(src[name]) ? src[name].filter(function (r) { return r && r.id; }) : []; };
    var rep = { dryRun: dry, created: {}, updated: {}, unchanged: {}, warnings: [] };
    var tick = function (kind, table) { rep[kind][table] = (rep[kind][table] || 0) + 1; };
    var now = nowIso(), by = 'نقل من النظام السابق';
    var F = function (v) { return Math.round(Number(String(v == null ? '' : v).replace(/[,٬]/g, '').replace('٫', '.')) * 1000) || 0; };
    var B = function (v) { return String(v).toUpperCase() === 'TRUE' || String(v) === '1' || v === true; };
    var upsert = function (dbKey, table, list, allowUpdate) {
      var have = indexBy_(Db.view(dbKey, table)), fresh = [];
      list.forEach(function (r) {
        var cur = have[r.id];
        if (!cur) { fresh.push(r); tick('created', table); }
        else if (allowUpdate && !Migration.same_(cur, r)) { if (!dry) Db.update(dbKey, table, r.id, r); tick('updated', table); }
        else tick('unchanged', table);
      });
      if (!dry && fresh.length) Db.insertMany(dbKey, table, fresh);
    };

    // ───── المستخدمون والموظفون ─────
    var newUsers = indexBy_(Db.view('core', 'Users')), byName = {};
    Db.view('core', 'Users').forEach(function (u) { byName[u.username] = u; });
    var emps = indexBy_(Staff.all_());
    var userOf = {}, empOf = {};
    var ROLE = { employee: 'holder', accountant: 'accountant' };
    rows('Users').forEach(function (u) {
      var uid = userMap[u.id], eid = empMap[u.id];
      if (uid && !newUsers[uid]) { rep.warnings.push('المستخدم المحدد لـ ' + u.fullName + ' غير موجود في البوابة.'); uid = ''; }
      if (eid && !emps[eid]) { rep.warnings.push('الموظف المحدد لـ ' + u.fullName + ' غير موجود في الدليل.'); eid = ''; }
      if (!uid && newUsers[u.id]) uid = u.id;
      if (!uid) {
        var username = String(u.username || '').trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,32}$/.test(username) || byName[username]) {
          rep.warnings.push('لم يُنقل حساب ' + u.fullName + ': اسم المستخدم «' + u.username + '» ' + (byName[username] ? 'مستخدم في البوابة.' : 'غير صالح في البوابة.'));
        } else {
          uid = u.id;
          tick('created', 'Users');
          if (!dry) {
            Db.insert('core', 'Users', {
              id: u.id, username: username, fullName: String(u.fullName || username).trim(), jobTitle: '', phone: '', email: '',
              active: B(u.active), isSuperAdmin: u.role === 'admin', mustChangePassword: false, passwordHash: 'lc:' + u.passwordHash, salt: u.salt,
              failedAttempts: 0, lockedUntil: '', lastLogin: '', employeeId: '', createdAt: Migration.iso_(u.createdAt) || now, createdBy: by, updatedAt: now
            });
          }
        }
      } else tick('unchanged', 'Users');
      if (uid) userOf[u.id] = uid;
      // صاحب العهدة يحتاج ملف موظف: المحدد، أو المرتبط بحسابه، أو يُنشأ
      if (u.role === 'employee' || eid) {
        if (!eid && uid && !dry) { var linked = Staff.byUser_(uid); if (linked) eid = linked.id; }
        if (!eid) {
          eid = u.id;
          if (!emps[eid]) {
            tick('created', 'Employees');
            if (!dry) {
              Db.insert('core', 'Employees', {
                id: eid, empNo: Staff.nextEmpNo_(), fullName: String(u.fullName || '').trim(), userId: uid || '', status: B(u.active) ? 'active' : 'terminated',
                createdAt: Migration.iso_(u.createdAt) || now, createdBy: by, updatedAt: now
              });
              if (uid) Db.update('core', 'Users', uid, { employeeId: eid });
            }
          }
        }
        empOf[u.id] = eid;
      }
      // دور العهد يُضاف إلى أدوار الحساب الحالية دون تغيير غيرها
      if (uid && ROLE[u.role] && !(newUsers[uid] && newUsers[uid].isSuperAdmin)) {
        var roles = dry ? {} : Permissions.rolesOf(uid);
        if (roles.custody !== ROLE[u.role] && roles.custody !== 'accountant') {
          roles.custody = ROLE[u.role];
          tick('updated', 'UserRoles');
          if (!dry) Permissions.setRoles(ctx.user, uid, roles);
        }
      }
    });
    var U = function (id) { return id === 'import' || id === 'manager' ? id : (userOf[id] || ''); };

    // ───── القوائم المرجعية (بالاسم: لا تتكرر) ─────
    ['Categories', 'DocTypes', 'Projects'].forEach(function (t) {
      var names = {};
      Db.view('custody', t).forEach(function (r) { names[r.name] = r.id; });
      upsert('custody', t, rows(t).filter(function (r) { return !names[r.name] || names[r.name] === r.id; }).map(function (r) {
        var o = { id: r.id, name: String(r.name).trim(), active: B(r.active), sortOrder: Number(r.sortOrder) || 0 };
        if (t === 'Projects') o.type = r.type || 'project';
        return o;
      }), false);
    });

    // ───── العهد والحركات والسندات ─────
    var custodies = rows('Custodies').map(function (c) {
      return {
        id: c.id, periodLabel: c.periodLabel, employeeId: empOf[c.employeeId] || '', amount: F(c.amount), carriedBalance: F(c.carriedBalance),
        openDate: Migration.date_(c.openDate), status: c.status, closeRequestDate: Migration.iso_(c.closeRequestDate), closeNote: c.closeNote || '',
        reviewedBy: U(c.reviewedBy), reviewDate: Migration.iso_(c.reviewDate), rejectReason: c.rejectReason || '',
        totalReceipts: F(c.totalReceipts), totalSpent: F(c.totalSpent), remaining: F(c.remaining), settlementMethod: c.settlementMethod || '',
        settlementVoucherId: c.settlementVoucherId || '', driveFolderId: c.driveFolderId || '', notes: c.notes || '',
        previousCustodyId: c.previousCustodyId || '', isImported: B(c.isImported), createdBy: U(c.createdBy), createdAt: Migration.iso_(c.createdAt) || now,
        disburseStage: c.disburseStage || '', openVoucherId: c.openVoucherId || '', carryMode: c.carryMode || '', receivedAt: Migration.iso_(c.receivedAt),
        closeSignedFileId: c.closeSignedFileId || '', closeSignedAt: Migration.iso_(c.closeSignedAt), closeSignedBy: U(c.closeSignedBy), closeMgrSignId: c.closeMgrSignId || ''
      };
    });
    custodies.filter(function (c) { return !c.employeeId; }).forEach(function (c) { rep.warnings.push('العهدة ' + c.id + ' لصاحب غير موجود، لم تُنقل.'); });
    custodies = custodies.filter(function (c) { return c.employeeId; });
    var cids = indexBy_(custodies);
    upsert('custody', 'Custodies', custodies, true);
    var exps = rows('Expenses').filter(function (e) { return cids[e.custodyId]; }).map(function (e) {
      var ids = [];
      try { ids = typeof e.attachmentIds === 'string' ? JSON.parse(e.attachmentIds || '[]') : (e.attachmentIds || []); } catch (x) { ids = []; }
      return {
        id: e.id, custodyId: e.custodyId, entryType: e.entryType || 'expense', date: Migration.date_(e.date), category: e.category || '', project: e.project || '',
        description: e.description || '', amount: F(e.amount), docType: e.docType || '', noAttachmentReason: e.noAttachmentReason || '', vendor: e.vendor || '',
        invoiceNo: e.invoiceNo || '', paymentMethod: e.paymentMethod || 'cash', attachmentIds: ids, reviewNote: e.reviewNote || '',
        createdBy: U(e.createdBy), createdAt: Migration.iso_(e.createdAt) || now, updatedAt: Migration.iso_(e.updatedAt) || now
      };
    });
    upsert('custody', 'Expenses', exps, true);
    upsert('custody', 'Attachments', rows('Attachments').filter(function (a) { return cids[a.custodyId]; }).map(function (a) {
      return {
        id: a.id, custodyId: a.custodyId, expenseId: a.expenseId, fileName: a.fileName, driveFileId: a.driveFileId, url: a.url, mimeType: a.mimeType,
        uploadedBy: U(a.uploadedBy), uploadedAt: Migration.iso_(a.uploadedAt), fileSize: Number(String(a.fileSize).replace(/[^\d.]/g, '')) || 0
      };
    }), true);
    var vouchers = rows('Vouchers').map(function (v) {
      return {
        id: v.id, type: v.type, number: v.number || '', date: Migration.date_(v.date), custodyId: cids[v.custodyId] ? v.custodyId : '', partyName: v.partyName,
        amount: F(v.amount), amountInWords: v.amountInWords || '', reason: v.reason || '', paymentMethod: v.paymentMethod || 'cash', chequeNo: v.chequeNo || '',
        pdfFileId: v.pdfFileId || '', createdBy: U(v.createdBy), createdAt: Migration.iso_(v.createdAt) || now, status: v.status || 'active',
        cancelReason: v.cancelReason || '', cancelledBy: U(v.cancelledBy), cancelledAt: Migration.iso_(v.cancelledAt), approvedBy: U(v.approvedBy),
        approvedAt: Migration.iso_(v.approvedAt), signedFileId: v.signedFileId || '', signedAt: Migration.iso_(v.signedAt), signedBy: U(v.signedBy),
        requestedBy: U(v.requestedBy), requestedAt: Migration.iso_(v.requestedAt), rejectReason: v.rejectReason || '', rejectedBy: U(v.rejectedBy),
        rejectedAt: Migration.iso_(v.rejectedAt), mgrSignId: v.mgrSignId || ''
      };
    });
    upsert('custody', 'Vouchers', vouchers, true);
    upsert('custody', 'SignLinks', rows('SignLinks').map(function (l) {
      return {
        id: l.id, kind: l.kind, targetId: l.targetId, tokenHash: l.tokenHash, managerName: l.managerName, createdBy: U(l.createdBy),
        createdAt: Migration.iso_(l.createdAt), expiresAt: Migration.iso_(l.expiresAt), status: l.status, actedAt: Migration.iso_(l.actedAt),
        signatureFileId: l.signatureFileId || '', rejectReason: l.rejectReason || ''
      };
    }), true);
    upsert('custody', 'Requests', rows('Requests').filter(function (r) { return empOf[r.employeeId]; }).map(function (r) {
      return {
        id: r.id, employeeId: empOf[r.employeeId], amount: F(r.amount), reason: r.reason || '', status: r.status, custodyId: cids[r.custodyId] ? r.custodyId : '',
        handledBy: U(r.handledBy), handledAt: Migration.iso_(r.handledAt), rejectReason: r.rejectReason || '', createdAt: Migration.iso_(r.createdAt) || now,
        createdBy: U(r.employeeId)
      };
    }), true);
    upsert('custody', 'Signatures', rows('Signatures').filter(function (x) { return U(x.userId) && /^data:image\//.test(String(x.data)); }).map(function (x) {
      return { id: x.id, userId: U(x.userId), data: x.data, updatedAt: Migration.iso_(x.updatedAt) || now };
    }), false);

    // ───── عدّادات الترقيم والإعدادات ─────
    var serials = {};
    custodies.forEach(function (c) { var m = /^(NTH-\d{4})-(\d+)$/.exec(c.id); if (m) serials[m[1]] = Math.max(serials[m[1]] || 0, Number(m[2])); });
    vouchers.forEach(function (v) { var m = /^((?:PV|RV)-\d{4})-(\d+)$/.exec(v.number); if (m) serials[m[1]] = Math.max(serials[m[1]] || 0, Number(m[2])); });
    rep.serials = serials;
    if (!dry) Object.keys(serials).forEach(function (k) { Db.raiseSerial(k, serials[k]); });
    var st = {};
    rows('Settings').forEach(function (x) { st[x.key] = x.value; });
    (src.Settings || []).forEach(function (x) { st[x.key] = x.value; });
    if (!dry && !Settings.get_('custody', null)) {
      Settings.set_('custody', {
        managerName: st.managerName || '', managerPhone: String(st.managerPhone || '').replace(/[^\d]/g, ''),
        alertPercent: Number(st.alertPercent) || 80, defaultAmount: F(st.defaultCustodyAmount || 100)
      }, ctx.user);
    }

    // ───── المطابقة: لكل عهدة عدد الحركات والمجاميع كما في المصدر ومن الحركات المنقولة ─────
    var portalExps = dry ? exps : Db.view('custody', 'Expenses');
    var portalCus = dry ? cids : indexBy_(Db.view('custody', 'Custodies'));
    rep.reconcile = { rows: custodies.map(function (c) {
      var mine = portalExps.filter(function (e) { return e.custodyId === c.id; });
      var spent = 0, receipts = 0;
      mine.forEach(function (e) { if (e.entryType === 'receipt') receipts += e.amount; else spent += e.amount; });
      var pc = portalCus[c.id] || {};
      var srcCount = rows('Expenses').filter(function (e) { return e.custodyId === c.id; }).length;
      var computed = c.amount + c.carriedBalance + receipts - spent;
      return {
        id: c.id, status: c.status, sourceCount: srcCount, portalCount: mine.length, sourceSpent: c.totalSpent, portalSpent: spent,
        sourceRemaining: c.remaining, portalRemaining: pc.remaining, computedRemaining: computed,
        ok: srcCount === mine.length && c.totalSpent === spent && c.totalReceipts === receipts && c.remaining === computed && pc.remaining === c.remaining
      };
    }) };
    rep.reconcile.ok = rep.reconcile.rows.every(function (r) { return r.ok; });
    if (!dry) Audit.log(ctx.user, 'system', 'migration.legacyCustody', 'Migration', 'custody', { created: rep.created, updated: rep.updated, warnings: rep.warnings.length });
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
