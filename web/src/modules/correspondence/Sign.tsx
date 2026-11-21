/**
 * التوقيع من النظام (المرحلة 4): توقيعي للمستندات، اعتماد التواقيع (مدير النظام)، حوار التوقيع بإعادة التحقق
 * وختم PDF في المتصفح (pdf-lib)، وصفحة التحقق من رمز التوقيع.
 */
import { useState } from 'react';
import { tr } from '../../lib/i18n';
import { api, ApiError } from '../../lib/api';
import { useAction, useApi } from '../../lib/useApi';
import { formatDateTime } from '../../lib/format';
import { hasPasskeyHere, signWithDevice, type DeviceChallenge } from '../../lib/webauthn';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Loader, PageHeader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { PasswordInput, TextInput, Textarea } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { SignaturePad } from '../../ui/SignaturePad';
import { COR_KEYS } from './shared';

interface MySignature { signature: { data: string; status: 'pending' | 'approved'; approvedAt: string; updatedAt: string } | null; hasCustody: boolean }

/** «ملفي»: توقيعي الذي يُختم على المستندات في مراحل التوقيع */
export function DocSignatureCard() {
  const q = useApi<MySignature>('sign.mine');
  const [drawing, setDrawing] = useState(false);
  const [sig, setSig] = useState('');
  const save = useAction<Record<string, unknown>>('sign.save', { invalidate: ['sign.mine'], success: tr("حُفظ التوقيع"), onSuccess: () => setDrawing(false) });
  const s = q.data?.signature;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col">
        <h2 className="m-0 text-[16px] font-semibold">{tr("توقيعي للمستندات")}</h2>
        <span className="text-[13px] text-muted">{tr("يُختم على المستند في مراحل «توقيع» بعد التحقق من هويتك. يعتمده مدير النظام قبل استخدامه.")}</span>
      </div>
      {q.isError ? <ErrorBox message={(q.error as Error).message} /> : !q.data ? <Loader /> : drawing ? (
        <>
          <SignaturePad onChange={setSig} height={150} />
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" disabled={!sig} loading={save.isPending} onClick={() => save.mutate({ data: sig })}>{tr("حفظ التوقيع")}</Button>
            <Button variant="ghost" onClick={() => setDrawing(false)}>{tr("تراجع")}</Button>
          </div>
        </>
      ) : (
        <>
          {s ? (
            <div className="flex flex-wrap items-center gap-3">
              <img src={s.data} alt={tr("توقيعي")} className="max-h-[90px] rounded-lg border border-line bg-white p-2" />
              <Badge tone={s.status === 'approved' ? 'ok' : 'warn'}>{s.status === 'approved' ? tr("معتمد") : tr("بانتظار اعتماد مدير النظام")}</Badge>
            </div>
          ) : <span className="text-muted">{tr("لم تضف توقيعك بعد.")}</span>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon="edit" onClick={() => { setSig(''); setDrawing(true); }}>{s ? tr("تغيير التوقيع") : tr("رسم التوقيع")}</Button>
            {q.data.hasCustody && <Button size="sm" variant="ghost" icon="copy" loading={save.isPending} onClick={() => save.mutate({ fromCustody: true })}>{tr("استخدام توقيع العهد")}</Button>}
            {s && <Button size="sm" variant="ghost" icon="trash" loading={save.isPending} onClick={() => save.mutate({ data: '' })}>{tr("حذف")}</Button>}
          </div>
        </>
      )}
    </Card>
  );
}

interface SigRow { id: string; userId: string; name: string; data: string; status: 'pending' | 'approved'; updatedAt: string; approvedAt: string }

