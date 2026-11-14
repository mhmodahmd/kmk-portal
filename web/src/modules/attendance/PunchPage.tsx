import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import type { AttToday } from '../../lib/types';
import { duration, formatTime, hm } from '../../lib/format';
import { useAction, useApi } from '../../lib/useApi';
import { Badge, Card, ErrorBox, Skeleton } from '../../ui/Display';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import { CorrectionDialog, NoEmployee } from './shared';
import { deviceErrorText, registerDevice, signWithDevice, useDeviceChallenge, useDeviceSupport } from '../../lib/webauthn';
import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../ui/Overlay';

/** موقع الجهاز (عند الحاجة فقط) */
function getPosition(): Promise<{ lat: number; lng: number; acc: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('جهازك لا يدعم تحديد الموقع.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? 'رفضت مشاركة الموقع. اسمح للمتصفح باستخدام موقعك من إعدادات الموقع ثم حاول مرة أخرى.'
        : e.code === 3 ? 'تأخر تحديد الموقع. تأكد من تشغيل GPS وحاول مرة أخرى.' : 'تعذّر تحديد موقعك. شغّل GPS وحاول مرة أخرى.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

/** ساعة حية متزامنة مع وقت الخادم */
function useClock(serverNow?: string) {
  const offset = useMemo(() => (serverNow ? Date.parse(serverNow) - Date.now() : 0), [serverNow]);
  const [now, setNow] = useState(() => new Date(Date.now() + offset));
  useEffect(() => {
    setNow(new Date(Date.now() + offset));
    const t = setInterval(() => setNow(new Date(Date.now() + offset)), 1000);
    return () => clearInterval(t);
  }, [offset]);
  return now;
}

export default function PunchPage() {
  const q = useApi<AttToday>('att.today', {}, { refetchInterval: 60_000, retry: (n, e) => !(e instanceof ApiError && e.code === 'NO_EMPLOYEE') && n < 2 });
  const t = q.data;
  const now = useClock(t?.serverNow);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [correcting, setCorrecting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [fallback, setFallback] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const support = useDeviceSupport();
  const dev = t?.device;
  const challenge = useDeviceChallenge(!!dev && support === 'yes');
  const punch = useAction<Record<string, unknown>, AttToday>('att.punch', {
    invalidate: ['att.today', 'att.myMonth'], silentError: true,
    success: (r) => (r.isIn ? 'سُجّل حضورك' : 'سُجّل انصرافك')
  });

  if (q.error instanceof ApiError && q.error.code === 'NO_EMPLOYEE') return <NoEmployee />;

  /** تسجيل هذا الجهاز لبصمة الجهاز (مرة واحدة) */
  const enroll = async () => {
    setError(''); setFallback(false); setEnrolling(true);
    try {
      const ch = await challenge.take();
      const payload = await registerDevice(ch);
      await api('att.device.register', payload);
      await qc.invalidateQueries({ queryKey: ['att.today'] });
      toast('فُعّلت بصمة الجهاز');
    } catch (e) { setError(deviceErrorText(e, true)); }
    finally { setEnrolling(false); challenge.renew(); }
  };

  const doPunch = async (skipDevice = false) => {
    if (!t) return;
    setError(''); setFallback(false);
    if (needsEnroll) return enroll();
    // بصمة الجهاز أولاً مباشرة بعد الضغطة، ثم الموقع
    let assertion: Awaited<ReturnType<typeof signWithDevice>> | undefined;
    if (t.device.registered && !skipDevice) {
      setVerifying(true);
      try { assertion = await signWithDevice(await challenge.take()); }
      catch (e) {
        setVerifying(false); challenge.renew();
        setError(deviceErrorText(e));
        if (!t.device.required) setFallback(true);
        return;
      }
      setVerifying(false);
    }
    let loc: { lat?: number; lng?: number; acc?: number } = {};
    if (t.geo.required) {
      setLocating(true);
      try { loc = await getPosition(); }
      catch (e) { setLocating(false); setError((e as Error).message); return; }
      setLocating(false);
    }
    punch.mutate({ kind: t.isIn ? 'out' : 'in', ...loc, assertion }, {
      onError: (e) => setError(e.message),
      onSettled: () => { if (assertion) challenge.renew(); }
    });
  };

  const openMinutes = t?.isIn && t.openSince ? (now.getTime() - Date.parse(t.openSince)) / 60000 : 0;
  const total = (t?.closedMinutes || 0) + openMinutes;
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(now);
  const [clock, ampm] = [time.replace(/\s?[ap]m/i, ''), /pm/i.test(time) ? 'م' : 'ص'];
  const busy = locating || verifying || enrolling || punch.isPending;
  const needsEnroll = !!t && t.device.required && !t.device.registered;
  const noSupport = support === 'no';

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      {q.isError && !(q.error instanceof ApiError && q.error.code === 'NO_EMPLOYEE') && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}

      <Card className="flex flex-col items-center gap-5 !px-5 !py-7 text-center">
        {!t ? <><Skeleton className="h-5 w-40" /><Skeleton className="h-12 w-56" /><Skeleton className="h-44 w-44 rounded-full" /></> : (
          <>
            <div className="flex flex-col items-center gap-1">
              <span className="text-muted">{t.dayName} · <span className="num">{t.date.split('-').reverse().join('/')}</span></span>
              <span className="text-[44px] font-bold leading-none num ltr" aria-live="off">{clock}<span className="ms-2 text-[20px] font-semibold text-muted">{ampm}</span></span>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {t.shift ? <Badge tone="neutral">{t.shift.name} · <span className="ltr num">{t.shift.start}–{t.shift.end}</span></Badge> : <Badge>بلا وردية محددة</Badge>}
              {t.dayType === 'holiday' && <Badge tone="info">عطلة رسمية: {t.detail}</Badge>}
              {t.dayType === 'leave' && <Badge tone="info">أنت في إجازة اليوم ({t.detail})</Badge>}
              {t.dayType === 'weekend' && <Badge tone="neutral">عطلة أسبوعية</Badge>}
              {t.late > 0 && <Badge tone="warn">تأخير {duration(t.late)}</Badge>}
            </div>

            <button type="button" onClick={() => doPunch()} disabled={busy || (needsEnroll && noSupport)}
              className={cx('relative flex h-44 w-44 flex-col items-center justify-center gap-2 rounded-full text-[18px] font-bold shadow-lg transition-transform cursor-pointer active:scale-95 disabled:cursor-wait disabled:opacity-80',
                t.isIn ? 'bg-fg text-bg' : 'bg-accent text-on-accent')}>
              {busy ? <span className="kmk-blink text-[34px] ltr">&gt;_</span> : <Icon name={needsEnroll ? 'fingerprint' : t.isIn ? 'logoutArrow' : 'login'} size={38} strokeWidth={2} />}
              <span>{verifying ? 'أكمل التحقق على جهازك' : enrolling ? 'جارٍ التفعيل' : locating ? 'جارٍ تحديد موقعك' : punch.isPending ? 'جارٍ التسجيل'
                : needsEnroll ? 'تفعيل بصمة الجهاز' : t.isIn ? 'تسجيل الانصراف' : 'تسجيل الحضور'}</span>
            </button>

            <div className="flex flex-col items-center gap-1">
              <span className="font-semibold">
                {t.isIn ? <>داخل الدوام منذ <span className="num">{formatTime(t.openSince)}</span></> : t.sessions.length ? 'سجّلت انصرافك' : 'لم تسجّل حضورك بعد'}
              </span>
              <span className="text-muted">ساعات اليوم: <b className="text-fg num ltr">{hm(total)}</b></span>
            </div>

            {t.geo.required && <span className="inline-flex items-center gap-1.5 text-[13px] text-muted"><Icon name="pin" size={16} />يُطلب موقعك عند البصمة ({t.geo.branches.map((b) => b.name).join('، ')})</span>}
            {t.device.registered && <span className="inline-flex items-center gap-1.5 text-[13px] text-muted"><Icon name="fingerprint" size={16} />البصمة بالتحقق من وجهك أو إصبعك على هذا الجهاز</span>}
            {needsEnroll && !noSupport && <p className="m-0 max-w-sm text-[13px] leading-relaxed text-muted">البصمة في شركتك تتطلب تفعيل بصمة الجهاز مرة واحدة. صورة وجهك أو بصمتك لا تخرج من هاتفك.</p>}
            {needsEnroll && noSupport && <div role="alert" className="w-full rounded-lg bg-warn-bg px-3 py-2.5 text-start text-warn">جهازك أو متصفحك لا يدعم بصمة الجهاز. استخدم هاتفاً حديثاً بقفل الوجه أو البصمة، أو تواصل مع الموارد البشرية.</div>}
            {error && <div role="alert" className="flex w-full flex-col gap-2 rounded-lg bg-bad-bg px-3 py-2.5 text-start text-bad">
              {error}
              {fallback && <button type="button" onClick={() => doPunch(true)} className="self-start font-semibold underline cursor-pointer">سجّل بدون بصمة الجهاز</button>}
            </div>}
          </>
        )}
      </Card>

      {t && t.sessions.length > 0 && (
        <Card padded={false}>
          <div className="px-5 pt-4 pb-2 font-semibold">تسجيلات اليوم</div>
          {t.sessions.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3 border-t border-line px-5 py-3">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-chip text-[12px] font-semibold num">{i + 1}</span>
              <span className="flex-1 num">{formatTime(s.inTs)} ← {s.outTs ? formatTime(s.outTs) : <span className="text-ok">الآن</span>}</span>
              {(s.inVerified || s.outVerified) && <span title="بصمة الجهاز" className="text-muted"><Icon name="fingerprint" size={16} /></span>}
              <span className="font-semibold num ltr">{s.outTs ? hm(s.minutes) : hm(openMinutes)}</span>
            </div>
          ))}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link to="/attendance/me" className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3.5 font-medium text-fg no-underline hover:border-line-strong">
          <Icon name="calendar" className="text-muted" />سجلي الشهري
        </Link>
        <button type="button" onClick={() => setCorrecting(true)} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3.5 text-start font-medium hover:border-line-strong cursor-pointer">
          <Icon name="edit" className="text-muted" />طلب تصحيح
          {!!t?.pendingCorrections && <Badge tone="warn">{t.pendingCorrections}</Badge>}
        </button>
      </div>
      {t && !t.device.registered && !t.device.required && support === 'yes' && (
        <Card className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-fg"><Icon name="fingerprint" size={22} /></span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">بصمة الجهاز</span>
            <span className="text-[13px] text-muted">سجّل هاتفك ليتم التحقق بوجهك أو إصبعك عند كل بصمة</span>
          </span>
          <button type="button" onClick={enroll} disabled={busy} className="rounded-lg border border-line px-3 py-2 font-medium hover:border-line-strong cursor-pointer disabled:opacity-60">{enrolling ? 'جارٍ…' : 'تفعيل'}</button>
        </Card>
      )}
      <CorrectionDialog open={correcting} onClose={() => setCorrecting(false)} />
    </div>
  );
}
