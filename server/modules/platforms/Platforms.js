/**
 * وحدة المنصات (0.10.0): إيرادات التطبيقات التي تشغّلها الشركة — صاد القرآني ومقرأة تراث. docs/04 §7ب
 *
 * - مصدران للإيراد لا يُجمعان مرتين: مبيعات التطبيق من ملف بوابة الدفع (Sales، عملية لكل سطر)،
 *   والرعايات والعقود وهي مشاريع في وحدة العملاء مربوطة بالمنصة والمركز والمسابقة (تُقرأ هنا ولا تُكتب).
 * - ملف البوابة يُقرأ في المتصفح ويُرسل جدولاً من النصوص. الأعمدة تُعرف من محتواها لا من عناوينها
 *   (عناوين ملف البوابة تنقص عموداً عن البيانات). لا يُحفظ الاسم ولا الجوال ولا البريد: المشتري يُعرف برمز HMAC
 *   بمفتاح سري في Script Properties، والملف الأصلي لا يُحفظ.
 * - تُحسب العمليات المقبوضة (CAPTURED) فقط، والمكرر برقم العملية يُتجاهل، والباقة التجريبية تُستبعد،
 *   وشهر العملية بتوقيت الكويت.
 * - الشهر مسودة (يُستورد إليه ويُفرَّغ) حتى يعتمده مدير المنصات فيُقفل، ويُعاد فتحه بسبب.
 * - العمولة: نسبة مئوية + رسم ثابت لكل وسيلة دفع (إعدادات الوحدة)، وتغييرها يعيد حساب الأشهر غير المعتمدة.
 * - المبالغ بالفلس.
 */
var PLT_SCHEMA = {
  Platforms: [
    ['id', 'text'], ['key', 'text'], ['name', 'text'], ['hasAppSales', 'bool'], ['gateway', 'text'], ['currency', 'text'],
    ['active', 'bool'], ['sortOrder', 'num']
  ],
  Packages: [
    ['id', 'text'], ['platformId', 'text'], ['name', 'text'], ['code', 'text'], ['aliases', 'json'], ['kind', 'text'], ['price', 'num'],
    ['durationDays', 'num'], ['unitPrice', 'num'], ['rank', 'num'], ['active', 'bool'], ['sortOrder', 'num'], ['updatedAt', 'ts']
  ],
  Centers: [
    ['id', 'text'], ['platformId', 'text'], ['name', 'text'], ['status', 'text'], ['startDate', 'date'], ['endDate', 'date'],
    ['managerName', 'text'], ['notes', 'text'], ['createdBy', 'text'], ['createdAt', 'ts'], ['updatedAt', 'ts']
  ],
  Campaigns: [
    ['id', 'text'], ['platformId', 'text'], ['centerId', 'text'], ['kind', 'text'], ['name', 'text'], ['startDate', 'date'], ['endDate', 'date'],
    ['status', 'text'], ['participants', 'num'], ['notes', 'text'], ['createdBy', 'text'], ['createdAt', 'ts'], ['updatedAt', 'ts']
  ],
  Sales: [
    ['id', 'text'], ['gatewayId', 'text'], ['chargeRef', 'text'], ['platformId', 'text'], ['packageId', 'text'], ['kind', 'text'],
    ['method', 'text'], ['channel', 'text'], ['paidAt', 'text'], ['month', 'text'], ['amount', 'num'], ['fee', 'num'], ['net', 'num'],
    ['people', 'num'], ['country', 'text'], ['buyerKey', 'text'], ['expiresAt', 'date'], ['refunded', 'num'], ['importId', 'text']
  ],
  Months: [
    ['id', 'text'], ['platformId', 'text'], ['month', 'text'], ['status', 'text'], ['approvedBy', 'text'], ['approvedAt', 'ts'],
    ['reopenedBy', 'text'], ['reopenReason', 'text'], ['updatedAt', 'ts']
  ],
  Imports: [
    ['id', 'text'], ['platformId', 'text'], ['month', 'text'], ['months', 'json'], ['fileName', 'text'], ['rows', 'num'], ['accepted', 'num'],
    ['duplicates', 'num'], ['excluded', 'json'], ['matched', 'json'], ['totals', 'json'], ['importedBy', 'text'], ['importedAt', 'ts']
  ],
  Config: [['id', 'text'], ['key', 'text'], ['value', 'json'], ['updatedBy', 'text'], ['updatedAt', 'ts']]
};

var PLT = {
  KIND: { subscription: 'اشتراك', gift: 'إهداء', test: 'تجريبية' },
  METHOD: { knet: 'كي نت', applepay: 'Apple Pay', card: 'بطاقة', other: 'أخرى' },
  CHANNEL: { app: 'التطبيق', web: 'الويب' },
  CENTER_STATUS: { active: 'نشط', paused: 'متوقف مؤقتاً', closed: 'مغلق' },
  CAMPAIGN_KIND: { competition: 'مسابقة', challenge: 'تحدٍّ' },
  CAMPAIGN_STATUS: { planned: 'مخطط', running: 'جارٍ', ended: 'منتهٍ', cancelled: 'ملغى' },
  REVENUE_KIND: { sponsorship: 'رعاية', contract: 'عقد خدمة' },
  MONTH_STATUS: { draft: 'مسودة', approved: 'معتمد' },
  // أسماء وسائل الدفع كما تكتبها البوابة
  METHOD_ALIASES: { knet: 'knet', 'apple pay': 'applepay', apple: 'applepay', applepay: 'applepay', card: 'card', visa: 'card', mastercard: 'card', 'credit card': 'card', mada: 'card' },
  COUNTRIES: {
    kuwait: 'الكويت', 'saudi arabia': 'السعودية', qatar: 'قطر', 'united arab emirates': 'الإمارات', uae: 'الإمارات', bahrain: 'البحرين', oman: 'عُمان',
    yemen: 'اليمن', jordan: 'الأردن', lebanon: 'لبنان', egypt: 'مصر', iraq: 'العراق', syria: 'سوريا', palestine: 'فلسطين', sudan: 'السودان',
    morocco: 'المغرب', algeria: 'الجزائر', tunisia: 'تونس', libya: 'ليبيا', 'united states': 'الولايات المتحدة', 'united kingdom': 'المملكة المتحدة',
    pakistan: 'باكستان', india: 'الهند', turkey: 'تركيا'
  },
  SEED_PLATFORMS: [['saad', 'صاد القرآني', true], ['maqraa', 'مقرأة تراث', false]],
  // [الاسم في التقرير، الاسم في ملف البوابة، النوع، السعر بالدينار، المدة بالأيام، قيمة رعاية الفرد، الترتيب]
  SEED_PACKAGES: [
    ['الباقة البرونزية', 'برونزي', 'subscription', 6, 30, 0, 1],
    ['الباقة الفضية', 'فضي', 'subscription', 15, 90, 0, 2],
    ['الباقة الذهبية', 'ذهبي', 'subscription', 30, 120, 0, 3],
    ['باقة الإهداء (علم وتعلم)', 'علم وتعلم', 'gift', 10, 0, 10, 0],
    ['باقة تجريبية', 'باقة تجريبية', 'test', 1, 0, 0, 0]
  ],
  MAX_ROWS: 5000,
  OTHER_COUNTRIES_AFTER: 8
};

