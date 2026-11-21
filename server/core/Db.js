/**
 * طبقة البيانات فوق Google Sheets.
 *
 * - لكل وحدة ملف Sheet خاص (DB_<KEY> في Script Properties)، يُنشأ تلقائياً أول مرة.
 * - كل جدول ورقة، صفها الأول أسماء الأعمدة، ويُقرأ بأسماء الأعمدة لا بترتيبها.
 * - كل الخلايا نصية (@) حتى لا يحوّل Sheets القيم إلى تواريخ أو أرقام، والأنواع تُحوَّل هنا.
 * - ممنوع استخدام SpreadsheetApp خارج هذا الملف.
 *
 * أنواع الأعمدة: text · num · bool · json · ts (ISO) · date (yyyy-mm-dd)
 */
var SCHEMAS = {
  core: {
    Users: [
      ['id', 'text'], ['username', 'text'], ['fullName', 'text'], ['jobTitle', 'text'],
      ['phone', 'text'], ['email', 'text'], ['active', 'bool'], ['isSuperAdmin', 'bool'],
      ['mustChangePassword', 'bool'], ['passwordHash', 'text'], ['salt', 'text'],
      ['failedAttempts', 'num'], ['lockedUntil', 'ts'], ['lastLogin', 'ts'], ['employeeId', 'text'],
      ['createdAt', 'ts'], ['createdBy', 'text'], ['updatedAt', 'ts']
    ],
    UserRoles: [
      ['id', 'text'], ['userId', 'text'], ['module', 'text'], ['role', 'text'],
      ['createdAt', 'ts'], ['createdBy', 'text']
    ],
    Settings: [['key', 'text'], ['value', 'json'], ['updatedAt', 'ts'], ['updatedBy', 'text']],
    AuditLog: [
      ['id', 'text'], ['ts', 'ts'], ['userId', 'text'], ['userName', 'text'], ['module', 'text'],
      ['action', 'text'], ['entity', 'text'], ['entityId', 'text'], ['details', 'json']
    ],
    Serials: [['key', 'text'], ['last', 'num']],
    // الموظف الموحد: كل الوحدات تشير إليه بـ employeeId
    Employees: [
      ['id', 'text'], ['empNo', 'text'], ['fullName', 'text'], ['userId', 'text'], ['departmentId', 'text'],
      ['branchId', 'text'], ['managerId', 'text'], ['shiftId', 'text'], ['jobTitle', 'text'], ['hireDate', 'date'],
      ['status', 'text'], ['phone', 'text'], ['email', 'text'], ['nationality', 'text'], ['birthDate', 'date'],
      ['civilId', 'text'], ['civilIdExpiry', 'date'], ['residencyNo', 'text'], ['residencyExpiry', 'date'],
      ['passportNo', 'text'], ['passportExpiry', 'date'], ['contractType', 'text'], ['contractEnd', 'date'],
      ['address', 'text'], ['emergencyName', 'text'], ['emergencyPhone', 'text'], ['notes', 'text'],
      ['createdAt', 'ts'], ['createdBy', 'text'], ['updatedAt', 'ts']
    ],
    Departments: [['id', 'text'], ['name', 'text'], ['managerId', 'text'], ['active', 'bool'], ['createdAt', 'ts']],
    Branches: [
      ['id', 'text'], ['name', 'text'], ['address', 'text'], ['lat', 'text'], ['lng', 'text'],
      ['geoRadius', 'num'], ['active', 'bool'], ['createdAt', 'ts']
    ],
    // مفاتيح الدخول بالبصمة (WebAuthn): المفتاح العام فقط. مفتاح نشط واحد لكل مستخدم
    Passkeys: [
      ['id', 'text'], ['userId', 'text'], ['employeeId', 'text'], ['credId', 'text'], ['rpId', 'text'], ['alg', 'num'],
      ['publicKey', 'json'], ['signCount', 'num'], ['backup', 'bool'], ['label', 'text'], ['status', 'text'],
      ['createdAt', 'ts'], ['lastUsedAt', 'ts'], ['revokedAt', 'ts'], ['revokedBy', 'text'], ['revokeReason', 'text']
    ],
    // الإشعارات (Notify.js). refKey يمنع تكرار الإشعار نفسه
    Notifications: [
      ['id', 'text'], ['userId', 'text'], ['kind', 'text'], ['module', 'text'], ['title', 'text'], ['detail', 'text'], ['link', 'text'],
      ['refKey', 'text'], ['read', 'bool'], ['actorName', 'text'], ['createdAt', 'ts'], ['emailedAt', 'ts']
    ],
    // حالة كل مستخدم: id = userId. readUntil: ما قبله مقروء («تعليم الكل»)
    NotifyState: [['id', 'text'], ['readUntil', 'ts'], ['email', 'bool'], ['updatedAt', 'ts']],
    // رسائل بريد بانتظار الإرسال (يصرفها المشغّل الزمني processMailQueue)
    MailQueue: [['id', 'text'], ['to', 'text'], ['title', 'text'], ['detail', 'text'], ['link', 'text'], ['actorName', 'text'], ['createdAt', 'ts'], ['attempts', 'num']],
    // التواقيع المعتمدة للمستندات (Sign.js) وسجل كل توقيع
    Signatures: [['id', 'text'], ['userId', 'text'], ['data', 'text'], ['status', 'text'], ['approvedBy', 'text'], ['approvedAt', 'ts'], ['updatedAt', 'ts']],
    SignatureLog: [
      ['id', 'text'], ['module', 'text'], ['entityId', 'text'], ['entityVersion', 'num'], ['userId', 'text'], ['onBehalfOf', 'text'], ['method', 'text'],
      ['sourceSha256', 'text'], ['signedSha256', 'text'], ['fileId', 'text'], ['code', 'text'], ['step', 'text'], ['at', 'ts']
    ]
  }
};

