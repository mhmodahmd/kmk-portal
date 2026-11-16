/**
 * حالة النظام العامة (قبل الدخول).
 */
var System = {
  status: function (ctx, p) {
    var users = Db.all('core', 'Users');
    var out = {
      app: APP.NAME,
      version: APP.VERSION,
      needsSetup: users.length === 0,
      company: Settings.company_().name
    };
    // فحص تشغيلي اختياري: هل صلاحية Drive مفعّلة؟ (لا يُستدعى عند كل تحميل)
    if (p && p.check) { out.drive = Files.available_(); out.mail = Notify.mailAvailable_(); }
    return out;
  }
};

/**
 * الرئيسية وصندوق الموافقات.
 * كل وحدة تقدّم: summary_(ctx) لبطاقاتها، و inbox_(ctx) لما ينتظر قرار المستخدم، و decide_ للقرار (ModuleProviders_).
 */
var Home = {
  /** الوحدات المفعّلة التي يملك المستخدم دوراً فيها */
  providers_: function (ctx) {
    return ModuleProviders_().filter(function (p) {
      var m = moduleDef_(p.key);
      return m && m.enabled && Permissions.has(ctx, p.key);
    });
  },

  summary: function (ctx) {
    var cards = [];
    var inboxCount = 0;
    Home.providers_(ctx).forEach(function (p) {
      try {
        if (p.summary) cards = cards.concat(p.summary(ctx) || []);
        if (p.inbox) inboxCount += p.inbox(ctx).length;
      } catch (e) {
        // بطاقة وحدة معطوبة لا تُسقط الرئيسية كلها
        if (!e.isAppError) console.error('summary ' + p.key + ': ' + (e.stack || e));
      }
    });
    var setup = null;
    if (ctx.user.isSuperAdmin) {
      var users = Db.all('core', 'Users');
      var company = Settings.company_();
      setup = {
        hasCompany: !!Settings.get_('company', null),
        usersCount: users.length,
        rolesCount: Db.all('core', 'UserRoles').length,
        companyName: company.name
      };
    }
    return {
      user: Auth.publicUser_(ctx.user),
      roles: ctx.roles,
      modules: Permissions.visibleModules(ctx),
      inboxCount: inboxCount,
      cards: cards,
      setup: setup
    };
  },

  /**
   * لوحة الرئيسية (تكمل home.summary): ما يحتاج انتباه المستخدم مجمّعاً من كل الوحدات حسب أدواره،
   * وملخص شهره الشخصي (الحضور والمهام)، وأول عناصر صندوق الموافقات.
   */
  dashboard: function (ctx) {
    var u = ctx.user.id, today = localDate_(), month = today.slice(0, 7), week = addDays_(today, 7);
    var has = function (m, roles) { var d = moduleDef_(m); return !!(d && d.enabled && Permissions.has(ctx, m, roles)); };
    var emp = Staff.ofCtx_(ctx), attention = [], my = { attendance: null, tasks: null, leave: null };
    var push = function (kind, tone, title, detail, link, sort) { attention.push({ kind: kind, tone: tone, title: title, detail: detail || '', link: link, sort: sort || '' }); };
    // الحضور: لم يسجّل حضوره في يوم عمل، وملخص شهره
    if (emp && emp.status !== 'terminated' && has('attendance')) {
      try {
        var t = Attendance.today(ctx);
        if (!t.isIn && !t.sessions.length && !t.dayType && t.shift) push('att.punch', 'warn', 'لم تسجّل حضورك اليوم', t.shift.name + ' ' + t.shift.start + '–' + t.shift.end, '/attendance', '0');
        var mo = Attendance.monthOf_(emp, month);
        my.attendance = { month: month, presentDays: mo.summary.daysPresent, absentDays: mo.summary.absentDays, lateDays: mo.summary.lateDays, lateMin: mo.summary.lateMin, overtimeMin: mo.summary.overtimeMin, totalMinutes: mo.summary.totalMinutes, leaveDays: mo.summary.leaveDays };
      } catch (e) { if (!e.isAppError) console.error('home att: ' + e); }
    }
    // المهام: المتأخرة والمراجعات، وملخص الشهر
    if (has('tasks')) {
      var mine = Tasks.rows_('Tasks').filter(function (x) { return x.assigneeId === u; });
      var open = mine.filter(function (x) { return TSK.OPEN.indexOf(x.status) >= 0; });
      open.filter(function (x) { return x.dueDate && x.dueDate < today; }).sort(function (a, b) { return a.dueDate.localeCompare(b.dueDate); }).slice(0, 4)
        .forEach(function (x) { push('tsk.overdue', 'bad', x.title, 'مهمة متأخرة منذ ' + dmy_(x.dueDate), '/tasks/' + x.id, '1' + x.dueDate); });
      open.filter(function (x) { return x.dueDate === today; }).slice(0, 3).forEach(function (x) { push('tsk.today', 'warn', x.title, 'مهمة موعدها اليوم', '/tasks/' + x.id, '2'); });
      var reviews = Tasks.inbox_(ctx).length;
      if (reviews) push('tsk.review', 'info', reviews + ' مهمة بانتظار مراجعتك', '', '/inbox', '3');
      my.tasks = {
        open: open.length, overdue: open.filter(function (x) { return x.dueDate && x.dueDate < today; }).length,
        dueWeek: open.filter(function (x) { return x.dueDate && x.dueDate >= today && x.dueDate <= week; }).length,
        doneMonth: mine.filter(function (x) { return x.status === 'done' && (x.completedAt || '').slice(0, 7) === month; }).length,
        review: open.filter(function (x) { return x.status === 'review'; }).length
      };
    }
    // المراسلات: خطابات متأخرة أو تحين قريباً وأنا مسؤول عنها
    if (has('correspondence')) {
      var letters = Correspondence.rows_('Letters').filter(function (l) { return COR.OPEN.indexOf(l.status) >= 0 && l.dueDate && (l.assigneeId === u || (l.createdBy === u && !l.assigneeId)); });
      letters.filter(function (l) { return l.dueDate < today; }).sort(function (a, b) { return a.dueDate.localeCompare(b.dueDate); }).slice(0, 3)
        .forEach(function (l) { push('cor.overdue', 'bad', l.subject, l.number + ' · تأخر الرد منذ ' + dmy_(l.dueDate), '/correspondence/' + l.id, '1' + l.dueDate); });
      letters.filter(function (l) { return l.dueDate >= today && l.dueDate <= addDays_(today, COR.DUE_DAYS); }).slice(0, 3)
        .forEach(function (l) { push('cor.soon', 'warn', l.subject, l.number + ' · موعد الرد ' + dmy_(l.dueDate), '/correspondence/' + l.id, '2' + l.dueDate); });
    }
    // الموارد البشرية: مستندات تنتهي (للموارد البشرية)، وطلبات الفريق للمدير
    if (has('hr')) {
      if (Hr.isHr_(ctx)) {
        var exp = Staff.expiring_(30);
        if (exp.length) push('hr.docs', exp.some(function (x) { return x.daysLeft < 0; }) ? 'bad' : 'warn', exp.length + ' مستندات تنتهي خلال 30 يوماً', exp.slice(0, 3).map(function (x) { return x.name + ' · ' + x.doc; }).join('، '), '/hr/employees', '4');
      }
      if (emp) {
        var bal = Hr.balancesFor_(emp.id, today.slice(0, 4)).filter(function (b) { return !b.unlimited; })[0];
        var openLeaves = Db.view('hr', 'LeaveRequests').filter(function (r) { return r.employeeId === emp.id && LEAVE_OPEN.indexOf(r.status) >= 0; }).length;
        my.leave = bal ? { name: bal.name, available: bal.available, used: bal.used, pending: openLeaves } : null;
      }
    }
    // العملاء: دفعات متأخرة ومشاريع تحتاج مراجعة (للمحاسب والمدير)
    if (has('crm') && Crm.isAcc_(ctx)) {
      var h = Crm.home(ctx);
      if (h.overdue) push('crm.overdue', 'bad', h.overdue + ' دفعات متأخرة التحصيل', '', '/crm/payments', '1');
      if (h.review) push('crm.review', 'warn', h.review + ' مشاريع تحتاج مراجعة', '', '/crm/projects?review=1', '5');
    }
    // العهد: تنبيهات الصرف للمحاسب، وعهدتي لصاحبها
    if (has('custody')) {
      var m = Custody.maps_();
      if (Custody.isStaff_(ctx)) {
        var alerts = Custody.rows_('Custodies').filter(function (c) { return c.status === 'open'; }).map(function (c) { return Custody.view_(c, m); }).filter(function (v) { return v.alert || v.overspent; });
        if (alerts.length) push('cus.alerts', 'warn', alerts.length + ' عهد تجاوزت نسبة التنبيه', alerts.slice(0, 3).map(function (v) { return v.employeeName + ' ' + v.percent + '%'; }).join('، '), '/custody/overview', '5');
      } else if (emp) {
        var a = Custody.activeOf_(emp.id);
        if (a) { var v = Custody.view_(a, m); if (v.alert || v.overspent) push('cus.mine', v.overspent ? 'bad' : 'warn', v.overspent ? 'عهدتك تجاوزت مبلغها' : 'عهدتك قاربت على النفاد', 'المتبقي ' + kwd_(v.remaining), '/custody/' + a.id, '2'); }
      }
    }
    attention.sort(function (a, b) { return (a.sort || '').localeCompare(b.sort || ''); });
    return { today: today, attention: attention.slice(0, 10), my: my, inbox: Home.inbox(ctx).slice(0, 5) };
  },

  inbox: function (ctx) {
    var items = [];
    Home.providers_(ctx).forEach(function (p) { if (p.inbox) items = items.concat(p.inbox(ctx)); });
    items.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    return items;
  },

  /** قرار من صندوق الموافقات: { kind, id, approve, note }. كل وحدة تتحقق من الصلاحية بنفسها. */
  decide: function (ctx, p) {
    var kind = String((p && p.kind) || '');
    var provider = Home.providers_(ctx).filter(function (x) { return kind.indexOf(x.prefix) === 0; })[0];
    if (!provider || !provider.decide) throw appError('نوع الطلب غير معروف.');
    if (provider.decide(ctx, kind, { id: p.id, approve: p.approve, note: p.note }) === null) throw appError('نوع الطلب غير معروف.');
    return true;
  }
};
