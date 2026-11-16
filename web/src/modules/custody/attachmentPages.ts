/**
 * تجهيز مرفقات بنود العهدة للطباعة في ملف واحد مع الكشف:
 * الصور تُعرض كما هي، وملفات PDF تُحوَّل صفحاتها إلى صور عبر pdf.js (تُحمَّل عند الحاجة فقط)،
 * وما تعذّر جلبه (ملف من النظام السابق، HEIC لا يعرضه المتصفح) يُذكر في مكانه بدل أن يُسقط.
 */
import { api, ApiError } from '../../lib/api';
import { tr } from '../../lib/i18n';
import type { ExpenseView } from './types';

export interface AttachmentPage {
  key: string;
  /** رقم البند في الكشف (0 للمقبوضات) */
  no: number;
  expense: ExpenseView;
  fileName: string;
  /** صور الصفحات (data URL)؛ فارغة عند الخطأ */
  images: string[];
  error?: string;
}

const PDF_MAX_PAGES = 20;
const PDF_WIDTH = 1240; // ≈ A4 بدقة 150 نقطة/بوصة

async function pdfToImages(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: bytes });
  const doc = await task.promise;
  const out: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, PDF_MAX_PAGES); i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: PDF_WIDTH / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
    out.push(canvas.toDataURL('image/jpeg', 0.85));
    page.cleanup();
  }
  await task.destroy();
  return out;
}

/** يحمّل كل مرفقات البنود بالترتيب ويبلّغ التقدم (المنجز، الكل) */
export async function loadAttachmentPages(expenses: ExpenseView[], onProgress?: (done: number, total: number) => void): Promise<AttachmentPage[]> {
  const items: { no: number; expense: ExpenseView; att: ExpenseView['attachments'][number] }[] = [];
  let n = 0;
  for (const e of expenses) {
    if (e.entryType === 'expense') n++;
    for (const att of e.attachments) items.push({ no: e.entryType === 'expense' ? n : 0, expense: e, att });
  }
  const pages: AttachmentPage[] = [];
  let done = 0;
  onProgress?.(0, items.length);
  for (const it of items) {
    const page: AttachmentPage = { key: it.att.id, no: it.no, expense: it.expense, fileName: it.att.fileName, images: [] };
    try {
      const r = await api<{ fileName: string; mimeType: string; data: string }>('cus.attachment.content', { id: it.att.id });
      const isPdf = r.mimeType === 'application/pdf' || /\.pdf$/i.test(r.fileName);
      if (isPdf) page.images = await pdfToImages(Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0)));
      else if (/^image\/(heic|heif)/.test(r.mimeType)) page.error = tr("صورة HEIC لا يعرضها المتصفح للطباعة؛ افتحها من صفحة العهدة.");
      else page.images = ['data:' + r.mimeType + ';base64,' + r.data];
    } catch (e) {
      page.error = e instanceof ApiError && (e.code === 'FILE_UNAVAILABLE' || e.code === 'NO_DRIVE')
        ? tr("الملف من النظام السابق أو غير متاح للبوابة؛ افتحه من رابطه في صفحة العهدة.")
        : e instanceof Error ? e.message : tr("تعذّر جلب الملف.");
    }
    pages.push(page);
    onProgress?.(++done, items.length);
  }
  return pages;
}
