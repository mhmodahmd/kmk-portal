import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { formatDateTime } from '../../lib/format';
import { ErrorBox, Loader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { dateLabel, kwd } from './shared';
import { loadAttachmentPages, type AttachmentPage } from './attachmentPages';
import type { SignBox, StatementDoc, VoucherDoc } from './types';

/** ترويسة المطبوعات */
function Head({ company, title, sub }: { company: VoucherDoc['company']; title: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b-2 border-fg pb-3">
      <div className="flex flex-col">
        <span className="text-[17px] font-bold">{company.name}</span>
        {(company.address || company.phone) && <span className="text-[12px] text-muted">{[company.address, company.phone].filter(Boolean).join(' · ')}</span>}
      </div>
      <div className="flex flex-col items-end text-end">
        <span className="text-[20px] font-bold">{title}</span>
        {sub && <span className="num ltr text-[13px]">{sub}</span>}
      </div>
    </div>
  );
}

function SignArea({ box }: { box: SignBox }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center">
      <span className="text-[12px] text-muted">{box.label}</span>
      <div className="flex h-[64px] w-full items-end justify-center border-b border-fg/60">
        {box.image && <img src={box.image} alt={tr("توقيع {0}", box.name)} className="max-h-[60px] max-w-[150px] object-contain" />}
      </div>
      <span className="text-[13px] font-medium">{box.name || '—'}</span>
    </div>
  );
}

export function VoucherDocument({ doc }: { doc: VoucherDoc }) {
  const v = doc.voucher;
  const row = (k: string, val: string) => (
    <div className="flex gap-3 border-b border-line py-2"><span className="w-32 shrink-0 text-muted">{k}</span><span className="min-w-0 flex-1 font-medium">{val}</span></div>
  );
  return (
    <div className="kmk-doc flex flex-col gap-4 bg-white p-6 text-[14px] text-black">
      <Head company={doc.company} title={v.typeLabel} sub={v.number} />
      {v.status === 'cancelled' && <div className="rounded border-2 border-bad px-3 py-2 text-center font-bold text-bad">{tr("ملغي: {0}", v.cancelReason)}</div>}
      {v.status === 'signing' && <div className="rounded border-2 border-dashed border-black/40 px-3 py-2 text-center font-bold">{tr("بانتظار اعتماد المدير — غير ساري بعد")}</div>}
      <div className="flex flex-wrap justify-between gap-2">
        <span>{tr("التاريخ:")} <b className="num">{dateLabel(v.date)}</b></span>
        <span className="rounded border-2 border-fg px-4 py-1 text-[18px] font-bold num ltr">{kwd(v.amount)}</span>
      </div>
      <div className="flex flex-col">
        {row(v.type === 'payment' ? tr("اصرفوا إلى") : tr("استلمنا من"), v.partyName)}
        {row(tr("مبلغ وقدره"), v.amountInWords)}
        {row(tr("وذلك عن"), v.reason)}
        {row(tr("طريقة الدفع"), v.paymentMethodLabel + (v.chequeNo ? ' — ' + tr("شيك رقم {0}", v.chequeNo) : ''))}
        {v.custodyId && row(tr("العهدة"), v.custodyId + ' — ' + v.custodyLabel)}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">{doc.signs.map((b) => <SignArea key={b.label} box={b} />)}</div>
      {v.signed && <span className="text-[11px] text-muted">{tr("وقّعته الإدارة: {0} · {1}", v.signedByName, formatDateTime(v.signedAt))}</span>}
    </div>
  );
}

