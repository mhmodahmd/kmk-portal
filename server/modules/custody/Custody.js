/**
 * وحدة العهد والنثريات (المرحلة 2): نُقلت من نظام النثريات السابق بنفس دورة العمل.
 *
 * دورة العهدة:
 *   فتح (المحاسب، ويُصدر سند صرف) ← موافقة الإدارة على السند ← جاري الصرف ← تأكيد الاستلام (صاحب العهدة)
 *   ← تسجيل المصروفات ← طلب الإقفال ← اعتماد المحاسب (ترحيل أو سند تسوية) ← توقيع الإدارة على الكشف ← مغلقة نهائياً
 *   رفض الإقفال يعيدها مفتوحة مع السبب.
 *
 * - صاحب العهدة = موظف في الدليل الموحد (employeeId). المنفّذون في السجلات = مستخدمو البوابة (userId).
 * - المبالغ بالفلس (أعداد صحيحة). الرصيد = المبلغ + المرحّل + المقبوضات الإضافية − المصروفات.
 * - لا أحد يفتح عهدة لنفسه أو يعتمد عهدته أو يعالج طلبه.
 * - السندات (صرف وقبض، ومنها سند صرف العهدة): الطلب ← اعتماد المحاسب (رقم السند وتوقيعه) ← اعتماد المدير ← ساري.
 *   الاعتماد لمحاسب الشركة المحدد في الإعدادات (أو أي محاسب إن لم يُحدَّد، أو إن كان هو مقدّم الطلب أو صاحب العهدة).
 *   إصدار محاسب الشركة سنداً بنفسه (أو فتحه عهدة) هو اعتماده، فيبدأ «بانتظار اعتماد المدير»؛ وما يصدره محاسب آخر ينتظر محاسب الشركة.
 * - توقيع الإدارة: رابط سرّي لمرة واحدة يفتحه المدير بلا حساب (#/sign/<token>)، صالح 3 أيام ويُغلق بعد التوقيع،
 *   يرسم فيه توقيعه أو يرفع صورته؛ أو تأكيد التوقيع الورقي.
 * - الملفات على Drive (المرفقات والنسخ الموقّعة) تُفعَّل بعد منح صلاحية Drive للخادم (CUS_DRIVE).
 */
var CUS_SCHEMA = {
  Custodies: [
    ['id', 'text'], ['periodLabel', 'text'], ['employeeId', 'text'], ['amount', 'num'], ['carriedBalance', 'num'],
    ['openDate', 'date'], ['status', 'text'], ['closeRequestDate', 'ts'], ['closeNote', 'text'], ['reviewedBy', 'text'],
    ['reviewDate', 'ts'], ['rejectReason', 'text'], ['totalReceipts', 'num'], ['totalSpent', 'num'], ['remaining', 'num'],
    ['settlementMethod', 'text'], ['settlementVoucherId', 'text'], ['driveFolderId', 'text'], ['notes', 'text'],
    ['previousCustodyId', 'text'], ['isImported', 'bool'], ['createdBy', 'text'], ['createdAt', 'ts'],
    ['disburseStage', 'text'], ['openVoucherId', 'text'], ['carryMode', 'text'], ['receivedAt', 'ts'],
    ['closeSignedFileId', 'text'], ['closeSignedAt', 'ts'], ['closeSignedBy', 'text'], ['closeMgrSignId', 'text'], ['closeSignedNote', 'text'],
    ['closeWfInstanceId', 'text']
  ],
  Expenses: [
    ['id', 'text'], ['custodyId', 'text'], ['entryType', 'text'], ['date', 'date'], ['category', 'text'], ['project', 'text'],
    ['description', 'text'], ['amount', 'num'], ['docType', 'text'], ['noAttachmentReason', 'text'], ['vendor', 'text'],
    ['invoiceNo', 'text'], ['paymentMethod', 'text'], ['attachmentIds', 'json'], ['reviewNote', 'text'],
    ['createdBy', 'text'], ['createdAt', 'ts'], ['updatedAt', 'ts']
  ],
  Attachments: [
    ['id', 'text'], ['custodyId', 'text'], ['expenseId', 'text'], ['fileName', 'text'], ['driveFileId', 'text'], ['url', 'text'],
    ['mimeType', 'text'], ['uploadedBy', 'text'], ['uploadedAt', 'ts'], ['fileSize', 'num']
  ],
  Vouchers: [
    ['id', 'text'], ['type', 'text'], ['number', 'text'], ['date', 'date'], ['custodyId', 'text'], ['partyName', 'text'],
    ['amount', 'num'], ['amountInWords', 'text'], ['reason', 'text'], ['paymentMethod', 'text'], ['chequeNo', 'text'],
    ['pdfFileId', 'text'], ['createdBy', 'text'], ['createdAt', 'ts'], ['status', 'text'], ['cancelReason', 'text'],
    ['cancelledBy', 'text'], ['cancelledAt', 'ts'], ['approvedBy', 'text'], ['approvedAt', 'ts'], ['signedFileId', 'text'],
    ['signedAt', 'ts'], ['signedBy', 'text'], ['signedNote', 'text'], ['requestedBy', 'text'], ['requestedAt', 'ts'],
    ['rejectReason', 'text'], ['rejectedBy', 'text'], ['rejectedAt', 'ts'], ['mgrSignId', 'text'], ['wfInstanceId', 'text']
  ],
  SignLinks: [
    ['id', 'text'], ['kind', 'text'], ['targetId', 'text'], ['tokenHash', 'text'], ['managerName', 'text'], ['createdBy', 'text'],
    ['createdAt', 'ts'], ['expiresAt', 'ts'], ['status', 'text'], ['actedAt', 'ts'], ['signatureFileId', 'text'],
    ['signatureData', 'text'], ['rejectReason', 'text']
  ],
  Signatures: [['id', 'text'], ['userId', 'text'], ['data', 'text'], ['updatedAt', 'ts']],
  Requests: [
    ['id', 'text'], ['employeeId', 'text'], ['amount', 'num'], ['reason', 'text'], ['status', 'text'], ['custodyId', 'text'],
    ['handledBy', 'text'], ['handledAt', 'ts'], ['rejectReason', 'text'], ['createdAt', 'ts'], ['createdBy', 'text'], ['wfInstanceId', 'text']
  ],
  Categories: [['id', 'text'], ['name', 'text'], ['active', 'bool'], ['sortOrder', 'num']],
  DocTypes: [['id', 'text'], ['name', 'text'], ['active', 'bool'], ['sortOrder', 'num']],
  Projects: [['id', 'text'], ['name', 'text'], ['type', 'text'], ['active', 'bool'], ['sortOrder', 'num']]
};

var CUS = {
  STATUS: { open: 'مفتوحة', pending: 'بانتظار الاعتماد', signing: 'معتمدة — بانتظار توقيع الإدارة', closed: 'مغلقة ومعتمدة' },
  ACTIVE: ['open', 'pending', 'signing'],
  STAGES: { awaiting_signature: 'بانتظار موافقة الإدارة على سند الصرف', disbursing: 'جاري الصرف', received: 'تم استلام العهدة' },
  CARRY: { add: 'يُضاف إلى المبلغ', include: 'يُحتسب ضمن المبلغ' },
  ENTRY: { expense: 'مصروف', receipt: 'مقبوض إضافي' },
  V_TYPES: { payment: 'صرف', receipt: 'قبض' },
  V_STATUS: { requested: 'بانتظار اعتماد المحاسب', signing: 'بانتظار اعتماد المدير', active: 'ساري', rejected: 'مرفوض', cancelled: 'ملغي' },
  REQ_STATUS: { pending: 'بانتظار اعتماد المحاسب', accountant: 'بانتظار اعتماد محاسب الشركة', signing: 'بانتظار اعتماد المدير', approved: 'تمت الموافقة', rejected: 'مرفوض', cancelled: 'ملغي', in_chain: 'قيد الإجراء في السلسلة', returned: 'معاد للتعديل' },
  SETTLEMENT: { carry: 'ترحيل', voucher: 'سند' },
  PAY: { cash: 'نقدي', cheque: 'شيك', transfer: 'تحويل' },
  PROJECT_TYPES: { project: 'مشروع', debt: 'مديونية شخصية' },
  SIGN_KINDS: { voucher: 'سند', statement: 'كشف تسوية' },
  SIGN_DAYS: 3,
  MANAGER: 'manager',
  IMPORT: 'import',
  SIGNATURE_MAX: 45000,
  LISTS: { categories: 'Categories', docTypes: 'DocTypes', projects: 'Projects' }
};

