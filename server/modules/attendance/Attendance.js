/**
 * وحدة الحضور والانصراف: البصمة، سجلي الشهري، حضور اليوم، السجل والتعديل، التصحيحات، التقرير.
 * ملف بياناتها: attendance. الورديات والعطل والإجازات تُقرأ من Hr.calendar_().
 * الوقت والموقع يُؤخذان من الخادم ومن جهاز الموظف وقت البصمة، لا يُدخلهما الموظف.
 */
var ATT_SCHEMA = {
  Attendance: [
    ['id', 'text'], ['employeeId', 'text'], ['date', 'date'], ['inTs', 'ts'], ['outTs', 'ts'],
    ['inLat', 'text'], ['inLng', 'text'], ['inAcc', 'num'], ['outLat', 'text'], ['outLng', 'text'], ['outAcc', 'num'],
    ['source', 'text'], ['note', 'text'], ['editedBy', 'text'], ['createdAt', 'ts'], ['updatedAt', 'ts'],
    ['inVerify', 'text'], ['outVerify', 'text']
  ],
  Corrections: [
    ['id', 'text'], ['employeeId', 'text'], ['date', 'date'], ['kind', 'text'], ['attendanceId', 'text'],
    ['inTime', 'text'], ['outTime', 'text'], ['reason', 'text'], ['status', 'text'],
    ['decidedBy', 'text'], ['decidedAt', 'ts'], ['decisionNote', 'text'], ['createdAt', 'ts']
  ]
};

var CORRECTION_KINDS = { missingOut: 'نسيت تسجيل الانصراف', missingIn: 'نسيت تسجيل الحضور', wrongTime: 'وقت مسجّل خطأ' };
var CORRECTION_STATUS = { pending: 'بانتظار الموافقة', approved: 'معتمد', rejected: 'مرفوض', cancelled: 'ملغى' };
var DAY_STATUS = {
  in: 'داخل الدوام', present: 'حاضر', missing: 'لم يسجّل انصراف', holiday: 'عطلة رسمية', leave: 'إجازة',
  weekend: 'عطلة أسبوعية', absent: 'غائب', none: '', future: ''
};

