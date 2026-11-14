import { tr } from '../../lib/i18n';
import { useState } from 'react';
import { ApiError } from '../../lib/api';
import type { MonthReport } from '../../lib/types';
import { kwMonth } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { ErrorBox, Loader } from '../../ui/Display';
import { MonthPicker } from '../../ui/Controls';
import { CorrectionDialog, MonthDays, NoEmployee, SummaryTiles } from './shared';

export default function MyMonthPage() {
  const [month, setMonth] = useState(kwMonth());
  const [correct, setCorrect] = useState<string | null>(null);
  const q = useApi<MonthReport>('att.myMonth', { month }, { placeholderData: (p) => p });
  if (q.error instanceof ApiError && q.error.code === 'NO_EMPLOYEE') return <NoEmployee />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker value={month} onChange={setMonth} max={kwMonth()} />
        {q.data?.shiftName && <span className="text-muted">{tr("الوردية:")} <b className="text-fg">{q.data.shiftName}</b></span>}
      </div>
      {q.isError && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {!q.data ? <Loader /> : (
        <>
          <SummaryTiles s={q.data.summary} />
          {!q.data.hasShift && <p className="m-0 text-[13px] text-muted">{tr("لا توجد وردية محددة لك، لذلك لا يُحتسب التأخير والغياب. تواصل مع الموارد البشرية لتحديدها.")}</p>}
          <MonthDays report={q.data} onCorrect={setCorrect} />
        </>
      )}
      <CorrectionDialog open={!!correct} date={correct || undefined} onClose={() => setCorrect(null)} />
    </div>
  );
}
