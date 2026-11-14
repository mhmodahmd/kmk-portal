/**
 * خادم التطوير المحلي (npm run dev:mock): يشغّل كود server/ الحقيقي داخل المتصفح
 * عبر محاكي خدمات Apps Script، فتُختبر الواجهة على نفس منطق الخادم تماماً.
 * البيانات تُحفظ في متصفح المطوّر فقط. لا يدخل هذا الملف في نسخة الإنتاج.
 */
import { createGas, loadServer, type Gas, type LoadedServer } from '../../../server/test/gas-emulator.js';
import './mock-device';

const files = import.meta.glob(['../../../server/core/*.js', '../../../server/modules/**/*.js'], {
  query: '?raw', import: 'default', eager: true
}) as Record<string, string>;

const KEY = 'kmk.mockgas';
const storage = {
  load() { try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } },
  save(state: unknown) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* المساحة ممتلئة */ } }
};

let instance: { gas: Gas; srv: LoadedServer } | null = null;
function server() {
  if (!instance) {
    const gas = createGas({ storage });
    const sources = Object.entries(files).map(([path, code]) => ({ path: path.replace('../../../server/', ''), code }));
    instance = { gas, srv: loadServer(sources, gas.globals) };
  }
  return instance;
}

type Req = { action: string; token: string; payload: unknown; v?: string };

export async function mockHandle(req: Req) {
  await new Promise((r) => setTimeout(r, 150 + Math.random() * 200));
  const { gas, srv } = server();
  const res = srv.Router.handle(JSON.parse(JSON.stringify(req)));
  gas.flush();
  return JSON.parse(JSON.stringify(res));
}

/**
 * بيانات تجريبية لشركة صغيرة. من وحدة تحكم المتصفح: await kmkSeed()
 * المدير: admin / admin1234 · الموظفون: sara, ahmad, huda بكلمة المرور pass12345
 */
async function seed() {
  const call = async (action: string, payload: unknown = {}, token = '') => {
    const r = await mockHandle({ action, payload, token, v: '9.9.9' });
    if (!r.ok) throw new Error(action + ': ' + r.error.message);
    return r.data;
  };
  const status = await call('system.status');
  if (!status.needsSetup) throw new Error('توجد بيانات مسبقاً. امسح localStorage أولاً: localStorage.removeItem("' + KEY + '")');
  const A = (await call('auth.setup', { username: 'admin', fullName: 'مدير النظام', password: 'admin1234', companyName: 'شركة كي ام كي' })).token;
  const shift = await call('hr.shift.save', { name: 'الدوام الصباحي', start: '08:00', end: '16:00', graceMin: 10, workDays: '0,1,2,3,4' }, A);
  const branch = await call('hr.branch.save', { name: 'المقر الرئيسي', address: 'الكويت', lat: '29.3759', lng: '47.9774', geoRadius: 200 }, A);
  const sara = await call('hr.employee.save', { fullName: 'سارة العلي', jobTitle: 'مديرة التصميم', shiftId: shift.id, branchId: branch.id, hireDate: '2024-02-01', phone: '55512345', residencyExpiry: '2026-12-20' }, A);
  const dept = await call('hr.dept.save', { name: 'التصميم', managerId: sara.id }, A);
  await call('hr.employee.save', { id: sara.id, fullName: sara.fullName, jobTitle: sara.jobTitle, shiftId: shift.id, branchId: branch.id, departmentId: dept.id, hireDate: '2024-02-01', phone: '55512345', residencyExpiry: '2026-12-20' }, A);
  const ahmad = await call('hr.employee.save', { fullName: 'أحمد سالم', jobTitle: 'مصمم جرافيك', shiftId: shift.id, departmentId: dept.id, branchId: branch.id, hireDate: '2025-05-10', passportExpiry: '2027-01-05' }, A);
  const huda = await call('hr.employee.save', { fullName: 'هدى الكندري', jobTitle: 'أخصائية موارد بشرية', shiftId: shift.id, branchId: branch.id, hireDate: '2023-09-01' }, A);
  await call('hr.employee.save', { fullName: 'يوسف ناصر', jobTitle: 'منسق مشاريع', shiftId: shift.id, departmentId: dept.id, branchId: branch.id, hireDate: '2026-03-15' }, A);
  await call('hr.holiday.save', { name: 'العيد الوطني', date: '2027-02-25', dateTo: '2027-02-26' }, A);
  const list = async () => (await call('users.list', {}, A)).users as { id: string; username: string }[];
  for (const [emp, username] of [[sara, 'sara'], [ahmad, 'ahmad'], [huda, 'huda']] as const) {
    const r = await call('hr.employee.account', { id: emp.id, action: 'create', username }, A);
    const login = await call('auth.login', { username, password: r.tempPassword });
    await call('auth.changePassword', { current: r.tempPassword, next: 'pass12345' }, login.token);
  }
  const hudaUser = (await list()).find((u) => u.username === 'huda')!;
  await call('users.setRoles', { id: hudaUser.id, roles: { attendance: 'hr', hr: 'hr' } }, A);
  return 'تم: admin / admin1234 · sara, ahmad, huda / pass12345';
}

(globalThis as unknown as { kmkSeed: typeof seed }).kmkSeed = seed;
