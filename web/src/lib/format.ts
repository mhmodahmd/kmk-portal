/** التنسيقات المحلية (docs/02 §10): أرقام إنجليزية، تاريخ dd/mm/yyyy، وقت 12 ساعة، توقيت الكويت. */
import { IS_EN } from './i18n';

const TZ = 'Asia/Kuwait';

const DAYS = IS_EN ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  : ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const AM = IS_EN ? 'AM' : 'ص', PM = IS_EN ? 'PM' : 'م';

function parts(d: Date) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short'
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value || '';
  const wk = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { y: get('year'), m: get('month'), d: get('day'), h: Number(get('hour')) % 24, min: get('minute'), wk };
}

export function formatDate(iso: string | Date) {
  if (!iso) return '';
  const p = parts(new Date(iso));
  return `${p.d}/${p.m}/${p.y}`;
}

export function formatTime(iso: string | Date) {
  if (!iso) return '';
  const p = parts(new Date(iso));
  const h12 = p.h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${p.min} ${p.h < 12 ? AM : PM}`;
}

export function formatDateTime(iso: string) {
  return iso ? `${formatDate(iso)} · ${formatTime(iso)}` : '';
}

export function todayLabel() {
  const p = parts(new Date());
  return `${DAYS[p.wk]} ${p.d}/${p.m}/${p.y}`;
}

export function greeting() {
  const h = parts(new Date()).h;
  if (IS_EN) return h < 12 ? 'Good morning' : 'Good evening';
  return h < 12 ? 'صباح الخير' : 'مساء الخير';
}

export function relativeTime(iso: string) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (IS_EN) {
    if (diff < 1) return 'just now';
    if (diff < 60) return `${Math.round(diff)} min ago`;
    if (diff < 1440) return `${Math.round(diff / 60)} h ago`;
    if (diff < 2880) return 'yesterday';
    return formatDate(iso);
  }
  if (diff < 1) return 'الآن';
  if (diff < 60) return `قبل ${Math.round(diff)} دقيقة`;
  if (diff < 1440) return `قبل ${Math.round(diff / 60)} ساعة`;
  if (diff < 2880) return 'أمس';
  return formatDate(iso);
}

/** أول حرف من الاسم للصورة الرمزية */
export function initial(name: string) {
  return (name || '؟').trim().charAt(0);
}

/** دقائق ← "7:05" */
export function hm(minutes: number) {
  const m = Math.max(0, Math.round(minutes || 0));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** مدة مختصرة: "7 س 5 د" */
export function duration(minutes: number) {
  const m = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(m / 60), r = m % 60;
  const H = IS_EN ? 'h' : 'س', M = IS_EN ? 'm' : 'د';
  if (!h) return `${r} ${M}`;
  return r ? `${h} ${H} ${r} ${M}` : `${h} ${H}`;
}

const MONTHS = IS_EN ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] : ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export function monthLabel(month: string) {
  const [y, m] = month.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

/** yyyy-mm-dd بتوقيت الكويت */
export function kwDate(d: Date = new Date()) {
  const p = parts(d);
  return `${p.y}-${p.m}-${p.d}`;
}
export const kwMonth = () => kwDate().slice(0, 7);

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** "15/11/2026" من "2026-11-15" */
export function dmy(ds: string) {
  if (!ds) return '';
  const [y, m, d] = ds.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * دالة العرض الموحّدة لأي تاريخ يصل من الخادم: يوم/شهر/سنة دائماً.
 * "2026-11-15" ← "15/11/2026"، و"2026-11-15 14:05" (وقت الكويت المحلي) ← "15/11/2026 · 02:05 م"،
 * والطابع الزمني الكامل ISO يُحوَّل إلى توقيت الكويت. غير ذلك يُعاد كما هو.
 */
export function dateText(s: string | null | undefined, withTime = true) {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return dmy(s);
  const local = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(:\d{2})?$/.exec(s);
  if (local) {
    if (!withTime) return dmy(local[1]);
    const h = Number(local[2]), h12 = h % 12 || 12;
    return `${dmy(local[1])} · ${String(h12).padStart(2, '0')}:${local[3]} ${h < 12 ? AM : PM}`;
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) return s;
  return withTime ? formatDateTime(s) : formatDate(s);
}

/** الأرقام العربية الهندية والفارسية ← لاتينية */
const latinDigits = (s: string) => s.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0));

/**
 * ما يكتبه المستخدم ← yyyy-mm-dd، أو '' إن لم يكن تاريخاً صحيحاً.
 * يقبل 15/11/2026 و15-11-2026 و15.11.2026 و1/2/2026 و15112026، وبالأرقام العربية.
 */
export function parseDmy(input: string) {
  const s = latinDigits(input).trim();
  const m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(s) || /^(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (!m) return '';
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 1900 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** تنسيق أثناء الكتابة: الأرقام وحدها تُفصل بشرطة مائلة تلقائياً (15 ← 15/، 1511 ← 15/11) */
export function typingDmy(input: string) {
  const s = latinDigits(input).replace(/[^\d/.\-]/g, '');
  if (!/^(\d{2}\/){0,2}\d*$/.test(s)) return s.slice(0, 10);
  const d = s.replace(/\D/g, '').slice(0, 8);
  return d.length <= 2 ? d : d.length <= 4 ? `${d.slice(0, 2)}/${d.slice(2)}` : `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export function daysWord(n: number) {
  if (IS_EN) return n === 1 ? '1 day' : `${n} days`;
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومان';
  return n >= 3 && n <= 10 ? `${n} أيام` : `${n} يوماً`;
}

export function weekdayName(ds: string) {
  const [y, m, d] = ds.split('-').map(Number);
  return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
