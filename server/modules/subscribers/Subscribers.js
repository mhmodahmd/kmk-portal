/**
 * وحدة متابعة المشتركين (0.11.0 — المرحلة 1): docs/04 §7ج
 *
 * - مصدر الحقيقة كشف البوابة الشهري المستورد في المنصات. هذه الوحدة لا تكتب في المنصات، وتقرأ مبيعاتها.
 * - بيانات التواصل (الاسم والجوال والبريد) تصل في الذاكرة من استيراد المنصات (onPlatformImport_) وتُحفظ هنا مشفّرة
 *   (sealText_ بمفتاح SUB_DATA_KEY في Script Properties). العرض مقنّع، والإظهار والتصدير يُسجَّلان في Audit.
 * - الدورة = شراء اشتراك. نتيجتها: جدّد (شراء جديد للمشتري نفسه حتى نهاية شهر الانتهاء، أي في كشف ذلك الشهر)،
 *   أو بانتظار كشف شهر الانتهاء، أو لم يجدد بعد استيراد ذلك الكشف دون شراء. لا مهلة بالأيام (قرار المستخدم).
 * - حالة المشترك من آخر دورة: سارٍ، ينتهي خلال 7 أيام، لم يجدد (بانتظار الكشف)، لم يجدد.
 * - الاحتفاظ: تُمسح بيانات التواصل بعد 24 شهراً بلا شراء، ويبقى الرمز والإحصاءات بلا هوية.
 */
var SUB_SCHEMA = {
  Subscribers: [
    ['id', 'text'], ['platformId', 'text'], ['buyerKey', 'text'], ['nameEnc', 'text'], ['mobileEnc', 'text'], ['emailEnc', 'text'],
    ['mobileMask', 'text'], ['emailMask', 'text'], ['country', 'text'], ['optOut', 'bool'], ['optOutAt', 'ts'], ['optOutReason', 'text'],
    ['assignedTo', 'text'], ['notes', 'text'], ['forgottenAt', 'ts'], ['createdAt', 'ts'], ['updatedAt', 'ts']
  ],
  Config: [['id', 'text'], ['key', 'text'], ['value', 'json'], ['updatedBy', 'text'], ['updatedAt', 'ts']]
};

var SUB = {
  STATUS: { active: 'سارٍ', expiring: 'ينتهي خلال 7 أيام', pending: 'لم يجدد — بانتظار الكشف', lapsed: 'لم يجدد' },
  OUTCOME: { open: 'سارية', renewed: 'جدّد', pending: 'بانتظار كشف شهر الانتهاء', lapsed: 'لم يجدد' },
  EXPIRING_DAYS: 7,
  RETENTION_MONTHS: 24
};

