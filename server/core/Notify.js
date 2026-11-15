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
/** أحداث سجل العمليات بانتظار التحويل إلى إشعارات بعد انتهاء الإجراء الحالي */
var NOTIFY_QUEUE_ = [];
var MAIL_BATCH = 20;

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
    Notify.enqueueMail_(rows, users);
    Notify.prune_();
    return rows;
  },

  /** يضع رسائل البريد في الطابور (لمن له بريد ولم يوقفه) دون إرسال داخل الطلب */
  enqueueMail_: function (rows, users) {
    if (!Notify.mailAvailable_()) return;
    var states = indexBy_(Db.view('core', 'NotifyState'));
    var q = [];
    rows.forEach(function (n) {
      var u = users[n.userId], st = states[n.userId];
      if (!u || !u.email || (st && st.email === false)) return;
      q.push({ to: u.email, title: n.title, detail: n.detail || '', link: n.link || '', actorName: n.actorName || '', createdAt: nowIso(), attempts: 0 });
    });
    if (q.length) Db.insertMany('core', 'MailQueue', q);
  },

  /** يرسل ما في الطابور (حتى max رسالة) ويحذف المرسَل. يعيد عدد المرسَل */
  drainMail_: function (max) {
    if (!Notify.mailAvailable_()) return 0;
    var rows = Db.view('core', 'MailQueue').slice().sort(function (a, b) { return (a.createdAt || '').localeCompare(b.createdAt || ''); }).slice(0, max || MAIL_BATCH);
    if (!rows.length) return 0;
    var sent = {}, failed = {};
    rows.forEach(function (r) {
      try {
        if (MailApp.getRemainingDailyQuota() < 3) return;
        Notify.sendOne_(r);
        sent[r.id] = true;
      } catch (e) { console.error('mail failed: ' + e); failed[r.id] = true; }
    });
    Db.removeWhere('core', 'MailQueue', function (r) { return sent[r.id] || (failed[r.id] && (r.attempts || 0) >= 2); });
    if (Object.keys(failed).length) Db.updateWhere('core', 'MailQueue', function (r) { return failed[r.id] && !sent[r.id] ? { attempts: (r.attempts || 0) + 1 } : null; });
    return Object.keys(sent).length;
  },

  sendOne_: function (n) {
    var url = APP.WEB_URL + '#' + (n.link || '/');
    var esc = function (s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    MailApp.sendEmail({
      to: n.to, name: APP.NAME, subject: n.title + ' — ' + APP.NAME,
      body: n.title + '\n' + (n.detail || '') + '\n\n' + url,
      htmlBody: '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.7;color:#1b1b1b">' +
        '<p style="margin:0 0 6px;font-weight:bold;font-size:17px">' + esc(n.title) + '</p>' +
        (n.detail ? '<p style="margin:0 0 14px;color:#444">' + esc(n.detail) + '</p>' : '') +
        '<a href="' + esc(url) + '" style="display:inline-block;background:#2f6bff;color:#fff;text-decoration:none;padding:9px 18px;border-radius:8px">فتح في البوابة</a>' +
        '<p style="margin:18px 0 0;font-size:12px;color:#888">' + esc(n.actorName ? 'بواسطة ' + n.actorName + ' · ' : '') + 'لإيقاف هذه الرسائل: «ملفي» ← الإشعارات.</p></div>'
    });
  },

  /** احتياط إن لم يُركَّب المشغّل الزمني: استطلاع الإشعارات يصرف ما تأخر في الطابور أكثر من دقيقة */
  drainIfStale_: function () {
    var q = Db.view('core', 'MailQueue');
    if (!q.length) return;
    var oldest = q.reduce(function (a, r) { return !a || r.createdAt < a ? r.createdAt : a; }, '');
    if (Date.now() - new Date(oldest).getTime() > 60000) Notify.drainMail_(5);
  },

  /** حذف الإشعارات الأقدم من 60 يوماً، مرة كل 12 ساعة */
  prune_: function () {
    var cache = CacheService.getScriptCache();
    if (cache.get('notify.pruned')) return;
    cache.put('notify.pruned', '1', 43200);
    var limit = new Date(Date.now() - NOTIFY_KEEP_DAYS * 86400000).toISOString();
    Db.removeWhere('core', 'Notifications', function (n) { return (n.createdAt || '') < limit; });
  },

  /** يُستدعى من Audit.log: يصطفّ الحدث ليُعالَج بعد انتهاء الإجراء (خارج القفل وبعد اكتمال الكتابة) */
  queue_: function (user, module, action, entity, entityId, details) {
    if (!user || !module || module === 'core' || module === 'system') return;
    NOTIFY_QUEUE_.push({ user: user, module: module, action: action, entity: entity, entityId: entityId, details: details || {} });
  },

  /** يُسقط ما اصطفّ في طلب فشل */
  discard_: function () { NOTIFY_QUEUE_.length = 0; },

  /** يصرف طابور الأحداث. يُستدعى من الموجّه بعد كل طلب */
  flush_: function () {
    if (!NOTIFY_QUEUE_.length) return;
    var batch = NOTIFY_QUEUE_.splice(0, NOTIFY_QUEUE_.length);
    batch.forEach(function (ev) {
      try { Notify.onAudit_(ev.user, ev.module, ev.action, ev.entity, ev.entityId, ev.details); }
      catch (e) { console.error('notify ' + ev.module + '.' + ev.action + ': ' + (e.stack || e)); }
    });
  },

  onAudit_: function (user, module, action, entity, entityId, details) {
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
    // «بانتظار قرارك»: للإجراءات التي قد تضع عنصراً في الصندوق فقط، ولمن يُحتمل أن يراه فقط
    if (p.inbox && entityId && (!p.approvalActions || p.approvalActions.indexOf(action) >= 0)) items = items.concat(Notify.approvals_(user, p, entityId, entity));
    if (items.length) Notify.push_(user, items);
  },

  /** المستخدمون النشطون بدور من الأدوار في وحدة (ومديرو النظام دائماً) */
  usersWithRole_: function (module, roles) {
    var out = {};
    Db.view('core', 'Users').forEach(function (u) { if (u.active && u.isSuperAdmin) out[u.id] = true; });
    Db.view('core', 'UserRoles').forEach(function (r) { if (r.module === module && (!roles || roles.indexOf(r.role) >= 0)) out[r.userId] = true; });
    return Object.keys(out);
  },

  /** حسابات سلسلة مديري موظف (المباشر فمن فوقه) */
  managerChainUsers_: function (empId) {
    var out = [], seen = {}, depts = indexBy_(Staff.depts_()), emps = indexBy_(Staff.all_());
    var cur = emps[empId];
    for (var i = 0; cur && i < 10; i++) {
      var mid = Staff.managerIdOf_(cur, depts);
      if (!mid || seen[mid]) break;
      seen[mid] = true;
      var m = emps[mid];
      if (m && m.userId && m.status !== 'terminated') out.push(m.userId);
      cur = m;
    }
    return out;
  },

  /** من صار لديه في صندوق الموافقات عنصر مرتبط بالسجل entityId (يُبنى الصندوق للمرشّحين فقط) */
  approvals_: function (actor, provider, entityId, entity) {
    var out = [];
    var candidates = provider.approvers ? provider.approvers(entityId, entity) : Notify.usersWithRole_(provider.key);
    var users = indexBy_(Db.view('core', 'Users')), done = {};
    candidates.forEach(function (uid) {
      var u = users[uid];
      if (!u || !u.active || uid === actor.id || done[uid]) return;
      done[uid] = true;
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
    try { Notify.drainIfStale_(); } catch (e) { console.error('mail drain: ' + e); }
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
