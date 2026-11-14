import { IS_EN, setLang } from '../lib/i18n';
import { cx } from './cx';

/** زر تبديل اللغة: يعرض اسم اللغة الأخرى بلغتها */
export function LangToggle({ className }: { className?: string }) {
  const label = IS_EN ? 'العربية' : 'English';
  return (
    <button type="button" lang={IS_EN ? 'ar' : 'en'} aria-label={label} title={label} onClick={() => setLang(IS_EN ? 'ar' : 'en')}
      className={cx('inline-flex h-10 min-w-10 items-center justify-center rounded-lg px-2.5 text-[14px] font-semibold text-muted hover:bg-chip hover:text-fg cursor-pointer', className)}>
      {IS_EN ? 'ع' : 'EN'}
    </button>
  );
}
