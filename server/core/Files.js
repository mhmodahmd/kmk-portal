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
/** الامتداد ← النوع، لما لا يعلن المتصفح نوعه (HEIC مثلاً) */
var FILES_EXT_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf' };

/**
 * المستندات (Files.DOCS): Office والنصوص فوق الصور و PDF، حتى 25 ميجابايت.
 * النوع يُحدَّد من الامتداد ثم يُفحص المحتوى، لأن المتصفحات تعلن أنواع Office بأشكال مختلفة
 * (ملف CSV على ويندوز يصل application/vnd.ms-excel). ملفات الماكرو مرفوضة دائماً.
 * convert: صيغة جوجل التي يُحوَّل إليها لإنشاء معاينة PDF.
 */
var FILES_DOC_MAX_BYTES = 25 * 1024 * 1024;
var FILES_OFFICE = {
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'zip', dir: 'word/', convert: 'application/vnd.google-apps.document' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'zip', dir: 'xl/', convert: 'application/vnd.google-apps.spreadsheet' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'zip', dir: 'ppt/', convert: 'application/vnd.google-apps.presentation' },
  doc: { mime: 'application/msword', kind: 'ole', convert: 'application/vnd.google-apps.document' },
  xls: { mime: 'application/vnd.ms-excel', kind: 'ole', convert: 'application/vnd.google-apps.spreadsheet' },
  ppt: { mime: 'application/vnd.ms-powerpoint', kind: 'ole', convert: 'application/vnd.google-apps.presentation' },
  txt: { mime: 'text/plain', kind: 'text', convert: 'application/vnd.google-apps.document' },
  csv: { mime: 'text/csv', kind: 'text', convert: 'application/vnd.google-apps.spreadsheet' }
};
var FILES_OK_;

