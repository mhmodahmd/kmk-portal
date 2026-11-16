import { tr } from '../../lib/i18n';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { MonthReport, ReportRow } from '../../lib/types';
import { dmy, formatTime, hm, kwMonth, monthLabel } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { Avatar, Card, EmptyState, ErrorBox, Loader } from '../../ui/Display';
import { DataTable, MonthPicker } from '../../ui/Controls';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { MonthDays, SummaryTiles, downloadCsv } from './shared';

interface Multi { single: false; month: string; company: string; rows: ReportRow[] }
interface Single { single: true; report: MonthReport }

export default function ReportPage() {
  const [sp, setSp] = useSearchParams();
  const month = sp.get('month') || kwMonth();
  const setMonth = (m: string) => setSp({ month: m }, { replace: true });
  const q = useApi<Multi>('att.report', { month }, { placeholderData: (p) => p });
  const d = q.data;

  const exportCsv = () => {
    if (!d) return;
    downloadCsv(tr("حضور-{0}.csv", month), [
      [tr("الرقم الوظيفي"), tr("الموظف"), tr("الوردية"), tr("أيام الحضور"), tr("ساعات العمل"), tr("أيام التأخير"), tr("دقائق التأخير"), tr("الخروج المبكر (د)"), tr("الغياب"), tr("الإجازات"), tr("بلا انصراف"), tr("الإضافي")],
      ...d.rows.map((r) => [r.empNo, r.name, r.shiftName, r.daysPresent, hm(r.totalMinutes), r.lateDays, r.lateMin, r.earlyMin, r.absentDays, r.leaveDays, r.incomplete, hm(r.overtimeMin)])
    ]);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="no-print flex flex-wrap items-center gap-3">
        <MonthPicker value={month} onChange={setMonth} max={kwMonth()} />
        <span className="flex-1" />
        <Button icon="download" onClick={exportCsv} disabled={!d?.rows.length}>{tr("تصدير CSV (Excel)")}</Button>
        <Button icon="printer" onClick={() => window.print()} disabled={!d?.rows.length}>{tr("طباعة")}</Button>
      </div>
      <div className="print-only">
        <h2 className="m-0">{d?.company} {tr("· تقرير الحضور الشهري")}</h2>
        <p className="m-0">{monthLabel(month)}</p>
      </div>
      <div className="print-only"><p className="m-0 text-[10px]">{tr("التأخير: أيام · دقائق. الساعات بصيغة ساعة:دقيقة.")}</p></div>
      {q.isError && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {!d ? <Loader /> : (
        <Card padded={false} className="print-table overflow-hidden">
          {d.rows.length === 0 ? <EmptyState title={tr("لا موظفين في نطاقك")} /> : (
            <DataTable head={[tr("الموظف"), tr("الحضور"), tr("الساعات"), tr("التأخير"), tr("خروج مبكر"), tr("الغياب"), tr("إجازات"), tr("بلا انصراف"), tr("الإضافي")]} minWidth={900}>
              {d.rows.map((r) => (
                <tr key={r.employeeId}>
                  <td>
                    <Link to={`/attendance/report/${r.employeeId}?month=${month}`} className="flex items-center gap-2.5 text-fg no-underline hover:text-accent-fg">
                      <Avatar name={r.name} size={30} />
                      <span className="flex flex-col"><span className="font-semibold">{r.name}</span><span className="text-[12px] text-muted">{r.shiftName || tr("بلا وردية")}</span></span>
                    </Link>
                  </td>
                  <td className="num">{r.daysPresent}</td>
                  <td className="num ltr text-right">{hm(r.totalMinutes)}</td>
                  <td className="num">{r.lateDays ? <span className="text-warn">{r.lateDays} · {r.lateMin} {tr("د")}</span> : '0'}</td>
                  <td className="num">{r.earlyMin ? tr("{0} د", r.earlyMin) : '0'}</td>
                  <td className="num">{r.absentDays ? <span className="font-semibold text-bad">{r.absentDays}</span> : '0'}</td>
                  <td className="num">{r.leaveDays}</td>
                  <td className="num">{r.incomplete ? <span className="text-warn">{r.incomplete}</span> : '0'}</td>
                  <td className="num ltr text-right">{hm(r.overtimeMin)}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      )}
    </div>
  );
}

/** تقرير موظف واحد لشهر */
export function EmployeeReportPage() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const month = sp.get('month') || kwMonth();
  const q = useApi<Single>('att.report', { month, employeeId: id }, { placeholderData: (p) => p });
  const r = q.data?.report;
  const exportCsv = () => r && downloadCsv(tr("حضور-{0}-{1}.csv", r.employee.name, month), [
    [tr("اليوم"), tr("التاريخ"), tr("الحالة"), tr("الحضور"), tr("الانصراف"), tr("المدة"), tr("التأخير (د)"), tr("خروج مبكر (د)"), tr("الإضافي"), tr("ملاحظات")],
    ...r.days.filter((x) => x.status !== 'future').map((x) => [x.dayName, dmy(x.date), x.statusLabel + (x.detail ? ' - ' + x.detail : ''), x.firstIn ? formatTime(x.firstIn) : '', x.lastOut ? formatTime(x.lastOut) : '', x.sessions ? hm(x.minutes) : '', x.late, x.early, hm(x.overtime), x.note])
  ]);
  return (
    <div className="flex flex-col gap-4">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Link to={`/attendance/report?month=${month}`} className="inline-flex items-center gap-1 text-accent-fg no-underline"><Icon name="chevron" size={18} className="rotate-180" />{tr("كل الموظفين")}</Link>
        <MonthPicker value={month} onChange={(m) => setSp({ month: m }, { replace: true })} max={kwMonth()} />
        <span className="flex-1" />
        <Button icon="download" onClick={exportCsv} disabled={!r}>{tr("تصدير CSV (Excel)")}</Button>
        <Button icon="printer" onClick={() => window.print()} disabled={!r}>{tr("طباعة")}</Button>
      </div>
      {q.isError && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {!r ? <Loader /> : (
        <>
          <div className="flex items-center gap-3">
            <Avatar name={r.employee.name} size={44} />
            <div className="flex flex-col">
              <span className="text-[18px] font-bold">{r.employee.name}</span>
              <span className="text-muted">{[r.employee.jobTitle, r.employee.empNo && tr("رقم {0}", r.employee.empNo), r.shiftName, monthLabel(month)].filter(Boolean).join(' · ')}</span>
            </div>
          </div>
          <div className="print-only"><h2 className="m-0">{tr("تقرير حضور {0} · {1}", r.employee.name, monthLabel(month))}</h2></div>
          <SummaryTiles s={r.summary} />
          <MonthDays report={r} />
        </>
      )}
    </div>
  );
}
