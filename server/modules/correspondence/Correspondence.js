/**
 * وحدة المراسلات (0.9.7): الصادر والوارد وأرشفتهما وربطهما بالعملاء والمشاريع وأي عنصر في النظام.
 *
 * - الخطاب رقمه تسلسلي بالسنة: OUT-2026-0001 للصادر وIN-2026-0001 للوارد (سنة تاريخ الخطاب).
 * - الحالات: مسودة (صادر لم يُرسل) ← مُرسل · مستلَم (وارد) ← تم الرد ← مؤرشف. الرد خطاب مستقل في الاتجاه المقابل
 *   مرتبط بالأصل (replyToId)، وتسجيله يجعل الأصل «تم الرد» تلقائياً.
 * - الأدوار (docs/05): «موظف مراسلات» يسجّل ويؤرشف ويرى ما سجّله أو أُحيل إليه؛ «مدير المراسلات» يرى الكل ويحذف ويضبط التصنيفات.
 * - الجهة: اسم حر أو عميل من وحدة العملاء (clientId). الربط: مشروع (projectId) وعنصر آخر (linkedType/linkedId: عميل، مشروع، عهدة، موظف، مهمة).
 * - المرفقات على درايف عبر Files (مجلد «المراسلات/YYYY»)، وسجل التتبع (LetterLog) لكل حدث.
 * - الإشعارات: إحالة خطاب إلى مسؤول، وتذكير بموعد الرد (قبل يومين وعند التأخر) لمن يتابعه.
 *
 * المستندات (المرحلة 1 من docs/08):
 * - أنواع المستندات (DocTypes) وحقولها الخاصة (DocFields) من الإعدادات. الوارد والصادر نوعان مدمجان (IN, OUT)،
 *   والخطاب القديم بلا typeId يُعدّ من نوع اتجاهه. الأنواع الداخلية (مذكرة، تعميم، قرار) اتجاهها internal.
 * - الرقم من نمط النوع `{code}-{year}-{seq:4}`، فيبقى ترقيم الوارد والصادر كما هو.
 * - السرية: عام · داخلي (الافتراضي، وهو سلوك المراسلات السابق) · سري · سري جداً، مع قائمة اطلاع (readers).
 * - الملف الرئيسي بإصدارات (DocVersions)، والمرفقات حتى 25 ميجابايت بأنواع Office والنصوص، ومعاينة PDF لملفات Office.
 */
var COR_SCHEMA = {
  Letters: [
    ['id', 'text'], ['number', 'text'], ['direction', 'text'], ['subject', 'text'], ['summary', 'text'],
    ['party', 'text'], ['clientId', 'text'], ['date', 'date'], ['receivedAt', 'ts'], ['sentAt', 'ts'], ['refNo', 'text'],
    ['channel', 'text'], ['category', 'text'], ['status', 'text'], ['replyToId', 'text'], ['dueDate', 'date'], ['assigneeId', 'text'],
    ['linkedType', 'text'], ['linkedId', 'text'], ['projectId', 'text'], ['tags', 'json'], ['archivedAt', 'ts'],
    ['createdBy', 'text'], ['createdAt', 'ts'], ['updatedBy', 'text'], ['updatedAt', 'ts'],
    ['typeId', 'text'], ['fields', 'json'], ['confidentiality', 'text'], ['readers', 'json'], ['version', 'num'], ['mainFileId', 'text']
  ],
  LetterFiles: [
    ['id', 'text'], ['letterId', 'text'], ['fileName', 'text'], ['driveFileId', 'text'], ['mimeType', 'text'], ['fileSize', 'num'],
    ['uploadedBy', 'text'], ['uploadedAt', 'ts'], ['role', 'text'], ['version', 'num'], ['previewFileId', 'text'], ['sha256', 'text']
  ],
  LetterLog: [['id', 'text'], ['letterId', 'text'], ['kind', 'text'], ['body', 'text'], ['byId', 'text'], ['at', 'ts']],
  Categories: [['id', 'text'], ['name', 'text'], ['active', 'bool'], ['sortOrder', 'num']],
  DocTypes: [
    ['id', 'text'], ['name', 'text'], ['code', 'text'], ['direction', 'text'], ['numberPattern', 'text'], ['confidentiality', 'text'],
    ['builtin', 'bool'], ['active', 'bool'], ['sortOrder', 'num'], ['createdAt', 'ts'], ['updatedAt', 'ts']
  ],
  DocFields: [
    ['id', 'text'], ['typeId', 'text'], ['key', 'text'], ['label', 'text'], ['kind', 'text'], ['options', 'json'],
    ['required', 'bool'], ['inList', 'bool'], ['sortOrder', 'num'], ['active', 'bool']
  ],
  DocVersions: [
    ['id', 'text'], ['letterId', 'text'], ['version', 'num'], ['fileId', 'text'], ['snapshot', 'json'], ['note', 'text'], ['byId', 'text'], ['at', 'ts']
  ]
};

var COR = {
  DIRECTION: { in: 'وارد', out: 'صادر', internal: 'داخلي' },
  STATUS: { draft: 'مسودة', sent: 'مُرسل', received: 'مستلَم', replied: 'تم الرد', archived: 'مؤرشف' },
  ORDER: ['draft', 'sent', 'received', 'replied', 'archived'],
  OPEN: ['draft', 'sent', 'received'],
  CHANNEL: { mail: 'بريد عادي', hand: 'باليد', whatsapp: 'واتساب', email: 'بريد إلكتروني', fax: 'فاكس' },
  LINKS: { client: 'عميل', project: 'مشروع', custody: 'عهدة', employee: 'موظف', task: 'مهمة' },
  LOG: { create: 'تسجيل', update: 'تعديل', send: 'إرسال', receive: 'استلام', reply: 'رد', archive: 'أرشفة', restore: 'إعادة من الأرشيف', forward: 'إحالة', file: 'مرفق', version: 'إصدار جديد' },
  CONF: { public: 'عام', internal: 'داخلي', secret: 'سري', top_secret: 'سري جداً' },
  FIELD_KINDS: { text: 'نص', number: 'رقم', money: 'مبلغ', date: 'تاريخ', select: 'قائمة', user: 'شخص', client: 'عميل', project: 'مشروع' },
  PATTERN: '{code}-{year}-{seq:4}',
  DEFAULT_TYPES: [
    { code: 'IN', name: 'وارد', direction: 'in', builtin: true },
    { code: 'OUT', name: 'صادر', direction: 'out', builtin: true },
    { code: 'MEMO', name: 'مذكرة داخلية', direction: 'internal' },
    { code: 'CIRC', name: 'تعميم', direction: 'internal' },
    { code: 'DEC', name: 'قرار إداري', direction: 'internal' }
  ],
  MAX_FIELDS: 20,
  MAX_READERS: 30,
  DUE_DAYS: 2,
  MAX_TAGS: 10,
  DEFAULT_CATEGORIES: ['عام', 'تعاقدي', 'مالي', 'إداري', 'شكوى']
};

