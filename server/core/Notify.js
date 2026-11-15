/**
 * الإشعارات.
 *
 * تُبنى من سجل العمليات (Audit.log ← Notify.onAudit_)، ولا تُسقط الإجراء أبداً إن فشلت. نوعان:
 *  1) «بانتظار قرارك»: بعد كل حدث في وحدة، من ظهر في صندوق موافقاته عنصر جديد مرتبط بالحدث يُبلَّغ.
 *     تُستخدم قواعد inbox_ نفسها، فلا يتكرر منطق الصلاحيات. المفتاح (refKey) يمنع التكرار لنفس المرحلة.
 *  2) أحداث تخص شخصاً (اعتُمد طلبك، أُسندت إليك مهمة…): كل وحدة تعلن notify_(ev) في ModuleProviders_
 *     وتعيد [{ to: userId|[userIds], title, detail, link }]. لا يُبلَّغ من قام بالإجراء.
 *
 * القنوات: داخل البوابة (الجرس)، وتنبيه المتصفح (من الواجهة)، والبريد إن منح المالك صلاحية الإرسال
 * (authorizeMail) وكان للمستخدم بريد ولم يوقفه من «ملفي».
 * العناوين جمل ثابتة تُترجم في الواجهة؛ التفاصيل (detail) بيانات.
 */
var NOTIFY_KEEP_DAYS = 60;
var NOTIFY_MAIL_OK_;

/** شغّلها من المحرر مرة واحدة (حساب المالك) لمنح صلاحية إرسال البريد. */
function authorizeMail() {
  var left = MailApp.getRemainingDailyQuota();
  Logger.log('البريد جاهز. المتبقي اليوم: ' + left);
  return left;
}

