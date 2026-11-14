/**
 * أدوات عامة: الأخطاء، المعرّفات، التجزئة، التواريخ، التحقق من المدخلات.
 */

/** خطأ موجّه للمستخدم: رسالته بالعربي تُعرض كما هي في الواجهة. */
function appError(message, code) {
  var e = new Error(message);
  e.isAppError = true;
  e.code = code || 'BAD_REQUEST';
  return e;
}

function nowIso() { return new Date().toISOString(); }

function newId() { return Utilities.getUuid().replace(/-/g, '').slice(0, 20); }

function randomToken_() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }

function bytesToHex_(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

function sha256Hex_(text) {
  return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8));
}

function hmacHex_(text, secret) {
  return bytesToHex_(Utilities.computeHmacSha256Signature(String(text), String(secret), Utilities.Charset.UTF_8));
}

/** مقارنة ثابتة الزمن لتقليل تسريب المعلومات عبر التوقيت. */
function safeEquals_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** يحوّل الأرقام العربية-الهندية إلى إنجليزية. */
function normalizeDigits(value) {
  return String(value == null ? '' : value)
    .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
    .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
}

function requireText(value, label, max) {
  var v = String(value == null ? '' : value).trim();
  if (!v) throw appError('أدخل ' + label + '.');
  if (max && v.length > max) throw appError(label + ' أطول من المسموح (' + max + ' حرفاً).');
  return v;
}

function optionalText(value, max) {
  var v = String(value == null ? '' : value).trim();
  if (max && v.length > max) v = v.slice(0, max);
  return v;
}

function normalizeUsername(value) {
  var v = normalizeDigits(value).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(v)) {
    throw appError('اسم المستخدم من 3 إلى 32 حرفاً إنجليزياً أو أرقام أو . _ - بلا مسافات.');
  }
  return v;
}

function optionalEmail(value) {
  var v = optionalText(value, 100);
  if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw appError('البريد الإلكتروني غير صحيح.');
  return v;
}

function bool_(v) { return v === true || v === 'true' || v === 1 || v === '1'; }

function intIn_(v, min, max, label) {
  var n = Math.round(Number(normalizeDigits(v)));
  if (isNaN(n) || n < min || n > max) throw appError(label + ' يجب أن يكون بين ' + min + ' و ' + max + '.');
  return n;
}

// ───────── التاريخ والوقت بتوقيت الكويت (UTC+3 ثابت بلا توقيت صيفي) ─────────
var KW_OFFSET_MS = 3 * 3600000;

/** yyyy-mm-dd بتوقيت الكويت للحظة (ms أو ISO) أو للآن */
function localDate_(at) {
  var ms = at == null ? Date.now() : (typeof at === 'number' ? at : new Date(at).getTime());
  return new Date(ms + KW_OFFSET_MS).toISOString().slice(0, 10);
}

function localMonth_() { return localDate_().slice(0, 7); }

/** دقائق منذ منتصف ليل يوم ds المحلي حتى اللحظة at (قد تتجاوز 1440 بعد منتصف الليل) */
function minutesFrom_(ds, at) {
  var ms = typeof at === 'number' ? at : new Date(at).getTime();
  return Math.round((ms - tsAt_(ds, '00:00')) / 60000);
}

/** لحظة (ms) لتاريخ ووقت محليين */
function tsAt_(ds, hm) {
  var p = ds.split('-').map(Number);
  var m = hm2min_(hm);
  return Date.UTC(p[0], p[1] - 1, p[2], 0, m) - KW_OFFSET_MS;
}

/** HH:mm محلي للحظة */
function localHm_(at) {
  if (!at) return '';
  var ms = typeof at === 'number' ? at : new Date(at).getTime();
  return new Date(ms + KW_OFFSET_MS).toISOString().slice(11, 16);
}

function isDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  var p = s.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
}

function requireDate_(s, label) {
  var v = normalizeDigits(s).trim();
  if (!isDate_(v)) throw appError('أدخل ' + label + ' صحيحاً.');
  return v;
}

function optionalDate_(s, label) {
  var v = normalizeDigits(s).trim();
  if (!v) return '';
  if (!isDate_(v)) throw appError('تاريخ غير صحيح في: ' + label + '.');
  return v;
}

function addDays_(ds, n) { var p = ds.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); }
function dowOf_(ds) { var p = ds.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); }
function daysBetween_(a, b) {
  var pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
function daysInMonth_(month) { var p = month.split('-').map(Number); return new Date(Date.UTC(p[0], p[1], 0)).getUTCDate(); }
function hm2min_(s) { var m = /^(\d{1,2}):(\d{2})$/.exec(normalizeDigits(s).trim()); return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : NaN; }

function requireTime_(s, label) {
  var v = normalizeDigits(s).trim();
  if (isNaN(hm2min_(v))) throw appError('أدخل ' + label + ' بصيغة ساعة:دقيقة.');
  var m = hm2min_(v);
  return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
}

function requireMonth_(s) {
  var v = normalizeDigits(s || localMonth_()).trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) throw appError('الشهر غير صحيح.');
  return v;
}

/** dd/mm/yyyy للعرض */
function dmy_(ds) { return ds ? ds.split('-').reverse().join('/') : ''; }

var DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function indexBy_(rows, key) {
  var o = {};
  rows.forEach(function (r) { o[r[key || 'id']] = r; });
  return o;
}

/** يقارن إصدارين بصيغة x.y.z */
function compareVersions_(a, b) {
  var pa = String(a || '0').split('.'), pb = String(b || '0').split('.');
  for (var i = 0; i < 3; i++) {
    var d = (Number(pa[i]) || 0) - (Number(pb[i]) || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}
