/**
 * لغة الواجهة: العربية (الأصل) أو الإنجليزية.
 *
 * - النصوص تُكتب بالعربي داخل tr('...') وتُترجم من i18n-en.ts، والناقص يظهر بالعربي.
 * - المتغيرات بـ {0} {1}: tr('سُجّل {0} من {1}', a, b).
 * - تغيير اللغة يعيد تحميل الصفحة، فتُقرأ اللغة مرة واحدة عند التشغيل (حتى الثوابت على مستوى الملف).
 * - رسائل الخادم وتسمياته تُترجم في lib/api عبر trServer و trData.
 * - فحص النصوص الناقصة: npm run i18n:check
 */
import EN, { EN_PATTERNS } from './i18n-en';

export type Lang = 'ar' | 'en';
const KEY = 'kmk.lang';

export const LANG: Lang = (() => {
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'ar'; } catch { return 'ar'; }
})();
export const IS_EN = LANG === 'en';
/** محلية التنسيق للتواريخ والأرقام */
export const LOCALE = IS_EN ? 'en-GB' : 'ar-KW';

const fill = (s: string, args: unknown[]) => (args.length ? s.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? '')) : s);

export function tr(ar: string, ...args: unknown[]): string {
  return fill(IS_EN ? EN[ar] ?? ar : ar, args);
}

export function setLang(lang: Lang) {
  try { localStorage.setItem(KEY, lang); } catch { /* لا تخزين */ }
  location.reload();
}

/** يطبّق اللغة والاتجاه على الصفحة عند التشغيل */
export function applyLang() {
  document.documentElement.lang = LANG;
  document.documentElement.dir = IS_EN ? 'ltr' : 'rtl';
}

/** رسالة من الخادم: مطابقة تامة، ثم قوالب فيها متغيرات */
export function trServer(msg: string): string {
  if (!IS_EN || !msg) return msg;
  if (EN[msg]) return EN[msg];
  for (const p of COMPILED) {
    const m = p.re.exec(msg);
    if (m) return p.en.replace(/\{(\d+)\}/g, (_, i) => trServer(m[Number(i) + 1] || ''));
  }
  return msg;
}

/** يترجم تسميات الخادم داخل البيانات (الحالات، أسماء الأيام، أنواع الطلبات…) بالمطابقة التامة فقط */
export function trData<T>(data: T): T {
  if (!IS_EN) return data;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v && /[؀-ۿ]/.test(v) ? trServer(v) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(v as object)) o[k] = SKIP_FIELDS.has(k) ? (v as Record<string, unknown>)[k] : walk((v as Record<string, unknown>)[k]);
      return o;
    }
    return v;
  };
  return walk(data) as T;
}

/** حقول يكتبها المستخدمون أو أسماء لا تُترجم */
const SKIP_FIELDS = new Set(['username', 'amountInWords', 'note', 'reason', 'notes', 'address', 'decisionNote', 'managerNote', 'revokeReason', 'emergencyName', 'description', 'body', 'text']);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const COMPILED = Object.entries(EN_PATTERNS).map(([ar, en]) => ({
  re: new RegExp('^' + ar.split(/\{\d+\}/).map(esc).join('(.+?)') + '$'),
  en
}));
