import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Icon } from './Icon';
import { cx } from './cx';

const control = 'w-full h-11 sm:h-10 rounded-lg border bg-surface px-3 text-fg placeholder:text-muted/70 outline-none transition-colors focus:border-accent';

interface FieldProps { label: string; hint?: string; error?: string; children: (id: string, describedBy?: string) => ReactNode; className?: string }

export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId();
  const msgId = error || hint ? id + '-msg' : undefined;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium">{label}</label>
      {children(id, msgId)}
      {(error || hint) && <span id={msgId} className={cx('text-[12px]', error ? 'text-bad' : 'text-muted')}>{error || hint}</span>}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; ltr?: boolean };

export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput({ label, hint, error, ltr, className, ...rest }, ref) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, d) => (
        <input ref={ref} id={id} aria-describedby={d} aria-invalid={!!error || undefined}
          className={cx(control, error ? 'border-bad' : 'border-line', ltr && 'ltr text-right')} {...rest} />
      )}
    </Field>
  );
});

export function PasswordInput({ label, hint, error, className, ...rest }: Omit<InputProps, 'type'>) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, d) => (
        <div className="relative">
          <input id={id} type={show ? 'text' : 'password'} aria-describedby={d} aria-invalid={!!error || undefined}
            className={cx(control, 'ltr text-right pl-12', error ? 'border-bad' : 'border-line')} {...rest} />
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            className="absolute left-1 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-md text-muted hover:text-fg cursor-pointer">
            <Icon name="eye" size={19} />
          </button>
        </div>
      )}
    </Field>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string; options: { value: string; label: string }[] };

export function Select({ label, hint, error, options, className, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, d) => (
        <select id={id} aria-describedby={d} className={cx(control, 'border-line pl-8')} {...rest}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string };

export function Textarea({ label, hint, error, className, ...rest }: TextareaProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, d) => <textarea id={id} aria-describedby={d} className={cx(control, 'h-auto py-2.5 min-h-[88px] resize-y border-line')} {...rest} />}
    </Field>
  );
}

export function Checkbox({ label, description, checked, onChange, disabled }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cx('flex items-start gap-3 cursor-pointer select-none', disabled && 'opacity-60 cursor-default')}>
      <input type="checkbox" className="mt-0.5 h-[18px] w-[18px] accent-accent shrink-0" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        {description && <span className="text-[12px] text-muted">{description}</span>}
      </span>
    </label>
  );
}
