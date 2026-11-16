import { useEffect, useState, type ReactNode } from 'react';
import { tr } from '../../lib/i18n';
import { useAuth } from '../../app/auth';
import { useAction, useApi } from '../../lib/useApi';
import { dmy, formatDateTime } from '../../lib/format';
import { Badge } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Checkbox, Select, TextInput, Textarea } from '../../ui/Field';
import { Dialog, useToast } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { filePayload } from './files';
import type { CustodyStatus, CustodyView, Holder, Lookups, ExpenseView, SignLinkInfo, StageStep, VoucherView } from './types';

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

/** فلوس ← "1,234.500 د.ك" */
export function kwd(fils: number, currency = true) {
  const f = Math.round(fils || 0);
  const sign = f < 0 ? '-' : '';
  const a = Math.abs(f);
  const s = Math.floor(a / 1000).toLocaleString('en-US') + '.' + String(a % 1000).padStart(3, '0');
  return sign + s + (currency ? ' ' + tr("د.ك") : '');
}

/** فلوس ← نص للحقل: "12.5" */
export const toInput = (fils: number) => (fils ? String(fils / 1000) : '');

export function Money({ fils, className, strong }: { fils: number; className?: string; strong?: boolean }) {
  return <span className={cx('num ltr inline-block whitespace-nowrap', fils < 0 && 'text-bad', strong && 'font-semibold', className)}>{kwd(fils)}</span>;
}

export function useCustodyRole() {
  const { user, roles } = useAuth();
  const admin = !!user?.isSuperAdmin;
  return { admin, staff: admin || roles.custody === 'accountant', holder: roles.custody === 'holder' || roles.custody === 'accountant' || admin };
}

export const useLookups = () => useApi<Lookups>('cus.lookups', {}, { staleTime: 5 * 60_000 });

export const STATUS_TONE: Record<CustodyStatus, Tone> = { open: 'ok', pending: 'warn', signing: 'info', closed: 'neutral' };
export const V_TONE: Record<VoucherView['status'], Tone> = { requested: 'warn', active: 'ok', rejected: 'bad', cancelled: 'neutral' };

export function StatusBadge({ c }: { c: CustodyView }) {
  const tone = c.status === 'open' && c.stage !== 'received' ? 'warn' : STATUS_TONE[c.status];
  return <Badge tone={tone}>{c.statusLabel}</Badge>;
}

