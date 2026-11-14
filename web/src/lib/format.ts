/** التنسيقات المحلية (docs/02 §10): أرقام إنجليزية، تاريخ dd/mm/yyyy، وقت 12 ساعة، توقيت الكويت. */
const TZ = 'Asia/Kuwait';

const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

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
  return `${String(h12).padStart(2, '0')}:${p.min} ${p.h < 12 ? 'ص' : 'م'}`;
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
  return h < 12 ? 'صباح الخير' : 'مساء الخير';
}

export function relativeTime(iso: string) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
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
