/**
 * نقطة الدخول الوحيدة للخادم.
 *
 * الطلب:   POST  body = {"action":"users.list","token":"…","payload":{…},"v":"0.1.0"}
 *          (Content-Type: text/plain لتجنب طلب CORS المسبق)
 * الرد:    {"ok":true,"data":…} | {"ok":false,"error":{"code":"…","message":"…"}}
 *
 * كل إجراء مسجّل هنا مع صلاحيته. لا دوال عامة خارج الموجّه.
 */
var Router = {
  /**
   * fn(ctx, payload) · public: بلا جلسة · perm: انظر Permissions.assert
   * allowMustChange: يُسمح به قبل تغيير كلمة المرور الإجباري
   */
  routes_: function () {
    return Object.assign({
      'system.status': { public: true, fn: System.status },
      'auth.setup': { public: true, fn: Auth.setup },
      'auth.login': { public: true, fn: Auth.login },
      'auth.resume': { public: true, fn: Auth.resume },
      'auth.me': { allowMustChange: true, fn: Auth.me },
      'auth.logout': { allowMustChange: true, fn: Auth.logout },
      'auth.changePassword': { allowMustChange: true, fn: Auth.changePassword },
      'home.summary': { fn: Home.summary },
      'inbox.list': { fn: Home.inbox },
      'settings.get': { fn: Settings.get },
      'settings.update': { perm: 'super', fn: Settings.update },
      'audit.list': { perm: 'super', fn: Audit.list },
      'users.list': { perm: 'super', fn: Users.list },
      'users.create': { perm: 'super', fn: Users.create },
      'users.update': { perm: 'super', fn: Users.update },
      'users.resetPassword': { perm: 'super', fn: Users.resetPassword },
      'users.unlock': { perm: 'super', fn: Users.unlock },
      'users.setRoles': { perm: 'super', fn: Users.setRoles }
    }, ModuleRoutes_());
  },

  handle: function (req) {
    var started = Date.now();
    try {
      if (!req || typeof req.action !== 'string') throw appError('طلب غير صالح.', 'BAD_REQUEST');
      if (req.v && compareVersions_(req.v, APP.MIN_CLIENT) < 0) {
        throw appError('يوجد إصدار أحدث من البوابة. أعد تحميل الصفحة.', 'UPDATE_REQUIRED');
      }
      var routes = Router.routes_();
      if (req.action === 'batch') {
        var calls = (req.payload && req.payload.calls) || [];
        if (calls.length > 10) throw appError('عدد كبير من الطلبات دفعة واحدة.', 'BAD_REQUEST');
        var ctx = null;
        var results = calls.map(function (c) {
          try {
            var route = routes[c.action];
            if (!route) throw appError('إجراء غير معروف.', 'UNKNOWN_ACTION');
            if (!route.public && !ctx) ctx = Router.context_(req.token, route);
            return { ok: true, data: Router.run_(route, route.public ? null : ctx, c.action, c.payload || {}) };
          } catch (e) { return Router.errorOf_(e, c.action); }
        });
        return { ok: true, data: results, ms: Date.now() - started };
      }
      var route = routes[req.action];
      if (!route) throw appError('إجراء غير معروف.', 'UNKNOWN_ACTION');
      var context = route.public ? { user: null, roles: {}, token: '' } : Router.context_(req.token, route);
      return { ok: true, data: Router.run_(route, context, req.action, req.payload || {}), ms: Date.now() - started };
    } catch (e) {
      return Router.errorOf_(e, req && req.action);
    }
  },

  context_: function (token, route) {
    var user = Auth.userFromToken_(token);
    if (!user) throw appError('انتهت الجلسة. سجّل الدخول من جديد.', 'SESSION_EXPIRED');
    if (user.mustChangePassword && !route.allowMustChange) {
      throw appError('غيّر كلمة المرور أولاً.', 'MUST_CHANGE_PASSWORD');
    }
    return { user: user, roles: Permissions.rolesOf(user.id), token: token };
  },

  run_: function (route, ctx, action, payload) {
    if (ctx && ctx.user) Permissions.assert(ctx, route.perm);
    return route.fn(ctx || { user: null, roles: {}, token: '' }, payload);
  },

  errorOf_: function (e, action) {
    if (e && e.isAppError) return { ok: false, error: { code: e.code, message: e.message } };
    console.error('[' + action + '] ' + (e && e.stack ? e.stack : e));
    return { ok: false, error: { code: 'INTERNAL', message: 'حدث خطأ غير متوقع. حاول مرة أخرى.' } };
  }
};

/** الوحدات تضيف مساراتها هنا عند بنائها (المرحلة 1 وما بعدها). */
function ModuleRoutes_() {
  return {};
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e && e.postData ? e.postData.contents : '{}'); } catch (err) { req = null; }
  return ContentService.createTextOutput(JSON.stringify(Router.handle(req))).setMimeType(ContentService.MimeType.JSON);
}

/** فحص سريع أن الخادم يعمل: يفتح الرابط في المتصفح فيظهر الإصدار. */
function doGet() {
  var body = { ok: true, app: APP.NAME, version: APP.VERSION };
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

/** شغّلها من المحرر مرة واحدة للموافقة على الصلاحيات وإنشاء ملف البيانات. */
function setup() {
  var ss = Db.spreadsheet_('core');
  Logger.log('KMK core database: ' + ss.getUrl());
  return ss.getUrl();
}
