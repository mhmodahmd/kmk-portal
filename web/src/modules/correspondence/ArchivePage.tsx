/**
 * الأرشيف التاريخي (المرحلة 6): رفع ملفات PDF القديمة واحداً واحداً مع بيانات من Excel اختيارياً، ونص مستخرج (OCR) اقتراحاً،
 * وتدقيق كل مستند ثم اعتماده، والبحث في نص الملفات.
 */
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { tr } from '../../lib/i18n';
import { api, ApiError } from '../../lib/api';
import { useAction, useApi } from '../../lib/useApi';
import { dmy } from '../../lib/format';
import { readTable } from '../../lib/xlsx';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Pager, SearchBox, Segmented } from '../../ui/Controls';
import { Checkbox, Select, TextInput, Textarea } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import { DOC_MAX, filePayload, openFile } from '../custody/files';
import { LetterLine, useCorLookups } from './shared';
import type { LetterView } from './types';

type ArchiveRow = LetterView & { originalNo: string; reviewStatus: 'pending' | 'done'; ocrText: string };
interface ArchivePage { total: number; page: number; pageSize: number; canArchive: boolean; pending: number; rows: ArchiveRow[] }
interface Meta { typeId?: string; originalNo?: string; date?: string; party?: string; subject?: string; category?: string }
interface Job { file: File; meta: Meta; state: 'wait' | 'up' | 'done' | 'bad'; error?: string; number?: string }

const KEYS = ['cor.archive.list', 'cor.lookups'];
const HEAD: Record<string, keyof Meta | 'file'> = { 'اسم الملف': 'file', 'الملف': 'file', 'النوع': 'typeId', 'الرقم الأصلي': 'originalNo', 'التاريخ': 'date', 'الجهة': 'party', 'الموضوع': 'subject', 'التصنيف': 'category' };

/** تاريخ من Excel: yyyy-mm-dd أو dd/mm/yyyy أو رقم Excel التسلسلي */
function excelDate(v: string) {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{4,5}$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000).toISOString().slice(0, 10);
  return '';
}

