/**
 * سجل العمليات: من فعل ماذا ومتى.
 */
var Audit = {
  log: function (user, module, action, entity, entityId, details) {
    try {
      Db.insert('core', 'AuditLog', {
        ts: nowIso(), userId: user ? user.id : '', userName: user ? user.fullName : '',
        module: module, action: action, entity: entity || '', entityId: entityId || '', details: details || null
      });
    } catch (e) {
      console.error('Audit failed: ' + e);
    }
    Notify.onAudit_(user, module, action, entity, entityId, details);
  },

  /** payload: { module?, userId?, q?, page?, pageSize? } */
  list: function (ctx, p) {
    p = p || {};
    var rows = Db.all('core', 'AuditLog');
    if (p.module) rows = rows.filter(function (r) { return r.module === p.module; });
    if (p.userId) rows = rows.filter(function (r) { return r.userId === p.userId; });
    if (p.q) {
      var q = String(p.q).toLowerCase();
      rows = rows.filter(function (r) { return (r.action + ' ' + r.userName + ' ' + r.entityId + ' ' + JSON.stringify(r.details || '')).toLowerCase().indexOf(q) >= 0; });
    }
    rows.sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
    var size = Math.min(Number(p.pageSize) || 50, 200);
    var page = Math.max(Number(p.page) || 1, 1);
    return { total: rows.length, page: page, pageSize: size, rows: rows.slice((page - 1) * size, page * size) };
  }
};
