import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError, CLIENT_VERSION, IS_MOCK } from '../lib/api';
import type { SessionResult, SystemStatus } from '../lib/types';
import { useAuth } from './auth';
import { Button } from '../ui/Button';
import { Checkbox, PasswordInput, TextInput } from '../ui/Field';
import { ErrorBox, Loader } from '../ui/Display';
import { deviceErrorText, hasPasskeyHere, loginWithPasskey, markPasskeyHere, useDeviceSupport } from '../lib/webauthn';

const BASE = import.meta.env.BASE_URL;

function BrandPanel() {
  const cells = [];
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const tip = r < 5 ? r : 9 - r;
      const on = c === tip || c === tip + 1;
      const red = (c === tip + 4 || c === tip + 5) && r > 1 && r < 8;
      cells.push(<span key={r * 10 + c} className="rounded-[4px]" style={{ width: 22, height: 22, background: on ? '#FFFFFF' : red ? '#D30B0B' : '#2E2E2E' }} />);
    }
  }
  return (
    <div className="hidden lg:flex flex-1 basis-[560px] flex-col justify-between bg-[#232323] p-14 text-white">
      <img src={BASE + 'logo-on-dark.png'} alt="" className="h-[30px] w-auto self-start" />
      <div className="flex flex-col gap-9">
        <div aria-hidden="true" className="ltr grid self-start gap-1" style={{ gridTemplateColumns: 'repeat(10, 22px)' }}>{cells}</div>
        <div className="flex max-w-[460px] flex-col gap-3">
          <h2 className="m-0 text-[30px] font-bold leading-snug">كل أعمال الشركة في مكان واحد</h2>
          <p className="m-0 text-[16px] leading-loose text-[#C9CBD0]">الحضور والموارد البشرية والعهد والمهام والعملاء والمالية، بحساب واحد ومن أي جهاز.</p>
        </div>
      </div>
      <span className="text-[13px] text-[#9A9DA3]">شركة كي ام كي لتصميم المواقع الإلكترونية</span>
    </div>
  );
}

function MobileBrand() {
  return (
    <div className="lg:hidden bg-[#232323] px-6 pt-12 pb-7">
      <img src={BASE + 'logo-on-dark.png'} alt="KMK" className="h-7 w-auto" />
    </div>
  );
}

export default function LoginPage() {
  const status = useQuery({ queryKey: ['system.status'], queryFn: () => api<SystemStatus>('system.status'), staleTime: 0 });
  return (
    <div className="flex min-h-screen flex-col lg:flex-row bg-bg">
      <MobileBrand />
      <div className="flex flex-[999_1_520px] items-start lg:items-center justify-center px-6 py-8 lg:py-12">
        <div className="w-full max-w-[420px]">
          {status.isPending ? <Loader /> :
            status.isError ? <ErrorBox message={(status.error as Error).message} onRetry={() => status.refetch()} /> :
              status.data.needsSetup ? <SetupForm onDone={() => status.refetch()} /> : <LoginForm />}
          <div className="mt-8 flex flex-col gap-1 text-[13px] text-muted">
            {!status.data?.needsSetup && <span>نسيت كلمة المرور؟ تواصل مع مدير النظام لإعادة تعيينها.</span>}
            <span className="ltr text-right">v{CLIENT_VERSION}{IS_MOCK ? ' · mock' : ''}</span>
          </div>
        </div>
      </div>
      <BrandPanel />
    </div>
  );
}