var Subscribers = {
  rows_: function (t) { return Db.view('subscribers', t); },
  isMgr_: function (ctx) { return Permissions.has(ctx, 'subscribers', ['manager']); },
  isStaff_: function (ctx) { return Permissions.has(ctx, 'subscribers', ['manager', 'agent']); },

  key_: function () {
    var props = PropertiesService.getScriptProperties();
    var k = props.getProperty('SUB_DATA_KEY');
    if (!k) { k = randomToken_(); props.setProperty('SUB_DATA_KEY', k); }
    return k;
  },
  open_: function (v, key) { try { return openText_(v, key); } catch (e) { return ''; } },

  maskMobile_: function (m) { var d = String(m || '').replace(/\D/g, ''); return d ? (d.length > 2 ? new Array(Math.min(d.length - 2, 6) + 1).join('•') + d.slice(-2) : '••') : ''; },
  maskEmail_: function (e) { var s = String(e || ''), i = s.indexOf('@'); return i > 0 ? s.charAt(0) + '•••' + s.slice(i) : ''; },

  config_: function () {
    var out = { retentionMonths: SUB.RETENTION_MONTHS, renewalLink: '' };
    Subscribers.rows_('Config').forEach(function (r) { if (r.key === 'settings' && r.value) Object.assign(out, r.value); });
    return out;
  },

  // ───────── واجهة عامة: تستدعيها المنصات عند الاستيراد ─────────
  /**
   * contacts: [{ buyerKey, name, mobile, email, country }] لعمليات الاشتراك في الملف (الجديدة والمكررة).
   * يحفظها مشفّرة ولا يمس من حُذفت بياناته بطلبه. يعيد عدد المشتركين المحدَّثين.
   */
  onPlatformImport_: function (ctx, platform, contacts) {
    if (!contacts || !contacts.length) return 0;
    var key = Subscribers.key_(), existing = {}, latest = {};
    Db.all('subscribers', 'Subscribers').forEach(function (s) { if (s.platformId === platform.id) existing[s.buyerKey] = s; });
    contacts.forEach(function (c) { if (c.buyerKey) latest[c.buyerKey] = c; });
    var inserts = [], updates = {}, now = nowIso();
    Object.keys(latest).forEach(function (k) {
      var c = latest[k], cur = existing[k];
      var rec = {
        nameEnc: c.name ? sealText_(c.name, key) : '', mobileEnc: c.mobile ? sealText_(c.mobile, key) : '', emailEnc: c.email ? sealText_(c.email, key) : '',
        mobileMask: Subscribers.maskMobile_(c.mobile), emailMask: Subscribers.maskEmail_(c.email), country: c.country || '', updatedAt: now
      };
      if (!cur) inserts.push(Object.assign(rec, { platformId: platform.id, buyerKey: k, optOut: false, assignedTo: '', notes: '', forgottenAt: '', createdAt: now }));
      else if (!cur.forgottenAt) {
        // لا يُمسح ما هو موجود إن جاء الحقل فارغاً في الملف الجديد
        if (!c.name) delete rec.nameEnc;
        if (!c.mobile) { delete rec.mobileEnc; delete rec.mobileMask; }
        if (!c.email) { delete rec.emailEnc; delete rec.emailMask; }
        updates[cur.id] = rec;
      }
    });
    if (inserts.length) Db.insertMany('subscribers', 'Subscribers', inserts);
    var n = Object.keys(updates).length;
    if (n) Db.updateWhere('subscribers', 'Subscribers', function (r) { return updates[r.id] || null; });
    if (inserts.length || n) Audit.log(ctx.user, 'subscribers', 'contacts.import', 'Platform', platform.id, { platform: platform.name, added: inserts.length, updated: n });
    return inserts.length + n;
  },

  // ───────── النموذج: الدورات والحالات من مبيعات المنصات ─────────
  nextMonth_: function (m) { var p = m.split('-').map(Number); return p[1] === 12 ? (p[0] + 1) + '-01' : p[0] + '-' + (p[1] < 9 ? '0' : '') + (p[1] + 1); },

  /** { buyers: { buyerKey: { cycles, status, … } }, lastMonth, today } لمنصة (أو كل المنصات) */
  model_: function (platformId) {
    var today = localDate_(), sales = Db.view('platforms', 'Sales').filter(function (s) { return !platformId || s.platformId === platformId; });
    var lastMonth = {}, byBuyer = {};
    sales.forEach(function (s) { if (!lastMonth[s.platformId] || s.month > lastMonth[s.platformId]) lastMonth[s.platformId] = s.month; });
    sales.filter(function (s) { return s.kind === 'subscription' && s.buyerKey && s.expiresAt; })
      .forEach(function (s) { (byBuyer[s.platformId + '|' + s.buyerKey] = byBuyer[s.platformId + '|' + s.buyerKey] || []).push(s); });
    var buyers = {};
    Object.keys(byBuyer).forEach(function (k) {
      var list = byBuyer[k].sort(function (a, b) { return a.paidAt.localeCompare(b.paidAt) || a.gatewayId.localeCompare(b.gatewayId); });
      var L = lastMonth[list[0].platformId];
      var cycles = list.map(function (s, i) {
        var next = list[i + 1], expMonth = s.expiresAt.slice(0, 7), outcome;
        if (next && next.month <= expMonth) outcome = 'renewed';
        else if (s.expiresAt >= today) outcome = 'open';
        else if (L < expMonth) outcome = 'pending';
        else outcome = 'lapsed';
        return { gatewayId: s.gatewayId, packageId: s.packageId, paidAt: s.paidAt, expiresAt: s.expiresAt, amount: s.amount, expMonth: expMonth, outcome: outcome, waitFor: outcome === 'pending' ? expMonth : '' };
      });
      var last = cycles[cycles.length - 1], status;
      if (last.outcome === 'pending') status = 'pending';
      else if (last.outcome === 'lapsed') status = 'lapsed';
      else status = daysBetween_(today, last.expiresAt) <= SUB.EXPIRING_DAYS ? 'expiring' : 'active';
      buyers[k] = {
        platformId: list[0].platformId, buyerKey: list[0].buyerKey, cycles: cycles, status: status, packageId: last.packageId, expiresAt: last.expiresAt,
        lastPaidAt: last.paidAt, firstPaidAt: cycles[0].paidAt, purchases: cycles.length, totalPaid: cycles.reduce(function (t, c) { return t + c.amount; }, 0),
        winback: cycles.slice(0, -1).some(function (c) { return c.outcome === 'lapsed'; }), waitFor: last.waitFor,
        daysLeft: last.expiresAt >= today ? daysBetween_(today, last.expiresAt) : null
      };
    });
    return { buyers: buyers, lastMonth: lastMonth, today: today };
  },

  /** مسح بيانات تواصل من مضى على آخر شراء لهم أكثر من مدة الاحتفاظ (مرة يومياً) */
  retention_: function (model) {
    var cache = CacheService.getScriptCache();
    if (cache.get('sub.retention')) return;
    cache.put('sub.retention', '1', 86400);
    var months = Subscribers.config_().retentionMonths || SUB.RETENTION_MONTHS;
    var d = new Date(Date.now() + KW_OFFSET_MS);
    d.setUTCMonth(d.getUTCMonth() - months);
    var cutoff = d.toISOString().slice(0, 10), now = nowIso(), n = 0;
    Db.updateWhere('subscribers', 'Subscribers', function (r) {
      var b = model.buyers[r.platformId + '|' + r.buyerKey];
      if (r.forgottenAt || !b || b.lastPaidAt.slice(0, 10) >= cutoff) return null;
      n++;
      return { nameEnc: '', mobileEnc: '', emailEnc: '', mobileMask: '', emailMask: '', forgottenAt: now, updatedAt: now };
    });
    if (n) Audit.log({ id: '', fullName: 'النظام' }, 'subscribers', 'retention.forget', 'Subscriber', '', { count: n, months: months });
  },

  pkgNames_: function () { var o = {}; Db.view('platforms', 'Packages').forEach(function (p) { o[p.id] = p.name; }); return o; },

  /** صف عرض: يجمع النموذج وسجل التواصل. الاسم يُفك لموظفي المتابعة فقط */
  view_: function (b, rec, ctx, pk, key, users) {
    var staff = Subscribers.isStaff_(ctx);
    return {
      id: rec ? rec.id : '', ref: b.platformId + '|' + b.buyerKey, platformId: b.platformId, status: b.status, statusLabel: SUB.STATUS[b.status],
      packageId: b.packageId, packageName: pk[b.packageId] || '', expiresAt: b.expiresAt, daysLeft: b.daysLeft, waitFor: b.waitFor,
      lastPaidAt: b.lastPaidAt, firstPaidAt: b.firstPaidAt, purchases: b.purchases, totalPaid: b.totalPaid, winback: b.winback,
      name: staff && rec && !rec.forgottenAt ? Subscribers.open_(rec.nameEnc, key) : '',
      mobileMask: rec ? rec.mobileMask || '' : '', emailMask: rec ? rec.emailMask || '' : '', hasContact: !!(rec && (rec.mobileEnc || rec.emailEnc)),
      country: rec && rec.country ? Platforms.countryLabel_(rec.country) : '', optOut: !!(rec && rec.optOut), forgotten: !!(rec && rec.forgottenAt),
      assignedTo: rec ? rec.assignedTo || '' : '', assignedName: rec && rec.assignedTo && users[rec.assignedTo] ? users[rec.assignedTo].fullName : ''
    };
  },

  /** موظف المتابعة يرى المسندين إليه وغير المسندين، والمدير الكل */
  canSee_: function (ctx, rec) { return Subscribers.isMgr_(ctx) || !rec || !rec.assignedTo || rec.assignedTo === ctx.user.id; },

  records_: function () { var o = {}; Subscribers.rows_('Subscribers').forEach(function (r) { o[r.platformId + '|' + r.buyerKey] = r; }); return o; },

  platformOf_: function (v) {
    if (!v || v === 'all') return '';
    var p = Db.view('platforms', 'Platforms').filter(function (x) { return x.key === v || x.id === v; })[0];
    if (!p) throw appError('المنصة غير موجودة.', 'NOT_FOUND');
    return p.id;
  },

  // ───────── القراءة ─────────
  lookups: function (ctx) {
    return {
      isManager: Subscribers.isMgr_(ctx), isStaff: Subscribers.isStaff_(ctx), today: localDate_(),
      statuses: Object.keys(SUB.STATUS).map(function (k) { return { id: k, label: SUB.STATUS[k] }; }),
      packages: Db.view('platforms', 'Packages').filter(function (p) { return p.kind === 'subscription'; }).map(function (p) { return { id: p.id, name: p.name }; }),
      platforms: Db.view('platforms', 'Platforms').filter(function (p) { return p.hasAppSales; }).map(function (p) { return { id: p.id, key: p.key, name: p.name }; }),
      people: Subscribers.isMgr_(ctx) ? Db.view('core', 'Users').filter(function (u) { return u.active; }).map(function (u) { return { id: u.id, name: u.fullName }; }) : [],
      settings: Subscribers.isMgr_(ctx) ? Subscribers.config_() : null
    };
  },

  /** اللوحة (كل الأدوار، أرقام فقط): الحالات، التغطية، نسبة التجديد لكل شهر انتهاء، وحسب الباقة */
  dashboard: function (ctx, p) {
    p = p || {};
    var pf = Subscribers.platformOf_(p.platform), m = Subscribers.model_(pf);
    try { Subscribers.retention_(m); } catch (e) { console.error('sub retention: ' + e); }
    var recs = Subscribers.records_(), pk = Subscribers.pkgNames_();
    var counts = { active: 0, expiring: 0, pending: 0, lapsed: 0 }, cover = { total: 0, withContact: 0, withMobile: 0, withEmail: 0, optOut: 0, winback: 0 };
    var byPkg = {}, byMonth = {};
    Object.keys(m.buyers).forEach(function (k) {
      var b = m.buyers[k], r = recs[k];
      counts[b.status]++;
      cover.total++;
      if (r && !r.forgottenAt && (r.mobileEnc || r.emailEnc)) cover.withContact++;
      if (r && r.mobileEnc) cover.withMobile++;
      if (r && r.emailEnc) cover.withEmail++;
      if (r && r.optOut) cover.optOut++;
      if (b.winback && (b.status === 'active' || b.status === 'expiring')) cover.winback++;
      var x = byPkg[b.packageId] = byPkg[b.packageId] || { packageId: b.packageId, name: pk[b.packageId] || '', active: 0, expiring: 0, pending: 0, lapsed: 0 };
      x[b.status]++;
      b.cycles.forEach(function (c) {
        if (c.outcome === 'open') return;
        var y = byMonth[c.expMonth] = byMonth[c.expMonth] || { month: c.expMonth, total: 0, renewed: 0, pending: 0, lapsed: 0 };
        y.total++; y[c.outcome]++;
      });
    });
    var lastMonth = Object.keys(m.lastMonth).map(function (k) { return m.lastMonth[k]; }).sort().pop() || '';
    // الأشهر التي انتهت أو الجارية فقط: الأشهر القادمة لم تنتهِ دوراتها بعد
    var curMonth = m.today.slice(0, 7);
    var months = Object.keys(byMonth).filter(function (k) { return k <= curMonth; }).sort().slice(-12).map(function (k) {
      var y = byMonth[k];
      y.rate = y.total ? Math.round(y.renewed * 1000 / y.total) / 10 : null;
      y.final = !!lastMonth && lastMonth >= k;
      return y;
    });
    return {
      today: m.today, lastMonth: lastMonth, counts: counts, coverage: cover,
      byPackage: Object.keys(byPkg).map(function (k) { return byPkg[k]; }),
      renewal: months
    };
  },

  /** القائمة (موظف المتابعة والمدير): status, packageId, expMonth (شهر انتهاء الدورة الأخيرة), q, assigned ('me'|'none'|userId) */
  list: function (ctx, p) {
    p = p || {};
    var pf = Subscribers.platformOf_(p.platform), m = Subscribers.model_(pf), recs = Subscribers.records_(), pk = Subscribers.pkgNames_();
    var key = Subscribers.key_(), users = indexBy_(Db.view('core', 'Users')), q = String(p.q || '').trim().toLowerCase().replace(/\s/g, '');
    var out = [];
    Object.keys(m.buyers).forEach(function (k) {
      var b = m.buyers[k], r = recs[k];
      if (!Subscribers.canSee_(ctx, r)) return;
      if (p.status && b.status !== p.status) return;
      if (p.packageId && b.packageId !== p.packageId) return;
      if (p.expMonth && b.expiresAt.slice(0, 7) !== p.expMonth) return;
      if (p.assigned === 'me' && (!r || r.assignedTo !== ctx.user.id)) return;
      if (p.assigned === 'none' && r && r.assignedTo) return;
      var v = Subscribers.view_(b, r, ctx, pk, key, users);
      if (q) {
        var hay = (v.name + ' ' + (r && !r.forgottenAt ? Subscribers.open_(r.mobileEnc, key) + ' ' + Subscribers.open_(r.emailEnc, key) : '')).toLowerCase().replace(/\s/g, '');
        if (hay.indexOf(q) < 0) return;
      }
      out.push(v);
    });
    var order = { expiring: 0, pending: 1, lapsed: 2, active: 3 };
    return out.sort(function (a, b) { return order[a.status] - order[b.status] || a.expiresAt.localeCompare(b.expiresAt); });
  },

  find_: function (ctx, ref) {
    var parts = String(ref || '').split('|');
    var m = Subscribers.model_(parts[0]), b = m.buyers[String(ref)];
    var rec = Subscribers.rows_('Subscribers').filter(function (r) { return r.platformId === parts[0] && r.buyerKey === parts[1]; })[0] || null;
    if (!b || !Subscribers.canSee_(ctx, rec)) throw appError('المشترك غير موجود.', 'NOT_FOUND');
    return { b: b, rec: rec };
  },

  get: function (ctx, p) {
    var f = Subscribers.find_(ctx, (p || {}).ref), pk = Subscribers.pkgNames_();
    var v = Subscribers.view_(f.b, f.rec, ctx, pk, Subscribers.key_(), indexBy_(Db.view('core', 'Users')));
    v.notes = f.rec ? f.rec.notes || '' : '';
    v.optOutAt = f.rec ? f.rec.optOutAt || '' : '';
    v.optOutReason = f.rec ? f.rec.optOutReason || '' : '';
    v.cycles = f.b.cycles.slice().reverse().map(function (c) {
      return { gatewayId: c.gatewayId, packageName: pk[c.packageId] || '', paidAt: c.paidAt, expiresAt: c.expiresAt, amount: c.amount, outcome: c.outcome, outcomeLabel: SUB.OUTCOME[c.outcome], waitFor: c.waitFor };
    });
    return v;
  },

  /** إظهار الجوال والبريد كاملين — يُسجَّل في سجل العمليات */
  reveal: function (ctx, p) {
    var f = Subscribers.find_(ctx, (p || {}).ref);
    if (!f.rec || f.rec.forgottenAt) throw appError('لا بيانات تواصل محفوظة لهذا المشترك.');
    var key = Subscribers.key_();
    Audit.log(ctx.user, 'subscribers', 'reveal', 'Subscriber', f.rec.id, { mobile: f.rec.mobileMask, email: f.rec.emailMask });
    return { name: Subscribers.open_(f.rec.nameEnc, key), mobile: Subscribers.open_(f.rec.mobileEnc, key), email: Subscribers.open_(f.rec.emailEnc, key) };
  },

  // ───────── التعديل ─────────
  recOrThrow_: function (f) {
    if (!f.rec) throw appError('لا سجل تواصل لهذا المشترك بعد. أعد رفع ملف البوابة الذي فيه عملياته.');
    return f.rec;
  },

  note: function (ctx, p) {
    return withLock(function () {
      var rec = Subscribers.recOrThrow_(Subscribers.find_(ctx, (p || {}).ref));
      Db.update('subscribers', 'Subscribers', rec.id, { notes: optionalText(p.notes, 2000), updatedAt: nowIso() });
      Audit.log(ctx.user, 'subscribers', 'note', 'Subscriber', rec.id, { mobile: rec.mobileMask });
      return { ok: true };
    });
  },

  optout: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var rec = Subscribers.recOrThrow_(Subscribers.find_(ctx, p.ref)), on = p.optOut == null ? true : bool_(p.optOut);
      Db.update('subscribers', 'Subscribers', rec.id, { optOut: on, optOutAt: on ? nowIso() : '', optOutReason: on ? optionalText(p.reason, 200) : '', updatedAt: nowIso() });
      Audit.log(ctx.user, 'subscribers', on ? 'optout' : 'optin', 'Subscriber', rec.id, { mobile: rec.mobileMask, reason: p.reason || '' });
      return { optOut: on };
    });
  },

  assign: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var to = p.userId ? String(p.userId) : '';
      if (to) { var u = Db.get('core', 'Users', to); if (!u || !u.active) throw appError('المستخدم غير موجود.'); }
      var refs = (p.refs || []).map(String), n = 0, changes = {};
      refs.forEach(function (ref) { var rec = Subscribers.recOrThrow_(Subscribers.find_(ctx, ref)); changes[rec.id] = { assignedTo: to, updatedAt: nowIso() }; n++; });
      if (n) Db.updateWhere('subscribers', 'Subscribers', function (r) { return changes[r.id] || null; });
      Audit.log(ctx.user, 'subscribers', 'assign', 'Subscriber', '', { count: n, to: to });
      return { assigned: n };
    });
  },

  /** حذف بيانات مشترك بطلبه: تُمسح الحقول المشفّرة ويبقى الرمز والإحصاءات */
  forget: function (ctx, p) {
    return withLock(function () {
      var rec = Subscribers.recOrThrow_(Subscribers.find_(ctx, (p || {}).ref));
      Db.update('subscribers', 'Subscribers', rec.id, { nameEnc: '', mobileEnc: '', emailEnc: '', mobileMask: '', emailMask: '', notes: '', forgottenAt: nowIso(), updatedAt: nowIso() });
      Audit.log(ctx.user, 'subscribers', 'forget', 'Subscriber', rec.id, { mobile: rec.mobileMask });
      return { forgotten: true };
    });
  },

  /** تنزيل قائمة (المدير): status, expMonth — بيانات كاملة، ويُسجَّل */
  exportList: function (ctx, p) {
    p = p || {};
    var rows = Subscribers.list(ctx, p), recs = Subscribers.records_(), key = Subscribers.key_();
    var out = rows.map(function (v) {
      var r = recs[v.ref], ok = r && !r.forgottenAt;
      return {
        name: v.name, mobile: ok ? Subscribers.open_(r.mobileEnc, key) : '', email: ok ? Subscribers.open_(r.emailEnc, key) : '', country: v.country,
        packageName: v.packageName, expiresAt: v.expiresAt, statusLabel: v.statusLabel, purchases: v.purchases, optOut: v.optOut
      };
    });
    Audit.log(ctx.user, 'subscribers', 'export', 'Subscriber', '', { count: out.length, status: p.status || '', month: p.expMonth || '' });
    return out;
  },

  settingsSave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var link = optionalText(p.renewalLink, 300);
      if (link && !/^https:\/\/\S+$/.test(link)) throw appError('رابط التجديد يجب أن يبدأ بـ https://');
      var next = { renewalLink: link, retentionMonths: intIn_(p.retentionMonths == null || p.retentionMonths === '' ? SUB.RETENTION_MONTHS : p.retentionMonths, 6, 120, 'مدة الاحتفاظ بالأشهر') };
      var cur = Db.all('subscribers', 'Config').filter(function (r) { return r.key === 'settings'; })[0];
      if (cur) Db.update('subscribers', 'Config', cur.id, { value: next, updatedBy: ctx.user.id, updatedAt: nowIso() });
      else Db.insert('subscribers', 'Config', { key: 'settings', value: next, updatedBy: ctx.user.id, updatedAt: nowIso() });
      Audit.log(ctx.user, 'subscribers', 'settings.update', 'Config', 'settings', next);
      return next;
    });
  },

  routes_: function () {
    var any = { module: 'subscribers' }, staff = { module: 'subscribers', roles: ['manager', 'agent'] }, mgr = { module: 'subscribers', roles: ['manager'] };
    return {
      'sub.lookups': { perm: any, fn: Subscribers.lookups },
      'sub.dashboard': { perm: any, fn: Subscribers.dashboard },
      'sub.list': { perm: staff, fn: Subscribers.list },
      'sub.get': { perm: staff, fn: Subscribers.get },
      'sub.reveal': { perm: staff, fn: Subscribers.reveal },
      'sub.note': { perm: staff, fn: Subscribers.note },
      'sub.optout': { perm: staff, fn: Subscribers.optout },
      'sub.assign': { perm: mgr, fn: Subscribers.assign },
      'sub.forget': { perm: mgr, fn: Subscribers.forget },
      'sub.export': { perm: mgr, fn: Subscribers.exportList },
      'sub.settings.save': { perm: mgr, fn: Subscribers.settingsSave }
    };
  }
};