/** يشغّله مالك المشروع مرة واحدة من المحرر لمنح صلاحية Drive */
function authorizeDrive() {
  var root = Files.root_();
  Logger.log('Drive جاهز: ' + root.getName() + ' — ' + root.getUrl()); // i18n:line
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
    var folder = DriveApp.createFolder('بوابة KMK — الملفات'); // i18n:line
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
    var s = String(name || 'ملف').replace(/[\\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim(); // i18n:line
    if (s.length > 80) {
      var dot = s.lastIndexOf('.'), ext = dot > 0 && s.length - dot <= 6 ? s.slice(dot) : '';
      s = s.slice(0, 80 - ext.length) + ext;
    }
    return s || 'ملف'; // i18n:line
  },

  /** إعدادات رفع المستندات: Office والنصوص، حتى 25 ميجابايت */
  DOCS: { office: true, maxBytes: FILES_DOC_MAX_BYTES },

  extOf_: function (name) {
    var m = /\.([A-Za-z0-9]{1,5})$/.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  },

  /**
   * يتحقق من ملف مرفوع (base64) ويعيد { mime, bytes, ext, convert }.
   * opts: Files.DOCS للمستندات، وبدونها الصور و PDF حتى 10 ميجابايت كما في بقية الوحدات.
   */
  decode_: function (p, opts) {
    opts = opts || {};
    var max = opts.maxBytes || FILES_MAX_BYTES;
    var mime = String(p.mimeType || '').toLowerCase(), ext = Files.extOf_(p.fileName);
    var office = opts.office ? FILES_OFFICE[ext] || null : null;
    if (office) mime = office.mime;
    else if (opts.office && !FILES_TYPES[mime] && FILES_EXT_MIME[ext]) mime = FILES_EXT_MIME[ext];
    if (!office && !FILES_TYPES[mime]) {
      throw appError(opts.office ? 'نوع الملف غير مسموح. المسموح: PDF والصور وملفات Word وExcel وPowerPoint والنصوص.'
        : 'نوع الملف غير مسموح. المسموح: صور (JPG/PNG/WEBP/HEIC) أو PDF.');
    }
    var data = String(p.data || '').replace(/^data:[^,]*,/, '').replace(/\s/g, '');
    if (!data || !/^[A-Za-z0-9+\/=]+$/.test(data)) throw appError('بيانات الملف غير صالحة.');
    if (Math.floor(data.length * 3 / 4) > max + 3) throw appError('حجم الملف يتجاوز ' + Math.round(max / 1048576) + ' ميجابايت.');
    var bytes = Utilities.base64Decode(data);
    if (!bytes.length) throw appError('الملف فارغ.');
    if (office) {
      Files.officeCheck_(office, ext, bytes);
      return { mime: mime, bytes: bytes, ext: ext, convert: office.convert };
    }
    if (!Files.signatureOk_(mime, bytes)) throw appError('محتوى الملف لا يطابق نوعه المعلن (' + FILES_TYPES[mime].toUpperCase() + ').');
    return { mime: mime, bytes: bytes, ext: FILES_TYPES[mime], convert: '' };
  },

  /** بايتات كنص لاتيني (بايت = حرف) للبحث فيها، على أجزاء حتى لا يتجاوز حد الوسائط */
  latin1_: function (bytes, from, to) {
    var out = '', step = 8192;
    for (var i = from; i < to; i += step) {
      var part = [];
      for (var j = i; j < Math.min(to, i + step); j++) part.push(bytes[j] & 255);
      out += String.fromCharCode.apply(null, part);
    }
    return out;
  },

  /** Office الحديث (ZIP) والقديم (OLE) والنصوص: البنية تطابق الامتداد، ولا وحدات ماكرو */
  officeCheck_: function (spec, ext, bytes) {
    var b = function (i) { return bytes[i] & 255; };
    var bad = function () { return appError('محتوى الملف لا يطابق نوعه المعلن (' + ext.toUpperCase() + ').'); };
    var macro = function () { return appError('الملفات التي تحتوي وحدات ماكرو غير مسموحة. احفظ الملف بلا ماكرو ثم ارفعه.'); };
    if (spec.kind === 'zip') {
      if (bytes.length < 30 || b(0) !== 0x50 || b(1) !== 0x4B || b(2) !== 0x03 || b(3) !== 0x04) throw bad();
      // الدليل المركزي في آخر الملف يسرد كل أسماء الملفات داخله
      var tail = Files.latin1_(bytes, Math.max(0, bytes.length - 1048576), bytes.length);
      if (tail.indexOf('[Content_Types].xml') < 0 || tail.indexOf(spec.dir) < 0) throw bad();
      if (tail.indexOf('vbaProject.bin') >= 0) throw macro();
      return;
    }
    if (spec.kind === 'ole') {
      var sig = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
      if (bytes.length < 512 || sig.some(function (v, i) { return b(i) !== v; })) throw bad();
      if (Files.latin1_(bytes, 0, bytes.length).indexOf('_\u0000V\u0000B\u0000A\u0000_\u0000P\u0000R\u0000O\u0000J\u0000E\u0000C\u0000T') >= 0) throw macro();
      return;
    }
    // نص: لا بايت صفري ولا رموز تحكم غير السطر والجدولة
    for (var i = 0; i < Math.min(bytes.length, 65536); i++) {
      var c = b(i);
      if (c < 32 && c !== 9 && c !== 10 && c !== 12 && c !== 13) throw bad();
    }
  },

  /**
   * معاينة PDF لملف Office: يحوّله Drive إلى صيغة جوجل ثم يصدّره PDF في المجلد نفسه، ويحذف الصيغة المؤقتة.
   * يحتاج خدمة Drive المتقدمة (appsscript.json). يعيد معرّف ملف المعاينة، أو '' إن تعذّر (ويبقى الأصل للتنزيل).
   */
  preview_: function (fileId, convert, folder, name) {
    if (!convert || typeof Drive === 'undefined' || !Drive.Files) return '';
    var tmpId = '';
    try {
      var src = DriveApp.getFileById(fileId);
      tmpId = Drive.Files.create({ name: name, mimeType: convert, parents: [folder.getId()] }, src.getBlob()).id;
      var pdf = DriveApp.getFileById(tmpId).getAs('application/pdf');
      pdf.setName(String(name).replace(/\.[^.]+$/, '') + '.pdf');
      return folder.createFile(pdf).getId();
    } catch (e) {
      console.error('preview: ' + e);
      return '';
    } finally {
      if (tmpId) Files.trash_(tmpId);
    }
  },

  /** مساحة Drive لحساب الخادم بالبايت، أو null إن لم يكن Drive مفعّلاً (system.storage) */
  storage_: function () {
    if (!Files.available_()) return null;
    var used = DriveApp.getStorageUsed(), limit = DriveApp.getStorageLimit();
    return { used: used, limit: limit, percent: limit ? Math.round(used / limit * 1000) / 10 : 0, warnAt: 80 };
  },

  /** تنبيه مدير النظام عند 80% و95% من المساحة، مرة لكل مستوى في الشهر (من الصيانة اليومية) */
  storageAlert_: function () {
    var s = Files.storage_();
    if (!s || s.percent < 80) return null;
    var level = s.percent >= 95 ? '95' : '80', gb = function (n) { return (Math.round(n / 1073741824 * 10) / 10) + ''; };
    var items = Db.view('core', 'Users').filter(function (u) { return u.active && u.isSuperAdmin; }).map(function (u) {
      return {
        userId: u.id, kind: 'event', module: 'system', title: 'مساحة Google Drive للبوابة تقترب من الامتلاء',
        detail: s.percent + '% · ' + gb(s.used) + ' من ' + gb(s.limit) + ' GB', link: '/settings/company',
        refKey: 'drive.storage:' + localDate_().slice(0, 7) + ':' + level
      };
    });
    if (items.length) Notify.push_(null, items);
    return s;
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
