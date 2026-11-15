/**
 * المهام المؤجّلة (المشغّلات الزمنية).
 * - processMailQueue: كل دقيقة، يرسل ما في طابور البريد (Notify.drainMail_).
 * - dailyMaintenance: يومياً فجراً، النسخة الاحتياطية وتنظيف السجلات.
 * تُركَّب المشغّلات تلقائياً أول مرة يدخل مدير النظام بعد النشر (Jobs.ensure_)، أو من المحرر بتشغيل installTriggers.
 */
var JOBS_ = [
  { fn: 'processMailQueue', build: function (t) { return t.timeBased().everyMinutes(1); } },
  { fn: 'dailyMaintenance', build: function (t) { return t.timeBased().everyDays(1).atHour(3).inTimezone(APP.TZ); } }
];

var Jobs = {
  available_: function () {
    try { ScriptApp.getProjectTriggers(); return true; } catch (e) { return false; }
  },

  /** المشغّلات المركّبة الآن (أسماء الدوال) */
  installed_: function () {
    return ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  },

  /** يركّب ما ينقص من المشغّلات. يعيد ما رُكِّب الآن */
  install_: function () {
    var have = Jobs.installed_(), added = [];
    JOBS_.forEach(function (j) {
      if (have.indexOf(j.fn) >= 0) return;
      j.build(ScriptApp.newTrigger(j.fn)).create();
      added.push(j.fn);
    });
    return added;
  },

  /** فحص خفيف (مرة كل 6 ساعات) أن المشغّلات مركّبة؛ يُستدعى عند دخول مدير النظام */
  ensure_: function () {
    var cache = CacheService.getScriptCache();
    if (cache.get('jobs.ensured')) return;
    cache.put('jobs.ensured', '1', 21600);
    try { Jobs.install_(); } catch (e) { console.error('jobs: ' + e); }
  },

  /** system.jobs — حالة المشغّلات والطوابير، و{install:1} لتركيبها */
  status: function (ctx, p) {
    var out = { available: Jobs.available_(), triggers: [], mailQueue: Db.view('core', 'MailQueue').length, expected: JOBS_.map(function (j) { return j.fn; }) };
    if (!out.available) return out;
    if (p && p.install) out.installed = Jobs.install_();
    out.triggers = Jobs.installed_();
    out.backup = Backup.status_();
    return out;
  }
};

/** مشغّل زمني: كل دقيقة */
function processMailQueue() {
  return Notify.drainMail_();
}

/** مشغّل زمني: يومياً */
function dailyMaintenance() {
  var out = {};
  try { out.backup = Backup.run_(); } catch (e) { out.backupError = String(e); console.error('backup: ' + (e.stack || e)); }
  try { out.mail = Notify.drainMail_(); } catch (e) { console.error('mail: ' + e); }
  return out;
}

/** شغّلها من المحرر مرة واحدة لتركيب المشغّلات الزمنية (تطلب الموافقة على صلاحيتها). */
function installTriggers() {
  var added = Jobs.install_();
  Logger.log(added.length ? 'installed: ' + added.join(', ') : 'all triggers already installed');
  return added;
}
