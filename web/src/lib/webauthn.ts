/**
 * بصمة الجهاز (مفاتيح المرور / WebAuthn) في المتصفح.
 * الجهاز يتحقق من الوجه أو الإصبع محلياً ويوقّع تحدي الخادم. لا يصلنا شيء من البيانات الحيوية.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './api';

export interface DeviceChallenge {
  challenge: string; rpName: string;
  user: { id: string; name: string; displayName: string };
  credentialIds: string[];
}

const toB64u = (buf: ArrayBuffer) => {
  let s = '';
  new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64u = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

export type DeviceSupport = 'checking' | 'yes' | 'no';

/** هل يدعم هذا الجهاز التحقق بالوجه أو البصمة أو رمز القفل؟ */
export function useDeviceSupport(): DeviceSupport {
  const [s, setS] = useState<DeviceSupport>('checking');
  useEffect(() => {
    const PKC = window.PublicKeyCredential;
    if (!PKC || !window.isSecureContext || typeof PKC.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') { setS('no'); return; }
    PKC.isUserVerifyingPlatformAuthenticatorAvailable().then((ok) => setS(ok ? 'yes' : 'no'), () => setS('no'));
  }, []);
  return s;
}

/**
 * تحدٍّ جاهز مسبقاً: بعض المتصفحات (Safari) تشترط أن يبدأ التحقق مباشرة بعد ضغطة المستخدم،
 * فنجلب التحدي قبل الضغط ونجدده كل 4 دقائق (صلاحيته 10).
 */
export function useDeviceChallenge(enabled: boolean) {
  const q = useQuery({
    queryKey: ['att.device.challenge'], queryFn: () => api<DeviceChallenge>('att.device.challenge'),
    enabled, staleTime: 4 * 60_000, refetchInterval: 4 * 60_000, gcTime: 0, retry: 1
  });
  /** يعيد تحدياً صالحاً (من الذاكرة إن كان حديثاً) */
  const take = async () => {
    const fresh = q.data && Date.now() - q.dataUpdatedAt < 8 * 60_000;
    const ch = fresh ? q.data! : (await q.refetch()).data;
    if (!ch) throw new Error('تعذّر تجهيز البصمة. تحقق من الاتصال وحاول مرة أخرى.');
    return ch;
  };
  /** كل تحدٍّ يُستخدم مرة: نجلب غيره بعد كل محاولة */
  const renew = () => { void q.refetch(); };
  return { take, renew, ready: !!q.data };
}

/** وصف مختصر للجهاز يظهر للموارد البشرية */
export function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : 'جهاز';
  const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /CriOS|Chrome\//.test(ua) ? 'Chrome'
    : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? os + ' · ' + br : os;
}

export async function registerDevice(ch: DeviceChallenge) {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: fromB64u(ch.challenge),
      rp: { name: ch.rpName, id: location.hostname },
      user: { id: fromB64u(ch.user.id), name: ch.user.name, displayName: ch.user.displayName },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      excludeCredentials: ch.credentialIds.map((id) => ({ type: 'public-key' as const, id: fromB64u(id) })),
      attestation: 'none',
      timeout: 90_000
    }
  }) as PublicKeyCredential | null;
  if (!cred) throw new DOMException('cancelled', 'NotAllowedError');
  const r = cred.response as AuthenticatorAttestationResponse;
  return { credentialId: cred.id, clientDataJSON: toB64u(r.clientDataJSON), attestationObject: toB64u(r.attestationObject), label: deviceLabel() };
}

export async function signWithDevice(ch: DeviceChallenge) {
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: fromB64u(ch.challenge),
      rpId: location.hostname,
      allowCredentials: ch.credentialIds.map((id) => ({ type: 'public-key' as const, id: fromB64u(id) })),
      userVerification: 'required',
      timeout: 60_000
    }
  }) as PublicKeyCredential | null;
  if (!cred) throw new DOMException('cancelled', 'NotAllowedError');
  const r = cred.response as AuthenticatorAssertionResponse;
  return { credentialId: cred.id, clientDataJSON: toB64u(r.clientDataJSON), authenticatorData: toB64u(r.authenticatorData), signature: toB64u(r.signature) };
}

/** رسالة مفهومة لأخطاء المتصفح */
export function deviceErrorText(e: unknown, registering = false) {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError') return registering
    ? 'لم يكتمل التسجيل: أُلغي التحقق أو انتهت مهلته. حاول مرة أخرى وأكمل التحقق بوجهك أو بصمتك.'
    : 'لم يكتمل التحقق: أُلغي أو انتهت مهلته، أو أن هذا ليس الجهاز المسجّل لك.';
  if (name === 'InvalidStateError') return 'هذا الجهاز مسجّل مسبقاً.';
  if (name === 'SecurityError') return 'هذا الموقع غير مؤهل لبصمة الجهاز. افتح البوابة من رابطها الرسمي.';
  if (name === 'NotSupportedError') return 'جهازك أو متصفحك لا يدعم بصمة الجهاز.';
  return e instanceof Error && e.message && !name ? e.message : 'تعذّر التحقق ببصمة الجهاز.';
}
