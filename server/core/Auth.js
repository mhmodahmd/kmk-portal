/**
 * الدخول والجلسات وكلمات المرور وتذكّر الجهاز.
 */
var Auth = {
  /** الصيغة الحالية v2$<hex> بـ APP.HASH_ROUNDS جولة؛ بلا بادئة = الصيغة القديمة (1000 جولة) */
  hashPassword_: function (password, salt, rounds) {
    var n = rounds || APP.HASH_ROUNDS;
    var h = String(salt) + '|' + String(password);
    for (var i = 0; i < n; i++) h = sha256Hex_(h + '|' + salt);
    return n === 1000 ? h : 'v2$' + h;
  },

  /** هل كلمة المرور مخزنة بالصيغة الحالية؟ */
  currentHash_: function (u) { return String(u.passwordHash || '').indexOf('v2$') === 0; },

  /** كلمات مرور منقولة من نظام الحضور السابق (64 جولة SHA-256 بترميز base64) */
  legacyHash_: function (password, salt) {
    var h = String(salt) + '|' + String(password);
    for (var i = 0; i < 64; i++) {
      h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt, Utilities.Charset.UTF_8));
    }
    return h;
  },

  /** يتحقق من كلمة المرور (الحالية أو المنقولة من النظام السابق) */
  /** كلمات مرور منقولة من نظام العهد السابق: v1$<تكرارات>$<hex> */
  legacyCustodyHash_: function (password, salt, iterations) {
    var h = String(salt) + ':' + String(password);
    for (var i = 0; i < iterations; i++) h = sha256Hex_(h + ':' + salt);
    return 'v1$' + iterations + '$' + h;
  },

  checkPassword_: function (u, password) {
    var stored = String(u.passwordHash || '');
    if (stored.indexOf('lc:') === 0) {
      var parts = stored.slice(3).split('$');
      if (parts.length !== 3 || parts[0] !== 'v1') return false;
      return safeEquals_(Auth.legacyCustodyHash_(String(password || ''), u.salt, parseInt(parts[1], 10)), stored.slice(3));
    }
    if (stored.indexOf('legacy:') === 0) return safeEquals_(Auth.legacyHash_(String(password || ''), u.salt), stored.slice(7));
    if (stored.indexOf('v2$') === 0) return safeEquals_(Auth.hashPassword_(String(password || ''), u.salt), stored);
    return safeEquals_(Auth.hashPassword_(String(password || ''), u.salt, 1000), stored);
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
    Auth.storeSession_(token, user);
    return token;
  },

  /** قيمة الجلسة: المعرّف + ختم كلمة المرور وقت الإنشاء */
  storeSession_: function (token, user) {
    CacheService.getScriptCache().put('s_' + sha256Hex_(token), user.id + '|' + Auth.passwordStamp_(user), APP.SESSION_SECONDS);
  },

  /** يعيد المستخدم من رمز الجلسة أو null. جلسة أُنشئت قبل تغيير كلمة المرور تُرفض */
  userFromToken_: function (token) {
    if (!token) return null;
    var cache = CacheService.getScriptCache();
    var key = 's_' + sha256Hex_(token);
    var val = cache.get(key);
    if (!val) return null;
    var parts = String(val).split('|'), id = parts[0];
    var u = Db.get('core', 'Users', id);
    if (!u || !u.active) return null;
    if (parts.length > 1 && parts[1] !== Auth.passwordStamp_(u)) { cache.remove(key); return null; }
    cache.put(key, val, APP.SESSION_SECONDS); // جلسة منزلقة: تمتد مع كل استخدام
    return u;
  },

  /** كبح عام: عدّاد محاولات خاطئة في الدقيقة لكل البوابة، وعدّاد لكل اسم مستخدم (حتى غير الموجود) */
  throttle_: function (username) {
    var cache = CacheService.getScriptCache();
    var g = Number(cache.get('lf_all')) || 0, u = Number(cache.get('lf_' + sha256Hex_(username))) || 0;
    if (g >= APP.LOGIN_BURST || u >= APP.MAX_FAILED_LOGINS * 2) {
      throw appError('محاولات دخول كثيرة. حاول بعد دقيقة.', 'TOO_MANY_ATTEMPTS');
    }
  },
  noteFailure_: function (username) {
    var cache = CacheService.getScriptCache();
    var k = 'lf_' + sha256Hex_(username);
    cache.put('lf_all', String((Number(cache.get('lf_all')) || 0) + 1), 60);
    cache.put(k, String((Number(cache.get(k)) || 0) + 1), 900);
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
    var username = normalizeDigits(p.username).trim().toLowerCase();
    Auth.throttle_(username);
    var u = Auth.findByUsername_(username);
    var generic = appError('اسم المستخدم أو كلمة المرور غير صحيحة.', 'BAD_LOGIN');
    if (!u || !u.active) {
      Auth.hashPassword_(p.password || '', 'x'); // توقيت متقارب
      Auth.noteFailure_(username);
      throw generic;
    }
    if (u.lockedUntil && new Date(u.lockedUntil) > new Date()) {
      throw appError('الحساب مقفل مؤقتاً بعد محاولات خاطئة. حاول بعد ' + APP.LOCK_MINUTES + ' دقيقة أو تواصل مع مدير النظام.', 'LOCKED');
    }
    if (!Auth.checkPassword_(u, p.password)) {
      var fails = (u.failedAttempts || 0) + 1;
      var changes = { failedAttempts: fails };
      if (fails >= APP.MAX_FAILED_LOGINS) {
        changes.lockedUntil = new Date(Date.now() + APP.LOCK_MINUTES * 60000).toISOString();
        changes.failedAttempts = 0;
        Audit.log({ id: u.id, fullName: u.fullName }, 'core', 'user.locked', 'User', u.id, null);
      }
      Db.update('core', 'Users', u.id, changes);
      Auth.noteFailure_(username);
      throw generic;
    }
    // كلمة مرور منقولة أو بصيغة أقدم: تُعاد تجزئتها بالصيغة الحالية عند أول دخول ناجح
    if (!Auth.currentHash_(u)) u = Auth.setPassword_(u, String(p.password), !!u.mustChangePassword);
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
    // دخول مدير النظام فرصة للتأكد من تركيب المشغّلات الزمنية (مرة كل 6 ساعات)
    if (ctx.user.isSuperAdmin) Jobs.ensure_();
    return { user: Auth.publicUser_(ctx.user), roles: ctx.roles };
  },

  logout: function (ctx) {
    CacheService.getScriptCache().remove('s_' + sha256Hex_(ctx.token));
    return true;
  },

  changePassword: function (ctx, p) {
    var u = ctx.user;
    if (!Auth.checkPassword_(u, p.current)) {
      throw appError('كلمة المرور الحالية غير صحيحة.');
    }
    var next = Auth.validateNewPassword_(p.next);
    if (next === p.current) throw appError('اختر كلمة مرور مختلفة عن الحالية.');
    u = Auth.setPassword_(u, next, false);
    Audit.log(u, 'core', 'user.changePassword', 'User', u.id, null);
    // الجلسة الحالية تُجدَّد بالختم الجديد؛ الجلسات الأخرى ورموز الأجهزة القديمة تُبطل
    Auth.storeSession_(ctx.token, u);
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