var Attendance = {
  settings_: function () {
    return Object.assign({ geoRequired: false, deviceRequired: false, openMaxHours: 16, startDate: '' }, Settings.get_('attendance', {}));
  },

  /**
   * بداية احتساب الغياب: المحددة في الإعدادات، وإلا تاريخ أول بصمة في النظام.
   * حتى لا تُحتسب أيام ما قبل تشغيل البوابة غياباً.
   */
  startDate_: function () {
    var s = Attendance.settings_().startDate;
    if (s) return s;
    var first = '';
    Db.view('attendance', 'Attendance').forEach(function (r) { if (!first || r.date < first) first = r.date; });
    return first || localDate_();
  },

  /** تقويم الموارد البشرية مع بداية احتساب الحضور */
  cal_: function () {
    var cal = Hr.calendar_();
    cal.attStart = Attendance.startDate_();
    return cal;
  },

  isHr_: function (ctx) { return Permissions.has(ctx, 'attendance', ['hr']); },

  scope_: function (ctx) { return Staff.scope_(ctx, 'attendance', ['viewer', 'hr']); },

  requireScope_: function (ctx) {
    var s = Attendance.scope_(ctx);
    if (!s.all && !s.ids.length) throw appError('هذه الشاشة للمديرين والموارد البشرية.', 'FORBIDDEN');
    return s;
  },

  ms_: function (iso) { return iso ? new Date(iso).getTime() : 0; },

  recordsOf_: function (empId) {
    return Db.view('attendance', 'Attendance').filter(function (r) { return r.employeeId === empId; });
  },

  hasRecordOn_: function (empId, date) {
    return Db.view('attendance', 'Attendance').some(function (r) { return r.employeeId === empId && r.date === date; });
  },

  /** الفترة المفتوحة (حضور بلا انصراف) خلال المدة المسموحة */
  findOpen_: function (recs, now, maxHours) {
    var limit = (maxHours || 16) * 3600000;
    return recs.filter(function (r) { return !r.outTs && now - Attendance.ms_(r.inTs) < limit; })
      .sort(function (a, b) { return a.inTs < b.inTs ? 1 : -1; })[0] || null;
  },

  // ───────── الموقع ─────────
  distance_: function (lat1, lng1, lat2, lng2) {
    var R = 6371000, toR = function (x) { return x * Math.PI / 180; };
    var dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
    var a = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.pow(Math.sin(dLng / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  },

  geoBranches_: function (emp) {
    var all = Staff.branches_().filter(function (b) { return b.active !== false && b.lat && b.lng && b.geoRadius > 0; });
    var own = all.filter(function (b) { return b.id === emp.branchId; });
    return own.length ? own : all;
  },

  checkGeo_: function (emp, p) {
    if (!Attendance.settings_().geoRequired) return;
    var branches = Attendance.geoBranches_(emp);
    if (!branches.length) return;
    var lat = Number(p.lat), lng = Number(p.lng);
    if (!p.lat || !p.lng || isNaN(lat) || isNaN(lng)) {
      throw appError('لا يمكن تسجيل البصمة بدون موقعك. فعّل الموقع (GPS) واسمح للمتصفح باستخدامه ثم حاول مرة أخرى.', 'GEO_REQUIRED');
    }
    var tol = Math.min(Number(p.acc) || 0, 50);
    var best = null;
    branches.forEach(function (b) {
      var d = Attendance.distance_(lat, lng, Number(b.lat), Number(b.lng));
      if (!best || d - b.geoRadius < best.d - best.b.geoRadius) best = { d: d, b: b };
    });
    if (best.d - tol > best.b.geoRadius) {
      throw appError('أنت خارج نطاق ' + best.b.name + ': المسافة ' + Math.round(best.d) + ' متر والمسموح ' + best.b.geoRadius + ' متر.', 'GEO_OUT');
    }
  },

  // ───────── تصنيف اليوم ─────────
  /** نوع اليوم والتأخير والخروج المبكر والإضافي والغياب لموظف في يوم */
  classify_: function (cal, emp, ds, recs, today) {
    var out = { dayType: '', detail: '', late: 0, early: 0, overtime: 0, absent: false };
    var shift = Hr.shiftOf_(cal, emp);
    var hol = Hr.holidayOn_(cal, ds), lv = Hr.leaveOn_(cal, emp.id, ds);
    var wd = Hr.workDays_(shift).indexOf(dowOf_(ds)) >= 0;
    if (hol) { out.dayType = 'holiday'; out.detail = hol.name; }
    else if (lv) { out.dayType = 'leave'; out.detail = (cal.types[lv.typeId] || {}).name || ''; }
    else if (!wd) out.dayType = 'weekend';
    if (recs.length) {
      if (shift && wd && !hol && !lv) {
        var st = hm2min_(shift.start), en = hm2min_(shift.end);
        if (en <= st) en += 1440;
        var firstIn = Math.min.apply(null, recs.map(function (r) { return minutesFrom_(ds, r.inTs); }));
        if (firstIn - st > shift.graceMin) out.late = firstIn - st;
        var closed = recs.filter(function (r) { return r.outTs; });
        if (closed.length === recs.length) {
          var lastOut = Math.max.apply(null, closed.map(function (r) { return minutesFrom_(ds, r.outTs); }));
          if (lastOut < en) out.early = en - lastOut;
        }
      }
    } else if (shift && !hol && !lv && wd && ds < today && (!emp.hireDate || ds >= emp.hireDate) && ds >= (cal.attStart || '')) {
      out.absent = true;
    }
    out.overtime = Hr.approvedOtMinutes_(cal, emp.id, ds);
    return out;
  },

  sessionView_: function (r) {
    var mins = r.outTs ? Math.round((Attendance.ms_(r.outTs) - Attendance.ms_(r.inTs)) / 60000) : 0;
    return {
      id: r.id, inTs: r.inTs, outTs: r.outTs, minutes: mins, source: r.source, note: r.note, edited: !!r.editedBy,
      inVerified: r.inVerify === 'device', outVerified: r.outVerify === 'device'
    };
  },

  // ───────── بصمة الجهاز (مفاتيح الدخول في Passkeys.js) ─────────
  deviceOf_: function (emp) { return Passkeys.activeOfUser_(emp.userId); },

  deviceChallenge: function (ctx) {
    Staff.requireOfCtx_(ctx);
    return Passkeys.challenge(ctx);
  },

  deviceRegister: function (ctx, p) {
    Staff.requireOfCtx_(ctx);
    return Passkeys.register(ctx, p);
  },

  deviceList: function () {
    var maps = Staff.maps_();
    var active = Passkeys.activeByUser_();
    var rows = Staff.current_().map(function (e) {
      return {
        employeeId: e.id, name: e.fullName, jobTitle: e.jobTitle, departmentName: (maps.depts[e.departmentId] || {}).name || '',
        hasAccount: !!e.userId, device: Passkeys.info_(e.userId ? active[e.userId] : null)
      };
    }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
    return { rows: rows, registered: rows.filter(function (r) { return r.device; }).length, required: !!Attendance.settings_().deviceRequired };
  },

  deviceReset: function (ctx, p) {
    var emp = Staff.getOrThrow_(p && p.employeeId);
    var reason = requireText(p.reason, 'سبب إعادة الضبط', 300);
    var k = Attendance.deviceOf_(emp);
    if (!k) throw appError('لا يوجد جهاز مسجّل لهذا الموظف.');
    Passkeys.revoke_(ctx.user, k, reason);
    Audit.log(ctx.user, 'attendance', 'device.reset', 'Passkey', k.id, { employee: emp.fullName, label: k.label, reason: reason });
    return Attendance.deviceList(ctx);
  },

  /** يتحقق من بصمة الجهاز إن أُرسلت أو كانت مطلوبة. يعيد الجهاز المستخدم أو null */
  checkDevice_: function (ctx, emp, p) {
    var d = Attendance.deviceOf_(emp);
    if (p.assertion) return Passkeys.verify_(ctx, p.assertion);
    if (Attendance.settings_().deviceRequired) {
      if (!d) throw appError('البصمة تتطلب تسجيل جهازك أولاً: اضغط «تفعيل بصمة الجهاز».', 'DEVICE_NOT_REGISTERED');
      throw appError('البصمة تتطلب التحقق بوجهك أو بصمة إصبعك على جهازك المسجّل.', 'DEVICE_REQUIRED');
    }
    return null;
  },

  // ───────── البصمة ─────────
  today: function (ctx) {
    var emp = Staff.requireOfCtx_(ctx);
    var now = Date.now(), today = localDate_(now);
    var cfg = Attendance.settings_();
    var recs = Attendance.recordsOf_(emp.id);
    var open = Attendance.findOpen_(recs, now, cfg.openMaxHours);
    var todays = recs.filter(function (r) { return r.date === today || (open && r.id === open.id); })
      .sort(function (a, b) { return a.inTs < b.inTs ? -1 : 1; });
    var cal = Attendance.cal_();
    var shift = Hr.shiftOf_(cal, emp);
    var info = Attendance.classify_(cal, emp, today, todays, today);
    var closed = todays.filter(function (r) { return r.outTs; })
      .reduce(function (a, r) { return a + (Attendance.ms_(r.outTs) - Attendance.ms_(r.inTs)); }, 0);
    var geo = cfg.geoRequired ? Attendance.geoBranches_(emp) : [];
    return {
      employee: { id: emp.id, name: emp.fullName, empNo: emp.empNo },
      date: today, dayName: DAYS_AR[dowOf_(today)], serverNow: new Date(now).toISOString(),
      isIn: !!open, openSince: open ? open.inTs : '',
      closedMinutes: Math.round(closed / 60000),
      sessions: todays.map(Attendance.sessionView_),
      shift: shift ? { name: shift.name, start: shift.start, end: shift.end, graceMin: shift.graceMin } : null,
      dayType: info.dayType, detail: info.detail, late: info.late,
      device: (function (d) { return { required: !!cfg.deviceRequired, registered: !!d, label: d ? d.label : '', since: d ? d.createdAt : '' }; })(Attendance.deviceOf_(emp)),
      geo: { required: geo.length > 0, branches: geo.map(function (b) { return { name: b.name, lat: Number(b.lat), lng: Number(b.lng), radius: b.geoRadius }; }) },
      pendingCorrections: Db.view('attendance', 'Corrections').filter(function (c) { return c.employeeId === emp.id && c.status === 'pending'; }).length
    };
  },

  punch: function (ctx, p) {
    var emp = Staff.requireOfCtx_(ctx);
    var kind = p && p.kind;
    if (kind !== 'in' && kind !== 'out') throw appError('نوع البصمة غير صحيح.');
    Attendance.checkGeo_(emp, p || {});
    var dev = Attendance.checkDevice_(ctx, emp, p || {});
    var verify = dev ? 'device' : '';
    withLock(function () {
      var now = Date.now();
      var cfg = Attendance.settings_();
      var recs = Attendance.recordsOf_(emp.id);
      var open = Attendance.findOpen_(recs, now, cfg.openMaxHours);
      var last = recs.map(function (r) { return Math.max(Attendance.ms_(r.inTs), Attendance.ms_(r.outTs)); })
        .reduce(function (a, b) { return Math.max(a, b); }, 0);
      if (now - last < 60000) throw appError('سُجّلت بصمتك قبل أقل من دقيقة. انتظر قليلاً.');
      var loc = function (pfx) {
        var o = {};
        o[pfx + 'Lat'] = p.lat ? String(Number(p.lat).toFixed(6)) : '';
        o[pfx + 'Lng'] = p.lng ? String(Number(p.lng).toFixed(6)) : '';
        o[pfx + 'Acc'] = Math.round(Number(p.acc) || 0);
        return o;
      };
      var iso = new Date(now).toISOString();
      if (kind === 'in') {
        if (open) throw appError('أنت مسجّل حضور منذ ' + localHm_(open.inTs) + '. سجّل الانصراف أولاً.', 'ALREADY_IN');
        Db.insert('attendance', 'Attendance', Object.assign({
          employeeId: emp.id, date: localDate_(now), inTs: iso, source: 'app', inVerify: verify, createdAt: iso, updatedAt: iso
        }, loc('in')));
      } else {
        if (!open) throw appError('لا يوجد حضور مفتوح لتسجيل الانصراف.', 'NOT_IN');
        Db.update('attendance', 'Attendance', open.id, Object.assign({ outTs: iso, outVerify: verify, updatedAt: iso }, loc('out')));
      }
      if (dev) Passkeys.touch_(dev.key, dev.signCount);
    });
    return Attendance.today(ctx);
  },

  // ───────── التقرير الشهري ─────────
  monthOf_: function (emp, month, all, cal) {
    var now = Date.now(), today = localDate_(now);
    var maxH = Attendance.settings_().openMaxHours;
    var att = (all || Db.view('attendance', 'Attendance')).filter(function (r) { return r.employeeId === emp.id && r.date.slice(0, 7) === month; });
    cal = cal || Attendance.cal_();
    var shift = Hr.shiftOf_(cal, emp);
    var byDate = {};
    att.forEach(function (r) { (byDate[r.date] = byDate[r.date] || []).push(r); });
    var days = [];
    var s = { daysPresent: 0, totalMinutes: 0, incomplete: 0, lateDays: 0, lateMin: 0, earlyMin: 0, overtimeMin: 0, absentDays: 0, leaveDays: 0, holidays: 0 };
    for (var d = 1, n = daysInMonth_(month); d <= n; d++) {
      var ds = month + '-' + ('0' + d).slice(-2);
      var recs = (byDate[ds] || []).slice().sort(function (a, b) { return a.inTs < b.inTs ? -1 : 1; });
      var mins = 0, lastOut = '', missing = false, openNow = false, edited = false;
      recs.forEach(function (r) {
        if (r.editedBy) edited = true;
        if (r.outTs) { mins += (Attendance.ms_(r.outTs) - Attendance.ms_(r.inTs)) / 60000; if (r.outTs > lastOut) lastOut = r.outTs; }
        else if (now - Attendance.ms_(r.inTs) < maxH * 3600000) openNow = true;
        else missing = true;
      });
      var info = Attendance.classify_(cal, emp, ds, recs, today);
      var status;
      if (recs.length) {
        s.daysPresent++; s.totalMinutes += Math.round(mins);
        status = openNow ? 'in' : missing ? 'missing' : 'present';
        if (missing) s.incomplete++;
      } else if (info.dayType) status = info.dayType;
      else if (info.absent) status = 'absent';
      else status = ds > today ? 'future' : 'none';
      if (info.late) { s.lateDays++; s.lateMin += info.late; }
      s.earlyMin += info.early; s.overtimeMin += info.overtime;
      if (info.absent) s.absentDays++;
      if (info.dayType === 'leave' && Hr.isWorkDay_(cal, emp, ds)) s.leaveDays++;
      if (info.dayType === 'holiday') s.holidays++;
      days.push({
        date: ds, dayName: DAYS_AR[dowOf_(ds)], firstIn: recs.length ? recs[0].inTs : '', lastOut: lastOut,
        sessions: recs.length, minutes: Math.round(mins), status: status, statusLabel: DAY_STATUS[status] || '',
        dayType: info.dayType, detail: info.detail, late: info.late, early: info.early, overtime: info.overtime,
        note: recs.map(function (r) { return r.note; }).filter(String).join(' / '), edited: edited
      });
    }
    return {
      employee: { id: emp.id, name: emp.fullName, empNo: emp.empNo, jobTitle: emp.jobTitle },
      month: month, shiftName: shift ? shift.name : '', hasShift: !!shift, days: days, summary: s
    };
  },

  myMonth: function (ctx, p) {
    var emp = Staff.requireOfCtx_(ctx);
    return Attendance.monthOf_(emp, requireMonth_(p && p.month));
  },

  report: function (ctx, p) {
    var scope = Attendance.requireScope_(ctx);
    var month = requireMonth_(p && p.month);
    var cal = Attendance.cal_(), all = Db.view('attendance', 'Attendance');
    if (p && p.employeeId) {
      if (!Staff.inScope_(scope, p.employeeId)) throw appError('هذا الموظف خارج نطاقك.', 'FORBIDDEN');
      return { single: true, report: Attendance.monthOf_(Staff.getOrThrow_(p.employeeId), month, all, cal) };
    }
    var emps = Staff.current_().filter(function (e) { return Staff.inScope_(scope, e.id); })
      .sort(function (a, b) { return a.fullName.localeCompare(b.fullName, 'ar'); });
    var company = Settings.company_().name;
    return {
      single: false, month: month, company: company,
      rows: emps.map(function (e) {
        var r = Attendance.monthOf_(e, month, all, cal);
        return Object.assign({ employeeId: e.id, name: e.fullName, empNo: e.empNo, jobTitle: e.jobTitle, shiftName: r.shiftName, hasShift: r.hasShift }, r.summary);
      }),
      details: p && p.withDays ? emps.map(function (e) { return Attendance.monthOf_(e, month, all, cal); }) : undefined
    };
  },

  // ───────── حضور اليوم ─────────
  board: function (ctx, p) {
    var scope = Attendance.requireScope_(ctx);
    var now = Date.now(), today = localDate_(now);
    var date = p && p.date ? requireDate_(p.date, 'التاريخ') : today;
    var cfg = Attendance.settings_();
    var cal = Attendance.cal_();
    var maps = Staff.maps_();
    var att = Db.view('attendance', 'Attendance').filter(function (r) { return r.date === date; });
    var counts = { total: 0, in: 0, out: 0, late: 0, absent: 0, leave: 0, off: 0, none: 0 };
    var rows = Staff.current_().filter(function (e) { return Staff.inScope_(scope, e.id); }).map(function (e) {
      var recs = att.filter(function (r) { return r.employeeId === e.id; }).sort(function (a, b) { return a.inTs < b.inTs ? -1 : 1; });
      var open = date === today ? Attendance.findOpen_(recs, now, cfg.openMaxHours) : null;
      var info = Attendance.classify_(cal, e, date, recs, today);
      var shift = Hr.shiftOf_(cal, e);
      var mins = recs.reduce(function (a, r) {
        var end = r.outTs ? Attendance.ms_(r.outTs) : (open && r.id === open.id ? now : 0);
        return a + (end ? (end - Attendance.ms_(r.inTs)) : 0);
      }, 0) / 60000;
      var status;
      if (open) status = 'in';
      else if (recs.length) status = 'out';
      else if (info.dayType === 'leave') status = 'leave';
      else if (info.dayType) status = 'off';
      else if (shift && date >= cal.attStart && (date < today || minutesFrom_(date, now) > hm2min_(shift.start) + shift.graceMin)) status = 'absent';
      else status = 'none';
      counts.total++; counts[status]++;
      if (info.late) counts.late++;
      var lastOut = recs.filter(function (r) { return r.outTs; }).map(function (r) { return r.outTs; }).sort().pop() || '';
      return {
        employeeId: e.id, name: e.fullName, jobTitle: e.jobTitle, departmentName: (maps.depts[e.departmentId] || {}).name || '',
        status: status, late: info.late, detail: info.detail, shiftName: shift ? shift.name : '',
        firstIn: recs.length ? recs[0].inTs : '', lastOut: lastOut, minutes: Math.round(mins), sessions: recs.length,
        inLoc: recs.length && recs[0].inLat ? recs[0].inLat + ',' + recs[0].inLng : ''
      };
    });
    var order = { in: 0, late: 1, out: 2, absent: 3, none: 4, leave: 5, off: 6 };
    rows.sort(function (a, b) { return (order[a.status] - order[b.status]) || a.name.localeCompare(b.name, 'ar'); });
    return { date: date, dayName: DAYS_AR[dowOf_(date)], isToday: date === today, scope: scope.all ? 'all' : 'team', counts: counts, rows: rows };
  },

  // ───────── السجل والتعديل اليدوي ─────────
  records: function (ctx, p) {
    var scope = Attendance.requireScope_(ctx);
    var month = requireMonth_(p && p.month);
    var maps = Staff.maps_();
    var rows = Db.view('attendance', 'Attendance').filter(function (r) {
      return r.date.slice(0, 7) === month && (!p.employeeId || r.employeeId === p.employeeId) && Staff.inScope_(scope, r.employeeId);
    }).sort(function (a, b) { return a.inTs < b.inTs ? 1 : -1; }).map(function (r) {
      return Object.assign(Attendance.sessionView_(r), {
        employeeId: r.employeeId, name: Staff.name_(maps, r.employeeId), date: r.date, dayName: DAYS_AR[dowOf_(r.date)],
        inLoc: r.inLat ? r.inLat + ',' + r.inLng : '', outLoc: r.outLat ? r.outLat + ',' + r.outLng : '', editedBy: r.editedBy
      });
    });
    var people = Staff.current_().filter(function (e) { return Staff.inScope_(scope, e.id); })
      .map(function (e) { return { id: e.id, name: e.fullName }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
    return { month: month, rows: rows, people: people, canEdit: Attendance.isHr_(ctx) };
  },

  /** يحوّل تاريخاً ووقتين إلى لحظتين، والانصراف بعد منتصف الليل يُحسب لليوم التالي */
  span_: function (date, inTime, outTime) {
    var inTs = tsAt_(date, inTime);
    var outTs = 0;
    if (outTime) {
      outTs = tsAt_(date, outTime);
      if (outTs <= inTs) outTs += 86400000;
    }
    if (inTs > Date.now() + 60000 || outTs > Date.now() + 60000) throw appError('لا يمكن تسجيل وقت لم يأتِ بعد.');
    return { inTs: new Date(inTs).toISOString(), outTs: outTs ? new Date(outTs).toISOString() : '' };
  },

  overlaps_: function (empId, span, exceptId) {
    var a1 = Attendance.ms_(span.inTs), a2 = span.outTs ? Attendance.ms_(span.outTs) : a1 + 60000;
    return Attendance.recordsOf_(empId).some(function (r) {
      if (r.id === exceptId) return false;
      var b1 = Attendance.ms_(r.inTs), b2 = r.outTs ? Attendance.ms_(r.outTs) : b1 + 60000;
      return a1 < b2 && b1 < a2;
    });
  },

  recordSave: function (ctx, p) {
    return withLock(function () {
      var emp = Staff.getOrThrow_(p.employeeId);
      var date = requireDate_(p.date, 'التاريخ');
      var inTime = requireTime_(p.inTime, 'وقت الحضور');
      var outTime = p.outTime ? requireTime_(p.outTime, 'وقت الانصراف') : '';
      var note = requireText(p.note, 'سبب التعديل', 300);
      var span = Attendance.span_(date, inTime, outTime);
      if (Attendance.overlaps_(emp.id, span, p.id)) throw appError('الوقت يتداخل مع تسجيل آخر لنفس الموظف.');
      var now = nowIso();
      var rec = { employeeId: emp.id, date: date, inTs: span.inTs, outTs: span.outTs, note: note, editedBy: ctx.user.fullName, updatedAt: now };
      var saved, before = null;
      if (p.id) {
        before = Db.getOrThrow('attendance', 'Attendance', p.id, 'التسجيل');
        saved = Db.update('attendance', 'Attendance', p.id, rec);
      } else {
        saved = Db.insert('attendance', 'Attendance', Object.assign(rec, { source: 'manual', createdAt: now }));
      }
      Audit.log(ctx.user, 'attendance', p.id ? 'record.update' : 'record.create', 'Attendance', saved.id, {
        employee: emp.fullName, date: date, inTime: inTime, outTime: outTime, note: note,
        before: before ? { inTs: before.inTs, outTs: before.outTs } : null
      });
      return Attendance.sessionView_(saved);
    });
  },

  recordDelete: function (ctx, p) {
    var r = Db.getOrThrow('attendance', 'Attendance', p.id, 'التسجيل');
    var note = requireText(p.note, 'سبب الحذف', 300);
    Db.remove('attendance', 'Attendance', r.id);
    Audit.log(ctx.user, 'attendance', 'record.delete', 'Attendance', r.id, { employeeId: r.employeeId, date: r.date, inTs: r.inTs, outTs: r.outTs, note: note });
    return true;
  },

  // ───────── طلبات التصحيح ─────────
  correctionView_: function (c, maps) {
    return {
      id: c.id, employeeId: c.employeeId, name: Staff.name_(maps, c.employeeId), date: c.date, dayName: DAYS_AR[dowOf_(c.date)],
      kind: c.kind, kindLabel: CORRECTION_KINDS[c.kind] || c.kind, inTime: c.inTime, outTime: c.outTime, reason: c.reason,
      status: c.status, statusLabel: CORRECTION_STATUS[c.status] || c.status, decidedBy: c.decidedBy, decidedAt: c.decidedAt,
      decisionNote: c.decisionNote, createdAt: c.createdAt
    };
  },

  correctionRequest: function (ctx, p) {
    var emp = Staff.requireOfCtx_(ctx);
    return withLock(function () {
      var date = requireDate_(p.date, 'التاريخ');
      var today = localDate_();
      if (date > today) throw appError('لا يمكن طلب تصحيح ليوم لم يأتِ بعد.');
      if (daysBetween_(date, today) > 31) throw appError('التصحيح متاح لآخر 31 يوماً فقط. تواصل مع الموارد البشرية.');
      var kind = p.kind;
      if (!CORRECTION_KINDS[kind]) throw appError('اختر نوع التصحيح.');
      var reason = requireText(p.reason, 'السبب', 300);
      var recs = Attendance.recordsOf_(emp.id).filter(function (r) { return r.date === date; })
        .sort(function (a, b) { return a.inTs < b.inTs ? -1 : 1; });
      var rec = { employeeId: emp.id, date: date, kind: kind, reason: reason, status: 'pending', createdAt: nowIso(), inTime: '', outTime: '', attendanceId: '' };
      if (kind === 'missingOut') {
        var openOne = recs.filter(function (r) { return !r.outTs; })[0];
        if (!openOne) throw appError('لا يوجد في هذا اليوم حضور بلا انصراف.');
        rec.attendanceId = openOne.id;
        rec.outTime = requireTime_(p.outTime, 'وقت الانصراف');
        Attendance.span_(date, localHm_(openOne.inTs), rec.outTime);
      } else if (kind === 'missingIn') {
        rec.inTime = requireTime_(p.inTime, 'وقت الحضور');
        rec.outTime = p.outTime ? requireTime_(p.outTime, 'وقت الانصراف') : '';
        var span = Attendance.span_(date, rec.inTime, rec.outTime);
        if (Attendance.overlaps_(emp.id, span, '')) throw appError('الوقت يتداخل مع تسجيل موجود. اختر «وقت مسجّل خطأ».');
      } else {
        var target = p.attendanceId ? recs.filter(function (r) { return r.id === p.attendanceId; })[0] : recs[0];
        if (!target) throw appError('لا يوجد تسجيل في هذا اليوم لتصحيحه.');
        rec.attendanceId = target.id;
        rec.inTime = requireTime_(p.inTime || localHm_(target.inTs), 'وقت الحضور');
        rec.outTime = p.outTime ? requireTime_(p.outTime, 'وقت الانصراف') : (target.outTs ? localHm_(target.outTs) : '');
        Attendance.span_(date, rec.inTime, rec.outTime);
      }
      var dup = Db.view('attendance', 'Corrections').some(function (c) { return c.employeeId === emp.id && c.date === date && c.status === 'pending'; });
      if (dup) throw appError('لديك طلب تصحيح لهذا اليوم بانتظار الموافقة.');
      var saved = Db.insert('attendance', 'Corrections', rec);
      Audit.log(ctx.user, 'attendance', 'correction.request', 'Correction', saved.id, { date: date, kind: kind });
      return Attendance.correctionView_(saved, Staff.maps_());
    });
  },

  correctionMine: function (ctx) {
    var emp = Staff.ofCtx_(ctx);
    if (!emp) return [];
    var maps = Staff.maps_();
    return Db.view('attendance', 'Corrections').filter(function (c) { return c.employeeId === emp.id; })
      .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; }).map(function (c) { return Attendance.correctionView_(c, maps); });
  },

  correctionCancel: function (ctx, p) {
    var c = Db.getOrThrow('attendance', 'Corrections', p.id, 'الطلب');
    var me = Staff.ofCtx_(ctx);
    if (!me || c.employeeId !== me.id) throw appError('ليست لديك صلاحية لهذا الإجراء.', 'FORBIDDEN');
    if (c.status !== 'pending') throw appError('لا يمكن إلغاء الطلب بعد البت فيه.');
    Db.update('attendance', 'Corrections', c.id, { status: 'cancelled', decidedBy: ctx.user.fullName, decidedAt: nowIso(), decisionNote: 'ألغاه الموظف' });
    return true;
  },

  correctionList: function (ctx, p) {
    var scope = Attendance.requireScope_(ctx);
    var maps = Staff.maps_();
    var status = (p && p.status) || 'pending';
    return Db.view('attendance', 'Corrections').filter(function (c) {
      return (status === 'all' || c.status === status) && Staff.inScope_(scope, c.employeeId);
    }).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; }).map(function (c) { return Attendance.correctionView_(c, maps); });
  },

  canDecideCorrection_: function (ctx, empId) {
    if (Attendance.isHr_(ctx)) return true;
    var me = Staff.ofCtx_(ctx);
    return !!me && Staff.manages_(me.id, empId);
  },

  correctionDecide: function (ctx, p) {
    return withLock(function () {
      var c = Db.getOrThrow('attendance', 'Corrections', p.id, 'الطلب');
      if (c.status !== 'pending') throw appError('تم البت في هذا الطلب مسبقاً.');
      var me = Staff.ofCtx_(ctx);
      if (me && me.id === c.employeeId && !ctx.user.isSuperAdmin) throw appError('لا يمكنك البت في طلبك بنفسك.', 'FORBIDDEN');
      if (!Attendance.canDecideCorrection_(ctx, c.employeeId)) throw appError('ليست لديك صلاحية البت في هذا الطلب.', 'FORBIDDEN');
      var approve = bool_(p.approve), note = optionalText(p.note, 300);
      if (!approve && !note) throw appError('اكتب سبب الرفض.');
      var now = nowIso();
      if (approve) {
        var tag = 'تصحيح: ' + c.reason;
        if (c.kind === 'missingIn') {
          var span = Attendance.span_(c.date, c.inTime, c.outTime);
          if (Attendance.overlaps_(c.employeeId, span, '')) throw appError('الوقت يتداخل مع تسجيل موجود الآن.');
          Db.insert('attendance', 'Attendance', { employeeId: c.employeeId, date: c.date, inTs: span.inTs, outTs: span.outTs, source: 'correction', note: tag, editedBy: ctx.user.fullName, createdAt: now, updatedAt: now });
        } else {
          var r = Db.get('attendance', 'Attendance', c.attendanceId);
          if (!r) throw appError('التسجيل الأصلي لم يعد موجوداً. ارفض الطلب واطلب من الموظف طلباً جديداً.');
          var inTime = c.kind === 'missingOut' ? localHm_(r.inTs) : c.inTime;
          var span2 = Attendance.span_(r.date, inTime, c.outTime);
          if (Attendance.overlaps_(c.employeeId, span2, r.id)) throw appError('الوقت يتداخل مع تسجيل آخر.');
          Db.update('attendance', 'Attendance', r.id, { inTs: span2.inTs, outTs: span2.outTs, note: tag, editedBy: ctx.user.fullName, updatedAt: now });
        }
      }
      var next = Db.update('attendance', 'Corrections', c.id, { status: approve ? 'approved' : 'rejected', decidedBy: ctx.user.fullName, decidedAt: now, decisionNote: note });
      Audit.log(ctx.user, 'attendance', 'correction.' + (approve ? 'approve' : 'reject'), 'Correction', c.id, { date: c.date, kind: c.kind, note: note });
      return next;
    });
  },

  // ───────── الإعدادات ─────────
  settingsGet: function () {
    return {
      settings: Attendance.settings_(),
      branches: Staff.branches_().map(function (b) { return { id: b.id, name: b.name, lat: b.lat, lng: b.lng, geoRadius: b.geoRadius, active: b.active }; })
    };
  },

  settingsSave: function (ctx, p) {
    var next = {
      geoRequired: bool_(p.geoRequired),
      deviceRequired: bool_(p.deviceRequired),
      openMaxHours: intIn_(p.openMaxHours || 16, 4, 24, 'مدة الحضور المفتوح بالساعات'),
      startDate: optionalDate_(p.startDate, 'بداية احتساب الحضور')
    };
    if (next.geoRequired && !Staff.branches_().some(function (b) { return b.active !== false && b.lat && b.lng && b.geoRadius > 0; })) {
      throw appError('حدّد موقع فرع واحد على الأقل قبل تفعيل التحقق من الموقع.');
    }
    Settings.set_('attendance', next, ctx.user);
    Audit.log(ctx.user, 'attendance', 'settings.update', 'Settings', 'attendance', next);
    return Attendance.settingsGet();
  },

  geoSave: function (ctx, p) {
    var b = Db.getOrThrow('core', 'Branches', p.branchId, 'الفرع');
    var geo = Hr.geo_(p);
    Db.update('core', 'Branches', b.id, geo);
    Audit.log(ctx.user, 'attendance', 'branch.geo', 'Branch', b.id, geo);
    return Attendance.settingsGet();
  },

  // ───────── الرئيسية وصندوق الموافقات ─────────
  inbox_: function (ctx) {
    if (!Permissions.has(ctx, 'attendance')) return [];
    var me = Staff.ofCtx_(ctx);
    var isHr = Attendance.isHr_(ctx);
    var team = me ? Staff.teamIds_(me.id) : [];
    if (!isHr && !team.length) return [];
    var maps = Staff.maps_();
    return Db.view('attendance', 'Corrections').filter(function (c) {
      return c.status === 'pending' && (!me || c.employeeId !== me.id || ctx.user.isSuperAdmin) && (isHr || team.indexOf(c.employeeId) >= 0);
    }).map(function (c) {
      var v = Attendance.correctionView_(c, maps);
      var facts = [{ k: 'اليوم', v: v.dayName + ' ' + dmy_(c.date) }];
      if (c.inTime) facts.push({ k: 'الحضور', v: c.inTime });
      if (c.outTime) facts.push({ k: 'الانصراف', v: c.outTime });
      return {
        id: 'att.correction:' + c.id, kind: 'att.correction', refId: c.id, module: 'attendance', moduleLabel: 'تصحيح البصمة',
        title: v.kindLabel, who: v.name, createdAt: c.createdAt, status: v.statusLabel, facts: facts, note: c.reason, needsNoteOnReject: true
      };
    });
  },

  decide_: function (ctx, kind, p) {
    return kind === 'att.correction' ? Attendance.correctionDecide(ctx, p) : null;
  },

  summary_: function (ctx) {
    if (!Permissions.has(ctx, 'attendance')) return [];
    var cards = [];
    var emp = Staff.ofCtx_(ctx);
    if (emp && emp.status !== 'terminated') {
      var t = Attendance.today(ctx);
      cards.push({ kind: 'att.today', isIn: t.isIn, openSince: t.openSince, closedMinutes: t.closedMinutes, shift: t.shift, dayType: t.dayType, detail: t.detail, late: t.late, sessions: t.sessions.length });
    }
    var scope = Attendance.scope_(ctx);
    if (scope.all || scope.ids.length) {
      var b = Attendance.board(ctx, {});
      cards.push({ kind: 'att.board', scope: b.scope, counts: b.counts });
    }
    return cards;
  },

  /** الإشعارات (Notify): نتيجة طلب تصحيح البصمة لصاحبه */
  notify_: function (ev) {
    if (ev.entity !== 'Correction' || !/^correction\.(approve|reject)$/.test(ev.action)) return [];
    var c = Db.get('attendance', 'Corrections', ev.id), e = c && Staff.get_(c.employeeId);
    if (!e || !e.userId) return [];
    var ok = c.status === 'approved';
    return [{ to: e.userId, title: ok ? 'اعتُمد تصحيح بصمتك' : 'رُفض طلب تصحيح البصمة', detail: dmy_(c.date) + (!ok && c.decisionNote ? ' — ' + c.decisionNote : ''), link: '/attendance/corrections' }];
  },

  routes_: function () {
    var any = { module: 'attendance' }, hr = { module: 'attendance', roles: ['hr'] };
    return {
      'att.today': { perm: any, fn: Attendance.today },
      'att.punch': { perm: any, fn: Attendance.punch },
      'att.myMonth': { perm: any, fn: Attendance.myMonth },
      'att.board': { perm: any, fn: Attendance.board },
      'att.report': { perm: any, fn: Attendance.report },
      'att.records': { perm: any, fn: Attendance.records },
      'att.record.save': { perm: hr, fn: Attendance.recordSave },
      'att.record.delete': { perm: hr, fn: Attendance.recordDelete },
      'att.correction.request': { perm: any, fn: Attendance.correctionRequest },
      'att.correction.mine': { perm: any, fn: Attendance.correctionMine },
      'att.correction.cancel': { perm: any, fn: Attendance.correctionCancel },
      'att.correction.list': { perm: any, fn: Attendance.correctionList },
      'att.correction.decide': { perm: any, fn: Attendance.correctionDecide },
      'att.settings.get': { perm: hr, fn: Attendance.settingsGet },
      'att.settings.save': { perm: hr, fn: Attendance.settingsSave },
      'att.geo.save': { perm: hr, fn: Attendance.geoSave },
      'att.device.challenge': { perm: any, fn: Attendance.deviceChallenge },
      'att.device.register': { perm: any, fn: Attendance.deviceRegister },
      'att.device.list': { perm: hr, fn: Attendance.deviceList },
      'att.device.reset': { perm: hr, fn: Attendance.deviceReset }
    };
  }
};