var Custody = {
  // ───────── أساسيات ─────────
  settings_: function () {
    return Object.assign({ managerName: '', managerPhone: '', alertPercent: 80, defaultAmount: 100000, companyAccountantId: '' }, Settings.get_('custody', {}));
  },

  /** المحاسبون الذين يمكن تحديد أحدهم «محاسب الشركة» (دور محاسب في العهد، أو مدير النظام)، الحسابات المفعّلة فقط */
  accountants_: function () {
    var users = indexBy_(Db.view('core', 'Users'));
    return Notify.usersWithRole_('custody', ['accountant']).map(function (id) { return users[id]; })
      .filter(function (u) { return u && u.active; })
      .map(function (u) { return { id: u.id, name: u.fullName }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
  },

  /** محاسب الشركة المحدد في الإعدادات ('' إن لم يُحدَّد أو أُوقف حسابه أو لم يعد محاسباً) */
  companyAccountant_: function () {
    var id = Custody.settings_().companyAccountantId;
    if (!id) return '';
    return Custody.accountants_().some(function (a) { return a.id === id; }) ? id : '';
  },

  isStaff_: function (ctx) { return Permissions.has(ctx, 'custody', ['accountant']); },

  me_: function (ctx) { return Staff.ofCtx_(ctx); },

  isOwner_: function (ctx, c) { var me = Custody.me_(ctx); return !!me && me.id === c.employeeId; },

  rows_: function (table) { return Db.view('custody', table); },

  maps_: function () {
    return { users: indexBy_(Db.view('core', 'Users')), emps: indexBy_(Staff.all_()), links: indexBy_(Custody.rows_('SignLinks')) };
  },

  userName_: function (m, id) {
    if (!id) return '';
    if (id === CUS.IMPORT) return 'استيراد';
    if (id === CUS.MANAGER) return 'المدير';
    var u = m.users[id];
    return u ? u.fullName : '';
  },

  empName_: function (m, id) { var e = m.emps[id]; return e ? e.fullName : ''; },

  stage_: function (c) { return c.disburseStage || 'received'; },

  getOrThrow_: function (id) { return Db.getOrThrow('custody', 'Custodies', id, 'العهدة'); },

  /** يعيد العهدة إن كان يحق للمستخدم رؤيتها (نفس الرسالة إن لم توجد حتى لا تُكشف عهد الآخرين) */
  visible_: function (ctx, id) {
    var c = Db.get('custody', 'Custodies', id);
    if (!c || (!Custody.isStaff_(ctx) && !Custody.isOwner_(ctx, c))) throw appError('العهدة غير موجودة.', 'NOT_FOUND');
    return c;
  },

  activeOf_: function (empId) {
    return Custody.rows_('Custodies').filter(function (c) { return c.employeeId === empId && CUS.ACTIVE.indexOf(c.status) >= 0; })[0] || null;
  },

  lastClosedOf_: function (empId) {
    return Custody.rows_('Custodies').filter(function (c) { return c.employeeId === empId && c.status === 'closed'; })
      .sort(function (a, b) { return (b.openDate || '').localeCompare(a.openDate || '') || b.id.localeCompare(a.id); })[0] || null;
  },

  expensesOf_: function (id) {
    return Custody.rows_('Expenses').filter(function (e) { return e.custodyId === id; }).sort(function (a, b) {
      return (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || '');
    });
  },

  /** يعيد حساب مجاميع العهدة من حركاتها */
  recalc_: function (id) {
    var c = Custody.getOrThrow_(id);
    var spent = 0, receipts = 0;
    Custody.rows_('Expenses').forEach(function (e) {
      if (e.custodyId !== id) return;
      if (e.entryType === 'receipt') receipts += e.amount; else spent += e.amount;
    });
    return Db.update('custody', 'Custodies', id, { totalSpent: spent, totalReceipts: receipts, remaining: c.amount + c.carriedBalance + receipts - spent });
  },

  /** يضمن عدم تكرار رقم تسلسلي (إن سبق النقلُ العدّاد) */
  serial_: function (prefix, year, pad, used) {
    var n;
    do { n = Db.nextSerial(prefix + '-' + year, pad); } while (used(n));
    return n;
  },

  // ───────── العرض ─────────
  stageLabel_: function (c) {
    if (c.status === 'open') {
      var st = Custody.stage_(c);
      return st === 'received' ? (c.disburseStage ? 'مفتوحة — تم استلام العهدة' : 'مفتوحة') : CUS.STAGES[st];
    }
    if (c.status === 'pending') return 'بانتظار اعتماد الإقفال';
    if (c.status === 'closed') return c.closeSignedAt ? 'مغلقة نهائياً' : CUS.STATUS.closed;
    return CUS.STATUS[c.status] || c.status;
  },

  view_: function (c, m) {
    var cfg = Custody.settings_();
    var available = c.amount + c.carriedBalance + c.totalReceipts;
    var percent = available > 0 ? Math.round(c.totalSpent * 100 / available) : (c.totalSpent > 0 ? 100 : 0);
    var mgrName = c.closeMgrSignId && m.links[c.closeMgrSignId] ? m.links[c.closeMgrSignId].managerName : '';
    return {
      id: c.id, periodLabel: c.periodLabel, employeeId: c.employeeId, employeeName: Custody.empName_(m, c.employeeId),
      amount: c.amount, carriedBalance: c.carriedBalance, totalReceipts: c.totalReceipts, totalSpent: c.totalSpent,
      remaining: c.remaining, available: available, percent: percent,
      alert: c.status === 'open' && percent >= cfg.alertPercent, overspent: c.remaining < 0, alertPercent: cfg.alertPercent,
      openDate: c.openDate, status: c.status, statusLabel: Custody.stageLabel_(c),
      closeRequestDate: c.closeRequestDate, closeNote: c.closeNote, reviewedByName: Custody.userName_(m, c.reviewedBy),
      reviewDate: c.reviewDate, rejectReason: c.rejectReason, settlementMethod: c.settlementMethod,
      settlementLabel: CUS.SETTLEMENT[c.settlementMethod] || '', settlementVoucherId: c.settlementVoucherId, notes: c.notes,
      previousCustodyId: c.previousCustodyId, isImported: c.isImported,
      stage: Custody.stage_(c), receivedAt: c.receivedAt, openVoucherId: c.openVoucherId, carryMode: c.carryMode || 'add',
      carryModeLabel: c.carriedBalance ? CUS.CARRY[c.carryMode || 'add'] : '',
      targetAmount: c.carryMode === 'include' ? c.amount + c.carriedBalance : c.amount,
      closeSignedAt: c.closeSignedAt, hasCloseSigned: !!(c.closeSignedAt), hasCloseSignedFile: !!c.closeSignedFileId,
      closeSignedByName: c.closeSignedBy === CUS.MANAGER ? mgrName + ' (توقيع إلكتروني)' : Custody.userName_(m, c.closeSignedBy),
      closeSignedNote: c.closeSignedNote
    };
  },

  stages_: function (c, m) {
    var steps = [];
    var add = function (label, state, at, by, note) { steps.push({ label: label, state: state, at: at || '', by: by || '', note: note || '' }); };
    var stage = Custody.stage_(c);
    if (c.disburseStage) {
      var pv = c.openVoucherId ? Db.get('custody', 'Vouchers', c.openVoucherId) : null;
      var req = Custody.rows_('Requests').filter(function (r) { return r.custodyId === c.id; })[0];
      if (req) add('طلب الصرف', 'done', req.createdAt, Custody.empName_(m, req.employeeId));
      add('موافقة المحاسب وإصدار سند الصرف', 'done', pv ? (pv.approvedAt || pv.createdAt) : c.createdAt,
        Custody.userName_(m, pv ? (pv.approvedBy || pv.createdBy) : c.createdBy), pv ? pv.number : '');
      add('موافقة الإدارة (توقيع سند الصرف)', stage === 'awaiting_signature' ? 'current' : 'done', pv && pv.signedAt,
        pv ? (pv.signedBy === CUS.MANAGER ? 'المدير' : Custody.userName_(m, pv.signedBy)) : '');
      add('جاري الصرف', stage === 'disbursing' ? 'current' : (stage === 'received' ? 'done' : 'todo'), pv && pv.signedAt);
      add('تم استلام العهدة', stage === 'received' ? 'done' : 'todo', c.receivedAt, stage === 'received' ? Custody.empName_(m, c.employeeId) : '');
    }
    var after = ['pending', 'signing', 'closed'].indexOf(c.status) >= 0;
    var usable = c.status === 'open' && stage === 'received';
    var reviewed = c.status === 'signing' || c.status === 'closed';
    add('تسجيل المصروفات', after ? 'done' : (usable ? 'current' : 'todo'));
    add('طلب الإقفال', after ? 'done' : 'todo', after ? c.closeRequestDate : '', after ? Custody.empName_(m, c.employeeId) : '');
    add('اعتماد المحاسب للإقفال', c.status === 'pending' ? 'current' : (reviewed ? 'done' : 'todo'),
      reviewed ? c.reviewDate : '', reviewed ? Custody.userName_(m, c.reviewedBy) : '');
    add('توقيع الإدارة على كشف التسوية', c.status === 'signing' ? 'current' : (c.status === 'closed' ? 'done' : 'todo'),
      c.closeSignedAt, c.closeSignedBy === CUS.MANAGER ? 'المدير' : Custody.userName_(m, c.closeSignedBy),
      c.status === 'closed' && !c.closeSignedAt ? 'قبل تفعيل توقيع الكشوف' : '');
    return steps;
  },

  attachmentView_: function (a) {
    return { id: a.id, fileName: a.fileName, mimeType: a.mimeType, isImage: /^image\//.test(a.mimeType), fileSize: a.fileSize, url: a.url, uploadedAt: a.uploadedAt };
  },

  expenseView_: function (e, m, atts) {
    return {
      id: e.id, custodyId: e.custodyId, entryType: e.entryType, entryLabel: CUS.ENTRY[e.entryType] || '', date: e.date,
      category: e.category, project: e.project, description: e.description, amount: e.amount, docType: e.docType,
      noAttachmentReason: e.noAttachmentReason, vendor: e.vendor, invoiceNo: e.invoiceNo, paymentMethod: e.paymentMethod,
      reviewNote: e.reviewNote, isImported: e.createdBy === CUS.IMPORT, createdByName: Custody.userName_(m, e.createdBy),
      createdAt: e.createdAt, updatedAt: e.updatedAt,
      attachments: (e.attachmentIds || []).map(function (id) { return atts[id]; }).filter(Boolean).map(Custody.attachmentView_)
    };
  },

  // ───────── القوائم المرجعية ─────────
  activeNames_: function (table) {
    return Custody.rows_(table).filter(function (r) { return r.active; })
      .sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); }).map(function (r) { return r.name; });
  },

  lookups: function (ctx) {
    Custody.seed_();
    var cfg = Custody.settings_(), ca = Custody.companyAccountant_(), caUser = ca ? Db.get('core', 'Users', ca) : null;
    return {
      categories: Custody.activeNames_('Categories'),
      // قائمة العهد ثم مشاريع العملاء الجارية (سجل المشاريع الموحد) دون تكرار الاسم
      projects: (function () {
        var list = Custody.rows_('Projects').filter(function (r) { return r.active; }).sort(function (a, b) { return a.sortOrder - b.sortOrder; })
          .map(function (r) { return { name: r.name, type: r.type, typeLabel: CUS.PROJECT_TYPES[r.type] || '' }; });
        var seen = {};
        list.forEach(function (r) { seen[r.name] = true; });
        Crm.projectOptions_().forEach(function (p) { if (!seen[p.name]) list.push({ name: p.name, type: 'project', typeLabel: CUS.PROJECT_TYPES.project }); });
        return list;
      })(),
      docTypes: Custody.activeNames_('DocTypes'),
      paymentMethods: Object.keys(CUS.PAY).map(function (k) { return { id: k, label: CUS.PAY[k] }; }),
      alertPercent: cfg.alertPercent, defaultAmount: cfg.defaultAmount, today: localDate_(),
      managerName: cfg.managerName, drive: Files.available_(),
      companyAccountantName: caUser ? caUser.fullName : '', isCompanyAccountant: !!ca && !!ctx && ctx.user.id === ca
    };
  },

  inList_: function (value, list, label, optional) {
    var v = String(value == null ? '' : value).trim();
    if (!v) { if (optional) return ''; throw appError('اختر ' + label + '.'); }
    if (list.indexOf(v) < 0) throw appError(label + ' غير موجود في القائمة.');
    return v;
  },

  enum_: function (value, dict, label) {
    if (!Object.prototype.hasOwnProperty.call(dict, value)) throw appError(label + ' غير صحيح.');
    return value;
  },

  // ───────── العرض: القوائم والتفاصيل ─────────
  list: function (ctx, p) {
    p = p || {};
    var staff = Custody.isStaff_(ctx), me = Custody.me_(ctx);
    var m = Custody.maps_();
    var q = String(p.q || '').trim();
    return Custody.rows_('Custodies').filter(function (c) {
      if (!staff && (!me || c.employeeId !== me.id)) return false;
      if (p.status && c.status !== p.status) return false;
      if (staff && p.employeeId && c.employeeId !== p.employeeId) return false;
      return !q || (c.id + ' ' + c.periodLabel + ' ' + Custody.empName_(m, c.employeeId)).indexOf(q) >= 0;
    }).sort(function (a, b) {
      var sa = CUS.ACTIVE.indexOf(a.status) >= 0 ? 0 : 1, sb = CUS.ACTIVE.indexOf(b.status) >= 0 ? 0 : 1;
      return sa - sb || (b.openDate || '').localeCompare(a.openDate || '') || b.id.localeCompare(a.id);
    }).map(function (c) { return Custody.view_(c, m); });
  },

  get: function (ctx, p) {
    var c = Custody.visible_(ctx, p && p.id);
    var m = Custody.maps_();
    var atts = indexBy_(Custody.rows_('Attachments').filter(function (a) { return a.custodyId === c.id; }));
    var owner = Custody.isOwner_(ctx, c), staff = Custody.isStaff_(ctx), sup = !!ctx.user.isSuperAdmin;
    var received = Custody.stage_(c) === 'received';
    var staffOther = staff && !owner;
    var pv = c.openVoucherId ? Db.get('custody', 'Vouchers', c.openVoucherId) : null;
    var awaitingOpen = !!pv && c.status === 'open' && Custody.stage_(c) === 'awaiting_signature';
    return {
      custody: Custody.view_(c, m),
      openVoucherStatus: pv ? pv.status : '',
      companyAccountantName: Custody.userName_(m, Custody.companyAccountant_()),
      requestReason: (Custody.rows_('Requests').filter(function (r) { return r.custodyId === c.id; })[0] || {}).reason || '',
      stages: Custody.stages_(c, m),
      expenses: Custody.expensesOf_(c.id).map(function (e) { return Custody.expenseView_(e, m, atts); }),
      vouchers: Custody.rows_('Vouchers').filter(function (v) { return v.custodyId === c.id; }).map(function (v) { return Vouchers.view_(v, m); }),
      can: {
        edit: c.status === 'open' && received && (owner || sup),
        requestClose: c.status === 'open' && received && (owner || sup),
        review: c.status === 'pending' && staffOther,
        note: (c.status === 'open' || c.status === 'pending') && staffOther,
        correct: sup,
        confirmReceipt: c.status === 'open' && Custody.stage_(c) === 'disbursing' && owner,
        signOpen: staffOther && awaitingOpen && pv.status === 'signing',
        approveOpen: staff && awaitingOpen && pv.status === 'requested' && !Vouchers.approveBlock_(ctx, pv),
        signStatement: staffOther && c.status === 'signing',
        delete: sup
      },
      chains: {
        statement: c.status === 'signing' || c.closeWfInstanceId ? Custody.chainState_('cus.close', c.id, c.closeWfInstanceId, c.status === 'signing') : null,
        openVoucher: pv ? Custody.chainState_('cus.voucher', pv.id, pv.wfInstanceId, pv.status === 'signing' && !pv.signedAt) : null
      },
      signLinks: {
        statement: Sign.info_('statement', c.id, m),
        openVoucher: c.openVoucherId ? Sign.info_('voucher', c.openVoucherId, m) : null
      }
    };
  },

  /** صاحب العهدة: عهدته النشطة وآخر طلب، والمحاسب: ما ينتظره */
  home: function (ctx) {
    var me = Custody.me_(ctx), m = Custody.maps_(), cfg = Custody.settings_();
    var out = { defaultAmount: cfg.defaultAmount, myCustody: null, myRequest: null, staff: null, isHolder: !!me };
    if (me) {
      var mine = Custody.activeOf_(me.id);
      out.myCustody = mine ? Custody.view_(mine, m) : null;
      var myReq = Custody.rows_('Requests').filter(function (r) { return r.employeeId === me.id; })
        .sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); })[0];
      out.myRequest = myReq ? Requests.view_(myReq, m) : null;
      out.myClosed = Custody.rows_('Custodies').filter(function (c) { return c.employeeId === me.id && c.status === 'closed'; }).length;
    }
    if (Custody.isStaff_(ctx)) {
      var all = Custody.rows_('Custodies'), month = localDate_().slice(0, 7), monthSpent = 0;
      Custody.rows_('Expenses').forEach(function (e) { if (e.entryType === 'expense' && (e.date || '').slice(0, 7) === month) monthSpent += e.amount; });
      var open = all.filter(function (c) { return c.status === 'open'; });
      out.staff = {
        pendingClose: all.filter(function (c) { return c.status === 'pending'; }).map(function (c) { return Custody.view_(c, m); }),
        awaitingOpenSign: open.filter(function (c) { return c.disburseStage === 'awaiting_signature'; }).map(function (c) { return Custody.view_(c, m); }),
        awaitingCloseSign: all.filter(function (c) { return c.status === 'signing'; }).map(function (c) { return Custody.view_(c, m); }),
        pendingRequests: Custody.rows_('Requests').filter(function (r) { return r.status === 'pending'; }).map(function (r) { return Requests.view_(r, m); }),
        voucherRequests: Custody.rows_('Vouchers').filter(function (v) { return v.status === 'requested'; }).map(function (v) { return Vouchers.view_(v, m); }),
        voucherSigning: Custody.rows_('Vouchers').filter(function (v) { return v.status === 'signing' && !Vouchers.isOpening_(v); }).map(function (v) { return Vouchers.view_(v, m); }),
        openCount: open.length,
        openBalance: open.reduce(function (s, c) { return s + c.remaining; }, 0),
        monthSpent: monthSpent
      };
    }
    return out;
  },

  /** لوحة العهد (للمحاسب): العهد المفتوحة وأرصدتها، ما ينتظر إجراءً، الصرف الشهري، التصنيفات والمشاريع، وأصحاب العهد */
  dashboard: function (ctx) {
    if (!Custody.isStaff_(ctx)) throw appError('هذه الشاشة للمحاسب.', 'FORBIDDEN');
    var h = Custody.home(ctx), s = h.staff, m = Custody.maps_(), today = localDate_(), month = today.slice(0, 7), year = today.slice(0, 4);
    var all = Custody.rows_('Custodies'), exps = Custody.rows_('Expenses').filter(function (e) { return e.entryType === 'expense'; });
    var vouchers = Custody.rows_('Vouchers').filter(function (v) { return v.status === 'active'; });
    var prevMonth = (function () { var y = Number(month.slice(0, 4)), mo = Number(month.slice(5, 7)) - 1; if (mo < 1) { mo = 12; y--; } return y + '-' + String(mo).padStart(2, '0'); })();
    var sumIn = function (list, mo) { return list.filter(function (e) { return (e.date || '').slice(0, 7) === mo; }).reduce(function (a, e) { return a + e.amount; }, 0); };
    var spendByMonth = [];
    for (var i = 11; i >= 0; i--) {
      var y = Number(month.slice(0, 4)), mo = Number(month.slice(5, 7)) - i;
      while (mo < 1) { mo += 12; y--; }
      var key = y + '-' + String(mo).padStart(2, '0');
      spendByMonth.push({ month: key, spent: sumIn(exps, key), count: exps.filter(function (e) { return (e.date || '').slice(0, 7) === key; }).length });
    }
    var group = function (list, fn) {
      var o = {};
      list.forEach(function (e) { var k = fn(e) || ''; var x = o[k] = o[k] || { amount: 0, count: 0 }; x.amount += e.amount; x.count++; });
      return Object.keys(o).map(function (k) { return { key: k, amount: o[k].amount, count: o[k].count }; }).sort(function (a, b) { return b.amount - a.amount; });
    };
    var yearExps = exps.filter(function (e) { return (e.date || '').slice(0, 4) === year; });
    var closedYear = all.filter(function (c) { return c.status === 'closed' && (c.reviewDate || '').slice(0, 4) === year; });
    var closeDays = closedYear.filter(function (c) { return c.openDate && c.reviewDate; }).map(function (c) { return daysBetween_(c.openDate, c.reviewDate.slice(0, 10)); });
    var openViews = all.filter(function (c) { return CUS.ACTIVE.indexOf(c.status) >= 0; }).map(function (c) { return Custody.view_(c, m); })
      .sort(function (a, b) { return b.percent - a.percent; });
    var monthVouchers = vouchers.filter(function (v) { return (v.date || '').slice(0, 7) === month; });
    return {
      today: today, month: month, alertPercent: Custody.settings_().alertPercent,
      kpis: {
        openCount: s.openCount, openBalance: s.openBalance, activeCount: openViews.length,
        pendingActions: s.pendingClose.length + s.pendingRequests.length + s.voucherRequests.length + s.awaitingOpenSign.length + s.awaitingCloseSign.length,
        pendingClose: s.pendingClose.length, pendingRequests: s.pendingRequests.length, voucherRequests: s.voucherRequests.length,
        awaitingSign: s.awaitingOpenSign.length + s.awaitingCloseSign.length + s.voucherSigning.length,
        monthSpent: s.monthSpent, prevMonthSpent: sumIn(exps, prevMonth), yearSpent: yearExps.reduce(function (a, e) { return a + e.amount; }, 0),
        monthEntries: exps.filter(function (e) { return (e.date || '').slice(0, 7) === month; }).length,
        noAttachment: yearExps.filter(function (e) { return !(e.attachmentIds || []).length; }).length,
        closedYear: closedYear.length, avgCloseDays: closeDays.length ? Math.round(closeDays.reduce(function (a, b) { return a + b; }, 0) / closeDays.length) : null,
        alerts: openViews.filter(function (v) { return v.alert || v.overspent; }).length,
        monthVouchers: monthVouchers.length, monthVouchersAmount: monthVouchers.reduce(function (a, v) { return a + v.amount; }, 0),
        holders: Staff.current_().length
      },
      spendByMonth: spendByMonth,
      byCategory: group(yearExps, function (e) { return e.category; }).slice(0, 8).map(function (x) { return { category: x.key || 'بلا تصنيف', amount: x.amount, count: x.count }; }),
      byProject: group(yearExps.filter(function (e) { return e.project; }), function (e) { return e.project; }).slice(0, 6).map(function (x) { return { project: x.key, amount: x.amount, count: x.count }; }),
      byMethod: group(yearExps, function (e) { return e.paymentMethod || 'cash'; }).map(function (x) { return { method: x.key, label: CUS.PAY[x.key] || x.key, amount: x.amount, count: x.count }; }),
      custodies: openViews.slice(0, 12),
      pendingClose: s.pendingClose.slice(0, 6), pendingRequests: s.pendingRequests.slice(0, 6), voucherRequests: s.voucherRequests.slice(0, 6)
    };
  },

  // ───────── فتح عهدة ─────────
  carryInfo_: function (empId) {
    var prev = Custody.lastClosedOf_(empId);
    var carried = prev && prev.settlementMethod === 'carry' ? prev.remaining : 0;
    return { carried: carried, fromCustodyId: carried ? prev.id : '', fromLabel: carried ? prev.periodLabel : '' };
  },

  /** الموظفون الذين يمكن فتح عهدة لهم مع حالة عهدتهم ورصيدهم المرحّل */
  holders: function () {
    return Staff.current_().map(function (e) {
      var a = Custody.activeOf_(e.id), carry = Custody.carryInfo_(e.id);
      return {
        id: e.id, fullName: e.fullName, jobTitle: e.jobTitle, hasAccount: !!e.userId,
        activeCustodyId: a ? a.id : '', activeStatusLabel: a ? Custody.stageLabel_(a) : '',
        carried: carry.carried, carryFrom: carry.fromCustodyId, carryFromLabel: carry.fromLabel
      };
    }).sort(function (a, b) { return a.fullName.localeCompare(b.fullName, 'ar'); });
  },

  open: function (ctx, p) {
    p = p || {};
    var emp = Staff.getOrThrow_(p.employeeId);
    if (emp.status === 'terminated') throw appError('انتهت خدمة هذا الموظف.');
    var me = Custody.me_(ctx);
    if (me && me.id === emp.id) throw appError('لا يمكنك فتح عهدة لنفسك، يفتحها لك محاسب آخر.', 'FORBIDDEN');
    var target = parseMoney_(p.amount, 'مبلغ العهدة', { max: 100000 });
    var carryMode = Custody.enum_(p.carryMode || 'add', CUS.CARRY, 'طريقة احتساب الرصيد المرحّل');
    var today = localDate_();
    var openDate = p.openDate ? requireDate_(p.openDate, 'تاريخ الفتح') : today;
    if (openDate > today) throw appError('تاريخ الفتح لا يمكن أن يكون في المستقبل.');
    var method = Custody.enum_(p.paymentMethod || 'cash', CUS.PAY, 'طريقة الدفع');
    var chequeNo = optionalText(p.chequeNo, 40);
    if (method === 'cheque' && !chequeNo) throw appError('رقم الشيك مطلوب عند الدفع بشيك.');
    var notes = optionalText(p.notes, 500);
    var request = null;
    if (p.requestId) {
      request = Db.getOrThrow('custody', 'Requests', p.requestId, 'الطلب');
      if (request.status !== 'pending') throw appError('هذا الطلب تمت معالجته مسبقاً.');
      if (request.employeeId !== emp.id) throw appError('الطلب لا يخص هذا الموظف.');
    }
    var res = withLock(function () {
      var active = Custody.activeOf_(emp.id);
      if (active) {
        throw appError('لدى ' + emp.fullName + ' عهدة ' + Custody.stageLabel_(active) + ' (' + active.id + '). ' +
          (active.status === 'signing' ? 'يجب أن توقّع الإدارة كشف تسويتها أولاً.' : 'يجب إقفالها أولاً.'));
      }
      var prev = Custody.lastClosedOf_(emp.id);
      var carried = prev && prev.settlementMethod === 'carry' ? prev.remaining : 0;
      var mode = carried ? carryMode : 'add';
      var amount = mode === 'include' ? target - carried : target;
      if (amount <= 0) throw appError('الرصيد المرحّل (' + kwd_(carried) + ') يغطي مبلغ العهدة أو يزيد عنه. اختر «يُضاف إلى المبلغ» أو ارفع المبلغ.');
      var y = Number(openDate.slice(0, 4)), mo = Number(openDate.slice(5, 7));
      var label = 'نثرية ' + mo + '-' + y;
      var same = Custody.rows_('Custodies').filter(function (c) { return c.employeeId === emp.id && c.periodLabel.indexOf(label) === 0; }).length;
      if (same) label += ' (' + (same + 1) + ')';
      var ids = indexBy_(Custody.rows_('Custodies'));
      var id = Custody.serial_('NTH', y, 3, function (n) { return !!ids[n]; });
      var now = nowIso();
      var c = Db.insert('custody', 'Custodies', {
        id: id, periodLabel: label, employeeId: emp.id, amount: amount, carriedBalance: carried, openDate: openDate, status: 'open',
        totalReceipts: 0, totalSpent: 0, remaining: amount + carried, notes: notes, previousCustodyId: prev ? prev.id : '',
        isImported: false, createdBy: ctx.user.id, createdAt: now, disburseStage: 'awaiting_signature', carryMode: mode
      });
      // i18n:off — بيان السند يُخزَّن ويُطبع بالعربية
      var reason = 'صرف عهدة نثرية رقم ' + c.id + ' (' + label + ')' +
        (mode === 'include' ? ' — تكملة لمبلغ ' + kwd_(target) + ' بعد احتساب رصيد مرحّل ' + kwd_(carried) : '') +
        (request && request.reason ? ' — سبب الطلب: ' + request.reason : '');
      // i18n:on
      var pv = Vouchers.create_(ctx, {
        type: 'payment', date: openDate, custodyId: c.id, partyName: emp.fullName, amount: amount, reason: reason,
        paymentMethod: method, chequeNo: chequeNo, requestedBy: request ? request.createdBy : '', requestedAt: request ? request.createdAt : '', deferChain: true
      });
      c = Db.update('custody', 'Custodies', c.id, { openVoucherId: pv.id });
      // سلسلة سند الصرف بعد ربطه بالعهدة (شرط «صرف عهدة»)
      if (pv.status === 'signing') Vouchers.startChain_(ctx, pv);
      if (request) Db.update('custody', 'Requests', request.id, { status: 'approved', custodyId: c.id, handledBy: ctx.user.id, handledAt: now });
      return c;
    });
    Audit.log(ctx.user, 'custody', 'custody.open', 'Custody', res.id, { employee: emp.fullName, amount: kwd_(res.amount), carried: kwd_(res.carriedBalance) });
    return Custody.view_(res, Custody.maps_());
  },

  confirmReceipt: function (ctx, p) {
    var c = Custody.visible_(ctx, p && p.id);
    if (!Custody.isOwner_(ctx, c)) throw appError('تأكيد الاستلام لصاحب العهدة فقط.', 'FORBIDDEN');
    if (c.status !== 'open') throw appError('العهدة ليست مفتوحة.');
    var st = Custody.stage_(c);
    if (st === 'awaiting_signature') throw appError('سند الصرف لم توقّعه الإدارة بعد، لا يمكن تأكيد الاستلام.');
    if (st === 'received') throw appError('تم تأكيد الاستلام مسبقاً.');
    var u = Db.update('custody', 'Custodies', c.id, { disburseStage: 'received', receivedAt: nowIso() });
    Audit.log(ctx.user, 'custody', 'custody.receive', 'Custody', c.id, { amount: kwd_(c.amount) });
    return Custody.view_(u, Custody.maps_());
  },

  // ───────── الحركات ─────────
  assertEditable_: function (ctx, c) {
    if (!Custody.isOwner_(ctx, c) && !ctx.user.isSuperAdmin) throw appError('ليست لديك صلاحية لتعديل هذه العهدة.', 'FORBIDDEN');
    if (c.status === 'pending') throw appError('العهدة بانتظار الاعتماد ومقفلة للتعديل.');
    if (c.status !== 'open') throw appError('العهدة مغلقة ولا يمكن تعديلها.');
    var st = Custody.stage_(c);
    if (st === 'awaiting_signature') throw appError('العهدة بانتظار موافقة الإدارة على سند الصرف، لا يمكن تسجيل مصروفات قبل الاستلام.', 'NOT_RECEIVED');
    if (st === 'disbursing') throw appError('العهدة قيد الصرف، أكّد استلامها أولاً ثم سجّل المصروفات.', 'NOT_RECEIVED');
  },

  expenseInput_: function (p) {
    Custody.seed_();
    var type = Custody.enum_(p.entryType || 'expense', CUS.ENTRY, 'نوع الحركة');
    var date = requireDate_(p.date, 'التاريخ');
    if (date > localDate_()) throw appError('التاريخ لا يمكن أن يكون في المستقبل.');
    var isExp = type === 'expense';
    return {
      entryType: type, date: date, amount: parseMoney_(p.amount, 'المبلغ', { max: 100000 }),
      description: requireText(p.description, 'البيان', 300),
      category: isExp ? Custody.inList_(p.category, Custody.activeNames_('Categories'), 'التصنيف') : '',
      project: Custody.inList_(p.project, Custody.activeNames_('Projects'), 'المشروع', true),
      docType: Custody.inList_(p.docType, Custody.activeNames_('DocTypes'), 'نوع المستند', true),
      noAttachmentReason: optionalText(p.noAttachmentReason, 200),
      vendor: optionalText(p.vendor, 100), invoiceNo: optionalText(p.invoiceNo, 40),
      paymentMethod: Custody.enum_(p.paymentMethod || 'cash', CUS.PAY, 'طريقة الدفع')
    };
  },

  expenseSave: function (ctx, p) {
    return withLock(function () { return Custody.expenseSave_(ctx, p || {}); });
  },

  expenseSave_: function (ctx, p) {
    var cur = p.id ? Db.getOrThrow('custody', 'Expenses', p.id, 'البند') : null;
    var c = Custody.visible_(ctx, cur ? cur.custodyId : p.custodyId);
    Custody.assertEditable_(ctx, c);
    var data = Custody.expenseInput_(p);
    var now = nowIso(), e;
    if (cur) {
      data.updatedAt = now;
      e = Db.update('custody', 'Expenses', cur.id, data);
    } else {
      e = Db.insert('custody', 'Expenses', Object.assign(data, { custodyId: c.id, attachmentIds: [], reviewNote: '', createdBy: ctx.user.id, createdAt: now, updatedAt: now }));
    }
    var u = Custody.recalc_(c.id);
    Audit.log(ctx.user, 'custody', cur ? 'expense.update' : 'expense.add', 'Expense', e.id, { custody: c.id, description: e.description, amount: kwd_(e.amount) });
    // expenseId: لترفع النافذة المرفقات المختارة بعد الحفظ مباشرة
    return { custody: Custody.view_(u, Custody.maps_()), expenseId: e.id };
  },

  expenseDelete: function (ctx, p) {
    return withLock(function () { return Custody.expenseDelete_(ctx, p || {}); });
  },

  expenseDelete_: function (ctx, p) {
    var e = Db.getOrThrow('custody', 'Expenses', p.id, 'البند');
    var c = Custody.visible_(ctx, e.custodyId);
    Custody.assertEditable_(ctx, c);
    Custody.rows_('Attachments').filter(function (a) { return a.expenseId === e.id; }).forEach(function (a) { Files.trash_(a.driveFileId); Db.remove('custody', 'Attachments', a.id); });
    Db.remove('custody', 'Expenses', e.id);
    var u = Custody.recalc_(c.id);
    Audit.log(ctx.user, 'custody', 'expense.delete', 'Expense', e.id, { custody: c.id, description: e.description, amount: kwd_(e.amount), reason: optionalText(p.reason, 300) });
    return { custody: Custody.view_(u, Custody.maps_()) };
  },

  /** ملاحظة المحاسب على بند (أثناء الفتح أو المراجعة). نص فارغ يمسحها */
  expenseNote: function (ctx, p) {
    var e = Db.getOrThrow('custody', 'Expenses', p && p.id, 'البند');
    var c = Custody.getOrThrow_(e.custodyId);
    if (c.status === 'closed' || c.status === 'signing') throw appError('العهدة معتمدة أو مغلقة، لا يمكن إضافة ملاحظات.');
    if (Custody.isOwner_(ctx, c)) throw appError('لا يمكنك وضع ملاحظات مراجعة على عهدتك.', 'FORBIDDEN');
    var note = optionalText(p.note, 300);
    Db.update('custody', 'Expenses', e.id, { reviewNote: note });
    Audit.log(ctx.user, 'custody', 'expense.note', 'Expense', e.id, { note: note });
    return { id: e.id, reviewNote: note };
  },

  /** تصحيح البيانات الوصفية لبند (مدير النظام) حتى في العهد المغلقة، دون المبلغ أو التاريخ */
  expenseCorrect: function (ctx, p) {
    var e = Db.getOrThrow('custody', 'Expenses', p && p.id, 'البند');
    var patch = {
      description: requireText(p.description, 'البيان', 300),
      category: e.entryType === 'expense' ? Custody.inList_(p.category, Custody.activeNames_('Categories'), 'التصنيف') : '',
      project: Custody.inList_(p.project, Custody.rows_('Projects').map(function (r) { return r.name; }), 'المشروع', true),
      docType: Custody.inList_(p.docType, Custody.activeNames_('DocTypes'), 'نوع المستند', true),
      vendor: optionalText(p.vendor, 100), invoiceNo: optionalText(p.invoiceNo, 40), reviewNote: optionalText(p.reviewNote, 300),
      updatedAt: nowIso()
    };
    var changes = {};
    ['description', 'category', 'project', 'docType', 'vendor', 'invoiceNo', 'reviewNote'].forEach(function (k) {
      if (String(e[k] || '') !== String(patch[k] || '')) changes[k] = [e[k] || '', patch[k] || ''];
    });
    Db.update('custody', 'Expenses', e.id, patch);
    Audit.log(ctx.user, 'custody', 'expense.correct', 'Expense', e.id, changes);
    return { id: e.id };
  },

  // ───────── الإقفال ─────────
  hasSupport_: function (e) {
    return (e.attachmentIds && e.attachmentIds.length > 0) || !!e.noAttachmentReason || e.createdBy === CUS.IMPORT;
  },

  requestClose: function (ctx, p) {
    var c = Custody.visible_(ctx, p && p.id);
    if (!Custody.isOwner_(ctx, c) && !ctx.user.isSuperAdmin) throw appError('طلب الإقفال لصاحب العهدة فقط.', 'FORBIDDEN');
    if (c.status !== 'open') throw appError(c.status === 'pending' ? 'طلب الإقفال مُرسل مسبقاً.' : 'العهدة مغلقة.');
    if (Custody.stage_(c) !== 'received') throw appError('لم يتم تأكيد استلام العهدة بعد.', 'NOT_RECEIVED');
    c = Custody.recalc_(c.id);
    var exps = Custody.expensesOf_(c.id);
    if (!exps.some(function (e) { return e.entryType === 'expense'; })) throw appError('لا توجد مصروفات مسجلة في العهدة.');
    var missing = exps.filter(function (e) { return e.entryType === 'expense' && !Custody.hasSupport_(e); });
    if (missing.length) {
      throw appError('بنود بلا مرفق أو سبب لعدم وجوده (' + missing.length + '): ' +
        missing.slice(0, 5).map(function (e) { return e.description + ' (' + kwd_(e.amount, true) + ')'; }).join('، ') +
        (missing.length > 5 ? '…' : ''), 'MISSING_ATTACHMENTS');
    }
    if (c.remaining < 0 && p.acknowledgeOverspend !== true) {
      throw appError('المصروفات تتجاوز المبلغ المتاح بـ ' + kwd_(-c.remaining) + '، أكّد ذلك قبل الإرسال.', 'OVERSPEND_CONFIRM');
    }
    var u = Db.update('custody', 'Custodies', c.id, { status: 'pending', closeRequestDate: nowIso(), closeNote: optionalText(p.closeNote, 500), rejectReason: '' });
    Audit.log(ctx.user, 'custody', 'custody.requestClose', 'Custody', c.id, { remaining: kwd_(c.remaining) });
    return Custody.view_(u, Custody.maps_());
  },

  assertReviewable_: function (ctx, c) {
    if (c.status !== 'pending') throw appError('العهدة ليست بانتظار الاعتماد.');
    if (Custody.isOwner_(ctx, c)) throw appError('لا يمكنك مراجعة عهدتك بنفسك.', 'FORBIDDEN');
  },

  reject: function (ctx, p) {
    var c = Custody.getOrThrow_(p && p.id);
    Custody.assertReviewable_(ctx, c);
    var reason = requireText(p.reason, 'سبب الرفض', 500);
    var u = Db.update('custody', 'Custodies', c.id, { status: 'open', rejectReason: reason, reviewedBy: ctx.user.id, reviewDate: nowIso() });
    Audit.log(ctx.user, 'custody', 'custody.reject', 'Custody', c.id, { reason: reason });
    return Custody.view_(u, Custody.maps_());
  },

  /** اعتماد الإقفال: ترحيل الرصيد للعهدة التالية، أو سند قبض بالمتبقي أو صرف بالتجاوز */
  approve: function (ctx, p) {
    p = p || {};
    var method = Custody.enum_(p.settlementMethod, CUS.SETTLEMENT, 'طريقة التسوية');
    var pay = Custody.enum_(p.paymentMethod || 'cash', CUS.PAY, 'طريقة الدفع');
    var chequeNo = optionalText(p.chequeNo, 40);
    if (method === 'voucher' && pay === 'cheque' && !chequeNo) throw appError('رقم الشيك مطلوب عند الدفع بشيك.');
    var res = withLock(function () {
      var c = Custody.getOrThrow_(p.id);
      Custody.assertReviewable_(ctx, c);
      c = Custody.recalc_(c.id);
      var voucher = null;
      if (method === 'voucher' && c.remaining !== 0) {
        var emp = Staff.get_(c.employeeId);
        voucher = Vouchers.create_(ctx, {
          type: c.remaining > 0 ? 'receipt' : 'payment', date: localDate_(), custodyId: c.id, partyName: emp ? emp.fullName : '',
          amount: Math.abs(c.remaining),
          reason: (c.remaining > 0 ? 'رد الرصيد المتبقي من العهدة رقم ' : 'تعويض تجاوز مبلغ العهدة رقم ') + c.id + ' (' + c.periodLabel + ')', // i18n:line
          paymentMethod: pay, chequeNo: pay === 'cheque' ? chequeNo : ''
        });
      }
      var u = Db.update('custody', 'Custodies', c.id, {
        status: 'signing', settlementMethod: method, settlementVoucherId: voucher ? voucher.id : '',
        reviewedBy: ctx.user.id, reviewDate: nowIso(), rejectReason: ''
      });
      var wf = Workflow.startIfBound_(ctx, 'cus.close', c.id, function () {});
      if (wf) u = Db.update('custody', 'Custodies', c.id, { closeWfInstanceId: wf.id });
      return { custody: Db.get('custody', 'Custodies', c.id) || u, voucher: voucher };
    });
    Audit.log(ctx.user, 'custody', 'custody.approve', 'Custody', res.custody.id, { settlement: CUS.SETTLEMENT[method], remaining: kwd_(res.custody.remaining), voucher: res.voucher ? res.voucher.number : '' });
    var m = Custody.maps_();
    return { custody: Custody.view_(res.custody, m), voucher: res.voucher ? Vouchers.view_(res.voucher, m) : null };
  },

  /**
   * تأكيد توقيع الإدارة الورقي (المحاسب، وليس على عهدته):
   * kind=voucher سند ساري (سند صرف العهدة ينقلها إلى «جاري الصرف») · kind=statement كشف تسوية فتُغلق نهائياً.
   */
  markSigned: function (ctx, p) {
    p = p || {};
    var kind = Custody.enum_(p.kind, CUS.SIGN_KINDS, 'نوع المستند');
    var note = optionalText(p.note, 300);
    var now = nowIso();
    if (kind === 'voucher') {
      var v = Db.getOrThrow('custody', 'Vouchers', p.id, 'السند');
      if (v.status !== 'signing' && v.status !== 'active') throw appError(v.status === 'requested' ? 'السند لم يعتمده المحاسب بعد، لا يُسجَّل له توقيع المدير.' : 'السند ملغي أو مرفوض، لا يُسجَّل له توقيع.');
      var vc = v.custodyId ? Db.get('custody', 'Custodies', v.custodyId) : null;
      if (vc && Custody.isOwner_(ctx, vc)) throw appError('لا يمكنك تأكيد توقيع سند يخص عهدتك.', 'FORBIDDEN');
      if (v.signedAt) throw appError('السند موقّع من الإدارة مسبقاً.');
      if (Workflow.liveOf_(v.wfInstanceId)) throw appError('السند في سلسلة اعتماد داخل النظام، والقرار من صفحة السلسلة.');
      Db.update('custody', 'Vouchers', v.id, { signedAt: now, signedBy: ctx.user.id, signedNote: note, status: 'active' });
      Custody.advanceOpen_(vc, v.id);
      Audit.log(ctx.user, 'custody', 'voucher.signed', 'Voucher', v.id, { number: v.number, note: note });
      return true;
    }
    var c = Custody.getOrThrow_(p.id);
    if (Custody.isOwner_(ctx, c)) throw appError('لا يمكنك تأكيد كشف عهدتك.', 'FORBIDDEN');
    if (c.status !== 'signing') throw appError('العهدة لم يعتمد المحاسب إقفالها بعد.');
    if (Workflow.liveOf_(c.closeWfInstanceId)) throw appError('الكشف في سلسلة اعتماد داخل النظام، والقرار من صفحة السلسلة.');
    Db.update('custody', 'Custodies', c.id, { status: 'closed', closeSignedAt: now, closeSignedBy: ctx.user.id, closeSignedNote: note });
    Audit.log(ctx.user, 'custody', 'statement.signed', 'Custody', c.id, { note: note });
    return true;
  },

  // ───────── الملفات على Drive ─────────
  folderOf_: function (c) {
    var emp = Db.get('core', 'Employees', c.employeeId);
    var folder = Files.folder_(c.driveFolderId, ['العهد', c.id + ' — ' + (emp ? emp.fullName : '')]); // i18n:line
    if (folder.getId() !== c.driveFolderId) Db.update('custody', 'Custodies', c.id, { driveFolderId: folder.getId() });
    return folder;
  },

  /** صورة الفاتورة أو ملفها لبند في عهدة مفتوحة. p: { expenseId, fileName, mimeType, data } */
  attachmentUpload: function (ctx, p) {
    Files.require_();
    p = p || {};
    var e = Db.getOrThrow('custody', 'Expenses', p.expenseId, 'البند');
    var c = Custody.visible_(ctx, e.custodyId);
    Custody.assertEditable_(ctx, c);
    var up = Files.decode_(p);
    var no = Custody.expensesOf_(c.id).map(function (x) { return x.id; }).indexOf(e.id) + 1;
    var name = c.id + '_' + no + '_' + Files.safeName_(p.fileName || ('مرفق.' + up.ext)); // i18n:line
    var f = Files.save_(Custody.folderOf_(c), up, name);
    var a = Db.insert('custody', 'Attachments', {
      custodyId: c.id, expenseId: e.id, fileName: name, driveFileId: f.id, url: f.url, mimeType: up.mime,
      uploadedBy: ctx.user.id, uploadedAt: nowIso(), fileSize: f.size
    });
    var cur = Db.get('custody', 'Expenses', e.id);
    Db.update('custody', 'Expenses', e.id, { attachmentIds: (cur.attachmentIds || []).concat([a.id]), updatedAt: nowIso() });
    Audit.log(ctx.user, 'custody', 'attachment.upload', 'Attachment', a.id, { file: name, kb: Math.round(f.size / 1024) });
    return Custody.attachmentView_(a);
  },

  attachmentDelete: function (ctx, p) {
    var a = Db.getOrThrow('custody', 'Attachments', p && p.id, 'المرفق');
    var c = Custody.visible_(ctx, a.custodyId);
    Custody.assertEditable_(ctx, c);
    Files.trash_(a.driveFileId);
    Db.remove('custody', 'Attachments', a.id);
    var e = Db.get('custody', 'Expenses', a.expenseId);
    if (e) Db.update('custody', 'Expenses', e.id, { attachmentIds: (e.attachmentIds || []).filter(function (x) { return x !== a.id; }), updatedAt: nowIso() });
    Audit.log(ctx.user, 'custody', 'attachment.delete', 'Attachment', a.id, { file: a.fileName });
    return true;
  },

  attachmentContent: function (ctx, p) {
    var a = Db.getOrThrow('custody', 'Attachments', p && p.id, 'المرفق');
    Custody.visible_(ctx, a.custodyId);
    return Files.content_(a.driveFileId, a.fileName, a.mimeType);
  },

  /**
   * رفع النسخة الموقّعة من الإدارة (المحاسب، وليس على عهدته). رفع جديد يستبدل السابق.
   * سند صرف العهدة ينقلها إلى «جاري الصرف»، والكشف يغلقها نهائياً.
   */
  signedUpload: function (ctx, p) {
    Files.require_();
    p = p || {};
    var kind = Custody.enum_(p.kind, CUS.SIGN_KINDS, 'نوع المستند');
    var up = Files.decode_(p);
    var now = nowIso();
    if (kind === 'voucher') {
      var v = Db.getOrThrow('custody', 'Vouchers', p.id, 'السند');
      if (v.status !== 'signing' && v.status !== 'active') throw appError(v.status === 'requested' ? 'السند لم يعتمده المحاسب بعد، لا تُرفع له نسخة موقّعة.' : 'السند ملغي أو مرفوض، لا تُرفع له نسخة موقّعة.');
      var vc = v.custodyId ? Db.get('custody', 'Custodies', v.custodyId) : null;
      if (vc && Custody.isOwner_(ctx, vc)) throw appError('لا يمكنك رفع توقيع سند يخص عهدتك.', 'FORBIDDEN');
      var folder = vc ? Custody.folderOf_(vc) : Files.folder_('', ['السندات']);
      var f = Files.save_(folder, up, v.number + '_موقّع.' + up.ext); // i18n:line
      Files.trash_(v.signedFileId);
      Db.update('custody', 'Vouchers', v.id, { signedFileId: f.id, signedAt: v.signedAt || now, signedBy: v.signedAt ? v.signedBy : ctx.user.id, status: 'active' });
      Custody.advanceOpen_(vc, v.id);
      Audit.log(ctx.user, 'custody', 'voucher.signedUpload', 'Voucher', v.id, { number: v.number });
      return true;
    }
    var c = Custody.getOrThrow_(p.id);
    if (Custody.isOwner_(ctx, c)) throw appError('لا يمكنك رفع كشف عهدتك الموقّع.', 'FORBIDDEN');
    if (c.status !== 'signing' && c.status !== 'closed') throw appError('العهدة لم يعتمد المحاسب إقفالها بعد.');
    var file = Files.save_(Custody.folderOf_(c), up, c.id + '_كشف_التسوية_موقّع.' + up.ext); // i18n:line
    Files.trash_(c.closeSignedFileId);
    var patch = { closeSignedFileId: file.id };
    if (c.status === 'signing') { patch.status = 'closed'; patch.closeSignedAt = now; patch.closeSignedBy = ctx.user.id; }
    Db.update('custody', 'Custodies', c.id, patch);
    Audit.log(ctx.user, 'custody', 'statement.signedUpload', 'Custody', c.id, null);
    return true;
  },

  /** النسخة الموقّعة لمن يرى السند أو العهدة */
  signedContent: function (ctx, p) {
    p = p || {};
    if (p.kind === 'voucher') {
      var v = Db.get('custody', 'Vouchers', p.id);
      if (!v || !Vouchers.canSee_(ctx, v, Vouchers.mine_(ctx))) throw appError('السند غير موجود.', 'NOT_FOUND');
      if (!v.signedFileId) throw appError('لا توجد نسخة موقّعة لهذا السند.');
      return Files.content_(v.signedFileId, v.number + '_موقّع'); // i18n:line
    }
    var c = Custody.visible_(ctx, p.id);
    if (!c.closeSignedFileId) throw appError('لا يوجد كشف موقّع لهذه العهدة.');
    return Files.content_(c.closeSignedFileId, c.id + '_كشف_التسوية_موقّع'); // i18n:line
  },

  /** صورة توقيع المدير: المحفوظة، أو (للروابط المنقولة) من ملفها على Drive وتُحفظ بعد أول قراءة */
  managerImage_: function (link) {
    if (!link) return '';
    if (link.signatureData) return link.signatureData;
    var url = Files.dataUrl_(link.signatureFileId, CUS.SIGNATURE_MAX);
    if (url) { try { Db.update('custody', 'SignLinks', link.id, { signatureData: url }); } catch (e) { /* القراءة تكفي */ } }
    return url;
  },

  /** سند صرف العهدة بعد توقيعه: العهدة إلى «جاري الصرف» */
  advanceOpen_: function (c, voucherId) {
    if (c && c.openVoucherId === voucherId && c.status === 'open' && c.disburseStage === 'awaiting_signature') {
      Db.update('custody', 'Custodies', c.id, { disburseStage: 'disbursing' });
    }
  },

  /** حذف عهدة نهائياً مع حركاتها وسنداتها (مدير النظام، برقم العهدة وسبب) */
  remove: function (ctx, p) {
    var c = Custody.getOrThrow_(p && p.id);
    if (String(p.confirmId || '').trim() !== c.id) throw appError('اكتب رقم العهدة (' + c.id + ') كما هو لتأكيد الحذف.');
    var reason = requireText(p.reason, 'سبب الحذف', 300);
    var sum = withLock(function () {
      var exps = Custody.rows_('Expenses').filter(function (e) { return e.custodyId === c.id; });
      var vs = Custody.rows_('Vouchers').filter(function (v) { return v.custodyId === c.id; });
      exps.forEach(function (e) { Db.remove('custody', 'Expenses', e.id); });
      Custody.rows_('Attachments').filter(function (a) { return a.custodyId === c.id; }).forEach(function (a) { Db.remove('custody', 'Attachments', a.id); });
      vs.forEach(function (v) { Db.remove('custody', 'Vouchers', v.id); });
      Custody.rows_('Requests').filter(function (r) { return r.custodyId === c.id; }).forEach(function (r) { Db.update('custody', 'Requests', r.id, { custodyId: '' }); });
      Custody.rows_('Custodies').filter(function (x) { return x.previousCustodyId === c.id; }).forEach(function (x) { Db.update('custody', 'Custodies', x.id, { previousCustodyId: '' }); });
      Db.remove('custody', 'Custodies', c.id);
      return { expenses: exps.length, vouchers: vs.map(function (v) { return v.number; }) };
    });
    Audit.log(ctx.user, 'custody', 'custody.delete', 'Custody', c.id, Object.assign({ reason: reason, period: c.periodLabel, status: c.status, amount: kwd_(c.amount), spent: kwd_(c.totalSpent) }, sum));
    return true;
  },

  /** بيانات كشف التسوية للطباعة */
  statement: function (ctx, p) {
    var c = Custody.visible_(ctx, p && p.id);
    var m = Custody.maps_();
    var requested = !!c.closeRequestDate && ['pending', 'signing', 'closed'].indexOf(c.status) >= 0;
    var reviewed = !!c.reviewedBy && (c.status === 'signing' || c.status === 'closed');
    var emp = m.emps[c.employeeId];
    var link = c.closeMgrSignId ? m.links[c.closeMgrSignId] : null;
    var atts = indexBy_(Custody.rows_('Attachments').filter(function (a) { return a.custodyId === c.id; }));
    return {
      company: Settings.company_(),
      custody: Custody.view_(c, m),
      // المرفقات تُدرج ليتمكن الكشف المطبوع من ضمّها (طباعة مع المرفقات)
      expenses: Custody.expensesOf_(c.id).map(function (e) { return Custody.expenseView_(e, m, atts); }),
      vouchers: Custody.rows_('Vouchers').filter(function (v) { return v.custodyId === c.id; }).map(function (v) { return Vouchers.view_(v, m); }),
      signs: {
        holder: { name: Custody.empName_(m, c.employeeId), image: requested && emp ? Custody.signatureOf_(emp.userId) : '' },
        reviewer: { name: Custody.userName_(m, c.reviewedBy), image: reviewed ? Custody.signatureOf_(c.reviewedBy) : '' },
        manager: c.closeWfInstanceId && c.closeSignedBy && c.closeSignedBy !== CUS.MANAGER ? Object.assign(Custody.chainSigner_(c.closeSignedBy, m), { signedAt: c.closeSignedAt })
          : { name: link ? link.managerName : Custody.settings_().managerName, image: Custody.managerImage_(link), signedAt: c.closeSignedAt }
      }
    };
  },

  // ───────── التواقيع الشخصية (للمطبوعات) ─────────
  signatureOf_: function (userId) {
    if (!userId) return '';
    var s = Custody.rows_('Signatures').filter(function (x) { return x.userId === userId; })[0];
    return s ? s.data : '';
  },

  signatureData_: function (value) {
    var d = String(value || '');
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(d)) throw appError('التوقيع يجب أن يكون صورة PNG أو JPG أو WEBP.');
    if (d.length > CUS.SIGNATURE_MAX) throw appError('صورة التوقيع كبيرة، استخدم صورة أصغر.');
    return d;
  },

  mySignature: function (ctx) { return { data: Custody.signatureOf_(ctx.user.id) }; },

  mySignatureSave: function (ctx, p) {
    var data = p && p.data ? Custody.signatureData_(p.data) : '';
    withLock(function () {
      var s = Custody.rows_('Signatures').filter(function (x) { return x.userId === ctx.user.id; })[0];
      if (!data) { if (s) Db.remove('custody', 'Signatures', s.id); return; }
      if (s) Db.update('custody', 'Signatures', s.id, { data: data, updatedAt: nowIso() });
      else Db.insert('custody', 'Signatures', { userId: ctx.user.id, data: data, updatedAt: nowIso() });
    });
    Audit.log(ctx.user, 'custody', data ? 'signature.save' : 'signature.delete', 'User', ctx.user.id, null);
    return { data: data };
  },

  // ───────── القوائم المرجعية والإعدادات (مدير النظام) ─────────
  settingsGet: function () {
    var lists = {};
    Object.keys(CUS.LISTS).forEach(function (k) {
      lists[k] = Custody.rows_(CUS.LISTS[k]).slice().sort(function (a, b) { return a.sortOrder - b.sortOrder; })
        .map(function (r) { return { id: r.id, name: r.name, type: r.type || '', active: r.active }; });
    });
    return { settings: Custody.settings_(), lists: lists, projectTypes: CUS.PROJECT_TYPES, accountants: Custody.accountants_() };
  },

  settingsSave: function (ctx, p) {
    p = p || {};
    var next = {
      managerName: optionalText(p.managerName, 80), managerPhone: optionalText(normalizeDigits(p.managerPhone).replace(/[^\d]/g, ''), 20),
      alertPercent: intIn_(p.alertPercent || 80, 10, 100, 'نسبة التنبيه'),
      defaultAmount: parseMoney_(p.defaultAmount, 'المبلغ الافتراضي للعهدة', { max: 100000 }),
      companyAccountantId: String(p.companyAccountantId || '')
    };
    if (next.companyAccountantId && !Custody.accountants_().some(function (a) { return a.id === next.companyAccountantId; })) {
      throw appError('محاسب الشركة يجب أن يكون مستخدماً مفعّلاً له دور محاسب في العهد.');
    }
    Settings.set_('custody', next, ctx.user);
    Audit.log(ctx.user, 'custody', 'settings.update', 'Settings', 'custody', next);
    return Custody.settingsGet();
  },

  listSave: function (ctx, p) {
    p = p || {};
    var table = CUS.LISTS[p.list];
    if (!table) throw appError('قائمة غير معروفة.');
    var name = requireText(p.name, 'الاسم', 60);
    var rows = Custody.rows_(table);
    if (rows.some(function (r) { return r.name === name && r.id !== p.id; })) throw appError('الاسم مستخدم مسبقاً.');
    var rec = { name: name, active: p.active !== false };
    if (table === 'Projects') rec.type = Custody.enum_(p.type || 'project', CUS.PROJECT_TYPES, 'نوع المشروع');
    var saved;
    if (p.id) {
      var cur = Db.getOrThrow('custody', table, p.id, 'العنصر');
      saved = Db.update('custody', table, cur.id, rec);
      // إعادة التسمية تُطبَّق على البنود المسجلة بالاسم القديم
      if (cur.name !== name) {
        var field = table === 'Categories' ? 'category' : table === 'Projects' ? 'project' : 'docType';
        Custody.rows_('Expenses').filter(function (e) { return e[field] === cur.name; }).forEach(function (e) {
          var patch = {}; patch[field] = name; Db.update('custody', 'Expenses', e.id, patch);
        });
      }
    } else {
      rec.sortOrder = rows.reduce(function (mx, r) { return Math.max(mx, r.sortOrder || 0); }, 0) + 1;
      saved = Db.insert('custody', table, rec);
    }
    Audit.log(ctx.user, 'custody', 'list.save', table, saved.id, { name: name, active: rec.active });
    return Custody.settingsGet();
  },

  listMove: function (ctx, p) {
    var table = CUS.LISTS[p && p.list];
    if (!table) throw appError('قائمة غير معروفة.');
    var rows = Custody.rows_(table).slice().sort(function (a, b) { return a.sortOrder - b.sortOrder; });
    var i = rows.map(function (r) { return r.id; }).indexOf(p.id), j = i + (p.dir === 'up' ? -1 : 1);
    if (i < 0 || j < 0 || j >= rows.length) return Custody.settingsGet();
    Db.update('custody', table, rows[i].id, { sortOrder: rows[j].sortOrder });
    Db.update('custody', table, rows[j].id, { sortOrder: rows[i].sortOrder });
    return Custody.settingsGet();
  },

  /** قيم مبدئية للقوائم عند أول تشغيل بلا نقل */
  seed_: function () {
    if (!Custody.rows_('Categories').length) {
      Db.insertMany('custody', 'Categories', ['ضيافة وبوفيه', 'طباعة', 'توصيل ومندوب ومواصلات', 'أدوات ومعدات مكتبية', 'أخرى']
        .map(function (n, i) { return { name: n, active: true, sortOrder: i + 1 }; }));
    }
    if (!Custody.rows_('DocTypes').length) {
      Db.insertMany('custody', 'DocTypes', ['فاتورة', 'إيصال', 'سند صرف', 'سند قبض', 'كشف', 'طلب صرف']
        .map(function (n, i) { return { name: n, active: true, sortOrder: i + 1 }; }));
    }
  },

  /** ربط مع الموارد البشرية: سبب منع إنهاء خدمة الموظف ('' = لا مانع) */
  offboardBlock_: function (empId) {
    var a = Custody.activeOf_(empId);
    if (!a) return '';
    return 'عليه عهدة غير مقفلة ' + a.id + ' (' + Custody.stageLabel_(a) + '، المتبقي ' + kwd_(a.remaining) + '). أقفلها واعتمدها أولاً.';
  },

  // ───────── الرئيسية وصندوق الموافقات ─────────
  summary_: function (ctx) {
    if (!Permissions.has(ctx, 'custody')) return [];
    var h = Custody.home(ctx), cards = [];
    if (h.isHolder && (h.myCustody || h.myRequest)) cards.push({ kind: 'cus.mine', custody: h.myCustody, request: h.myRequest });
    if (h.staff) {
      cards.push({
        kind: 'cus.staff', pendingClose: h.staff.pendingClose.length, pendingRequests: h.staff.pendingRequests.length,
        voucherRequests: h.staff.voucherRequests.length, awaitingSign: h.staff.awaitingOpenSign.length + h.staff.awaitingCloseSign.length + h.staff.voucherSigning.length,
        openCount: h.staff.openCount, openBalance: h.staff.openBalance, monthSpent: h.staff.monthSpent
      });
    }
    return cards;
  },

  inbox_: function (ctx) {
    if (!Custody.isStaff_(ctx)) return [];
    var m = Custody.maps_(), me = Custody.me_(ctx), items = [];
    Custody.rows_('Custodies').filter(function (c) { return c.status === 'pending' && (!me || c.employeeId !== me.id); }).forEach(function (c) {
      var v = Custody.view_(c, m);
      items.push({
        id: 'cus.close:' + c.id, kind: 'cus.close', refId: c.id, module: 'custody', moduleLabel: 'إقفال عهدة', title: c.id + ' · ' + c.periodLabel,
        who: v.employeeName, createdAt: c.closeRequestDate, status: CUS.STATUS.pending, note: c.closeNote, needsNoteOnReject: true,
        facts: [{ k: 'المصروف', v: kwd_(c.totalSpent) }, { k: 'المتبقي', v: kwd_(c.remaining) }], approveLabel: 'اعتماد بالترحيل', link: '/custody/' + c.id
      });
    });
    Custody.rows_('Requests').filter(function (r) { return r.status === 'pending' && (!me || r.employeeId !== me.id); }).forEach(function (r) {
      items.push({
        id: 'cus.request:' + r.id, kind: 'cus.request', refId: r.id, module: 'custody', moduleLabel: 'طلب عهدة', title: 'عهدة جديدة · ' + kwd_(r.amount),
        who: Custody.empName_(m, r.employeeId), createdAt: r.createdAt, status: CUS.REQ_STATUS.pending, note: r.reason, needsNoteOnReject: true,
        facts: [{ k: 'المبلغ', v: kwd_(r.amount) }]
      });
    });
    Custody.rows_('Vouchers').filter(function (v) { return v.status === 'requested' && !Vouchers.approveBlock_(ctx, v); }).forEach(function (v) {
      items.push({
        id: 'cus.voucher:' + v.id, kind: 'cus.voucher', refId: v.id, module: 'custody', moduleLabel: 'طلب سند', title: 'سند ' + CUS.V_TYPES[v.type] + ' · ' + kwd_(v.amount),
        who: Custody.userName_(m, v.requestedBy), createdAt: v.requestedAt, status: CUS.V_STATUS.requested, note: v.reason, needsNoteOnReject: true,
        facts: [{ k: v.type === 'payment' ? 'المستلم' : 'الدافع', v: v.partyName }, { k: 'المبلغ', v: kwd_(v.amount) }]
      });
    });
    return items;
  },

  decide_: function (ctx, kind, p) {
    var yes = bool_(p.approve);
    if (kind === 'cus.close') return yes ? Custody.approve(ctx, { id: p.id, settlementMethod: 'carry' }) : Custody.reject(ctx, { id: p.id, reason: p.note });
    if (kind === 'cus.request') {
      if (!yes) return Requests.reject(ctx, { id: p.id, reason: p.note });
      var r = Db.getOrThrow('custody', 'Requests', p.id, 'الطلب');
      return Custody.open(ctx, { employeeId: r.employeeId, amount: kwd_(r.amount, true).replace(/,/g, ''), requestId: r.id });
    }
    if (kind === 'cus.voucher') return yes ? Vouchers.approve(ctx, { id: p.id }) : Vouchers.reject(ctx, { id: p.id, reason: p.note });
    return null;
  },

  /** الإشعارات (Notify): ما يخص صاحب العهدة أو طالب السند. الطلبات الجديدة تصل للمحاسبين عبر صندوق الموافقات */
  notify_: function (ev) {
    var out = [];
    var userOf = function (empId) { var e = Staff.get_(empId); return e ? e.userId : ''; };
    if (ev.entity === 'Custody') {
      var c = Db.get('custody', 'Custodies', ev.id);
      if (!c) return out;
      var to = userOf(c.employeeId), link = '/custody/' + c.id, detail = c.id + ' · ' + c.periodLabel;
      if (ev.action === 'custody.open') out.push({ to: to, title: 'فُتحت لك عهدة', detail: c.id + ' · ' + kwd_(c.amount), link: link });
      else if (ev.action === 'custody.approve') out.push({ to: to, title: 'اعتُمد إقفال عهدتك', detail: detail + ' · ' + kwd_(c.remaining), link: link });
      else if (ev.action === 'custody.reject') out.push({ to: to, title: 'رُفض طلب إقفال عهدتك', detail: detail + (c.rejectReason ? ' — ' + c.rejectReason : ''), link: link });
      else if (ev.action === 'statement.signed' || ev.action === 'statement.signedUpload') out.push({ to: to, title: 'أُغلقت عهدتك نهائياً', detail: detail, link: link });
    } else if (ev.entity === 'Voucher') {
      var v = Db.get('custody', 'Vouchers', ev.id);
      if (!v) return out;
      var vd = v.number + ' · ' + kwd_(v.amount);
      if (ev.action === 'voucher.signed' || ev.action === 'voucher.signedUpload') {
        var oc = v.custodyId && Db.get('custody', 'Custodies', v.custodyId);
        if (oc && oc.openVoucherId === v.id) out.push({ to: userOf(oc.employeeId), title: 'وقّعت الإدارة سند صرف عهدتك', detail: vd, link: '/custody/' + oc.id });
      } else if (ev.action === 'voucher.approve') out.push({ to: v.requestedBy, title: 'اعتُمد طلب السند', detail: vd, link: '/custody/vouchers' });
      else if (ev.action === 'voucher.reject') out.push({ to: v.requestedBy, title: 'رُفض طلب السند', detail: vd + (v.rejectReason ? ' — ' + v.rejectReason : ''), link: '/custody/vouchers' });
    } else if (ev.entity === 'Request' && ev.action === 'request.reject') {
      var r = Db.get('custody', 'Requests', ev.id);
      if (r) out.push({ to: userOf(r.employeeId), title: 'رُفض طلب العهدة', detail: kwd_(r.amount) + (r.rejectReason ? ' — ' + r.rejectReason : ''), link: '/custody' });
    } else if (ev.entity === 'Expense' && (ev.action === 'expense.note' || ev.action === 'expense.correct')) {
      var e = Db.get('custody', 'Expenses', ev.id), ec = e && Db.get('custody', 'Custodies', e.custodyId);
      if (ec) out.push({ to: userOf(ec.employeeId), title: 'ملاحظة من المحاسب على بند في عهدتك', detail: ec.id + ' · ' + e.description + (e.reviewNote ? ' — ' + e.reviewNote : ''), link: '/custody/' + ec.id });
    }
    return out;
  },

  /** الإشعارات: الإجراءات التي تضع عنصراً في صندوق الموافقات، ومن يُحتمل أن يراه (المحاسبون) */
  approvalActions_: ['custody.requestClose', 'request.create', 'request.chainApproved', 'voucher.request'],
  approvers_: function () { return Notify.usersWithRole_('custody', ['accountant']); },

  // ───────── السلسلة الإجرائية (docs/09) ─────────
  /** حال سلسلة سجل للواجهة: ملخصها، وهل يُرسل إليها (مربوط وليس فيها قرار جارٍ) */
  chainState_: function (type, id, wfId, waiting) {
    var live = Workflow.liveOf_(wfId);
    return { wf: wfId ? Workflow.summaryFor_(type, id) : null, canStart: !!waiting && !live && !!Workflow.templateFor_(type, id) };
  },

  /** من اعتمد في السلسلة: اسمه وتوقيعه المعتمد في النظام (أو توقيعه للمطبوعات) */
  chainSigner_: function (userId, m) {
    return { name: Custody.userName_(m, userId), image: Signature.approvedOf_(userId) || Custody.signatureOf_(userId) };
  },

  /** cus.chain.start (المحاسب): { kind: voucher|statement, id } — يرسل السند أو الكشف للسلسلة بدل رابط المدير */
  chainStart: function (ctx, p) {
    p = p || {};
    var kind = Custody.enum_(p.kind, CUS.SIGN_KINDS, 'نوع المستند');
    return withLock(function () {
      var t = Sign.target_(kind, p.id), err = Sign.error_(t);
      if (err) throw appError(err + '.');
      var c = kind === 'voucher' ? (t.voucher.custodyId ? Db.get('custody', 'Custodies', t.voucher.custodyId) : null) : t.custody;
      if (c && Custody.isOwner_(ctx, c)) throw appError('لا يمكنك إرسال ما يخص عهدتك.', 'FORBIDDEN');
      var type = kind === 'voucher' ? 'cus.voucher' : 'cus.close', wfId = kind === 'voucher' ? t.voucher.wfInstanceId : t.custody.closeWfInstanceId;
      if (Workflow.liveOf_(wfId)) throw appError('المستند في سلسلة اعتماد جارية.');
      if (!Workflow.templateFor_(type, t.id)) throw appError('لم يُربط هذا النوع بسلسلة. يربطه مدير النظام من «النظام ← السلاسل الإجرائية».');
      Custody.rows_('SignLinks').filter(function (l) { return l.kind === kind && l.targetId === t.id && l.status === 'open'; })
        .forEach(function (l) { Db.update('custody', 'SignLinks', l.id, { status: 'revoked' }); });
      var wf = Workflow.startIfBound_(ctx, type, t.id, function () {});
      if (kind === 'voucher') Db.update('custody', 'Vouchers', t.id, { wfInstanceId: wf.id });
      else Db.update('custody', 'Custodies', t.id, { closeWfInstanceId: wf.id });
      return { instanceId: wf.id };
    });
  },

  /** مضيف طلب العهدة: السلسلة قبل المحاسب، والاعتماد يضعه عند المحاسب ليفتح العهدة */
  wfRequest_: function () {
    return {
      module: 'custody', managerRoles: ['accountant'], label: 'طلب عهدة', system: true, builtinLabel: 'المحاسب يفتح العهدة مباشرة',
      entity_: function (id) {
        var r = Db.get('custody', 'Requests', id);
        if (!r) return null;
        var emp = Staff.get_(r.employeeId);
        return {
          id: r.id, number: 'طلب عهدة · ' + kwd_(r.amount), title: emp ? emp.fullName : '', createdBy: r.createdBy || (emp && emp.userId) || '', version: 0, moduleLabel: 'طلب عهدة',
          facts: [{ k: 'المبلغ', v: kwd_(r.amount) }].concat(r.reason ? [{ k: 'السبب', v: r.reason }] : []),
          values: { $dept: emp ? emp.departmentId || '' : '', 'cus.request:amount': r.amount }
        };
      },
      conditionFields_: function () {
        return [
          { key: '$dept', label: 'قسم المنشئ', kind: 'select', options: Staff.depts_().filter(function (d) { return d.active !== false; }).map(function (d) { return { id: d.id, label: d.name }; }) },
          { key: 'cus.request:amount', label: 'طلب العهدة: المبلغ', kind: 'money', options: [] }
        ];
      },
      onEvent_: function (ctx, event, inst) {
        var r = Db.get('custody', 'Requests', inst.entityId);
        if (!r) return;
        var note = Workflow.lastNote_(inst.id), now = nowIso();
        if (event === 'approved') {
          Db.update('custody', 'Requests', r.id, { status: 'pending' });
          Audit.log(ctx.user, 'custody', 'request.chainApproved', 'Request', r.id, { amount: kwd_(r.amount), template: inst.templateName });
        } else if (event === 'rejected') Db.update('custody', 'Requests', r.id, { status: 'rejected', rejectReason: note || 'رُفض في السلسلة', handledBy: ctx.user.id, handledAt: now });
        else if (event === 'returned') Db.update('custody', 'Requests', r.id, { status: 'returned', rejectReason: note });
        else if (event === 'cancelled') Db.update('custody', 'Requests', r.id, { status: 'cancelled', handledBy: ctx.user.id, handledAt: now });
      },
      resubmit_: function (ctx, inst) { Db.update('custody', 'Requests', inst.entityId, { status: 'in_chain', rejectReason: '' }); },
      canSee_: function (ctx, id) {
        var r = Db.get('custody', 'Requests', id), me = Custody.me_(ctx);
        return !!r && (Custody.isStaff_(ctx) || (!!me && (me.id === r.employeeId || Staff.manages_(me.id, r.employeeId))));
      },
      page_: function () { return '/custody/requests'; }
    };
  },

  /** مضيف اعتماد السند: قرار الإدارة في السلسلة بدل رابط المدير، ومن اعتمد يوقّع السند بتوقيعه في النظام */
  wfVoucher_: function () {
    return {
      module: 'custody', managerRoles: ['accountant'], label: 'اعتماد سند', system: true, builtinLabel: 'رابط توقيع المدير',
      entity_: function (id) {
        var v = Db.get('custody', 'Vouchers', id);
        if (!v) return null;
        var opening = Vouchers.isOpening_(v);
        return {
          id: v.id, number: 'سند ' + CUS.V_TYPES[v.type] + ' ' + (v.number || ''), title: v.partyName + ' · ' + kwd_(v.amount), createdBy: v.approvedBy || v.createdBy, version: 0, moduleLabel: 'اعتماد سند',
          facts: [{ k: v.type === 'payment' ? 'المستلم' : 'الدافع', v: v.partyName }, { k: 'المبلغ', v: kwd_(v.amount) }, { k: 'البيان', v: v.reason }]
            .concat(v.custodyId ? [{ k: 'العهدة', v: v.custodyId }] : []),
          values: { 'cus.voucher:type': v.type, 'cus.voucher:amount': v.amount, 'cus.voucher:opening': opening ? 'yes' : 'no' }
        };
      },
      conditionFields_: function () {
        return [
          { key: 'cus.voucher:type', label: 'السند: النوع', kind: 'select', options: Object.keys(CUS.V_TYPES).map(function (k) { return { id: k, label: CUS.V_TYPES[k] }; }) },
          { key: 'cus.voucher:amount', label: 'السند: المبلغ', kind: 'money', options: [] },
          { key: 'cus.voucher:opening', label: 'السند: صرف عهدة', kind: 'select', options: [{ id: 'yes', label: 'نعم' }, { id: 'no', label: 'لا' }] }
        ];
      },
      onEvent_: function (ctx, event, inst) {
        var v = Db.get('custody', 'Vouchers', inst.entityId);
        if (!v || event !== 'approved' || v.status !== 'signing' || v.signedAt) return; // الرفض والإعادة: يبقى بانتظار الإدارة ويعيد المحاسب إرساله
        var note = 'اعتُمد في السلسلة «' + inst.templateName + '»';
        Db.update('custody', 'Vouchers', v.id, { signedAt: nowIso(), signedBy: ctx.user.id, signedNote: note, status: 'active' });
        Custody.advanceOpen_(v.custodyId ? Db.get('custody', 'Custodies', v.custodyId) : null, v.id);
        Audit.log(ctx.user, 'custody', 'voucher.signed', 'Voucher', v.id, { number: v.number, note: note });
      },
      resubmit_: function () {},
      canSee_: function (ctx, id) { var v = Db.get('custody', 'Vouchers', id); return !!v && Vouchers.canSee_(ctx, v, Vouchers.mine_(ctx)); },
      canCancel_: function (ctx) { return Custody.isStaff_(ctx); },
      page_: function (id) { var v = Db.get('custody', 'Vouchers', id); return v && v.custodyId ? '/custody/' + v.custodyId : '/custody/vouchers'; }
    };
  },

  /** مضيف إقفال العهدة: اعتماد الإدارة لكشف التسوية في السلسلة، فتُغلق نهائياً بتوقيع من اعتمد */
  wfClose_: function () {
    return {
      module: 'custody', managerRoles: ['accountant'], label: 'إقفال عهدة', system: true, builtinLabel: 'رابط توقيع المدير على الكشف',
      entity_: function (id) {
        var c = Db.get('custody', 'Custodies', id);
        if (!c) return null;
        var emp = Staff.get_(c.employeeId);
        return {
          id: c.id, number: 'إقفال العهدة ' + c.id, title: (emp ? emp.fullName : '') + ' · ' + c.periodLabel, createdBy: c.reviewedBy, version: 0, moduleLabel: 'إقفال عهدة',
          facts: [{ k: 'المصروف', v: kwd_(c.totalSpent) }, { k: 'المتبقي', v: kwd_(c.remaining) }, { k: 'التسوية', v: CUS.SETTLEMENT[c.settlementMethod] || '—' }],
          values: { $dept: emp ? emp.departmentId || '' : '', 'cus.close:spent': c.totalSpent }
        };
      },
      conditionFields_: function () {
        return [
          { key: '$dept', label: 'قسم المنشئ', kind: 'select', options: Staff.depts_().filter(function (d) { return d.active !== false; }).map(function (d) { return { id: d.id, label: d.name }; }) },
          { key: 'cus.close:spent', label: 'الإقفال: المصروف', kind: 'money', options: [] }
        ];
      },
      onEvent_: function (ctx, event, inst) {
        var c = Db.get('custody', 'Custodies', inst.entityId);
        if (!c || event !== 'approved' || c.status !== 'signing') return;
        var note = 'اعتُمد في السلسلة «' + inst.templateName + '»';
        Db.update('custody', 'Custodies', c.id, { status: 'closed', closeSignedAt: nowIso(), closeSignedBy: ctx.user.id, closeSignedNote: note });
        Audit.log(ctx.user, 'custody', 'statement.signed', 'Custody', c.id, { note: note });
      },
      resubmit_: function () {},
      canSee_: function (ctx, id) { try { Custody.visible_(ctx, id); return true; } catch (e) { return false; } },
      canCancel_: function (ctx) { return Custody.isStaff_(ctx); },
      page_: function (id) { return '/custody/' + id; }
    };
  },

  routes_: function () {
    var any = { module: 'custody' }, acc = { module: 'custody', roles: ['accountant'] }, staff = acc;
    return {
      'cus.lookups': { perm: any, fn: Custody.lookups },
      'cus.home': { perm: any, fn: Custody.home },
      'cus.dashboard': { perm: staff, fn: Custody.dashboard },
      'cus.list': { perm: any, fn: Custody.list },
      'cus.get': { perm: any, fn: Custody.get },
      'cus.holders': { perm: acc, fn: Custody.holders },
      'cus.open': { perm: acc, fn: Custody.open },
      'cus.confirmReceipt': { perm: any, fn: Custody.confirmReceipt },
      'cus.requestClose': { perm: any, fn: Custody.requestClose },
      'cus.approve': { perm: acc, fn: Custody.approve },
      'cus.reject': { perm: acc, fn: Custody.reject },
      'cus.markSigned': { perm: acc, fn: Custody.markSigned },
      'cus.chain.start': { perm: acc, fn: Custody.chainStart },
      'cus.delete': { perm: 'super', fn: Custody.remove },
      'cus.statement': { perm: any, fn: Custody.statement },
      'cus.expense.save': { perm: any, fn: Custody.expenseSave },
      'cus.expense.delete': { perm: any, fn: Custody.expenseDelete },
      'cus.expense.note': { perm: acc, fn: Custody.expenseNote },
      'cus.expense.correct': { perm: 'super', fn: Custody.expenseCorrect },
      'cus.request.create': { perm: any, fn: Requests.create },
      'cus.request.list': { perm: any, fn: Requests.list },
      'cus.request.reject': { perm: acc, fn: Requests.reject },
      'cus.request.cancel': { perm: any, fn: Requests.cancel },
      'cus.voucher.list': { perm: any, fn: Vouchers.list },
      'cus.voucher.get': { perm: any, fn: Vouchers.get },
      'cus.voucher.create': { perm: acc, fn: Vouchers.createManual },
      'cus.voucher.request': { perm: any, fn: Vouchers.request },
      'cus.voucher.approve': { perm: acc, fn: Vouchers.approve },
      'cus.voucher.reject': { perm: acc, fn: Vouchers.reject },
      'cus.voucher.cancel': { perm: any, fn: Vouchers.cancel },
      'cus.sign.create': { perm: acc, fn: Sign.create },
      'cus.sign.view': { public: true, fn: Sign.view },
      'cus.sign.submit': { public: true, fn: Sign.submit },
      'cus.sign.reject': { public: true, fn: Sign.reject },
      'cus.attachment.upload': { perm: any, fn: Custody.attachmentUpload },
      'cus.attachment.delete': { perm: any, fn: Custody.attachmentDelete },
      'cus.attachment.content': { perm: any, fn: Custody.attachmentContent },
      'cus.signed.upload': { perm: acc, fn: Custody.signedUpload },
      'cus.signed.content': { perm: any, fn: Custody.signedContent },
      'cus.signature.get': { perm: any, fn: Custody.mySignature },
      'cus.signature.save': { perm: any, fn: Custody.mySignatureSave },
      'cus.settings.get': { perm: 'super', fn: Custody.settingsGet },
      'cus.settings.save': { perm: 'super', fn: Custody.settingsSave },
      'cus.list.save': { perm: 'super', fn: Custody.listSave },
      'cus.list.move': { perm: 'super', fn: Custody.listMove }
    };
  }
};

