import { IS_EN, tr } from '../lib/i18n';
import { forwardRef, useId, useState, type FormEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { dmy } from '../lib/format';
import { Icon } from './Icon';
import { cx } from './cx';

const control = 'w-full h-11 sm:h-10 rounded-lg border bg-surface px-3 text-fg placeholder:text-muted/70 outline-none transition-colors focus:border-accent';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
/** خصائص تُمرَّر إلى عنصر الإدخال ليربط التحقق المحلي بالحقل */
export interface FieldBind { onInvalid: (e: FormEvent<Control>) => void; onInput: () => void }

/** رسالة عربية بدل رسائل المتصفح لقيود الإدخال (required/min/max/type) */
function validityText(el: Control): string {
  const v = el.validity;
  const fmt = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? dmy(s) : s);
  if (v.valueMissing) return el instanceof HTMLSelectElement ? tr("اختر قيمة.") : tr("هذا الحقل مطلوب.");
  if (v.rangeUnderflow && 'min' in el) return tr("الحد الأدنى {0}.", fmt(el.min));
  if (v.rangeOverflow && 'max' in el) return tr("الحد الأقصى {0}.", fmt(el.max));
  if (v.typeMismatch) return el instanceof HTMLInputElement && el.type === 'email' ? tr("بريد إلكتروني غير صحيح.") : tr("الصيغة غير صحيحة.");
  if (v.tooShort && 'minLength' in el) return tr("{0} أحرف على الأقل.", el.minLength);
  return tr("القيمة غير صحيحة.");
}

interface FieldProps { label: string; hint?: string; error?: string; required?: boolean; children: (id: string, describedBy: string | undefined, bind: FieldBind) => ReactNode; className?: string }

/**
 * حقل بتسمية ورسالة. `required` يضيف علامة * ويُظهر الخطأ محلياً عند الإرسال (من Dialog onSubmit أو Form)
 * بدل انتظار رسالة الخادم؛ الخطأ من الخادم يُمرَّر عبر `error`.
 */
export function Field({ label, hint, error, required, children, className }: FieldProps) {
  const id = useId();
  const [local, setLocal] = useState('');
  const shown = error || local;
  const msgId = shown || hint ? id + '-msg' : undefined;
  const bind: FieldBind = {
    onInvalid: (e) => { e.preventDefault(); setLocal(validityText(e.currentTarget)); },
    onInput: () => { if (local) setLocal(''); }
  };
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium">{label}{required && <span aria-hidden="true" className="ms-0.5 text-bad">*</span>}</label>
      {children(id, msgId, bind)}
      {(shown || hint) && <span id={msgId} className={cx('text-[12px]', shown ? 'text-bad' : 'text-muted')}>{shown || hint}</span>}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; ltr?: boolean };

export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput({ label, hint, error, ltr, required, className, ...rest }, ref) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(id, d, bind) => (
        <input ref={ref} id={id} aria-describedby={d} aria-invalid={!!error || undefined} required={required} {...bind}
          className={cx(control, error ? 'border-bad' : 'border-line', ltr && 'ltr text-right')} {...rest} />
      )}
    </Field>
  );
});

export function PasswordInput({ label, hint, error, required, className, ...rest }: Omit<InputProps, 'type'>) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(id, d, bind) => (
        <div className="relative">
          <input id={id} type={show ? 'text' : 'password'} aria-describedby={d} aria-invalid={!!error || undefined} required={required} {...bind}
            className={cx(control, 'ltr text-right', IS_EN ? 'pr-12' : 'pl-12', error ? 'border-bad' : 'border-line')} {...rest} />
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? tr("إخفاء كلمة المرور") : tr("إظهار كلمة المرور")}
            className="absolute end-1 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-md text-muted hover:text-fg cursor-pointer">
            <Icon name="eye" size={19} />
          </button>
        </div>
      )}
    </Field>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string; options: { value: string; label: string }[] };

export function Select({ label, hint, error, required, options, className, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(id, d, bind) => (
        <select id={id} aria-describedby={d} aria-invalid={!!error || undefined} required={required} {...bind} className={cx(control, error ? 'border-bad' : 'border-line', 'pe-8')} {...rest}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string };

export function Textarea({ label, hint, error, required, className, ...rest }: TextareaProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(id, d, bind) => <textarea id={id} aria-describedby={d} aria-invalid={!!error || undefined} required={required} {...bind} className={cx(control, 'h-auto py-2.5 min-h-[88px] resize-y', error ? 'border-bad' : 'border-line')} {...rest} />}
    </Field>
  );
}

export function Checkbox({ label, description, checked, onChange, disabled }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cx('flex min-h-11 items-start gap-3 cursor-pointer select-none sm:min-h-0', disabled && 'opacity-60 cursor-default')}>
      <input type="checkbox" className="mt-0.5 h-[18px] w-[18px] accent-accent shrink-0" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        {description && <span className="text-[12px] text-muted">{description}</span>}
      </span>
    </label>
  );
}

/**
 * يتحقق من قيود الحقول (required/min/max/type) قبل الإرسال: يُظهر رسالة تحت كل حقل غير صالح
 * وينقل التركيز إلى أوله. يعيد true إن كان النموذج صالحاً.
 */
export function validateForm(form: HTMLFormElement): boolean {
  if (form.checkValidity()) return true;
  const bad = form.querySelector<HTMLElement>(':invalid:not(fieldset)');
  bad?.focus();
  bad?.scrollIntoView?.({ block: 'center' });
  return false;
}

/** نموذج بتحقق محلي: Enter يرسل، والحقول الإلزامية تُعلَّم قبل الوصول إلى الخادم */
export function Form({ onSubmit, children, className }: { onSubmit: () => void; children: ReactNode; className?: string }) {
  return (
    <form noValidate className={className} onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); if (validateForm(e.currentTarget)) onSubmit(); }}>
      {children}
    </form>
  );
}