/** المتاح والمصروف والمتبقي مع شريط الصرف */
export function BalanceBar({ c, compact }: { c: CustodyView; compact?: boolean }) {
  const pct = Math.min(100, c.percent);
  return (
    <div className="flex flex-col gap-2">
      <div className={cx('grid gap-3', compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4')}>
        {!compact && <Fact k={tr("مبلغ العهدة")} v={<Money fils={c.amount} />} />}
        <Fact k={tr("المتاح")} v={<Money fils={c.available} />} />
        <Fact k={tr("المصروف")} v={<Money fils={c.totalSpent} />} />
        <Fact k={tr("المتبقي")} v={<Money fils={c.remaining} strong />} />
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-chip" role="progressbar" aria-valuenow={c.percent} aria-valuemin={0} aria-valuemax={100} aria-label={tr("نسبة الصرف")}>
        <div className={cx('h-full rounded-full', c.overspent ? 'bg-bad-solid' : c.alert ? 'bg-warn' : 'bg-ok')} style={{ width: pct + '%' }} />
      </div>
      <span className="text-[12px] text-muted">
        {tr("صُرف {0}% من المتاح", c.percent)}
        {c.carriedBalance ? ' · ' + tr("رصيد مرحّل {0} ({1})", kwd(c.carriedBalance), c.carryModeLabel) : ''}
        {c.overspent ? ' · ' + tr("تجاوز المتاح") : c.alert ? ' · ' + tr("قارب على النفاد") : ''}
      </span>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: ReactNode }) {
  return <div className="flex min-w-0 flex-col"><span className="text-[12px] text-muted">{k}</span><span className="truncate">{v}</span></div>;
}

/** شريط مراحل العهدة */
export function StageBar({ steps }: { steps: StageStep[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-0 p-0">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex flex-col items-center">
            <span className={cx('mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold',
              s.state === 'done' ? 'bg-ok text-white' : s.state === 'current' ? 'bg-accent text-on-accent' : 'bg-chip text-muted')}>
              {s.state === 'done' ? <Icon name="check" size={14} strokeWidth={2.6} /> : i + 1}
            </span>
            {i < steps.length - 1 && <span className={cx('w-0.5 flex-1', s.state === 'done' ? 'bg-ok' : 'bg-line')} style={{ minHeight: 14 }} />}
          </span>
          <span className="flex min-w-0 flex-col pb-3">
            <span className={cx('font-medium', s.state === 'todo' && 'text-muted')}>{s.label}</span>
            {(s.at || s.by || s.note) && (
              <span className="text-[12px] text-muted">{[s.by, s.at ? formatDateTime(s.at) : '', s.note].filter(Boolean).join(' · ')}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

// ───────── نافذة البند (مصروف أو مقبوض إضافي) ─────────
interface ExpenseForm { entryType: 'expense' | 'receipt'; date: string; amount: string; description: string; category: string; project: string; docType: string; noAttachmentReason: string; vendor: string; invoiceNo: string }

export function ExpenseDialog({ open, onClose, custodyId, expense }: { open: boolean; onClose: () => void; custodyId: string; expense: ExpenseView | null }) {
  const lk = useLookups();
  const blank = (): ExpenseForm => ({ entryType: 'expense', date: lk.data?.today || '', amount: '', description: '', category: '', project: '', docType: '', noAttachmentReason: '', vendor: '', invoiceNo: '' });
  const [f, setF] = useState<ExpenseForm>(blank);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    setF(expense ? {
      entryType: expense.entryType, date: expense.date, amount: toInput(expense.amount), description: expense.description, category: expense.category,
      project: expense.project, docType: expense.docType, noAttachmentReason: expense.noAttachmentReason, vendor: expense.vendor, invoiceNo: expense.invoiceNo
    } : blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense]);
  const save = useAction('cus.expense.save', { invalidate: ['cus.get', 'cus.home', 'cus.list'], success: tr("حُفظ البند"), silentError: true, onSuccess: onClose });
  const set = (k: keyof ExpenseForm) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const isExp = f.entryType === 'expense';
  const L = lk.data;
  return (
    <Dialog open={open} onClose={onClose} title={expense ? tr("تعديل بند") : tr("إضافة بند")}
      onSubmit={() => { setError(''); save.mutate({ ...f, id: expense?.id, custodyId }, { onError: (e) => setError(e.message) }); }} footer={<><Button type="submit" variant="primary" className="flex-1" loading={save.isPending}
       >{tr("حفظ")}</Button>
        <Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={tr("نوع الحركة")}>
          {(['expense', 'receipt'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={f.entryType === t} onClick={() => setF({ ...f, entryType: t })}
              className={cx('h-10 rounded-lg border font-medium cursor-pointer', f.entryType === t ? 'border-accent bg-accent-soft text-accent-fg' : 'border-line bg-surface')}>
              {t === 'expense' ? tr("مصروف") : tr("مقبوض إضافي")}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextInput label={tr("التاريخ")} type="date" required max={L?.today} value={f.date} onChange={set('date')} />
          <TextInput label={tr("المبلغ (د.ك)")} required inputMode="decimal" ltr value={f.amount} onChange={set('amount')} placeholder="0.000" />
        </div>
        <TextInput label={tr("البيان")} required value={f.description} onChange={set('description')} maxLength={300} />
        {isExp && <Select label={tr("التصنيف")} required value={f.category} onChange={set('category')} options={[{ value: '', label: tr("اختر") }, ...(L?.categories || []).map((x) => ({ value: x, label: x }))]} />}
        <div className="grid grid-cols-2 gap-3">
          <Select label={tr("المشروع (اختياري)")} value={f.project} onChange={set('project')} options={[{ value: '', label: '—' }, ...(L?.projects || []).map((x) => ({ value: x.name, label: x.name + (x.type === 'debt' ? ' · ' + x.typeLabel : '') }))]} />
          <Select label={tr("نوع المستند")} value={f.docType} onChange={set('docType')} options={[{ value: '', label: '—' }, ...(L?.docTypes || []).map((x) => ({ value: x, label: x }))]} />
        </div>
        {isExp && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <TextInput label={tr("المورد (اختياري)")} value={f.vendor} onChange={set('vendor')} />
              <TextInput label={tr("رقم الفاتورة (اختياري)")} value={f.invoiceNo} onChange={set('invoiceNo')} />
            </div>
            <TextInput label={tr("سبب عدم وجود مرفق")} value={f.noAttachmentReason} onChange={set('noAttachmentReason')}
              hint={L?.drive ? tr("اتركه فارغاً إن أرفقت صورة الفاتورة") : tr("إلى أن يُفعَّل رفع المرفقات: اذكر أين الفاتورة (مثل: الأصل الورقي لدى المحاسب)")} />
          </>
        )}
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}

// ───────── فتح عهدة (المحاسب) ─────────
export function OpenCustodyDialog({ open, onClose, preset }: { open: boolean; onClose: (id?: string) => void; preset?: { employeeId: string; amount: number; requestId: string } }) {
  const holders = useApi<Holder[]>('cus.holders', {}, { enabled: open });
  const lk = useLookups();
  const [f, setF] = useState({ employeeId: '', amount: '', carryMode: 'add', openDate: '', paymentMethod: 'cash', chequeNo: '', notes: '', requestId: '' });
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setError('');
      setF({ employeeId: preset?.employeeId || '', amount: toInput(preset?.amount || lk.data?.defaultAmount || 100000), carryMode: 'add', openDate: lk.data?.today || '', paymentMethod: 'cash', chequeNo: '', notes: '', requestId: preset?.requestId || '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const act = useAction<Record<string, unknown>, CustodyView>('cus.open', { invalidate: ['cus.list', 'cus.home', 'cus.request.list', 'cus.voucher.list'], success: (c) => tr("فُتحت العهدة {0}", c.id), silentError: true, onSuccess: (c) => onClose(c.id) });
  const h = (holders.data || []).find((x) => x.id === f.employeeId);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={open} onClose={() => onClose()} title={tr("فتح عهدة جديدة")}
      onSubmit={() => { setError(''); act.mutate(f, { onError: (e) => setError(e.message) }); }} footer={<><Button type="submit" variant="primary" className="flex-1" loading={act.isPending}>{tr("فتح العهدة وإصدار سند الصرف")}</Button>
        <Button variant="ghost" onClick={() => onClose()}>{tr("تراجع")}</Button></>}>
      <div className="flex flex-col gap-3">
        <Select label={tr("الموظف")} required value={f.employeeId} onChange={set('employeeId')} disabled={!!preset}
          options={[{ value: '', label: tr("اختر الموظف") }, ...(holders.data || []).map((x) => ({ value: x.id, label: x.fullName + (x.activeCustodyId ? ' — ' + x.activeStatusLabel : '') }))]} />
        {h?.activeCustodyId && <div className="rounded-lg bg-warn-bg px-3 py-2.5 text-warn">{tr("لديه عهدة نشطة ({0}) يجب إقفالها أولاً.", h.activeCustodyId)}</div>}
        {h && !!h.carried && (
          <div className="flex flex-col gap-2 rounded-lg bg-bg p-3">
            <span>{tr("رصيد مرحّل من {0}:", h.carryFromLabel)} <Money fils={h.carried} strong /></span>
            <Select label={tr("طريقة احتساب الرصيد المرحّل")} value={f.carryMode} onChange={set('carryMode')}
              options={[{ value: 'add', label: tr("يُضاف إلى المبلغ") }, { value: 'include', label: tr("يُحتسب ضمن المبلغ (يُكمَّل السند للمبلغ)") }]} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <TextInput label={tr("مبلغ العهدة (د.ك)")} required inputMode="decimal" ltr value={f.amount} onChange={set('amount')} />
          <TextInput label={tr("تاريخ الفتح")} type="date" required max={lk.data?.today} value={f.openDate} onChange={set('openDate')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label={tr("طريقة الصرف")} value={f.paymentMethod} onChange={set('paymentMethod')} options={(lk.data?.paymentMethods || []).map((m) => ({ value: m.id, label: m.label }))} />
          {f.paymentMethod === 'cheque' && <TextInput label={tr("رقم الشيك")} value={f.chequeNo} onChange={set('chequeNo')} />}
        </div>
        <Textarea label={tr("ملاحظات (اختياري)")} value={f.notes} onChange={set('notes')} maxLength={500} />
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}

// ───────── سند يدوي أو طلب سند ─────────
export function VoucherFormDialog({ open, onClose, request }: { open: boolean; onClose: () => void; request: boolean }) {
  const lk = useLookups();
  const [f, setF] = useState({ type: 'payment', partyName: '', amount: '', reason: '', date: '', paymentMethod: 'cash', chequeNo: '' });
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setError(''); setF({ type: 'payment', partyName: '', amount: '', reason: '', date: lk.data?.today || '', paymentMethod: 'cash', chequeNo: '' }); } }, [open, lk.data?.today]);
  const act = useAction(request ? 'cus.voucher.request' : 'cus.voucher.create', { invalidate: ['cus.voucher.list', 'cus.home'], success: request ? tr("أُرسل طلب السند إلى المحاسب") : tr("صدر السند"), silentError: true, onSuccess: onClose });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={open} onClose={onClose} title={request ? tr("طلب سند") : tr("إصدار سند")}
      onSubmit={() => { setError(''); act.mutate(f, { onError: (e) => setError(e.message) }); }} footer={<><Button type="submit" variant="primary" className="flex-1" loading={act.isPending}>{request ? tr("إرسال الطلب") : tr("إصدار")}</Button>
        <Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={tr("نوع السند")}>
          {(['payment', 'receipt'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={f.type === t} onClick={() => setF({ ...f, type: t })}
              className={cx('h-10 rounded-lg border font-medium cursor-pointer', f.type === t ? 'border-accent bg-accent-soft text-accent-fg' : 'border-line bg-surface')}>
              {t === 'payment' ? tr("سند صرف") : tr("سند قبض")}
            </button>
          ))}
        </div>
        <TextInput label={f.type === 'payment' ? tr("اسم المستلم") : tr("اسم الدافع")} required value={f.partyName} onChange={set('partyName')} />
        <div className="grid grid-cols-2 gap-3">
          <TextInput label={tr("المبلغ (د.ك)")} required inputMode="decimal" ltr value={f.amount} onChange={set('amount')} />
          {!request && <TextInput label={tr("تاريخ السند")} type="date" required max={lk.data?.today} value={f.date} onChange={set('date')} />}
        </div>
        <TextInput label={tr("البيان")} required value={f.reason} onChange={set('reason')} maxLength={300} />
        <div className="grid grid-cols-2 gap-3">
          <Select label={tr("طريقة الدفع")} value={f.paymentMethod} onChange={set('paymentMethod')} options={(lk.data?.paymentMethods || []).map((m) => ({ value: m.id, label: m.label }))} />
          {f.paymentMethod === 'cheque' && <TextInput label={tr("رقم الشيك")} value={f.chequeNo} onChange={set('chequeNo')} />}
        </div>
        {request && <p className="m-0 text-[13px] text-muted">{tr("يحصل السند على رقمه بعد موافقة المحاسب، ثم يوقّعه المدير.")}</p>}
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}

// ───────── توقيع الإدارة: رابط للمدير أو تأكيد التوقيع الورقي ─────────
export function SignActions({ kind, id, info, onDone }: { kind: 'voucher' | 'statement'; id: string; info: SignLinkInfo | null; onDone?: () => void }) {
  const toast = useToast();
  const [link, setLink] = useState<{ url: string; text: string; wa: string } | null>(null);
  const [paper, setPaper] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const create = useAction<Record<string, unknown>, { token: string; label: string; amount: number; expiresAt: string; managerName: string; phone: string }>('cus.sign.create', {
    invalidate: ['cus.get', 'cus.voucher.list'], silentError: true,
    onSuccess: (r) => {
      const url = location.origin + location.pathname + '#/sign/' + r.token;
      const text = tr("السلام عليكم {0}،\n{1} بمبلغ {2} بانتظار توقيعكم:\n{3}\nالرابط صالح حتى {4}", r.managerName, r.label, kwd(r.amount), url, formatDateTime(r.expiresAt));
      setLink({ url, text, wa: 'https://wa.me/' + (r.phone || '') + '?text=' + encodeURIComponent(text) });
      onDone?.();
    }
  });
  const mark = useAction('cus.markSigned', { invalidate: ['cus.get', 'cus.list', 'cus.home', 'cus.voucher.list'], success: tr("سُجّل توقيع الإدارة"), silentError: true, onSuccess: () => { setPaper(false); onDone?.(); } });
  const drive = !!useLookups().data?.drive;
  const qc = useQueryClient();
  const [upBusy, setUpBusy] = useState(false);
  const uploadSigned = async (file?: File) => {
    if (!file) return;
    setUpBusy(true); setError('');
    try {
      await api('cus.signed.upload', { kind, id, ...(await filePayload(file)) });
      toast(tr("رُفعت النسخة الموقّعة"));
      ['cus.get', 'cus.list', 'cus.home', 'cus.voucher.list'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onDone?.();
    } catch (e) { setError(e instanceof Error ? e.message : tr("تعذّر رفع الملف.")); }
    finally { setUpBusy(false); }
  };
  const statusText: Record<SignLinkInfo['status'], string> = { open: tr("أُرسل رابط التوقيع للمدير"), expired: tr("انتهت صلاحية آخر رابط"), signed: tr("وقّع المدير"), rejected: tr("رفض المدير"), revoked: tr("أُبطل الرابط") };
  return (
    <div className="flex flex-col gap-2">
      {info && (
        <span className="text-[13px] text-muted">
          {statusText[info.status]} · {formatDateTime(info.actedAt || info.createdAt)}{info.rejectReason ? ' — ' + info.rejectReason : ''}
        </span>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon="key" loading={create.isPending} onClick={() => { setError(''); create.mutate({ kind, id }, { onError: (e) => setError(e.message) }); }}>
          {info?.status === 'open' ? tr("رابط جديد للمدير") : tr("إرسال للمدير للتوقيع")}
        </Button>
        <Button size="sm" variant="ghost" icon="check" onClick={() => { setNote(''); setError(''); setPaper(true); }}>{tr("وقّع ورقياً")}</Button>
        {drive && (
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-accent-fg hover:bg-chip">
            <Icon name="download" size={16} className="rotate-180" />{upBusy ? tr("جارٍ الرفع") : tr("رفع النسخة الموقّعة")}
            <input type="file" accept="image/*,application/pdf" className="sr-only" disabled={upBusy} onChange={(ev) => { uploadSigned(ev.target.files?.[0]); ev.target.value = ''; }} />
          </label>
        )}
      </div>
      {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-bad">{error}</div>}
      <Dialog open={!!link} onClose={() => setLink(null)} title={tr("رابط توقيع المدير")}
        footer={<>
          <a href={link?.wa} target="_blank" rel="noreferrer" className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 font-semibold text-white no-underline">{tr("إرسال عبر واتساب")}</a>
          <Button onClick={async () => { try { await navigator.clipboard.writeText(link?.text || ''); toast(tr("تم النسخ")); } catch { /* لا حافظة */ } }}>{tr("نسخ")}</Button>
        </>}>
        <div className="flex flex-col gap-2">
          <p className="m-0 text-muted">{tr("الرابط لمرة واحدة وصالح 7 أيام. يفتحه المدير بلا حساب، فيرى المستند ويوقّع أو يرفض مع السبب.")}</p>
          <pre className="m-0 whitespace-pre-wrap break-all rounded-lg bg-bg p-3 text-[13px] ltr text-left">{link?.url}</pre>
        </div>
      </Dialog>
      <Dialog open={paper} onClose={() => setPaper(false)} title={tr("تأكيد توقيع الإدارة ورقياً")}
        onSubmit={() => { setError(''); mark.mutate({ kind, id, note }, { onError: (e) => setError(e.message) }); }} footer={<><Button type="submit" variant="primary" className="flex-1" loading={mark.isPending}>{tr("تأكيد")}</Button>
          <Button variant="ghost" onClick={() => setPaper(false)}>{tr("تراجع")}</Button></>}>
        <div className="flex flex-col gap-3">
          <p className="m-0 text-muted">{kind === 'voucher' ? tr("استخدمه إذا وقّع المدير على السند المطبوع. سند صرف العهدة ينقلها إلى «جاري الصرف».") : tr("استخدمه إذا وقّع المدير على الكشف المطبوع. تُغلق العهدة نهائياً.")}</p>
          <TextInput label={tr("ملاحظة (اختياري)")} value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("مثال: الأصل محفوظ في ملف 2026")} />
          {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-bad">{error}</div>}
        </div>
      </Dialog>
    </div>
  );
}

/** تأكيد بنص */
export function CheckLine({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <Checkbox label={label} checked={checked} onChange={onChange} />;
}

export const dateLabel = (d: string) => (d ? dmy(d) : '');
