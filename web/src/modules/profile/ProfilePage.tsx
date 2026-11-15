import { tr } from '../../lib/i18n';
import { useAuth } from '../../app/auth';
import { ChangePasswordForm } from '../../app/ChangePassword';
import { useTheme, type ThemeChoice } from '../../lib/theme';
import { formatDateTime } from '../../lib/format';
import { Avatar, Card, PageHeader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { IS_EN, setLang } from '../../lib/i18n';
import { lazy, Suspense, useState } from 'react';
const SignatureCard = lazy(() => import('../custody/SignatureCard'));
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { DeviceInfo } from '../../lib/types';
import { useAction, useApi } from '../../lib/useApi';
import { deviceErrorText, markPasskeyHere, registerDevice, useDeviceChallenge, useDeviceSupport } from '../../lib/webauthn';
import { dmy, kwDate, relativeTime } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Overlay';
import { Checkbox } from '../../ui/Field';
import { browserAlertsOn, browserAlertsSupported, setBrowserAlerts, useNotifications } from '../../app/Notifications';

export default function ProfilePage() {
  const { user, roles, signOut } = useAuth();
  const { choice, setChoice } = useTheme();
  if (!user) return null;
  const themes: { v: ThemeChoice; l: string }[] = [{ v: 'system', l: tr("حسب الجهاز") }, { v: 'light', l: tr("نهاري") }, { v: 'dark', l: tr("ليلي") }];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={tr("ملفي")} />
      <div className="flex flex-wrap items-start gap-4">
        <Card className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={user.fullName} size={52} />
            <div className="flex flex-col">
              <span className="text-[18px] font-bold">{user.fullName}</span>
              <span className="text-muted">{user.jobTitle || (user.isSuperAdmin ? tr("مدير النظام") : '')}</span>
            </div>
          </div>
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
            <div><dt className="text-[12px] text-muted">{tr("اسم المستخدم")}</dt><dd className="ltr m-0 text-right font-medium">{user.username}</dd></div>
            <div><dt className="text-[12px] text-muted">{tr("آخر دخول")}</dt><dd className="m-0 font-medium">{formatDateTime(user.lastLogin)}</dd></div>
            {user.phone && <div><dt className="text-[12px] text-muted">{tr("الهاتف")}</dt><dd className="ltr m-0 text-right font-medium">{user.phone}</dd></div>}
          </dl>
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <span className="font-semibold">{tr("المظهر")}</span>
            <div role="radiogroup" aria-label={tr("المظهر")} className="flex gap-2">
              {themes.map((t) => (
                <button key={t.v} type="button" role="radio" aria-checked={choice === t.v} onClick={() => setChoice(t.v)}
                  className={cx('h-10 flex-1 rounded-lg border font-medium cursor-pointer', choice === t.v ? 'border-accent bg-accent-soft text-accent-fg' : 'border-line bg-surface')}>{t.l}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <span className="font-semibold">{tr("اللغة")}</span>
            <div role="radiogroup" aria-label={tr("اللغة")} className="flex gap-2">
              {([['ar', 'العربية'], ['en', 'English']] as const).map(([v, l]) => (
                <button key={v} type="button" role="radio" lang={v} aria-checked={(v === 'en') === IS_EN} onClick={() => (v === 'en') !== IS_EN && setLang(v)}
                  className={cx('h-10 flex-1 rounded-lg border font-medium cursor-pointer', (v === 'en') === IS_EN ? 'border-accent bg-accent-soft text-accent-fg' : 'border-line bg-surface')}>{l}</button>
              ))}
            </div>
          </div>
          <Button variant="danger-outline" icon="logout" onClick={signOut} className="self-start">{tr("تسجيل الخروج")}</Button>
        </Card>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <PasskeyCard />
          <NotifyCard />
          {(user.isSuperAdmin || roles.custody) && <Suspense fallback={null}><SignatureCard /></Suspense>}
        <Card className="flex flex-col gap-4">
          <h2 className="m-0 text-[16px] font-semibold">{tr("تغيير كلمة المرور")}</h2>
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
  const remove = useAction('auth.passkey.remove', { invalidate: ['auth.passkey.mine'], success: tr("أُزيل الجهاز"), onSuccess: () => markPasskeyHere(false) });

  const enable = async () => {
    setError(''); setBusy(true);
    try {
      await api('auth.passkey.register', await registerDevice(await challenge.take()));
      markPasskeyHere();
      await qc.invalidateQueries({ queryKey: ['auth.passkey.mine'] });
      void qc.invalidateQueries({ queryKey: ['att.today'] });
      toast(tr("فُعّل الدخول بالبصمة"));
    } catch (e) { setError(deviceErrorText(e, true)); }
    finally { setBusy(false); challenge.renew(); }
  };

  const k = q.data?.passkey;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className={cx('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full', has ? 'bg-ok-bg text-ok' : 'bg-chip text-muted')}><Icon name="fingerprint" size={22} /></span>
        <div className="flex min-w-0 flex-col">
          <h2 className="m-0 text-[16px] font-semibold">{tr("الدخول بالبصمة")}</h2>
          <span className="text-[13px] text-muted">{has ? tr("مفعّل") : tr("ادخل بوجهك أو إصبعك بدل كلمة المرور")}</span>
        </div>
      </div>
      {!q.data ? null : k ? (
        <>
          <p className="m-0 text-[13px] leading-relaxed text-muted">
            {k.label} {tr("· سُجّل")} {dmy(kwDate(new Date(k.createdAt)))}{k.lastUsedAt ? <> {tr("· آخر استخدام")} {relativeTime(k.lastUsedAt)}</> : null}{tr(". الجهاز نفسه يُستخدم للبصمة في الحضور. كلمة المرور تبقى للدخول من أي جهاز آخر.")}
          </p>
          {q.data.canRemove
            ? <Button variant="danger-outline" size="sm" icon="trash" className="self-start" loading={remove.isPending} onClick={() => remove.mutate({})}>{tr("إزالة الجهاز")}</Button>
            : <p className="m-0 text-[13px] text-muted">{tr("لتغيير جهازك اطلب من الموارد البشرية إعادة ضبطه.")}</p>}
        </>
      ) : support === 'no' ? (
        <p className="m-0 text-[13px] text-muted">{tr("هذا الجهاز أو المتصفح لا يدعم الدخول بالبصمة. جرّبه من هاتفك.")}</p>
      ) : (
        <>
          <p className="m-0 text-[13px] leading-relaxed text-muted">{tr("فعّلها مرة واحدة على هاتفك، وبعدها اضغط «الدخول بالبصمة» في شاشة الدخول. صورة وجهك أو بصمتك لا تخرج من الجهاز.")}</p>
          <Button variant="primary" icon="fingerprint" className="self-start" loading={busy} disabled={support !== 'yes'} onClick={enable}>{tr("تفعيل على هذا الجهاز")}</Button>
        </>
      )}
      {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
    </Card>
  );
}

/** تفضيلات الإشعارات: البريد (من الخادم) وتنبيه المتصفح (على هذا الجهاز) */
function NotifyCard() {
  const q = useNotifications();
  const toast = useToast();
  const [browser, setBrowser] = useState(browserAlertsOn());
  const prefs = useAction<{ email: boolean }>('notify.prefs', { invalidate: ['notify.list'], success: tr("حُفظ التفضيل") });
  const e = q.data?.email;
  const emailHint = !e ? '' : !e.available ? tr("يُفعَّل بعد موافقة مالك البوابة على صلاحية إرسال البريد.") : !e.address ? tr("لا يوجد بريد في حسابك. يضيفه مدير النظام من «المستخدمون والأدوار».") : e.address;
  const blocked = browserAlertsSupported() && Notification.permission === 'denied';
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chip text-muted"><Icon name="bell" size={22} /></span>
        <div className="flex min-w-0 flex-col">
          <h2 className="m-0 text-[16px] font-semibold">{tr("الإشعارات")}</h2>
          <span className="text-[13px] text-muted">{tr("تصلك داخل البوابة دائماً (الجرس أعلى الصفحة)")}</span>
        </div>
      </div>
      <Checkbox label={tr("بالبريد الإلكتروني")} description={emailHint} checked={!!e && e.on && e.available && !!e.address}
        disabled={!e || !e.available || !e.address || prefs.isPending} onChange={(v) => prefs.mutate({ email: v })} />
      <Checkbox label={tr("تنبيه على هذا الجهاز")}
        description={!browserAlertsSupported() ? tr("المتصفح لا يدعم التنبيهات.") : blocked ? tr("التنبيهات محظورة لهذا الموقع من إعدادات المتصفح.") : tr("يظهر تنبيه عند وصول إشعار والبوابة مفتوحة في الخلفية.")}
        checked={browser} disabled={!browserAlertsSupported() || blocked}
        onChange={async (v) => { const on = await setBrowserAlerts(v); setBrowser(on); if (v && !on) toast(tr("لم يُسمح بالتنبيهات."), 'bad'); }} />
    </Card>
  );
}
