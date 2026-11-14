/**
 * الدخول والجلسات وكلمات المرور وتذكّر الجهاز.
 */
var Auth = {
  hashPassword_: function (password, salt) {
    var h = String(salt) + '|' + String(password);
    for (var i = 0; i < 1000; i++) h = sha256Hex_(h + '|' + salt);
    return h;
  },

  validateNewPassword_: function (pw) {
    pw = String(pw || '');
    if (pw.length < APP.PASSWORD_MIN) throw appError('كلمة المرور ' + APP.PASSWORD_MIN + ' أحرف على الأقل.');
    if (!/[0-9]/.test(normalizeDigits(pw)) || !/[A-Za-z؀-ۿ]/.test(pw)) throw appError('كلمة المرور يجب أن تحتوي حروفاً وأرقاماً.');
    return pw;
  },

  setPassword_: function (user, password, mustChange) {
    var salt = randomToken_().slice(0, 24);
    return Db.update('core', 'Users', user.id, {
      salt: salt, passwordHash: Auth.hashPassword_(password, salt),
      mustChangePassword: !!mustChange, failedAttempts: 0, lockedUntil: '', updatedAt: nowIso()
    });
  },

  publicUser_: function (u) {
    return {
      id: u.id, username: u.username, fullName: u.fullName, jobTitle: u.jobTitle,
      phone: u.phone, email: u.email, active: u.active, isSuperAdmin: u.isSuperAdmin,
      mustChangePassword: u.mustChangePassword, lastLogin: u.lastLogin,
      locked: !!(u.lockedUntil && new Date(u.lockedUntil) > new Date())
    };
  },

  findByUsername_: function (username) {
    var u = String(username || '').toLowerCase();
    var rows = Db.find('core', 'Users', function (r) { return r.username === u; });
    return rows[0] || null;
  },

  // ───────── الجلسات ─────────
  createSession_: function (user) {
    var token = randomToken_();
    CacheService.getScriptCache().put('s_' + sha256Hex_(token), user.id, APP.SESSION_SECONDS);
    return token;
  },

  /** يعيد المستخدم من رمز الجلسة أو null. */
  userFromToken_: function (token) {
    if (!token) return null;
    var id = CacheService.getScriptCache().get('s_' + sha256Hex_(token));
    if (!id) return null;
    var u = Db.get('core', 'Users', id);
    return u && u.active ? u : null;
  },

  // ───────── تذكّر الجهاز (رمز موقّع لا يُخزَّن في الخادم) ─────────
  deviceSecret_: function () {
    var props = PropertiesService.getScriptProperties();
    var s = props.getProperty('DEVICE_SECRET');
    if (!s) { s = randomToken_(); props.setProperty('DEVICE_SECRET', s); }
    return s;
  },

  passwordStamp_: function (u) { return String(u.passwordHash || '').slice(0, 10); },

  createDeviceToken_: function (u) {
    var exp = Date.now() + APP.DEVICE_DAYS * 86400000;
    var body = u.id + '.' + exp;
    return body + '.' + hmacHex_(body + '.' + Auth.passwordStamp_(u), Auth.deviceSecret_());
  },

  sessionResult_: function (u, remember) {
    return {
      token: Auth.createSession_(u),
      deviceToken: remember ? Auth.createDeviceToken_(u) : '',
      user: Auth.publicUser_(u),
      roles: Permissions.rolesOf(u.id)
    };
  },

  // ───────── الإجراءات ─────────
  login: function (ctx, p) {
    var u = Auth.findByUsername_(normalizeDigits(p.username).trim());
    var generic = appError('اسم المستخدم أو كلمة المرور غير صحيحة.', 'BAD_LOGIN');
    if (!u || !u.active) {
      Auth.hashPassword_(p.password || '', 'x'); // توقيت متقارب
      throw generic;
    }
    if (u.lockedUntil && new Date(u.lockedUntil) > new Date()) {
      throw appError('الحساب مقفل مؤقتاً بعد محاولات خاطئة. حاول بعد ' + APP.LOCK_MINUTES + ' دقيقة أو تواصل مع مدير النظام.', 'LOCKED');
    }
    if (!safeEquals_(Auth.hashPassword_(String(p.password || ''), u.salt), u.passwordHash)) {
      var fails = (u.failedAttempts || 0) + 1;
      var changes = { failedAttempts: fails };
      if (fails >= APP.MAX_FAILED_LOGINS) {
        changes.lockedUntil = new Date(Date.now() + APP.LOCK_MINUTES * 60000).toISOString();
        changes.failedAttempts = 0;
        Audit.log({ id: u.id, fullName: u.fullName }, 'core', 'user.locked', 'User', u.id, null);
      }
      Db.update('core', 'Users', u.id, changes);
      throw generic;
    }
    u = Db.update('core', 'Users', u.id, { failedAttempts: 0, lockedUntil: '', lastLogin: nowIso() });
    return Auth.sessionResult_(u, !!p.remember);
  },

  resume: function (ctx, p) {
    var parts = String(p.deviceToken || '').split('.');
    var fail = appError('انتهت صلاحية الدخول المحفوظ. سجّل الدخول من جديد.', 'SESSION_EXPIRED');
    if (parts.length !== 3 || Number(parts[1]) < Date.now()) throw fail;
    var u = Db.get('core', 'Users', parts[0]);
    if (!u || !u.active) throw fail;
    var expected = hmacHex_(parts[0] + '.' + parts[1] + '.' + Auth.passwordStamp_(u), Auth.deviceSecret_());
    if (!safeEquals_(expected, parts[2])) throw fail;
    Db.update('core', 'Users', u.id, { lastLogin: nowIso() });
    return Auth.sessionResult_(u, false);
  },

  me: function (ctx) {
    return { user: Auth.publicUser_(ctx.user), roles: ctx.roles };
  },

  logout: function (ctx) {
    CacheService.getScriptCache().remove('s_' + sha256Hex_(ctx.token));
    return true;
  },

  changePassword: function (ctx, p) {
    var u = ctx.user;
    if (!safeEquals_(Auth.hashPassword_(String(p.current || ''), u.salt), u.passwordHash)) {
      throw appError('كلمة المرور الحالية غير صحيحة.');
    }
    var next = Auth.validateNewPassword_(p.next);
    if (next === p.current) throw appError('اختر كلمة مرور مختلفة عن الحالية.');
    u = Auth.setPassword_(u, next, false);
    Audit.log(u, 'core', 'user.changePassword', 'User', u.id, null);
    // رمز جهاز جديد لأن تغيير كلمة المرور يُبطل الرموز القديمة
    return { user: Auth.publicUser_(u), deviceToken: p.remember ? Auth.createDeviceToken_(u) : '' };
  },

  /** إنشاء أول مدير للنظام. يعمل مرة واحدة فقط ما دام لا يوجد مستخدمون. */
  setup: function (ctx, p) {
    return withLock(function () {
      if (Db.all('core', 'Users').length) throw appError('تم إعداد النظام مسبقاً.', 'ALREADY_SETUP');
      var username = normalizeUsername(p.username);
      var fullName = requireText(p.fullName, 'الاسم الكامل', 80);
      var password = Auth.validateNewPassword_(p.password);
      var u = Db.insert('core', 'Users', {
        username: username, fullName: fullName, jobTitle: optionalText(p.jobTitle, 60) || 'مدير النظام',
        active: true, isSuperAdmin: true, mustChangePassword: false, failedAttempts: 0,
        createdAt: nowIso(), createdBy: 'setup', updatedAt: nowIso()
      });
      u = Auth.setPassword_(u, password, false);
      if (p.companyName) Settings.set_('company', { name: optionalText(p.companyName, 100) }, u);
      Audit.log(u, 'core', 'system.setup', 'User', u.id, { username: username });
      u = Db.update('core', 'Users', u.id, { lastLogin: nowIso() });
      return Auth.sessionResult_(u, !!p.remember);
    });
  }
};
