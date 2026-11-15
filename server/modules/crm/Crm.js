/**
 * وحدة العملاء (المرحلة 4) — docs/07-crm.md
 *
 * - العميل (شركة/فرد/غير ربحي) وجهات اتصاله ومسؤوله (assignedTo = userId) ومرحلته في مسار المبيعات.
 * - سجل المشاريع الموحد: يُختار منه في المهام وفي مصروفات العهد. لكل مشروع نوع فوترة:
 *   fixed (عقد ثابت: المتبقي = العقد − المحصّل) أو open (اشتراك/مفتوح: لا متبقٍ). needsReview لما يحتاج تصحيحاً بعد النقل.
 * - الدفعات (محصّلة/مجدولة) على المشروع، والحساب المالي يُحسب ولا يُخزن. المبالغ بالفلس.
 * - العروض (قبول العرض يُنشئ مشروعاً)، والأنشطة (موعد المتابعة القادمة يُنشئ مهمة للمسؤول)، والروابط والمستندات.
 * - الصلاحيات: مدير المبيعات يرى ويعدّل الكل ويحذف؛ المحاسب يرى الكل ويسجّل الدفعات؛ المبيعات يرى عملاءه وعملاء فريقه.
 * - تذكير التحصيل: الدفعة المجدولة تُبلَّغ قبل موعدها بثلاثة أيام وعند تأخرها (فحص كل 12 ساعة).
 */
var CRM_SCHEMA = {
  Clients: [
    ['id', 'text'], ['name', 'text'], ['type', 'text'], ['category', 'text'], ['status', 'text'], ['stageId', 'text'], ['lostReason', 'text'],
    ['phone', 'text'], ['phone2', 'text'], ['email', 'text'], ['workplace', 'text'], ['nationality', 'text'], ['country', 'text'], ['city', 'text'],
    ['address', 'text'], ['assignedTo', 'text'], ['notes', 'text'], ['legacyOwner', 'text'], ['createdBy', 'text'], ['createdAt', 'ts'], ['updatedAt', 'ts']
  ],
  Contacts: [
    ['id', 'text'], ['clientId', 'text'], ['name', 'text'], ['jobTitle', 'text'], ['phone', 'text'], ['email', 'text'], ['nationality', 'text'],
    ['active', 'bool'], ['notes', 'text'], ['createdAt', 'ts']
  ],
  Projects: [
    ['id', 'text'], ['name', 'text'], ['clientId', 'text'], ['type', 'text'], ['billing', 'text'], ['contractValue', 'num'], ['startDate', 'date'],
    ['endDate', 'date'], ['status', 'text'], ['parentId', 'text'], ['needsReview', 'bool'], ['reviewNote', 'text'], ['notes', 'text'],
    ['proposalId', 'text'], ['createdBy', 'text'], ['createdAt', 'ts'], ['updatedAt', 'ts']
  ],
  Payments: [
    ['id', 'text'], ['projectId', 'text'], ['amount', 'num'], ['kind', 'text'], ['method', 'text'], ['status', 'text'], ['date', 'date'],
    ['invoiceNo', 'text'], ['recipient', 'text'], ['notes', 'text'], ['attachmentUrl', 'text'], ['createdBy', 'text'], ['createdAt', 'ts'], ['updatedAt', 'ts']
  ],
  Proposals: [
    ['id', 'text'], ['number', 'text'], ['name', 'text'], ['clientId', 'text'], ['projectId', 'text'], ['type', 'text'], ['value', 'num'],
    ['issueDate', 'date'], ['status', 'text'], ['notes', 'text'], ['attachmentUrl', 'text'], ['createdBy', 'text'], ['createdAt', 'ts'], ['decidedAt', 'ts']
  ],
  Activities: [
    ['id', 'text'], ['type', 'text'], ['clientId', 'text'], ['contactId', 'text'], ['projectId', 'text'], ['userId', 'text'], ['title', 'text'],
    ['description', 'text'], ['at', 'ts'], ['durationMin', 'num'], ['location', 'text'], ['notes', 'text'], ['followUpDate', 'date'],
    ['followUpTaskId', 'text'], ['createdBy', 'text'], ['createdAt', 'ts']
  ],
  Stages: [['id', 'text'], ['name', 'text'], ['color', 'text'], ['sortOrder', 'num'], ['kind', 'text']],
  Links: [
    ['id', 'text'], ['ownerType', 'text'], ['ownerId', 'text'], ['title', 'text'], ['url', 'text'], ['driveFileId', 'text'], ['mimeType', 'text'],
    ['category', 'text'], ['createdBy', 'text'], ['createdAt', 'ts']
  ],
  // أهداف المبيعات من النظام السابق: تُحفظ الآن وتُبنى شاشتها مع المالية
  Targets: [['id', 'text'], ['userId', 'text'], ['period', 'text'], ['year', 'num'], ['month', 'num'], ['quarter', 'num'], ['data', 'json'], ['createdAt', 'ts']]
};

var CRM = {
  TYPE: { company: 'شركة', individual: 'فرد', nonprofit: 'جهة غير ربحية' },
  CATEGORY: { current: 'عميل حالي', lead: 'عميل محتمل' },
  STATUS: { active: 'نشط', stopped: 'متوقف', suspended: 'معلّق' },
  P_STATUS: { ongoing: 'جاري', on_hold: 'متوقف مؤقتاً', completed: 'مكتمل', cancelled: 'ملغى' },
  BILLING: { fixed: 'عقد ثابت', open: 'اشتراك أو مفتوح' },
  PAY_KIND: { advance: 'مقدمة', partial: 'جزئية', final: 'نهائية' },
  PAY_METHOD: { transfer: 'تحويل', check: 'شيك', cash: 'نقد', link: 'رابط دفع' },
  PAY_STATUS: { paid: 'محصّلة', scheduled: 'مجدولة' },
  PR_STATUS: { draft: 'مسودة', negotiation: 'قيد التفاوض', accepted: 'مقبول', rejected: 'مرفوض' },
  ACT: { meeting: 'اجتماع', call: 'مكالمة', visit: 'زيارة', follow_up: 'متابعة', whatsapp: 'واتساب', email: 'بريد' },
  STAGES: [
    ['st_new', 'عميل جديد', '#64748b', 'open'], ['st_contact', 'تواصل أولي', '#3b82f6', 'open'], ['st_meeting', 'اجتماع / عرض', '#8b5cf6', 'open'],
    ['st_quote', 'عرض سعر', '#f59e0b', 'open'], ['st_negotiation', 'تفاوض', '#f97316', 'open'], ['st_won', 'إغلاق ناجح', '#16a34a', 'won'], ['st_lost', 'خسارة', '#dc2626', 'lost']
  ],
  DUE_DAYS: 3
};

