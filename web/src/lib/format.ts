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
