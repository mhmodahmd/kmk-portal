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
