/**
 * التوقيع من النظام (docs/08 القسم 5، المرحلة 4).
 *
 * - توقيع كل مستخدم صورة PNG في core.Signatures، يعتمدها مدير النظام قبل استخدامها في مراحل «توقيع».
 *   توقيع مدير النظام نفسه معتمد عند حفظه. التوقيع المحفوظ سابقاً في العهد يمكن نسخه (fromCustody).
 * - لحظة التوقيع: إعادة التحقق بمفتاح المرور أو كلمة المرور، ثم يُختم الملف في المتصفح ويُرفع،
 *   ويُسجَّل في core.SignatureLog ببصمة الأصل والموقّع ورمز تحقق قصير.
 * - حد معروف: توقيع إداري موثّق بالسجل والبصمة، لا توقيع رقمي بشهادة.
 */
var SIGN_MAX_CHARS = 200000;

var Signature = {
  row_: function (userId) { return Db.view('core', 'Signatures').filter(function (s) { return s.userId === userId; })[0] || null; },

  /** التوقيع المعتمد لمستخدم (data URL) أو '' */
  approvedOf_: function (userId) { var s = Signature.row_(userId); return s && s.status === 'approved' ? s.data : ''; },

  view_: function (s) { return s ? { data: s.data, status: s.status, approvedAt: s.approvedAt || '', updatedAt: s.updatedAt } : null; },

  /** sign.mine: توقيعي وحالته، وهل يوجد توقيع في العهد يمكن نسخه */
  mine: function (ctx) {
    var legacy = '';
    try { var c = Db.view('custody', 'Signatures').filter(function (x) { return x.userId === ctx.user.id; })[0]; legacy = c ? c.data || '' : ''; } catch (e) { legacy = ''; }
    return { signature: Signature.view_(Signature.row_(ctx.user.id)), hasCustody: !!legacy };
  },

  /** sign.save: { data } صورة PNG، أو { fromCustody: true }، أو { data: '' } للحذف */
  save: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var data = String(p.data || '');
      if (p.fromCustody) {
        var c = Db.view('custody', 'Signatures').filter(function (x) { return x.userId === ctx.user.id; })[0];
        if (!c || !c.data) throw appError('لا يوجد توقيع محفوظ في العهد.');
        data = c.data;
      }
      var cur = Signature.row_(ctx.user.id);
      if (!data) {
        if (cur) Db.remove('core', 'Signatures', cur.id);
        Audit.log(ctx.user, 'core', 'signature.delete', 'Signature', ctx.user.id, {});
        return Signature.mine(ctx);
      }
      // المرسوم PNG؛ توقيع العهد المنسوخ قد يكون JPEG (صورة مرفوعة)
      var format = p.fromCustody ? /^data:image\/(png|jpeg);base64,[A-Za-z0-9+\/=]+$/ : /^data:image\/png;base64,[A-Za-z0-9+\/=]+$/;
      if (!format.test(data)) throw appError('التوقيع يجب أن يكون صورة PNG.');
      if (data.length > SIGN_MAX_CHARS) throw appError('صورة التوقيع كبيرة جداً.');
      var auto = !!ctx.user.isSuperAdmin;
      var rec = { data: data, status: auto ? 'approved' : 'pending', approvedBy: auto ? ctx.user.id : '', approvedAt: auto ? nowIso() : '', updatedAt: nowIso() };
      if (cur) Db.update('core', 'Signatures', cur.id, rec); else Db.insert('core', 'Signatures', Object.assign(rec, { userId: ctx.user.id }));
      Audit.log(ctx.user, 'core', 'signature.save', 'Signature', ctx.user.id, { status: rec.status });
      return Signature.mine(ctx);
    });
  },

  /** sign.list (مدير النظام): التواقيع، بانتظار الاعتماد أولاً */
  list: function () {
    var users = indexBy_(Db.view('core', 'Users'));
    return Db.view('core', 'Signatures').map(function (s) {
      var u = users[s.userId];
      return { id: s.id, userId: s.userId, name: u ? u.fullName : '', data: s.data, status: s.status, updatedAt: s.updatedAt, approvedAt: s.approvedAt || '' };
    }).sort(function (a, b) { return (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
  },

  /** sign.decide (مدير النظام): { id, approve } — الرفض يحذف التوقيع ليعيد صاحبه إضافته */
  decide: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var s = Db.getOrThrow('core', 'Signatures', String(p.id || ''), 'التوقيع');
      if (p.approve) Db.update('core', 'Signatures', s.id, { status: 'approved', approvedBy: ctx.user.id, approvedAt: nowIso() });
      else Db.remove('core', 'Signatures', s.id);
      Audit.log(ctx.user, 'core', p.approve ? 'signature.approve' : 'signature.reject', 'Signature', s.userId, {});
      return Signature.list();
    });
  },

  /** إعادة التحقق عند التوقيع: { method: 'passkey', assertion } أو { method: 'password', password } */
  reauth_: function (ctx, p) {
    if (p.method === 'passkey') {
      var r = Passkeys.verify_(ctx, p.assertion || {});
      Passkeys.touch_(r.key, r.signCount);
      return 'passkey';
    }
    if (p.method !== 'password') throw appError('اختر طريقة التحقق.');
    var u = Db.get('core', 'Users', ctx.user.id);
    if (!u || !Auth.checkPassword_(u, String(p.password || ''))) throw appError('كلمة المرور غير صحيحة.', 'BAD_PASSWORD');
    return 'password';
  },

  /** رمز تحقق قصير يُختم على الملف: يُصدَر قبل الختم ويُطابَق عند الرفع (30 دقيقة) */
  issueCode_: function (userId, key) {
    var code = Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
    CacheService.getScriptCache().put('sign.code:' + userId + ':' + key, code, 1800);
    return code;
  },
  takeCode_: function (userId, key, code) {
    var cache = CacheService.getScriptCache(), k = 'sign.code:' + userId + ':' + key, want = cache.get(k);
    if (!want || want !== String(code || '').toUpperCase()) throw appError('انتهت صلاحية جلسة التوقيع. ابدأ التوقيع من جديد.');
    cache.remove(k);
    return want;
  },

  log_: function (row) { return Db.insert('core', 'SignatureLog', Object.assign({ at: nowIso() }, row)); },

  /** تواقيع سجل: [{ name, at, method, code, version, step }] */
  listFor_: function (module, entityId) {
    var users = indexBy_(Db.view('core', 'Users'));
    return Db.view('core', 'SignatureLog').filter(function (s) { return s.module === module && s.entityId === entityId; })
      .sort(function (a, b) { return (a.at || '').localeCompare(b.at || ''); })
      .map(function (s) { var u = users[s.userId]; return { name: u ? u.fullName : '', at: s.at, method: s.method, code: s.code, version: s.entityVersion, step: s.step || '' }; });
  },

  /** sign.verify: { code } — من وقّع ومتى وعلى أي مستند (لكل مستخدم مسجّل) */
  verify: function (ctx, p) {
    var code = String((p && p.code) || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6,12}$/.test(code)) throw appError('رمز التحقق غير صحيح.');
    var s = Db.view('core', 'SignatureLog').filter(function (x) { return x.code === code; })[0];
    if (!s) return { found: false };
    var u = Db.get('core', 'Users', s.userId), ent = null;
    try { ent = Workflow.host_(s.module).entity_(s.entityId); } catch (e) { ent = null; }
    return { found: true, signer: u ? u.fullName : '', at: s.at, method: s.method, number: ent ? ent.number : '', title: ent ? ent.title : '', version: s.entityVersion, signedSha256: s.signedSha256 };
  }
};