var Platforms = {
  // ───────── أساسيات ─────────
  rows_: function (t) { return Db.view('platforms', t); },
  isMgr_: function (ctx) { return Permissions.has(ctx, 'platforms', ['manager']); },
  isAcc_: function (ctx) { return Permissions.has(ctx, 'platforms', ['manager', 'accountant']); },
  enabled_: function (key) { var m = moduleDef_(key); return !!(m && m.enabled); },
  sortOrder_: function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.name).localeCompare(String(b.name), 'ar'); },

  enum_: function (value, dict, label, fallback) {
    var v = String(value == null || value === '' ? (fallback == null ? '' : fallback) : value);
    if (!Object.prototype.hasOwnProperty.call(dict, v)) throw appError(label + ' غير صحيح.');
    return v;
  },

  /** المنصتان والباقات مبدئياً عند أول تشغيل */
  seed_: function () {
    if (Platforms.rows_('Platforms').length) return;
    withLock(function () {
      if (Db.all('platforms', 'Platforms').length) return;
      var ids = {};
      PLT.SEED_PLATFORMS.forEach(function (p, i) {
        ids[p[0]] = Db.insert('platforms', 'Platforms', { key: p[0], name: p[1], hasAppSales: p[2], gateway: p[2] ? 'Tap' : '', currency: 'KWD', active: true, sortOrder: i + 1 }).id;
      });
      Db.insertMany('platforms', 'Packages', PLT.SEED_PACKAGES.map(function (k, i) {
        return { platformId: ids.saad, name: k[0], code: k[1], aliases: [], kind: k[2], price: k[3] * 1000, durationDays: k[4], unitPrice: k[5] * 1000, rank: k[6], active: true, sortOrder: i + 1, updatedAt: nowIso() };
      }));
    });
  },

  platforms_: function () { Platforms.seed_(); return Platforms.rows_('Platforms').slice().sort(Platforms.sortOrder_); },
  platform_: function (id) {
    var p = Platforms.platforms_().filter(function (x) { return x.id === id || x.key === id; })[0];
    if (!p) throw appError('المنصة غير موجودة.', 'NOT_FOUND');
    return p;
  },
  /** فلتر المنصة في الشاشات: '' أو 'all' للكل، أو مفتاح المنصة أو معرّفها */
  platformFilter_: function (value) {
    if (!value || value === 'all') return null;
    return Platforms.platform_(String(value)).id;
  },

  config_: function (key, fallback) {
    var r = Platforms.rows_('Config').filter(function (x) { return x.key === key; })[0];
    return r && r.value != null ? r.value : fallback;
  },
  setConfig_: function (key, value, user) {
    var cur = Db.all('platforms', 'Config').filter(function (x) { return x.key === key; })[0];
    if (cur) Db.update('platforms', 'Config', cur.id, { value: value, updatedBy: user.id, updatedAt: nowIso() });
    else Db.insert('platforms', 'Config', { key: key, value: value, updatedBy: user.id, updatedAt: nowIso() });
  },

  /** العمولة لكل وسيلة: { knet: { pct: 0, fixed: 0 }, … } — النسبة رقم مئوي (2.5 = 2.5%) والرسم بالفلس */
  fees_: function () {
    var saved = Platforms.config_('fees', {}) || {}, out = {};
    Object.keys(PLT.METHOD).forEach(function (m) {
      var f = saved[m] || {};
      out[m] = { pct: Number(f.pct) || 0, fixed: Math.round(Number(f.fixed) || 0) };
    });
    return out;
  },
  feeOf_: function (fees, method, amount) {
    var f = fees[method] || fees.other || { pct: 0, fixed: 0 };
    return Math.min(amount, Math.round(amount * f.pct / 100) + f.fixed);
  },

  /** مفتاح سري لرمز المشتري، يُنشأ مرة واحدة ولا يظهر في الكود */
  secret_: function () {
    var props = PropertiesService.getScriptProperties();
    var s = props.getProperty('PLT_BUYER_SECRET');
    if (!s) { s = randomToken_(); props.setProperty('PLT_BUYER_SECRET', s); }
    return s;
  },
  buyerKey_: function (mobile, email, secret) {
    var d = normalizeDigits(mobile || '').replace(/\D/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.length > 8 && d.indexOf('965') === 0) d = d.slice(3);
    var e = String(email || '').trim().toLowerCase();
    var id = d.length >= 7 ? 'm:' + d : (e.indexOf('@') > 0 ? 'e:' + e : '');
    return id ? hmacHex_(id, secret).slice(0, 24) : '';
  },

  countryLabel_: function (c) {
    if (!c) return '';
    return PLT.COUNTRIES[String(c).trim().toLowerCase()] || String(c).trim();
  },

  monthRow_: function (platformId, month) {
    return Platforms.rows_('Months').filter(function (r) { return r.platformId === platformId && r.month === month; })[0] || null;
  },
  monthStatus_: function (platformId, month) {
    var r = Platforms.monthRow_(platformId, month);
    return r ? r.status : 'draft';
  },

  // ───────── قراءة ملف البوابة ─────────
  cell_: function (v) { return v == null ? '' : String(v).trim(); },

  /** يعرف أعمدة الملف من محتواها. rows: صفوف نصوص (قد يكون الأول عناوين). */
  detectColumns_: function (rows) {
    var width = 0;
    rows.forEach(function (r) { width = Math.max(width, r.length); });
    // العينة: صفوف البيانات فقط (فيها رقم عملية في أول الأعمدة)، لا سطر العناوين
    var sample = rows.filter(function (r) { return r.slice(0, 3).some(function (v) { return /^\d{1,12}$/.test(Platforms.cell_(v)); }); }).slice(0, 400);
    if (!sample.length) sample = rows.slice(0, 400);
    var share = function (col, re) {
      var n = 0, hit = 0;
      sample.forEach(function (r) { var v = Platforms.cell_(r[col]); if (!v) return; n++; if (re.test(v)) hit++; });
      return n ? hit / sample.length : 0;
    };
    var best = function (re, from, to, min) {
      var col = -1, score = min || 0.5;
      for (var c = from || 0; c < (to == null ? width : to); c++) { var s = share(c, re); if (s > score) { score = s; col = c; } }
      return col;
    };
    var cols = {};
    cols.id = best(/^\d{1,12}$/, 0, Math.min(width, 3));
    cols.status = best(/^CAPTURED$/);
    if (cols.status < 0) cols.status = best(/^[A-Z_]{4,}$/);
    cols.type = best(/^(شراء باقة|كفالات|كفالة|إهداء)$/);
    cols.utc = best(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/);
    cols.local = best(/^\d{1,2} [A-Za-z]{3},? \d{4},? \d{1,2}:\d{2}(:\d{2})?$/);
    cols.channel = best(/^(sdk|web|ios|android|app)$/i);
    cols.currency = best(/^[A-Z]{3}$/);
    if (cols.currency === cols.status) cols.currency = -1;
    cols.method = best(/^(knet|apple ?pay|apple|card|visa|mastercard|mada|credit card)$/i, 0, null, 0.3);
    cols.charge = best(/^chg_/);
    var personalTo = cols.type > 0 ? cols.type : width;
    cols.mobile = best(/^\+?[\d\s-]{7,16}$/, cols.id + 1, personalTo, 0.02);
    cols.email = best(/@/, cols.id + 1, personalTo, 0.02);
    cols.country = cols.type > 0 && cols.type - 1 !== cols.email && cols.type - 1 !== cols.mobile ? cols.type - 1 : -1;
    cols.pkg = cols.type >= 0 ? cols.type + 1 : -1;
    // المبلغ: العمود الرقمي قبل العملة
    cols.amount = cols.currency > 0 && share(cols.currency - 1, /^\d+(\.\d+)?$/) > 0.5 ? cols.currency - 1 : best(/^\d+\.\d{1,3}$/);
    var need = { id: 'رقم العملية', status: 'حالة الدفع', type: 'نوع العملية', amount: 'المبلغ' };
    var missing = Object.keys(need).filter(function (k) { return cols[k] < 0; }).map(function (k) { return need[k]; });
    if (cols.utc < 0 && cols.local < 0) missing.push('وقت الدفع');
    if (missing.length) throw appError('لم أتعرف على أعمدة الملف: ' + missing.join('، ') + '. تأكد أنه ملف المدفوعات من بوابة الدفع.');
    return cols;
  },

  MONTHS_EN_: { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 },

  /** وقت الدفع بتوقيت الكويت «YYYY-MM-DD HH:MM» */
  paidAt_: function (row, cols) {
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var lv = cols.local >= 0 ? Platforms.cell_(row[cols.local]) : '';
    var m = /^(\d{1,2}) ([A-Za-z]{3}),? (\d{4}),? (\d{1,2}):(\d{2})/.exec(lv);
    if (m && Platforms.MONTHS_EN_[m[2].toLowerCase()]) {
      return m[3] + '-' + pad(Platforms.MONTHS_EN_[m[2].toLowerCase()]) + '-' + pad(Number(m[1])) + ' ' + pad(Number(m[4])) + ':' + m[5];
    }
    var u = cols.utc >= 0 ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(Platforms.cell_(row[cols.utc])) : null;
    if (!u) return '';
    var t = Date.UTC(+u[1], +u[2] - 1, +u[3], +u[4], +u[5]) + KW_OFFSET_MS;
    var d = new Date(t);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  },

  methodOf_: function (v) {
    var k = String(v || '').trim().toLowerCase();
    return PLT.METHOD_ALIASES[k] || (k ? 'other' : 'other');
  },
  channelOf_: function (v) {
    var k = String(v || '').trim().toLowerCase();
    return k === 'web' ? 'web' : 'app';
  },

  /** الباقة من اسمها في الملف (الرمز أو أحد الأسماء البديلة) */
  packageIndex_: function (platformId) {
    var idx = {};
    Platforms.rows_('Packages').filter(function (p) { return p.platformId === platformId; }).forEach(function (p) {
      [p.code].concat(p.aliases || []).forEach(function (c) { if (c) idx[String(c).trim()] = p; });
    });
    return idx;
  },

  /**
   * يحلّل الملف إلى عمليات جاهزة للحفظ، دون كتابة. map: { اسم غير معروف: packageId }
   * يعيد { cols, items (للحفظ), stats, unmatched, months }
   */
  analyze_: function (platform, rows, map) {
    if (!platform.hasAppSales) throw appError('هذه المنصة ليس لها مبيعات تطبيق.');
    if (!Array.isArray(rows) || !rows.length) throw appError('الملف فارغ.');
    if (rows.length > PLT.MAX_ROWS) throw appError('الملف كبير جداً: الحد ' + PLT.MAX_ROWS + ' سطر في المرة.');
    rows = rows.map(function (r) { return Array.isArray(r) ? r.map(Platforms.cell_) : []; });
    var cols = Platforms.detectColumns_(rows);
    var pk = Platforms.packageIndex_(platform.id), pkById = indexBy_(Platforms.rows_('Packages'));
    map = map || {};
    var have = {};
    Platforms.rows_('Sales').forEach(function (s) { have[s.gatewayId] = s; });
    var fees = Platforms.fees_(), secret = Platforms.secret_();
    var seen = {}, items = [], unmatched = {}, months = {};
    var stats = { rows: 0, accepted: 0, duplicates: 0, notCaptured: 0, test: 0, invalid: 0, amount: 0 };
    rows.forEach(function (r) {
      var gid = r[cols.id];
      if (!/^\d{1,12}$/.test(gid)) return; // سطر عناوين أو فارغ
      stats.rows++;
      if (String(r[cols.status]).toUpperCase() !== 'CAPTURED') { stats.notCaptured++; return; }
      if (seen[gid] || have[gid]) { stats.duplicates++; return; }
      seen[gid] = true;
      var name = r[cols.pkg] || '';
      var p = pk[name] || (map[name] && pkById[map[name]]);
      if (p && p.platformId !== platform.id) p = null;
      if (!p) {
        unmatched[name] = unmatched[name] || { name: name, count: 0, amount: 0, type: r[cols.type] || '' };
        unmatched[name].count++;
        unmatched[name].amount += Math.round(Number(r[cols.amount]) * 1000) || 0;
        return;
      }
      if (p.kind === 'test') { stats.test++; return; }
      var amount = Math.round(Number(r[cols.amount]) * 1000);
      var paidAt = Platforms.paidAt_(r, cols);
      if (!(amount > 0) || !paidAt) { stats.invalid++; return; }
      var day = paidAt.slice(0, 10), month = paidAt.slice(0, 7), method = Platforms.methodOf_(cols.method >= 0 ? r[cols.method] : '');
      var fee = Platforms.feeOf_(fees, method, amount);
      var buyer = p.kind === 'gift' ? '' : Platforms.buyerKey_(cols.mobile >= 0 ? r[cols.mobile] : '', cols.email >= 0 ? r[cols.email] : '', secret);
      items.push({
        gatewayId: gid, chargeRef: cols.charge >= 0 ? r[cols.charge] : '', platformId: platform.id, packageId: p.id, kind: p.kind,
        method: method, channel: Platforms.channelOf_(cols.channel >= 0 ? r[cols.channel] : ''), paidAt: paidAt, month: month,
        amount: amount, fee: fee, net: amount - fee,
        people: p.kind === 'gift' && p.unitPrice ? Math.round(amount * 100 / p.unitPrice) / 100 : 0,
        country: cols.country >= 0 ? r[cols.country] : '', buyerKey: buyer,
        expiresAt: p.kind === 'subscription' && p.durationDays ? addDays_(day, p.durationDays) : '', refunded: 0
      });
      stats.accepted++;
      stats.amount += amount;
      months[month] = (months[month] || 0) + 1;
    });
    return { cols: cols, items: items, stats: stats, unmatched: Object.keys(unmatched).map(function (k) { return unmatched[k]; }), months: months };
  },

  /** ملخص المعاينة: حسب الشهر والباقة */
  previewView_: function (platform, a) {
    var pkById = indexBy_(Platforms.rows_('Packages')), byPkg = {};
    a.items.forEach(function (s) {
      var x = byPkg[s.packageId] = byPkg[s.packageId] || { packageId: s.packageId, name: pkById[s.packageId].name, kind: s.kind, count: 0, amount: 0, people: 0 };
      x.count++; x.amount += s.amount; x.people += s.people;
    });
    return {
      platformId: platform.id, platformName: platform.name, stats: a.stats, unmatched: a.unmatched,
      months: Object.keys(a.months).sort().map(function (m) { return { month: m, count: a.months[m], status: Platforms.monthStatus_(platform.id, m) }; }),
      packages: Object.keys(byPkg).map(function (k) { return byPkg[k]; }).sort(function (x, y) { return y.amount - x.amount; }),
      fee: a.items.reduce(function (s, x) { return s + x.fee; }, 0),
      packageOptions: Platforms.rows_('Packages').filter(function (p) { return p.platformId === platform.id && p.active; }).sort(Platforms.sortOrder_)
        .map(function (p) { return { id: p.id, name: p.name, kind: p.kind }; })
    };
  },

  // ───────── العرض ─────────
  packageView_: function (p) {
    return {
      id: p.id, platformId: p.platformId, name: p.name, code: p.code || '', aliases: p.aliases || [], kind: p.kind, kindLabel: PLT.KIND[p.kind] || '',
      price: p.price || 0, durationDays: p.durationDays || 0, unitPrice: p.unitPrice || 0, rank: p.rank || 0, active: !!p.active, sortOrder: p.sortOrder || 0
    };
  },

  /** مشاريع العملاء المربوطة بالمنصات مع دفعاتها المحصّلة (قراءة فقط) */
  crm_: function () {
    if (!Platforms.enabled_('crm')) return { projects: [], paid: [], scheduled: [], clients: {} };
    var projects = Db.view('crm', 'Projects').filter(function (p) { return p.platformId; });
    var ids = {};
    projects.forEach(function (p) { ids[p.id] = p; });
    var paid = Db.view('crm', 'Payments').filter(function (x) { return ids[x.projectId] && x.status === 'paid' && x.date; })
      .map(function (x) { return { projectId: x.projectId, amount: x.amount, date: x.date, project: ids[x.projectId] }; });
    var scheduled = Db.view('crm', 'Payments').filter(function (x) { return ids[x.projectId] && x.status === 'scheduled'; })
      .map(function (x) { return { projectId: x.projectId, amount: x.amount, date: x.date || '', project: ids[x.projectId] }; });
    return { projects: projects, paid: paid, scheduled: scheduled, clients: indexBy_(Db.view('crm', 'Clients')) };
  },

  centerView_: function (c, crm, campaigns) {
    var projects = crm.projects.filter(function (p) { return p.centerId === c.id; });
    var pids = {};
    projects.forEach(function (p) { pids[p.id] = true; });
    var collected = crm.paid.filter(function (x) { return pids[x.projectId]; }).reduce(function (s, x) { return s + x.amount; }, 0);
    var due = crm.scheduled.filter(function (x) { return pids[x.projectId]; }).reduce(function (s, x) { return s + x.amount; }, 0);
    var sponsors = {};
    projects.forEach(function (p) { var cl = crm.clients[p.clientId]; if (cl) sponsors[cl.id] = cl.name; });
    return {
      id: c.id, platformId: c.platformId, name: c.name, status: c.status, statusLabel: PLT.CENTER_STATUS[c.status] || '', startDate: c.startDate || '', endDate: c.endDate || '',
      managerName: c.managerName || '', notes: c.notes || '', projectsCount: projects.length, collected: collected, scheduled: due,
      sponsors: Object.keys(sponsors).map(function (k) { return { id: k, name: sponsors[k] }; }),
      projects: projects.map(function (p) { return { id: p.id, name: p.name, clientName: (crm.clients[p.clientId] || {}).name || '', revenueKind: p.revenueKind || '' }; }),
      campaignsCount: campaigns.filter(function (x) { return x.centerId === c.id; }).length
    };
  },

  campaignView_: function (x, crm, centers) {
    var projects = crm.projects.filter(function (p) { return p.campaignId === x.id; });
    var pids = {};
    projects.forEach(function (p) { pids[p.id] = true; });
    var pledged = projects.reduce(function (s, p) { return s + (p.billing === 'fixed' ? p.contractValue || 0 : 0); }, 0);
    var collected = crm.paid.filter(function (y) { return pids[y.projectId]; }).reduce(function (s, y) { return s + y.amount; }, 0);
    var center = x.centerId && centers[x.centerId];
    return {
      id: x.id, platformId: x.platformId, centerId: x.centerId || '', centerName: center ? center.name : '', kind: x.kind, kindLabel: PLT.CAMPAIGN_KIND[x.kind] || '',
      name: x.name, startDate: x.startDate || '', endDate: x.endDate || '', status: x.status, statusLabel: PLT.CAMPAIGN_STATUS[x.status] || '',
      participants: x.participants || 0, notes: x.notes || '', pledged: pledged, collected: collected, remaining: Math.max(0, pledged - collected),
      sponsors: projects.map(function (p) { return { projectId: p.id, projectName: p.name, clientName: (crm.clients[p.clientId] || {}).name || '' }; })
    };
  },

  // ───────── القراءة ─────────
  lookups: function (ctx) {
    var dict = function (d) { return Object.keys(d).map(function (k) { return { id: k, label: d[k] }; }); };
    var platforms = Platforms.platforms_();
    return {
      isManager: Platforms.isMgr_(ctx), isAccountant: Platforms.isAcc_(ctx), today: localDate_(), month: localMonth_(),
      platforms: platforms.map(function (p) { return { id: p.id, key: p.key, name: p.name, hasAppSales: !!p.hasAppSales, gateway: p.gateway || '', active: !!p.active }; }),
      packages: Platforms.rows_('Packages').slice().sort(Platforms.sortOrder_).map(Platforms.packageView_),
      centers: Platforms.rows_('Centers').map(function (c) { return { id: c.id, platformId: c.platformId, name: c.name, status: c.status }; })
        .sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); }),
      campaigns: Platforms.rows_('Campaigns').map(function (c) { return { id: c.id, platformId: c.platformId, centerId: c.centerId || '', name: c.name, status: c.status }; })
        .sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); }),
      fees: Platforms.fees_(),
      kinds: dict(PLT.KIND), methods: dict(PLT.METHOD), channels: dict(PLT.CHANNEL), centerStatuses: dict(PLT.CENTER_STATUS),
      campaignKinds: dict(PLT.CAMPAIGN_KIND), campaignStatuses: dict(PLT.CAMPAIGN_STATUS), revenueKinds: dict(PLT.REVENUE_KIND)
    };
  },

  /** واجهة عامة لوحدة العملاء: خيارات «ينفّذ في» والمركز والمسابقة في نموذج المشروع */
  linkOptions_: function () {
    if (!Platforms.enabled_('platforms')) return null;
    return {
      platforms: Platforms.platforms_().filter(function (p) { return p.active; }).map(function (p) { return { id: p.id, name: p.name }; }),
      centers: Platforms.rows_('Centers').filter(function (c) { return c.status !== 'closed'; }).map(function (c) { return { id: c.id, platformId: c.platformId, name: c.name }; }),
      campaigns: Platforms.rows_('Campaigns').filter(function (c) { return c.status !== 'cancelled'; }).map(function (c) { return { id: c.id, platformId: c.platformId, centerId: c.centerId || '', name: c.name }; }),
      revenueKinds: Object.keys(PLT.REVENUE_KIND).map(function (k) { return { id: k, label: PLT.REVENUE_KIND[k] }; })
    };
  },

  /** واجهة عامة لوحدة العملاء: يتحقق من الربط ويعيد الحقول المنظَّفة */
  validateLink_: function (p) {
    var out = { platformId: '', centerId: '', campaignId: '', revenueKind: '' };
    if (!p || !p.platformId) return out;
    out.platformId = Platforms.platform_(String(p.platformId)).id;
    if (p.centerId) {
      var c = Db.get('platforms', 'Centers', String(p.centerId));
      if (!c || c.platformId !== out.platformId) throw appError('المركز غير موجود في هذه المنصة.');
      out.centerId = c.id;
    }
    if (p.campaignId) {
      var k = Db.get('platforms', 'Campaigns', String(p.campaignId));
      if (!k || k.platformId !== out.platformId) throw appError('المسابقة غير موجودة في هذه المنصة.');
      out.campaignId = k.id;
    }
    out.revenueKind = p.revenueKind ? Platforms.enum_(p.revenueKind, PLT.REVENUE_KIND, 'نوع الإيراد') : '';
    return out;
  },

  /** واجهة عامة لوحدة العملاء: أسماء الربط لعرض المشروع */
  linkLabels_: function (p) {
    if (!p || !p.platformId) return null;
    var pl = Db.get('platforms', 'Platforms', p.platformId), c = p.centerId && Db.get('platforms', 'Centers', p.centerId), k = p.campaignId && Db.get('platforms', 'Campaigns', p.campaignId);
    return { platformName: pl ? pl.name : '', centerName: c ? c.name : '', campaignName: k ? k.name : '', revenueKindLabel: PLT.REVENUE_KIND[p.revenueKind] || '' };
  },

  /** جدول الأشهر: العدد والإجمالي والعمولة والصافي والحالة لكل منصة لها مبيعات */
  months: function (ctx, p) {
    p = p || {};
    var pf = Platforms.platformFilter_(p.platform), plats = indexBy_(Platforms.platforms_()), agg = {};
    Platforms.rows_('Sales').forEach(function (s) {
      if (pf && s.platformId !== pf) return;
      var k = s.platformId + '|' + s.month;
      var x = agg[k] = agg[k] || { platformId: s.platformId, month: s.month, count: 0, amount: 0, fee: 0, net: 0, refunded: 0, people: 0 };
      x.count++; x.amount += s.amount; x.fee += s.fee; x.net += s.net; x.refunded += s.refunded || 0; x.people += s.people || 0;
    });
    Platforms.rows_('Months').forEach(function (m) {
      if (pf && m.platformId !== pf) return;
      var k = m.platformId + '|' + m.month;
      agg[k] = agg[k] || { platformId: m.platformId, month: m.month, count: 0, amount: 0, fee: 0, net: 0, refunded: 0, people: 0 };
    });
    var users = indexBy_(Db.view('core', 'Users'));
    var imports = Platforms.rows_('Imports');
    return Object.keys(agg).map(function (k) {
      var x = agg[k], row = Platforms.monthRow_(x.platformId, x.month), st = row ? row.status : 'draft';
      var last = imports.filter(function (i) { return i.platformId === x.platformId && (i.months || []).indexOf(x.month) >= 0; })
        .sort(function (a, b) { return (b.importedAt || '').localeCompare(a.importedAt || ''); })[0];
      return Object.assign(x, {
        platformName: (plats[x.platformId] || {}).name || '', status: st, statusLabel: PLT.MONTH_STATUS[st],
        approvedByName: row && row.approvedBy && users[row.approvedBy] ? users[row.approvedBy].fullName : '', approvedAt: row ? row.approvedAt || '' : '',
        reopenReason: row ? row.reopenReason || '' : '',
        lastImport: last ? { fileName: last.fileName, at: last.importedAt, byName: users[last.importedBy] ? users[last.importedBy].fullName : '' } : null
      });
    }).sort(function (a, b) { return b.month.localeCompare(a.month) || a.platformName.localeCompare(b.platformName, 'ar'); });
  },

  /** العمليات لعرض ما وراء الرقم: month مطلوب، والتصفية packageId, kind, method, channel, country, buyer (new|returning|upgrade) */
  sales: function (ctx, p) {
    p = p || {};
    var month = requireMonth_(p.month), pf = Platforms.platformFilter_(p.platform);
    var pkById = indexBy_(Platforms.rows_('Packages')), all = Platforms.rows_('Sales').filter(function (s) { return !pf || s.platformId === pf; });
    var flags = Platforms.buyerFlags_(all);
    var rows = all.filter(function (s) {
      if (s.month !== month) return false;
      if (p.packageId && s.packageId !== p.packageId) return false;
      if (p.kind && s.kind !== p.kind) return false;
      if (p.method && s.method !== p.method) return false;
      if (p.channel && s.channel !== p.channel) return false;
      if (p.country != null && p.country !== '' && Platforms.countryKey_(s.country) !== p.country) return false;
      if (p.buyer === 'new' && !flags.firstSale[s.id]) return false;
      if (p.buyer === 'returning' && (!s.buyerKey || flags.firstSale[s.id])) return false;
      if (p.buyer === 'upgrade' && !flags.upgrade[s.id]) return false;
      return true;
    }).sort(function (a, b) { return b.paidAt.localeCompare(a.paidAt); });
    return rows.map(function (s) {
      var pk = pkById[s.packageId] || {};
      return {
        id: s.id, gatewayId: s.gatewayId, paidAt: s.paidAt, packageId: s.packageId, packageName: pk.name || '', kind: s.kind, kindLabel: PLT.KIND[s.kind] || '',
        method: s.method, methodLabel: PLT.METHOD[s.method] || s.method, channel: s.channel, channelLabel: PLT.CHANNEL[s.channel] || s.channel,
        amount: s.amount, fee: s.fee, net: s.net, people: s.people || 0, country: Platforms.countryLabel_(s.country),
        buyer: s.buyerKey ? (flags.firstSale[s.id] ? 'new' : 'returning') : '', upgrade: !!flags.upgrade[s.id], expiresAt: s.expiresAt || ''
      };
    });
  },

  countryKey_: function (c) { return String(c || '').trim().toLowerCase(); },

  /** أول عملية لكل مشترٍ، والترقيات (شراء باقة اشتراك أعلى ترتيباً من اشتراك سابق للمشتري نفسه) */
  buyerFlags_: function (sales) {
    var ranks = {}, firstSale = {}, upgrade = {}, byBuyer = {};
    Platforms.rows_('Packages').forEach(function (p) { ranks[p.id] = p.rank || 0; });
    sales.filter(function (s) { return s.buyerKey; }).forEach(function (s) { (byBuyer[s.buyerKey] = byBuyer[s.buyerKey] || []).push(s); });
    Object.keys(byBuyer).forEach(function (k) {
      var list = byBuyer[k].sort(function (a, b) { return a.paidAt.localeCompare(b.paidAt) || a.gatewayId.localeCompare(b.gatewayId); });
      firstSale[list[0].id] = true;
      var maxRank = -1;
      list.forEach(function (s, i) {
        if (s.kind !== 'subscription') return;
        var r = ranks[s.packageId] || 0;
        if (i > 0 && maxRank >= 0 && r > maxRank) upgrade[s.id] = true;
        maxRank = Math.max(maxRank, r);
      });
    });
    return { firstSale: firstSale, upgrade: upgrade, byBuyer: byBuyer };
  },

  prevMonth_: function (m) { var p = m.split('-').map(Number); return p[1] === 1 ? (p[0] - 1) + '-12' : p[0] + '-' + (p[1] < 11 ? '0' : '') + (p[1] - 1); },
  nextMonth_: function (m) { var p = m.split('-').map(Number); return p[1] === 12 ? (p[0] + 1) + '-01' : p[0] + '-' + (p[1] < 9 ? '0' : '') + (p[1] + 1); },

  totals_: function (list) {
    var t = { count: list.length, amount: 0, fee: 0, net: 0, people: 0 };
    list.forEach(function (s) { t.amount += s.amount; t.fee += s.fee; t.net += s.net; t.people += s.people || 0; });
    t.people = Math.round(t.people * 100) / 100;
    t.avg = t.count ? Math.round(t.amount / t.count) : 0;
    return t;
  },

  /**
   * اللوحة: { platform: 'all'|key, month } — الأقسام الستة للتقرير الشهري + الرعايات والعقود من العملاء + اتجاه 12 شهراً
   */
  dashboard: function (ctx, p) {
    p = p || {};
    var pf = Platforms.platformFilter_(p.platform);
    var all = Platforms.rows_('Sales').filter(function (s) { return !pf || s.platformId === pf; });
    var latest = all.reduce(function (m, s) { return s.month > m ? s.month : m; }, '');
    var month = p.month ? requireMonth_(p.month) : (latest || localMonth_());
    var prev = Platforms.prevMonth_(month), next = Platforms.nextMonth_(month), after = Platforms.nextMonth_(next);
    var nextStart = next + '-01', afterStart = after + '-01';
    var cur = all.filter(function (s) { return s.month === month; }), before = all.filter(function (s) { return s.month === prev; });
    var pkById = indexBy_(Platforms.rows_('Packages')), flags = Platforms.buyerFlags_(all);

    // الرعايات والعقود (العملاء)
    var crm = Platforms.crm_();
    var crmPaid = crm.paid.filter(function (x) { return !pf || x.project.platformId === pf; });
    var sponsorIn = function (m) { return crmPaid.filter(function (x) { return x.date.slice(0, 7) === m; }).reduce(function (s, x) { return s + x.amount; }, 0); };
    var year = month.slice(0, 4);

    var t = Platforms.totals_(cur), tp = Platforms.totals_(before);
    var spNow = sponsorIn(month), spPrev = sponsorIn(prev);
    var ytdSales = all.filter(function (s) { return s.month.slice(0, 4) === year && s.month <= month; }).reduce(function (s, x) { return s + x.net; }, 0);
    var ytdSponsor = crmPaid.filter(function (x) { return x.date.slice(0, 4) === year && x.date.slice(0, 7) <= month; }).reduce(function (s, x) { return s + x.amount; }, 0);

    // حسب الباقة
    var byPkg = {};
    cur.forEach(function (s) {
      var x = byPkg[s.packageId] = byPkg[s.packageId] || { packageId: s.packageId, name: (pkById[s.packageId] || {}).name || '', kind: s.kind, count: 0, amount: 0, net: 0 };
      x.count++; x.amount += s.amount; x.net += s.net;
    });
    // الإهداء
    var gifts = cur.filter(function (s) { return s.kind === 'gift'; });
    var bucket = function (lo, hi) { return gifts.filter(function (s) { return s.people >= lo && s.people <= hi && Math.round(s.people) === s.people; }).length; };
    // المشترون
    var subsCur = cur.filter(function (s) { return s.buyerKey; });
    var buyersSet = {}, newSet = {};
    subsCur.forEach(function (s) { buyersSet[s.buyerKey] = (buyersSet[s.buyerKey] || 0) + 1; if (flags.firstSale[s.id]) newSet[s.buyerKey] = true; });
    var buyers = Object.keys(buyersSet).length, newBuyers = Object.keys(newSet).length;
    var repeat = Object.keys(buyersSet).filter(function (k) { return buyersSet[k] > 1; }).length;
    var subsAll = all.filter(function (s) { return s.kind === 'subscription' && s.expiresAt; });
    // حسب الوسيلة والقناة والدولة
    var group = function (list, keyOf, labelOf) {
      var g = {};
      list.forEach(function (s) {
        var k = keyOf(s), x = g[k] = g[k] || { key: k, label: labelOf(s, k), count: 0, amount: 0, fee: 0, net: 0 };
        x.count++; x.amount += s.amount; x.fee += s.fee; x.net += s.net;
      });
      return Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.amount - a.amount; });
    };
    var countries = group(cur, function (s) { return Platforms.countryKey_(s.country); }, function (s) { return Platforms.countryLabel_(s.country); });
    if (countries.length > PLT.OTHER_COUNTRIES_AFTER) {
      var rest = countries.slice(PLT.OTHER_COUNTRIES_AFTER - 1), o = { key: '*', label: 'أخرى', count: 0, amount: 0, fee: 0, net: 0 };
      rest.forEach(function (x) { o.count += x.count; o.amount += x.amount; o.fee += x.fee; o.net += x.net; });
      countries = countries.slice(0, PLT.OTHER_COUNTRIES_AFTER - 1).concat([o]);
    }
    // الاتجاه: 12 شهراً تنتهي بالشهر المختار
    var trend = [], m = month;
    for (var i = 0; i < 12; i++) { trend.unshift(m); m = Platforms.prevMonth_(m); }
    trend = trend.map(function (mm) {
      return { month: mm, sales: all.filter(function (s) { return s.month === mm; }).reduce(function (s, x) { return s + x.net; }, 0), sponsorship: sponsorIn(mm) };
    });
    // المراكز والمسابقات
    var centersAll = Platforms.rows_('Centers').filter(function (c) { return !pf || c.platformId === pf; });
    var campaignsAll = Platforms.rows_('Campaigns').filter(function (c) { return !pf || c.platformId === pf; });
    var centersIdx = indexBy_(Platforms.rows_('Centers'));
    var byCenter = centersAll.map(function (c) {
      var v = Platforms.centerView_(c, crm, campaignsAll);
      return { id: v.id, name: v.name, collected: v.collected, scheduled: v.scheduled, projectsCount: v.projectsCount, campaignsCount: v.campaignsCount };
    }).sort(function (a, b) { return b.collected - a.collected; });
    var campaigns = campaignsAll.filter(function (c) { return c.status === 'running' || c.status === 'planned'; })
      .map(function (c) { return Platforms.campaignView_(c, crm, centersIdx); })
      .sort(function (a, b) { return (a.endDate || '9999').localeCompare(b.endDate || '9999'); });
    // الجهات (العقود): المستحق والمحصّل لكل عميل
    var byClient = {};
    crm.projects.filter(function (pr) { return !pf || pr.platformId === pf; }).forEach(function (pr) {
      var cl = crm.clients[pr.clientId], k = pr.clientId;
      if (!cl) return;
      var x = byClient[k] = byClient[k] || { clientId: k, name: cl.name, collected: 0, scheduled: 0, overdue: 0, projects: 0 };
      x.projects++;
    });
    crm.paid.forEach(function (x) { if (byClient[x.project.clientId] && (!pf || x.project.platformId === pf)) byClient[x.project.clientId].collected += x.amount; });
    crm.scheduled.forEach(function (x) {
      var b = byClient[x.project.clientId];
      if (!b || (pf && x.project.platformId !== pf)) return;
      b.scheduled += x.amount;
      if (x.date && x.date < localDate_()) b.overdue += x.amount;
    });
    var monthRow = pf ? Platforms.monthRow_(pf, month) : null;
    return {
      platform: pf ? Platforms.platform_(pf).key : 'all', month: month, prevMonth: prev,
      months: Object.keys(all.reduce(function (o, s) { o[s.month] = true; return o; }, {})).sort().reverse(),
      monthStatus: pf ? (monthRow ? monthRow.status : (cur.length ? 'draft' : '')) : '',
      summary: {
        count: t.count, prevCount: tp.count, amount: t.amount, prevAmount: tp.amount, fee: t.fee, prevFee: tp.fee, net: t.net, prevNet: tp.net,
        avg: t.avg, prevAvg: tp.avg, people: t.people, prevPeople: tp.people,
        sponsorship: spNow, prevSponsorship: spPrev, revenue: t.net + spNow, prevRevenue: tp.net + spPrev,
        ytdSales: ytdSales, ytdSponsorship: ytdSponsor, ytd: ytdSales + ytdSponsor
      },
      byPackage: Object.keys(byPkg).map(function (k) { var x = byPkg[k]; x.share = t.amount ? Math.round(x.amount * 1000 / t.amount) / 10 : 0; return x; })
        .sort(function (a, b) { return (pkById[a.packageId] || {}).sortOrder - (pkById[b.packageId] || {}).sortOrder; }),
      gift: {
        count: gifts.length, amount: gifts.reduce(function (s, x) { return s + x.amount; }, 0),
        people: Math.round(gifts.reduce(function (s, x) { return s + x.people; }, 0) * 100) / 100,
        avgPeople: gifts.length ? Math.round(gifts.reduce(function (s, x) { return s + x.people; }, 0) * 10 / gifts.length) / 10 : 0,
        one: bucket(1, 1), two: bucket(2, 2), threeFour: bucket(3, 4), fivePlus: bucket(5, 100000),
        review: gifts.filter(function (s) { return Math.round(s.people) !== s.people; }).length
      },
      buyers: {
        buyers: buyers, newBuyers: newBuyers, returning: buyers - newBuyers, repeat: repeat,
        upgrades: cur.filter(function (s) { return flags.upgrade[s.id]; }).length,
        active: subsAll.filter(function (s) { return s.paidAt.slice(0, 10) < nextStart && s.expiresAt >= nextStart; }).length,
        expiring: subsAll.filter(function (s) { return s.expiresAt >= nextStart && s.expiresAt < afterStart; }).length,
        historyFrom: all.reduce(function (mn, s) { return !mn || s.month < mn ? s.month : mn; }, '')
      },
      methods: group(cur, function (s) { return s.method; }, function (s) { return PLT.METHOD[s.method] || s.method; }),
      channels: group(cur, function (s) { return s.channel; }, function (s) { return PLT.CHANNEL[s.channel] || s.channel; }),
      countries: countries,
      trend: trend,
      centers: byCenter,
      campaigns: campaigns,
      clients: Object.keys(byClient).map(function (k) {
        var x = byClient[k], base = x.collected + x.overdue;
        x.rate = base ? Math.round(x.collected * 100 / base) : null;
        return x;
      }).sort(function (a, b) { return (b.collected + b.scheduled) - (a.collected + a.scheduled); })
    };
  },

  centers: function (ctx, p) {
    p = p || {};
    var pf = Platforms.platformFilter_(p.platform), crm = Platforms.crm_(), campaigns = Platforms.rows_('Campaigns');
    return Platforms.rows_('Centers').filter(function (c) { return !pf || c.platformId === pf; })
      .map(function (c) { return Platforms.centerView_(c, crm, campaigns); })
      .sort(function (a, b) { return (a.status === 'closed') - (b.status === 'closed') || a.name.localeCompare(b.name, 'ar'); });
  },

  campaigns: function (ctx, p) {
    p = p || {};
    var pf = Platforms.platformFilter_(p.platform), crm = Platforms.crm_(), centers = indexBy_(Platforms.rows_('Centers'));
    var order = { running: 0, planned: 1, ended: 2, cancelled: 3 };
    return Platforms.rows_('Campaigns').filter(function (c) { return (!pf || c.platformId === pf) && (!p.centerId || c.centerId === p.centerId); })
      .map(function (c) { return Platforms.campaignView_(c, crm, centers); })
      .sort(function (a, b) { return order[a.status] - order[b.status] || (b.startDate || '').localeCompare(a.startDate || ''); });
  },

  // ───────── الاستيراد ─────────
  /** معاينة دون حفظ: { platform, rows: string[][], map } */
  importPreview: function (ctx, p) {
    p = p || {};
    var platform = Platforms.platform_(String(p.platform || 'saad'));
    return Platforms.previewView_(platform, Platforms.analyze_(platform, p.rows, p.map));
  },

  /** الحفظ كمسودة: { platform, rows, map, fileName }. الأسماء المطابَقة يدوياً تُحفظ اسماً بديلاً للباقة. */
  importCommit: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var platform = Platforms.platform_(String(p.platform || 'saad'));
      var a = Platforms.analyze_(platform, p.rows, p.map);
      if (a.unmatched.length) throw appError('طابق الباقات غير المعروفة أولاً: ' + a.unmatched.map(function (u) { return u.name || '(بلا اسم)'; }).join('، ') + '.');
      var locked = Object.keys(a.months).filter(function (m) { return Platforms.monthStatus_(platform.id, m) === 'approved'; });
      if (locked.length) throw appError('شهر ' + locked.join('، ') + ' معتمد ومقفل. أعد فتحه أولاً لإضافة عمليات إليه.');
      if (!a.items.length) throw appError('لا عمليات جديدة في الملف: ' + (a.stats.duplicates ? 'كل العمليات المقبوضة مستوردة من قبل.' : 'لا عمليات مقبوضة.'));
      // الأسماء البديلة من المطابقة اليدوية
      var map = p.map || {}, matched = [];
      Object.keys(map).forEach(function (name) {
        var pk = Db.get('platforms', 'Packages', String(map[name]));
        if (!pk || pk.platformId !== platform.id || !name) return;
        var aliases = (pk.aliases || []).slice();
        if (aliases.indexOf(name) < 0 && pk.code !== name) {
          aliases.push(name);
          Db.update('platforms', 'Packages', pk.id, { aliases: aliases, updatedAt: nowIso() });
          matched.push({ name: name, packageId: pk.id, packageName: pk.name });
        }
      });
      var months = Object.keys(a.months).sort();
      var main = months.slice().sort(function (x, y) { return a.months[y] - a.months[x]; })[0];
      var imp = Db.insert('platforms', 'Imports', {
        platformId: platform.id, month: main, months: months, fileName: optionalText(p.fileName, 160), rows: a.stats.rows, accepted: a.stats.accepted,
        duplicates: a.stats.duplicates, excluded: { notCaptured: a.stats.notCaptured, test: a.stats.test, invalid: a.stats.invalid }, matched: matched,
        totals: { amount: a.stats.amount }, importedBy: ctx.user.id, importedAt: nowIso()
      });
      Db.insertMany('platforms', 'Sales', a.items.map(function (s) { return Object.assign(s, { importId: imp.id }); }));
      months.forEach(function (m) {
        if (!Platforms.monthRow_(platform.id, m)) Db.insert('platforms', 'Months', { platformId: platform.id, month: m, status: 'draft', updatedAt: nowIso() });
      });
      Audit.log(ctx.user, 'platforms', 'import', 'Import', imp.id, {
        platform: platform.name, file: imp.fileName, months: months.join('، '), accepted: a.stats.accepted, duplicates: a.stats.duplicates,
        excluded: a.stats.notCaptured + a.stats.test + a.stats.invalid, amount: kwd_(a.stats.amount)
      });
      return { importId: imp.id, months: months, stats: a.stats, matched: matched };
    });
  },

  /** تفريغ شهر مسودة لإعادة استيراده: { platform, month } */
  monthClear: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var platform = Platforms.platform_(String(p.platform || 'saad')), month = requireMonth_(p.month);
      if (Platforms.monthStatus_(platform.id, month) === 'approved') throw appError('الشهر معتمد ومقفل. أعد فتحه أولاً.');
      var n = Db.removeWhere('platforms', 'Sales', function (s) { return s.platformId === platform.id && s.month === month; });
      Audit.log(ctx.user, 'platforms', 'month.clear', 'Month', platform.key + ':' + month, { platform: platform.name, month: month, removed: n });
      return { removed: n };
    });
  },

  monthApprove: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var platform = Platforms.platform_(String(p.platform || 'saad')), month = requireMonth_(p.month);
      var row = Platforms.monthRow_(platform.id, month);
      if (row && row.status === 'approved') throw appError('الشهر معتمد مسبقاً.');
      var t = Platforms.totals_(Platforms.rows_('Sales').filter(function (s) { return s.platformId === platform.id && s.month === month; }));
      if (!t.count) throw appError('لا مبيعات مستوردة لهذا الشهر.');
      var ch = { status: 'approved', approvedBy: ctx.user.id, approvedAt: nowIso(), updatedAt: nowIso() };
      if (row) Db.update('platforms', 'Months', row.id, ch);
      else Db.insert('platforms', 'Months', Object.assign({ platformId: platform.id, month: month }, ch));
      Audit.log(ctx.user, 'platforms', 'month.approve', 'Month', platform.key + ':' + month, { platform: platform.name, month: month, count: t.count, net: kwd_(t.net) });
      return { status: 'approved' };
    });
  },

  monthReopen: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var platform = Platforms.platform_(String(p.platform || 'saad')), month = requireMonth_(p.month);
      var reason = requireText(p.reason, 'سبب إعادة الفتح', 300);
      var row = Platforms.monthRow_(platform.id, month);
      if (!row || row.status !== 'approved') throw appError('الشهر غير معتمد.');
      Db.update('platforms', 'Months', row.id, { status: 'draft', reopenedBy: ctx.user.id, reopenReason: reason, updatedAt: nowIso() });
      Audit.log(ctx.user, 'platforms', 'month.reopen', 'Month', platform.key + ':' + month, { platform: platform.name, month: month, reason: reason });
      return { status: 'draft' };
    });
  },

  // ───────── الإعدادات ─────────
  /** العمولات: { fees: { knet: { pct, fixed (بالدينار) } } } — يعيد حساب عمولة الأشهر غير المعتمدة */
  feesSave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var input = p.fees || {}, next = {};
      Object.keys(PLT.METHOD).forEach(function (m) {
        var f = input[m] || {};
        var pct = Number(normalizeDigits(f.pct == null || f.pct === '' ? 0 : f.pct));
        if (!isFinite(pct) || pct < 0 || pct > 20) throw appError('نسبة العمولة لـ ' + PLT.METHOD[m] + ' غير صحيحة (من 0 إلى 20%).');
        next[m] = { pct: Math.round(pct * 1000) / 1000, fixed: f.fixed == null || f.fixed === '' ? 0 : parseMoney_(f.fixed, 'الرسم الثابت لـ ' + PLT.METHOD[m], { allowZero: true, max: 10 }) };
      });
      Platforms.setConfig_('fees', next, ctx.user);
      var approved = {};
      Platforms.rows_('Months').forEach(function (r) { if (r.status === 'approved') approved[r.platformId + '|' + r.month] = true; });
      var changed = 0;
      Db.updateWhere('platforms', 'Sales', function (s) {
        if (approved[s.platformId + '|' + s.month]) return null;
        var fee = Platforms.feeOf_(next, s.method, s.amount);
        if (fee === s.fee) return null;
        changed++;
        return { fee: fee, net: s.amount - fee };
      });
      Audit.log(ctx.user, 'platforms', 'fees.update', 'Config', 'fees', {
        fees: Object.keys(next).map(function (m) { return PLT.METHOD[m] + ' ' + next[m].pct + '% + ' + kwd_(next[m].fixed); }).join(' · '), recalculated: changed
      });
      return { fees: next, recalculated: changed };
    });
  },

  packageSave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var cur = p.id ? Db.getOrThrow('platforms', 'Packages', String(p.id), 'الباقة') : null;
      var platform = Platforms.platform_(String(p.platformId || (cur && cur.platformId) || 'saad'));
      var kind = Platforms.enum_(p.kind, PLT.KIND, 'نوع الباقة', cur ? cur.kind : 'subscription');
      var rec = {
        platformId: platform.id, name: requireText(p.name, 'اسم الباقة', 80), code: requireText(p.code, 'الاسم في ملف البوابة', 80), kind: kind,
        price: parseMoney_(p.price == null ? 0 : p.price, 'السعر', { allowZero: true, max: 10000 }),
        durationDays: kind === 'subscription' ? intIn_(p.durationDays, 1, 3660, 'مدة الباقة بالأيام') : 0,
        unitPrice: kind === 'gift' ? parseMoney_(p.unitPrice, 'قيمة رعاية الفرد', { max: 10000 }) : 0,
        rank: kind === 'subscription' ? intIn_(p.rank == null || p.rank === '' ? 0 : p.rank, 0, 99, 'الترتيب') : 0,
        active: p.active == null ? true : bool_(p.active), updatedAt: nowIso()
      };
      var clash = Platforms.rows_('Packages').filter(function (x) {
        return x.platformId === platform.id && (!cur || x.id !== cur.id) && (x.code === rec.code || (x.aliases || []).indexOf(rec.code) >= 0);
      })[0];
      if (clash) throw appError('الاسم «' + rec.code + '» مستخدم لباقة أخرى: ' + clash.name + '.');
      var saved;
      if (cur) {
        saved = Db.update('platforms', 'Packages', cur.id, rec);
        Audit.log(ctx.user, 'platforms', 'package.update', 'Package', cur.id, { name: rec.name, code: rec.code, kind: PLT.KIND[kind], price: kwd_(rec.price) });
      } else {
        rec.aliases = [];
        rec.sortOrder = Platforms.rows_('Packages').length + 1;
        saved = Db.insert('platforms', 'Packages', rec);
        Audit.log(ctx.user, 'platforms', 'package.create', 'Package', saved.id, { name: rec.name, code: rec.code, kind: PLT.KIND[kind], price: kwd_(rec.price) });
      }
      return Platforms.packageView_(saved);
    });
  },

  packageRemove: function (ctx, p) {
    return withLock(function () {
      var cur = Db.getOrThrow('platforms', 'Packages', String((p || {}).id), 'الباقة');
      if (Platforms.rows_('Sales').some(function (s) { return s.packageId === cur.id; })) throw appError('للباقة مبيعات مسجلة. أوقفها بدل حذفها.');
      Db.remove('platforms', 'Packages', cur.id);
      Audit.log(ctx.user, 'platforms', 'package.remove', 'Package', cur.id, { name: cur.name });
      return { removed: true };
    });
  },

  platformSave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var cur = Platforms.platform_(String(p.id));
      var rec = { name: requireText(p.name, 'اسم المنصة', 80), gateway: optionalText(p.gateway, 40), active: p.active == null ? cur.active : bool_(p.active) };
      var saved = Db.update('platforms', 'Platforms', cur.id, rec);
      Audit.log(ctx.user, 'platforms', 'platform.update', 'Platform', cur.id, rec);
      return saved;
    });
  },

  centerSave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var cur = p.id ? Db.getOrThrow('platforms', 'Centers', String(p.id), 'المركز') : null;
      var platform = Platforms.platform_(String(p.platformId || (cur && cur.platformId) || ''));
      var rec = {
        platformId: platform.id, name: requireText(p.name, 'اسم المركز', 120), status: Platforms.enum_(p.status, PLT.CENTER_STATUS, 'حالة المركز', 'active'),
        startDate: optionalDate_(p.startDate, 'تاريخ البداية'), endDate: optionalDate_(p.endDate, 'تاريخ النهاية'),
        managerName: optionalText(p.managerName, 80), notes: optionalText(p.notes, 1000), updatedAt: nowIso()
      };
      if (rec.startDate && rec.endDate && rec.endDate < rec.startDate) throw appError('تاريخ النهاية قبل البداية.');
      if (Platforms.rows_('Centers').some(function (x) { return x.platformId === platform.id && x.name === rec.name && (!cur || x.id !== cur.id); })) throw appError('يوجد مركز بالاسم نفسه في هذه المنصة.');
      var saved;
      if (cur) {
        if (cur.platformId !== platform.id && Platforms.linkedProjects_('centerId', cur.id).length) throw appError('للمركز مشاريع مربوطة، فلا يُنقل إلى منصة أخرى.');
        saved = Db.update('platforms', 'Centers', cur.id, rec);
        Audit.log(ctx.user, 'platforms', 'center.update', 'Center', cur.id, { name: rec.name, platform: platform.name, status: PLT.CENTER_STATUS[rec.status] });
      } else {
        saved = Db.insert('platforms', 'Centers', Object.assign(rec, { createdBy: ctx.user.id, createdAt: nowIso() }));
        Audit.log(ctx.user, 'platforms', 'center.create', 'Center', saved.id, { name: rec.name, platform: platform.name });
      }
      return Platforms.centerView_(saved, Platforms.crm_(), Platforms.rows_('Campaigns'));
    });
  },

  linkedProjects_: function (field, id) {
    if (!Platforms.enabled_('crm')) return [];
    return Db.view('crm', 'Projects').filter(function (p) { return p[field] === id; });
  },

  centerRemove: function (ctx, p) {
    return withLock(function () {
      var cur = Db.getOrThrow('platforms', 'Centers', String((p || {}).id), 'المركز');
      if (Platforms.linkedProjects_('centerId', cur.id).length) throw appError('للمركز مشاريع مربوطة في العملاء. أغلقه بدل حذفه.');
      if (Platforms.rows_('Campaigns').some(function (c) { return c.centerId === cur.id; })) throw appError('للمركز مسابقات أو تحديات. انقلها أو احذفها أولاً.');
      Db.remove('platforms', 'Centers', cur.id);
      Audit.log(ctx.user, 'platforms', 'center.remove', 'Center', cur.id, { name: cur.name });
      return { removed: true };
    });
  },

  campaignSave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var cur = p.id ? Db.getOrThrow('platforms', 'Campaigns', String(p.id), 'المسابقة') : null;
      var platform = Platforms.platform_(String(p.platformId || (cur && cur.platformId) || ''));
      var rec = {
        platformId: platform.id, kind: Platforms.enum_(p.kind, PLT.CAMPAIGN_KIND, 'النوع', 'competition'), name: requireText(p.name, 'الاسم', 160),
        status: Platforms.enum_(p.status, PLT.CAMPAIGN_STATUS, 'الحالة', 'planned'), startDate: optionalDate_(p.startDate, 'تاريخ البداية'),
        endDate: optionalDate_(p.endDate, 'تاريخ النهاية'), participants: p.participants == null || p.participants === '' ? 0 : intIn_(p.participants, 0, 10000000, 'عدد المشاركين'),
        notes: optionalText(p.notes, 1000), centerId: '', updatedAt: nowIso()
      };
      if (rec.startDate && rec.endDate && rec.endDate < rec.startDate) throw appError('تاريخ النهاية قبل البداية.');
      if (p.centerId) {
        var c = Db.get('platforms', 'Centers', String(p.centerId));
        if (!c || c.platformId !== platform.id) throw appError('المركز غير موجود في هذه المنصة.');
        rec.centerId = c.id;
      }
      var saved;
      if (cur) {
        if (cur.platformId !== platform.id && Platforms.linkedProjects_('campaignId', cur.id).length) throw appError('للمسابقة رعاة مربوطون، فلا تُنقل إلى منصة أخرى.');
        saved = Db.update('platforms', 'Campaigns', cur.id, rec);
        Audit.log(ctx.user, 'platforms', 'campaign.update', 'Campaign', cur.id, { name: rec.name, kind: PLT.CAMPAIGN_KIND[rec.kind], status: PLT.CAMPAIGN_STATUS[rec.status] });
      } else {
        saved = Db.insert('platforms', 'Campaigns', Object.assign(rec, { createdBy: ctx.user.id, createdAt: nowIso() }));
        Audit.log(ctx.user, 'platforms', 'campaign.create', 'Campaign', saved.id, { name: rec.name, kind: PLT.CAMPAIGN_KIND[rec.kind], platform: platform.name });
      }
      return Platforms.campaignView_(saved, Platforms.crm_(), indexBy_(Platforms.rows_('Centers')));
    });
  },

  campaignRemove: function (ctx, p) {
    return withLock(function () {
      var cur = Db.getOrThrow('platforms', 'Campaigns', String((p || {}).id), 'المسابقة');
      if (Platforms.linkedProjects_('campaignId', cur.id).length) throw appError('للمسابقة رعاة مربوطون في العملاء. ألغها بدل حذفها.');
      Db.remove('platforms', 'Campaigns', cur.id);
      Audit.log(ctx.user, 'platforms', 'campaign.remove', 'Campaign', cur.id, { name: cur.name });
      return { removed: true };
    });
  },

  routes_: function () {
    var any = { module: 'platforms' }, acc = { module: 'platforms', roles: ['manager', 'accountant'] }, mgr = { module: 'platforms', roles: ['manager'] };
    return {
      'plt.lookups': { perm: any, fn: Platforms.lookups },
      'plt.dashboard': { perm: any, fn: Platforms.dashboard },
      'plt.months': { perm: any, fn: Platforms.months },
      'plt.sales': { perm: any, fn: Platforms.sales },
      'plt.centers': { perm: any, fn: Platforms.centers },
      'plt.campaigns': { perm: any, fn: Platforms.campaigns },
      'plt.import.preview': { perm: acc, fn: Platforms.importPreview },
      'plt.import.commit': { perm: acc, fn: Platforms.importCommit },
      'plt.month.clear': { perm: acc, fn: Platforms.monthClear },
      'plt.month.approve': { perm: mgr, fn: Platforms.monthApprove },
      'plt.month.reopen': { perm: mgr, fn: Platforms.monthReopen },
      'plt.center.save': { perm: acc, fn: Platforms.centerSave },
      'plt.center.remove': { perm: acc, fn: Platforms.centerRemove },
      'plt.campaign.save': { perm: acc, fn: Platforms.campaignSave },
      'plt.campaign.remove': { perm: acc, fn: Platforms.campaignRemove },
      'plt.fees.save': { perm: mgr, fn: Platforms.feesSave },
      'plt.package.save': { perm: mgr, fn: Platforms.packageSave },
      'plt.package.remove': { perm: mgr, fn: Platforms.packageRemove },
      'plt.platform.save': { perm: mgr, fn: Platforms.platformSave }
    };
  }
};
