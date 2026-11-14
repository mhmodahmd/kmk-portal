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

/** يقارن إصدارين بصيغة x.y.z */
function compareVersions_(a, b) {
  var pa = String(a || '0').split('.'), pb = String(b || '0').split('.');
  for (var i = 0; i < 3; i++) {
    var d = (Number(pa[i]) || 0) - (Number(pb[i]) || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}
