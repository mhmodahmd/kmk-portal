/**
 * إعدادات الشركة (key → value JSON).
 */
var Settings = {
  get_: function (key, fallback) {
    var rows = Db.find('core', 'Settings', function (r) { return r.key === key; });
    return rows.length && rows[0].value != null ? rows[0].value : fallback;
  },

  set_: function (key, value, user) {
    return withLock(function () {
      var rows = Db.find('core', 'Settings', function (r) { return r.key === key; });
      if (rows.length) {
        var sh = Db.sheet_('core', 'Settings');
        var data = sh.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) {
          if (String(data[i][0]) === key) {
            sh.getRange(i + 1, 1, 1, 4).setValues([[key, JSON.stringify(value), nowIso(), user ? user.id : '']]);
            break;
          }
        }
        Db.bump_('core', 'Settings');
      } else {
        Db.insert('core', 'Settings', { key: key, value: value, updatedAt: nowIso(), updatedBy: user ? user.id : '' });
      }
      return value;
    });
  },

  company_: function () {
    return Object.assign({ name: 'شركة كي ام كي', address: '', phone: '' }, Settings.get_('company', {}));
  },

  get: function () {
    return { company: Settings.company_() };
  },

  update: function (ctx, p) {
    var c = p && p.company ? p.company : {};
    var next = {
      name: requireText(c.name, 'اسم الشركة', 100),
      address: optionalText(c.address, 200),
      phone: optionalText(normalizeDigits(c.phone), 30)
    };
    Settings.set_('company', next, ctx.user);
    Audit.log(ctx.user, 'core', 'settings.update', 'Settings', 'company', next);
    return { company: next };
  }
};
