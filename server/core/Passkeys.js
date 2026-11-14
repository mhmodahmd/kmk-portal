/**
 * مفاتيح الدخول بالبصمة (الوجه أو الإصبع على جهاز المستخدم).
 *
 * - مفتاح نشط واحد لكل مستخدم، يُستخدم للدخول إلى البوابة وللبصمة في الحضور.
 * - تغيير الجهاز: الموظف عبر الموارد البشرية (إعدادات الحضور)، ومن لا يملك بطاقة موظف يزيل مفتاحه بنفسه.
 * - التحقق من التوقيعات في WebAuthn.js. لا تُخزَّن أي بيانات حيوية، فقط المفتاح العام.
 */
var PASSKEY_LOGIN_OWNER = '*login';
var PASSKEY_OPTIONS_PER_MINUTE = 120;

var Passkeys = {
  activeOfUser_: function (userId) {
    if (!userId) return null;
    return Db.view('core', 'Passkeys').filter(function (k) { return k.userId === userId && k.status === 'active'; })[0] || null;
  },

  activeByUser_: function () {
    var m = {};
    Db.view('core', 'Passkeys').forEach(function (k) { if (k.status === 'active') m[k.userId] = k; });
    return m;
  },

  info_: function (k) {
    return k ? { id: k.id, label: k.label, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt, synced: !!k.backup } : null;
  },

  keyOf_: function (k) {
    return { credId: k.credId, rpId: k.rpId, alg: Number(k.alg), publicKey: k.publicKey };
  },

  /** تحدي التسجيل أو البصمة لمستخدم داخل البوابة */
  challenge: function (ctx) {
    var emp = Staff.ofCtx_(ctx);
    var k = Passkeys.activeOfUser_(ctx.user.id);
    return {
      challenge: WebAuthn.challenge_(ctx.user.id),
      rpName: Settings.company_().name || APP.NAME,
      user: { id: WebAuthn.userHandle_(ctx.user.id), name: ctx.user.username, displayName: emp ? emp.fullName : ctx.user.fullName },
      credentialIds: k ? [k.credId] : []
    };
  },

  register: function (ctx, p) {
    p = p || {};
    var existing = Passkeys.activeOfUser_(ctx.user.id);
    var emp = Staff.ofCtx_(ctx);
    if (existing) {
      throw appError('لديك جهاز مسجّل منذ ' + dmy_(localDate_(new Date(existing.createdAt).getTime())) + '. ' +
        (emp ? 'لتسجيل جهاز آخر اطلب من الموارد البشرية إعادة ضبط جهازك.' : 'أزل الجهاز الحالي من «ملفي» أولاً.'), 'DEVICE_EXISTS');
    }
    var key = WebAuthn.verifyRegistration_(ctx.user.id, p);
    return withLock(function () {
      if (Passkeys.activeOfUser_(ctx.user.id)) throw appError('سُجّل جهاز لك للتو. حدّث الصفحة.', 'DEVICE_EXISTS');
      var saved = Db.insert('core', 'Passkeys', {
        userId: ctx.user.id, employeeId: emp ? emp.id : '', credId: key.credId, rpId: key.rpId, alg: key.alg,
        publicKey: key.publicKey, signCount: key.signCount, backup: key.backup,
        label: optionalText(p.label, 80) || 'جهاز', status: 'active', createdAt: nowIso()
      });
      Audit.log(ctx.user, 'core', 'passkey.register', 'Passkey', saved.id, { label: saved.label, synced: key.backup });
      return Passkeys.info_(saved);
    });
  },

  mine: function (ctx) {
    return { passkey: Passkeys.info_(Passkeys.activeOfUser_(ctx.user.id)), canRemove: !Staff.ofCtx_(ctx) };
  },

  /** إزالة المستخدم مفتاحه بنفسه: لمن ليس موظفاً فقط، حتى لا يتجاوز الموظف ضبط جهاز البصمة */
  remove: function (ctx) {
    if (Staff.ofCtx_(ctx)) throw appError('لتغيير جهازك اطلب من الموارد البشرية إعادة ضبطه.', 'FORBIDDEN');
    var k = Passkeys.activeOfUser_(ctx.user.id);
    if (!k) throw appError('لا يوجد جهاز مسجّل.');
    Passkeys.revoke_(ctx.user, k, 'أزاله المستخدم');
    return Passkeys.mine(ctx);
  },

  revoke_: function (actor, k, reason) {
    Db.update('core', 'Passkeys', k.id, { status: 'revoked', revokedAt: nowIso(), revokedBy: actor.fullName, revokeReason: reason });
    Audit.log(actor, 'core', 'passkey.revoke', 'Passkey', k.id, { userId: k.userId, label: k.label, reason: reason });
  },

  /** يتحقق من بصمة مستخدم داخل البوابة ويحدّث العداد. يعيد المفتاح */
  verify_: function (ctx, assertion) {
    var k = Passkeys.activeOfUser_(ctx.user.id);
    if (!k) throw appError('لا يوجد جهاز مسجّل لك. سجّل جهازك أولاً.', 'DEVICE_NOT_REGISTERED');
    var res = WebAuthn.verifyAssertion_(ctx.user.id, Passkeys.keyOf_(k), assertion);
    return { key: k, signCount: res.signCount };
  },

  touch_: function (k, signCount) {
    Db.update('core', 'Passkeys', k.id, { signCount: signCount, lastUsedAt: nowIso() });
  },

  // ───────── الدخول بالبصمة (قبل الجلسة) ─────────
  loginOptions: function () {
    var cache = CacheService.getScriptCache();
    var bucket = 'wa_rate_' + Math.floor(Date.now() / 60000);
    var n = Number(cache.get(bucket) || 0) + 1;
    if (n > PASSKEY_OPTIONS_PER_MINUTE) throw appError('محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.', 'RATE_LIMIT');
    cache.put(bucket, String(n), 120);
    return { challenge: WebAuthn.challenge_(PASSKEY_LOGIN_OWNER) };
  },

  login: function (ctx, p) {
    p = p || {};
    var a = p.assertion || {};
    var fail = appError('لم نتعرف على هذه البصمة. ادخل بكلمة المرور، ثم فعّل الدخول بالبصمة من «ملفي».', 'BAD_LOGIN');
    var credId = String(a.credentialId || '').replace(/=+$/, '');
    var k = credId ? Db.view('core', 'Passkeys').filter(function (x) { return x.credId === credId && x.status === 'active'; })[0] : null;
    if (!k) throw fail;
    if (a.userHandle && String(a.userHandle).replace(/=+$/, '') !== WebAuthn.userHandle_(k.userId)) throw fail;
    var u = Db.get('core', 'Users', k.userId);
    if (!u || !u.active) throw fail;
    var res;
    try { res = WebAuthn.verifyAssertion_(PASSKEY_LOGIN_OWNER, Passkeys.keyOf_(k), a); }
    catch (e) { if (e.code === 'DEVICE_CHALLENGE') throw e; throw fail; }
    Passkeys.touch_(k, res.signCount);
    u = Db.update('core', 'Users', u.id, { lastLogin: nowIso() });
    return Auth.sessionResult_(u, !!p.remember);
  }
};
