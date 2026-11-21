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
 *
 * المتابعة والتواصل (0.12.0):
 * - سجل التواصل (Messages): كل تواصل بقناته ومن قام به (أو آلي) وحالة الرد وموعد المتابعة. نص الرسالة لا يُحفظ.
 * - «تُوصل معه في هذه الدورة» = سطر صادر غير متخطٍّ ولا فاشل برقم عملية آخر دورة (cycleId).
 * - واتساب يدوي: الخادم يجهّز النص والرابط (wa.me) ويسجّل كشف الرقم، والموظف يؤكد الإرسال فيُسجَّل التواصل.
 * - البريد: بأمر الموظف فوراً، أو تلقائياً كل ساعة حسب الإعدادات (autoEmail_)، ومعه دائماً رابط الإيقاف.
 */
var SUB_SCHEMA = {
  Subscribers: [
    ['id', 'text'], ['platformId', 'text'], ['buyerKey', 'text'], ['nameEnc', 'text'], ['mobileEnc', 'text'], ['emailEnc', 'text'],
    ['mobileMask', 'text'], ['emailMask', 'text'], ['country', 'text'], ['optOut', 'bool'], ['optOutAt', 'ts'], ['optOutReason', 'text'],
    ['assignedTo', 'text'], ['notes', 'text'], ['forgottenAt', 'ts'], ['createdAt', 'ts'], ['updatedAt', 'ts'], ['unsubToken', 'text']
  ],
  Messages: [
    ['id', 'text'], ['subscriberId', 'text'], ['ref', 'text'], ['cycleId', 'text'], ['channel', 'text'], ['direction', 'text'], ['kind', 'text'],
    ['templateId', 'text'], ['subject', 'text'], ['status', 'text'], ['skipReason', 'text'], ['error', 'text'], ['auto', 'bool'], ['byId', 'text'],
    ['replyStatus', 'text'], ['replyAt', 'ts'], ['replyBy', 'text'], ['nextFollowUpAt', 'date'], ['note', 'text'], ['dedupeKey', 'text'],
    ['createdAt', 'ts'], ['updatedAt', 'ts']
  ],
  Templates: [
    ['id', 'text'], ['channel', 'text'], ['kind', 'text'], ['name', 'text'], ['subject', 'text'], ['body', 'text'], ['active', 'bool'],
    ['sort', 'num'], ['updatedBy', 'text'], ['updatedAt', 'ts']
  ],
  Config: [['id', 'text'], ['key', 'text'], ['value', 'json'], ['updatedBy', 'text'], ['updatedAt', 'ts']]
};

var SUB = {
  STATUS: { active: 'سارٍ', expiring: 'ينتهي خلال 7 أيام', pending: 'لم يجدد — بانتظار الكشف', lapsed: 'لم يجدد' },
  OUTCOME: { open: 'سارية', renewed: 'جدّد', pending: 'بانتظار كشف شهر الانتهاء', lapsed: 'لم يجدد' },
  EXPIRING_DAYS: 7,
  FOLLOW_DAYS: 14,
  EXPIRED_DAYS: 30,
  RETENTION_MONTHS: 24,
  CHANNEL: { whatsapp: 'واتساب', email: 'بريد', call: 'اتصال', app: 'التطبيق' },
  KIND: { before14: 'قبل الانتهاء بـ 14 يوماً', before7: 'قبل الانتهاء بـ 7 أيام', on_expiry: 'يوم الانتهاء', after7: 'بعد الانتهاء بـ 7 أيام', winback: 'استرجاع', general: 'عامة', manual: 'يدوي' },
  /** أيام الموعد من تاريخ الانتهاء للبريد التلقائي */
  OFFSET: { before14: -14, before7: -7, on_expiry: 0, after7: 7 },
  REPLY: {
    waiting: 'بانتظار الرد', no_answer: 'لم يرد', interested: 'رد مهتم', promised: 'وعد بالتجديد', renewed: 'جدّد',
    refused: 'رفض', wrong_contact: 'رقم أو بريد خاطئ', optout: 'طلب إيقاف الرسائل'
  },
  /** حالات تعني أن المشترك ردّ */
  REPLIED: { interested: 1, promised: 1, renewed: 1, refused: 1, optout: 1 },
  /** حالات تُنهي المتابعة في الدورة (لا تُعد متأخرة) */
  CLOSED: { renewed: 1, refused: 1, wrong_contact: 1, optout: 1 },
  SKIP: { opted_out: 'أوقف الرسائل', no_contact: 'لا بريد' },
  MSG_STATUS: { sent: 'أُرسل', failed: 'فشل', skipped: 'تُخطّي' },
  VARS: ['{الاسم}', '{الباقة}', '{المنصة}', '{تاريخ_الانتهاء}', '{الأيام_المتبقية}', '{رابط_التجديد}', '{اسم_الموظف}'], // i18n:line — المتغيرات تُكتب بالعربي في القوالب
  CATCH_UP_DAYS: 2,
  MAIL_RESERVE: 5
};

