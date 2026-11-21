/**
 * محاكي لخدمات Google Apps Script يكفي لتشغيل كود server/ خارج جوجل:
 * - اختبارات الخادم على الجهاز (server/test/run.mjs)
 * - وضع التطوير المحلي للواجهة (npm run dev:mock) بنفس منطق الخادم الحقيقي
 *
 * لا يعتمد على Node أو المتصفح تحديداً. البيانات تُحفظ عبر storage اختياري.
 */

// ───────── SHA-256 و HMAC بلغة JS خالصة (لتعمل متزامنة في المتصفح أيضاً) ─────────
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function sha256(bytes) {
  const len = bytes.length;
  const withPad = ((len + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(withPad);
  m.set(bytes);
  m[len] = 0x80;
  const bitLen = len * 8;
  const dv = new DataView(m.buffer);
  dv.setUint32(withPad - 4, bitLen >>> 0);
  dv.setUint32(withPad - 8, Math.floor(bitLen / 0x100000000));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  for (let off = 0; off < withPad; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
  return out;
}

function hmacSha256(keyBytes, msgBytes) {
  let key = keyBytes.length > 64 ? sha256(keyBytes) : keyBytes;
  const k = new Uint8Array(64); k.set(key);
  const ipad = new Uint8Array(64 + msgBytes.length), opad = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) { ipad[i] = k[i] ^ 0x36; opad[i] = k[i] ^ 0x5c; }
  ipad.set(msgBytes, 64);
  opad.set(sha256(ipad), 64);
  return sha256(opad);
}

const utf8 = (s) => new TextEncoder().encode(String(s));
/** Apps Script يعيد البايتات كأعداد موقّعة (-128..127) */
const signed = (u8) => Array.from(u8, (b) => (b > 127 ? b - 256 : b));
/** ملف PDF صغير صالح (معاينة ملفات Office في المحاكي) */
const MINI_PDF = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';

function base64(bytes) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + (i + 1 < bytes.length ? chars[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? chars[n & 63] : '=');
  }
  return out;
}

// ───────── الساعة (قابلة للتحكم في الاختبارات) ─────────
export function createClock() {
  let offset = 0;
  const Real = Date;
  class FakeDate extends Real {
    constructor(...args) {
      if (args.length === 0) super(Real.now() + offset);
      else super(...args);
    }
    static now() { return Real.now() + offset; }
  }
  return {
    Date: FakeDate,
    /** يضبط الوقت الحالي إلى لحظة معيّنة (ISO أو ms) */
    set(at) { offset = new Real(at).getTime() - Real.now(); },
    advance(ms) { offset += ms; },
    reset() { offset = 0; }
  };
}

// ───────── الإنشاء ─────────
/**
 * storage: { load(): object|null, save(state) } اختياري لحفظ الحالة (localStorage في المتصفح).
 */
export function createGas({ storage, clock, log } = {}) {
  const C = clock || createClock();
  const Dt = C.Date;
  const state = (storage && storage.load()) || { files: {}, props: {}, cache: {}, seq: 0 };
  let dirty = false;
  const touch = () => { dirty = true; };
  const uuid = () => {
    if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });
  };

  // ───── Sheets ─────
  const lastRowOf = (rows) => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].some((v) => v !== '' && v != null)) return i + 1; return 0; };
  const lastColOf = (rows) => { let m = 0; rows.forEach((r) => { for (let j = r.length - 1; j >= 0; j--) if (r[j] !== '' && r[j] != null) { m = Math.max(m, j + 1); break; } }); return m; };
  const cellValue = (v) => (v === null || v === undefined ? '' : typeof v === 'boolean' || typeof v === 'number' ? String(v) : v instanceof Date ? v.toISOString() : String(v));

  function makeRange(sh, row, col, nr, nc) {
    const ensure = () => {
      while (sh.rows.length < row - 1 + nr) sh.rows.push([]);
    };
    const r = {
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const src = sh.rows[row - 1 + i] || [];
          const line = [];
          for (let j = 0; j < nc; j++) { const v = src[col - 1 + j]; line.push(v === undefined ? '' : v); }
          out.push(line);
        }
        return out;
      },
      getValue() { return r.getValues()[0][0]; },
      setValues(vals) {
        if (vals.length !== nr || vals.some((l) => l.length !== nc)) throw new Error('The number of rows or columns in the data does not match the range.');
        ensure();
        for (let i = 0; i < nr; i++) {
          const line = sh.rows[row - 1 + i];
          for (let j = 0; j < nc; j++) {
            while (line.length < col - 1 + j) line.push('');
            line[col - 1 + j] = cellValue(vals[i][j]);
          }
        }
        touch();
        return r;
      },
      setValue(v) { return r.setValues([[v]]); },
      setNumberFormat() { return r; },
      setFontWeight() { return r; },
      setBackground() { return r; },
      setFontColor() { return r; }
    };
    return r;
  }

  function makeSheet(file, sh) {
    const s = {
      getName: () => sh.name,
      getRange(row, col, nr = 1, nc = 1) {
        if (row < 1 || col < 1 || nr < 1 || nc < 1) throw new Error('Range out of bounds');
        return makeRange(sh, row, col, nr, nc);
      },
      getDataRange() { return makeRange(sh, 1, 1, Math.max(lastRowOf(sh.rows), 1), Math.max(lastColOf(sh.rows), 1)); },
      getLastRow: () => lastRowOf(sh.rows),
      getLastColumn: () => lastColOf(sh.rows),
      getMaxRows: () => Math.max(1000, sh.rows.length),
      getMaxColumns: () => Math.max(26, lastColOf(sh.rows)),
      appendRow(values) {
        const at = lastRowOf(sh.rows);
        sh.rows.length = at;
        sh.rows.push(values.map(cellValue));
        touch();
        return s;
      },
      deleteRow(i) { sh.rows.splice(i - 1, 1); touch(); },
      insertRowsAfter() { return s; },
      setFrozenRows() { return s; },
      clear() { sh.rows = []; touch(); return s; }
    };
    return s;
  }

  function makeSpreadsheet(id) {
    const file = state.files[id];
    if (!file) throw new Error('Unexpected error while getting the method or property openById on object SpreadsheetApp.');
    const ss = {
      getId: () => id,
      getName: () => file.name,
      getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id + '/edit',
      getSheetByName(name) { const sh = file.sheets.find((x) => x.name === name); return sh ? makeSheet(file, sh) : null; },
      getSheets: () => file.sheets.map((sh) => makeSheet(file, sh)),
      insertSheet(name) {
        if (file.sheets.some((x) => x.name === name)) throw new Error('A sheet with the name "' + name + '" already exists.');
        const sh = { name, rows: [] };
        file.sheets.push(sh); touch();
        return makeSheet(file, sh);
      },
      deleteSheet(sheet) { file.sheets = file.sheets.filter((x) => x.name !== sheet.getName()); touch(); }
    };
    return ss;
  }

  const SpreadsheetApp = {
    create(name) {
      const id = 'mock' + (++state.seq) + uuid().replace(/-/g, '').slice(0, 20);
      state.files[id] = { name, sheets: [{ name: 'Sheet1', rows: [] }] };
      touch();
      return makeSpreadsheet(id);
    },
    openById: (id) => makeSpreadsheet(id)
  };

  // ───── Properties ─────
  const props = {
    getProperty: (k) => (Object.prototype.hasOwnProperty.call(state.props, k) ? state.props[k] : null),
    setProperty(k, v) { state.props[k] = String(v); touch(); return props; },
    deleteProperty(k) { delete state.props[k]; touch(); return props; },
    getProperties: () => Object.assign({}, state.props),
    setProperties(o) { Object.keys(o).forEach((k) => { state.props[k] = String(o[k]); }); touch(); return props; }
  };
  const PropertiesService = { getScriptProperties: () => props };

  // ───── Cache ─────
  const cache = {
    get(k) {
      const e = state.cache[k];
      if (!e) return null;
      if (e.exp < Dt.now()) { delete state.cache[k]; return null; }
      return e.v;
    },
    put(k, v, ttl = 600) {
      if (String(v).length > 100 * 1024) throw new Error('Argument too large: value');
      state.cache[k] = { v: String(v), exp: Dt.now() + Math.min(ttl, 21600) * 1000 }; touch();
    },
    remove(k) { delete state.cache[k]; touch(); },
    getAll(keys) { const o = {}; keys.forEach((k) => { const v = cache.get(k); if (v !== null) o[k] = v; }); return o; },
    putAll(o, ttl) { Object.keys(o).forEach((k) => cache.put(k, o[k], ttl)); },
    removeAll(keys) { keys.forEach((k) => delete state.cache[k]); touch(); }
  };
  const CacheService = { getScriptCache: () => cache };

  // ───── Lock (تنفيذ متسلسل هنا فلا حاجة لقفل حقيقي) ─────
  const LockService = {
    getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {}, hasLock: () => true })
  };

  // ───── Drive (مجلدات وملفات في الذاكرة، تُحفظ مع الحالة) ─────
  state.drive = state.drive || { items: {} };
  const D = state.drive.items;
  const blobOf = (bytes, mime, name) => ({ bytes, getBytes: () => bytes, getContentType: () => mime, getName: () => name, setName(n) { name = n; return this; },
    getDataAsString: () => new TextDecoder().decode(Uint8Array.from(bytes || [], (b) => b & 255)) });
  /** نص الملف للبحث: بايتاته كنص (الـ PDF التجريبي نصي)، والنسخة المحوّلة (OCR) نص أصلها */
  const textOf = (it) => new TextDecoder().decode(Uint8Array.from(it.bytes || [], (b) => b & 255));
  const fileApi = (id) => {
    const it = D[id];
    return {
      getId: () => id, getName: () => it.name, getUrl: () => 'https://drive.test/file/' + id, isTrashed: () => !!it.trashed,
      setTrashed(v) { it.trashed = !!v; touch(); }, getBlob: () => blobOf(it.bytes, it.mime, it.name),
      // تصدير صيغة جوجل (مستند، جدول، عرض) إلى PDF: ملف PDF صغير صالح
      getAs(mime) {
        if (mime === 'text/plain' && /^application\/vnd\.google-apps\.document/.test(it.mime)) return blobOf(Array.from(new TextEncoder().encode(textOf(it))), 'text/plain', it.name + '.txt');
        if (mime !== 'application/pdf' || !/^application\/vnd\.google-apps\./.test(it.mime)) throw new Error('Conversion from ' + it.mime + ' to ' + mime + ' failed.');
        return blobOf(Array.from(new TextEncoder().encode(MINI_PDF)), 'application/pdf', it.name + '.pdf');
      },
      getDateCreated: () => new Dt(it.created || 0), getSize: () => (it.bytes ? it.bytes.length : 0),
      makeCopy(name, folder) {
        const nid = 'fi' + (++state.seq);
        D[nid] = { kind: 'file', name, mime: it.mime, bytes: it.bytes ? it.bytes.slice() : [], parent: folder.getId(), created: Dt.now() };
        if (it.ssId) { // نسخة كاملة من جدول بيانات
          const sid = 'mock' + (++state.seq) + uuid().replace(/-/g, '').slice(0, 20);
          state.files[sid] = JSON.parse(JSON.stringify(state.files[it.ssId]));
          state.files[sid].name = name;
          D[nid].ssId = sid;
        }
        touch();
        return fileApi(nid);
      }
    };
  };
  const folderApi = (id) => {
    const it = D[id];
    return {
      getId: () => id, getName: () => it.name, getUrl: () => 'https://drive.test/folder/' + id, isTrashed: () => !!it.trashed,
      setTrashed(v) { it.trashed = !!v; touch(); },
      createFolder(name) { const nid = 'fo' + (++state.seq); D[nid] = { kind: 'folder', name, parent: id }; touch(); return folderApi(nid); },
      getFoldersByName(name) {
        const ids = Object.keys(D).filter((k) => D[k].kind === 'folder' && D[k].parent === id && D[k].name === name && !D[k].trashed);
        let i = 0;
        return { hasNext: () => i < ids.length, next: () => folderApi(ids[i++]) };
      },
      createFile(blob) {
        const nid = 'fi' + (++state.seq);
        D[nid] = { kind: 'file', name: blob.getName(), mime: blob.getContentType(), bytes: Array.from(blob.getBytes()), parent: id, created: Dt.now() };
        touch();
        return fileApi(nid);
      },
      getFiles() {
        const ids = Object.keys(D).filter((k) => D[k].kind === 'file' && D[k].parent === id && !D[k].trashed);
        let i = 0;
        return { hasNext: () => i < ids.length, next: () => fileApi(ids[i++]) };
      },
      getFilesByName(name) {
        const ids = Object.keys(D).filter((k) => D[k].kind === 'file' && D[k].parent === id && D[k].name === name && !D[k].trashed);
        let i = 0;
        return { hasNext: () => i < ids.length, next: () => fileApi(ids[i++]) };
      }
    };
  };
  if (!D.root) D.root = { kind: 'folder', name: 'My Drive' };
  const need = (id, kind) => { if (!D[id] || D[id].kind !== kind) throw new Error('No item with the given ID could be found'); return id; };
  const DriveApp = {
    getRootFolder: () => folderApi('root'),
    createFolder: (name) => folderApi('root').createFolder(name),
    getFolderById: (id) => folderApi(need(id, 'folder')),
    getFileById(id) {
      // جدول بيانات يُرى في درايف ملفاً أيضاً
      if (!D[id] && state.files[id]) D[id] = { kind: 'file', name: state.files[id].name, mime: 'application/vnd.google-apps.spreadsheet', parent: 'root', ssId: id, created: Dt.now() };
      return fileApi(need(id, 'file'));
    },
    // المساحة: مجموع أحجام الملفات غير المحذوفة، والحد 15 جيجا (أو state.driveLimit في الاختبارات)
    // البحث في النص: يدعم «fullText contains "..."» فقط
    searchFiles(q) {
      const m = /fullText contains "((?:[^"\\]|\\.)*)"/.exec(String(q || ''));
      const needle = m ? m[1].replace(/\\(.)/g, '$1') : '';
      const ids = Object.keys(D).filter((k) => D[k].kind === 'file' && !D[k].trashed && needle && textOf(D[k]).includes(needle));
      let i = 0;
      return { hasNext: () => i < ids.length, next: () => fileApi(ids[i++]) };
    },
    getStorageUsed: () => Object.keys(D).reduce((n, k) => n + (D[k].kind === 'file' && !D[k].trashed && D[k].bytes ? D[k].bytes.length : 0), 0) + (state.driveExtraUsed || 0),
    getStorageLimit: () => state.driveLimit || 15 * 1024 ** 3
  };

  // ───── خدمة Drive المتقدمة (v3): التحويل إلى صيغة جوجل عند الإنشاء فقط ─────
  const Drive = {
    Files: {
      create(resource, blob) {
        const parent = (resource.parents || ['root'])[0];
        need(parent, 'folder');
        if (state.driveConvertFails) throw new Error('Conversion failed');
        const nid = 'fi' + (++state.seq);
        D[nid] = { kind: 'file', name: resource.name, mime: resource.mimeType || (blob ? blob.getContentType() : ''), bytes: blob ? Array.from(blob.getBytes()) : [], parent, created: Dt.now() };
        touch();
        return { id: nid, name: resource.name, mimeType: D[nid].mime };
      }
    }
  };

  // ───── Utilities ─────
  const Utilities = {
    newBlob: (bytes, mime, name) => blobOf(Array.from(bytes), mime, name),
    base64Decode(str) { return signed(Uint8Array.from(atob(String(str)), (c) => c.charCodeAt(0))); },
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    getUuid: uuid,
    computeDigest(alg, value) {
      if (alg !== 'SHA_256') throw new Error('Only SHA_256 is emulated');
      const bytes = Array.isArray(value) ? Uint8Array.from(value, (b) => b & 255) : utf8(value);
      return signed(sha256(bytes));
    },
    computeHmacSha256Signature(value, key) { return signed(hmacSha256(utf8(key), utf8(value))); },
    base64Encode(v) { return base64(typeof v === 'string' ? utf8(v) : Uint8Array.from(v, (b) => (b < 0 ? b + 256 : b))); },
    sleep() {},
    formatDate(date, tz, pattern) {
      // تنسيق مبسّط بتوقيت ثابت (الكويت UTC+3 بلا توقيت صيفي)
      const off = tz === 'Asia/Kuwait' ? 3 : 0;
      const d = new Dt(new Dt(date).getTime() + off * 3600000);
      const p = (n, l = 2) => String(n).padStart(l, '0');
      return pattern.replace('yyyy', d.getUTCFullYear()).replace('MM', p(d.getUTCMonth() + 1)).replace('dd', p(d.getUTCDate()))
        .replace('HH', p(d.getUTCHours())).replace('mm', p(d.getUTCMinutes())).replace('ss', p(d.getUTCSeconds()));
    }
  };

  const logs = [];
  const say = (...a) => { logs.push(a.join(' ')); if (log) log(...a); };
  const Logger = { log: say };
  const consoleShim = { log: say, info: say, warn: say, error: (...a) => { logs.push('ERROR ' + a.join(' ')); if (log) log('ERROR', ...a); } };
  const ContentService = {
    MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
    createTextOutput(s) { const o = { content: s, getContent: () => s, setMimeType: () => o }; return o; }
  };
  const Session = { getScriptTimeZone: () => 'Asia/Kuwait' };
  // البريد: يُسجَّل ولا يُرسل
  const mail = [];
  const MailApp = { getRemainingDailyQuota: () => 100 - mail.length, sendEmail(o) { mail.push(o); } };

  // ───── ScriptApp (المشغّلات الزمنية فقط) ─────
  const triggers = [];
  const ScriptApp = {
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger(t) { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
    newTrigger(fn) {
      const spec = { fn, kind: '', every: 0, hour: null };
      const b = {
        timeBased() { spec.kind = 'time'; return b; },
        everyMinutes(n) { spec.every = n; spec.unit = 'min'; return b; },
        everyHours(n) { spec.every = n; spec.unit = 'hour'; return b; },
        everyDays(n) { spec.every = n; spec.unit = 'day'; return b; },
        atHour(h) { spec.hour = h; return b; },
        nearMinute() { return b; },
        inTimezone() { return b; },
        create() { const t = { getHandlerFunction: () => fn, getUniqueId: () => uuid(), spec }; triggers.push(t); return t; }
      };
      return b;
    }
  };

  return {
    clock: C,
    state,
    logs,
    mail,
    triggers,
    globals: { SpreadsheetApp, PropertiesService, CacheService, LockService, Utilities, DriveApp, Drive, MailApp, ScriptApp, Logger, ContentService, Session, console: consoleShim, Date: Dt },
    /** يحفظ الحالة إن تغيّرت */
    flush() { if (dirty && storage) storage.save(state); dirty = false; }
  };
}

/**
 * يحمّل ملفات الخادم في نطاق واحد كما يفعل Apps Script.
 * sources: [{ path, code }] · يُعاد كائن فيه Router و setup.
 */
export function loadServer(sources, globals) {
  const ordered = sources.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const code = ordered.map((s) => '// ── ' + s.path + '\n' + s.code).join('\n;\n');
  const names = Object.keys(globals);
  // eslint-disable-next-line no-new-func
  const factory = new Function(...names, code + '\n;return { Router: Router, setup: setup, doPost: doPost, processMailQueue: processMailQueue, dailyMaintenance: dailyMaintenance, subscriberReminders: subscriberReminders, installTriggers: installTriggers, Notify: Notify, Backup: Backup, Db: Db, Hr: Hr, Tasks: Tasks, Auth: Auth };');
  return factory(...names.map((n) => globals[n]));
}
