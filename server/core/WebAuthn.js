/**
 * بصمة الجهاز (WebAuthn / مفاتيح المرور): التحقق في الخادم.
 *
 * - لا تصل إلينا بصمة الوجه أو الإصبع: الجهاز يتحقق منها محلياً ثم يوقّع تحدياً بمفتاح خاص لا يغادره.
 * - نخزّن المفتاح العام فقط، ونتحقق من التوقيع هنا (ECDSA P-256 أو RSA)، لأن Apps Script لا يوفّر ذلك.
 * - كل تحدٍّ يُستخدم مرة واحدة ويصلح 10 دقائق.
 * - الحسابات الكبيرة بـ BigInt (مدعوم في محرك V8).
 */
var WEBAUTHN_CHALLENGE_SECONDS = 600;

var WebAuthn = (function () {
  var big = function (hex) { return BigInt('0x' + (hex || '0')); };
  // تُحسب عند أول استخدام فقط، فلا يتأثر تحميل البوابة لو تعذّر BigInt
  var ZERO, ONE, TWO, THREE, FOUR, EIGHT, P, N, B, G;
  function init() {
    if (P) return;
    ZERO = BigInt(0); ONE = BigInt(1); TWO = BigInt(2); THREE = BigInt(3); FOUR = BigInt(4); EIGHT = BigInt(8);
    // منحنى P-256
    P = big('ffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
    N = big('ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
    B = big('5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b');
    G = {
      x: big('6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
      y: big('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')
    };
  }
  var SHA256_DIGEST_INFO = '3031300d060960864801650304020105000420';

  // ───────── بايتات ─────────
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  function b64urlDecode(s) {
    s = String(s || '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (!/^[A-Za-z0-9_-]*$/.test(s)) throw bad('بيانات البصمة تالفة.');
    var out = [], buf = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      buf = (buf << 6) | B64.indexOf(s.charAt(i));
      bits += 6;
      if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
    }
    return out;
  }

  function b64urlEncode(bytes) {
    var out = '', i;
    for (i = 0; i + 2 < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    if (bytes.length - i === 1) { var a = bytes[i] << 16; out += B64[(a >> 18) & 63] + B64[(a >> 12) & 63]; }
    else if (bytes.length - i === 2) { var c = (bytes[i] << 16) | (bytes[i + 1] << 8); out += B64[(c >> 18) & 63] + B64[(c >> 12) & 63] + B64[(c >> 6) & 63]; }
    return out;
  }

  function utf8Decode(bytes) {
    var out = '', i = 0;
    while (i < bytes.length) {
      var c = bytes[i++];
      if (c < 0x80) out += String.fromCharCode(c);
      else if (c < 0xe0) out += String.fromCharCode(((c & 31) << 6) | (bytes[i++] & 63));
      else if (c < 0xf0) out += String.fromCharCode(((c & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
      else {
        var cp = ((c & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
        cp -= 0x10000;
        out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023));
      }
    }
    return out;
  }

  function utf8Encode(s) {
    var out = [];
    s = unescape(encodeURIComponent(String(s)));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function sha256(bytes) {
    var signed = bytes.map(function (b) { return b > 127 ? b - 256 : b; });
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, signed).map(function (b) { return b < 0 ? b + 256 : b; });
  }

  function hex(bytes) {
    return bytes.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }

  function sameBytes(a, b) {
    if (a.length !== b.length) return false;
    var d = 0;
    for (var i = 0; i < a.length; i++) d |= a[i] ^ b[i];
    return d === 0;
  }

  function bad(msg) { return appError(msg || 'تعذّر التحقق من بصمة الجهاز.', 'DEVICE_FAILED'); }

  // ───────── CBOR (الحد اللازم لكائن التسجيل ومفتاح COSE) ─────────
  function cbor(bytes, pos) {
    var ib = bytes[pos++], major = ib >> 5, info = ib & 31, len;
    var readLen = function () {
      if (info < 24) return info;
      var n = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : -1;
      if (n < 0) throw bad('بيانات البصمة تالفة.');
      var v = 0;
      for (var i = 0; i < n; i++) v = v * 256 + bytes[pos++];
      return v;
    };
    if (major === 7) {
      if (info === 20) return { v: false, p: pos };
      if (info === 21) return { v: true, p: pos };
      if (info === 22 || info === 23) return { v: null, p: pos };
      throw bad('بيانات البصمة تالفة.');
    }
    len = readLen();
    if (major === 0) return { v: len, p: pos };
    if (major === 1) return { v: -1 - len, p: pos };
    if (major === 2) return { v: bytes.slice(pos, pos + len), p: pos + len };
    if (major === 3) return { v: utf8Decode(bytes.slice(pos, pos + len)), p: pos + len };
    if (major === 4) {
      var arr = [];
      for (var i = 0; i < len; i++) { var it = cbor(bytes, pos); arr.push(it.v); pos = it.p; }
      return { v: arr, p: pos };
    }
    if (major === 5) {
      var map = {};
      for (var j = 0; j < len; j++) {
        var k = cbor(bytes, pos); pos = k.p;
        var val = cbor(bytes, pos); pos = val.p;
        map[String(k.v)] = val.v;
      }
      return { v: map, p: pos };
    }
    throw bad('بيانات البصمة تالفة.');
  }

  // ───────── حساب المنحنى ─────────
  function mod(a, m) { var r = a % m; return r < ZERO ? r + m : r; }

  function modPow(b, e, m) {
    var r = ONE; b = mod(b, m);
    while (e > ZERO) {
      if (e & ONE) r = (r * b) % m;
      b = (b * b) % m;
      e >>= ONE;
    }
    return r;
  }

  function inv(a, m) { return modPow(a, m - TWO, m); }

  /** نقاط بإحداثيات Jacobian (x, y, z)، والنقطة اللانهائية null */
  function dbl(p1) {
    if (!p1 || p1.y === ZERO) return null;
    var delta = (p1.z * p1.z) % P, gamma = (p1.y * p1.y) % P, beta = (p1.x * gamma) % P;
    var alpha = mod(THREE * (p1.x - delta) * (p1.x + delta), P);
    var x3 = mod(alpha * alpha - EIGHT * beta, P);
    var z3 = mod((p1.y + p1.z) * (p1.y + p1.z) - gamma - delta, P);
    var y3 = mod(alpha * (FOUR * beta - x3) - EIGHT * gamma * gamma, P);
    return { x: x3, y: y3, z: z3 };
  }

  function add(p1, p2) {
    if (!p1) return p2;
    if (!p2) return p1;
    var z1z1 = (p1.z * p1.z) % P, z2z2 = (p2.z * p2.z) % P;
    var u1 = (p1.x * z2z2) % P, u2 = (p2.x * z1z1) % P;
    var s1 = (p1.y * p2.z * z2z2) % P, s2 = (p2.y * p1.z * z1z1) % P;
    if (u1 === u2) return s1 === s2 ? dbl(p1) : null;
    var h = mod(u2 - u1, P), r = mod(s2 - s1, P);
    var h2 = (h * h) % P, h3 = (h * h2) % P, u1h2 = (u1 * h2) % P;
    var x3 = mod(r * r - h3 - TWO * u1h2, P);
    var y3 = mod(r * (u1h2 - x3) - s1 * h3, P);
    var z3 = (h * p1.z * p2.z) % P;
    return { x: x3, y: y3, z: z3 };
  }

  function onCurve(x, y) {
    if (x <= ZERO || x >= P || y <= ZERO || y >= P) return false;
    return mod(y * y - (x * x * x - THREE * x + B), P) === ZERO;
  }

  /** u1·G + u2·Q (طريقة Shamir) ثم إحداثي x الطبيعي */
  function mulAddX(u1, u2, q) {
    var g = { x: G.x, y: G.y, z: ONE }, qq = { x: q.x, y: q.y, z: ONE };
    var gq = add(g, qq);
    var bits = Math.max(u1.toString(2).length, u2.toString(2).length);
    var acc = null;
    for (var i = bits - 1; i >= 0; i--) {
      acc = dbl(acc);
      var bi = BigInt(i);
      var b1 = (u1 >> bi) & ONE, b2 = (u2 >> bi) & ONE;
      if (b1 === ONE && b2 === ONE) acc = add(acc, gq);
      else if (b1 === ONE) acc = add(acc, g);
      else if (b2 === ONE) acc = add(acc, qq);
    }
    if (!acc) return null;
    var zi = inv(acc.z, P);
    return (acc.x * zi % P) * zi % P;
  }

  /** توقيع DER: SEQUENCE { INTEGER r, INTEGER s } */
  function derSig(sig) {
    var p = 0;
    var len = function () { var l = sig[p++]; if (l & 0x80) { var n = l & 0x7f; l = 0; while (n--) l = l * 256 + sig[p++]; } return l; };
    if (sig[p++] !== 0x30) throw bad();
    len();
    if (sig[p++] !== 0x02) throw bad();
    var rl = len(), r = big(hex(sig.slice(p, p + rl))); p += rl;
    if (sig[p++] !== 0x02) throw bad();
    var sl = len(), s = big(hex(sig.slice(p, p + sl)));
    return { r: r, s: s };
  }

  function verifyEs256(pub, msgBytes, sigBytes) {
    var q = { x: big(pub.x), y: big(pub.y) };
    if (!onCurve(q.x, q.y)) return false;
    var rs = derSig(sigBytes);
    if (rs.r <= ZERO || rs.r >= N || rs.s <= ZERO || rs.s >= N) return false;
    var e = big(hex(sha256(msgBytes)));
    var w = inv(rs.s, N);
    var x = mulAddX(mod(e * w, N), mod(rs.r * w, N), q);
    return x !== null && mod(x, N) === rs.r;
  }

  function verifyRs256(pub, msgBytes, sigBytes) {
    var n = big(pub.n), e = big(pub.e);
    var k = pub.n.replace(/^0+/, '').length;
    k = Math.ceil(k / 2);
    if (sigBytes.length !== k) return false;
    var m = modPow(big(hex(sigBytes)), e, n).toString(16);
    while (m.length < k * 2) m = '0' + m;
    var digest = SHA256_DIGEST_INFO + hex(sha256(msgBytes));
    var padLen = k * 2 - 6 - digest.length;
    if (padLen < 16) return false;
    var expected = '0001' + new Array(padLen / 2 + 1).join('ff') + '00' + digest;
    return m === expected;
  }

  function verifySig(alg, pub, msgBytes, sigBytes) {
    try {
      init();
      if (alg === -7) return verifyEs256(pub, msgBytes, sigBytes);
      if (alg === -257) return verifyRs256(pub, msgBytes, sigBytes);
    } catch (e) { return false; }
    return false;
  }

  /** مفتاح COSE → { alg, publicKey } */
  function coseKey(m) {
    init();
    var kty = m['1'], alg = m['3'];
    if (kty === 2 && alg === -7 && m['-1'] === 1 && m['-2'] && m['-3']) {
      var x = hex(m['-2']), y = hex(m['-3']);
      if (!onCurve(big(x), big(y))) throw bad('مفتاح الجهاز غير صالح.');
      return { alg: -7, publicKey: { x: x, y: y } };
    }
    if (kty === 3 && alg === -257 && m['-1'] && m['-2']) {
      return { alg: -257, publicKey: { n: hex(m['-1']), e: hex(m['-2']) } };
    }
    throw bad('نوع مفتاح الجهاز غير مدعوم.');
  }

  /** بيانات المصادقة: hash النطاق، الأعلام، العداد، وبيانات المفتاح عند التسجيل */
  function authData(bytes) {
    if (bytes.length < 37) throw bad();
    var flags = bytes[32];
    var out = {
      rpIdHash: bytes.slice(0, 32), up: !!(flags & 1), uv: !!(flags & 4), be: !!(flags & 8), bs: !!(flags & 16),
      signCount: ((bytes[33] << 24) >>> 0) + (bytes[34] << 16) + (bytes[35] << 8) + bytes[36]
    };
    if (flags & 64) {
      var len = (bytes[53] << 8) + bytes[54];
      out.credId = bytes.slice(55, 55 + len);
      out.cose = cbor(bytes, 55 + len).v;
    }
    return out;
  }

  // ───────── المصدر المسموح ─────────
  function allowedOrigins_() {
    var extra = (PropertiesService.getScriptProperties().getProperty('WEB_ORIGINS') || '').split(',');
    return (APP.WEB_ORIGINS || []).concat(extra).map(function (s) { return String(s).trim().replace(/\/+$/, ''); }).filter(String);
  }

  /** يعيد اسم النطاق (rpId) إن كان المصدر مسموحاً */
  function rpIdOf_(origin) {
    origin = String(origin || '');
    var local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.exec(origin);
    if (local) return local[1];
    if (allowedOrigins_().indexOf(origin) >= 0) return origin.replace(/^https:\/\//, '').replace(/:\d+$/, '');
    return '';
  }

  function clientData_(b64, type, userId) {
    var cd;
    try { cd = JSON.parse(utf8Decode(b64urlDecode(b64))); } catch (e) { throw bad(); }
    if (cd.type !== type) throw bad();
    WebAuthn.consume_(cd.challenge, userId);
    var rpId = rpIdOf_(cd.origin);
    if (!rpId) throw bad('البصمة من موقع غير معتمد.');
    return { rpId: rpId, raw: b64urlDecode(b64) };
  }

  return {
    b64urlEncode: b64urlEncode,
    b64urlDecode: b64urlDecode,

    /** تحدٍّ جديد مرتبط بالمستخدم */
    challenge_: function (userId) {
      var bytes = [];
      var h = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
      for (var i = 0; i < h.length; i += 2) bytes.push(parseInt(h.substr(i, 2), 16));
      var c = b64urlEncode(bytes);
      CacheService.getScriptCache().put('wa_' + c, userId, WEBAUTHN_CHALLENGE_SECONDS);
      return c;
    },

    consume_: function (c, userId) {
      var cache = CacheService.getScriptCache();
      var key = 'wa_' + String(c || '');
      var owner = c ? cache.get(key) : null;
      if (!owner) throw appError('انتهت صلاحية طلب البصمة. حاول مرة أخرى.', 'DEVICE_CHALLENGE');
      cache.remove(key);
      if (owner !== userId) throw bad();
    },

    userHandle_: function (userId) { return b64urlEncode(utf8Encode(userId)); },

    /** يتحقق من تسجيل جهاز جديد ويعيد بيانات المفتاح للحفظ */
    verifyRegistration_: function (userId, p) {
      p = p || {};
      var cd = clientData_(p.clientDataJSON, 'webauthn.create', userId);
      var att;
      try { att = cbor(b64urlDecode(p.attestationObject), 0).v; } catch (e) { throw bad(); }
      if (!att || !att.authData) throw bad();
      var ad = authData(att.authData);
      if (!sameBytes(ad.rpIdHash, sha256(utf8Encode(cd.rpId)))) throw bad('البصمة من موقع غير معتمد.');
      if (!ad.up || !ad.uv) throw bad('لم يتحقق الجهاز من هويتك بالوجه أو البصمة أو رمز القفل.');
      if (!ad.credId || !ad.cose) throw bad();
      var key = coseKey(ad.cose);
      var credId = b64urlEncode(ad.credId);
      if (p.credentialId && String(p.credentialId).replace(/=+$/, '') !== credId) throw bad();
      return { credId: credId, rpId: cd.rpId, alg: key.alg, publicKey: key.publicKey, signCount: ad.signCount, backup: ad.be };
    },

    /** يتحقق من بصمة (assertion) بجهاز مسجّل. device: { credId, rpId, alg, publicKey, signCount } */
    verifyAssertion_: function (userId, device, a) {
      if (!a || !a.credentialId || !a.clientDataJSON || !a.authenticatorData || !a.signature) throw bad();
      if (String(a.credentialId).replace(/=+$/, '') !== device.credId) throw bad('هذا ليس الجهاز المسجّل لك.');
      var cd = clientData_(a.clientDataJSON, 'webauthn.get', userId);
      if (cd.rpId !== device.rpId) throw bad('البصمة من موقع غير معتمد.');
      var adBytes = b64urlDecode(a.authenticatorData);
      var ad = authData(adBytes);
      if (!sameBytes(ad.rpIdHash, sha256(utf8Encode(device.rpId)))) throw bad();
      if (!ad.up || !ad.uv) throw bad('لم يتحقق الجهاز من هويتك بالوجه أو البصمة أو رمز القفل.');
      var msg = adBytes.concat(sha256(cd.raw));
      if (!verifySig(device.alg, device.publicKey, msg, b64urlDecode(a.signature))) throw bad();
      return { signCount: ad.signCount };
    },

    /** فحص ذاتي بمتجهات معروفة (للتأكد من عمل الحساب في بيئة Apps Script) */
    selfTest_: function () {
      init();
      var t0 = Date.now();
      var v = WEBAUTHN_TEST_VECTORS_;
      var msg = utf8Encode(v.message);
      var ec = verifyEs256(v.ec.publicKey, msg, b64urlDecode(v.ec.sig));
      var ecBad = verifyEs256(v.ec.publicKey, utf8Encode(v.message + '!'), b64urlDecode(v.ec.sig));
      var rsa = verifyRs256(v.rsa.publicKey, msg, b64urlDecode(v.rsa.sig));
      return { es256: ec && !ecBad, rs256: rsa, ms: Date.now() - t0 };
    }
  };
})();
