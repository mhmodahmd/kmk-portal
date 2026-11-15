import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { tr } from '../../lib/i18n';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../app/auth';
import { useApi } from '../../lib/useApi';
import { Badge, Card, CardHeader, PageHeader } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Field';
import { kwd } from '../custody/shared';

/** الجداول المطلوبة من ملف «تصدير كامل (JSON)» — ما سواها (الأسرار والسجلات) لا يُرسل للخادم */
const KEEP = ['clients', 'contacts', 'projects', 'payments', 'proposals', 'activities', 'tasks', 'documents', 'pipeline_stages', 'sales_targets'];
type Row = Record<string, unknown>;
const TABLES: Record<string, string> = {
  Clients: tr("العملاء"), Contacts: tr("جهات الاتصال"), Projects: tr("المشاريع"), Payments: tr("الدفعات"), Proposals: tr("العروض"),
  Activities: tr("الأنشطة"), Links: tr("المستندات والروابط"), Targets: tr("أهداف المبيعات"), Tasks: tr("المهام")
};
interface Report {
  dryRun: boolean; created: Record<string, number>; unchanged: Record<string, number>; warnings: string[]; ok: boolean;
  review: { project: string; client: string; note: string }[]; totals: { clients: number; projects: number; payments: number; tasks: number; paid: number };
  reconcile: { project: string; ok: boolean }[];
}