var Notify = {
  mailAvailable_: function () {
    if (NOTIFY_MAIL_OK_ !== undefined) return NOTIFY_MAIL_OK_;
    try { MailApp.getRemainingDailyQuota(); NOTIFY_MAIL_OK_ = true; } catch (e) { NOTIFY_MAIL_OK_ = false; }
    return NOTIFY_MAIL_OK_;
  },

  state_: function (userId) {
    return Db.get('core', 'NotifyState', userId) || { id: userId, readUntil: '', email: true };
  },

  saveState_: function (userId, changes) {
    var cur = Db.get('core', 'NotifyState', userId);
    var next = Object.assign({ readUntil: '', email: true }, cur || {}, changes, { updatedAt: nowIso() });
    if (cur) Db.update('core', 'NotifyState', userId, next);
    else Db.insert('core', 'NotifyState', Object.assign(next, { id: userId }));
    return next;
  },

  /** يخزّن الإشعارات ويرسل البريد. items: [{ userId, kind, title, detail, link, refKey }] */
  push_: function (actor, items) {
    var users = indexBy_(Db.view('core', 'Users'));
    var seen = {};
    Db.view('core', 'Notifications').forEach(function (n) { if (n.refKey) seen[n.userId + '|' + n.refKey] = true; });
    var rows = [];
    items.forEach(function (it) {
      var u = users[it.userId];
      if (!u || !u.active || (actor && it.userId === actor.id)) return;
      var key = it.userId + '|' + (it.refKey || (it.title + '|' + (it.detail || '')));
      if (seen[key]) return;
      seen[key] = true;
      rows.push({
        userId: it.userId, kind: it.kind || 'event', module: it.module || '', title: it.title, detail: it.detail || '', link: it.link || '',
        refKey: it.refKey || '', read: false, actorName: actor ? actor.fullName : '', createdAt: nowIso(), emailedAt: ''
      });
    });
    if (!rows.length) return [];
    Db.insertMany('core', 'Notifications', rows);
    Notify.mail_(rows, users);
    Notify.prune_();
    return rows;
  },

  mail_: function (rows, users) {
    if (!Notify.mailAvailable_()) return;
    rows.forEach(function (n) {
      var u = users[n.userId];
      if (!u || !u.email || !Notify.state_(n.userId).email) return;
      try {
        if (MailApp.getRemainingDailyQuota() < 3) return;
        var url = APP.WEB_URL + '#' + (n.link || '/');
        var esc = function (s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
        MailApp.sendEmail({
          to: u.email, name: APP.NAME, subject: n.title + ' — ' + APP.NAME,
          body: n.title + '\n' + (n.detail || '') + '\n\n' + url,
          htmlBody: '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.7;color:#1b1b1b">' +
            '<p style="margin:0 0 6px;font-weight:bold;font-size:17px">' + esc(n.title) + '</p>' +
            (n.detail ? '<p style="margin:0 0 14px;color:#444">' + esc(n.detail) + '</p>' : '') +
            '<a href="' + esc(url) + '" style="display:inline-block;background:#2f6bff;color:#fff;text-decoration:none;padding:9px 18px;border-radius:8px">فتح في البوابة</a>' +
            '<p style="margin:18px 0 0;font-size:12px;color:#888">' + esc(n.actorName ? 'بواسطة ' + n.actorName + ' · ' : '') + 'لإيقاف هذه الرسائل: «ملفي» ← الإشعارات.</p></div>'
        });
      } catch (e) { console.error('mail failed: ' + e); }
    });
  },

  /** حذف الإشعارات الأقدم من 60 يوماً، مرة كل 12 ساعة */
  prune_: function () {
    var cache = CacheService.getScriptCache();
    if (cache.get('notify.pruned')) return;
    cache.put('notify.pruned', '1', 43200);
    var limit = new Date(Date.now() - NOTIFY_KEEP_DAYS * 86400000).toISOString();
    Db.removeWhere('core', 'Notifications', function (n) { return (n.createdAt || '') < limit; });
  },

  /** يُستدعى من Audit.log بعد كل عملية */
  onAudit_: function (user, module, action, entity, entityId, details) {
    if (!user || !module || module === 'core' || module === 'system') return;
    try {
      var p = ModuleProviders_().filter(function (x) { var m = moduleDef_(x.key); return x.key === module && m && m.enabled; })[0];
      if (!p) return;
      var items = [];
      if (p.notify) {
        (p.notify({ actor: user, action: action, entity: entity, id: entityId, details: details || {} }) || []).forEach(function (n) {
          [].concat(n.to || []).forEach(function (uid) {
            if (uid) items.push({ userId: uid, kind: 'event', module: module, title: n.title, detail: n.detail, link: n.link, refKey: n.refKey ? n.refKey : '' });
          });
        });
      }
      if (p.inbox && entityId) items = items.concat(Notify.approvals_(user, p, entityId));
      if (items.length) Notify.push_(user, items);
    } catch (e) {
      console.error('notify ' + module + '.' + action + ': ' + (e.stack || e));
    }
  },

  /** من صار لديه في صندوق الموافقات عنصر مرتبط بالسجل entityId */
  approvals_: function (actor, provider, entityId) {
    var out = [];
    Db.view('core', 'Users').forEach(function (u) {
      if (!u.active || u.id === actor.id) return;
      var ctx = { user: u, roles: Permissions.rolesOf(u.id), token: '' };
      if (!Permissions.has(ctx, provider.key)) return;
      var list;
      try { list = provider.inbox(ctx) || []; } catch (e) { return; }
      list.forEach(function (it) {
        if (it.refId !== entityId) return;
        out.push({
          userId: u.id, kind: 'approval', module: provider.key, title: 'بانتظار قرارك: ' + it.moduleLabel,
          detail: it.title + (it.who ? ' · ' + it.who : ''), link: it.link || '/inbox',
          refKey: 'inbox:' + it.id + ':' + (it.createdAt || '') + ':' + (it.status || '')
        });
      });
    });
    return out;
  },

  // ───────── المسارات ─────────
  view_: function (n, readUntil) {
    return {
      id: n.id, kind: n.kind, module: n.module, title: n.title, detail: n.detail, link: n.link, actorName: n.actorName, createdAt: n.createdAt,
      read: !!n.read || (!!readUntil && n.createdAt <= readUntil)
    };
  },

  list: function (ctx, p) {
    var st = Notify.state_(ctx.user.id), limit = Math.min(Math.max(Number(p && p.limit) || 30, 1), 100);
    // الأحدث أولاً، وعند تساوي الوقت فالأحدث إدراجاً
    var mine = Db.view('core', 'Notifications').filter(function (n) { return n.userId === ctx.user.id; }).reverse()
      .sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    var views = mine.map(function (n) { return Notify.view_(n, st.readUntil); });
    return {
      items: views.slice(0, limit),
      unread: views.filter(function (v) { return !v.read; }).length,
      email: { on: st.email !== false, available: Notify.mailAvailable_(), address: ctx.user.email || '' }
    };
  },

  /** { id } لإشعار واحد، أو { all: true } للكل */
  read: function (ctx, p) {
    p = p || {};
    if (p.all) { Notify.saveState_(ctx.user.id, { readUntil: nowIso() }); return true; }
    var n = Db.get('core', 'Notifications', p.id);
    if (!n || n.userId !== ctx.user.id) throw appError('الإشعار غير موجود.', 'NOT_FOUND');
    if (!n.read) Db.update('core', 'Notifications', n.id, { read: true });
    return true;
  },

  prefs: function (ctx, p) {
    var s = Notify.saveState_(ctx.user.id, { email: bool_(p && p.email) });
    return { email: s.email !== false };
  }
};
