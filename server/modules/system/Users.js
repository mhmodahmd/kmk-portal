/**
 * إدارة المستخدمين وأدوارهم (لمدير النظام).
 */
var Users = {
  view_: function (u, rolesByUser) {
    return Object.assign(Auth.publicUser_(u), { roles: rolesByUser[u.id] || {}, createdAt: u.createdAt });
  },

  list: function () {
    var rolesByUser = {};
    Db.all('core', 'UserRoles').forEach(function (r) {
      (rolesByUser[r.userId] = rolesByUser[r.userId] || {})[r.module] = r.role;
    });
    var users = Db.all('core', 'Users').map(function (u) { return Users.view_(u, rolesByUser); });
    users.sort(function (a, b) { return (b.active - a.active) || a.fullName.localeCompare(b.fullName, 'ar'); });
    return {
      users: users,
      modules: MODULES.map(function (m) {
        return { key: m.key, label: m.label, enabled: m.enabled, roles: Object.keys(m.roles).map(function (k) { return { key: k, label: m.roles[k] }; }) };
      })
    };
  },

  activeAdmins_: function () {
    return Db.find('core', 'Users', function (u) { return u.active && u.isSuperAdmin; }).length;
  },

  /** كلمة مرور مؤقتة يراها المدير مرة واحدة، والمستخدم يغيّرها عند أول دخول. */
  tempPassword_: function () {
    var letters = 'abcdefghjkmnpqrstuvwxyz', digits = '23456789', out = '';
    for (var i = 0; i < 6; i++) out += letters.charAt(Math.floor(Math.random() * letters.length));
    for (var j = 0; j < 4; j++) out += digits.charAt(Math.floor(Math.random() * digits.length));
    return out;
  },

  create: function (ctx, p) {
    return withLock(function () {
      var username = normalizeUsername(p.username);
      if (Auth.findByUsername_(username)) throw appError('اسم المستخدم مستخدم من قبل. اختر اسماً آخر.');
      var u = Db.insert('core', 'Users', {
        username: username,
        fullName: requireText(p.fullName, 'الاسم الكامل', 80),
        jobTitle: optionalText(p.jobTitle, 60),
        phone: optionalText(normalizeDigits(p.phone), 30),
        email: optionalText(p.email, 100),
        active: true, isSuperAdmin: !!p.isSuperAdmin, failedAttempts: 0,
        createdAt: nowIso(), createdBy: ctx.user.id, updatedAt: nowIso()
      });
      var temp = Users.tempPassword_();
      u = Auth.setPassword_(u, temp, true);
      var changes = Permissions.setRoles(ctx.user, u.id, p.roles || {});
      Audit.log(ctx.user, 'core', 'user.create', 'User', u.id, { username: username, roles: changes });
      return { user: Users.view_(u, { [u.id]: Permissions.rolesOf(u.id) }), tempPassword: temp };
    });
  },

  update: function (ctx, p) {
    return withLock(function () {
      var u = Db.getOrThrow('core', 'Users', p.id, 'المستخدم');
      var next = {
        fullName: requireText(p.fullName, 'الاسم الكامل', 80),
        jobTitle: optionalText(p.jobTitle, 60),
        phone: optionalText(normalizeDigits(p.phone), 30),
        email: optionalText(p.email, 100),
        active: p.active !== false,
        isSuperAdmin: !!p.isSuperAdmin,
        updatedAt: nowIso()
      };
      var losesAdmin = u.isSuperAdmin && u.active && (!next.isSuperAdmin || !next.active);
      if (losesAdmin && Users.activeAdmins_() <= 1) throw appError('يجب أن يبقى مدير نظام نشط واحد على الأقل.');
      if (u.id === ctx.user.id && !next.active) throw appError('لا يمكنك تعطيل حسابك بنفسك.');
      u = Db.update('core', 'Users', u.id, next);
      var changes = p.roles ? Permissions.setRoles(ctx.user, u.id, p.roles) : [];
      Audit.log(ctx.user, 'core', 'user.update', 'User', u.id, { fields: next, roles: changes });
      return Users.view_(u, { [u.id]: Permissions.rolesOf(u.id) });
    });
  },

  setRoles: function (ctx, p) {
    Db.getOrThrow('core', 'Users', p.id, 'المستخدم');
    var changes = Permissions.setRoles(ctx.user, p.id, p.roles || {});
    if (changes.length) Audit.log(ctx.user, 'core', 'user.setRoles', 'User', p.id, { changes: changes });
    return Permissions.rolesOf(p.id);
  },

  resetPassword: function (ctx, p) {
    var u = Db.getOrThrow('core', 'Users', p.id, 'المستخدم');
    var temp = Users.tempPassword_();
    Auth.setPassword_(u, temp, true);
    Audit.log(ctx.user, 'core', 'user.resetPassword', 'User', u.id, null);
    return { tempPassword: temp };
  },

  unlock: function (ctx, p) {
    var u = Db.getOrThrow('core', 'Users', p.id, 'المستخدم');
    Db.update('core', 'Users', u.id, { failedAttempts: 0, lockedUntil: '' });
    Audit.log(ctx.user, 'core', 'user.unlock', 'User', u.id, null);
    return true;
  }
};
