import { tr } from '../lib/i18n';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import { Button } from './Button';
import { initial } from '../lib/format';

export function Card({ children, className, padded = true, as: Tag = 'section' }: { children: ReactNode; className?: string; padded?: boolean; as?: 'section' | 'div' | 'aside' }) {
  return <Tag className={cx('bg-surface border border-line rounded-xl', padded && 'p-5', className)}>{children}</Tag>;
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5">
      <h2 className="m-0 text-[16px] font-semibold">{title}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, eyebrow, actions }: { title: string; subtitle?: ReactNode; eyebrow?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-1 basis-[260px] flex-col gap-1">
        {eyebrow && <span className="text-[13px] text-muted">{eyebrow}</span>}
        <h1 className="m-0 text-[22px] sm:text-[24px] font-bold leading-tight">{title}</h1>
        {subtitle && <span className="text-muted">{subtitle}</span>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';
const tones: Record<Tone, string> = {
  ok: 'bg-ok-bg text-ok', warn: 'bg-warn-bg text-warn', bad: 'bg-bad-bg text-bad', info: 'bg-accent-soft text-accent-fg', neutral: 'bg-chip text-muted'
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap', tones[tone])}>{children}</span>;
}

export function Avatar({ name, size = 36, dark }: { name: string; size?: number; dark?: boolean }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.4 }}
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', dark ? 'bg-side-avatar text-white' : 'bg-chip text-fg')}>
      {initial(name)}
    </span>
  );
}

export function StatTile({ label, value, foot, icon }: { label: string; value: ReactNode; foot?: ReactNode; icon?: IconName }) {
  return (
    <Card className="flex flex-col gap-2.5">
      <span className="flex items-center justify-between font-medium text-muted">{label}{icon && <Icon name={icon} size={18} />}</span>
      <span className="text-[26px] font-bold leading-none num">{value}</span>
      {foot && <span className="mt-auto text-[13px] text-muted">{foot}</span>}
    </Card>
  );
}

/**
 * صف في قائمة مكدّسة (الطلبات، المهام، السندات): عنصر بادئ اختياري، عنوان وسطر ثانٍ، شارة، وأزرار.
 * القاعدة: جدول (DataTable) للبيانات الرقمية القابلة للمقارنة، وصفوف (ListRow) للطلبات والعناصر.
 */
export function ListRow({ leading, title, sub, note, badge, actions, to, onClick, className, titleClassName }: {
  leading?: ReactNode; title: ReactNode; sub?: ReactNode; note?: ReactNode; badge?: ReactNode; actions?: ReactNode; to?: string; onClick?: () => void; className?: string; titleClassName?: string;
}) {
  const text = (
    <>
      <span className={cx('font-semibold', titleClassName)}>{title}</span>
      {sub && <span className="text-[13px] text-muted">{sub}</span>}
      {note && <span className="text-[13px]">{note}</span>}
    </>
  );
  const body = 'flex min-w-0 flex-1 flex-col gap-0.5';
  return (
    <div className={cx('flex flex-wrap items-center gap-3 border-t border-line px-5 py-3.5 first:border-t-0', (to || onClick) && 'hover:bg-chip/40', className)}>
      {leading}
      {to ? <Link to={to} className={cx(body, 'text-fg no-underline')}>{text}</Link>
        : onClick ? <button type="button" onClick={onClick} className={cx(body, 'text-start cursor-pointer')}>{text}</button>
        : <span className={body}>{text}</span>}
      {badge}
      {actions && <span className="flex flex-wrap items-center gap-2">{actions}</span>}
    </div>
  );
}

/** منطقة الحذف النهائي: أسفل صفحة التفاصيل بعيداً عن أزرار الإجراء الأساسية */
export function DangerZone({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="no-print flex justify-end border-t border-line pt-3">
      <Button size="sm" variant="danger-outline" icon="trash" onClick={onClick}>{label}</Button>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('kmk-skeleton', className)} aria-hidden="true" />;
}

/** نقش البكسل المستوحى من السهم في الشعار */
export function PixelChevron({ cell = 12, gap = 3, cols = 5, rows = 5, on = 'var(--c-fg)', off = 'var(--c-chip)', accent = 'var(--c-brand)' }: { cell?: number; gap?: number; cols?: number; rows?: number; on?: string; off?: string; accent?: string }) {
  const cells = [];
  const mid = Math.floor(rows / 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tip = r <= mid ? r : rows - 1 - r;
      const lit = c === tip || c === tip + 1;
      const red = c === cols - 1 && r === mid;
      cells.push(<span key={r + '-' + c} style={{ width: cell, height: cell, borderRadius: Math.max(2, cell / 5), background: lit ? on : red ? accent : off }} />);
    }
  }
  return <div aria-hidden="true" className="ltr" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gap }}>{cells}</div>;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <PixelChevron />
      <span className="text-[16px] font-bold">{title}</span>
      {body && <span className="max-w-sm text-muted leading-relaxed">{body}</span>}
      {action}
    </div>
  );
}

export function Loader({ label = tr("جارٍ التحميل") }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-muted">
      <span className="kmk-blink text-[22px] font-bold text-brand ltr" aria-hidden="true">&gt;_</span>
      <span>{label}</span>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-bad-bg px-4 py-3 text-bad">
      <Icon name="alert" />
      <span className="flex-1">{message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="font-semibold underline cursor-pointer">{tr("إعادة المحاولة")}</button>}
    </div>
  );
}
