/** رفع الملفات وعرضها (المرفقات والنسخ الموقّعة) */
import { api, ApiError } from '../../lib/api';
import { tr } from '../../lib/i18n';

export const ACCEPT = 'image/*,application/pdf';
const MAX = 10 * 1024 * 1024;
/** المستندات: Office والنصوص فوق الصور و PDF، حتى 25 ميجابايت (Files.DOCS في الخادم) */
export const DOC_ACCEPT = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';
export const DOC_MAX = 25 * 1024 * 1024;

const readB64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => reject(new Error(tr("تعذّرت قراءة الملف.")));
  r.readAsDataURL(blob);
});

/** صور الجوال الكبيرة تُصغَّر (≤ 1800 بكسل، JPEG) قبل الرفع؛ PDF وHEIC كما هي */
async function shrink(file: File): Promise<{ blob: Blob; name: string; type: string }> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 900_000) return { blob: file, name: file.name, type: file.type };
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return { blob: file, name: file.name, type: file.type };
    return { blob, name: file.name.replace(/\.\w+$/, '') + '.jpg', type: 'image/jpeg' };
  } catch { return { blob: file, name: file.name, type: file.type }; }
}

export async function filePayload(file: File, max = MAX) {
  const s = await shrink(file);
  if (s.blob.size > max) throw new Error(max === DOC_MAX ? tr("حجم الملف يتجاوز 25 ميجابايت.") : tr("حجم الملف يتجاوز 10 ميجابايت."));
  const type = s.type || (/\.pdf$/i.test(s.name) ? 'application/pdf' : /\.hei[cf]$/i.test(s.name) ? 'image/heic' : '');
  return { fileName: s.name, mimeType: type, data: await readB64(s.blob) };
}

/** يعرض ملفاً من الخادم في نافذة جديدة (تُفتح فوراً حتى لا يمنعها المتصفح) */
export async function openFile(action: string, payload: Record<string, unknown>, fallbackUrl?: string) {
  const w = window.open('', '_blank');
  try {
    const r = await api<{ fileName: string; mimeType: string; data: string }>(action, payload);
    const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: r.mimeType }));
    if (w) w.location.href = url; else window.location.href = url;
  } catch (e) {
    if (fallbackUrl && e instanceof ApiError && (e.code === 'FILE_UNAVAILABLE' || e.code === 'NO_DRIVE')) { if (w) w.location.href = fallbackUrl; return; }
    w?.close();
    throw e;
  }
}
