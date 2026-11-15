/**
 * الملفات على Google Drive (المرفقات والنسخ الموقّعة وتواقيع المدير القديمة).
 *
 * - تعمل بعد منح الخادم صلاحية Drive مرة واحدة: يشغّل المالك authorizeDrive() من محرر Apps Script ويوافق.
 *   قبل ذلك available_() = false والواجهة تخفي الرفع.
 * - المجلد الرئيسي يُنشأ تلقائياً «بوابة KMK — الملفات» ويُحفظ معرّفه في Settings.files.
 * - ملفات النظام السابق تبقى في مكانها (حساب kw2kmk)، وتُقرأ إن شوركت مع حساب البوابة.
 * - الملفات خاصة بحساب الخادم، والواجهة تعرضها عبر الخادم بعد التحقق من الصلاحية.
 */
var FILES_MAX_BYTES = 10 * 1024 * 1024;
var FILES_TYPES = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf'
};
var FILES_OK_;

/** يشغّله مالك المشروع مرة واحدة من المحرر لمنح صلاحية Drive */
function authorizeDrive() {
  var root = Files.root_();
  Logger.log('Drive جاهز: ' + root.getName() + ' — ' + root.getUrl());
  return root.getUrl();
}

var Files = {
  available_: function () {
    if (FILES_OK_ !== undefined) return FILES_OK_;
    try { DriveApp.getRootFolder(); FILES_OK_ = true; } catch (e) { FILES_OK_ = false; }
    return FILES_OK_;
  },

  require_: function () {
    if (!Files.available_()) throw appError('رفع الملفات غير مفعّل بعد. يحتاج موافقة مالك البوابة على صلاحية Google Drive.', 'NO_DRIVE');
  },

  root_: function () {
    var cfg = Settings.get_('files', {}) || {};
    if (cfg.rootId) {
      try { var f = DriveApp.getFolderById(cfg.rootId); if (!f.isTrashed()) return f; } catch (e) { /* يُنشأ من جديد */ }
    }
    var folder = DriveApp.createFolder('بوابة KMK — الملفات');
    Settings.set_('files', { rootId: folder.getId() }, null);
    return folder;
  },

  /** مجلد فرعي بالاسم (يُنشأ عند الحاجة) */
  child_: function (parent, name) {
    var it = parent.getFoldersByName(name);
    return it.hasNext() ? it.next() : parent.createFolder(name);
  },

  /** مجلد محفوظ معرّفه في سجل (driveFolderId)، وإلا يُنشأ بالمسار */
  folder_: function (id, path) {
    if (id) {
      try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* محذوف أو بلا صلاحية */ }
    }
    var cur = Files.root_();
    path.forEach(function (n) { cur = Files.child_(cur, n); });
    return cur;
  },

  safeName_: function (name) {
    var s = String(name || 'ملف').replace(/[\\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim();
    if (s.length > 80) {
      var dot = s.lastIndexOf('.'), ext = dot > 0 && s.length - dot <= 6 ? s.slice(dot) : '';
      s = s.slice(0, 80 - ext.length) + ext;
    }
    return s || 'ملف';
  },

  /** يتحقق من ملف مرفوع (base64) ويعيد { mime, bytes, ext } */
  decode_: function (p) {
    var mime = String(p.mimeType || '').toLowerCase();
    if (!FILES_TYPES[mime]) throw appError('نوع الملف غير مسموح. المسموح: صور (JPG/PNG/WEBP/HEIC) أو PDF.');
    var data = String(p.data || '').replace(/^data:[^,]*,/, '').replace(/\s/g, '');
    if (!data || !/^[A-Za-z0-9+\/=]+$/.test(data)) throw appError('بيانات الملف غير صالحة.');
    if (Math.floor(data.length * 3 / 4) > FILES_MAX_BYTES + 3) throw appError('حجم الملف يتجاوز 10 ميجابايت.');
    var bytes = Utilities.base64Decode(data);
    if (!bytes.length) throw appError('الملف فارغ.');
    if (!Files.signatureOk_(mime, bytes)) throw appError('محتوى الملف لا يطابق نوعه المعلن (' + FILES_TYPES[mime].toUpperCase() + ').');
    return { mime: mime, bytes: bytes, ext: FILES_TYPES[mime] };
  },

  /** أول بايتات الملف تطابق نوعه؟ */
  signatureOk_: function (mime, bytes) {
    var b = function (i) { return bytes[i] < 0 ? bytes[i] + 256 : bytes[i]; };
    var ascii = function (from, len) { var s = ''; for (var i = from; i < from + len && i < bytes.length; i++) s += String.fromCharCode(b(i)); return s; };
    if (bytes.length < 12) return false;
    switch (mime) {
      case 'image/jpeg': return b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF;
      case 'image/png': return b(0) === 0x89 && ascii(1, 3) === 'PNG';
      case 'image/gif': return ascii(0, 4) === 'GIF8';
      case 'image/webp': return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP';
      case 'image/heic': case 'image/heif': return ascii(4, 4) === 'ftyp';
      case 'application/pdf': return ascii(0, 4) === '%PDF';
      default: return false;
    }
  },

  save_: function (folder, up, name) {
    var file = folder.createFile(Utilities.newBlob(up.bytes, up.mime, name));
    return { id: file.getId(), url: file.getUrl(), size: up.bytes.length };
  },

  trash_: function (fileId) {
    if (!fileId || !Files.available_()) return;
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* محذوف مسبقاً أو بلا صلاحية */ }
  },

  /** محتوى ملف للعرض في الواجهة */
  content_: function (fileId, fileName, mimeType) {
    Files.require_();
    var blob;
    try { blob = DriveApp.getFileById(fileId).getBlob(); }
    catch (e) { throw appError('تعذّر فتح الملف. إن كان من النظام السابق فشارك مجلده «نثريات KMK» مع حساب البوابة.', 'FILE_UNAVAILABLE'); }
    return { fileName: fileName || blob.getName(), mimeType: mimeType || blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
  },

  /** صورة صغيرة على Drive كـ data URL (لتواقيع المدير القديمة)، أو '' */
  dataUrl_: function (fileId, maxChars) {
    if (!fileId || !Files.available_()) return '';
    try {
      var blob = DriveApp.getFileById(fileId).getBlob();
      var url = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
      return url.length <= (maxChars || 45000) ? url : '';
    } catch (e) { return ''; }
  }
};
