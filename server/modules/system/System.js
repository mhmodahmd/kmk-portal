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
 * كل وحدة ستقدّم لاحقاً: summary(ctx) لبطاقتها، و inbox(ctx) لما ينتظر قرار المستخدم.
 */
var Home = {
  providers_: function () {
    return []; // تُضاف الوحدات هنا مع بنائها
  },

  summary: function (ctx) {
    var cards = [];
    var inboxCount = 0;
    Home.providers_().forEach(function (p) {
      if (p.summary) { var c = p.summary(ctx); if (c) cards.push(c); }
      if (p.inbox) inboxCount += p.inbox(ctx).length;
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
    Home.providers_().forEach(function (p) { if (p.inbox) items = items.concat(p.inbox(ctx)); });
    items.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    return items;
  }
};