// i18n:off — القوالب الافتراضية نصوص تصل إلى المشتركين بالعربي
var SUB_DEFAULT_TEMPLATES = [
  { channel: 'whatsapp', kind: 'before7', name: 'تذكير قبل الانتهاء', subject: '',
    body: 'السلام عليكم {الاسم}،\nنذكّرك بأن اشتراكك في {الباقة} على {المنصة} ينتهي بتاريخ {تاريخ_الانتهاء}، أي بعد {الأيام_المتبقية}.\nيسعدنا استمرارك معنا، وللتجديد: {رابط_التجديد}\n\n{اسم_الموظف}\nلإيقاف هذه الرسائل أرسل: إيقاف' },
  { channel: 'whatsapp', kind: 'on_expiry', name: 'يوم الانتهاء', subject: '',
    body: 'السلام عليكم {الاسم}،\nينتهي اليوم اشتراكك في {الباقة} على {المنصة}. جدّد الآن ليستمر وردك دون انقطاع: {رابط_التجديد}\n\n{اسم_الموظف}\nلإيقاف هذه الرسائل أرسل: إيقاف' },
  { channel: 'whatsapp', kind: 'after7', name: 'بعد الانتهاء', subject: '',
    body: 'السلام عليكم {الاسم}،\nافتقدناك في {المنصة}! انتهى اشتراكك في {الباقة} بتاريخ {تاريخ_الانتهاء}. يسعدنا عودتك: {رابط_التجديد}\nهل واجهتك أي صعوبة نساعدك فيها؟\n\n{اسم_الموظف}\nلإيقاف هذه الرسائل أرسل: إيقاف' },
  { channel: 'email', kind: 'before14', name: 'تذكير قبل أسبوعين', subject: 'اشتراكك في {المنصة} ينتهي بعد أسبوعين',
    body: 'السلام عليكم {الاسم}،\n\nنذكّرك بأن اشتراكك في {الباقة} على {المنصة} ينتهي بتاريخ {تاريخ_الانتهاء}.\nللتجديد: {رابط_التجديد}\n\nمع خالص التحية،\nفريق {المنصة}' },
  { channel: 'email', kind: 'before7', name: 'تذكير قبل أسبوع', subject: 'اشتراكك في {المنصة} ينتهي بعد {الأيام_المتبقية}',
    body: 'السلام عليكم {الاسم}،\n\nاشتراكك في {الباقة} على {المنصة} ينتهي بتاريخ {تاريخ_الانتهاء}. جدّد قبل الانتهاء ليستمر وردك دون انقطاع.\nللتجديد: {رابط_التجديد}\n\nمع خالص التحية،\nفريق {المنصة}' },
  { channel: 'email', kind: 'on_expiry', name: 'يوم الانتهاء', subject: 'ينتهي اشتراكك في {المنصة} اليوم',
    body: 'السلام عليكم {الاسم}،\n\nينتهي اليوم اشتراكك في {الباقة} على {المنصة}.\nللتجديد: {رابط_التجديد}\n\nمع خالص التحية،\nفريق {المنصة}' },
  { channel: 'email', kind: 'after7', name: 'بعد الانتهاء بأسبوع', subject: 'افتقدناك في {المنصة}',
    body: 'السلام عليكم {الاسم}،\n\nانتهى اشتراكك في {الباقة} بتاريخ {تاريخ_الانتهاء}، ويسعدنا عودتك.\nللتجديد: {رابط_التجديد}\n\nإن واجهتك صعوبة فرد على هذه الرسالة ونساعدك.\n\nمع خالص التحية،\nفريق {المنصة}' }
];
var SUB_SAMPLE_VARS = { name: 'محمد', pkg: 'الباقة الذهبية', platform: 'صاد القرآني', staff: 'سارة' };
var SUB_FALLBACK_NAME = 'عزيزنا المشترك';
// i18n:on

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
    var out = {
      retentionMonths: SUB.RETENTION_MONTHS, renewalLink: '', autoEmail: false,
      autoKinds: { before14: false, before7: true, on_expiry: true, after7: true }, sendFrom: 9, sendTo: 21, dailyCap: 50, senderName: ''
    };
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
  view_: function (b, rec, ctx, pk, key, users, ci) {
    var staff = Subscribers.isStaff_(ctx);
    var lc = Subscribers.lastContact_(ci, b, users);
    return Object.assign(lc, {
      id: rec ? rec.id : '', ref: b.platformId + '|' + b.buyerKey, platformId: b.platformId, status: b.status, statusLabel: SUB.STATUS[b.status],
      packageId: b.packageId, packageName: pk[b.packageId] || '', expiresAt: b.expiresAt, daysLeft: b.daysLeft, waitFor: b.waitFor,
      lastPaidAt: b.lastPaidAt, firstPaidAt: b.firstPaidAt, purchases: b.purchases, totalPaid: b.totalPaid, winback: b.winback,
      name: staff && rec && !rec.forgottenAt ? Subscribers.open_(rec.nameEnc, key) : '',
      mobileMask: rec ? rec.mobileMask || '' : '', emailMask: rec ? rec.emailMask || '' : '', hasContact: !!(rec && (rec.mobileEnc || rec.emailEnc)),
      country: rec && rec.country ? Platforms.countryLabel_(rec.country) : '', optOut: !!(rec && rec.optOut), forgotten: !!(rec && rec.forgottenAt),
      assignedTo: rec ? rec.assignedTo || '' : '', assignedName: rec && rec.assignedTo && users[rec.assignedTo] ? users[rec.assignedTo].fullName : '',
      hasMobile: !!(rec && !rec.forgottenAt && rec.mobileEnc), hasEmail: !!(rec && !rec.forgottenAt && rec.emailEnc), suggestKind: Subscribers.suggestKind_(b)
    });
  },

  // ───────── سجل التواصل ─────────
  /** فهرس السجل: { ref: [رسائل من الأحدث] } */
  contactIndex_: function () {
    var o = {};
    Subscribers.rows_('Messages').forEach(function (m) { (o[m.ref] = o[m.ref] || []).push(m); });
    Object.keys(o).forEach(function (k) { o[k].sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }); });
    return o;
  },
  counts_: function (m) { return m.status !== 'skipped' && m.status !== 'failed'; },
  cycleId_: function (b) { return b.cycles[b.cycles.length - 1].gatewayId; },

  /** آخر تواصل، وهل تُوصل معه في الدورة الحالية، وحالة الرد فيها */
  lastContact_: function (ci, b, users) {
    var list = (ci && ci[b.platformId + '|' + b.buyerKey]) || [], cyc = Subscribers.cycleId_(b);
    var last = list.filter(Subscribers.counts_)[0] || null;
    var inCycle = list.filter(function (m) { return Subscribers.counts_(m) && m.cycleId === cyc; });
    var lastIn = inCycle[0] || null;
    return {
      lastContactAt: last ? last.createdAt : '', lastContactBy: last ? (last.auto ? '' : (users[last.byId] || {}).fullName || '') : '', lastContactAuto: !!(last && last.auto),
      lastChannel: last ? last.channel : '', lastChannelLabel: last ? SUB.CHANNEL[last.channel] || '' : '',
      contactedThisCycle: inCycle.some(function (m) { return m.direction === 'out'; }), contactsThisCycle: inCycle.length,
      reply: lastIn ? lastIn.replyStatus || '' : '', replyLabel: lastIn && lastIn.replyStatus ? SUB.REPLY[lastIn.replyStatus] : '',
      nextFollowUpAt: lastIn ? lastIn.nextFollowUpAt || '' : '', lastContactId: lastIn ? lastIn.id : ''
    };
  },

  /** القالب المقترح حسب الأيام المتبقية */
  suggestKind_: function (b) {
    if (b.daysLeft == null) return 'after7';
    if (b.daysLeft === 0) return 'on_expiry';
    if (b.daysLeft <= SUB.EXPIRING_DAYS) return 'before7';
    if (b.daysLeft <= SUB.FOLLOW_DAYS) return 'before14';
    return 'general';
  },

  contactView_: function (m, users, tpls) {
    var t = tpls[m.templateId];
    return {
      id: m.id, channel: m.channel, channelLabel: SUB.CHANNEL[m.channel] || '', direction: m.direction, kind: m.kind, kindLabel: SUB.KIND[m.kind] || '',
      templateName: t ? t.name : '', subject: m.subject || '', status: m.status, statusLabel: SUB.MSG_STATUS[m.status] || '',
      skipLabel: SUB.SKIP[m.skipReason] || '', error: m.error || '', auto: !!m.auto, byName: m.auto ? '' : (users[m.byId] || {}).fullName || '',
      reply: m.replyStatus || '', replyLabel: SUB.REPLY[m.replyStatus] || '', replyAt: m.replyAt || '', replyByName: (users[m.replyBy] || {}).fullName || '',
      nextFollowUpAt: m.nextFollowUpAt || '', note: m.note || '', createdAt: m.createdAt
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
      settings: Subscribers.isMgr_(ctx) ? Subscribers.config_() : null,
      channels: Object.keys(SUB.CHANNEL).map(function (k) { return { id: k, label: SUB.CHANNEL[k] }; }),
      kinds: Object.keys(SUB.KIND).filter(function (k) { return k !== 'manual'; }).map(function (k) { return { id: k, label: SUB.KIND[k], auto: SUB.OFFSET[k] != null }; }),
      replies: Object.keys(SUB.REPLY).map(function (k) { return { id: k, label: SUB.REPLY[k] }; }),
      vars: SUB.VARS
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
    var ci = Subscribers.contactIndex_(), out = [];
    Object.keys(m.buyers).forEach(function (k) {
      var b = m.buyers[k], r = recs[k];
      if (!Subscribers.canSee_(ctx, r)) return;
      if (p.status && b.status !== p.status) return;
      if (p.packageId && b.packageId !== p.packageId) return;
      if (p.expMonth && b.expiresAt.slice(0, 7) !== p.expMonth) return;
      if (p.assigned === 'me' && (!r || r.assignedTo !== ctx.user.id)) return;
      if (p.assigned === 'none' && r && r.assignedTo) return;
      var v = Subscribers.view_(b, r, ctx, pk, key, users, ci);
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
    var f = Subscribers.find_(ctx, (p || {}).ref), pk = Subscribers.pkgNames_(), users = indexBy_(Db.view('core', 'Users'));
    var ci = Subscribers.contactIndex_(), tpls = indexBy_(Subscribers.rows_('Templates'));
    var v = Subscribers.view_(f.b, f.rec, ctx, pk, Subscribers.key_(), users, ci);
    v.contacts = (ci[f.b.platformId + '|' + f.b.buyerKey] || []).map(function (m) { return Subscribers.contactView_(m, users, tpls); });
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

  // ───────── متابعة التجديد ─────────
  /**
   * من تنتهي باقته خلال 14 يوماً، ومن انتهت ولم يجدد في آخر 30 يوماً، مع آخر تواصل وحالة الرد.
   * window: '7' | '14' (الافتراضي) | 'expired' · contact: '' | 'none' | 'contacted' | 'overdue' | حالة رد · assigned · packageId
   * المؤشرات من كل من يراه المستخدم بلا تصفية.
   */
  followup: function (ctx, p) {
    p = p || {};
    var pf = Subscribers.platformOf_(p.platform), m = Subscribers.model_(pf), recs = Subscribers.records_(), pk = Subscribers.pkgNames_();
    var key = Subscribers.key_(), users = indexBy_(Db.view('core', 'Users')), ci = Subscribers.contactIndex_();
    var today = m.today, from = addDays_(today, -SUB.EXPIRED_DAYS), win = p.window === '7' || p.window === 'expired' ? p.window : '14';
    var k = { in7: 0, in14: 0, soon: 0, soonContacted: 0, notContacted: 0, waiting: 0, promised: 0, overdue: 0, expired: 0 };
    var c = String(p.contact || ''), rows = [];
    Object.keys(m.buyers).forEach(function (id) {
      var b = m.buyers[id], r = recs[id];
      if (!Subscribers.canSee_(ctx, r) || (r && r.forgottenAt)) return;
      var soon = b.daysLeft != null && b.daysLeft <= SUB.FOLLOW_DAYS;
      var expired = b.daysLeft == null && (b.status === 'pending' || b.status === 'lapsed') && b.expiresAt >= from;
      if (!soon && !expired) return;
      var v = Subscribers.view_(b, r, ctx, pk, key, users, ci);
      v.overdue = !!v.nextFollowUpAt && v.nextFollowUpAt <= today && !SUB.CLOSED[v.reply];
      if (soon) {
        k.soon++;
        if (b.daysLeft <= SUB.EXPIRING_DAYS) k.in7++; else k.in14++;
        if (v.contactedThisCycle) k.soonContacted++; else k.notContacted++;
      } else k.expired++;
      if (v.reply === 'waiting') k.waiting++;
      if (v.reply === 'promised') k.promised++;
      if (v.overdue) k.overdue++;
      if (win === '7' && !(soon && b.daysLeft <= SUB.EXPIRING_DAYS)) return;
      if (win === '14' && !soon) return;
      if (win === 'expired' && !expired) return;
      if (p.packageId && b.packageId !== p.packageId) return;
      if (p.assigned === 'me' && (!r || r.assignedTo !== ctx.user.id)) return;
      if (p.assigned === 'none' && r && r.assignedTo) return;
      if (c === 'none' && v.contactedThisCycle) return;
      if (c === 'contacted' && !v.contactedThisCycle) return;
      if (c === 'overdue' && !v.overdue) return;
      if (SUB.REPLY[c] && v.reply !== c) return;
      rows.push(v);
    });
    rows.sort(function (a, b) {
      return win === 'expired' ? b.expiresAt.localeCompare(a.expiresAt) : (a.daysLeft - b.daysLeft) || a.expiresAt.localeCompare(b.expiresAt) || a.name.localeCompare(b.name);
    });
    k.contactedRate = k.soon ? Math.round(k.soonContacted * 100 / k.soon) : null;
    var cfg = Subscribers.config_();
    return { today: today, window: win, kpis: k, rows: rows, auto: { enabled: !!cfg.autoEmail, sentToday: Subscribers.autoSentToday_(), cap: cfg.dailyCap } };
  },

  autoSentToday_: function () {
    var today = localDate_();
    return Subscribers.rows_('Messages').filter(function (m) { return m.auto && m.status === 'sent' && localDate_(m.createdAt) === today; }).length;
  },

  // ───────── القوالب ─────────
  /** القوالب، وتُنشأ الافتراضية أول مرة فقط (حذفها كلها لا يعيدها) */
  templates_: function () {
    var rows = Subscribers.rows_('Templates');
    if (rows.length || Subscribers.rows_('Config').some(function (r) { return r.key === 'seed'; })) return rows;
    return withLock(function () {
      if (Db.all('subscribers', 'Templates').length || Db.all('subscribers', 'Config').some(function (r) { return r.key === 'seed'; })) return Db.all('subscribers', 'Templates');
      var now = nowIso();
      Db.insertMany('subscribers', 'Templates', SUB_DEFAULT_TEMPLATES.map(function (t, i) { return Object.assign({}, t, { active: true, sort: i + 1, updatedBy: '', updatedAt: now }); }));
      Db.insert('subscribers', 'Config', { key: 'seed', value: { templates: true }, updatedBy: '', updatedAt: now });
      return Db.all('subscribers', 'Templates');
    });
  },

  tplView_: function (t) {
    return {
      id: t.id, channel: t.channel, channelLabel: SUB.CHANNEL[t.channel] || '', kind: t.kind, kindLabel: SUB.KIND[t.kind] || '',
      name: t.name, subject: t.subject || '', body: t.body, active: !!t.active, sort: t.sort || 0
    };
  },

  templates: function () {
    return Subscribers.templates_().slice().sort(function (a, b) { return a.channel.localeCompare(b.channel) || (a.sort || 0) - (b.sort || 0); }).map(Subscribers.tplView_);
  },

  templateSave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var list = Subscribers.templates_();
      var ch = String(p.channel || ''), kind = String(p.kind || '');
      if (ch !== 'whatsapp' && ch !== 'email') throw appError('اختر قناة القالب.');
      if (!SUB.KIND[kind] || kind === 'manual') throw appError('اختر نوع القالب.');
      var rec = {
        channel: ch, kind: kind, name: requireText(p.name, 'اسم القالب', 80), subject: ch === 'email' ? requireText(p.subject, 'عنوان البريد', 150) : '',
        body: requireText(p.body, 'نص الرسالة', 2000), active: p.active == null ? true : bool_(p.active), updatedBy: ctx.user.id, updatedAt: nowIso()
      };
      var cur = p.id ? Db.get('subscribers', 'Templates', String(p.id)) : null;
      if (p.id && !cur) throw appError('القالب غير موجود.', 'NOT_FOUND');
      var saved;
      if (cur) { Db.update('subscribers', 'Templates', cur.id, rec); saved = Object.assign({}, cur, rec); }
      else saved = Db.insert('subscribers', 'Templates', Object.assign(rec, { sort: list.reduce(function (mx, t) { return Math.max(mx, t.sort || 0); }, 0) + 1 }));
      Audit.log(ctx.user, 'subscribers', cur ? 'template.update' : 'template.create', 'Template', saved.id, { name: rec.name, channel: ch, kind: kind, active: rec.active });
      return Subscribers.tplView_(saved);
    });
  },

  templateRemove: function (ctx, p) {
    return withLock(function () {
      var t = Db.get('subscribers', 'Templates', String((p || {}).id || ''));
      if (!t) throw appError('القالب غير موجود.', 'NOT_FOUND');
      Db.remove('subscribers', 'Templates', t.id);
      Audit.log(ctx.user, 'subscribers', 'template.remove', 'Template', t.id, { name: t.name });
      return { removed: true };
    });
  },

  platformName_: function (id) { var x = Db.view('platforms', 'Platforms').filter(function (r) { return r.id === id; })[0]; return x ? x.name : ''; },

  // i18n:off — أسماء المتغيرات في القوالب عربية كما يكتبها المستخدم، والأيام بصيغة العدد العربية
  daysText_: function (n) { return n === 0 ? 'اليوم' : n === 1 ? 'يوم واحد' : n === 2 ? 'يومين' : n <= 10 ? n + ' أيام' : n + ' يوماً'; },
  /** قيم المتغيرات لمشترك (أو قيم تجريبية بلا مشترك) */
  vars_: function (b, rec, key, cfg, ctx, pk) {
    var staff = ctx && ctx.user ? ctx.user.fullName : '';
    if (!b) return { 'الاسم': SUB_SAMPLE_VARS.name, 'الباقة': SUB_SAMPLE_VARS.pkg, 'المنصة': SUB_SAMPLE_VARS.platform, 'تاريخ_الانتهاء': dmy_(addDays_(localDate_(), 7)), 'الأيام_المتبقية': Subscribers.daysText_(7), 'رابط_التجديد': cfg.renewalLink || '', 'اسم_الموظف': staff || SUB_SAMPLE_VARS.staff };
    var name = rec && !rec.forgottenAt ? Subscribers.open_(rec.nameEnc, key) : '';
    return {
      'الاسم': name || SUB_FALLBACK_NAME, 'الباقة': pk[b.packageId] || '', 'المنصة': Subscribers.platformName_(b.platformId), 'تاريخ_الانتهاء': dmy_(b.expiresAt),
      'الأيام_المتبقية': Subscribers.daysText_(Math.max(b.daysLeft || 0, 0)), 'رابط_التجديد': cfg.renewalLink || '', 'اسم_الموظف': staff
    };
  },
  // i18n:on

  /** يملأ المتغيرات. السطر الذي فيه متغير فارغ (مثل رابط التجديد قبل تحديده) يُحذف كاملاً */
  render_: function (text, vars) {
    return String(text || '').split('\n').filter(function (line) {
      return !(line.match(/\{[^{}]+\}/g) || []).some(function (tok) { return vars[tok.slice(1, -1)] === ''; });
    }).map(function (line) {
      return line.replace(/\{([^{}]+)\}/g, function (all, k) { return vars[k] != null ? vars[k] : all; });
    }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  },

  tplOrNull_: function (id) {
    if (!id) return null;
    var t = Subscribers.templates_().filter(function (x) { return x.id === String(id); })[0];
    if (!t) throw appError('القالب غير موجود.', 'NOT_FOUND');
    return t;
  },

  /**
   * معاينة رسالة: { ref?, templateId?, subject?, body? } — بلا مشترك تُستخدم قيم تجريبية (معاينة القالب في الإعدادات).
   * لا تكشف الجوال ولا البريد.
   */
  messagePreview: function (ctx, p) {
    p = p || {};
    var cfg = Subscribers.config_(), t = Subscribers.tplOrNull_(p.templateId), f = p.ref ? Subscribers.find_(ctx, p.ref) : null;
    var vars = Subscribers.vars_(f ? f.b : null, f ? f.rec : null, Subscribers.key_(), cfg, ctx, Subscribers.pkgNames_());
    var subject = p.subject != null ? String(p.subject) : (t ? t.subject : ''), body = p.body != null ? String(p.body) : (t ? t.body : '');
    return {
      subject: Subscribers.render_(subject, vars), body: Subscribers.render_(body, vars), templateId: t ? t.id : '', kind: t ? t.kind : 'manual',
      missingLink: !cfg.renewalLink && (subject + body).indexOf(SUB.VARS[5]) >= 0
    };
  },

  /** رقم واتساب دولي: الأرقام فقط، بلا 00، والرقم الكويتي المحلي (8 أرقام) يُسبق بـ 965 */
  waNumber_: function (m) {
    var d = normalizeDigits(m).replace(/\D/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.length === 8) d = '965' + d;
    return d;
  },

  /**
   * واتساب يدوي: { ref, templateId?, body? } ← { url, body, kind, templateId }. يكشف الرقم فيُسجَّل «إظهاراً».
   * لا يُسجَّل التواصل هنا: الواجهة تسأل الموظف «هل أرسلت؟» ثم تستدعي sub.contact.log.
   */
  messageWhatsapp: function (ctx, p) {
    p = p || {};
    var f = Subscribers.find_(ctx, p.ref), rec = Subscribers.recOrThrow_(f);
    if (rec.forgottenAt || !rec.mobileEnc) throw appError('لا جوال محفوظ لهذا المشترك.');
    if (rec.optOut) throw appError('أوقف هذا المشترك الرسائل.');
    var pv = Subscribers.messagePreview(ctx, { ref: p.ref, templateId: p.templateId });
    var body = p.body != null ? optionalText(p.body, 2000) : pv.body;
    if (!body) throw appError('اكتب نص الرسالة.');
    var num = Subscribers.waNumber_(Subscribers.open_(rec.mobileEnc, Subscribers.key_()));
    if (num.length < 8) throw appError('رقم الجوال المحفوظ غير صالح لواتساب.');
    Audit.log(ctx.user, 'subscribers', 'reveal', 'Subscriber', rec.id, { mobile: rec.mobileMask, via: 'whatsapp' });
    return { url: 'https://wa.me/' + num + '?text=' + encodeURIComponent(body), body: body, kind: pv.kind, templateId: pv.templateId };
  },

  baseMsg_: function (rec, b, changes) {
    var now = nowIso();
    return Object.assign({
      subscriberId: rec.id, ref: rec.platformId + '|' + rec.buyerKey, cycleId: b ? Subscribers.cycleId_(b) : '', channel: '', direction: 'out', kind: 'manual',
      templateId: '', subject: '', status: 'sent', skipReason: '', error: '', auto: false, byId: '', replyStatus: '', replyAt: '', replyBy: '',
      nextFollowUpAt: '', note: '', dedupeKey: '', createdAt: now, updatedAt: now
    }, changes || {});
  },

  newToken_: function () { return randomToken_().slice(0, 32); },

  /** يرسل بريد مشترك: النص عادي، ويُلحق رابط الإيقاف دائماً */
  sendMail_: function (to, subject, body, token, cfg, platformName) {
    var url = APP.WEB_URL + '#/unsub/' + token;
    var esc = function (s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var html = esc(body).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>');
    // i18n:off — نص البريد يصل إلى المشترك بالعربي
    MailApp.sendEmail({
      to: to, name: cfg.senderName || platformName || APP.NAME, subject: subject,
      body: body + '\n\n—\nلإيقاف هذه الرسائل: ' + url,
      htmlBody: '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.8;color:#1b1b1b">' + html +
        '<p style="margin:22px 0 0;font-size:12px;color:#888">لإيقاف هذه الرسائل <a href="' + esc(url) + '" style="color:#888">اضغط هنا</a>.</p></div>'
    });
    // i18n:on
  },

  /** بريد بأمر الموظف: { ref, templateId?, subject?, body? } — يُرسل فوراً ويُسجَّل باسمه */
  messageEmail: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var f = Subscribers.find_(ctx, p.ref), rec = Subscribers.recOrThrow_(f), cfg = Subscribers.config_();
      if (rec.forgottenAt || !rec.emailEnc) throw appError('لا بريد محفوظ لهذا المشترك.');
      if (rec.optOut) throw appError('أوقف هذا المشترك الرسائل.');
      if (!Notify.mailAvailable_()) throw appError('إرسال البريد غير مفعّل في الخادم. شغّل authorizeMail من المحرر مرة واحدة.');
      if (MailApp.getRemainingDailyQuota() <= SUB.MAIL_RESERVE) throw appError('انتهت حصة البريد اليوم. حاول غداً.');
      var pv = Subscribers.messagePreview(ctx, { ref: p.ref, templateId: p.templateId });
      var subject = p.subject != null ? optionalText(p.subject, 150) : pv.subject, body = p.body != null ? optionalText(p.body, 4000) : pv.body;
      if (!subject) throw appError('اكتب عنوان البريد.');
      if (!body) throw appError('اكتب نص الرسالة.');
      var token = rec.unsubToken;
      if (!token) { token = Subscribers.newToken_(); Db.update('subscribers', 'Subscribers', rec.id, { unsubToken: token }); }
      var msg = Subscribers.baseMsg_(rec, f.b, { channel: 'email', kind: pv.kind, templateId: pv.templateId, subject: subject, byId: ctx.user.id, replyStatus: 'waiting' });
      try { Subscribers.sendMail_(Subscribers.open_(rec.emailEnc, Subscribers.key_()), subject, body, token, cfg, Subscribers.platformName_(rec.platformId)); }
      catch (e) { msg.status = 'failed'; msg.replyStatus = ''; msg.error = String(e && e.message || e).slice(0, 300); }
      var saved = Db.insert('subscribers', 'Messages', msg);
      Audit.log(ctx.user, 'subscribers', 'message.email', 'Subscriber', rec.id, { email: rec.emailMask, status: msg.status, template: pv.templateId });
      return { id: saved.id, status: msg.status, error: msg.error };
    });
  },

  replyOrThrow_: function (v, required) {
    var s = String(v || '');
    if (!s && !required) return '';
    if (!SUB.REPLY[s]) throw appError('اختر حالة الرد.');
    return s;
  },

  /** طلب الإيقاف من حالة الرد: يوقف الرسائل للمشترك */
  applyOptOut_: function (ctx, rec, channel) {
    if (rec.optOut) return;
    Db.update('subscribers', 'Subscribers', rec.id, { optOut: true, optOutAt: nowIso(), optOutReason: 'طلب عبر ' + (SUB.CHANNEL[channel] || channel), updatedAt: nowIso() });
    Audit.log(ctx.user, 'subscribers', 'optout', 'Subscriber', rec.id, { mobile: rec.mobileMask, via: channel });
  },

  /**
   * تسجيل تواصل: { ref, channel, direction ('out'|'in'), templateId?, kind?, replyStatus?, note?, nextFollowUpAt? }
   * الصادر بواتساب أو بريد يبدأ «بانتظار الرد» إن لم تُحدَّد حالة. المكالمة والوارد يحتاجان حالة.
   */
  contactLog: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var f = Subscribers.find_(ctx, p.ref), rec = Subscribers.recOrThrow_(f);
      var ch = String(p.channel || '');
      if (!SUB.CHANNEL[ch]) throw appError('اختر قناة التواصل.');
      var dir = p.direction === 'in' ? 'in' : 'out';
      var reply = Subscribers.replyOrThrow_(p.replyStatus || (dir === 'out' && ch !== 'call' ? 'waiting' : ''), true);
      if (dir === 'out' && rec.optOut && (ch === 'whatsapp' || ch === 'email')) throw appError('أوقف هذا المشترك الرسائل.');
      var t = Subscribers.tplOrNull_(p.templateId);
      var answered = reply !== 'waiting';
      var msg = Subscribers.baseMsg_(rec, f.b, {
        channel: ch, direction: dir, kind: t ? t.kind : (SUB.KIND[p.kind] ? String(p.kind) : 'manual'), templateId: t ? t.id : '', byId: ctx.user.id,
        replyStatus: reply, replyAt: answered ? nowIso() : '', replyBy: answered ? ctx.user.id : '',
        nextFollowUpAt: optionalDate_(p.nextFollowUpAt, 'موعد المتابعة'), note: optionalText(p.note, 1000)
      });
      var saved = Db.insert('subscribers', 'Messages', msg);
      if (reply === 'optout') Subscribers.applyOptOut_(ctx, rec, ch);
      Audit.log(ctx.user, 'subscribers', 'contact.log', 'Subscriber', rec.id, { channel: ch, direction: dir, reply: reply, mobile: rec.mobileMask });
      return { id: saved.id };
    });
  },

  /** تحديث الرد على تواصل: { id, replyStatus, note?, nextFollowUpAt? } */
  contactUpdate: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var m = Db.get('subscribers', 'Messages', String(p.id || ''));
      if (!m) throw appError('سجل التواصل غير موجود.', 'NOT_FOUND');
      var f = Subscribers.find_(ctx, m.ref), rec = Subscribers.recOrThrow_(f);
      var reply = Subscribers.replyOrThrow_(p.replyStatus, true);
      var changes = {
        replyStatus: reply, replyAt: nowIso(), replyBy: ctx.user.id, updatedAt: nowIso(),
        nextFollowUpAt: p.nextFollowUpAt !== undefined ? optionalDate_(p.nextFollowUpAt, 'موعد المتابعة') : m.nextFollowUpAt,
        note: p.note !== undefined ? optionalText(p.note, 1000) : m.note
      };
      Db.update('subscribers', 'Messages', m.id, changes);
      if (reply === 'optout') Subscribers.applyOptOut_(ctx, rec, m.channel);
      Audit.log(ctx.user, 'subscribers', 'contact.update', 'Subscriber', rec.id, { reply: reply, before: m.replyStatus || '' });
      return { ok: true };
    });
  },

  // ───────── البريد التلقائي ─────────
  /**
   * يرسل تذكيرات البريد المستحقة حسب الإعدادات. يُستدعى كل ساعة (subscriberReminders) أو من «تشغيل الآن».
   * يعيد { sent, skipped, failed, noEmail, reason } — reason: off | hours | mail | running | no_templates | cap | quota
   */
  autoEmail_: function () {
    var cfg = Subscribers.config_(), out = { sent: 0, skipped: 0, failed: 0, noEmail: 0, reason: '' };
    if (!cfg.autoEmail) { out.reason = 'off'; return out; }
    var hour = Number(localHm_(Date.now()).slice(0, 2));
    if (hour < cfg.sendFrom || hour >= cfg.sendTo) { out.reason = 'hours'; return out; }
    if (!Notify.mailAvailable_()) { out.reason = 'mail'; return out; }
    var cache = CacheService.getScriptCache();
    if (cache.get('sub.reminders.running')) { out.reason = 'running'; return out; }
    cache.put('sub.reminders.running', '1', 300);
    var inserts = [], tokens = {};
    try {
      var tpl = {};
      Subscribers.templates_().filter(function (t) { return t.active && t.channel === 'email'; }).sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); })
        .forEach(function (t) { if (!tpl[t.kind]) tpl[t.kind] = t; });
      var kinds = Object.keys(SUB.OFFSET).filter(function (k) { return cfg.autoKinds && cfg.autoKinds[k] && tpl[k]; });
      if (!kinds.length) { out.reason = 'no_templates'; return out; }
      var today = localDate_(), seen = {}, failedN = {}, touched = {}, sentToday = 0;
      Subscribers.rows_('Messages').forEach(function (m) {
        if (m.dedupeKey) { if (m.status === 'failed') failedN[m.dedupeKey] = (failedN[m.dedupeKey] || 0) + 1; else seen[m.dedupeKey] = true; }
        if (m.auto && m.status === 'sent' && localDate_(m.createdAt) === today) { sentToday++; touched[m.ref] = true; }
      });
      var left = cfg.dailyCap - sentToday, model = Subscribers.model_(''), recs = Subscribers.records_(), key = Subscribers.key_(), pk = Subscribers.pkgNames_(), names = {};
      var ids = Object.keys(model.buyers).sort(function (a, b) { return model.buyers[a].expiresAt.localeCompare(model.buyers[b].expiresAt); });
      for (var i = 0; i < ids.length; i++) {
        var b = model.buyers[ids[i]], r = recs[ids[i]];
        if (!r || r.forgottenAt || touched[ids[i]]) continue;
        var c = b.cycles[b.cycles.length - 1], due = '';
        if (c.outcome === 'renewed') continue;
        kinds.forEach(function (k) {
          var late = daysBetween_(addDays_(c.expiresAt, SUB.OFFSET[k]), today);
          if (late < 0 || late > SUB.CATCH_UP_DAYS) return;
          if (k === 'after7' ? b.daysLeft != null : (b.daysLeft == null && k !== 'on_expiry')) return;
          due = k;
        });
        if (!due) continue;
        var dk = c.gatewayId + '|' + due + '|email';
        if (seen[dk] || (failedN[dk] || 0) >= 2) continue;
        if (!r.emailEnc) { out.noEmail++; continue; }
        var msg = Subscribers.baseMsg_(r, b, { channel: 'email', kind: due, templateId: tpl[due].id, auto: true, dedupeKey: dk });
        if (r.optOut) { inserts.push(Object.assign(msg, { status: 'skipped', skipReason: 'opted_out' })); seen[dk] = true; out.skipped++; continue; }
        if (left <= 0) { out.reason = 'cap'; break; }
        if (MailApp.getRemainingDailyQuota() <= SUB.MAIL_RESERVE) { out.reason = 'quota'; break; }
        var vars = Subscribers.vars_(b, r, key, cfg, null, pk);
        var subject = Subscribers.render_(tpl[due].subject, vars), body = Subscribers.render_(tpl[due].body, vars);
        var token = r.unsubToken || tokens[r.id] || (tokens[r.id] = Subscribers.newToken_());
        if (!(b.platformId in names)) names[b.platformId] = Subscribers.platformName_(b.platformId);
        try {
          Subscribers.sendMail_(Subscribers.open_(r.emailEnc, key), subject, body, token, cfg, names[b.platformId]);
          msg.subject = subject; seen[dk] = true; left--; out.sent++;
        } catch (e) { msg.status = 'failed'; msg.error = String(e && e.message || e).slice(0, 300); out.failed++; }
        inserts.push(msg);
      }
    } finally {
      cache.remove('sub.reminders.running');
      if (inserts.length || Object.keys(tokens).length) withLock(function () {
        if (inserts.length) Db.insertMany('subscribers', 'Messages', inserts);
        if (Object.keys(tokens).length) Db.updateWhere('subscribers', 'Subscribers', function (x) { return tokens[x.id] && !x.unsubToken ? { unsubToken: tokens[x.id] } : null; });
      });
    }
    if (out.sent || out.skipped || out.failed) Audit.log({ id: '', fullName: 'النظام' }, 'subscribers', 'reminders.run', 'Message', '', out);
    return out;
  },

  remindersRun: function () { return Subscribers.autoEmail_(); },

  // ───────── صفحة إيقاف الرسائل (عامة برمز) ─────────
  byToken_: function (token) {
    var t = String(token || '');
    var rec = /^[a-f0-9]{16,64}$/.test(t) ? Subscribers.rows_('Subscribers').filter(function (r) { return r.unsubToken === t; })[0] : null;
    if (!rec) throw appError('الرابط غير صالح أو انتهى.', 'NOT_FOUND');
    return rec;
  },

  unsubView: function (ctx, p) {
    var rec = Subscribers.byToken_((p || {}).token);
    return { platformName: Subscribers.platformName_(rec.platformId), optedOut: !!rec.optOut };
  },

  unsubConfirm: function (ctx, p) {
    return withLock(function () {
      var rec = Subscribers.byToken_((p || {}).token), name = Subscribers.platformName_(rec.platformId);
      if (rec.optOut) return { platformName: name, optedOut: true };
      var now = nowIso(), b = Subscribers.model_(rec.platformId).buyers[rec.platformId + '|' + rec.buyerKey] || null;
      Db.update('subscribers', 'Subscribers', rec.id, { optOut: true, optOutAt: now, optOutReason: 'من رابط البريد', updatedAt: now });
      Db.insert('subscribers', 'Messages', Subscribers.baseMsg_(rec, b, { channel: 'email', direction: 'in', replyStatus: 'optout', replyAt: now }));
      Audit.log({ id: '', fullName: 'المشترك' }, 'subscribers', 'optout', 'Subscriber', rec.id, { mobile: rec.mobileMask, via: 'email_link' });
      return { platformName: name, optedOut: true };
    });
  },

  // ───────── التقارير ─────────
  period_: function (p) {
    var days = intIn_(p.days == null || p.days === '' ? 30 : p.days, 1, 366, 'عدد الأيام'), to = localDate_();
    return { days: days, from: addDays_(to, -(days - 1)), to: to };
  },

  /** تقرير المتابعة (أرقام مجمّعة): { days } — التواصل في الفترة، ولكل شهر انتهاء أثر التواصل في التجديد */
  report: function (ctx, p) {
    p = p || {};
    var per = Subscribers.period_(p), users = indexBy_(Db.view('core', 'Users')), all = Subscribers.rows_('Messages');
    var model = Subscribers.model_(Subscribers.platformOf_(p.platform)), cyc = {};
    Object.keys(model.buyers).forEach(function (id) { model.buyers[id].cycles.forEach(function (c) { cyc[id + '#' + c.gatewayId] = c; }); });
    var byChannel = {}, byReply = {}, byStaff = {}, auto = { sent: 0, skipped: 0, failed: 0 }, totals = { contacts: 0, replied: 0, subscribers: 0, manual: 0 }, subs = {};
    all.forEach(function (x) {
      if (localDate_(x.createdAt) < per.from || !cyc[x.ref + '#' + x.cycleId] && x.cycleId) return;
      if (x.auto) auto[x.status] = (auto[x.status] || 0) + 1;
      if (!Subscribers.counts_(x)) return;
      var replied = !!SUB.REPLIED[x.replyStatus];
      totals.contacts++; subs[x.ref] = true;
      if (replied) totals.replied++;
      if (!x.auto) totals.manual++;
      var ch = byChannel[x.channel] = byChannel[x.channel] || { channel: x.channel, label: SUB.CHANNEL[x.channel] || '', total: 0, replied: 0 };
      ch.total++; if (replied) ch.replied++;
      if (x.replyStatus) byReply[x.replyStatus] = (byReply[x.replyStatus] || 0) + 1;
      if (!x.auto && x.byId) {
        var s = byStaff[x.byId] = byStaff[x.byId] || { userId: x.byId, name: (users[x.byId] || {}).fullName || '', contacts: 0, replied: 0, renewed: 0, cycles: {} };
        s.contacts++; if (replied) s.replied++;
        s.cycles[x.ref + '#' + x.cycleId] = true;
      }
    });
    totals.subscribers = Object.keys(subs).length;
    var staff = Object.keys(byStaff).map(function (id) {
      var s = byStaff[id];
      s.renewed = Object.keys(s.cycles).filter(function (k) { return cyc[k] && cyc[k].outcome === 'renewed'; }).length;
      delete s.cycles;
      return s;
    }).sort(function (a, b) { return b.contacts - a.contacts; });
    // أثر التواصل: لكل شهر انتهاء، الدورات المنتهية ومن تُوصل معه فيها (قبل الانتهاء أو بعده) ومن جدّد
    var contacted = {}, before = {};
    all.forEach(function (x) {
      if (!Subscribers.counts_(x) || x.direction !== 'out') return;
      var k = x.ref + '#' + x.cycleId, c = cyc[k];
      if (!c) return;
      contacted[k] = true;
      if (localDate_(x.createdAt) <= c.expiresAt) before[k] = true;
    });
    var cur = per.to.slice(0, 7), months = {};
    Object.keys(cyc).forEach(function (k) {
      var c = cyc[k];
      if (c.outcome === 'open' || c.expMonth > cur) return;
      var y = months[c.expMonth] = months[c.expMonth] || { month: c.expMonth, total: 0, contacted: 0, contactedBefore: 0, renewed: 0, renewedContacted: 0, renewedNot: 0 };
      y.total++;
      if (contacted[k]) y.contacted++;
      if (before[k]) y.contactedBefore++;
      if (c.outcome === 'renewed') { y.renewed++; if (contacted[k]) y.renewedContacted++; else y.renewedNot++; }
    });
    var pct = function (a, b) { return b ? Math.round(a * 1000 / b) / 10 : null; };
    return {
      from: per.from, to: per.to, days: per.days, totals: totals, auto: auto,
      byChannel: Object.keys(SUB.CHANNEL).filter(function (k) { return byChannel[k]; }).map(function (k) { var x = byChannel[k]; x.rate = pct(x.replied, x.total); return x; }),
      byReply: Object.keys(SUB.REPLY).map(function (k) { return { id: k, label: SUB.REPLY[k], count: byReply[k] || 0 }; }),
      byStaff: staff,
      byMonth: Object.keys(months).sort().slice(-6).map(function (k) {
        var y = months[k];
        y.rateContacted = pct(y.renewedContacted, y.contacted);
        y.rateNot = pct(y.renewedNot, y.total - y.contacted);
        return y;
      })
    };
  },

  /** تنزيل سجل التواصل للفترة (المدير) — بالأسماء، ويُسجَّل */
  reportExport: function (ctx, p) {
    p = p || {};
    var per = Subscribers.period_(p), users = indexBy_(Db.view('core', 'Users')), key = Subscribers.key_(), tpls = indexBy_(Subscribers.rows_('Templates'));
    var recs = indexBy_(Subscribers.rows_('Subscribers'));
    var rows = Subscribers.rows_('Messages').filter(function (x) { return localDate_(x.createdAt) >= per.from; })
      .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); })
      .map(function (x) {
        var r = recs[x.subscriberId], v = Subscribers.contactView_(x, users, tpls);
        v.name = r && !r.forgottenAt ? Subscribers.open_(r.nameEnc, key) : '';
        v.mobileMask = r ? r.mobileMask || '' : '';
        return v;
      });
    Audit.log(ctx.user, 'subscribers', 'report.export', 'Message', '', { count: rows.length, days: per.days });
    return rows;
  },

  settingsSave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var base = Subscribers.config_(), has = function (k) { return p[k] !== undefined; };
      var link = has('renewalLink') ? optionalText(p.renewalLink, 300) : base.renewalLink;
      if (link && !/^https:\/\/\S+$/.test(link)) throw appError('رابط التجديد يجب أن يبدأ بـ https://');
      var kinds = {};
      Object.keys(SUB.OFFSET).forEach(function (k) { kinds[k] = has('autoKinds') ? bool_((p.autoKinds || {})[k]) : !!(base.autoKinds || {})[k]; });
      var next = {
        renewalLink: link,
        retentionMonths: has('retentionMonths') ? intIn_(p.retentionMonths == null || p.retentionMonths === '' ? SUB.RETENTION_MONTHS : p.retentionMonths, 6, 120, 'مدة الاحتفاظ بالأشهر') : base.retentionMonths,
        autoEmail: has('autoEmail') ? bool_(p.autoEmail) : !!base.autoEmail,
        autoKinds: kinds,
        sendFrom: has('sendFrom') ? intIn_(p.sendFrom, 0, 23, 'بداية ساعات الإرسال') : base.sendFrom,
        sendTo: has('sendTo') ? intIn_(p.sendTo, 1, 24, 'نهاية ساعات الإرسال') : base.sendTo,
        dailyCap: has('dailyCap') ? intIn_(p.dailyCap, 1, 1000, 'الحد اليومي للرسائل التلقائية') : base.dailyCap,
        senderName: has('senderName') ? optionalText(p.senderName, 60) : base.senderName
      };
      if (next.sendFrom >= next.sendTo) throw appError('نهاية ساعات الإرسال يجب أن تكون بعد بدايتها.');
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
      'sub.settings.save': { perm: mgr, fn: Subscribers.settingsSave },
      'sub.followup': { perm: staff, fn: Subscribers.followup },
      'sub.templates': { perm: staff, fn: Subscribers.templates },
      'sub.template.save': { perm: mgr, fn: Subscribers.templateSave },
      'sub.template.remove': { perm: mgr, fn: Subscribers.templateRemove },
      'sub.message.preview': { perm: staff, fn: Subscribers.messagePreview },
      'sub.message.whatsapp': { perm: staff, fn: Subscribers.messageWhatsapp },
      'sub.message.email': { perm: staff, fn: Subscribers.messageEmail },
      'sub.contact.log': { perm: staff, fn: Subscribers.contactLog },
      'sub.contact.update': { perm: staff, fn: Subscribers.contactUpdate },
      'sub.reminders.run': { perm: mgr, fn: Subscribers.remindersRun },
      'sub.report': { perm: any, fn: Subscribers.report },
      'sub.report.export': { perm: mgr, fn: Subscribers.reportExport },
      'sub.unsub.view': { public: true, fn: Subscribers.unsubView },
      'sub.unsub.confirm': { public: true, fn: Subscribers.unsubConfirm }
    };
  }
};

/** مشغّل زمني: كل ساعة، البريد التلقائي للمشتركين حسب الإعدادات */
function subscriberReminders() {
  try { return Subscribers.autoEmail_(); } catch (e) { console.error('sub reminders: ' + (e.stack || e)); return null; }
}