/** مخطط ملف بيانات: النواة هنا، والوحدات تعلن مخططاتها في ModuleSchemas_ (Router.js). */
function schemaOf_(dbKey) {
  if (SCHEMAS[dbKey]) return SCHEMAS[dbKey];
  var extra = ModuleSchemas_();
  return extra[dbKey] || null;
}

var DB_MEMO_ = { ss: {}, rows: {}, idx: {}, ver: {} };

var Db = {
  /** الملف الخاص بوحدة، ويُنشأ مع جداوله عند أول استخدام. */
  spreadsheet_: function (dbKey) {
    if (DB_MEMO_.ss[dbKey]) return DB_MEMO_.ss[dbKey];
    var schema = schemaOf_(dbKey);
    if (!schema) throw new Error('Unknown db: ' + dbKey);
    var props = PropertiesService.getScriptProperties();
    var propKey = 'DB_' + dbKey.toUpperCase();
    var id = props.getProperty(propKey);
    var ss;
    if (id) {
      ss = SpreadsheetApp.openById(id);
    } else {
      var lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        id = props.getProperty(propKey);
        if (id) {
          ss = SpreadsheetApp.openById(id);
        } else {
          var prefix = props.getProperty('ENV_NAME') || 'KMK-Dev';
          ss = SpreadsheetApp.create(prefix + ' · ' + dbKey);
          props.setProperty(propKey, ss.getId());
        }
      } finally { lock.releaseLock(); }
    }
    Db.ensureSchema_(dbKey, ss, schema);
    DB_MEMO_.ss[dbKey] = ss;
    return ss;
  },

  /** ينشئ الأوراق والأعمدة الناقصة. لا يحذف شيئاً. يُفحص فقط عند تغيّر المخطط. */
  ensureSchema_: function (dbKey, ss, schema) {
    var sig = sha256Hex_(JSON.stringify(schema)).slice(0, 12);
    var props = PropertiesService.getScriptProperties();
    var sigKey = 'SCHEMA_' + dbKey.toUpperCase();
    if (props.getProperty(sigKey) === sig) return;
    Object.keys(schema).forEach(function (table) {
      var cols = schema[table].map(function (c) { return c[0]; });
      var sh = ss.getSheetByName(table);
      if (!sh) {
        sh = ss.insertSheet(table);
        sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
        sh.setFrozenRows(1);
      } else {
        var lastCol = Math.max(sh.getLastColumn(), 1);
        var have = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
        var missing = cols.filter(function (c) { return have.indexOf(c) < 0; });
        if (missing.length) sh.getRange(1, have.filter(String).length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
      }
      sh.getRange(1, 1, sh.getMaxRows(), Math.max(sh.getMaxColumns(), cols.length)).setNumberFormat('@');
    });
    var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('ورقة1');
    if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
    props.setProperty(sigKey, sig);
  },

  sheet_: function (dbKey, table) {
    var sh = Db.spreadsheet_(dbKey).getSheetByName(table);
    if (!sh) throw new Error('Missing table ' + dbKey + '.' + table);
    return sh;
  },

  types_: function (dbKey, table) {
    var map = {};
    schemaOf_(dbKey)[table].forEach(function (c) { map[c[0]] = c[1]; });
    return map;
  },

  fromCell_: function (v, type) {
    if (v === '' || v == null) {
      if (type === 'bool') return false;
      if (type === 'num') return 0;
      if (type === 'json') return null;
      return '';
    }
    // احتياط: إن حوّل Sheets خلية إلى تاريخ رغم التنسيق النصي
    if (Object.prototype.toString.call(v) === '[object Date]') {
      if (type === 'date') return localDate_(v.getTime());
      if (type === 'ts') return v.toISOString();
      // وقت فقط (يحفظه Sheets بتاريخ 1899) يعود «HH:mm»، وتاريخ كامل (مثل شهر «2026-10» حوّله Sheets) يعود «YYYY-MM-DD»
      if (type === 'text') return v.getFullYear() < 1900 ? localHm_(v.getTime()) : localDate_(v.getTime());
    }
    switch (type) {
      case 'bool': return v === true || String(v).toUpperCase() === 'TRUE' || String(v) === '1';
      case 'num': return Number(v) || 0;
      case 'json': try { return JSON.parse(v); } catch (e) { return null; }
      default: return String(v);
    }
  },

  toCell_: function (v, type) {
    if (v == null) return '';
    switch (type) {
      case 'bool': return v ? 'TRUE' : 'FALSE';
      case 'num': return String(Number(v) || 0);
      case 'json': return JSON.stringify(v);
      default: return String(v);
    }
  },

  /** رقم نسخة الجدول (يُقرأ من الخصائص مرة واحدة في التنفيذ) */
  cacheKey_: function (dbKey, table) {
    var k = 'VER_' + dbKey + '_' + table;
    if (DB_MEMO_.ver[k] === undefined) DB_MEMO_.ver[k] = PropertiesService.getScriptProperties().getProperty(k) || '0';
    return 'db_' + dbKey + '_' + table + '_' + DB_MEMO_.ver[k];
  },

  /** يُستدعى بعد كل كتابة ليتجاهل الجميع النسخة المخزنة القديمة. */
  bump_: function (dbKey, table) {
    var props = PropertiesService.getScriptProperties();
    var k = 'VER_' + dbKey + '_' + table;
    var next = String((Number(props.getProperty(k)) || 0) + 1);
    props.setProperty(k, next);
    DB_MEMO_.ver[k] = next;
    delete DB_MEMO_.rows[dbKey + '.' + table];
    delete DB_MEMO_.idx[dbKey + '.' + table];
  },

  /** كل صفوف الجدول ككائنات (نسخ يمكن تعديلها). */
  all: function (dbKey, table) {
    return Db.view(dbKey, table).map(function (r) { return Object.assign({}, r); });
  },

  /**
   * كل صفوف الجدول للقراءة فقط (بلا نسخ، أسرع للجداول الكبيرة). لا تعدّل الكائنات المعادة.
   * تُخزَّن مؤقتاً في CacheService مقسّمة على عدة مفاتيح، وتُبطل عند أي كتابة.
   */
  view: function (dbKey, table) {
    var memoKey = dbKey + '.' + table;
    if (DB_MEMO_.rows[memoKey]) return DB_MEMO_.rows[memoKey];
    var cache = CacheService.getScriptCache();
    var ck = Db.cacheKey_(dbKey, table);
    var rows = null;
    var n = Number(cache.get(ck + '_n'));
    if (n) {
      var keys = [];
      for (var i = 0; i < n; i++) keys.push(ck + '_' + i);
      var parts = cache.getAll(keys);
      var joined = '';
      for (var j = 0; j < n && joined !== null; j++) joined = parts[keys[j]] == null ? null : joined + parts[keys[j]];
      if (joined !== null) { try { rows = JSON.parse(joined); } catch (e) { rows = null; } }
    }
    if (!rows) {
      var sh = Db.sheet_(dbKey, table);
      var values = sh.getDataRange().getValues();
      var headers = values.shift().map(String);
      var types = Db.types_(dbKey, table);
      rows = values.filter(function (r) { return r.join('') !== ''; }).map(function (r) {
        var o = {};
        headers.forEach(function (h, i) { if (h && types[h]) o[h] = Db.fromCell_(r[i], types[h]); });
        return o;
      });
      Db.cachePut_(cache, ck, JSON.stringify(rows));
    }
    DB_MEMO_.rows[memoKey] = rows;
    return rows;
  },

  /** يقسّم النص على مفاتيح ≤ 30 ألف حرف (حد القيمة 100KB بعد الترميز). */
  cachePut_: function (cache, ck, json) {
    var size = 30000, chunks = {}, n = Math.ceil(json.length / size) || 1;
    if (n > 60) return; // جدول ضخم: لا تخزين مؤقت
    for (var i = 0; i < n; i++) chunks[ck + '_' + i] = json.slice(i * size, (i + 1) * size);
    chunks[ck + '_n'] = String(n);
    try { cache.putAll(chunks, 21600); } catch (e) { /* التخزين المؤقت اختياري */ }
  },

  find: function (dbKey, table, pred) { return Db.all(dbKey, table).filter(pred); },

  /** سجل واحد بمعرّفه (نسخة قابلة للتعديل) عبر فهرس يُبنى مرة لكل قراءة للجدول، بدل نسخ كل الصفوف */
  get: function (dbKey, table, id) {
    if (!id) return null;
    var rows = Db.view(dbKey, table), memoKey = dbKey + '.' + table;
    var idx = DB_MEMO_.idx[memoKey];
    if (!idx || idx.rows !== rows) {
      idx = { rows: rows, map: {} };
      for (var i = 0; i < rows.length; i++) if (rows[i].id != null && idx.map[rows[i].id] === undefined) idx.map[rows[i].id] = rows[i];
      DB_MEMO_.idx[memoKey] = idx;
    }
    var r = idx.map[id];
    return r ? Object.assign({}, r) : null;
  },

  getOrThrow: function (dbKey, table, id, label) {
    var r = Db.get(dbKey, table, id);
    if (!r) throw appError((label || 'السجل') + ' غير موجود.', 'NOT_FOUND');
    return r;
  },

  rowValues_: function (sh, dbKey, table, obj) {
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var types = Db.types_(dbKey, table);
    return headers.map(function (h) { return types[h] ? Db.toCell_(obj[h], types[h]) : ''; });
  },

  insert: function (dbKey, table, obj) {
    return withLock(function () {
      var row = Object.assign({}, obj);
      if (!row.id && Db.types_(dbKey, table).id) row.id = newId();
      var sh = Db.sheet_(dbKey, table);
      sh.appendRow(Db.rowValues_(sh, dbKey, table, row));
      Db.bump_(dbKey, table);
      return row;
    });
  },

  /** إدراج عدة صفوف بكتابة واحدة (أسرع بكثير من insert المتكرر). */
  insertMany: function (dbKey, table, list) {
    if (!list.length) return [];
    return withLock(function () {
      var hasId = !!Db.types_(dbKey, table).id;
      var rows = list.map(function (o) { var r = Object.assign({}, o); if (!r.id && hasId) r.id = newId(); return r; });
      var sh = Db.sheet_(dbKey, table);
      var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      var types = Db.types_(dbKey, table);
      var values = rows.map(function (r) { return headers.map(function (h) { return types[h] ? Db.toCell_(r[h], types[h]) : ''; }); });
      sh.getRange(sh.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
      Db.bump_(dbKey, table);
      return rows;
    });
  },

  rowIndex_: function (sh, id) {
    var last = sh.getLastRow();
    if (last < 2) return -1;
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var col = headers.indexOf('id') + 1;
    var ids = sh.getRange(2, col, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
    return -1;
  },

  update: function (dbKey, table, id, changes) {
    return withLock(function () {
      var sh = Db.sheet_(dbKey, table);
      var idx = Db.rowIndex_(sh, id);
      if (idx < 0) throw appError('السجل غير موجود.', 'NOT_FOUND');
      DB_MEMO_.rows[dbKey + '.' + table] = null;
      var current = Db.get(dbKey, table, id) || { id: id };
      var next = Object.assign({}, current, changes, { id: id });
      var values = Db.rowValues_(sh, dbKey, table, next);
      sh.getRange(idx, 1, 1, values.length).setValues([values]);
      Db.bump_(dbKey, table);
      return next;
    });
  },

  remove: function (dbKey, table, id) {
    return withLock(function () {
      var sh = Db.sheet_(dbKey, table);
      var idx = Db.rowIndex_(sh, id);
      if (idx < 0) return false;
      sh.deleteRow(idx);
      Db.bump_(dbKey, table);
      return true;
    });
  },

  /** يعدّل صفوفاً كثيرة بكتابة واحدة: fn(row) تعيد التغييرات أو null. يعيد عدد المعدَّل */
  updateWhere: function (dbKey, table, fn) {
    return withLock(function () {
      var rows = Db.all(dbKey, table), n = 0;
      rows = rows.map(function (r) { var ch = fn(r); if (!ch) return r; n++; return Object.assign(r, ch); });
      if (!n) return 0;
      var sh = Db.sheet_(dbKey, table);
      var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      var types = Db.types_(dbKey, table);
      var values = rows.map(function (r) { return headers.map(function (h) { return types[h] ? Db.toCell_(r[h], types[h]) : ''; }); });
      sh.getRange(2, 1, values.length, headers.length).setValues(values);
      DB_MEMO_.rows[dbKey + '.' + table] = null;
      Db.bump_(dbKey, table);
      return n;
    });
  },

  /** يحذف كل الصفوف المطابقة بكتابة واحدة (يعيد كتابة الصفوف الباقية ويفرغ ما بعدها). يعيد عدد المحذوف */
  removeWhere: function (dbKey, table, pred) {
    return withLock(function () {
      var rows = Db.all(dbKey, table);
      var keep = rows.filter(function (r) { return !pred(r); });
      var removed = rows.length - keep.length;
      if (!removed) return 0;
      var sh = Db.sheet_(dbKey, table);
      var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      var types = Db.types_(dbKey, table);
      var values = keep.map(function (r) { return headers.map(function (h) { return types[h] ? Db.toCell_(r[h], types[h]) : ''; }); });
      for (var i = 0; i < removed; i++) values.push(headers.map(function () { return ''; }));
      sh.getRange(2, 1, values.length, headers.length).setValues(values);
      DB_MEMO_.rows[dbKey + '.' + table] = null;
      Db.bump_(dbKey, table);
      return removed;
    });
  },

  /** يرفع عدّاد تسلسل إلى n على الأقل (بعد نقل أرقام قائمة) */
  raiseSerial: function (key, n) {
    return withLock(function () {
      var rows = Db.find('core', 'Serials', function (r) { return r.key === key; });
      var sh = Db.sheet_('core', 'Serials');
      if (!rows.length) sh.appendRow([key, String(n)]);
      else if (rows[0].last < n) {
        var data = sh.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) if (String(data[i][0]) === key) { sh.getRange(i + 1, 2).setValue(String(n)); break; }
      }
      Db.bump_('core', 'Serials');
    });
  },

  /** رقم تسلسلي مثل NTH-2026-0001 */
  nextSerial: function (key, pad) {
    return withLock(function () {
      var rows = Db.find('core', 'Serials', function (r) { return r.key === key; });
      var sh = Db.sheet_('core', 'Serials');
      var n;
      if (!rows.length) {
        n = 1;
        sh.appendRow([key, '1']);
      } else {
        n = rows[0].last + 1;
        var data = sh.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) if (String(data[i][0]) === key) { sh.getRange(i + 1, 2).setValue(String(n)); break; }
      }
      Db.bump_('core', 'Serials');
      return key + '-' + String(n).padStart(pad || 4, '0');
    });
  }
};

/** قفل عام للكتابة؛ يسمح بالتداخل داخل نفس التنفيذ. */
var LOCK_DEPTH_ = 0;
function withLock(fn) {
  if (LOCK_DEPTH_ > 0) return fn();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw appError('النظام مشغول الآن. حاول بعد لحظات.', 'BUSY');
  LOCK_DEPTH_++;
  try { return fn(); } finally { LOCK_DEPTH_--; lock.releaseLock(); }
}