// ───────── طلبات العهد الجديدة ─────────
var Requests = {
  /** طلب لم يُعالَج بعد: عند المحاسب، أو في السلسلة */
  OPEN: ['pending', 'in_chain', 'returned'],

  view_: function (r, m) {
    var active = Custody.activeOf_(r.employeeId);
    var c = r.status === 'approved' && r.custodyId ? Db.get('custody', 'Custodies', r.custodyId) : null;
    var pv = c && c.openVoucherId ? Db.get('custody', 'Vouchers', c.openVoucherId) : null;
    var status = pv && pv.status === 'signing' ? 'signing' : pv && pv.status === 'requested' ? 'accountant' : r.status;
    return {
      id: r.id, employeeId: r.employeeId, employeeName: Custody.empName_(m, r.employeeId), amount: r.amount, reason: r.reason,
      status: status, statusLabel: CUS.REQ_STATUS[status] || status, custodyId: r.custodyId,
      handledByName: Custody.userName_(m, r.handledBy), handledAt: r.handledAt, rejectReason: r.rejectReason, createdAt: r.createdAt,
      activeCustodyId: active ? active.id : '',
      wfInstanceId: r.wfInstanceId || '', wf: r.wfInstanceId ? Workflow.summaryFor_('cus.request', r.id) : null
    };
  },

  create: function (ctx, p) {
    p = p || {};
    var me = Staff.requireOfCtx_(ctx);
    var amount = p.amount === '' || p.amount == null ? Custody.settings_().defaultAmount : parseMoney_(p.amount, 'المبلغ المطلوب', { max: 100000 });
    var reason = optionalText(p.reason, 300);
    var r = withLock(function () {
      var active = Custody.activeOf_(me.id);
      if (active) throw appError('لديك عهدة ' + Custody.stageLabel_(active) + ' (' + active.id + ')، يجب إقفالها واعتمادها قبل طلب عهدة جديدة.');
      if (Custody.rows_('Requests').some(function (x) { return x.employeeId === me.id && Requests.OPEN.indexOf(x.status) >= 0; })) throw appError('لديك طلب عهدة جديدة بانتظار الموافقة.');
      var ins = Db.insert('custody', 'Requests', { employeeId: me.id, amount: amount, reason: reason, status: 'pending', createdAt: nowIso(), createdBy: ctx.user.id });
      // مربوط بسلسلة (docs/09): يمر بها قبل المحاسب
      var wf = Workflow.startIfBound_(ctx, 'cus.request', ins.id, function () { Db.update('custody', 'Requests', ins.id, { status: 'in_chain' }); });
      if (wf) Db.update('custody', 'Requests', ins.id, { wfInstanceId: wf.id });
      return Db.get('custody', 'Requests', ins.id);
    });
    Audit.log(ctx.user, 'custody', 'request.create', 'Request', r.id, { amount: kwd_(amount) });
    return Requests.view_(r, Custody.maps_());
  },

  list: function (ctx, p) {
    p = p || {};
    var staff = Custody.isStaff_(ctx), me = Custody.me_(ctx), m = Custody.maps_();
    return Custody.rows_('Requests').filter(function (r) {
      return (staff || (me && r.employeeId === me.id)) && (!p.status || r.status === p.status);
    }).sort(function (a, b) {
      return (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.createdAt.localeCompare(a.createdAt);
    }).map(function (r) { return Requests.view_(r, m); });
  },

  reject: function (ctx, p) {
    var r = Db.getOrThrow('custody', 'Requests', p && p.id, 'الطلب');
    if (r.status !== 'pending') throw appError('هذا الطلب تمت معالجته مسبقاً.');
    var me = Custody.me_(ctx);
    if (me && me.id === r.employeeId) throw appError('لا يمكنك معالجة طلبك بنفسك.', 'FORBIDDEN');
    var reason = requireText(p.reason, 'سبب الرفض', 300);
    var u = Db.update('custody', 'Requests', r.id, { status: 'rejected', rejectReason: reason, handledBy: ctx.user.id, handledAt: nowIso() });
    Audit.log(ctx.user, 'custody', 'request.reject', 'Request', r.id, { reason: reason });
    return Requests.view_(u, Custody.maps_());
  },

  cancel: function (ctx, p) {
    var r = Db.getOrThrow('custody', 'Requests', p && p.id, 'الطلب');
    var me = Custody.me_(ctx);
    if (!me || r.employeeId !== me.id) throw appError('إلغاء الطلب لصاحبه فقط.', 'FORBIDDEN');
    if ((r.status === 'in_chain' || r.status === 'returned') && r.wfInstanceId) {
      Workflow.cancelFor_(ctx, r.wfInstanceId, 'ألغاه مقدّم الطلب');
      return Requests.view_(Db.get('custody', 'Requests', r.id), Custody.maps_());
    }
    if (r.status !== 'pending') throw appError('لا يمكن إلغاء الطلب بعد معالجته.');
    var u = Db.update('custody', 'Requests', r.id, { status: 'cancelled', handledBy: ctx.user.id, handledAt: nowIso() });
    Audit.log(ctx.user, 'custody', 'request.cancel', 'Request', r.id, null);
    return Requests.view_(u, Custody.maps_());
  }
};

// ───────── السندات ─────────
// i18n:off — التفقيط عربي بطبيعته (يُطبع على السندات)
var TAFQEET = {
  ONES: ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'],
  TEENS: ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'],
  TENS: ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'],
  HUNDREDS: ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة']
};

var Vouchers = {
  below1000_: function (n) {
    var parts = [], h = Math.floor(n / 100), rest = n % 100;
    if (h) parts.push(TAFQEET.HUNDREDS[h]);
    if (rest >= 10 && rest < 20) parts.push(TAFQEET.TEENS[rest - 10]);
    else {
      var o = rest % 10, t = Math.floor(rest / 10);
      if (o) parts.push(TAFQEET.ONES[o]);
      if (t) parts.push(TAFQEET.TENS[t]);
    }
    return parts.join(' و');
  },

  group_: function (n, one, two, plural) {
    if (n === 1) return one;
    if (n === 2) return two;
    if (n >= 3 && n <= 10) return Vouchers.below1000_(n) + ' ' + plural;
    return Vouchers.below1000_(n) + ' ' + one;
  },

  words_: function (n) {
    n = Math.floor(Math.abs(n));
    if (n === 0) return 'صفر';
    if (n > 999999999) throw appError('المبلغ أكبر من الحد المسموح للتفقيط.');
    var mil = Math.floor(n / 1000000), th = Math.floor((n % 1000000) / 1000), rest = n % 1000, parts = [];
    if (mil) parts.push(Vouchers.group_(mil, 'مليون', 'مليونان', 'ملايين'));
    if (th) parts.push(Vouchers.group_(th, 'ألف', 'ألفان', 'آلاف'));
    if (rest) parts.push(Vouchers.below1000_(rest));
    return parts.join(' و');
  },

  /** تفقيط مبلغ بالفلس: «مائة وخمسة وعشرون دينار كويتي وخمسمائة فلس لا غير» */
  amountInWords_: function (f) {
    f = Math.abs(Math.round(f));
    var d = Math.floor(f / 1000), r = f % 1000, parts = [];
    if (d || !r) parts.push(Vouchers.words_(d) + ' دينار كويتي');
    if (r) parts.push(Vouchers.words_(r) + ' فلس');
    return parts.join(' و') + ' لا غير';
  },
  // i18n:on

  prefix_: function (type) { return type === 'payment' ? 'PV' : 'RV'; },

  numbers_: function () {
    var o = {};
    Custody.rows_('Vouchers').forEach(function (v) { if (v.number) o[v.number] = true; });
    return o;
  },

  isOpening_: function (v) {
    var c = v.custodyId ? Db.get('custody', 'Custodies', v.custodyId) : null;
    return !!(c && c.openVoucherId === v.id);
  },

  view_: function (v, m) {
    var c = v.custodyId ? Db.get('custody', 'Custodies', v.custodyId) : null;
    var approver = v.approvedBy || v.createdBy;
    var isOpening = !!(c && c.openVoucherId === v.id);
    var requestedBy = v.requestedBy, requestedAt = v.requestedAt, reason = v.reason;
    if (isOpening) {
      var req = Custody.rows_('Requests').filter(function (r) { return r.custodyId === c.id; })[0];
      if (req && !requestedBy) { requestedBy = req.createdBy; requestedAt = req.createdAt; }
      if (req && req.reason && String(reason).indexOf('سبب الطلب:') < 0) reason += ' — سبب الطلب: ' + req.reason;
    }
    // اعتمده المحاسب: بانتظار المدير أو ساري، أو أُلغي بعد اعتماده (طلب أُلغي قبل الاعتماد بلا رقم)
    var approved = v.status === 'signing' || v.status === 'active' || (v.status === 'cancelled' && !!v.number);
    var link = v.mgrSignId ? m.links[v.mgrSignId] : null;
    return {
      id: v.id, type: v.type, typeLabel: (v.status === 'requested' || v.status === 'rejected' ? 'طلب سند ' : 'سند ') + CUS.V_TYPES[v.type],
      number: v.number, date: v.date, custodyId: v.custodyId, custodyLabel: c ? c.periodLabel : '', partyName: v.partyName,
      amount: v.amount, amountInWords: v.amountInWords || Vouchers.amountInWords_(v.amount), reason: reason,
      paymentMethod: v.paymentMethod, paymentMethodLabel: CUS.PAY[v.paymentMethod] || '', chequeNo: v.chequeNo,
      status: v.status, statusLabel: CUS.V_STATUS[v.status] || '', cancelReason: v.cancelReason,
      createdByName: Custody.userName_(m, v.createdBy), createdAt: v.createdAt,
      approved: approved, approvedBy: approved ? approver : '', approvedByName: approved ? Custody.userName_(m, approver) : '',
      approvedAt: approved ? (v.approvedAt || v.createdAt) : '',
      signed: !!v.signedAt, signedAt: v.signedAt, signedNote: v.signedNote, mgrSigned: !!v.mgrSignId, hasSignedFile: !!v.signedFileId,
      signedByName: v.signedBy === CUS.MANAGER ? (link ? link.managerName : 'المدير') + ' (توقيع إلكتروني)' : Custody.userName_(m, v.signedBy),
      isOpening: isOpening, requestedBy: requestedBy || '', requestedByName: Custody.userName_(m, requestedBy), requestedAt: requestedAt || '',
      rejectReason: v.rejectReason, rejectedByName: Custody.userName_(m, v.rejectedBy), rejectedAt: v.rejectedAt,
      signLink: v.status === 'signing' || v.status === 'active' ? Sign.info_('voucher', v.id, m) : null,
      chain: v.status === 'signing' || v.wfInstanceId ? Custody.chainState_('cus.voucher', v.id, v.wfInstanceId, v.status === 'signing' && !v.signedAt) : null
    };
  },

  input_: function (p) {
    var type = Custody.enum_(p.type, CUS.V_TYPES, 'نوع السند');
    var method = Custody.enum_(p.paymentMethod || 'cash', CUS.PAY, 'طريقة الدفع');
    var chequeNo = optionalText(p.chequeNo, 40);
    if (method === 'cheque' && !chequeNo) throw appError('رقم الشيك مطلوب عند الدفع بشيك.');
    var date = p.date ? requireDate_(p.date, 'تاريخ السند') : localDate_();
    if (date > localDate_()) throw appError('تاريخ السند لا يمكن أن يكون في المستقبل.');
    return {
      type: type, date: date, paymentMethod: method, chequeNo: method === 'cheque' ? chequeNo : '',
      partyName: requireText(p.partyName, type === 'receipt' ? 'اسم الدافع' : 'اسم المستلم', 100),
      amount: parseMoney_(p.amount, 'المبلغ', { max: 1000000 }), reason: requireText(p.reason, 'البيان', 300)
    };
  },

  /** ينشئ سنداً اعتمده المحاسب (منشئه) برقم تسلسلي، بانتظار اعتماد المدير (داخلي) */
  create_: function (ctx, d) {
    var now = nowIso();
    var ca = Custody.companyAccountant_();
    var base = {
      type: d.type, date: d.date, custodyId: d.custodyId || '', partyName: d.partyName, amount: d.amount,
      amountInWords: Vouchers.amountInWords_(d.amount), reason: d.reason, paymentMethod: d.paymentMethod || 'cash', chequeNo: d.chequeNo || '',
      createdBy: ctx.user.id, createdAt: now, requestedBy: d.requestedBy || '', requestedAt: d.requestedAt || ''
    };
    if (ca && ca !== ctx.user.id) {
      // أصدره محاسب غير محاسب الشركة: ينتظر اعتماد محاسب الشركة (بلا رقم حتى يعتمده)
      var req = Db.insert('custody', 'Vouchers', Object.assign(base, {
        number: '', status: 'requested', requestedBy: base.requestedBy || ctx.user.id, requestedAt: base.requestedAt || now
      }));
      Audit.log(ctx.user, 'custody', 'voucher.request', 'Voucher', req.id, { type: d.type, amount: kwd_(d.amount), party: d.partyName });
      return req;
    }
    var used = Vouchers.numbers_();
    var number = Custody.serial_(Vouchers.prefix_(d.type), Number(d.date.slice(0, 4)), 4, function (n) { return !!used[n]; });
    var v = Db.insert('custody', 'Vouchers', Object.assign(base, { number: number, status: 'signing', approvedBy: ctx.user.id, approvedAt: now }));
    Audit.log(ctx.user, 'custody', 'voucher.create', 'Voucher', v.id, { number: number, amount: kwd_(v.amount), party: v.partyName });
    return d.deferChain ? v : Vouchers.startChain_(ctx, v);
  },

  /** سند صار «بانتظار اعتماد المدير»: يبدأ سلسلته إن رُبط النوع (وإلا رابط المدير كما هو) */
  startChain_: function (ctx, v) {
    var wf = Workflow.startIfBound_(ctx, 'cus.voucher', v.id, function () {});
    return wf ? Db.update('custody', 'Vouchers', v.id, { wfInstanceId: wf.id }) : v;
  },

  createManual: function (ctx, p) {
    p = p || {};
    var d = Vouchers.input_(p);
    if (p.custodyId) { Custody.getOrThrow_(p.custodyId); d.custodyId = p.custodyId; }
    return Vouchers.view_(withLock(function () { return Vouchers.create_(ctx, d); }), Custody.maps_());
  },

  /** أي مستخدم يطلب سنداً عاماً (بلا رقم حتى يوافق المحاسب) */
  request: function (ctx, p) {
    var d = Vouchers.input_(p || {});
    var now = nowIso();
    var v = Db.insert('custody', 'Vouchers', {
      type: d.type, number: '', date: d.date, partyName: d.partyName, amount: d.amount, amountInWords: Vouchers.amountInWords_(d.amount),
      reason: d.reason, paymentMethod: d.paymentMethod, chequeNo: d.chequeNo, createdBy: ctx.user.id, createdAt: now,
      status: 'requested', requestedBy: ctx.user.id, requestedAt: now
    });
    Audit.log(ctx.user, 'custody', 'voucher.request', 'Voucher', v.id, { type: d.type, amount: kwd_(d.amount), party: d.partyName });
    return Vouchers.view_(v, Custody.maps_());
  },

  /**
   * لماذا لا يعتمد المستخدم هذا السند ('' إن كان يعتمده): لا يعتمد أحد طلبه ولا سند عهدته،
   * والاعتماد لمحاسب الشركة إن حُدِّد، إلا إن كان هو مقدّم الطلب أو صاحب العهدة فيعتمده أي محاسب آخر.
   */
  approveBlock_: function (ctx, v) {
    if (!Custody.isStaff_(ctx)) return 'ليست لديك صلاحية اعتماد السندات.';
    if (v.requestedBy === ctx.user.id) return 'لا يمكنك معالجة طلبك بنفسك، يوافق عليه محاسب آخر.';
    var c = v.custodyId ? Db.get('custody', 'Custodies', v.custodyId) : null;
    if (c && Custody.isOwner_(ctx, c)) return 'لا يمكنك اعتماد سند يخص عهدتك.';
    var ca = Custody.companyAccountant_();
    if (!ca || ca === ctx.user.id) return '';
    var emp = c ? Db.get('core', 'Employees', c.employeeId) : null;
    if (v.requestedBy === ca || (emp && emp.userId === ca)) return '';
    var u = Db.get('core', 'Users', ca);
    return 'يعتمد السند محاسب الشركة (' + (u ? u.fullName : '') + ').';
  },

  assertHandler_: function (ctx, v) {
    if (v.status !== 'requested') throw appError('هذا الطلب تمت معالجته مسبقاً.');
    var why = Vouchers.approveBlock_(ctx, v);
    if (why) throw appError(why, 'FORBIDDEN');
  },

  approve: function (ctx, p) {
    var v = withLock(function () {
      var cur = Db.getOrThrow('custody', 'Vouchers', p && p.id, 'السند');
      Vouchers.assertHandler_(ctx, cur);
      var date = localDate_(), used = Vouchers.numbers_();
      var number = Custody.serial_(Vouchers.prefix_(cur.type), Number(date.slice(0, 4)), 4, function (n) { return !!used[n]; });
      return Vouchers.startChain_(ctx, Db.update('custody', 'Vouchers', cur.id, { number: number, date: date, status: 'signing', approvedBy: ctx.user.id, approvedAt: nowIso() }));
    });
    Audit.log(ctx.user, 'custody', 'voucher.approve', 'Voucher', v.id, { number: v.number, amount: kwd_(v.amount) });
    return Vouchers.view_(v, Custody.maps_());
  },

  reject: function (ctx, p) {
    var v = Db.getOrThrow('custody', 'Vouchers', p && p.id, 'السند');
    Vouchers.assertHandler_(ctx, v);
    var reason = requireText(p.reason, 'سبب الرفض', 300);
    var u = Db.update('custody', 'Vouchers', v.id, { status: 'rejected', rejectReason: reason, rejectedBy: ctx.user.id, rejectedAt: nowIso() });
    Audit.log(ctx.user, 'custody', 'voucher.reject', 'Voucher', v.id, { reason: reason });
    return Vouchers.view_(u, Custody.maps_());
  },

  /** الإلغاء: مدير النظام لأي سند ساري أو طلب، ومقدّم الطلب لطلبه ما دام بانتظار المحاسب */
  cancel: function (ctx, p) {
    var v = Db.getOrThrow('custody', 'Vouchers', p && p.id, 'السند');
    var sup = !!ctx.user.isSuperAdmin, own = v.status === 'requested' && v.requestedBy === ctx.user.id;
    if (!sup && !own) {
      if (v.requestedBy === ctx.user.id) throw appError('لا يمكن إلغاء الطلب بعد معالجته.');
      throw appError('ليست لديك صلاحية إلغاء هذا السند.', 'FORBIDDEN');
    }
    if (v.status === 'cancelled') throw appError('السند ملغي مسبقاً.');
    if (v.status === 'rejected') throw appError('هذا الطلب مرفوض مسبقاً.');
    var reason = own && !String(p.reason || '').trim() ? 'ألغاه مقدّم الطلب' : requireText(p.reason, 'سبب الإلغاء', 300);
    var liveWf = Workflow.liveOf_(v.wfInstanceId);
    if (liveWf) Workflow.cancelFor_(ctx, liveWf.id, reason);
    var u = Db.update('custody', 'Vouchers', v.id, { status: 'cancelled', cancelReason: reason, cancelledBy: ctx.user.id, cancelledAt: nowIso() });
    Audit.log(ctx.user, 'custody', 'voucher.cancel', 'Voucher', v.id, { number: v.number, reason: reason });
    return Vouchers.view_(u, Custody.maps_());
  },

  canSee_: function (ctx, v, mine) {
    if (Custody.isStaff_(ctx) || v.requestedBy === ctx.user.id) return true;
    return !!(v.custodyId && mine[v.custodyId]);
  },

  mine_: function (ctx) {
    var me = Custody.me_(ctx), o = {};
    if (me) Custody.rows_('Custodies').forEach(function (c) { if (c.employeeId === me.id) o[c.id] = true; });
    return o;
  },

  list: function (ctx, p) {
    p = p || {};
    var q = String(p.q || '').trim(), mine = Vouchers.mine_(ctx), m = Custody.maps_();
    return Custody.rows_('Vouchers').filter(function (v) {
      return Vouchers.canSee_(ctx, v, mine) && (!p.type || v.type === p.type) && (!p.status || v.status === p.status) &&
        (!p.custodyId || v.custodyId === p.custodyId) && (!q || (v.number + ' ' + v.partyName + ' ' + v.reason).indexOf(q) >= 0);
    }).sort(function (a, b) {
      var rank = function (x) { return x.status === 'requested' ? 0 : x.status === 'signing' ? 1 : 2; };
      return rank(a) - rank(b) || b.date.localeCompare(a.date) ||
        (b.number || '').localeCompare(a.number || '') || (b.createdAt || '').localeCompare(a.createdAt || '');
    }).map(function (v) { var x = Vouchers.view_(v, m); x.canApprove = v.status === 'requested' && !Vouchers.approveBlock_(ctx, v); return x; });
  },

  /** السند للطباعة مع خانات التوقيع */
  get: function (ctx, p) {
    var v = Db.get('custody', 'Vouchers', p && p.id);
    if (!v || !Vouchers.canSee_(ctx, v, Vouchers.mine_(ctx))) throw appError('السند غير موجود.', 'NOT_FOUND');
    var m = Custody.maps_(), view = Vouchers.view_(v, m);
    var c = v.custodyId ? Db.get('custody', 'Custodies', v.custodyId) : null;
    var boxes = [];
    if (view.requestedBy) boxes.push({ label: 'مقدّم الطلب', name: view.requestedByName, image: Custody.signatureOf_(view.requestedBy) });
    var emp = c ? m.emps[c.employeeId] : null;
    var receiver = v.type === 'payment' && c && c.openVoucherId === v.id && c.receivedAt && emp ? Custody.signatureOf_(emp.userId) : '';
    boxes.push({ label: v.type === 'payment' ? 'المستلم' : 'الدافع', name: v.partyName, image: receiver });
    boxes.push({ label: 'المحاسب', name: view.approvedByName, image: view.approved ? Custody.signatureOf_(view.approvedBy) : '' });
    var link = v.mgrSignId ? m.links[v.mgrSignId] : null;
    boxes.push(v.wfInstanceId && v.signedBy && v.signedBy !== CUS.MANAGER ? Object.assign({ label: 'المدير' }, Custody.chainSigner_(v.signedBy, m))
      : { label: 'المدير', name: link ? link.managerName : Custody.settings_().managerName, image: Custody.managerImage_(link) });
    return { company: Settings.company_(), voucher: view, signs: boxes };
  }
};

// ───────── توقيع الإدارة عبر رابط ─────────
var Sign = {
  hash_: function (token) { return sha256Hex_('sign:' + token); },

  target_: function (kind, id) {
    if (kind === 'voucher') {
      var v = Db.getOrThrow('custody', 'Vouchers', id, 'السند');
      return { kind: kind, id: v.id, voucher: v, label: 'سند ' + CUS.V_TYPES[v.type] + ' ' + (v.number || ''), amount: v.amount };
    }
    var c = Custody.getOrThrow_(id);
    var emp = Db.get('core', 'Employees', c.employeeId);
    return { kind: kind, id: c.id, custody: c, label: 'كشف تسوية العهدة ' + c.id + ' (' + (emp ? emp.fullName : '') + ')', amount: c.totalSpent };
  },

  error_: function (t) {
    if (t.kind === 'voucher') {
      if (t.voucher.status === 'cancelled') return 'السند ملغي';
      if (t.voucher.status === 'rejected') return 'طلب السند مرفوض';
      if (t.voucher.status === 'requested') return 'السند لم يعتمده المحاسب بعد';
      if (t.voucher.signedAt || t.voucher.status !== 'signing') return 'السند معتمد من الإدارة مسبقاً';
      return '';
    }
    if (t.custody.status === 'closed') return 'العهدة مغلقة نهائياً مسبقاً';
    if (t.custody.status !== 'signing') return 'العهدة لم يعتمد المحاسب إقفالها بعد';
    return '';
  },

  /** آخر رابط أُرسل لمستند وحالته: open · expired · signed · rejected · revoked */
  info_: function (kind, id, m) {
    var list = Custody.rows_('SignLinks').filter(function (l) { return l.kind === kind && l.targetId === id; });
    if (!list.length) return null;
    var l = list[list.length - 1];
    return {
      status: l.status === 'open' && l.expiresAt < nowIso() ? 'expired' : l.status, createdAt: l.createdAt, expiresAt: l.expiresAt,
      actedAt: l.actedAt, rejectReason: l.rejectReason, managerName: l.managerName, sentByName: Custody.userName_(m, l.createdBy)
    };
  },

  /** رابط جديد للمدير (يُبطل السابق لنفس المستند). الواجهة تبني الرابط من الرمز */
  create: function (ctx, p) {
    p = p || {};
    var kind = Custody.enum_(p.kind, CUS.SIGN_KINDS, 'نوع المستند');
    var t = Sign.target_(kind, p.id);
    var err = Sign.error_(t);
    if (err) throw appError(err + '، لا يُرسل للتوقيع.');
    if (Workflow.liveOf_(kind === 'voucher' ? t.voucher.wfInstanceId : t.custody.closeWfInstanceId)) throw appError('المستند في سلسلة اعتماد داخل النظام، والقرار من صفحة السلسلة.');
    var cfg = Custody.settings_();
    var managerName = cfg.managerName || 'المدير';
    var token = randomToken_();
    var expiresAt = new Date(Date.now() + CUS.SIGN_DAYS * 86400000).toISOString();
    withLock(function () {
      Custody.rows_('SignLinks').filter(function (l) { return l.kind === kind && l.targetId === t.id && l.status === 'open'; })
        .forEach(function (l) { Db.update('custody', 'SignLinks', l.id, { status: 'revoked' }); });
      Db.insert('custody', 'SignLinks', {
        kind: kind, targetId: t.id, tokenHash: Sign.hash_(token), managerName: managerName, createdBy: ctx.user.id,
        createdAt: nowIso(), expiresAt: expiresAt, status: 'open'
      });
    });
    Audit.log(ctx.user, 'custody', 'sign.send', kind === 'voucher' ? 'Voucher' : 'Custody', t.id, { label: t.label, to: managerName });
    return { token: token, label: t.label, amount: t.amount, expiresAt: expiresAt, managerName: managerName, phone: cfg.managerPhone };
  },

  byToken_: function (token) {
    token = String(token || '');
    if (!/^[0-9a-f]{64}$/.test(token)) throw appError('رابط التوقيع غير صالح.', 'BAD_LINK');
    var h = Sign.hash_(token);
    var l = Custody.rows_('SignLinks').filter(function (x) { return x.tokenHash === h; })[0];
    if (!l) throw appError('رابط التوقيع غير صالح.', 'BAD_LINK');
    if (l.status === 'signed') throw appError('تم التوقيع على هذا المستند بهذا الرابط مسبقاً، شكراً لك.', 'USED');
    if (l.status === 'rejected') throw appError('تم رفض هذا المستند بهذا الرابط مسبقاً.', 'USED');
    if (l.status === 'revoked') throw appError('هذا الرابط لم يعد صالحاً لأن رابطاً أحدث أُرسل لنفس المستند.', 'REVOKED');
    if (l.expiresAt < nowIso()) throw appError('انتهت صلاحية الرابط، اطلب من المحاسب إرسال رابط جديد.', 'EXPIRED');
    return l;
  },

  /** ما يراه المدير: المستند كاملاً للطباعة/المعاينة */
  view: function (ctx, p) {
    var l = Sign.byToken_(p && p.token);
    var t = Sign.target_(l.kind, l.targetId);
    var err = Sign.error_(t);
    if (err) throw appError(err + '، لا حاجة لتوقيعك على هذا الرابط.', 'NOT_SIGNABLE');
    var sys = { user: { id: '', isSuperAdmin: true }, roles: {} };
    var doc = l.kind === 'voucher' ? Vouchers.get(sys, { id: t.id }) : Custody.statement(sys, { id: t.id });
    return { kind: l.kind, kindLabel: CUS.SIGN_KINDS[l.kind], title: t.label, amount: t.amount, managerName: l.managerName, expiresAt: l.expiresAt, doc: doc };
  },

  submit: function (ctx, p) {
    p = p || {};
    var data = Custody.signatureData_(p.data);
    var res = withLock(function () {
      var l = Sign.byToken_(p.token);
      var t = Sign.target_(l.kind, l.targetId);
      var err = Sign.error_(t);
      if (err) throw appError(err + '.', 'NOT_SIGNABLE');
      var now = nowIso();
      Db.update('custody', 'SignLinks', l.id, { status: 'signed', actedAt: now, signatureData: data });
      if (t.kind === 'voucher') {
        Db.update('custody', 'Vouchers', t.id, { mgrSignId: l.id, signedAt: now, signedBy: CUS.MANAGER, status: 'active' });
        if (t.voucher.custodyId) Custody.advanceOpen_(Db.get('custody', 'Custodies', t.voucher.custodyId), t.id);
      } else {
        Db.update('custody', 'Custodies', t.id, { status: 'closed', closeSignedAt: now, closeSignedBy: CUS.MANAGER, closeMgrSignId: l.id });
      }
      return { link: l, target: t };
    });
    Audit.log({ id: CUS.MANAGER, fullName: res.link.managerName }, 'custody', 'sign.manager', res.target.kind === 'voucher' ? 'Voucher' : 'Custody', res.target.id, { label: res.target.label });
    var msg = res.target.kind === 'voucher' ? 'تم اعتماد ' + res.target.label + ' وأصبح سارياً، شكراً لك.' : 'تم التوقيع على ' + res.target.label + '، شكراً لك.';
    return { title: res.target.label, message: msg };
  },

  reject: function (ctx, p) {
    p = p || {};
    var reason = requireText(p.reason, 'سبب الرفض', 300);
    var res = withLock(function () {
      var l = Sign.byToken_(p.token);
      var t = Sign.target_(l.kind, l.targetId);
      var err = Sign.error_(t);
      if (err) throw appError(err + '.', 'NOT_SIGNABLE');
      Db.update('custody', 'SignLinks', l.id, { status: 'rejected', actedAt: nowIso(), rejectReason: reason });
      return { link: l, target: t };
    });
    Audit.log({ id: CUS.MANAGER, fullName: res.link.managerName }, 'custody', 'sign.managerReject', res.target.kind === 'voucher' ? 'Voucher' : 'Custody', res.target.id, { label: res.target.label, reason: reason });
    return { title: res.target.label, message: 'تم إرسال الرفض وسببه إلى المحاسب.' };
  }
};
