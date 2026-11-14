import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { cx } from './cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';
type Size = 'md' | 'lg' | 'sm';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover font-semibold border border-transparent',
  secondary: 'bg-surface text-fg border border-line hover:border-line-strong font-medium',
  ghost: 'bg-transparent text-accent-fg hover:bg-chip font-medium border border-transparent',
  danger: 'bg-bad-solid text-white hover:opacity-90 font-semibold border border-transparent',
  'danger-outline': 'bg-transparent text-bad border border-line hover:border-bad font-semibold'
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-md',
  md: 'h-10 px-4 gap-2 rounded-lg',
  lg: 'h-12 px-5 text-[16px] gap-2 rounded-xl'
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, className, children, disabled, type = 'button', ...rest }, ref
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx('inline-flex items-center justify-center whitespace-nowrap transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-default',
        variants[variant], sizes[size], className)} {...rest}>
      {loading ? <span className="kmk-blink font-bold ltr" aria-hidden="true">&gt;</span> : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children}
    </button>
  );
});

export function IconButton({ icon, label, className, onClick, badge }: { icon: IconName; label: string; className?: string; onClick?: () => void; badge?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className={cx('relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-chip hover:text-fg cursor-pointer', className)}>
      <Icon name={icon} />
      {badge && <span className="absolute top-2 end-2 h-2 w-2 rounded-full bg-brand ring-2 ring-surface" />}
    </button>
  );
}
