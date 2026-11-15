/**
 * النسخ الاحتياطي اليومي: نسخة كاملة من كل ملف بيانات (Sheets) في مجلد «KMK-Backups» على درايف مالك البوابة،
 * باسم KMK-<قاعدة>-YYYY-MM-DD، مع إبقاء آخر 30 يوماً فقط (الأقدم يُنقل إلى سلة المهملات).
 * يعمل من المشغّل اليومي (dailyMaintenance) أو يدوياً من مدير النظام (system.backup).
 */
var BACKUP_KEEP_DAYS = 30;
var BACKUP_DBS = ['core', 'hr', 'attendance', 'custody', 'tasks', 'crm'];

var Backup = {
  folder_: function () {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty('BACKUP_FOLDER');
    if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* أُزيل المجلد؛ ننشئ غيره */ } }
    var name = (props.getProperty('ENV_NAME') || APP.NAME) + ' - Backups';
    var it = DriveApp.getRootFolder().getFoldersByName(name);
    var folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
    props.setProperty('BACKUP_FOLDER', folder.getId());
    return folder;
  },

  /** ينسخ كل قواعد البيانات المفعّلة ويحذف الأقدم من 30 يوماً. يعيد ملخصاً */
  run_: function () {
    Files.require_();
    var folder = Backup.folder_();
    var day = localDate_();
    var copied = [], skipped = [];
    BACKUP_DBS.forEach(function (key) {
      var id = PropertiesService.getScriptProperties().getProperty('DB_' + key.toUpperCase());
      if (!id) { skipped.push(key); return; }
      var name = 'KMK-' + key + '-' + day;
      if (Backup.exists_(folder, name)) { skipped.push(key); return; }
      DriveApp.getFileById(id).makeCopy(name, folder);
      copied.push(key);
    });
    var removed = Backup.prune_(folder);
    var out = { at: nowIso(), day: day, copied: copied, skipped: skipped, removed: removed, folderUrl: folder.getUrl() };
    PropertiesService.getScriptProperties().setProperty('BACKUP_LAST', JSON.stringify(out));
    return out;
  },

  exists_: function (folder, name) {
    var it = folder.getFilesByName(name);
    while (it.hasNext()) { if (!it.next().isTrashed()) return true; }
    return false;
  },

  /** يحذف نسخ KMK-* الأقدم من BACKUP_KEEP_DAYS (إلى سلة المهملات) ويعيد أسماءها */
  prune_: function (folder) {
    var limit = new Date(Date.now() - BACKUP_KEEP_DAYS * 86400000).getTime();
    var removed = [];
    var it = folder.getFiles();
    while (it.hasNext()) {
      var f = it.next();
      if (!/^KMK-[a-z]+-\d{4}-\d{2}-\d{2}$/.test(f.getName()) || f.isTrashed()) continue;
      if (f.getDateCreated().getTime() < limit) { f.setTrashed(true); removed.push(f.getName()); }
    }
    return removed;
  },

  /** آخر نسخة ومجلدها (لصفحة الإعدادات) */
  status_: function () {
    var props = PropertiesService.getScriptProperties();
    var last = null;
    try { last = JSON.parse(props.getProperty('BACKUP_LAST') || 'null'); } catch (e) { last = null; }
    return { available: Files.available_(), last: last, keepDays: BACKUP_KEEP_DAYS };
  },

  /** system.backup — نسخة الآن (مدير النظام) */
  now: function (ctx) {
    var out = Backup.run_();
    Audit.log(ctx.user, 'system', 'backup.run', 'Backup', out.day, { copied: out.copied, removed: out.removed.length });
    return out;
  }
};
