import { useState, type FormEvent } from 'react';
import { api, ApiError, session } from '../lib/api';
import type { User } from '../lib/types';
import { useAuth } from './auth';
import { Button } from '../ui/Button';
import { PasswordInput } from '../ui/Field';
import { useToast } from '../ui/Overlay';

/** نموذج تغيير كلمة المرور: يُستخدم إجبارياً عند أول دخول، ومن صفحة «ملفي». */
export function ChangePasswordForm({ onDone, forced }: { onDone?: () => void; forced?: boolean }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (f.next !== f.confirm) { setError('كلمتا المرور الجديدتان غير متطابقتين.'); return; }
    setBusy(true); setError('');
    try {
      const r = await api<{ user: User; deviceToken: string }>('auth.changePassword', { current: f.current, next: f.next, remember: !!session.deviceToken });
      session.setDevice(r.deviceToken);
      setUser(r.user);
      setF({ current: '', next: '', confirm: '' });
      toast('تم تغيير كلمة المرور');
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تغيير كلمة المرور.');
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <PasswordInput label={forced ? 'كلمة المرور المؤقتة' : 'كلمة المرور الحالية'} autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
      <PasswordInput label="كلمة المرور الجديدة" autoComplete="new-password" hint="8 أحرف على الأقل، حروف وأرقام" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
      <PasswordInput label="تأكيد كلمة المرور الجديدة" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
      {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      <Button type="submit" variant="primary" loading={busy} className="self-start">حفظ كلمة المرور</Button>
    </form>
  );
}

export default function ForcedChangePassword() {
  const { user, signOut } = useAuth();
  return (
    <div className="flex min-h-screen items-start sm:items-center justify-center bg-bg px-6 py-10">
      <div className="w-full max-w-[420px] flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[24px] font-bold">أهلاً {user?.fullName}</h1>
          <p className="m-0 text-muted leading-relaxed">قبل المتابعة، اختر كلمة مرور خاصة بك بدل الكلمة المؤقتة التي أعطاك إياها مدير النظام.</p>
        </div>
        <ChangePasswordForm forced />
        <button type="button" onClick={signOut} className="self-start text-muted underline cursor-pointer">تسجيل الخروج</button>
      </div>
    </div>
  );
}
