/**
 * خادم وهمي للتطوير المحلي فقط (npm run dev:mock).
 * يحاكي نفس إجراءات server/ ويحفظ البيانات في متصفح المطوّر.
 */
type Row = Record<string, any>;
interface MockDb { users: Row[]; roles: Row[]; audit: Row[]; company: Row | null; sessions: Record<string, string> }

const KEY = 'kmk.mockdb';
const MODULES = [
  { key: 'attendance', label: 'الحضور والانصراف', enabled: false, roles: { employee: 'موظف', viewer: 'مشاهد', hr: 'الموارد البشرية' } },
  { key: 'hr', label: 'الموارد البشرية', enabled: false, roles: { employee: 'موظف', hr: 'الموارد البشرية' } },
  { key: 'custody', label: 'العهد والنثريات', enabled: false, roles: { holder: 'صاحب عهدة', accountant: 'محاسب' } },
  { key: 'tasks', label: 'المهام', enabled: false, roles: { member: 'عضو', manager: 'مدير مهام' } },
  { key: 'crm', label: 'العملاء', enabled: false, roles: { sales: 'مبيعات', manager: 'مدير مبيعات' } },
  { key: 'finance', label: 'المالية', enabled: false, roles: { viewer: 'مشاهد', accountant: 'محاسب', fmanager: 'مدير مالي' } }
] as const;

function load(): MockDb {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* تجاهل */ }
  return { users: [], roles: [], audit: [], company: null, sessions: {} };
}
function save(db: MockDb) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* تجاهل */ } }

const id = () => Math.random().toString(36).slice(2, 12);
const now = () => new Date().toISOString();
class E extends Error { code: string; constructor(m: string, c = 'BAD_REQUEST') { super(m); this.code = c; } }

const pub = (u: Row) => ({
  id: u.id, username: u.username, fullName: u.fullName, jobTitle: u.jobTitle || '', phone: u.phone || '', email: u.email || '',
  active: u.active, isSuperAdmin: u.isSuperAdmin, mustChangePassword: !!u.mustChangePassword, lastLogin: u.lastLogin || '', locked: false
});
const rolesOf = (db: MockDb, userId: string) => Object.fromEntries(db.roles.filter((r) => r.userId === userId).map((r) => [r.module, r.role]));
const log = (db: MockDb, u: Row | null, action: string, entityId = '', details: unknown = null) =>
  db.audit.push({ id: id(), ts: now(), userId: u?.id || '', userName: u?.fullName || '', module: 'core', action, entity: 'User', entityId, details });

function validatePw(pw: string) {
  if (!pw || pw.length < 8) throw new E('كلمة المرور 8 أحرف على الأقل.');
  if (!/[0-9]/.test(pw) || !/[A-Za-z؀-ۿ]/.test(pw)) throw new E('كلمة المرور يجب أن تحتوي حروفاً وأرقاماً.');
}
function username(v: string) {
  const u = String(v || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(u)) throw new E('اسم المستخدم من 3 إلى 32 حرفاً إنجليزياً أو أرقام أو . _ - بلا مسافات.');
  return u;
}
function sessionFor(db: MockDb, u: Row, remember: boolean) {
  const token = id() + id();
  db.sessions[token] = u.id;
  return { token, deviceToken: remember ? 'dev.' + u.id : '', user: pub(u), roles: rolesOf(db, u.id) };
}
function setRoles(db: MockDb, userId: string, roles: Record<string, string>) {
  db.roles = db.roles.filter((r) => r.userId !== userId);
  Object.entries(roles || {}).forEach(([module, role]) => { if (role) db.roles.push({ id: id(), userId, module, role }); });
}
const temp = () => Math.random().toString(36).slice(2, 8) + Math.floor(1000 + Math.random() * 8999);

