import { useAuth } from '../../app/auth';
import { ChangePasswordForm } from '../../app/ChangePassword';
import { useTheme, type ThemeChoice } from '../../lib/theme';
import { formatDateTime } from '../../lib/format';
import { Avatar, Card, PageHeader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { DeviceInfo } from '../../lib/types';
import { useAction, useApi } from '../../lib/useApi';
import { deviceErrorText, markPasskeyHere, registerDevice, useDeviceChallenge, useDeviceSupport } from '../../lib/webauthn';
import { dmy, kwDate, relativeTime } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Overlay';

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { choice, setChoice } = useTheme();
  if (!user) return null;
  const themes: { v: ThemeChoice; l: string }[] = [{ v: 'system', l: 'حسب الجهاز' }, { v: 'light', l: 'نهاري' }, { v: 'dark', l: 'ليلي' }];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="ملفي" />
      <div className="flex flex-wrap items-start gap-4">
        <Card className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={user.fullName} size={52} />
            <div className="flex flex-col">
              <span className="text-[18px] font-bold">{user.fullName}</span>
              <span className="text-muted">{user.jobTitle || (user.isSuperAdmin ? 'مدير النظام' : '')}</span>
            </div>
          </div>
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
            <div><dt className="text-[12px] text-muted">اسم المستخدم</dt><dd className="ltr m-0 text-right font-medium">{user.username}</dd></div>
            <div><dt className="text-[12px] text-muted">آخر دخول</dt><dd className="m-0 font-medium">{formatDateTime(user.lastLogin)}</dd></div>
            {user.phone && <div><dt className="text-[12px] text-muted">الهاتف</dt><dd className="ltr m-0 text-right font-medium">{user.phone}</dd></div>}
          </dl>
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <span className="font-semibold">المظهر</span>
            <div role="radiogroup" aria-label="المظهر" className="flex gap-2">
              {themes.map((t) => (
                <button key={t.v} type="button" role="radio" aria-checked={choice === t.v} onClick={() => setChoice(t.v)}
                  className={cx('h-10 flex-1 rounded-lg border font-medium cursor-pointer', choice === t.v ? 'border-accent bg-accent-soft text-accent-fg' : 'border-line bg-surface')}>{t.l}</button>
              ))}
            </div>
          </div>
          <Button variant="danger-outline" icon="logout" onClick={signOut} className="self-start">تسجيل الخروج</Button>
        </Card>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <PasskeyCard />
        <Card className="flex flex-col gap-4">
          <h2 className="m-0 text-[16px] font-semibold">تغيير كلمة المرور</h2>
          <ChangePasswordForm />
        </Card>
        </div>
      </div>
    </div>
  );
}

/** الدخول بالبصمة: تفعيلها على هذا الجهاز أو إزالتها */
function PasskeyCard() {
  const q = useApi<{ passkey: DeviceInfo | null; canRemove: boolean }>('auth.passkey.mine');
  const support = useDeviceSupport();
  const has = !!q.data?.passkey;
  const challenge = useDeviceChallenge(support === 'yes' && !!q.data && !has, 'auth.passkey.challenge');
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remove = useAction('auth.passkey.remove', { invalidate: ['auth.passkey.mine'], success: 'أُزيل الجهاز', onSuccess: () => markPasskeyHere(false) });

  const enable = async () => {
    setError(''); setBusy(true);
    try {
      await api('auth.passkey.register', await registerDevice(await challenge.take()));
      markPasskeyHere();
      await qc.invalidateQueries({ queryKey: ['auth.passkey.mine'] });
      void qc.invalidateQueries({ queryKey: ['att.today'] });
      toast('فُعّل الدخول بالبصمة');
    } catch (e) { setError(deviceErrorText(e, true)); }
    finally { setBusy(false); challenge.renew(); }
  };

  const k = q.data?.passkey;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className={cx('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full', has ? 'bg-ok-bg text-ok' : 'bg-chip text-muted')}><Icon name="fingerprint" size={22} /></span>
        <div className="flex min-w-0 flex-col">
          <h2 className="m-0 text-[16px] font-semibold">الدخول بالبصمة</h2>
          <span className="text-[13px] text-muted">{has ? 'مفعّل' : 'ادخل بوجهك أو إصبعك بدل كلمة المرور'}</span>
        </div>
      </div>
      {!q.data ? null : k ? (
        <>
          <p className="m-0 text-[13px] leading-relaxed text-muted">
            {k.label} · سُجّل {dmy(kwDate(new Date(k.createdAt)))}{k.lastUsedAt ? <> · آخر استخدام {relativeTime(k.lastUsedAt)}</> : null}.
            الجهاز نفسه يُستخدم للبصمة في الحضور. كلمة المرور تبقى للدخول من أي جهاز آخر.
          </p>
          {q.data.canRemove
            ? <Button variant="danger-outline" size="sm" icon="trash" className="self-start" loading={remove.isPending} onClick={() => remove.mutate({})}>إزالة الجهاز</Button>
            : <p className="m-0 text-[13px] text-muted">لتغيير جهازك اطلب من الموارد البشرية إعادة ضبطه.</p>}
        </>
      ) : support === 'no' ? (
        <p className="m-0 text-[13px] text-muted">هذا الجهاز أو المتصفح لا يدعم الدخول بالبصمة. جرّبه من هاتفك.</p>
      ) : (
        <>
          <p className="m-0 text-[13px] leading-relaxed text-muted">فعّلها مرة واحدة على هاتفك، وبعدها اضغط «الدخول بالبصمة» في شاشة الدخول. صورة وجهك أو بصمتك لا تخرج من الجهاز.</p>
          <Button variant="primary" icon="fingerprint" className="self-start" loading={busy} disabled={support !== 'yes'} onClick={enable}>تفعيل على هذا الجهاز</Button>
        </>
      )}
      {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
    </Card>
  );
}