/** «بيانات الشركة»: اعتماد تواقيع المستخدمين (مدير النظام) */
export function SignaturesAdminCard() {
  const q = useApi<SigRow[]>('sign.list');
  const decide = useAction<{ id: string; approve: boolean }>('sign.decide', { invalidate: ['sign.list'], success: (r) => (r ? tr("تم") : '') });
  const pending = (q.data || []).filter((s) => s.status === 'pending');
  return (
    <Card padded={false} className="max-w-2xl">
      <CardHeader title={pending.length ? tr("تواقيع المستندات · {0} بانتظار الاعتماد", pending.length) : tr("تواقيع المستندات")} />
      {q.isError ? <ErrorBox message={(q.error as Error).message} /> : !q.data ? <Loader /> : !q.data.length ? <EmptyState title={tr("لم يضف أحد توقيعه بعد")} /> : q.data.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-2.5">
          <img src={s.data} alt={s.name} className="h-12 max-w-[140px] rounded-md border border-line bg-white object-contain p-1" />
          <span className="flex min-w-0 flex-1 flex-col"><span className="font-semibold">{s.name}</span><span className="num text-[12px] text-muted">{formatDateTime(s.updatedAt)}</span></span>
          {s.status === 'approved' ? <Badge tone="ok">{tr("معتمد")}</Badge> : (
            <span className="flex gap-2">
              <Button size="sm" variant="primary" icon="check" onClick={() => decide.mutate({ id: s.id, approve: true })}>{tr("اعتماد")}</Button>
              <Button size="sm" variant="ghost" icon="x" onClick={() => decide.mutate({ id: s.id, approve: false })}>{tr("رفض")}</Button>
            </span>
          )}
        </div>
      ))}
      <p className="m-0 border-t border-line px-5 py-3 text-[13px] text-muted">{tr("اعتمد التوقيع بعد التأكد أنه لصاحبه. الرفض يحذفه ليضيفه صاحبه من جديد.")}</p>
    </Card>
  );
}

interface SignSource { data: string; fileName: string; sha256: string; signature: string; signer: string; jobTitle: string; step: string; number: string; date: string; code: string }

const toB64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const loadImg = (src: string) => new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error(tr("تعذّرت قراءة صورة التوقيع."))); i.src = src; });

/** كتلة التوقيع صورةً (الخطوط العربية من المتصفح): التوقيع والاسم والمسمى والتاريخ ورمز التحقق */
async function signatureBlock(src: SignSource) {
  const W = 900, H = 300, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#1F3A5F'; g.lineWidth = 3; g.strokeRect(2, 2, W - 4, H - 4);
  const img = await loadImg(src.signature);
  const k = Math.min(380 / img.naturalWidth, 190 / img.naturalHeight);
  g.drawImage(img, 30, (H - img.naturalHeight * k) / 2 - 10, img.naturalWidth * k, img.naturalHeight * k);
  g.direction = 'rtl'; g.textAlign = 'right'; g.fillStyle = '#111';
  g.font = 'bold 40px "IBM Plex Sans Arabic", Tahoma, sans-serif'; g.fillText(src.signer, W - 30, 70);
  g.font = '30px "IBM Plex Sans Arabic", Tahoma, sans-serif'; g.fillStyle = '#333';
  if (src.jobTitle) g.fillText(src.jobTitle, W - 30, 118);
  g.fillText(src.step + ' · ' + src.date.split('-').reverse().join('/'), W - 30, 166);
  g.fillText(tr("رمز التحقق: {0}", src.code), W - 30, 214);
  g.font = '24px "IBM Plex Sans Arabic", Tahoma, sans-serif'; g.fillStyle = '#666';
  g.fillText(tr("وُقّع إلكترونياً عبر KMK One · {0}", src.number), W - 30, 262);
  const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, 'image/png'));
  return new Uint8Array(await blob!.arrayBuffer());
}

/** يختم كتلة التوقيع أسفل يسار الصفحة الأخيرة ويعيد PDF جديداً (base64) */
async function stampPdf(src: SignSource) {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(Uint8Array.from(atob(src.data), (c) => c.charCodeAt(0)), { ignoreEncryption: true });
  const png = await pdf.embedPng(await signatureBlock(src));
  const pages = pdf.getPages(), page = pages[pages.length - 1], { width } = page.getSize();
  const w = Math.min(240, width * 0.42), h = w / 3;
  page.drawImage(png, { x: 36, y: 36, width: w, height: h });
  return toB64(await pdf.save());
}