const routes: Record<string, { public?: boolean; super?: boolean; fn: (db: MockDb, p: any, u: Row) => any }> = {
  'system.status': { public: true, fn: (db) => ({ app: 'بوابة KMK', version: '0.1.0', needsSetup: db.users.length === 0, company: db.company?.name || 'شركة كي ام كي' }) },
  'auth.setup': {
    public: true, fn: (db, p) => {
      if (db.users.length) throw new E('تم إعداد النظام مسبقاً.');
      if (!p.fullName) throw new E('أدخل الاسم الكامل.');
      validatePw(p.password);
      const u = { id: id(), username: username(p.username), fullName: p.fullName, jobTitle: p.jobTitle || 'مدير النظام', active: true, isSuperAdmin: true, password: p.password, lastLogin: now() };
      db.users.push(u);
      if (p.companyName) db.company = { name: p.companyName, address: '', phone: '' };
      log(db, u, 'system.setup', u.id);
      return sessionFor(db, u, !!p.remember);
    }
  },
  'auth.login': {
    public: true, fn: (db, p) => {
      const u = db.users.find((x) => x.username === String(p.username || '').trim().toLowerCase());
      if (!u || !u.active || u.password !== p.password) throw new E('اسم المستخدم أو كلمة المرور غير صحيحة.', 'BAD_LOGIN');
      u.lastLogin = now();
      return sessionFor(db, u, !!p.remember);
    }
  },
  'auth.resume': {
    public: true, fn: (db, p) => {
      const u = db.users.find((x) => 'dev.' + x.id === p.deviceToken);
      if (!u) throw new E('انتهت صلاحية الدخول المحفوظ. سجّل الدخول من جديد.', 'SESSION_EXPIRED');
      return sessionFor(db, u, false);
    }
  },
  'auth.me': { fn: (db, _p, u) => ({ user: pub(u), roles: rolesOf(db, u.id) }) },
  'auth.logout': { fn: () => true },
  'auth.changePassword': {
    fn: (db, p, u) => {
      if (p.current !== u.password) throw new E('كلمة المرور الحالية غير صحيحة.');
      validatePw(p.next);
      if (p.next === p.current) throw new E('اختر كلمة مرور مختلفة عن الحالية.');
      u.password = p.next; u.mustChangePassword = false;
      log(db, u, 'user.changePassword', u.id);
      return { user: pub(u), deviceToken: p.remember ? 'dev.' + u.id : '' };
    }
  },
  'home.summary': {
    fn: (db, _p, u) => ({
      user: pub(u), roles: rolesOf(db, u.id), inboxCount: 0, cards: [],
      modules: MODULES.map((m) => ({ key: m.key, label: m.label, enabled: m.enabled, role: u.isSuperAdmin ? 'super' : rolesOf(db, u.id)[m.key] || null })).filter((m) => m.role),
      setup: u.isSuperAdmin ? { hasCompany: !!db.company, usersCount: db.users.length, rolesCount: db.roles.length, companyName: db.company?.name || 'شركة كي ام كي' } : null
    })
  },
  'inbox.list': { fn: () => [] },
  'settings.get': { fn: (db) => ({ company: db.company || { name: 'شركة كي ام كي', address: '', phone: '' } }) },
  'settings.update': { super: true, fn: (db, p, u) => { if (!p.company?.name) throw new E('أدخل اسم الشركة.'); db.company = p.company; log(db, u, 'settings.update', 'company', p.company); return { company: db.company }; } },
  'audit.list': {
    super: true, fn: (db, p) => {
      const rows = [...db.audit].reverse();
      const size = p.pageSize || 50, page = p.page || 1;
      return { total: rows.length, page, pageSize: size, rows: rows.slice((page - 1) * size, page * size) };
    }
  },
  'users.list': {
    super: true, fn: (db) => ({
      users: db.users.map((u) => ({ ...pub(u), roles: rolesOf(db, u.id), createdAt: '' })),
      modules: MODULES.map((m) => ({ key: m.key, label: m.label, enabled: m.enabled, roles: Object.entries(m.roles).map(([key, label]) => ({ key, label })) }))
    })
  },
  'users.create': {
    super: true, fn: (db, p, actor) => {
      const un = username(p.username);
      if (db.users.some((x) => x.username === un)) throw new E('اسم المستخدم مستخدم من قبل. اختر اسماً آخر.');
      if (!p.fullName) throw new E('أدخل الاسم الكامل.');
      const t = temp();
      const u = { id: id(), username: un, fullName: p.fullName, jobTitle: p.jobTitle || '', phone: p.phone || '', email: p.email || '', active: true, isSuperAdmin: !!p.isSuperAdmin, password: t, mustChangePassword: true };
      db.users.push(u);
      setRoles(db, u.id, p.roles);
      log(db, actor, 'user.create', u.id, { username: un });
      return { user: { ...pub(u), roles: rolesOf(db, u.id) }, tempPassword: t };
    }
  },
  'users.update': {
    super: true, fn: (db, p, actor) => {
      const u = db.users.find((x) => x.id === p.id);
      if (!u) throw new E('المستخدم غير موجود.');
      const admins = db.users.filter((x) => x.active && x.isSuperAdmin).length;
      if (u.isSuperAdmin && u.active && (!p.isSuperAdmin || p.active === false) && admins <= 1) throw new E('يجب أن يبقى مدير نظام نشط واحد على الأقل.');
      if (u.id === actor.id && p.active === false) throw new E('لا يمكنك تعطيل حسابك بنفسك.');
      Object.assign(u, { fullName: p.fullName, jobTitle: p.jobTitle, phone: p.phone, email: p.email, active: p.active !== false, isSuperAdmin: !!p.isSuperAdmin });
      if (p.roles) setRoles(db, u.id, p.roles);
      log(db, actor, 'user.update', u.id);
      return { ...pub(u), roles: rolesOf(db, u.id) };
    }
  },
  'users.resetPassword': { super: true, fn: (db, p, actor) => { const u = db.users.find((x) => x.id === p.id)!; const t = temp(); u.password = t; u.mustChangePassword = true; log(db, actor, 'user.resetPassword', u.id); return { tempPassword: t }; } },
  'users.unlock': { super: true, fn: () => true },
  'users.setRoles': { super: true, fn: (db, p) => { setRoles(db, p.id, p.roles); return rolesOf(db, p.id); } }
};

export async function mockHandle(req: { action: string; token: string; payload: any }) {
  await new Promise((r) => setTimeout(r, 250 + Math.random() * 250));
  const db = load();
  try {
    const route = routes[req.action];
    if (!route) throw new E('إجراء غير معروف.', 'UNKNOWN_ACTION');
    let user: Row = {};
    if (!route.public) {
      const uid = db.sessions[req.token];
      const found = db.users.find((u) => u.id === uid && u.active);
      if (!found) throw new E('انتهت الجلسة. سجّل الدخول من جديد.', 'SESSION_EXPIRED');
      if (found.mustChangePassword && !req.action.startsWith('auth.')) throw new E('غيّر كلمة المرور أولاً.', 'MUST_CHANGE_PASSWORD');
      if (route.super && !found.isSuperAdmin) throw new E('هذا الإجراء لمدير النظام فقط.', 'FORBIDDEN');
      user = found;
    }
    const data = route.fn(db, req.payload || {}, user);
    save(db);
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: { code: e.code || 'INTERNAL', message: e.message } };
  }
}
