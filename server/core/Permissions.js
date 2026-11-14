/**
 * الصلاحيات = الدور في الوحدة + نطاق البيانات.
 * مدير النظام (isSuperAdmin) يملك كل شيء.
 * المدير المباشر علاقة (managerId) تُضاف مع وحدة الموارد البشرية، لا دوراً.
 */
var Permissions = {
  /** { attendance: 'employee', custody: 'accountant', ... } */
  rolesOf: function (userId) {
    var out = {};
    Db.find('core', 'UserRoles', function (r) { return r.userId === userId; }).forEach(function (r) { out[r.module] = r.role; });
    return out;
  },

  /**
   * يتحقق من صلاحية المسار.
   * perm: undefined (أي مستخدم مسجّل) · 'super' · { module: 'x', roles: ['a','b'] }
   */
  assert: function (ctx, perm) {
    if (!perm) return;
    if (ctx.user.isSuperAdmin) return;
    if (perm === 'super') throw appError('هذا الإجراء لمدير النظام فقط.', 'FORBIDDEN');
    var role = ctx.roles[perm.module];
    if (!role || (perm.roles && perm.roles.indexOf(role) < 0)) {
      throw appError('ليست لديك صلاحية لهذا الإجراء.', 'FORBIDDEN');
    }
  },

  /** الوحدات التي يراها المستخدم في القائمة. */
  visibleModules: function (ctx) {
    return MODULES.map(function (m) {
      var role = ctx.user.isSuperAdmin ? 'super' : ctx.roles[m.key];
      return { key: m.key, label: m.label, enabled: m.enabled, role: role || null };
    }).filter(function (m) { return m.role; });
  },

  /** يستبدل أدوار مستخدم بالكامل: { module: role | '' } */
  setRoles: function (actor, userId, roles) {
    return withLock(function () {
      var current = Db.find('core', 'UserRoles', function (r) { return r.userId === userId; });
      var changes = [];
      MODULES.forEach(function (m) {
        var want = roles && roles[m.key] ? String(roles[m.key]) : '';
        if (want && !m.roles[want]) throw appError('دور غير معروف في ' + m.label + '.');
        var have = current.filter(function (r) { return r.module === m.key; });
        var haveRole = have.length ? have[0].role : '';
        if (haveRole === want) return;
        have.forEach(function (r) { Db.remove('core', 'UserRoles', r.id); });
        if (want) Db.insert('core', 'UserRoles', { userId: userId, module: m.key, role: want, createdAt: nowIso(), createdBy: actor.id });
        changes.push(m.label + ': ' + (haveRole ? m.roles[haveRole] : '—') + ' ← ' + (want ? m.roles[want] : '—'));
      });
      return changes;
    });
  }
};