var Correspondence = {
  // ───────── أساسيات ─────────
  rows_: function (t) { return Db.view('correspondence', t); },
  isMgr_: function (ctx) { return Permissions.has(ctx, 'correspondence', ['manager']); },
  enabled_: function (key) { var m = moduleDef_(key); return !!(m && m.enabled); },

  /**
   * مستوى الاطلاع: 'full' (البيانات والملفات) · 'meta' (البيانات دون الملفات والملخص) · null.
   * المنشئ والمسؤول وقائمة الاطلاع ومدير النظام دائماً full. ثم حسب السرية:
   * عام: كل من له دور · داخلي: المدير · سري: المدير بياناته فقط · سري جداً: لا أحد غيرهم.
   */
  access_: function (ctx, l) {
    var u = ctx.user.id;
    if (ctx.user.isSuperAdmin || l.createdBy === u || l.assigneeId === u || (l.readers || []).indexOf(u) >= 0) return 'full';
    var conf = l.confidentiality || 'internal', mgr = Correspondence.isMgr_(ctx);
    if (conf === 'public') return Permissions.has(ctx, 'correspondence') ? 'full' : null;
    if (conf === 'internal') return mgr ? 'full' : null;
    if (conf === 'secret') return mgr ? 'meta' : null;
    return null;
  },
  canSee_: function (ctx, l) { return !!Correspondence.access_(ctx, l); },
  canFiles_: function (ctx, l) { return Correspondence.access_(ctx, l) === 'full'; },
  /** يعدّل ويغيّر الحالة ويحيل ويرفق: من سجّله أو المحال إليه، أو المدير فيما يطّلع عليه كاملاً */
  canEdit_: function (ctx, l) {
    var u = ctx.user.id;
    return ctx.user.isSuperAdmin || l.createdBy === u || l.assigneeId === u || (Correspondence.isMgr_(ctx) && Correspondence.canFiles_(ctx, l));
  },

  visible_: function (ctx, id) {
    var l = Db.get('correspondence', 'Letters', id);
    if (!l || !Correspondence.canSee_(ctx, l)) throw appError('الخطاب غير موجود.', 'NOT_FOUND');
    return l;
  },

  /** قيم مبدئية للتصنيفات وأنواع المستندات عند أول تشغيل */
  seed_: function () {
    if (!Correspondence.rows_('Categories').length) {
      Db.insertMany('correspondence', 'Categories', COR.DEFAULT_CATEGORIES.map(function (n, i) { return { name: n, active: true, sortOrder: i + 1 }; }));
    }
    if (!Correspondence.rows_('DocTypes').length) {
      Db.insertMany('correspondence', 'DocTypes', COR.DEFAULT_TYPES.map(function (t, i) {
        return { name: t.name, code: t.code, direction: t.direction, numberPattern: COR.PATTERN, confidentiality: 'internal', builtin: !!t.builtin, active: true, sortOrder: i + 1, createdAt: nowIso(), updatedAt: nowIso() };
      }));
    }
  },

  // ───────── أنواع المستندات ─────────
  typesSorted_: function () {
    Correspondence.seed_();
    return Correspondence.rows_('DocTypes').slice().sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
  },

  /** حقول نوع (المفعّلة فقط إلا مع all) بالترتيب */
  fieldsOf_: function (typeId, all) {
    return Correspondence.rows_('DocFields').filter(function (f) { return f.typeId === typeId && (all || f.active); })
      .sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
  },

  /** نوع الخطاب: typeId، أو النوع المدمج لاتجاهه للخطابات المسجلة قبل الأنواع */
  typeOf_: function (l, m) {
    var types = m ? m.types : indexBy_(Correspondence.typesSorted_());
    if (l.typeId && types[l.typeId]) return types[l.typeId];
    var code = l.direction === 'in' ? 'IN' : l.direction === 'out' ? 'OUT' : '';
    return Object.keys(types).map(function (k) { return types[k]; }).filter(function (t) { return t.builtin && t.code === code; })[0] || null;
  },

  builtinOf_: function (direction) {
    var code = direction === 'in' ? 'IN' : 'OUT';
    return Correspondence.typesSorted_().filter(function (t) { return t.builtin && t.code === code; })[0];
  },

  /** نمط الترقيم: ينتهي بـ -{seq} أو -{seq:N}، وفيه {code} حتى لا تتشارك الأنواع تسلسلاً واحداً */
  parsePattern_: function (pattern) {
    var m = /^((?:\{code\}|\{year\}|[A-Za-z0-9\/-])+)-\{seq(?::([3-6]))?\}$/.exec(String(pattern || ''));
    if (!m || m[1].indexOf('{code}') < 0) return null;
    return { prefix: m[1], pad: Number(m[2] || 4) };
  },

  numberFor_: function (type, date) {
    var pp = Correspondence.parsePattern_(type.numberPattern) || Correspondence.parsePattern_(COR.PATTERN);
    return Db.nextSerial(pp.prefix.replace(/\{code\}/g, type.code).replace(/\{year\}/g, date.slice(0, 4)), pp.pad);
  },

  /** قيمة حقل خاص بعد التحقق: '' للفارغ، والمبلغ بالفلس */
  fieldValue_: function (f, v) {
    var empty = v == null || String(v).trim() === '';
    if (empty) {
      if (f.required) throw appError('أدخل ' + f.label + '.');
      return '';
    }
    switch (f.kind) {
      case 'number': {
        var n = Number(normalizeDigits(v).replace(/[,،\s]/g, ''));
        if (!isFinite(n)) throw appError(f.label + ' غير صحيح.');
        return n;
      }
      case 'money': return parseMoney_(v, f.label, { allowZero: true });
      case 'date': return requireDate_(v, f.label);
      case 'select':
        if ((f.options || []).indexOf(String(v)) < 0) throw appError(f.label + ': القيمة غير موجودة في القائمة.');
        return String(v);
      case 'user': {
        var u = Db.get('core', 'Users', String(v));
        if (!u || !u.active) throw appError(f.label + ': الشخص غير موجود أو حسابه معطّل.');
        return u.id;
      }
      case 'client': case 'project':
        if (!Correspondence.enabled_('crm')) throw appError('وحدة العملاء غير مفعّلة.');
        return Db.getOrThrow('crm', f.kind === 'client' ? 'Clients' : 'Projects', String(v), f.label).id;
      default: return optionalText(v, 500);
    }
  },

  /** قيم الحقول الخاصة لنوع. الحقول الموقوفة تحتفظ بقيمها السابقة */
  fieldValues_: function (type, input, prev) {
    var out = Object.assign({}, prev || {}), vals = input && typeof input === 'object' ? input : {};
    Correspondence.fieldsOf_(type.id).forEach(function (f) { out[f.key] = Correspondence.fieldValue_(f, vals[f.key]); });
    return out;
  },

  fieldDisplay_: function (f, v, m) {
    if (v === '' || v == null) return '';
    switch (f.kind) {
      case 'money': return kwd_(v);
      case 'date': return dmy_(v);
      case 'user': return Correspondence.userName_(m, v);
      case 'client': return m.clients[v] ? m.clients[v].name : '';
      case 'project': return m.projects[v] ? m.projects[v].name : '';
      default: return String(v);
    }
  },

  /** قائمة الاطلاع: مستخدمون نشطون، بلا تكرار */
  readers_: function (input) {
    var list = (Array.isArray(input) ? input : String(input || '').split(',')).map(function (x) { return String(x).trim(); })
      .filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    if (list.length > COR.MAX_READERS) throw appError('قائمة الاطلاع أكثر من ' + COR.MAX_READERS + ' شخصاً.');
    list.forEach(function (id) { var u = Db.get('core', 'Users', id); if (!u || !u.active) throw appError('أحد أفراد قائمة الاطلاع غير موجود أو حسابه معطّل.'); });
    return list;
  },

  activeCategories_: function () {
    Correspondence.seed_();
    return Correspondence.rows_('Categories').filter(function (r) { return r.active; })
      .sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); }).map(function (r) { return r.name; });
  },

  enum_: function (value, dict, label) {
    var v = String(value == null ? '' : value);
    if (!Object.prototype.hasOwnProperty.call(dict, v)) throw appError(label + ' غير صحيح.');
    return v;
  },

  log_: function (ctx, letterId, kind, body) {
    Db.insert('correspondence', 'LetterLog', { letterId: letterId, kind: kind, body: body || '', byId: ctx.user.id, at: nowIso() });
  },

  maps_: function () {
    var files = {}, replies = {};
    // المرفقات فقط: إصدارات الملف الرئيسي لا تُعد مرفقات
    Correspondence.rows_('LetterFiles').forEach(function (f) { if (f.role !== 'main') files[f.letterId] = (files[f.letterId] || 0) + 1; });
    Correspondence.rows_('Letters').forEach(function (l) { if (l.replyToId) replies[l.replyToId] = (replies[l.replyToId] || 0) + 1; });
    var crm = Correspondence.enabled_('crm'), fields = {};
    Correspondence.rows_('DocFields').forEach(function (f) { if (f.active) (fields[f.typeId] = fields[f.typeId] || []).push(f); });
    Object.keys(fields).forEach(function (k) { fields[k].sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); }); });
    return {
      users: indexBy_(Db.view('core', 'Users')), emps: indexBy_(Staff.all_()), letters: indexBy_(Correspondence.rows_('Letters')),
      clients: crm ? indexBy_(Db.view('crm', 'Clients')) : {}, projects: crm ? indexBy_(Db.view('crm', 'Projects')) : {},
      files: files, replies: replies, types: indexBy_(Correspondence.typesSorted_()), fields: fields
    };
  },

  /** الحقول الخاصة للعرض: [{ key, label, kind, value, display, inList }] */
  fieldsView_: function (l, type, m) {
    var vals = l.fields || {};
    return (type && m.fields[type.id] || []).map(function (f) {
      return { key: f.key, label: f.label, kind: f.kind, value: vals[f.key] == null ? '' : vals[f.key], display: Correspondence.fieldDisplay_(f, vals[f.key], m), inList: !!f.inList };
    });
  },

  userName_: function (m, id) { var u = id && m.users[id]; return u ? u.fullName : ''; },

  linkLabel_: function (m, type, id) {
    if (!type || !id) return '';
    if (type === 'employee') { var e = m.emps[id]; return e ? e.fullName : ''; }
    if (type === 'client') { var c = m.clients[id]; return c ? c.name : ''; }
    if (type === 'project') { var p = m.projects[id]; return p ? p.name : ''; }
    if (type === 'task' && Correspondence.enabled_('tasks')) { var t = Db.get('tasks', 'Tasks', id); return t ? t.number + ' · ' + t.title : ''; }
    if (type === 'custody' && Correspondence.enabled_('custody')) {
      var cu = Db.get('custody', 'Custodies', id);
      if (!cu) return id;
      var e2 = m.emps[cu.employeeId];
      return id + ' · ' + (e2 ? e2.fullName : cu.periodLabel || '');
    }
    return id;
  },

  view_: function (l, m, ctx) {
    var today = localDate_(), open = COR.OPEN.indexOf(l.status) >= 0;
    var client = l.clientId && m.clients[l.clientId], proj = l.projectId && m.projects[l.projectId], orig = l.replyToId && m.letters[l.replyToId];
    var type = Correspondence.typeOf_(l, m), conf = l.confidentiality || 'internal', access = ctx ? Correspondence.access_(ctx, l) : 'full';
    var fields = Correspondence.fieldsView_(l, type, m);
    return {
      typeId: type ? type.id : '', typeName: type ? type.name : COR.DIRECTION[l.direction] || '', typeCode: type ? type.code : '',
      confidentiality: conf, confidentialityLabel: COR.CONF[conf] || conf, readers: l.readers || [],
      version: l.version || 0, hasMainFile: !!l.mainFileId, restricted: access === 'meta',
      fields: access === 'meta' ? [] : fields,
      listFields: access === 'meta' ? [] : fields.filter(function (f) { return f.inList && f.display; }).map(function (f) { return { label: f.label, display: f.display }; }),
      id: l.id, number: l.number, direction: l.direction, directionLabel: COR.DIRECTION[l.direction] || l.direction,
      subject: l.subject, summary: access === 'meta' ? '' : l.summary || '', party: l.party || (client ? client.name : ''), clientId: l.clientId || '', clientName: client ? client.name : '',
      date: l.date || '', receivedAt: l.receivedAt || '', sentAt: l.sentAt || '', refNo: l.refNo || '',
      channel: l.channel || '', channelLabel: COR.CHANNEL[l.channel] || '', category: l.category || '',
      status: l.status, statusLabel: COR.STATUS[l.status] || l.status, open: open,
      replyToId: l.replyToId || '', replyToNumber: orig ? orig.number : '', replyToSubject: orig ? orig.subject : '',
      dueDate: l.dueDate || '', overdue: open && !!l.dueDate && l.dueDate < today,
      daysLeft: open && l.dueDate ? daysBetween_(today, l.dueDate) : null,
      assigneeId: l.assigneeId || '', assigneeName: Correspondence.userName_(m, l.assigneeId),
      linkedType: l.linkedType || '', linkedTypeLabel: COR.LINKS[l.linkedType] || '', linkedId: l.linkedId || '', linkedLabel: Correspondence.linkLabel_(m, l.linkedType, l.linkedId),
      projectId: l.projectId || '', projectName: proj ? proj.name : '', tags: l.tags || [], archivedAt: l.archivedAt || '',
      createdBy: l.createdBy, createdByName: Correspondence.userName_(m, l.createdBy), createdAt: l.createdAt, updatedAt: l.updatedAt,
      filesCount: m.files[l.id] || 0, repliesCount: m.replies[l.id] || 0,
      canEdit: !!ctx && Correspondence.canEdit_(ctx, l), canRemove: !!ctx && Correspondence.isMgr_(ctx), canFiles: access === 'full'
    };
  },

  /** الترتيب: المفتوحة أولاً (الأقرب موعداً، ثم الأحدث تاريخاً)، ثم المغلقة الأحدث تحديثاً */
  sort_: function (list) {
    return list.sort(function (a, b) {
      var oa = COR.OPEN.indexOf(a.status) >= 0 ? 0 : 1, ob = COR.OPEN.indexOf(b.status) >= 0 ? 0 : 1;
      if (oa !== ob) return oa - ob;
      if (oa === 1) return (b.updatedAt || '').localeCompare(a.updatedAt || '');
      var da = a.dueDate || '9999', db = b.dueDate || '9999';
      return da.localeCompare(db) || (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  },

  /** مشاريع العملاء الجارية للاختيار (سجل المشاريع الموحد) */
  projects_: function () {
    if (!Correspondence.enabled_('crm')) return [];
    return Db.view('crm', 'Projects').filter(function (p) { return p.status === 'ongoing' || p.status === 'on_hold'; })
      .map(function (p) { return { id: p.id, name: p.name, clientId: p.clientId }; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
  },

  /** خيارات الربط حسب أدوار المستخدم: العهد للمحاسب (أو عهد الموظف نفسه)، الموظفون للموارد البشرية (أو فريقه ونفسه)، المهام ما يراه */
  linkOptions_: function (ctx) {
    var out = { client: [], project: [], custody: [], employee: [], task: [] };
    var byName = function (a, b) { return a.name.localeCompare(b.name, 'ar'); };
    if (Correspondence.enabled_('crm')) {
      out.client = Db.view('crm', 'Clients').filter(function (c) { return c.status === 'active'; }).map(function (c) { return { id: c.id, name: c.name }; }).sort(byName);
      out.project = Correspondence.projects_().map(function (p) { return { id: p.id, name: p.name }; });
    }
    var me = Staff.ofCtx_(ctx), emps = indexBy_(Staff.all_());
    if (Correspondence.enabled_('custody') && Permissions.has(ctx, 'custody')) {
      var staff = Permissions.has(ctx, 'custody', ['accountant']);
      out.custody = Db.view('custody', 'Custodies').filter(function (c) { return staff || (me && c.employeeId === me.id); })
        .map(function (c) { var e = emps[c.employeeId]; return { id: c.id, name: c.id + ' · ' + (e ? e.fullName : c.periodLabel || '') }; })
        .sort(function (a, b) { return b.id.localeCompare(a.id); });
    }
    var hr = Permissions.has(ctx, 'hr', ['hr']) || Permissions.has(ctx, 'attendance', ['hr']);
    var team = me ? Staff.teamIds_(me.id) : [];
    out.employee = Staff.all_().filter(function (e) { return e.status !== 'terminated' && (hr || (me && (e.id === me.id || team.indexOf(e.id) >= 0))); })
      .map(function (e) { return { id: e.id, name: e.fullName }; }).sort(byName);
    if (Correspondence.enabled_('tasks') && Permissions.has(ctx, 'tasks')) {
      out.task = Db.view('tasks', 'Tasks').filter(function (t) { return TSK.OPEN.indexOf(t.status) >= 0 && Tasks.canSee_(ctx, t); })
        .map(function (t) { return { id: t.id, name: t.number + ' · ' + t.title }; }).sort(function (a, b) { return b.name.localeCompare(a.name); }).slice(0, 200);
    }
    return out;
  },

  // ───────── القراءة ─────────
  lookups: function (ctx) {
    Correspondence.seed_();
    var dict = function (d) { return Object.keys(d).map(function (k) { return { id: k, label: d[k] }; }); };
    var years = {};
    Correspondence.rows_('Letters').forEach(function (l) { if (l.date) years[l.date.slice(0, 4)] = true; });
    years[localDate_().slice(0, 4)] = true;
    return {
      me: ctx.user.id, isManager: Correspondence.isMgr_(ctx), today: localDate_(), drive: Files.available_(),
      people: Db.view('core', 'Users').filter(function (u) { return u.active; }).map(function (u) { return { id: u.id, name: u.fullName }; })
        .sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); }),
      clients: Correspondence.enabled_('crm') ? Db.view('crm', 'Clients').map(function (c) { return { id: c.id, name: c.name }; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); }) : [],
      projects: Correspondence.projects_(),
      directions: dict(COR.DIRECTION), statuses: COR.ORDER.map(function (k) { return { id: k, label: COR.STATUS[k] }; }), channels: dict(COR.CHANNEL),
      categories: Correspondence.activeCategories_(), years: Object.keys(years).sort().reverse(),
      links: Correspondence.linkOptions_(ctx),
      confidentialities: dict(COR.CONF), fieldKinds: dict(COR.FIELD_KINDS),
      types: Correspondence.types().filter(function (t) { return t.active; }).map(function (t) {
        return Object.assign({}, t, { fields: t.fields.filter(function (f) { return f.active; }) });
      })
    };
  },

  /**
   * القوائم. المؤرشفة تُخفى إلا مع archived=true (المؤرشفة فقط) أو withArchived=true (الكل).
   * التصفية: direction, typeId, confidentiality, status, year, clientId, projectId, assigneeId, category, channel, q, linkedType+linkedId, overdue
   */
  list: function (ctx, p) {
    p = p || {};
    var q = String(p.q || '').trim().toLowerCase(), today = localDate_(), m = Correspondence.maps_();
    // خطابات العميل: ما سُجّل باسمه، أو رُبط به، أو على أحد مشاريعه
    var clientProjects = {};
    if (p.clientId) Object.keys(m.projects).forEach(function (id) { if (m.projects[id].clientId === p.clientId) clientProjects[id] = true; });
    var rows = Correspondence.rows_('Letters').filter(function (l) {
      if (!Correspondence.canSee_(ctx, l)) return false;
      if (p.archived && l.status !== 'archived') return false;
      if (!p.archived && !p.withArchived && !p.status && l.status === 'archived') return false;
      if (p.direction && l.direction !== p.direction) return false;
      if (p.typeId) { var ty = Correspondence.typeOf_(l, m); if (!ty || ty.id !== p.typeId) return false; }
      if (p.confidentiality && (l.confidentiality || 'internal') !== p.confidentiality) return false;
      if (p.status && l.status !== p.status) return false;
      if (p.year && (l.date || '').slice(0, 4) !== String(p.year)) return false;
      if (p.clientId && l.clientId !== p.clientId && !(l.linkedType === 'client' && l.linkedId === p.clientId) && !clientProjects[l.projectId]) return false;
      if (p.projectId && l.projectId !== p.projectId && !(l.linkedType === 'project' && l.linkedId === p.projectId)) return false;
      if (p.assigneeId && l.assigneeId !== p.assigneeId) return false;
      if (p.category && l.category !== p.category) return false;
      if (p.channel && l.channel !== p.channel) return false;
      if (p.linkedType && (l.linkedType !== p.linkedType || l.linkedId !== p.linkedId)) return false;
      if (p.overdue && !(COR.OPEN.indexOf(l.status) >= 0 && l.dueDate && l.dueDate < today)) return false;
      if (q) {
        var client = l.clientId && m.clients[l.clientId], full = Correspondence.canFiles_(ctx, l);
        var extra = full ? Correspondence.fieldsView_(l, Correspondence.typeOf_(l, m), m).map(function (f) { return f.display; }) : [];
        var hay = [l.number, l.subject, full ? l.summary : '', l.party, client ? client.name : '', l.refNo, (l.tags || []).join(' ')].concat(extra).join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    return Correspondence.sort_(rows).map(function (l) { return Correspondence.view_(l, m, ctx); });
  },

  fileView_: function (f, m, ctx) {
    return { id: f.id, fileName: f.fileName, mimeType: f.mimeType, isImage: /^image\//.test(f.mimeType || ''), isPdf: f.mimeType === 'application/pdf',
      hasPreview: !!f.previewFileId, fileSize: f.fileSize || 0, role: f.role || 'attachment', version: f.version || 0,
      uploadedByName: Correspondence.userName_(m, f.uploadedBy), uploadedAt: f.uploadedAt,
      canDelete: f.role !== 'main' && (f.uploadedBy === ctx.user.id || Correspondence.isMgr_(ctx)) };
  },

  get: function (ctx, p) {
    var l = Correspondence.visible_(ctx, p && p.id), m = Correspondence.maps_();
    var full = Correspondence.canFiles_(ctx, l), u = ctx.user.id;
    // السري جداً يفتحه مدير النظام من خارج المعنيين: يُسجَّل كل فتح
    if (l.confidentiality === 'top_secret' && l.createdBy !== u && l.assigneeId !== u && (l.readers || []).indexOf(u) < 0) {
      Audit.log(ctx.user, 'correspondence', 'letter.open', 'Letter', l.id, { number: l.number, confidentiality: 'top_secret' });
    }
    var orig = l.replyToId ? Db.get('correspondence', 'Letters', l.replyToId) : null;
    var replies = Correspondence.rows_('Letters').filter(function (x) { return x.replyToId === l.id && Correspondence.canSee_(ctx, x); })
      .sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    var files = full ? Correspondence.rows_('LetterFiles').filter(function (f) { return f.letterId === l.id; }) : [];
    var byId = indexBy_(files);
    var versions = full ? Correspondence.rows_('DocVersions').filter(function (v) { return v.letterId === l.id; })
      .sort(function (a, b) { return b.version - a.version; }).map(function (v) {
        var f = byId[v.fileId];
        return { version: v.version, fileId: v.fileId, fileName: f ? f.fileName : '', note: v.note || '', byName: Correspondence.userName_(m, v.byId), at: v.at, current: v.version === (l.version || 0) };
      }) : [];
    return {
      letter: Correspondence.view_(l, m, ctx),
      original: orig && Correspondence.canSee_(ctx, orig) ? Correspondence.view_(orig, m, ctx) : null,
      replies: replies.map(function (x) { return Correspondence.view_(x, m, ctx); }),
      main: l.mainFileId && byId[l.mainFileId] ? Correspondence.fileView_(byId[l.mainFileId], m, ctx) : null,
      versions: versions,
      readers: (l.readers || []).map(function (id) { return { id: id, name: Correspondence.userName_(m, id) }; }),
      files: files.filter(function (f) { return f.role !== 'main'; }).map(function (f) { return Correspondence.fileView_(f, m, ctx); }),
      log: Correspondence.rows_('LetterLog').filter(function (x) { return x.letterId === l.id; })
        .sort(function (a, b) { return (a.at || '').localeCompare(b.at || ''); })
        .map(function (x) { return { id: x.id, kind: x.kind, kindLabel: COR.LOG[x.kind] || x.kind, body: x.body || '', byName: Correspondence.userName_(m, x.byId), at: x.at }; }),
      can: { edit: Correspondence.canEdit_(ctx, l), remove: Correspondence.isMgr_(ctx), files: full }
    };
  },

  // ───────── الإنشاء والتعديل ─────────
  assertAssignee_: function (userId) {
    var u = Db.get('core', 'Users', userId);
    if (!u || !u.active) throw appError('المسؤول عن المتابعة غير موجود أو حسابه معطّل.');
    return u;
  },

  /** نوع خطاب جديد: typeId، أو النوع المدمج للاتجاه (الوارد والصادر كما كانا) */
  typeForNew_: function (p) {
    var type;
    if (p.typeId) {
      type = Db.getOrThrow('correspondence', 'DocTypes', String(p.typeId), 'نوع المستند');
      if (!type.active) throw appError('نوع المستند موقوف.');
      if (p.direction && p.direction !== type.direction) throw appError('اتجاه الخطاب لا يطابق نوع المستند.');
      return type;
    }
    var direction = Correspondence.enum_(p.direction, COR.DIRECTION, 'اتجاه الخطاب');
    if (direction === 'internal') throw appError('اختر نوع المستند.');
    return Correspondence.builtinOf_(direction);
  },

  /** إنشاء أو تعديل خطاب. الاتجاه والنوع لا يتغيّران بعد التسجيل */
  save: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var cur = p.id ? Correspondence.visible_(ctx, p.id) : null;
      if (cur && !Correspondence.canEdit_(ctx, cur)) throw appError('لا يمكنك تعديل هذا الخطاب.', 'FORBIDDEN');
      if (cur && p.direction && p.direction !== cur.direction) throw appError('لا يُغيَّر اتجاه الخطاب بعد تسجيله.');
      var type = cur ? Correspondence.typeOf_(cur) : Correspondence.typeForNew_(p);
      if (cur && p.typeId && type && p.typeId !== type.id) throw appError('لا يُغيَّر نوع المستند بعد تسجيله.');
      var direction = cur ? cur.direction : type.direction;
      var internal = direction === 'internal';
      var rec = {
        subject: requireText(p.subject, 'موضوع الخطاب', 200),
        summary: optionalText(p.summary, 4000),
        date: requireDate_(p.date, 'تاريخ الخطاب'),
        refNo: optionalText(p.refNo, 60),
        channel: p.channel ? Correspondence.enum_(p.channel, COR.CHANNEL, 'قناة الخطاب') : internal ? '' : 'mail',
        category: '', party: '', clientId: '', projectId: '', linkedType: '', linkedId: '',
        dueDate: optionalDate_(p.dueDate, 'موعد الرد'),
        confidentiality: p.confidentiality ? Correspondence.enum_(p.confidentiality, COR.CONF, 'درجة السرية')
          : cur ? cur.confidentiality || 'internal' : (type && type.confidentiality) || 'internal',
        readers: p.readers !== undefined ? Correspondence.readers_(p.readers) : cur ? cur.readers || [] : [],
        fields: type ? Correspondence.fieldValues_(type, p.fields, cur && cur.fields) : (cur && cur.fields) || {},
        updatedBy: ctx.user.id, updatedAt: nowIso()
      };
      if (p.category) {
        var cats = Correspondence.activeCategories_();
        if (cats.indexOf(String(p.category)) < 0 && !(cur && cur.category === p.category)) throw appError('التصنيف غير موجود في القائمة.');
        rec.category = String(p.category);
      }
      // الجهة: عميل من وحدة العملاء أو اسم حر
      if (p.clientId) {
        if (!Correspondence.enabled_('crm')) throw appError('وحدة العملاء غير مفعّلة.');
        var client = Db.getOrThrow('crm', 'Clients', String(p.clientId), 'العميل');
        rec.clientId = client.id;
        rec.party = optionalText(p.party, 160) || client.name;
      } else {
        // المستند الداخلي بلا جهة خارجية: الجهة (القسم أو المعنيون) اختيارية
        rec.party = internal ? optionalText(p.party, 160) : requireText(p.party, 'الجهة', 160);
      }
      if (p.projectId) {
        if (!Correspondence.enabled_('crm')) throw appError('وحدة العملاء غير مفعّلة.');
        rec.projectId = Db.getOrThrow('crm', 'Projects', String(p.projectId), 'المشروع').id;
      }
      if (p.linkedType) {
        if (!COR.LINKS[p.linkedType]) throw appError('نوع الربط غير معروف.');
        var lid = String(p.linkedId || '');
        if (p.linkedType === 'employee') Staff.getOrThrow_(lid);
        if (p.linkedType === 'client' || p.linkedType === 'project') {
          if (!Correspondence.enabled_('crm')) throw appError('وحدة العملاء غير مفعّلة.');
          Db.getOrThrow('crm', p.linkedType === 'client' ? 'Clients' : 'Projects', lid, p.linkedType === 'client' ? 'العميل' : 'المشروع');
        }
        if (p.linkedType === 'custody') {
          if (!Correspondence.enabled_('custody')) throw appError('وحدة العهد غير مفعّلة.');
          Db.getOrThrow('custody', 'Custodies', lid, 'العهدة');
        }
        if (p.linkedType === 'task') {
          if (!Correspondence.enabled_('tasks')) throw appError('وحدة المهام غير مفعّلة.');
          Tasks.visible_(ctx, lid);
        }
        rec.linkedType = p.linkedType; rec.linkedId = lid;
      }
      var tags = (Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(/[,،\n]/)).map(function (t) { return optionalText(t, 30); })
        .filter(function (t, i, a) { return t && a.indexOf(t) === i; }).slice(0, COR.MAX_TAGS);
      rec.tags = tags;
      var assignee = String(p.assigneeId || (cur ? cur.assigneeId : '') || ctx.user.id);
      Correspondence.assertAssignee_(assignee);
      rec.assigneeId = assignee;
      // الرد على خطاب: في الاتجاه المقابل، ويُثبَّت عند الإنشاء فقط
      var orig = null;
      if (!cur && p.replyToId) {
        orig = Correspondence.visible_(ctx, String(p.replyToId));
        if (internal || orig.direction === 'internal') throw appError('الرد يكون بين خطاب وارد وآخر صادر.');
        if (orig.direction === direction) throw appError('الرد يكون في الاتجاه المقابل للخطاب الأصلي.');
        rec.replyToId = orig.id;
        if (!rec.clientId && orig.clientId) rec.clientId = orig.clientId;
        if (!rec.projectId && orig.projectId) rec.projectId = orig.projectId;
      }
      var saved, m;
      if (cur) {
        var changes = [];
        if (cur.subject !== rec.subject) changes.push('غيّر الموضوع');
        if (cur.assigneeId !== assignee) changes.push('أحاله إلى ' + Correspondence.userName_({ users: indexBy_(Db.view('core', 'Users')) }, assignee));
        if ((cur.dueDate || '') !== rec.dueDate) changes.push(rec.dueDate ? 'غيّر موعد الرد إلى ' + dmy_(rec.dueDate) : 'أزال موعد الرد');
        if ((cur.date || '') !== rec.date) changes.push('غيّر تاريخ الخطاب إلى ' + dmy_(rec.date));
        if ((cur.confidentiality || 'internal') !== rec.confidentiality) changes.push('غيّر درجة السرية إلى «' + COR.CONF[rec.confidentiality] + '»');
        if (JSON.stringify(cur.readers || []) !== JSON.stringify(rec.readers)) changes.push('عدّل قائمة الاطلاع');
        saved = Db.update('correspondence', 'Letters', cur.id, rec);
        Correspondence.log_(ctx, cur.id, 'update', changes.length ? changes.join(' · ') : 'عدّل بيانات الخطاب');
        Audit.log(ctx.user, 'correspondence', 'letter.update', 'Letter', cur.id, { number: cur.number, subject: rec.subject, changes: changes.join(' · '), assigneeChanged: cur.assigneeId !== assignee });
      } else {
        var status, extra = { receivedAt: '', sentAt: '', archivedAt: '' };
        if (direction === 'in') { status = 'received'; extra.receivedAt = nowIso(); }
        else if (p.status === 'sent' || bool_(p.sent)) { status = 'sent'; extra.sentAt = nowIso(); }
        else status = 'draft';
        saved = Db.insert('correspondence', 'Letters', Object.assign(rec, extra, {
          number: Correspondence.numberFor_(type, rec.date), typeId: type.id, version: 0, mainFileId: '',
          direction: direction, status: status, replyToId: rec.replyToId || '', createdBy: ctx.user.id, createdAt: nowIso()
        }));
        Correspondence.log_(ctx, saved.id, 'create', orig ? 'سجّل الخطاب ' + saved.number + ' رداً على ' + orig.number : 'سجّل الخطاب ' + saved.number);
        if (status === 'sent') Correspondence.log_(ctx, saved.id, 'send', 'أُرسل الخطاب');
        if (orig && orig.status !== 'archived' && orig.status !== 'replied') {
          Db.update('correspondence', 'Letters', orig.id, { status: 'replied', updatedBy: ctx.user.id, updatedAt: nowIso() });
          Correspondence.log_(ctx, orig.id, 'reply', 'تم الرد بالخطاب ' + saved.number);
        }
        Audit.log(ctx.user, 'correspondence', 'letter.create', 'Letter', saved.id, { number: saved.number, subject: saved.subject, direction: direction, assignee: assignee, replyTo: orig ? orig.number : '' });
      }
      m = Correspondence.maps_();
      return Correspondence.view_(Db.get('correspondence', 'Letters', saved.id), m, ctx);
    });
  },

  /** تغيير الحالة: sent للصادر، received للوارد، replied وarchived لأي اتجاه، draft لإعادة صادر لم يُرسل فعلاً (المدير) */
  setStatus: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var l = Correspondence.visible_(ctx, p.id), to = Correspondence.enum_(p.status, COR.STATUS, 'الحالة');
      if (!Correspondence.canEdit_(ctx, l)) throw appError('لا يمكنك تغيير حالة هذا الخطاب.', 'FORBIDDEN');
      if (to === l.status) return Correspondence.view_(l, Correspondence.maps_(), ctx);
      if (to === 'sent' && l.direction === 'in') throw appError('«مُرسل» حالة للصادر والداخلي فقط.');
      if (to === 'received' && l.direction !== 'in') throw appError('«مستلَم» حالة للوارد فقط.');
      if (to === 'replied' && l.direction === 'internal') throw appError('«تم الرد» حالة للوارد والصادر فقط.');
      if (to === 'draft' && (l.direction === 'in' || !Correspondence.isMgr_(ctx))) throw appError('إعادة الخطاب إلى مسودة لمدير المراسلات وللصادر والداخلي فقط.', 'FORBIDDEN');
      if (l.status === 'archived' && !Correspondence.isMgr_(ctx)) throw appError('يعيد الخطاب من الأرشيف مدير المراسلات.', 'FORBIDDEN');
      var note = optionalText(p.note, 500), ch = { status: to, updatedBy: ctx.user.id, updatedAt: nowIso() };
      var kind = to === 'sent' ? 'send' : to === 'received' ? 'receive' : to === 'replied' ? 'reply' : to === 'archived' ? 'archive' : 'restore';
      if (to === 'sent' && !l.sentAt) ch.sentAt = nowIso();
      if (to === 'received' && !l.receivedAt) ch.receivedAt = nowIso();
      if (to === 'archived') ch.archivedAt = nowIso();
      if (l.status === 'archived') { ch.archivedAt = ''; kind = 'restore'; }
      Db.update('correspondence', 'Letters', l.id, ch);
      Correspondence.log_(ctx, l.id, kind, note ? 'نقله إلى «' + COR.STATUS[to] + '»: ' + note : 'نقله إلى «' + COR.STATUS[to] + '»');
      Audit.log(ctx.user, 'correspondence', 'letter.status', 'Letter', l.id, { number: l.number, from: l.status, to: to, note: note });
      return Correspondence.view_(Db.get('correspondence', 'Letters', l.id), Correspondence.maps_(), ctx);
    });
  },

  /** إحالة الخطاب إلى مسؤول عن المتابعة مع ملاحظة */
  forward: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var l = Correspondence.visible_(ctx, p.id);
      if (!Correspondence.canEdit_(ctx, l)) throw appError('لا يمكنك إحالة هذا الخطاب.', 'FORBIDDEN');
      var to = String(p.assigneeId || ''), u = Correspondence.assertAssignee_(to), note = optionalText(p.note, 500);
      if (to === l.assigneeId) throw appError('الخطاب محال إلى ' + u.fullName + ' مسبقاً.');
      Db.update('correspondence', 'Letters', l.id, { assigneeId: to, updatedBy: ctx.user.id, updatedAt: nowIso() });
      Correspondence.log_(ctx, l.id, 'forward', note ? 'أحاله إلى ' + u.fullName + ': ' + note : 'أحاله إلى ' + u.fullName);
      Audit.log(ctx.user, 'correspondence', 'letter.forward', 'Letter', l.id, { number: l.number, to: to, note: note });
      return Correspondence.view_(Db.get('correspondence', 'Letters', l.id), Correspondence.maps_(), ctx);
    });
  },

  /** الحذف النهائي لمدير المراسلات. لا يُحذف خطاب له ردود مرتبطة */
  remove: function (ctx, p) {
    return withLock(function () {
      var l = Correspondence.visible_(ctx, p && p.id);
      if (Correspondence.rows_('Letters').some(function (x) { return x.replyToId === l.id; })) throw appError('لا يُحذف خطاب له ردود مرتبطة. احذف الردود أولاً أو أرشفه.');
      Correspondence.rows_('LetterFiles').filter(function (f) { return f.letterId === l.id; }).forEach(function (f) {
        Files.trash_(f.driveFileId); if (f.previewFileId) Files.trash_(f.previewFileId);
        Db.remove('correspondence', 'LetterFiles', f.id);
      });
      Db.removeWhere('correspondence', 'DocVersions', function (x) { return x.letterId === l.id; });
      Db.removeWhere('correspondence', 'LetterLog', function (x) { return x.letterId === l.id; });
      Db.remove('correspondence', 'Letters', l.id);
      Audit.log(ctx.user, 'correspondence', 'letter.delete', 'Letter', l.id, { number: l.number, subject: l.subject });
      return true;
    });
  },

  // ───────── المرفقات ─────────
  /**
   * رفع ملف. role: 'attachment' (مرفق، الافتراضي) أو 'main' (الملف الرئيسي للمستند):
   * كل رفع للملف الرئيسي إصدار جديد (DocVersions) يحفظ نسخة من البيانات وقته، والإصدارات السابقة تبقى.
   * ملفات Office تُنشأ لها معاينة PDF إن أمكن.
   */
  fileUpload: function (ctx, p) {
    Files.require_();
    p = p || {};
    var l = Correspondence.visible_(ctx, p.letterId);
    if (!Correspondence.canEdit_(ctx, l)) throw appError('لا يمكنك إرفاق ملفات بهذا الخطاب.', 'FORBIDDEN');
    var main = p.role === 'main';
    if (p.role && !main && p.role !== 'attachment') throw appError('نوع الملف غير معروف.');
    var up = Files.decode_(p, Files.DOCS);
    var ver = main ? (l.version || 0) + 1 : l.version || 0;
    var name = l.number + (main ? '_v' + ver : '') + '_' + Files.safeName_(p.fileName || ('مرفق.' + up.ext)); // i18n:line
    var folder = Files.folder_('', ['المراسلات', (l.date || l.createdAt).slice(0, 4)]); // i18n:line
    var f = Files.save_(folder, up, name);
    var preview = up.convert ? Files.preview_(f.id, up.convert, folder, name) : '';
    var row = Db.insert('correspondence', 'LetterFiles', {
      letterId: l.id, fileName: name, driveFileId: f.id, mimeType: up.mime, fileSize: f.size, uploadedBy: ctx.user.id, uploadedAt: nowIso(),
      role: main ? 'main' : 'attachment', version: ver, previewFileId: preview,
      sha256: bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, up.bytes))
    });
    if (main) {
      var note = optionalText(p.note, 300);
      Db.insert('correspondence', 'DocVersions', {
        letterId: l.id, version: ver, fileId: row.id, note: note, byId: ctx.user.id, at: nowIso(),
        snapshot: { subject: l.subject, summary: l.summary || '', date: l.date, party: l.party || '', fields: l.fields || {}, confidentiality: l.confidentiality || 'internal' }
      });
      Db.update('correspondence', 'Letters', l.id, { version: ver, mainFileId: row.id, updatedBy: ctx.user.id, updatedAt: nowIso() });
      Correspondence.log_(ctx, l.id, 'version', 'رفع الإصدار ' + ver + ' من الملف الرئيسي' + (note ? ': ' + note : ''));
    } else {
      Correspondence.log_(ctx, l.id, 'file', 'أرفق ' + name);
    }
    Audit.log(ctx.user, 'correspondence', main ? 'letter.version' : 'letter.file.upload', 'LetterFile', row.id, { letter: l.number, file: name, version: ver, kb: Math.round(f.size / 1024) });
    return { id: row.id, fileName: name, version: ver, hasPreview: !!preview };
  },

  /** محتوى ملف. preview=true: معاينة PDF لملف Office */
  fileContent: function (ctx, p) {
    var f = Db.getOrThrow('correspondence', 'LetterFiles', p && p.id, 'المرفق');
    var l = Correspondence.visible_(ctx, f.letterId);
    if (!Correspondence.canFiles_(ctx, l)) throw appError('ملفات هذا المستند لمن في قائمة الاطلاع فقط.', 'FORBIDDEN');
    if (p.preview) {
      if (!f.previewFileId) throw appError('لا توجد معاينة لهذا الملف. نزّله لفتحه.', 'NOT_FOUND');
      return Files.content_(f.previewFileId, f.fileName.replace(/\.[^.]+$/, '') + '.pdf', 'application/pdf');
    }
    return Files.content_(f.driveFileId, f.fileName, f.mimeType);
  },

  fileRemove: function (ctx, p) {
    var f = Db.getOrThrow('correspondence', 'LetterFiles', p && p.id, 'المرفق'), l = Correspondence.visible_(ctx, f.letterId);
    if (f.role === 'main') throw appError('لا يُحذف إصدار من الملف الرئيسي. ارفع إصداراً جديداً بدلاً منه.');
    if (!Correspondence.canFiles_(ctx, l) || (f.uploadedBy !== ctx.user.id && !Correspondence.isMgr_(ctx))) throw appError('لا يمكنك حذف هذا المرفق.', 'FORBIDDEN');
    Files.trash_(f.driveFileId);
    if (f.previewFileId) Files.trash_(f.previewFileId);
    Db.remove('correspondence', 'LetterFiles', f.id);
    Correspondence.log_(ctx, l.id, 'file', 'حذف المرفق ' + f.fileName);
    Audit.log(ctx.user, 'correspondence', 'letter.file.delete', 'LetterFile', f.id, { letter: l.number, file: f.fileName });
    return true;
  },

  // ───────── التصنيفات (مدير المراسلات) ─────────
  categories: function () {
    Correspondence.seed_();
    return Correspondence.rows_('Categories').slice().sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); })
      .map(function (r) { return { id: r.id, name: r.name, active: !!r.active }; });
  },

  categorySave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var name = requireText(p.name, 'اسم التصنيف', 60), rows = Correspondence.rows_('Categories');
      if (rows.some(function (r) { return r.name === name && r.id !== p.id; })) throw appError('الاسم مستخدم مسبقاً.');
      var rec = { name: name, active: p.active !== false && p.active !== 'false' }, saved;
      if (p.id) {
        var cur = Db.getOrThrow('correspondence', 'Categories', p.id, 'التصنيف');
        saved = Db.update('correspondence', 'Categories', cur.id, rec);
        // إعادة التسمية تُطبَّق على الخطابات المسجلة
        if (cur.name !== name) Db.updateWhere('correspondence', 'Letters', function (l) { return l.category === cur.name ? { category: name } : null; });
      } else {
        rec.sortOrder = rows.reduce(function (mx, r) { return Math.max(mx, r.sortOrder || 0); }, 0) + 1;
        saved = Db.insert('correspondence', 'Categories', rec);
      }
      Audit.log(ctx.user, 'correspondence', 'category.save', 'Category', saved.id, { name: name, active: rec.active });
      return Correspondence.categories();
    });
  },

  categoryMove: function (ctx, p) {
    var rows = Correspondence.rows_('Categories').slice().sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
    var i = rows.map(function (r) { return r.id; }).indexOf(p && p.id), j = i + (p && p.dir === 'up' ? -1 : 1);
    if (i < 0 || j < 0 || j >= rows.length) return Correspondence.categories();
    Db.update('correspondence', 'Categories', rows[i].id, { sortOrder: rows[j].sortOrder || j + 1 });
    Db.update('correspondence', 'Categories', rows[j].id, { sortOrder: rows[i].sortOrder || i + 1 });
    return Correspondence.categories();
  },

  // ───────── أنواع المستندات وحقولها (مدير المراسلات) ─────────
  /** كل الأنواع بحقولها (والموقوف منها) وعدد مستنداتها */
  types: function () {
    var count = {}, types = Correspondence.typesSorted_(), byId = indexBy_(types);
    Correspondence.rows_('Letters').forEach(function (l) { var t = Correspondence.typeOf_(l, { types: byId }); if (t) count[t.id] = (count[t.id] || 0) + 1; });
    return types.map(function (t) {
      return {
        id: t.id, name: t.name, code: t.code, direction: t.direction, directionLabel: COR.DIRECTION[t.direction] || t.direction,
        numberPattern: t.numberPattern || COR.PATTERN, confidentiality: t.confidentiality || 'internal', builtin: !!t.builtin, active: !!t.active,
        documents: count[t.id] || 0,
        fields: Correspondence.fieldsOf_(t.id, true).map(function (f) {
          return { id: f.id, key: f.key, label: f.label, kind: f.kind, kindLabel: COR.FIELD_KINDS[f.kind] || f.kind, options: f.options || [], required: !!f.required, inList: !!f.inList, active: !!f.active };
        })
      };
    });
  },

  /**
   * حفظ نوع مع حقوله: { id?, name, code, direction, numberPattern, confidentiality, active, fields: [...] }.
   * الوارد والصادر المدمجان: لا يتغير رمزهما واتجاههما ولا يُوقفان. الحقل لا يتغير نوعه بعد إنشائه،
   * والحقل المحذوف من القائمة يُوقف وتبقى قيمه في المستندات.
   */
  typeSave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var rows = Correspondence.typesSorted_();
      var cur = p.id ? Db.getOrThrow('correspondence', 'DocTypes', String(p.id), 'نوع المستند') : null;
      var name = requireText(p.name, 'اسم النوع', 60);
      if (rows.some(function (r) { return r.name === name && (!cur || r.id !== cur.id); })) throw appError('اسم النوع مستخدم مسبقاً.');
      var code = cur && cur.builtin ? cur.code : String(p.code || '').trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9]{1,9}$/.test(code)) throw appError('رمز النوع حروف إنجليزية كبيرة وأرقام (2–10)، ويبدأ بحرف.');
      if (rows.some(function (r) { return r.code === code && (!cur || r.id !== cur.id); })) throw appError('رمز النوع مستخدم مسبقاً.');
      var direction = cur && cur.builtin ? cur.direction : Correspondence.enum_(p.direction, COR.DIRECTION, 'اتجاه النوع');
      if (cur && direction !== cur.direction && Correspondence.rows_('Letters').some(function (l) { return l.typeId === cur.id; })) throw appError('لا يُغيَّر اتجاه نوع له مستندات.');
      var pattern = String(p.numberPattern || COR.PATTERN).trim();
      if (!Correspondence.parsePattern_(pattern)) throw appError('نمط الترقيم غير صحيح. مثال: {code}-{year}-{seq:4}، ويجب أن يحتوي {code} وينتهي بـ -{seq}.');
      var rec = {
        name: name, code: code, direction: direction, numberPattern: pattern,
        confidentiality: p.confidentiality ? Correspondence.enum_(p.confidentiality, COR.CONF, 'درجة السرية') : 'internal',
        active: cur && cur.builtin ? true : p.active !== false && p.active !== 'false', updatedAt: nowIso()
      };
      var saved = cur ? Db.update('correspondence', 'DocTypes', cur.id, rec)
        : Db.insert('correspondence', 'DocTypes', Object.assign(rec, { builtin: false, sortOrder: rows.reduce(function (mx, r) { return Math.max(mx, r.sortOrder || 0); }, 0) + 1, createdAt: nowIso() }));
      var fieldNote = Array.isArray(p.fields) ? Correspondence.saveFields_(saved.id, p.fields) : '';
      Audit.log(ctx.user, 'correspondence', cur ? 'type.update' : 'type.create', 'DocType', saved.id, { name: name, code: code, direction: direction, active: rec.active, fields: fieldNote });
      return Correspondence.types();
    });
  },

  saveFields_: function (typeId, list) {
    var existing = Correspondence.fieldsOf_(typeId, true), byId = indexBy_(existing), keep = {}, labels = {};
    if (list.filter(function (x) { return x && x.active !== false; }).length > COR.MAX_FIELDS) throw appError('الحد الأقصى ' + COR.MAX_FIELDS + ' حقلاً لكل نوع.');
    var maxKey = existing.reduce(function (mx, f) { return Math.max(mx, Number(String(f.key).replace(/\D/g, '')) || 0); }, 0);
    list.forEach(function (x, i) {
      x = x || {};
      var cur = x.id ? byId[x.id] : null;
      if (x.id && !cur) throw appError('الحقل غير موجود.', 'NOT_FOUND');
      var label = requireText(x.label, 'اسم الحقل', 60);
      if (labels[label]) throw appError('اسم الحقل «' + label + '» مكرر.');
      labels[label] = true;
      var kind = cur ? cur.kind : Correspondence.enum_(x.kind, COR.FIELD_KINDS, 'نوع الحقل');
      if (cur && x.kind && x.kind !== cur.kind) throw appError('لا يتغيّر نوع الحقل «' + cur.label + '» بعد إنشائه. أوقفه وأضف حقلاً جديداً.');
      var options = [];
      if (kind === 'select') {
        options = (Array.isArray(x.options) ? x.options : String(x.options || '').split(/[,،\n]/)).map(function (o) { return optionalText(o, 60); })
          .filter(function (o, j, a) { return o && a.indexOf(o) === j; }).slice(0, 50);
        if (!options.length) throw appError('أضف خيارات القائمة للحقل «' + label + '».');
      }
      var rec = { label: label, options: options, required: bool_(x.required), inList: bool_(x.inList), sortOrder: i + 1, active: x.active !== false && x.active !== 'false' };
      if (cur) { Db.update('correspondence', 'DocFields', cur.id, rec); keep[cur.id] = true; }
      else Db.insert('correspondence', 'DocFields', Object.assign(rec, { typeId: typeId, key: 'f' + (++maxKey), kind: kind }));
    });
    existing.forEach(function (f) { if (!keep[f.id] && f.active) Db.update('correspondence', 'DocFields', f.id, { active: false }); });
    return list.length + ' حقل';
  },

  typeMove: function (ctx, p) {
    var rows = Correspondence.typesSorted_();
    var i = rows.map(function (r) { return r.id; }).indexOf(p && p.id), j = i + (p && p.dir === 'up' ? -1 : 1);
    if (i < 0 || j < 0 || j >= rows.length) return Correspondence.types();
    Db.update('correspondence', 'DocTypes', rows[i].id, { sortOrder: rows[j].sortOrder || j + 1 });
    Db.update('correspondence', 'DocTypes', rows[j].id, { sortOrder: rows[i].sortOrder || i + 1 });
    return Correspondence.types();
  },

  // ───────── التقرير ─────────
  /** عدد الصادر والوارد شهرياً في سنة، المتأخر عن موعد الرد، وتوزيع التصنيفات والحالات (ضمن ما يراه المستخدم) */
  report: function (ctx, p) {
    p = p || {};
    var year = String(p.year || localDate_().slice(0, 4)), today = localDate_(), m = Correspondence.maps_();
    if (!/^\d{4}$/.test(year)) throw appError('السنة غير صحيحة.');
    var mine = Correspondence.rows_('Letters').filter(function (l) { return Correspondence.canSee_(ctx, l); });
    var inYear = mine.filter(function (l) { return (l.date || '').slice(0, 4) === year; });
    var byMonth = [];
    for (var i = 1; i <= 12; i++) {
      var mo = year + '-' + String(i).padStart(2, '0');
      var rows = inYear.filter(function (l) { return (l.date || '').slice(0, 7) === mo; });
      byMonth.push({ month: mo, in: rows.filter(function (l) { return l.direction === 'in'; }).length, out: rows.filter(function (l) { return l.direction === 'out'; }).length });
    }
    var count = function (list, key) {
      var o = {};
      list.forEach(function (l) { var k = l[key] || ''; o[k] = (o[k] || 0) + 1; });
      return Object.keys(o).map(function (k) { return { key: k, count: o[k] }; }).sort(function (a, b) { return b.count - a.count; });
    };
    var overdue = Correspondence.sort_(mine.filter(function (l) { return COR.OPEN.indexOf(l.status) >= 0 && l.dueDate && l.dueDate < today; }));
    var awaiting = mine.filter(function (l) { return COR.OPEN.indexOf(l.status) >= 0 && l.dueDate && l.dueDate >= today; });
    var replied = inYear.filter(function (l) { return l.direction === 'in' && (l.status === 'replied' || l.status === 'archived'); });
    return {
      year: year, total: inYear.length,
      in: inYear.filter(function (l) { return l.direction === 'in'; }).length, out: inYear.filter(function (l) { return l.direction === 'out'; }).length,
      archived: inYear.filter(function (l) { return l.status === 'archived'; }).length,
      awaiting: awaiting.length, overdueCount: overdue.length,
      byMonth: byMonth,
      byCategory: count(inYear, 'category').map(function (x) { return { category: x.key, count: x.count }; }),
      byStatus: COR.ORDER.map(function (s) { return { status: s, label: COR.STATUS[s], count: inYear.filter(function (l) { return l.status === s; }).length }; }),
      byChannel: count(inYear, 'channel').map(function (x) { return { channel: x.key, label: COR.CHANNEL[x.key] || '', count: x.count }; }),
      repliedIn: replied.length,
      overdue: overdue.slice(0, 50).map(function (l) { return Correspondence.view_(l, m, ctx); })
    };
  },

  /** لوحة المراسلات: المؤشرات، آخر 12 شهراً، التوزيعات، المتأخر والقريب، أحمال المسؤولين، أكثر الجهات (ضمن ما يراه المستخدم) */
  dashboard: function (ctx) {
    var today = localDate_(), month = today.slice(0, 7), m = Correspondence.maps_();
    var mine = Correspondence.rows_('Letters').filter(function (l) { return Correspondence.canSee_(ctx, l); });
    var open = mine.filter(function (l) { return COR.OPEN.indexOf(l.status) >= 0; });
    var isOpen = function (l) { return COR.OPEN.indexOf(l.status) >= 0; };
    var prevMonth = (function () { var y = Number(month.slice(0, 4)), mo = Number(month.slice(5, 7)) - 1; if (mo < 1) { mo = 12; y--; } return y + '-' + String(mo).padStart(2, '0'); })();
    var inMonth = function (l, mo) { return (l.date || '').slice(0, 7) === mo; };
    var byMonth = [];
    for (var i = 11; i >= 0; i--) {
      var y = Number(month.slice(0, 4)), mo = Number(month.slice(5, 7)) - i;
      while (mo < 1) { mo += 12; y--; }
      var key = y + '-' + String(mo).padStart(2, '0');
      byMonth.push({ month: key, in: mine.filter(function (l) { return l.direction === 'in' && inMonth(l, key); }).length, out: mine.filter(function (l) { return l.direction === 'out' && inMonth(l, key); }).length });
    }
    var count = function (list, fn) {
      var o = {};
      list.forEach(function (l) { var k = fn(l) || ''; if (k) o[k] = (o[k] || 0) + 1; });
      return Object.keys(o).map(function (k) { return { key: k, count: o[k] }; }).sort(function (a, b) { return b.count - a.count; });
    };
    // متوسط أيام الرد على الوارد: من الاستلام إلى أول حدث «رد» في سجله
    var replyAt = {};
    Correspondence.rows_('LetterLog').forEach(function (x) { if (x.kind === 'reply' && (!replyAt[x.letterId] || x.at < replyAt[x.letterId])) replyAt[x.letterId] = x.at; });
    var replyDays = [];
    mine.forEach(function (l) {
      if (l.direction !== 'in' || !replyAt[l.id]) return;
      var from = l.receivedAt || l.createdAt;
      if (from) replyDays.push(Math.max(0, (new Date(replyAt[l.id]).getTime() - new Date(from).getTime()) / 86400000));
    });
    var soonEnd = addDays_(today, 7);
    var overdue = Correspondence.sort_(open.filter(function (l) { return l.dueDate && l.dueDate < today; }));
    var dueSoon = Correspondence.sort_(open.filter(function (l) { return l.dueDate && l.dueDate >= today && l.dueDate <= soonEnd; }));
    var recent = mine.slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); }).slice(0, 8);
    var v = function (l) { return Correspondence.view_(l, m, ctx); };
    return {
      today: today, scope: Correspondence.isMgr_(ctx) ? 'all' : 'mine',
      kpis: {
        open: open.length, overdue: overdue.length, dueSoon: dueSoon.length,
        drafts: open.filter(function (l) { return l.status === 'draft'; }).length,
        awaitingReply: open.filter(function (l) { return l.direction === 'in'; }).length,
        awaitingParty: open.filter(function (l) { return l.direction === 'out' && l.status === 'sent'; }).length,
        monthIn: mine.filter(function (l) { return l.direction === 'in' && inMonth(l, month); }).length,
        monthOut: mine.filter(function (l) { return l.direction === 'out' && inMonth(l, month); }).length,
        prevIn: mine.filter(function (l) { return l.direction === 'in' && inMonth(l, prevMonth); }).length,
        prevOut: mine.filter(function (l) { return l.direction === 'out' && inMonth(l, prevMonth); }).length,
        total: mine.length, archived: mine.filter(function (l) { return l.status === 'archived'; }).length,
        noDue: open.filter(function (l) { return !l.dueDate; }).length,
        avgReplyDays: replyDays.length ? Math.round(replyDays.reduce(function (a, b) { return a + b; }, 0) / replyDays.length * 10) / 10 : null,
        repliedCount: replyDays.length
      },
      byMonth: byMonth,
      byStatus: COR.ORDER.map(function (s) { return { status: s, label: COR.STATUS[s], count: mine.filter(function (l) { return l.status === s; }).length }; }),
      byCategory: count(mine, function (l) { return l.category; }).slice(0, 8).map(function (x) { return { category: x.key, count: x.count }; }),
      byChannel: count(mine, function (l) { return l.channel; }).map(function (x) { return { channel: x.key, label: COR.CHANNEL[x.key] || x.key, count: x.count }; }),
      byAssignee: count(open, function (l) { return l.assigneeId; }).map(function (x) {
        return { id: x.key, name: Correspondence.userName_(m, x.key), open: x.count, overdue: open.filter(function (l) { return l.assigneeId === x.key && l.dueDate && l.dueDate < today; }).length };
      }),
      topParties: count(mine, function (l) { var c = l.clientId && m.clients[l.clientId]; return c ? c.name : l.party; }).slice(0, 6).map(function (x) {
        return { party: x.key, count: x.count, open: mine.filter(function (l) { var c = l.clientId && m.clients[l.clientId]; return (c ? c.name : l.party) === x.key && isOpen(l); }).length };
      }),
      overdue: overdue.slice(0, 8).map(v), dueSoon: dueSoon.slice(0, 8).map(v), recent: recent.map(v)
    };
  },

  // ───────── الرئيسية والإشعارات ─────────
  summary_: function (ctx) {
    try { Correspondence.dueCheck_(); } catch (e) { console.error('cor due: ' + e); }
    var u = ctx.user.id, today = localDate_(), mgr = Correspondence.isMgr_(ctx);
    var open = Correspondence.rows_('Letters').filter(function (l) { return COR.OPEN.indexOf(l.status) >= 0 && (mgr || l.assigneeId === u || l.createdBy === u); });
    var m = Correspondence.maps_();
    var due = open.filter(function (l) { return l.dueDate; });
    return [{
      kind: 'cor.home', scope: mgr ? 'all' : 'mine',
      open: open.length,
      overdue: due.filter(function (l) { return l.dueDate < today; }).length,
      dueSoon: due.filter(function (l) { return l.dueDate >= today && l.dueDate <= addDays_(today, COR.DUE_DAYS); }).length,
      drafts: open.filter(function (l) { return l.status === 'draft'; }).length,
      items: Correspondence.sort_(due.slice()).slice(0, 5).map(function (l) { return Correspondence.view_(l, m, ctx); })
    }];
  },

  /** تذكير بموعد الرد: قبل الموعد بيومين وعند التأخر، مرة لكل حالة (refKey) لمن يتابع الخطاب */
  dueCheck_: function () {
    var cache = CacheService.getScriptCache();
    if (cache.get('cor.due')) return;
    cache.put('cor.due', '1', 43200);
    var today = localDate_(), soon = addDays_(today, COR.DUE_DAYS), items = [];
    Correspondence.rows_('Letters').forEach(function (l) {
      if (COR.OPEN.indexOf(l.status) < 0 || !l.dueDate || l.dueDate > soon) return;
      var late = l.dueDate < today;
      [l.assigneeId, l.createdBy].filter(function (id, i, a) { return id && a.indexOf(id) === i; }).forEach(function (uid) {
        items.push({
          userId: uid, kind: 'event', module: 'correspondence', title: late ? 'خطاب تأخر الرد عليه' : 'خطاب يحين موعد الرد عليه قريباً',
          detail: l.number + ' · ' + l.subject + ' · ' + (l.party || '') + ' · ' + dmy_(l.dueDate), link: '/correspondence/' + l.id,
          refKey: 'cor.due:' + l.id + ':' + (late ? 'late' : 'soon') + ':' + l.dueDate
        });
      });
    });
    if (items.length) Notify.push_(null, items);
  },

  /** الإشعارات (Notify): الإحالة والإسناد عند التسجيل */
  notify_: function (ev) {
    var l = Db.get('correspondence', 'Letters', ev.id), d = ev.details || {}, a = ev.actor.fullName, out = [];
    if (!l) return out;
    var link = '/correspondence/' + l.id, detail = l.number + ' · ' + l.subject + (d.note ? ' — ' + d.note : '');
    if (ev.action === 'letter.forward') out.push({ to: l.assigneeId, title: 'أحال إليك ' + a + ' خطاباً', detail: detail, link: link });
    else if (ev.action === 'letter.create' || (ev.action === 'letter.update' && d.assigneeChanged)) {
      out.push({ to: l.assigneeId, title: 'أسند إليك ' + a + ' متابعة خطاب', detail: detail, link: link });
    }
    return out;
  },

  routes_: function () {
    var any = { module: 'correspondence' }, mgr = { module: 'correspondence', roles: ['manager'] };
    return {
      'cor.lookups': { perm: any, fn: Correspondence.lookups },
      'cor.list': { perm: any, fn: Correspondence.list },
      'cor.get': { perm: any, fn: Correspondence.get },
      'cor.save': { perm: any, fn: Correspondence.save },
      'cor.status': { perm: any, fn: Correspondence.setStatus },
      'cor.forward': { perm: any, fn: Correspondence.forward },
      'cor.remove': { perm: mgr, fn: Correspondence.remove },
      'cor.file.upload': { perm: any, fn: Correspondence.fileUpload },
      'cor.file.content': { perm: any, fn: Correspondence.fileContent },
      'cor.file.remove': { perm: any, fn: Correspondence.fileRemove },
      'cor.categories': { perm: any, fn: Correspondence.categories },
      'cor.category.save': { perm: mgr, fn: Correspondence.categorySave },
      'cor.category.move': { perm: mgr, fn: Correspondence.categoryMove },
      'cor.types': { perm: any, fn: Correspondence.types },
      'cor.type.save': { perm: mgr, fn: Correspondence.typeSave },
      'cor.type.move': { perm: mgr, fn: Correspondence.typeMove },
      'cor.report': { perm: any, fn: Correspondence.report },
      'cor.dashboard': { perm: any, fn: Correspondence.dashboard }
    };
  }
};