/** حوار التوقيع: تحميل الملف ← التحقق (البصمة أو كلمة المرور) ← الختم ← الرفع */
export function SignDialog({ instanceId, letterId, onClose }: { instanceId: string; letterId: string; onClose: () => void }) {
  const src = useApi<SignSource>('cor.sign.source', { id: letterId }, { staleTime: 0, gcTime: 0, retry: false });
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'' | 'passkey' | 'password'>('');
  const [error, setError] = useState('');
  const sign = useAction<Record<string, unknown>>('wf.act', { invalidate: [...COR_KEYS, 'notify.list'], silentError: true, success: tr("وُقّع المستند"), onSuccess: onClose });
  const run = async (method: 'passkey' | 'password') => {
    if (!src.data) return;
    if (method === 'password' && !password) { setError(tr("اكتب كلمة المرور.")); return; }
    setError(''); setBusy(method);
    try {
      const auth: Record<string, unknown> = { method };
      if (method === 'passkey') auth.assertion = await signWithDevice(await api<DeviceChallenge>('auth.passkey.challenge'));
      else auth.password = password;
      const pdf = await stampPdf(src.data);
      await sign.mutateAsync({ instanceId, action: 'sign', pdf, code: src.data.code, note: note.trim(), ...auth });
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? (e.name === 'NotAllowedError' ? tr("أُلغي التحقق بالبصمة.") : e.message) : tr("تعذّر التوقيع."));
      // الرمز يُستخدم مرة: نجلب غيره للمحاولة التالية
      void src.refetch();
    } finally { setBusy(''); }
  };
  return (
    <Dialog open onClose={onClose} title={tr("توقيع المستند")}
      footer={<><Button variant="primary" icon="lock" className="flex-1" loading={busy === 'password'} disabled={!src.data || !!busy} onClick={() => run('password')}>{tr("توقيع بكلمة المرور")}</Button>
        <Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      {src.isError ? <ErrorBox message={(src.error as Error).message} /> : !src.data ? <Loader label={tr("جارٍ تجهيز الملف")} /> : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-lg border border-line p-3">
            <img src={src.data.signature} alt={tr("توقيعي")} className="h-14 max-w-[150px] rounded-md bg-white object-contain p-1" />
            <span className="flex min-w-0 flex-col text-[13px]">
              <b>{src.data.signer}</b><span className="text-muted">{[src.data.jobTitle, src.data.step].filter(Boolean).join(' · ')}</span>
              <span className="num text-muted">{tr("رمز التحقق: {0}", src.data.code)}</span>
            </span>
          </div>
          <p className="m-0 text-[13px] text-muted">{tr("يُختم توقيعك أسفل الصفحة الأخيرة من «{0}»، ويُحفظ الملف الموقّع إصداراً جديداً، وتنتقل السلسلة للمرحلة التالية.", src.data.fileName)}</p>
          {hasPasskeyHere() && <Button variant="secondary" icon="fingerprint" loading={busy === 'passkey'} disabled={!!busy} onClick={() => run('passkey')}>{tr("توقيع بالبصمة")}</Button>}
          <PasswordInput label={tr("كلمة المرور للتحقق")} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <Textarea label={tr("ملاحظة (اختياري)")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
        </div>
      )}
    </Dialog>
  );
}

interface VerifyResult { found: boolean; signer?: string; at?: string; method?: string; number?: string; title?: string; version?: number }

/** التحقق من رمز توقيع مطبوع على مستند */
export default function VerifyPage() {
  const [code, setCode] = useState('');
  const [res, setRes] = useState<VerifyResult | null>(null);
  const [error, setError] = useState('');
  const check = useAction<{ code: string }, VerifyResult>('sign.verify', { silentError: true, onSuccess: setRes });
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <PageHeader eyebrow={tr("المستندات")} title={tr("التحقق من توقيع")} subtitle={tr("اكتب رمز التحقق المطبوع أسفل كتلة التوقيع.")} />
      <Card>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setError(''); setRes(null); check.mutate({ code }, { onError: (x) => setError(x.message) }); }}>
          <TextInput label={tr("رمز التحقق")} ltr required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} className="min-w-[200px] flex-1" />
          <Button type="submit" variant="primary" loading={check.isPending}>{tr("تحقق")}</Button>
        </form>
        {error && <div role="alert" className="mt-3 rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
        {res && (res.found ? (
          <div className="mt-3 flex flex-col gap-1 rounded-lg bg-ok-bg px-3 py-2.5 text-ok">
            <b>{tr("التوقيع صحيح")}</b>
            <span>{tr("{0} وقّع {1} · {2}", res.signer || '', res.number || '', res.title || '')}</span>
            <span className="num text-[13px]">{formatDateTime(res.at || '')} · {tr("الإصدار {0}", res.version || 0)} · {res.method === 'passkey' ? tr("بالبصمة") : tr("بكلمة المرور")}</span>
          </div>
        ) : <div className="mt-3 rounded-lg bg-warn-bg px-3 py-2.5 text-warn">{tr("لا يوجد توقيع بهذا الرمز.")}</div>)}
      </Card>
    </div>
  );
}
