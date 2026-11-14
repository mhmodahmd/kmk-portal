/**
 * حالة النظام العامة (قبل الدخول).
 */
var System = {
  status: function () {
    var users = Db.all('core', 'Users');
    return {
      app: APP.NAME,
      version: APP.VERSION,
      needsSetup: users.length === 0,
      company: Settings.company_().name
    };
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