var Crm = {
  // ───────── أساسيات ─────────
  rows_: function (t) { return Db.view('crm', t); },
  isMgr_: function (ctx) { return Permissions.has(ctx, 'crm', ['manager']); },
  isAcc_: function (ctx) { return Permissions.has(ctx, 'crm', ['manager', 'accountant']); },
  enabled_: function (key) { var m = moduleDef_(key); return !!(m && m.enabled); },

  team_: function (ctx) {
    if (ctx.crmTeam) return ctx.crmTeam;
    var me = Staff.ofCtx_(ctx), ids = me ? Staff.teamIds_(me.id) : [], emps = indexBy_(Staff.all_());
    ctx.crmTeam = ids.map(function (id) { return emps[id] && emps[id].userId; }).filter(Boolean);
    return ctx.crmTeam;
  },

  /** من يرى العميل: المدير والمحاسب الكل، والمبيعات عملاءه (المسؤول/المنشئ) وعملاء فريقه */
  canSee_: function (ctx, c) {
    if (Crm.isAcc_(ctx)) return true;
    var u = ctx.user.id;
    return c.assignedTo === u || c.createdBy === u || (!!c.assignedTo && Crm.team_(ctx).indexOf(c.assignedTo) >= 0);
  },
  canEdit_: function (ctx, c) {
    if (Crm.isMgr_(ctx)) return true;
    var u = ctx.user.id;
    return c.assignedTo === u || c.createdBy === u || (!!c.assignedTo && Crm.team_(ctx).indexOf(c.assignedTo) >= 0);
  },

  client_: function (ctx, id) {
    var c = Db.get('crm', 'Clients', id);
    if (!c || !Crm.canSee_(ctx, c)) throw appError('العميل غير موجود.', 'NOT_FOUND');
    return c;
  },
  editableClient_: function (ctx, id) {
    var c = Crm.client_(ctx, id);
    if (!Crm.canEdit_(ctx, c)) throw appError('لا يمكنك تعديل هذا العميل.', 'FORBIDDEN');
    return c;
  },
  project_: function (ctx, id) {
    var p = Db.get('crm', 'Projects', id);
    if (!p) throw appError('المشروع غير موجود.', 'NOT_FOUND');
    var c = Db.get('crm', 'Clients', p.clientId);
    if (!c || !Crm.canSee_(ctx, c)) throw appError('المشروع غير موجود.', 'NOT_FOUND');
    return p;
  },

  enum_: function (v, dict, label, fallback) {
    if (v === undefined || v === null || v === '') { if (fallback !== undefined) return fallback; throw appError('اختر ' + label + '.'); }
    if (!Object.prototype.hasOwnProperty.call(dict, v)) throw appError(label + ' غير صحيح.');
    return v;
  },
  user_: function (id, label) {
    if (!id) return '';
    var u = Db.get('core', 'Users', id);
    if (!u || !u.active) throw appError(label + ' غير موجود أو حسابه معطّل.');
    return id;
  },
  url_: function (v) {
    var s = optionalText(v, 1000);
    if (s && !/^https?:\/\//i.test(s)) throw appError('الرابط يجب أن يبدأ بـ https://');
    return s;
  },

  seed_: function () {
    if (Crm.rows_('Stages').length) return;
    Db.insertMany('crm', 'Stages', CRM.STAGES.map(function (s, i) { return { id: s[0], name: s[1], color: s[2], sortOrder: i + 1, kind: s[3] }; }));
  },

  maps_: function () {
    var pays = {}, spent = {};
    Crm.rows_('Payments').forEach(function (p) {
      var x = pays[p.projectId] = pays[p.projectId] || { paid: 0, scheduled: 0, overdue: 0, count: 0, nextDue: '' };
      x.count++;
      if (p.status === 'paid') x.paid += p.amount;
      else {
        x.scheduled += p.amount;
        if (p.date && p.date < localDate_()) x.overdue += p.amount;
        if (p.date && (!x.nextDue || p.date < x.nextDue)) x.nextDue = p.date;
      }
    });
    if (Crm.enabled_('custody')) {
      Db.view('custody', 'Expenses').forEach(function (e) {
        if (e.entryType === 'expense' && e.project) spent[e.project] = (spent[e.project] || 0) + e.amount;
      });
    }
    return {
      users: indexBy_(Db.view('core', 'Users')), clients: indexBy_(Crm.rows_('Clients')), projects: indexBy_(Crm.rows_('Projects')),
      stages: indexBy_(Crm.rows_('Stages')), contacts: indexBy_(Crm.rows_('Contacts')), pays: pays, spent: spent
    };
  },
  userName_: function (m, id) { var u = id && m.users[id]; return u ? u.fullName : ''; },

  // ───────── العرض ─────────
  clientView_: function (c, m) {
    var st = m.stages[c.stageId];
    var projects = Crm.rows_('Projects').filter(function (p) { return p.clientId === c.id; });
    var paid = 0, remaining = 0;
    projects.forEach(function (p) { var x = m.pays[p.id] || { paid: 0 }; paid += x.paid; if (p.billing === 'fixed') remaining += Math.max(0, p.contractValue - x.paid); });
    return {
      id: c.id, name: c.name, type: c.type, typeLabel: CRM.TYPE[c.type] || '', category: c.category, categoryLabel: CRM.CATEGORY[c.category] || '',
      status: c.status, statusLabel: CRM.STATUS[c.status] || '', stageId: c.stageId || '', stageName: st ? st.name : '', stageColor: st ? st.color : '',
      lostReason: c.lostReason || '', phone: c.phone || '', phone2: c.phone2 || '', email: c.email || '', workplace: c.workplace || '',
      nationality: c.nationality || '', country: c.country || '', city: c.city || '', address: c.address || '', notes: c.notes || '',
      assignedTo: c.assignedTo || '', assignedName: Crm.userName_(m, c.assignedTo) || c.legacyOwner || '', legacyOwner: c.legacyOwner || '',
      createdAt: c.createdAt, projectsCount: projects.length, activeProjects: projects.filter(function (p) { return p.status === 'ongoing'; }).length,
      paid: paid, remaining: remaining
    };
  },

  projectView_: function (p, m) {
    var c = m.clients[p.clientId], x = m.pays[p.id] || { paid: 0, scheduled: 0, overdue: 0, count: 0, nextDue: '' }, par = p.parentId && m.projects[p.parentId];
    var fixed = p.billing === 'fixed';
    return {
      id: p.id, name: p.name, clientId: p.clientId, clientName: c ? c.name : '', type: p.type || '', billing: p.billing, billingLabel: CRM.BILLING[p.billing] || '',
      contractValue: p.contractValue || 0, startDate: p.startDate || '', endDate: p.endDate || '', status: p.status, statusLabel: CRM.P_STATUS[p.status] || '',
      parentId: p.parentId || '', parentName: par ? par.name : '', needsReview: !!p.needsReview, reviewNote: p.reviewNote || '', notes: p.notes || '',
      paid: x.paid, scheduled: x.scheduled, overdue: x.overdue, nextDue: x.nextDue, paymentsCount: x.count,
      remaining: fixed ? p.contractValue - x.paid : 0, overCollected: fixed && x.paid > p.contractValue,
      percent: fixed && p.contractValue ? Math.round(x.paid * 100 / p.contractValue) : 0, spent: m.spent[p.name] || 0, createdAt: p.createdAt
    };
  },

  payView_: function (x, m) {
    var p = m.projects[x.projectId], c = p && m.clients[p.clientId];
    return {
      id: x.id, projectId: x.projectId, projectName: p ? p.name : '', clientId: p ? p.clientId : '', clientName: c ? c.name : '',
      amount: x.amount, kind: x.kind || '', kindLabel: CRM.PAY_KIND[x.kind] || '', method: x.method || '', methodLabel: CRM.PAY_METHOD[x.method] || '',
      status: x.status, statusLabel: CRM.PAY_STATUS[x.status] || '', date: x.date || '', overdue: x.status === 'scheduled' && !!x.date && x.date < localDate_(),
      invoiceNo: x.invoiceNo || '', recipient: x.recipient || '', notes: x.notes || '', attachmentUrl: x.attachmentUrl || ''
    };
  },

  proposalView_: function (x, m) {
    var c = m.clients[x.clientId], p = x.projectId && m.projects[x.projectId];
    return {
      id: x.id, number: x.number, name: x.name, clientId: x.clientId, clientName: c ? c.name : '', projectId: x.projectId || '', projectName: p ? p.name : '',
      type: x.type || '', value: x.value || 0, issueDate: x.issueDate || '', status: x.status, statusLabel: CRM.PR_STATUS[x.status] || '',
      notes: x.notes || '', attachmentUrl: x.attachmentUrl || '', createdAt: x.createdAt
    };
  },

  activityView_: function (a, m) {
    var c = m.clients[a.clientId], ct = a.contactId && m.contacts[a.contactId], p = a.projectId && m.projects[a.projectId];
    return {
      id: a.id, type: a.type, typeLabel: CRM.ACT[a.type] || a.type, clientId: a.clientId, clientName: c ? c.name : '', contactName: ct ? ct.name : '',
      projectId: a.projectId || '', projectName: p ? p.name : '', userId: a.userId || '', userName: Crm.userName_(m, a.userId), title: a.title || '',
      description: a.description || '', at: a.at || '', durationMin: a.durationMin || 0, location: a.location || '', notes: a.notes || '',
      followUpDate: a.followUpDate || '', followUpTaskId: a.followUpTaskId || ''
    };
  },

  visibleClients_: function (ctx) { return Crm.rows_('Clients').filter(function (c) { return Crm.canSee_(ctx, c); }); },
  visibleClientIds_: function (ctx) { var o = {}; Crm.visibleClients_(ctx).forEach(function (c) { o[c.id] = true; }); return o; },

  // ───────── القراءة ─────────
  lookups: function (ctx) {
    Crm.seed_();
    var team = Crm.team_(ctx), mgr = Crm.isMgr_(ctx), users = Db.view('core', 'Users').filter(function (u) { return u.active; });
    var dict = function (d) { return Object.keys(d).map(function (k) { return { id: k, label: d[k] }; }); };
    var types = {};
    Crm.rows_('Projects').forEach(function (p) { if (p.type) types[p.type] = true; });
    return {
      me: ctx.user.id, isManager: mgr, isAccountant: Crm.isAcc_(ctx), hasTeam: team.length > 0, today: localDate_(), drive: Files.available_(),
      people: users.filter(function (u) { return mgr || u.id === ctx.user.id || team.indexOf(u.id) >= 0; })
        .map(function (u) { return { id: u.id, name: u.fullName }; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); }),
      stages: Crm.rows_('Stages').slice().sort(function (a, b) { return a.sortOrder - b.sortOrder; }).map(function (s) { return { id: s.id, name: s.name, color: s.color, kind: s.kind }; }),
      clientTypes: dict(CRM.TYPE), categories: dict(CRM.CATEGORY), statuses: dict(CRM.STATUS), projectStatuses: dict(CRM.P_STATUS), billing: dict(CRM.BILLING),
      payKinds: dict(CRM.PAY_KIND), payMethods: dict(CRM.PAY_METHOD), proposalStatuses: dict(CRM.PR_STATUS), activityTypes: dict(CRM.ACT),
      projectTypes: Object.keys(types).sort(function (a, b) { return a.localeCompare(b, 'ar'); })
    };
  },

  clients: function (ctx, p) {
    p = p || {};
    var m = Crm.maps_(), q = String(p.q || '').trim().toLowerCase();
    return Crm.visibleClients_(ctx).filter(function (c) {
      if (p.category && c.category !== p.category) return false;
      if (p.status && c.status !== p.status) return false;
      if (p.assignedTo && c.assignedTo !== p.assignedTo) return false;
      if (q && (c.name + ' ' + (c.phone || '') + ' ' + (c.email || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).map(function (c) { return Crm.clientView_(c, m); }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
  },

  client: function (ctx, p) {
    var c = Crm.client_(ctx, p && p.id), m = Crm.maps_();
    var projects = Crm.rows_('Projects').filter(function (x) { return x.clientId === c.id; });
    var pids = projects.map(function (x) { return x.id; });
    var byDateDesc = function (k) { return function (a, b) { return (b[k] || '').localeCompare(a[k] || ''); }; };
    return {
      client: Crm.clientView_(c, m),
      contacts: Crm.rows_('Contacts').filter(function (x) { return x.clientId === c.id; }).map(Crm.contactView_),
      projects: projects.map(function (x) { return Crm.projectView_(x, m); }).sort(byDateDesc('startDate')),
      payments: Crm.rows_('Payments').filter(function (x) { return pids.indexOf(x.projectId) >= 0; }).map(function (x) { return Crm.payView_(x, m); }).sort(byDateDesc('date')),
      proposals: Crm.rows_('Proposals').filter(function (x) { return x.clientId === c.id; }).map(function (x) { return Crm.proposalView_(x, m); }).sort(byDateDesc('issueDate')),
      activities: Crm.rows_('Activities').filter(function (x) { return x.clientId === c.id; }).map(function (x) { return Crm.activityView_(x, m); }).sort(byDateDesc('at')),
      links: Crm.linksOf_(ctx, 'client', c.id, m),
      can: { edit: Crm.canEdit_(ctx, c), pay: Crm.isAcc_(ctx), remove: Crm.isMgr_(ctx) }
    };
  },

  contactView_: function (x) {
    return { id: x.id, clientId: x.clientId, name: x.name, jobTitle: x.jobTitle || '', phone: x.phone || '', email: x.email || '', nationality: x.nationality || '', active: x.active !== false, notes: x.notes || '' };
  },

  linksOf_: function (ctx, type, id, m) {
    return Crm.rows_('Links').filter(function (l) { return l.ownerType === type && l.ownerId === id; }).map(function (l) {
      return { id: l.id, title: l.title, url: l.url || '', hasFile: !!l.driveFileId, mimeType: l.mimeType || '', category: l.category || '', byName: Crm.userName_(m, l.createdBy), createdAt: l.createdAt };
    });
  },

  projects: function (ctx, p) {
    p = p || {};
    var m = Crm.maps_(), vis = Crm.visibleClientIds_(ctx), q = String(p.q || '').trim().toLowerCase();
    return Crm.rows_('Projects').filter(function (x) {
      if (!vis[x.clientId]) return false;
      if (p.status && x.status !== p.status) return false;
      if (p.review && !x.needsReview) return false;
      if (p.clientId && x.clientId !== p.clientId) return false;
      if (q && (x.name + ' ' + ((m.clients[x.clientId] || {}).name || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).map(function (x) { return Crm.projectView_(x, m); }).sort(function (a, b) {
      var o = { ongoing: 0, on_hold: 1, completed: 2, cancelled: 3 };
      return (o[a.status] - o[b.status]) || (b.startDate || '').localeCompare(a.startDate || '');
    });
  },

  project: function (ctx, p) {
    var x = Crm.project_(ctx, p && p.id), m = Crm.maps_(), c = m.clients[x.clientId];
    return {
      project: Crm.projectView_(x, m),
      subprojects: Crm.rows_('Projects').filter(function (s) { return s.parentId === x.id; }).map(function (s) { return Crm.projectView_(s, m); }),
      payments: Crm.rows_('Payments').filter(function (y) { return y.projectId === x.id; }).map(function (y) { return Crm.payView_(y, m); })
        .sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); }),
      activities: Crm.rows_('Activities').filter(function (a) { return a.projectId === x.id; }).map(function (a) { return Crm.activityView_(a, m); }),
      proposals: Crm.rows_('Proposals').filter(function (y) { return y.projectId === x.id; }).map(function (y) { return Crm.proposalView_(y, m); }),
      links: Crm.linksOf_(ctx, 'project', x.id, m),
      can: { edit: Crm.canEdit_(ctx, c), pay: Crm.isAcc_(ctx), remove: Crm.isMgr_(ctx) }
    };
  },

  payments: function (ctx, p) {
    p = p || {};
    var m = Crm.maps_(), vis = Crm.visibleClientIds_(ctx), today = localDate_();
    return Crm.rows_('Payments').filter(function (x) {
      var pr = m.projects[x.projectId];
      if (!pr || !vis[pr.clientId]) return false;
      if (p.status === 'overdue') return x.status === 'scheduled' && x.date && x.date < today;
      if (p.status && x.status !== p.status) return false;
      if (p.from && x.date < p.from) return false;
      if (p.to && x.date > p.to) return false;
      return true;
    }).map(function (x) { return Crm.payView_(x, m); }).sort(function (a, b) {
      return a.status !== b.status ? (a.status === 'scheduled' ? -1 : 1) : a.status === 'scheduled' ? (a.date || '').localeCompare(b.date || '') : (b.date || '').localeCompare(a.date || '');
    });
  },

  proposals: function (ctx, p) {
    p = p || {};
    var m = Crm.maps_(), vis = Crm.visibleClientIds_(ctx);
    return Crm.rows_('Proposals').filter(function (x) { return vis[x.clientId] && (!p.status || x.status === p.status); })
      .map(function (x) { return Crm.proposalView_(x, m); }).sort(function (a, b) { return (b.issueDate || '').localeCompare(a.issueDate || ''); });
  },

  activities: function (ctx, p) {
    p = p || {};
    var m = Crm.maps_(), vis = Crm.visibleClientIds_(ctx);
    return Crm.rows_('Activities').filter(function (a) {
      return vis[a.clientId] && (!p.type || a.type === p.type) && (!p.userId || a.userId === p.userId) && (!p.from || (a.at || '') >= p.from);
    }).map(function (a) { return Crm.activityView_(a, m); }).sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); }).slice(0, 300);
  },

  /** مسار المبيعات: العملاء المحتملون حسب المرحلة */
  pipeline: function (ctx) {
    Crm.seed_();
    var m = Crm.maps_();
    return Crm.visibleClients_(ctx).filter(function (c) { return c.category === 'lead' || (c.stageId && m.stages[c.stageId] && m.stages[c.stageId].kind !== 'open'); })
      .map(function (c) { return Crm.clientView_(c, m); });
  },

  home: function (ctx) {
    var vis = Crm.visibleClientIds_(ctx), m = Crm.maps_(), today = localDate_(), soon = addDays_(today, 14);
    var projects = Crm.rows_('Projects').filter(function (p) { return vis[p.clientId]; });
    var due = Crm.rows_('Payments').filter(function (x) { var pr = m.projects[x.projectId]; return pr && vis[pr.clientId] && x.status === 'scheduled' && x.date && x.date <= soon; })
      .map(function (x) { return Crm.payView_(x, m); }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    var paid = 0, contract = 0;
    projects.forEach(function (p) { var x = m.pays[p.id] || { paid: 0 }; paid += x.paid; if (p.billing === 'fixed' && p.status !== 'cancelled') contract += p.contractValue; });
    var fixedRemaining = projects.filter(function (p) { return p.billing === 'fixed' && p.status !== 'cancelled'; })
      .reduce(function (a, p) { return a + Math.max(0, p.contractValue - ((m.pays[p.id] || {}).paid || 0)); }, 0);
    return {
      clients: Object.keys(vis).length, leads: Crm.visibleClients_(ctx).filter(function (c) { return c.category === 'lead'; }).length,
      ongoing: projects.filter(function (p) { return p.status === 'ongoing'; }).length, review: projects.filter(function (p) { return p.needsReview; }).length,
      collected: paid, contract: contract, remaining: fixedRemaining, due: due, overdue: due.filter(function (d) { return d.overdue; }).length,
      openProposals: Crm.rows_('Proposals').filter(function (x) { return vis[x.clientId] && x.status === 'negotiation'; }).length
    };
  },

  // ───────── الكتابة: العملاء وجهات الاتصال ─────────
  clientSave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      Crm.seed_();
      var cur = p.id ? Crm.editableClient_(ctx, p.id) : null;
      var rec = {
        name: requireText(p.name, 'اسم العميل', 120),
        type: Crm.enum_(p.type, CRM.TYPE, 'نوع العميل', 'company'),
        category: Crm.enum_(p.category, CRM.CATEGORY, 'فئة العميل', 'lead'),
        status: Crm.enum_(p.status, CRM.STATUS, 'الحالة', 'active'),
        phone: optionalText(normalizeDigits(p.phone), 30), phone2: optionalText(normalizeDigits(p.phone2), 30), email: optionalEmail(p.email),
        workplace: optionalText(p.workplace, 120), nationality: optionalText(p.nationality, 40), country: optionalText(p.country, 40),
        city: optionalText(p.city, 60), address: optionalText(p.address, 200), notes: optionalText(p.notes, 2000), updatedAt: nowIso()
      };
      var assignee = p.assignedTo !== undefined ? String(p.assignedTo || '') : (cur ? cur.assignedTo : ctx.user.id);
      if (assignee && assignee !== (cur && cur.assignedTo) && assignee !== ctx.user.id && !Crm.isMgr_(ctx) && Crm.team_(ctx).indexOf(assignee) < 0) {
        throw appError('يمكنك إسناد العملاء لنفسك ولفريقك فقط.', 'FORBIDDEN');
      }
      rec.assignedTo = Crm.user_(assignee, 'المسؤول');
      if (!cur) rec.stageId = rec.category === 'lead' ? 'st_new' : '';
      var saved;
      if (cur) {
        saved = Db.update('crm', 'Clients', cur.id, rec);
        Audit.log(ctx.user, 'crm', 'client.update', 'Client', cur.id, { name: rec.name, assignedChanged: cur.assignedTo !== rec.assignedTo });
      } else {
        saved = Db.insert('crm', 'Clients', Object.assign(rec, { lostReason: '', legacyOwner: '', createdBy: ctx.user.id, createdAt: nowIso() }));
        Audit.log(ctx.user, 'crm', 'client.create', 'Client', saved.id, { name: rec.name });
      }
      return Crm.clientView_(saved, Crm.maps_());
    });
  },

  /** نقل العميل في مسار المبيعات. «إغلاق ناجح» يجعله عميلاً حالياً، و«خسارة» تحتاج سبباً */
  clientStage: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var c = Crm.editableClient_(ctx, p.id), st = Db.get('crm', 'Stages', p.stageId);
      if (!st) throw appError('المرحلة غير موجودة.');
      var ch = { stageId: st.id, updatedAt: nowIso() };
      if (st.kind === 'won') ch.category = 'current';
      if (st.kind === 'lost') ch.lostReason = requireText(p.reason, 'سبب الخسارة', 300);
      if (st.kind !== 'lost') ch.lostReason = '';
      Db.update('crm', 'Clients', c.id, ch);
      Audit.log(ctx.user, 'crm', 'client.stage', 'Client', c.id, { name: c.name, stage: st.name });
      return Crm.clientView_(Db.get('crm', 'Clients', c.id), Crm.maps_());
    });
  },

  clientRemove: function (ctx, p) {
    return withLock(function () {
      var c = Crm.client_(ctx, p && p.id);
      if (Crm.rows_('Projects').some(function (x) { return x.clientId === c.id; })) throw appError('للعميل مشاريع. احذفها أو انقلها أولاً، أو اجعل حالته «متوقف».');
      Crm.rows_('Contacts').filter(function (x) { return x.clientId === c.id; }).forEach(function (x) { Db.remove('crm', 'Contacts', x.id); });
      Crm.rows_('Activities').filter(function (x) { return x.clientId === c.id; }).forEach(function (x) { Db.remove('crm', 'Activities', x.id); });
      Crm.rows_('Proposals').filter(function (x) { return x.clientId === c.id; }).forEach(function (x) { Db.remove('crm', 'Proposals', x.id); });
      Crm.rows_('Links').filter(function (x) { return x.ownerType === 'client' && x.ownerId === c.id; }).forEach(function (x) { Files.trash_(x.driveFileId); Db.remove('crm', 'Links', x.id); });
      Db.remove('crm', 'Clients', c.id);
      Audit.log(ctx.user, 'crm', 'client.delete', 'Client', c.id, { name: c.name });
      return true;
    });
  },

  contactSave: function (ctx, p) {
    p = p || {};
    var cur = p.id ? Db.getOrThrow('crm', 'Contacts', p.id, 'جهة الاتصال') : null;
    var c = Crm.editableClient_(ctx, cur ? cur.clientId : p.clientId);
    var rec = {
      clientId: c.id, name: requireText(p.name, 'اسم جهة الاتصال', 80), jobTitle: optionalText(p.jobTitle, 60), phone: optionalText(normalizeDigits(p.phone), 30),
      email: optionalEmail(p.email), nationality: optionalText(p.nationality, 40), active: p.active === undefined ? true : bool_(p.active), notes: optionalText(p.notes, 500)
    };
    var saved = cur ? Db.update('crm', 'Contacts', cur.id, rec) : Db.insert('crm', 'Contacts', Object.assign(rec, { createdAt: nowIso() }));
    return Crm.contactView_(saved);
  },

  contactRemove: function (ctx, p) {
    var x = Db.getOrThrow('crm', 'Contacts', p && p.id, 'جهة الاتصال');
    Crm.editableClient_(ctx, x.clientId);
    Db.remove('crm', 'Contacts', x.id);
    return true;
  },

  // ───────── المشاريع والدفعات ─────────
  projectSave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var cur = p.id ? Crm.project_(ctx, p.id) : null;
      var c = Crm.editableClient_(ctx, cur ? (p.clientId || cur.clientId) : p.clientId);
      var billing = Crm.enum_(p.billing, CRM.BILLING, 'نوع الفوترة', cur ? cur.billing : 'fixed');
      var rec = {
        name: requireText(p.name, 'اسم المشروع', 160), clientId: c.id, type: optionalText(p.type, 60), billing: billing,
        contractValue: billing === 'fixed' ? parseMoney_(p.contractValue, 'قيمة العقد', { max: 10000000 }) : 0,
        startDate: optionalDate_(p.startDate, 'تاريخ البداية'), endDate: optionalDate_(p.endDate, 'تاريخ النهاية'),
        status: Crm.enum_(p.status, CRM.P_STATUS, 'حالة المشروع', 'ongoing'), notes: optionalText(p.notes, 2000), updatedAt: nowIso()
      };
      if (rec.startDate && rec.endDate && rec.endDate < rec.startDate) throw appError('تاريخ النهاية قبل البداية.');
      if (p.parentId) {
        var par = Crm.project_(ctx, p.parentId);
        if (par.parentId || (cur && par.id === cur.id)) throw appError('المشروع الرئيسي غير صالح.');
        rec.parentId = par.id;
      } else rec.parentId = '';
      if (p.reviewed) { rec.needsReview = false; rec.reviewNote = ''; }
      var saved;
      if (cur) {
        if (Crm.rows_('Projects').some(function (x) { return x.id !== cur.id && x.name === rec.name; })) throw appError('يوجد مشروع آخر بالاسم نفسه.');
        saved = Db.update('crm', 'Projects', cur.id, rec);
        Audit.log(ctx.user, 'crm', 'project.update', 'Project', cur.id, { name: rec.name, billing: billing, contract: kwd_(rec.contractValue) });
      } else {
        if (Crm.rows_('Projects').some(function (x) { return x.name === rec.name; })) throw appError('يوجد مشروع بالاسم نفسه.');
        saved = Db.insert('crm', 'Projects', Object.assign(rec, { needsReview: false, reviewNote: '', proposalId: optionalText(p.proposalId, 40), createdBy: ctx.user.id, createdAt: nowIso() }));
        Audit.log(ctx.user, 'crm', 'project.create', 'Project', saved.id, { name: rec.name, client: c.name });
      }
      return Crm.projectView_(saved, Crm.maps_());
    });
  },

  projectRemove: function (ctx, p) {
    return withLock(function () {
      var x = Crm.project_(ctx, p && p.id);
      if (Crm.rows_('Payments').some(function (y) { return y.projectId === x.id; })) throw appError('على المشروع دفعات. احذفها أولاً أو اجعل حالته «ملغى».');
      if (Crm.rows_('Projects').some(function (y) { return y.parentId === x.id; })) throw appError('للمشروع مشاريع فرعية.');
      Crm.rows_('Links').filter(function (l) { return l.ownerType === 'project' && l.ownerId === x.id; }).forEach(function (l) { Files.trash_(l.driveFileId); Db.remove('crm', 'Links', l.id); });
      Db.remove('crm', 'Projects', x.id);
      Audit.log(ctx.user, 'crm', 'project.delete', 'Project', x.id, { name: x.name });
      return true;
    });
  },

  paymentSave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var cur = p.id ? Db.getOrThrow('crm', 'Payments', p.id, 'الدفعة') : null;
      var pr = Crm.project_(ctx, cur ? cur.projectId : p.projectId);
      var status = Crm.enum_(p.status, CRM.PAY_STATUS, 'حالة الدفعة', 'paid');
      var rec = {
        projectId: pr.id, amount: parseMoney_(p.amount, 'المبلغ', { max: 10000000 }), kind: Crm.enum_(p.kind, CRM.PAY_KIND, 'نوع الدفعة', 'partial'),
        method: Crm.enum_(p.method, CRM.PAY_METHOD, 'طريقة الدفع', 'transfer'), status: status,
        date: status === 'paid' ? (optionalDate_(p.date, 'تاريخ الدفعة') || localDate_()) : requireDate_(p.date, 'موعد الدفعة'),
        invoiceNo: optionalText(p.invoiceNo, 40), recipient: optionalText(p.recipient, 80), notes: optionalText(p.notes, 500),
        attachmentUrl: Crm.url_(p.attachmentUrl), updatedAt: nowIso()
      };
      if (status === 'paid' && rec.date > localDate_()) throw appError('تاريخ التحصيل لا يكون في المستقبل. اجعلها «مجدولة».');
      var saved;
      if (cur) {
        saved = Db.update('crm', 'Payments', cur.id, rec);
        Audit.log(ctx.user, 'crm', cur.status !== status && status === 'paid' ? 'payment.collect' : 'payment.update', 'Payment', cur.id, { project: pr.name, amount: kwd_(rec.amount), status: status });
      } else {
        saved = Db.insert('crm', 'Payments', Object.assign(rec, { createdBy: ctx.user.id, createdAt: nowIso() }));
        Audit.log(ctx.user, 'crm', status === 'paid' ? 'payment.collect' : 'payment.schedule', 'Payment', saved.id, { project: pr.name, amount: kwd_(rec.amount) });
      }
      return Crm.payView_(saved, Crm.maps_());
    });
  },

  paymentRemove: function (ctx, p) {
    var x = Db.getOrThrow('crm', 'Payments', p && p.id, 'الدفعة'), pr = Crm.project_(ctx, x.projectId);
    Db.remove('crm', 'Payments', x.id);
    Audit.log(ctx.user, 'crm', 'payment.delete', 'Payment', x.id, { project: pr.name, amount: kwd_(x.amount), status: x.status, date: x.date });
    return true;
  },

  // ───────── العروض والأنشطة والروابط ─────────
  proposalSave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var cur = p.id ? Db.getOrThrow('crm', 'Proposals', p.id, 'العرض') : null;
      var c = Crm.editableClient_(ctx, cur ? cur.clientId : p.clientId);
      var rec = {
        clientId: c.id, name: requireText(p.name, 'اسم العرض', 160), type: optionalText(p.type, 60), value: parseMoney_(p.value, 'قيمة العرض', { max: 10000000 }),
        issueDate: optionalDate_(p.issueDate, 'تاريخ العرض') || localDate_(), notes: optionalText(p.notes, 2000), attachmentUrl: Crm.url_(p.attachmentUrl),
        projectId: p.projectId ? Crm.project_(ctx, p.projectId).id : (cur ? cur.projectId : '')
      };
      var saved;
      if (cur) saved = Db.update('crm', 'Proposals', cur.id, rec);
      else {
        saved = Db.insert('crm', 'Proposals', Object.assign(rec, {
          number: Db.nextSerial('QT-' + localDate_().slice(0, 4), 3), status: Crm.enum_(p.status, CRM.PR_STATUS, 'الحالة', 'negotiation'),
          createdBy: ctx.user.id, createdAt: nowIso(), decidedAt: ''
        }));
        if (c.category === 'lead') Db.update('crm', 'Clients', c.id, { stageId: 'st_quote' });
      }
      Audit.log(ctx.user, 'crm', cur ? 'proposal.update' : 'proposal.create', 'Proposal', saved.id, { number: saved.number, client: c.name, value: kwd_(rec.value) });
      return Crm.proposalView_(saved, Crm.maps_());
    });
  },

  /** قبول العرض يُنشئ مشروعاً بقيمته (إن لم يكن مرتبطاً) ويجعل العميل حالياً؛ الرفض يحتاج سبباً */
  proposalDecide: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var x = Db.getOrThrow('crm', 'Proposals', p.id, 'العرض'), c = Crm.editableClient_(ctx, x.clientId);
      var status = Crm.enum_(p.status, CRM.PR_STATUS, 'الحالة');
      var ch = { status: status, decidedAt: status === 'accepted' || status === 'rejected' ? nowIso() : '' };
      if (status === 'rejected') ch.notes = ((x.notes ? x.notes + '\n' : '') + 'سبب الرفض: ' + requireText(p.reason, 'سبب الرفض', 300)).slice(0, 2000);
      if (status === 'accepted' && !x.projectId) {
        var name = x.name, n = 2;
        while (Crm.rows_('Projects').some(function (y) { return y.name === name; })) name = x.name + ' (' + (n++) + ')';
        var pr = Db.insert('crm', 'Projects', {
          name: name, clientId: c.id, type: x.type, billing: 'fixed', contractValue: x.value, startDate: localDate_(), endDate: '', status: 'ongoing',
          parentId: '', needsReview: false, reviewNote: '', notes: 'من العرض ' + x.number, proposalId: x.id, createdBy: ctx.user.id, createdAt: nowIso(), updatedAt: nowIso()
        });
        ch.projectId = pr.id;
      }
      if (status === 'accepted') Db.update('crm', 'Clients', c.id, { category: 'current', stageId: 'st_won', updatedAt: nowIso() });
      Db.update('crm', 'Proposals', x.id, ch);
      Audit.log(ctx.user, 'crm', 'proposal.' + status, 'Proposal', x.id, { number: x.number, client: c.name });
      return Crm.proposalView_(Db.get('crm', 'Proposals', x.id), Crm.maps_());
    });
  },

  proposalRemove: function (ctx, p) {
    var x = Db.getOrThrow('crm', 'Proposals', p && p.id, 'العرض');
    Crm.editableClient_(ctx, x.clientId);
    Db.remove('crm', 'Proposals', x.id);
    Audit.log(ctx.user, 'crm', 'proposal.delete', 'Proposal', x.id, { number: x.number });
    return true;
  },

  /** نشاط تواصل. موعد المتابعة القادمة يُنشئ مهمة «متابعة» للمسؤول مرتبطة بالعميل */
  activitySave: function (ctx, p) {
    p = p || {};
    return withLock(function () {
      var cur = p.id ? Db.getOrThrow('crm', 'Activities', p.id, 'النشاط') : null;
      var c = Crm.editableClient_(ctx, cur ? cur.clientId : p.clientId);
      var at = p.at ? new Date(p.at) : new Date();
      if (isNaN(at.getTime())) throw appError('وقت النشاط غير صحيح.');
      var rec = {
        clientId: c.id, type: Crm.enum_(p.type, CRM.ACT, 'نوع النشاط'), title: optionalText(p.title, 160), description: optionalText(p.description, 4000),
        at: at.toISOString(), durationMin: p.durationMin ? intIn_(p.durationMin, 0, 1440, 'المدة') : 0, location: optionalText(p.location, 160),
        notes: optionalText(p.notes, 2000), contactId: '', projectId: '', userId: Crm.user_(p.userId || (cur ? cur.userId : ctx.user.id), 'الموظف'),
        followUpDate: optionalDate_(p.followUpDate, 'موعد المتابعة')
      };
      if (p.contactId) { var ct = Db.getOrThrow('crm', 'Contacts', p.contactId, 'جهة الاتصال'); if (ct.clientId !== c.id) throw appError('جهة الاتصال ليست من هذا العميل.'); rec.contactId = ct.id; }
      if (p.projectId) { var pr = Crm.project_(ctx, p.projectId); if (pr.clientId !== c.id) throw appError('المشروع ليس لهذا العميل.'); rec.projectId = pr.id; }
      var saved = cur ? Db.update('crm', 'Activities', cur.id, rec) : Db.insert('crm', 'Activities', Object.assign(rec, { followUpTaskId: '', createdBy: ctx.user.id, createdAt: nowIso() }));
      if (rec.followUpDate && !saved.followUpTaskId && Crm.enabled_('tasks')) {
        var draft = {
          title: 'متابعة: ' + c.name + (rec.title ? ' — ' + rec.title : ''), assigneeId: rec.userId, dueDate: rec.followUpDate, priority: 'normal',
          linkedType: 'client', linkedId: c.id, projectId: rec.projectId, description: rec.description ? 'من ' + CRM.ACT[rec.type] + ': ' + rec.description.slice(0, 500) : ''
        };
        var task;
        try { task = Tasks.save(ctx, draft); } catch (e) { if (e.code !== 'FORBIDDEN') throw e; draft.assigneeId = ctx.user.id; task = Tasks.save(ctx, draft); }
        Db.update('crm', 'Activities', saved.id, { followUpTaskId: task.id });
        saved.followUpTaskId = task.id;
      }
      if (!cur && c.category === 'lead' && c.stageId === 'st_new') Db.update('crm', 'Clients', c.id, { stageId: 'st_contact' });
      Audit.log(ctx.user, 'crm', cur ? 'activity.update' : 'activity.create', 'Activity', saved.id, { client: c.name, type: rec.type });
      return Crm.activityView_(Db.get('crm', 'Activities', saved.id), Crm.maps_());
    });
  },

  activityRemove: function (ctx, p) {
    var x = Db.getOrThrow('crm', 'Activities', p && p.id, 'النشاط');
    Crm.editableClient_(ctx, x.clientId);
    Db.remove('crm', 'Activities', x.id);
    return true;
  },

  /** رابط أو ملف على عميل أو مشروع */
  linkSave: function (ctx, p) {
    p = p || {};
    var ownerType = p.ownerType === 'project' ? 'project' : 'client';
    var clientId = ownerType === 'project' ? Crm.project_(ctx, p.ownerId).clientId : p.ownerId;
    Crm.editableClient_(ctx, clientId);
    var rec = { ownerType: ownerType, ownerId: p.ownerId, title: requireText(p.title || p.fileName, 'العنوان', 160), category: optionalText(p.category, 40), createdBy: ctx.user.id, createdAt: nowIso() };
    if (p.data) {
      Files.require_();
      var up = Files.decode_(p);
      var f = Files.save_(Files.folder_('', ['العملاء', ownerType === 'project' ? 'المشاريع' : 'العملاء']), up, Files.safeName_(p.fileName || rec.title));
      Object.assign(rec, { url: '', driveFileId: f.id, mimeType: up.mime });
    } else Object.assign(rec, { url: Crm.url_(p.url) || (function () { throw appError('أدخل الرابط.'); })(), driveFileId: '', mimeType: '' });
    var saved = Db.insert('crm', 'Links', rec);
    return { id: saved.id };
  },

  linkContent: function (ctx, p) {
    var l = Db.getOrThrow('crm', 'Links', p && p.id, 'المستند');
    if (l.ownerType === 'project') Crm.project_(ctx, l.ownerId); else Crm.client_(ctx, l.ownerId);
    if (!l.driveFileId) throw appError('هذا رابط وليس ملفاً.');
    return Files.content_(l.driveFileId, l.title, l.mimeType);
  },

  linkRemove: function (ctx, p) {
    var l = Db.getOrThrow('crm', 'Links', p && p.id, 'المستند');
    Crm.editableClient_(ctx, l.ownerType === 'project' ? Crm.project_(ctx, l.ownerId).clientId : l.ownerId);
    Files.trash_(l.driveFileId);
    Db.remove('crm', 'Links', l.id);
    return true;
  },

  // ───────── التقارير ─────────
  report: function (ctx, p) {
    p = p || {};
    var from = p.from || '0000', to = p.to || '9999', m = Crm.maps_(), vis = Crm.visibleClientIds_(ctx);
    var pays = Crm.rows_('Payments').filter(function (x) { var pr = m.projects[x.projectId]; return pr && vis[pr.clientId] && x.status === 'paid' && x.date >= from && x.date <= to; });
    var byClient = {}, byMonth = {};
    pays.forEach(function (x) {
      var pr = m.projects[x.projectId];
      byClient[pr.clientId] = (byClient[pr.clientId] || 0) + x.amount;
      var mo = (x.date || '').slice(0, 7);
      byMonth[mo] = (byMonth[mo] || 0) + x.amount;
    });
    var props = Crm.rows_('Proposals').filter(function (x) { return vis[x.clientId] && (x.issueDate || '') >= from && (x.issueDate || '') <= to; });
    var acts = Crm.rows_('Activities').filter(function (a) { return vis[a.clientId] && (a.at || '').slice(0, 10) >= from && (a.at || '').slice(0, 10) <= to; });
    var byUser = {};
    acts.forEach(function (a) { var k = a.userId || ''; var u = byUser[k] = byUser[k] || { userName: Crm.userName_(m, k) || '—', total: 0, types: {} }; u.total++; u.types[a.type] = (u.types[a.type] || 0) + 1; });
    return {
      collected: pays.reduce(function (a, x) { return a + x.amount; }, 0),
      byClient: Object.keys(byClient).map(function (id) { return { clientId: id, clientName: (m.clients[id] || {}).name || '', amount: byClient[id] }; }).sort(function (a, b) { return b.amount - a.amount; }),
      byMonth: Object.keys(byMonth).sort().map(function (k) { return { month: k, amount: byMonth[k] }; }),
      projects: Crm.rows_('Projects').filter(function (x) { return vis[x.clientId]; }).map(function (x) { return Crm.projectView_(x, m); }),
      proposals: { total: props.length, accepted: props.filter(function (x) { return x.status === 'accepted'; }).length, rejected: props.filter(function (x) { return x.status === 'rejected'; }).length,
        value: props.reduce(function (a, x) { return a + x.value; }, 0), acceptedValue: props.filter(function (x) { return x.status === 'accepted'; }).reduce(function (a, x) { return a + x.value; }, 0) },
      activities: Object.keys(byUser).map(function (k) { return byUser[k]; }).sort(function (a, b) { return b.total - a.total; })
    };
  },

  // ───────── التكامل ─────────
  /** قائمة مشاريع للاختيار في المهام والعهد */
  projectOptions_: function () {
    if (!Crm.enabled_('crm')) return [];
    return Crm.rows_('Projects').filter(function (p) { return p.status === 'ongoing' || p.status === 'on_hold'; })
      .map(function (p) { return { id: p.id, name: p.name }; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
  },

  /** تذكير التحصيل: قبل الموعد بثلاثة أيام وعند التأخر، مرة لكل حالة (refKey) */
  dueCheck_: function () {
    var cache = CacheService.getScriptCache();
    if (cache.get('crm.due')) return;
    cache.put('crm.due', '1', 43200);
    var today = localDate_(), soon = addDays_(today, CRM.DUE_DAYS), m = Crm.maps_(), items = [];
    var staff = Db.view('core', 'UserRoles').filter(function (r) { return r.module === 'crm' && (r.role === 'manager' || r.role === 'accountant'); }).map(function (r) { return r.userId; });
    if (!staff.length) staff = Db.view('core', 'Users').filter(function (u) { return u.active && u.isSuperAdmin; }).map(function (u) { return u.id; });
    Crm.rows_('Payments').forEach(function (x) {
      if (x.status !== 'scheduled' || !x.date || x.date > soon) return;
      var pr = m.projects[x.projectId], c = pr && m.clients[pr.clientId];
      if (!pr) return;
      var late = x.date < today, to = staff.concat(c && c.assignedTo ? [c.assignedTo] : []).filter(function (id, i, a) { return a.indexOf(id) === i; });
      to.forEach(function (uid) {
        items.push({
          userId: uid, kind: 'event', module: 'crm', title: late ? 'دفعة متأخرة التحصيل' : 'دفعة يحين موعدها قريباً',
          detail: pr.name + (c ? ' · ' + c.name : '') + ' · ' + kwd_(x.amount) + ' · ' + dmy_(x.date), link: '/crm/projects/' + pr.id,
          refKey: 'crm.pay:' + x.id + ':' + (late ? 'late' : 'soon') + ':' + x.date
        });
      });
    });
    if (items.length) Notify.push_(null, items);
  },

  summary_: function (ctx) {
    try { Crm.dueCheck_(); } catch (e) { console.error('crm due: ' + e); }
    var h = Crm.home(ctx);
    return [{ kind: 'crm.home', clients: h.clients, leads: h.leads, ongoing: h.ongoing, review: h.review, overdue: h.overdue,
      due: h.due.slice(0, 5), remaining: h.remaining, collected: h.collected, openProposals: h.openProposals }];
  },

  /** الإشعارات: إسناد عميل لموظف */
  notify_: function (ev) {
    if (ev.entity !== 'Client' || !(ev.action === 'client.create' || (ev.action === 'client.update' && ev.details && ev.details.assignedChanged))) return [];
    var c = Db.get('crm', 'Clients', ev.id);
    if (!c || !c.assignedTo) return [];
    return [{ to: c.assignedTo, title: 'أُسند إليك عميل', detail: c.name, link: '/crm/clients/' + c.id }];
  },

  routes_: function () {
    var any = { module: 'crm' }, acc = { module: 'crm', roles: ['manager', 'accountant'] }, mgr = { module: 'crm', roles: ['manager'] };
    return {
      'crm.lookups': { perm: any, fn: Crm.lookups },
      'crm.home': { perm: any, fn: Crm.home },
      'crm.clients': { perm: any, fn: Crm.clients },
      'crm.client': { perm: any, fn: Crm.client },
      'crm.client.save': { perm: any, fn: Crm.clientSave },
      'crm.client.stage': { perm: any, fn: Crm.clientStage },
      'crm.client.remove': { perm: mgr, fn: Crm.clientRemove },
      'crm.contact.save': { perm: any, fn: Crm.contactSave },
      'crm.contact.remove': { perm: any, fn: Crm.contactRemove },
      'crm.pipeline': { perm: any, fn: Crm.pipeline },
      'crm.projects': { perm: any, fn: Crm.projects },
      'crm.project': { perm: any, fn: Crm.project },
      'crm.project.save': { perm: any, fn: Crm.projectSave },
      'crm.project.remove': { perm: mgr, fn: Crm.projectRemove },
      'crm.payments': { perm: any, fn: Crm.payments },
      'crm.payment.save': { perm: acc, fn: Crm.paymentSave },
      'crm.payment.remove': { perm: acc, fn: Crm.paymentRemove },
      'crm.proposals': { perm: any, fn: Crm.proposals },
      'crm.proposal.save': { perm: any, fn: Crm.proposalSave },
      'crm.proposal.decide': { perm: any, fn: Crm.proposalDecide },
      'crm.proposal.remove': { perm: mgr, fn: Crm.proposalRemove },
      'crm.activities': { perm: any, fn: Crm.activities },
      'crm.activity.save': { perm: any, fn: Crm.activitySave },
      'crm.activity.remove': { perm: any, fn: Crm.activityRemove },
      'crm.link.save': { perm: any, fn: Crm.linkSave },
      'crm.link.content': { perm: any, fn: Crm.linkContent },
      'crm.link.remove': { perm: any, fn: Crm.linkRemove },
      'crm.report': { perm: any, fn: Crm.report }
    };
  }
};