export default function ArchivePage() {
  const lk = useCorLookups();
  const [review, setReview] = useState<'pending' | 'done' | ''>('pending');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [editing, setEditing] = useState<ArchiveRow | null>(null);
  const list = useApi<ArchivePage>('cor.archive.list', { review: review || undefined, q: q || undefined, page, pageSize: size });
  const L = lk.data, can = !!L?.canArchive;
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  return (
    <div className="flex flex-col gap-4">
      {can && <ImportCard />}
      <TextSearchCard />
      <Card padded={false}>
        <div className="flex flex-wrap items-end gap-3 px-5 pt-4">
          <Segmented label={tr("التدقيق")} value={review} onChange={(v) => { setReview(v); setPage(1); }}
            options={[{ value: 'pending', label: tr("بانتظار التدقيق"), count: list.data?.pending }, { value: 'done', label: tr("مدقّقة") }, { value: '', label: tr("الكل") }]} />
          <div className="min-w-[200px] flex-1"><SearchBox id="arc-search" value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={tr("بحث بالرقم أو الرقم الأصلي أو الموضوع أو النص")} /></div>
        </div>
        {list.isError ? <ErrorBox message={(list.error as Error).message} onRetry={() => list.refetch()} /> : !list.data ? <Loader /> : list.data.rows.length === 0 ? (
          <EmptyState title={review === 'pending' ? tr("لا مستندات بانتظار التدقيق") : tr("لا مستندات في الأرشيف التاريخي")} body={can ? tr("ارفع ملفات PDF للمراسلات الورقية القديمة من البطاقة أعلاه.") : undefined} />
        ) : (
          <>
            {list.data.rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-5 py-2.5 first:border-t-0">
                <span className="flex min-w-0 flex-1 basis-60 flex-col">
                  <Link to={'/correspondence/' + r.id} className="font-semibold text-fg no-underline">{r.subject}</Link>
                  <span className="text-[12px] text-muted"><span className="num">{r.number}</span>{r.originalNo ? ' · ' + tr("الأصلي {0}", r.originalNo) : ''} · {r.typeName}{r.party ? ' · ' + r.party : ''} · <span className="num">{dmy(r.date)}</span></span>
                </span>
                {r.reviewStatus === 'pending' ? <Badge tone="warn">{tr("بانتظار التدقيق")}</Badge> : <Badge tone="ok">{tr("مدقّق")}</Badge>}
                {can && <Button size="sm" variant={r.reviewStatus === 'pending' ? 'primary' : 'ghost'} icon="edit" onClick={() => setEditing(r)}>{r.reviewStatus === 'pending' ? tr("تدقيق") : tr("تعديل")}</Button>}
              </div>
            ))}
            <div className="border-t border-line px-5 py-2"><Pager page={page} pages={pages} total={list.data.total} size={size} onPage={setPage} onSize={(n) => { setSize(n); setPage(1); }} /></div>
          </>
        )}
      </Card>
      {editing && <ReviewDialog row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** رفع دفعة: ملفات PDF أو صور، وملف Excel اختياري يربط اسم الملف ببياناته. الرفع ملفاً بملف مع إعادة المحاولة */
function ImportCard() {
  const lk = useCorLookups();
  const qc = useQueryClient();
  const files = useRef<HTMLInputElement>(null);
  const sheet = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [map, setMap] = useState<Record<string, Meta>>({});
  const [sheetName, setSheetName] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const settings = useAction<{ archiveClerks: boolean }>('cor.archive.settings.save', { invalidate: KEYS, success: tr("حُفظ") });
  const L = lk.data;
  const typeId = (name: string) => (L?.types || []).find((t) => t.name === name.trim() || t.code === name.trim().toUpperCase())?.id || '';
  const readSheet = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    try {
      const rows = await readTable(f);
      const head = (rows[0] || []).map((h) => HEAD[String(h).trim()]);
      if (!head.includes('file')) { setError(tr("الصف الأول يجب أن يحتوي عمود «اسم الملف».")); return; }
      const out: Record<string, Meta> = {};
      rows.slice(1).forEach((r) => {
        const m: Meta = {}; let name = '';
        head.forEach((k, i) => {
          const v = String(r[i] ?? '').trim();
          if (!k || !v) return;
          if (k === 'file') name = v.toLowerCase();
          else if (k === 'typeId') m.typeId = typeId(v);
          else if (k === 'date') m.date = excelDate(v);
          else m[k] = v;
        });
        if (name) out[name] = m;
      });
      setMap(out); setSheetName(f.name);
      setJobs((list) => list.map((j) => ({ ...j, meta: out[j.file.name.toLowerCase()] || j.meta })));
    } catch { setError(tr("تعذّرت قراءة ملف Excel.")); }
  };
  const add = (list: FileList | null) => setJobs((cur) => [...cur, ...Array.from(list || []).map((f) => ({ file: f, meta: map[f.name.toLowerCase()] || {}, state: 'wait' as const }))]);
  const run = async () => {
    setRunning(true);
    for (let i = 0; i < jobs.length; i++) {
      if (jobs[i].state === 'done') continue;
      setJobs((l) => l.map((j, k) => (k === i ? { ...j, state: 'up', error: '' } : j)));
      try {
        const payload = await filePayload(jobs[i].file, DOC_MAX);
        const r = await api<LetterView>('cor.archive.import', { ...payload, meta: jobs[i].meta });
        setJobs((l) => l.map((j, k) => (k === i ? { ...j, state: 'done', number: r.number } : j)));
      } catch (e) {
        setJobs((l) => l.map((j, k) => (k === i ? { ...j, state: 'bad', error: e instanceof ApiError || e instanceof Error ? e.message : tr("تعذّر الرفع.") } : j)));
      }
    }
    setRunning(false);
    qc.invalidateQueries({ queryKey: ['cor.archive.list'] });
  };
  const done = jobs.filter((j) => j.state === 'done').length, failed = jobs.filter((j) => j.state === 'bad').length;
  return (
    <Card padded={false}>
      <CardHeader title={tr("رفع مراسلات قديمة")} action={L?.isManager ? <Checkbox label={tr("يرفعها موظفو المستندات أيضاً")} checked={!!L.archiveClerks} onChange={(v) => settings.mutate({ archiveClerks: v })} /> : undefined} />
      <div className="flex flex-col gap-3 px-5 pb-4">
        <p className="m-0 text-[13px] text-muted">{tr("ملفات PDF أو صور حتى 25 ميجابايت. يُستخرج نص كل ملف ليُقترح موضوعه ويُبحث فيه، ثم تدقق بياناته وتعتمدها. Excel اختياري بأعمدة: اسم الملف، النوع، الرقم الأصلي، التاريخ، الجهة، الموضوع، التصنيف.")}</p>
        <div className="flex flex-wrap gap-2">
          <Button icon="plus" disabled={running} onClick={() => files.current?.click()}>{tr("اختيار الملفات")}</Button>
          <Button variant="ghost" icon="download" disabled={running} onClick={() => sheet.current?.click()}>{sheetName ? tr("Excel: {0}", sheetName) : tr("ملف Excel (اختياري)")}</Button>
          {jobs.length > done && <Button variant="primary" icon="check" loading={running} onClick={run}>{failed ? tr("إعادة المحاولة") : tr("رفع {0} ملف", jobs.length - done)}</Button>}
          {jobs.length > 0 && !running && <Button variant="ghost" onClick={() => setJobs([])}>{tr("مسح القائمة")}</Button>}
          <input ref={files} type="file" accept="application/pdf,image/*" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          <input ref={sheet} type="file" accept=".xlsx,.csv" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { readSheet(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
        {jobs.length > 0 && (
          <>
            <div className="h-2 w-full overflow-hidden rounded-full bg-chip" role="progressbar" aria-valuemin={0} aria-valuemax={jobs.length} aria-valuenow={done} aria-label={tr("التقدم")}>
              <div className="h-full rounded-full bg-ok" style={{ width: (done / jobs.length) * 100 + '%' }} />
            </div>
            <ul className="m-0 flex max-h-64 list-none flex-col gap-1 overflow-y-auto p-0 text-[13px]">
              {jobs.map((j, i) => (
                <li key={j.file.name + i} className="flex items-center gap-2">
                  <Icon name={j.state === 'done' ? 'check' : j.state === 'bad' ? 'alert' : j.state === 'up' ? 'refresh' : 'file'} size={14} className={cx('shrink-0', j.state === 'done' ? 'text-ok' : j.state === 'bad' ? 'text-bad' : 'text-muted')} />
                  <span className="min-w-0 flex-1 truncate">{j.file.name}</span>
                  {Object.keys(j.meta).length > 0 && <span className="text-[12px] text-muted">{tr("من Excel")}</span>}
                  <span className={cx('text-[12px]', j.state === 'bad' ? 'text-bad' : 'text-muted')}>{j.state === 'done' ? j.number : j.state === 'bad' ? j.error : j.state === 'up' ? tr("جارٍ الرفع") : ''}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

/** تدقيق مستند تاريخي: الملف للمراجعة، والبيانات، والنص المستخرج اقتراحاً */
function ReviewDialog({ row, onClose }: { row: ArchiveRow; onClose: () => void }) {
  const lk = useCorLookups();
  const doc = useApi<{ main: { id: string } | null }>('cor.get', { id: row.id });
  const [f, setF] = useState({ typeId: row.typeId, subject: row.subject, date: row.date, party: row.party, originalNo: row.originalNo, category: row.category, summary: row.summary });
  const [error, setError] = useState('');
  const save = useAction('cor.archive.review', { invalidate: KEYS, success: tr("اعتُمدت الأرشفة"), silentError: true, onSuccess: onClose });
  const open = () => doc.data?.main && openFile('cor.file.content', { id: doc.data.main.id }).catch((e) => setError(e instanceof Error ? e.message : tr("تعذّر فتح الملف.")));
  return (
    <Dialog open onClose={onClose} wide title={tr("تدقيق {0}", row.number)} onSubmit={() => { setError(''); save.mutate({ id: row.id, ...f }, { onError: (e) => setError(e.message) }); }}
      footer={<><Button type="submit" variant="primary" className="flex-1" loading={save.isPending}>{row.reviewStatus === 'pending' ? tr("حفظ واعتماد") : tr("حفظ")}</Button><Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <div className="flex flex-col gap-3">
        <Button variant="secondary" icon="eye" className="self-start" disabled={!doc.data?.main} onClick={open}>{tr("فتح الملف للمراجعة")}</Button>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={tr("نوع المستند")} value={f.typeId} onChange={(e) => setF({ ...f, typeId: e.target.value })} options={(lk.data?.types || []).map((t) => ({ value: t.id, label: t.name }))} />
          <TextInput label={tr("تاريخ المستند")} type="date" ltr required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <TextInput label={tr("الرقم الأصلي")} ltr value={f.originalNo} onChange={(e) => setF({ ...f, originalNo: e.target.value })} maxLength={60} />
          <TextInput label={tr("الجهة")} value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} maxLength={160} />
          <Select label={tr("التصنيف")} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={[{ value: '', label: tr("بلا تصنيف") }, ...(lk.data?.categories || []).map((c) => ({ value: c, label: c }))]} />
        </div>
        <TextInput label={tr("الموضوع")} required value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} maxLength={200} />
        <Textarea label={tr("ملخص (اختياري)")} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} maxLength={4000} />
        {row.ocrText && (
          <div className="flex flex-col gap-1 rounded-lg border border-line p-3">
            <span className="text-[13px] font-semibold">{tr("النص المستخرج (اقتراح، قد يحتوي أخطاء)")}</span>
            <p className="m-0 max-h-40 overflow-y-auto whitespace-pre-wrap text-[13px] text-muted">{row.ocrText}</p>
          </div>
        )}
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}

/** البحث في نص الملفات (Drive يفهرس PDF و Office والنص المستخرج) */
export function TextSearchCard() {
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [res, setRes] = useState<(LetterView & { historical: boolean })[] | null>(null);
  const run = useAction<{ q: string }, (LetterView & { historical: boolean })[]>('cor.search.text', { silentError: true, onSuccess: setRes });
  return (
    <Card padded={false}>
      <form className="flex flex-wrap items-end gap-3 px-5 py-4" onSubmit={(e) => { e.preventDefault(); setError(''); run.mutate({ q }, { onError: (x) => setError(x.message) }); }}>
        <TextInput label={tr("بحث في نص الملفات")} value={q} onChange={(e) => setQ(e.target.value)} className="min-w-[220px] flex-1" placeholder={tr("كلمة من داخل الخطاب أو العقد…")} />
        <Button type="submit" icon="search" loading={run.isPending}>{tr("بحث")}</Button>
      </form>
      {error && <div role="alert" className="mx-5 mb-4 rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      {res && (res.length ? res.map((l) => <LetterLine key={l.id} l={l} />) : <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا نتائج. قد يحتاج Drive دقائق ليفهرس الملفات الجديدة.")}</p>)}
    </Card>
  );
}
