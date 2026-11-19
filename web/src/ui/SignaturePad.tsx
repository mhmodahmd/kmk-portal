import { useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';
import { Button } from './Button';

/**
 * لوحة توقيع باللمس أو الفأرة. onChange يعيد صورة PNG (data URL) مقصوصة على حدود التوقيع، أو '' عند المسح.
 */
export function SignaturePad({ onChange, height = 170 }: { onChange: (data: string) => void; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const cv = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    cv.width = cv.offsetWidth * ratio;
    cv.height = height * ratio;
    const ctx = cv.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--c-ink').trim() || '#0B1F3A';
  }, [height]);

  const point = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    onChange(trimmed(ref.current!));
  };

  return (
    <div className="flex flex-col gap-2">
      <canvas ref={ref} style={{ height, touchAction: 'none' }} aria-label={tr("مساحة التوقيع")}
        className="w-full rounded-lg border-2 border-dashed border-line-strong bg-white cursor-crosshair"
        onPointerDown={(e) => { (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId); drawing.current = true; last.current = point(e); setEmpty(false); }}
        onPointerMove={(e) => {
          if (!drawing.current || !last.current) return;
          const p = point(e), ctx = ref.current!.getContext('2d')!;
          ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
          last.current = p;
        }}
        onPointerUp={finish} onPointerLeave={finish} />
      <div className="flex items-center justify-between text-[13px] text-muted">
        <span>{empty ? tr("وقّع داخل المربع بإصبعك أو بالفأرة") : tr("يمكنك المسح والتوقيع من جديد")}</span>
        <Button size="sm" variant="ghost" icon="refresh" onClick={() => {
          const cv = ref.current!; cv.getContext('2d')!.clearRect(0, 0, cv.width, cv.height); setEmpty(true); onChange('');
        }}>{tr("مسح")}</Button>
      </div>
    </div>
  );
}

/** يقص الفراغ حول التوقيع ويصغّره ليبقى خفيفاً (≤ 400×150) */
function trimmed(cv: HTMLCanvasElement) {
  const ctx = cv.getContext('2d')!;
  const { width: w, height: h } = cv;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  if (x1 <= x0 || y1 <= y0) return '';
  const pad = 6, sw = x1 - x0 + pad * 2, sh = y1 - y0 + pad * 2;
  const k = Math.min(1, 400 / sw, 150 / sh);
  const out = document.createElement('canvas');
  out.width = Math.round(sw * k); out.height = Math.round(sh * k);
  out.getContext('2d')!.drawImage(cv, x0 - pad, y0 - pad, sw, sh, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

/** أقصى طول لصورة التوقيع (data URL) كما يقبلها الخادم */
export const SIGNATURE_MAX = 45000;

/**
 * صورة توقيع من ملف (صورة ورقة موقّعة أو PNG): تُصغَّر إلى 600×240 كحد أقصى وتُضغط حتى تقبلها الخادم.
 * PNG إن كان صغيراً (يحفظ الشفافية)، وإلا JPEG بخلفية بيضاء بجودة تنخفض تدريجياً.
 */
export async function signatureFromFile(file: File): Promise<string> {
  if (!/^image\//.test(file.type)) throw new Error(tr("اختر صورة (PNG أو JPG)."));
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error(tr("تعذّرت قراءة الصورة."))); i.src = url; });
    for (const maxW of [600, 450, 320]) {
      const scale = Math.min(1, maxW / img.naturalWidth, (maxW * 0.4) / img.naturalHeight);
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * scale));
      cv.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = cv.getContext('2d')!;
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      const png = cv.toDataURL('image/png');
      if (png.length <= SIGNATURE_MAX) return png;
      const flat = document.createElement('canvas');
      flat.width = cv.width; flat.height = cv.height;
      const fx = flat.getContext('2d')!;
      fx.fillStyle = '#fff'; fx.fillRect(0, 0, flat.width, flat.height); fx.drawImage(cv, 0, 0);
      for (const q of [0.85, 0.7, 0.55]) {
        const jpg = flat.toDataURL('image/jpeg', q);
        if (jpg.length <= SIGNATURE_MAX) return jpg;
      }
    }
    throw new Error(tr("الصورة كبيرة جداً، صوّر التوقيع وحده أو اقصص الصورة."));
  } finally { URL.revokeObjectURL(url); }
}