export function StatementDocument({ doc }: { doc: StatementDoc }) {
  const c = doc.custody;
  let n = 0;
  return (
    <div className="kmk-doc flex flex-col gap-4 bg-white p-6 text-[13px] text-black">
      <Head company={doc.company} title={tr("كشف تسوية عهدة")} sub={c.id} />
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
        <span>{tr("الموظف:")} <b>{c.employeeName}</b></span>
        <span>{tr("الفترة:")} <b>{c.periodLabel}</b></span>
        <span>{tr("تاريخ الفتح:")} <b className="num">{dateLabel(c.openDate)}</b></span>
        <span>{tr("مبلغ العهدة:")} <b className="num ltr inline-block">{kwd(c.amount)}</b></span>
        <span>{tr("الرصيد المرحّل:")} <b className="num ltr inline-block">{kwd(c.carriedBalance)}</b></span>
        <span>{tr("مقبوضات إضافية:")} <b className="num ltr inline-block">{kwd(c.totalReceipts)}</b></span>
      </div>
      <table className="w-full border-collapse text-start">
        <thead><tr className="bg-print-head">{['#', tr("التاريخ"), tr("البيان"), tr("التصنيف"), tr("المستند"), tr("المبلغ")].map((h) => <th key={h} className="border border-print-line px-2 py-1.5 text-start">{h}</th>)}</tr></thead>
        <tbody>
          {doc.expenses.map((e) => (
            <tr key={e.id}>
              <td className="border border-print-line px-2 py-1 num">{e.entryType === 'expense' ? ++n : '+'}</td>
              <td className="border border-print-line px-2 py-1 num whitespace-nowrap">{dateLabel(e.date)}</td>
              <td className="border border-print-line px-2 py-1">{e.description}{e.project ? ' — ' + e.project : ''}</td>
              <td className="border border-print-line px-2 py-1">{e.entryType === 'receipt' ? e.entryLabel : e.category}</td>
              <td className="border border-print-line px-2 py-1">{e.docType || (e.noAttachmentReason ? tr("بلا مرفق") : '')}</td>
              <td className="border border-print-line px-2 py-1 num ltr text-right whitespace-nowrap">{kwd(e.entryType === 'receipt' ? e.amount : e.amount, false)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={5} className="border border-print-line px-2 py-1.5 font-bold">{tr("إجمالي المصروفات")}</td><td className="border border-print-line px-2 py-1.5 font-bold num ltr text-right">{kwd(c.totalSpent, false)}</td></tr>
          <tr><td colSpan={5} className="border border-print-line px-2 py-1.5 font-bold">{tr("الرصيد المتبقي")}</td><td className="border border-print-line px-2 py-1.5 font-bold num ltr text-right">{kwd(c.remaining, false)}</td></tr>
        </tfoot>
      </table>
      {c.settlementLabel && <span>{tr("طريقة التسوية: {0}", c.settlementLabel)}{doc.vouchers.find((v) => v.id === c.settlementVoucherId) ? ' — ' + doc.vouchers.find((v) => v.id === c.settlementVoucherId)!.number : ''}</span>}
      <div className="mt-6 grid grid-cols-3 gap-6">
        <SignArea box={{ label: tr("صاحب العهدة"), name: doc.signs.holder.name, image: doc.signs.holder.image }} />
        <SignArea box={{ label: tr("المحاسب"), name: doc.signs.reviewer.name, image: doc.signs.reviewer.image }} />
        <SignArea box={{ label: tr("المدير"), name: doc.signs.manager.name, image: doc.signs.manager.image }} />
      </div>
    </div>
  );
}

function PrintFrame({ children, title, extra }: { children: React.ReactNode; title: string; extra?: React.ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 no-print">
        <Button icon="chevron" onClick={() => nav(-1)}>{tr("رجوع")}</Button>
        <span className="font-semibold">{title}</span>
        <span className="ms-auto flex flex-wrap items-center gap-2">
          {extra}
          <Button variant="primary" icon="printer" onClick={() => window.print()}>{tr("طباعة أو حفظ PDF")}</Button>
        </span>
      </div>
      <div className="mx-auto w-full max-w-[820px] overflow-hidden rounded-xl border border-line print:border-0">{children}</div>
    </div>
  );
}

/** صفحة لكل مرفق بعد الكشف: رأس يعرّف البند ثم الصورة (أو صفحات PDF) بحجم الورقة */
function AttachmentPages({ pages }: { pages: AttachmentPage[] }) {
  return (
    <>
      {pages.map((p) => (
        <section key={p.key} className="kmk-doc print-page flex flex-col gap-3 border-t border-line bg-white p-6 text-[12px] text-black">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-print-line pb-2">
            <span className="font-bold">{p.no ? tr("مرفق البند {0}", p.no) : tr("مرفق مقبوض")}</span>
            <span className="num">{dateLabel(p.expense.date)}</span>
            <span className="min-w-0 flex-1">{p.expense.description}{p.expense.project ? ' — ' + p.expense.project : ''}</span>
            <span className="num ltr font-semibold">{kwd(p.expense.amount)}</span>
            <span className="w-full text-[11px] text-muted ltr text-right">{p.fileName}</span>
          </div>
          {p.error ? <p className="m-0 rounded border border-print-line px-3 py-2 text-muted">{p.error}</p> : p.images.map((src, i) => (
            <img key={i} src={src} alt={tr("مرفق البند {0}", p.no) + (p.images.length > 1 ? ` · ${i + 1}` : '')} className={cx('mx-auto max-h-[235mm] max-w-full object-contain', i > 0 && 'print-page')} />
          ))}
        </section>
      ))}
    </>
  );
}

export function VoucherPrintPage() {
  const { id = '' } = useParams();
  const q = useApi<VoucherDoc>('cus.voucher.get', { id });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  return <PrintFrame title={q.data.voucher.typeLabel + ' ' + q.data.voucher.number}><VoucherDocument doc={q.data} /></PrintFrame>;
}

export function StatementPrintPage() {
  const { id = '' } = useParams();
  const q = useApi<StatementDoc>('cus.statement', { id });
  // «مع المرفقات»: تُجلب كل مرفقات البنود وتُضاف صفحةً لكل مرفق بعد الكشف، ثم يُفتح حوار الطباعة
  const [pages, setPages] = useState<AttachmentPage[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const total = (q.data?.expenses || []).reduce((a, e) => a + e.attachments.length, 0);
  const withAttachments = async () => {
    if (!q.data) return;
    setProgress({ done: 0, total });
    try {
      const out = await loadAttachmentPages(q.data.expenses, (done, all) => setProgress({ done, total: all }));
      setPages(out);
      setTimeout(() => window.print(), 300);
    } finally { setProgress(null); }
  };
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  const failed = (pages || []).filter((p) => p.error).length;
  return (
    <PrintFrame title={tr("كشف تسوية {0}", q.data.custody.id)}
      extra={total > 0 && (pages
        ? <>
          {failed > 0 && <span className="text-[13px] text-warn">{tr("{0} مرفقاً تعذّر جلبه", failed)}</span>}
          <Button icon="x" onClick={() => setPages(null)}>{tr("بلا مرفقات")}</Button>
        </>
        : <Button icon="file" loading={!!progress} onClick={withAttachments}>
          {progress ? tr("جارٍ تجهيز المرفقات {0}/{1}", progress.done, progress.total) : tr("طباعة مع المرفقات ({0})", total)}
        </Button>)}>
      <StatementDocument doc={q.data} />
      {pages && <AttachmentPages pages={pages} />}
    </PrintFrame>
  );
}