function LoginForm() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const support = useDeviceSupport();
  const here = hasPasskeyHere();
  // التحدي يُجلب مسبقاً لأن Safari يشترط بدء التحقق مباشرة بعد الضغطة
  const options = useQuery({
    queryKey: ['auth.passkey.options'], queryFn: () => api<{ challenge: string }>('auth.passkey.options'),
    enabled: support === 'yes', staleTime: 4 * 60_000, refetchInterval: 4 * 60_000, gcTime: 0, retry: 1
  });

  async function biometric() {
    setError(''); setBioBusy(true);
    try {
      const fresh = options.data && Date.now() - options.dataUpdatedAt < 8 * 60_000;
      const ch = fresh ? options.data! : (await options.refetch()).data;
      if (!ch) throw new Error('تعذّر الاتصال بالخادم. حاول مرة أخرى.');
      const assertion = await loginWithPasskey(ch.challenge);
      const r = await api<SessionResult>('auth.passkey.login', { assertion, remember });
      markPasskeyHere();
      signIn(r);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      setError(name === 'NotAllowedError'
        ? 'لم يكتمل الدخول بالبصمة. إن لم تفعّلها على هذا الجهاز بعد، ادخل بكلمة المرور ثم فعّلها من «ملفي».'
        : err instanceof ApiError ? err.message : deviceErrorText(err));
      if (err instanceof ApiError && err.code === 'BAD_LOGIN') markPasskeyHere(false);
      void options.refetch();
    } finally { setBioBusy(false); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) { setError('أدخل اسم المستخدم وكلمة المرور.'); return; }
    setBusy(true); setError('');
    try {
      signIn(await api<SessionResult>('auth.login', { username, password, remember }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تسجيل الدخول.');
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <img src={BASE + 'logo.png'} alt="KMK" className="mb-4 hidden h-9 w-auto self-start lg:block lg:dark:hidden" />
        <img src={BASE + 'logo-on-dark.png'} alt="KMK" className="mb-4 hidden h-9 w-auto self-start lg:dark:block" />
        <h1 className="m-0 text-[28px] font-bold leading-tight">تسجيل الدخول</h1>
        <p className="m-0 text-[15px] text-muted">ادخل بحسابك في بوابة KMK.</p>
      </div>
      {support === 'yes' && here && (
        <>
          <Button type="button" variant="primary" size="lg" icon="fingerprint" loading={bioBusy} disabled={busy} onClick={biometric}>الدخول بالبصمة</Button>
          <div className="flex items-center gap-3 text-[13px] text-muted"><span className="h-px flex-1 bg-line" />أو بكلمة المرور<span className="h-px flex-1 bg-line" /></div>
        </>
      )}
      <TextInput label="اسم المستخدم" autoComplete="username" ltr placeholder="ahmad.ali" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" spellCheck={false} />
      <PasswordInput label="كلمة المرور" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <Checkbox label="تذكّرني على هذا الجهاز لمدة 30 يوماً" checked={remember} onChange={setRemember} />
      {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      <Button type="submit" variant={support === 'yes' && here ? 'secondary' : 'primary'} size="lg" loading={busy} disabled={bioBusy}>دخول</Button>
      {support === 'yes' && !here && (
        <Button type="button" variant="ghost" icon="fingerprint" loading={bioBusy} disabled={busy} onClick={biometric}>الدخول بالبصمة</Button>
      )}
    </form>
  );
}

function SetupForm({ onDone }: { onDone: () => void }) {
  const { signIn } = useAuth();
  const [f, setF] = useState({ companyName: 'شركة كي ام كي', fullName: '', username: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (f.password !== f.confirm) { setError('كلمتا المرور غير متطابقتين.'); return; }
    setBusy(true); setError('');
    try {
      signIn(await api<SessionResult>('auth.setup', { ...f, remember: true }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر إعداد النظام.');
      if (err instanceof ApiError && err.code === 'ALREADY_SETUP') onDone();
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[26px] font-bold leading-tight">إعداد البوابة لأول مرة</h1>
        <p className="m-0 text-muted leading-relaxed">أنشئ حساب مدير النظام. ستستخدمه لإضافة الموظفين وتحديد صلاحياتهم.</p>
      </div>
      <TextInput label="اسم الشركة" value={f.companyName} onChange={set('companyName')} />
      <TextInput label="اسمك الكامل" value={f.fullName} onChange={set('fullName')} autoComplete="name" />
      <TextInput label="اسم المستخدم" ltr value={f.username} onChange={set('username')} autoComplete="username" autoCapitalize="none" hint="حروف إنجليزية صغيرة وأرقام، مثل: khaled" />
      <PasswordInput label="كلمة المرور" value={f.password} onChange={set('password')} autoComplete="new-password" hint="8 أحرف على الأقل، حروف وأرقام" />
      <PasswordInput label="تأكيد كلمة المرور" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" />
      {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      <Button type="submit" variant="primary" size="lg" loading={busy}>إنشاء الحساب والدخول</Button>
    </form>
  );
}