/** نقل بيانات نظام العملاء السابق من ملف التصدير (مدير النظام) */
export default function CrmImportPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const users = useApi<{ users: { id: string; fullName: string; username: string; active: boolean }[] }>('users.list');
  const [file, setFile] = useState('');
  const [source, setSource] = useState<Record<string, Row[]> | null>(null);
  const [legacy, setLegacy] = useState<{ id: string; name: string; count: number }[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState<Report | null>(null);

  const read = (f?: File) => {
    if (!f) return;
    setError(''); setReport(null);
    const r = new FileReader();
    r.onload = () => {
      try {
        const j = JSON.parse(String(r.result));
        if (!j.tables || !Array.isArray(j.tables.clients)) throw new Error(tr("الملف ليس تصديراً كاملاً من نظام العملاء."));
        const src: Record<string, Row[]> = {};
        KEEP.forEach((k) => { src[k] = Array.isArray(j.tables[k]) ? j.tables[k] : []; });
        const names: Record<string, string> = {};
        (j.tables.audit_logs || []).forEach((a: Row) => { if (a.user_id && a.user_name) names[String(a.user_id)] = String(a.user_name); });
        const count: Record<string, number> = {};
        const add = (v: unknown) => { if (v) count[String(v)] = (count[String(v)] || 0) + 1; };
        src.clients.forEach((c) => { add(c.assigned_employee_id); add(c.created_by); });
        src.tasks.forEach((t) => { add(t.assigned_to); add(t.created_by); });
        src.activities.forEach((a) => add(a.employee_id));
        src.sales_targets.forEach((t) => add(t.user_id));
        setLegacy(Object.keys(count).map((id) => ({ id, name: names[id] || tr("مستخدم غير معروف"), count: count[id] })).sort((a, b) => b.count - a.count));
        setSource(src);
        setFile(f.name);
      } catch (e) { setError(e instanceof Error ? e.message : tr("تعذّرت قراءة الملف.")); }
    };
    r.readAsText(f);
  };

  useEffect(() => { if (user) setMap((m) => Object.fromEntries(legacy.map((l) => [l.id, m[l.id] || user.id]))); }, [legacy, user]);
  const names = useMemo(() => Object.fromEntries(legacy.map((l) => [l.id, l.name])), [legacy]);

  const run = async (dryRun: boolean) => {
    if (!source || !user) return;
    setBusy(dryRun ? 'dry' : 'run'); setError('');
    try {
      const userMap = Object.fromEntries(Object.entries(map).filter(([, v]) => v && v !== user.id));
      const r = await api<Report>('system.migrate.legacyCrm', { source, userMap, userNames: names, defaultUser: user.id, dryRun });
      setReport(r);
      if (!dryRun) ['crm.home', 'crm.clients', 'crm.projects', 'tsk.list', 'home.summary'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e) { setError(e instanceof ApiError ? e.message : tr("تعذّر تنفيذ النقل.")); }
    finally { setBusy(''); }
  };

  const active = (users.data?.users || []).filter((u) => u.active);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={tr("النظام")} title={tr("نقل بيانات العملاء")} subtitle={tr("من ملف «تصدير كامل (JSON)» في نظام العملاء السابق (الإعدادات ← النسخ الاحتياطي والاستيراد). النظام السابق لا يُعدَّل، وإعادة النقل لا تكرر شيئاً.")} />
      <Card className="flex flex-col gap-3">
        <CardHeader title={tr("1. اختر ملف التصدير")} />
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 font-medium hover:border-line-strong">
          {file || tr("اختيار الملف (.json)")}
          <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => read(e.target.files?.[0])} />
        </label>
        {source && <p className="m-0 text-[13px] text-muted">{tr("{0} عميل · {1} مشروع · {2} دفعة · {3} مهمة", source.clients.length, source.projects.length, source.payments.length, source.tasks.length)}</p>}
      </Card>

      {legacy.length > 0 && (
        <Card padded={false}>
          <CardHeader title={tr("2. ربط مستخدمي النظام السابق بحسابات البوابة")} />
          <p className="m-0 px-5 pb-3 text-[13px] text-muted">{tr("من لا حساب له يُنسب لحسابك، ويُحفظ اسمه الأصلي على سجلاته.")}</p>
          {legacy.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-2.5">
              <span className="min-w-[160px] flex-1 font-medium">{l.name} <span className="text-[12px] font-normal text-muted">{tr("({0} سجل)", l.count)}</span></span>
              <Select label={tr("حساب البوابة")} className="w-56 [&>label]:sr-only" value={map[l.id] || ''} onChange={(e) => setMap({ ...map, [l.id]: e.target.value })}
                options={active.map((u) => ({ value: u.id, label: u.id === user?.id ? tr("{0} (حسابي)", u.fullName) : u.fullName }))} />
            </div>
          ))}
        </Card>
      )}

      {source && (
        <Card className="flex flex-col gap-3">
          <CardHeader title={tr("3. التجربة ثم النقل")} />
          <div className="flex flex-wrap gap-2">
            <Button loading={busy === 'dry'} disabled={!!busy} onClick={() => run(true)}>{tr("تجربة بلا حفظ")}</Button>
            <Button variant="primary" loading={busy === 'run'} disabled={!!busy || !report?.dryRun || !report.ok} onClick={() => run(false)}>{tr("نقل البيانات")}</Button>
          </div>
          {!report && <p className="m-0 text-[13px] text-muted">{tr("ابدأ بالتجربة: تعرض ما سيُنقل والمطابقة دون كتابة شيء.")}</p>}
        </Card>
      )}

      {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}

      {report && (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-[17px] font-bold">{report.dryRun ? tr("نتيجة التجربة (لم يُحفظ شيء)") : tr("تم النقل")}</h2>
            <Badge tone={report.ok ? 'ok' : 'bad'}>{report.ok ? tr("المطابقة سليمة") : tr("المطابقة فيها فروق")}</Badge>
          </div>
          <p className="m-0">{Object.keys(report.created).length ? Object.entries(report.created).map(([k, v]) => `${TABLES[k] || k}: ${v}`).join(' · ') : tr("لا جديد: كل السجلات منقولة مسبقاً.")}</p>
          <p className="m-0 text-[13px] text-muted">{tr("المحصّل في الملف {0}", kwd(report.totals.paid))}</p>
          {report.warnings.map((w) => <p key={w} className="m-0 text-warn">{w}</p>)}
          {report.review.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-lg bg-warn-bg p-3 text-warn">
              <b>{tr("{0} مشاريع تُنقل للمراجعة والتصحيح:", report.review.length)}</b>
              {report.review.map((r) => <span key={r.project} className="text-[13px]">• {r.project} — {r.client}: {r.note}</span>)}
            </div>
          )}
          {!report.dryRun && <Link to="/crm/projects?review=1" className="font-semibold text-accent-fg no-underline">{tr("فتح المشاريع التي تحتاج مراجعة")}</Link>}
        </Card>
      )}
    </div>
  );
}
