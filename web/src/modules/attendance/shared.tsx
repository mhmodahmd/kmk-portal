import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BoardStatus, Correction, DayStatus, MonthReport } from '../../lib/types';
import { dmy, duration, formatTime, hm, kwDate } from '../../lib/format';
import { useAction } from '../../lib/useApi';
import { useSummary } from '../../app/Shell';
import { useAuth } from '../../app/auth';
import { Badge, Card, StatTile } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Select, TextInput, Textarea } from '../../ui/Field';
import { Dialog } from '../../ui/Overlay';
import { DataTable } from '../../ui/Controls';
import { Icon } from '../../ui/Icon';

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

export const DAY_TONE: Record<DayStatus, Tone> = {
  in: 'info', present: 'ok', missing: 'warn', holiday: 'neutral', leave: 'info', weekend: 'neutral', absent: 'bad', none: 'neutral', future: 'neutral'
};
export const BOARD_LABEL: Record<BoardStatus, string> = { in: 'داخل الدوام', out: 'انصرف', absent: 'غائب', none: 'لم يسجّل بعد', leave: 'إجازة', off: 'عطلة' };
export const BOARD_TONE: Record<BoardStatus, Tone> = { in: 'ok', out: 'neutral', absent: 'bad', none: 'warn', leave: 'info', off: 'neutral' };
export const CORR_TONE: Record<Correction['status'], Tone> = { pending: 'warn', approved: 'ok', rejected: 'bad', cancelled: 'neutral' };

/** هل يرى المستخدم شاشات الفريق (حضور اليوم والتقارير)؟ */
export function useAttendanceScope() {
  const { user, roles } = useAuth();
  const s = useSummary();
  const board = s.data?.cards.find((c) => c.kind === 'att.board');
  return {
    canSeeTeam: !!user?.isSuperAdmin || roles.attendance === 'viewer' || roles.attendance === 'hr' || !!board,
    isHr: !!user?.isSuperAdmin || roles.attendance === 'hr',
    scope: (board?.scope as 'all' | 'team' | undefined) || (user?.isSuperAdmin ? 'all' : undefined)
  };
}

export function SummaryTiles({ s }: { s: MonthReport['summary'] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatTile label="أيام الحضور" value={s.daysPresent} icon="calendar" foot={s.incomplete ? `${s.incomplete} بلا انصراف` : 'كلها مكتملة'} />
      <StatTile label="ساعات العمل" value={<span className="ltr">{hm(s.totalMinutes)}</span>} icon="clock" foot={s.daysPresent ? `متوسط ${hm(s.totalMinutes / s.daysPresent)} يومياً` : '—'} />
      <StatTile label="التأخير" value={s.lateDays} icon="alert" foot={s.lateMin ? `مجموعه ${duration(s.lateMin)}` : 'لا تأخير'} />
      <StatTile label="الغياب" value={s.absentDays} icon="x" foot={s.leaveDays ? `${s.leaveDays} أيام إجازة` : 'بلا إجازات'} />
      <StatTile label="الإضافي المعتمد" value={<span className="ltr">{hm(s.overtimeMin)}</span>} icon="plus" foot={s.earlyMin ? `خروج مبكر ${duration(s.earlyMin)}` : 'لا خروج مبكر'} />
    </div>
  );
}

/** أيام الشهر: جدول على الحاسوب وبطاقات على الجوال */
export function MonthDays({ report, onCorrect }: { report: MonthReport; onCorrect?: (date: string) => void }) {
  const today = kwDate();
  const days = report.days.filter((d) => d.status !== 'future');
  const canCorrect = (ds: string) => !!onCorrect && ds <= today && (Date.parse(today) - Date.parse(ds)) / 86400000 <= 31;
  const status = (d: MonthReport['days'][number]) => (
    <span className="flex flex-wrap items-center gap-1">
      {d.statusLabel && <Badge tone={DAY_TONE[d.status]}>{d.statusLabel}</Badge>}
      {d.detail && <span className="text-[12px] text-muted">{d.detail}</span>}
      {d.late > 0 && <Badge tone="warn">تأخير {d.late} د</Badge>}
      {d.early > 0 && <Badge tone="warn">خروج مبكر {d.early} د</Badge>}
      {d.overtime > 0 && <Badge tone="info">إضافي {hm(d.overtime)}</Badge>}
      {d.edited && <span title="عُدّل يدوياً أو بتصحيح" className="text-[12px] text-muted">· معدّل</span>}
    </span>
  );
  return (
    <>
      <Card padded={false} className="hidden overflow-hidden md:block">
        <DataTable head={['اليوم', 'الحالة', 'الحضور', 'الانصراف', 'المدة', '']} minWidth={720}>
          {days.map((d) => (
            <tr key={d.date} className={d.date === today ? 'bg-accent-soft/60' : d.status === 'weekend' || d.status === 'holiday' ? 'bg-chip/40' : ''}>
              <td className="whitespace-nowrap"><span className="font-medium">{d.dayName}</span> <span className="text-muted num">{dmy(d.date)}</span></td>
              <td>{status(d)}</td>
              <td className="num whitespace-nowrap">{d.firstIn ? formatTime(d.firstIn) : '—'}</td>
              <td className="num whitespace-nowrap">{d.lastOut ? formatTime(d.lastOut) : d.sessions ? <span className="text-warn">—</span> : '—'}</td>
              <td className="num ltr text-right">{d.sessions ? hm(d.minutes) : ''}</td>
              <td className="text-left">{canCorrect(d.date) && ['missing', 'absent', 'present'].includes(d.status) && (
                <button type="button" onClick={() => onCorrect!(d.date)} className="text-[13px] text-accent-fg hover:underline cursor-pointer no-print">طلب تصحيح</button>
              )}</td>
            </tr>
          ))}
        </DataTable>
      </Card>
      <div className="flex flex-col gap-2 md:hidden">
        {days.slice().reverse().map((d) => (
          <Card key={d.date} className="flex flex-col gap-2 !p-4">
            <div className="flex items-center justify-between gap-2">
              <span><span className="font-semibold">{d.dayName}</span> <span className="text-muted num">{dmy(d.date)}</span></span>
              {d.sessions > 0 && <span className="font-semibold num ltr">{hm(d.minutes)}</span>}
            </div>
            {status(d)}
            {d.sessions > 0 && (
              <div className="flex gap-4 text-[13px] text-muted">
                <span>حضور <b className="text-fg num">{formatTime(d.firstIn)}</b></span>
                <span>انصراف <b className="text-fg num">{d.lastOut ? formatTime(d.lastOut) : '—'}</b></span>
              </div>
            )}
            {canCorrect(d.date) && ['missing', 'absent'].includes(d.status) && (
              <Button size="sm" variant="secondary" icon="edit" className="self-start" onClick={() => onCorrect!(d.date)}>طلب تصحيح</Button>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

/** نموذج طلب تصحيح البصمة */
export function CorrectionDialog({ open, onClose, date: initialDate }: { open: boolean; onClose: () => void; date?: string }) {
  const [f, setF] = useState({ date: '', kind: 'missingOut', inTime: '', outTime: '', reason: '' });
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setF({ date: initialDate || kwDate(), kind: 'missingOut', inTime: '', outTime: '', reason: '' }); setError(''); } }, [open, initialDate]);
  const req = useAction('att.correction.request', { invalidate: ['att.correction.mine', 'att.myMonth', 'att.today'], success: 'أُرسل طلب التصحيح', silentError: true, onSuccess: onClose });
  const submit = () => { setError(''); req.mutate(f, { onError: (e) => setError(e.message) }); };
  const needIn = f.kind !== 'missingOut';
  return (
    <Dialog open={open} onClose={onClose} title="طلب تصحيح بصمة"
      footer={<><Button variant="primary" className="flex-1" loading={req.isPending} onClick={submit}>إرسال الطلب</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-[13px] leading-relaxed text-muted">يصل الطلب إلى مديرك المباشر أو الموارد البشرية، ويُعدَّل سجلك تلقائياً بعد الموافقة.</p>
        <Select label="ما المشكلة؟" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}
          options={[{ value: 'missingOut', label: 'نسيت تسجيل الانصراف' }, { value: 'missingIn', label: 'نسيت تسجيل الحضور' }, { value: 'wrongTime', label: 'الوقت المسجّل خطأ' }]} />
        <TextInput label="اليوم" type="date" value={f.date} max={kwDate()} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          {needIn && <TextInput label="وقت الحضور الصحيح" type="time" value={f.inTime} onChange={(e) => setF({ ...f, inTime: e.target.value })} hint={f.kind === 'wrongTime' ? 'اتركه فارغاً إن كان صحيحاً' : undefined} />}
          {<TextInput label={f.kind === 'missingIn' ? 'وقت الانصراف (إن وُجد)' : 'وقت الانصراف الصحيح'} type="time" value={f.outTime} onChange={(e) => setF({ ...f, outTime: e.target.value })} />}
        </div>
        <Textarea label="السبب" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={300} placeholder="مثال: نفدت بطارية الجوال قبل الانصراف" />
        {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}
      </div>
    </Dialog>
  );
}

export function MapLink({ loc }: { loc: string }) {
  if (!loc) return <span className="text-muted">—</span>;
  return (
    <a href={`https://maps.google.com/?q=${loc}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-fg no-underline hover:underline">
      <Icon name="pin" size={15} />الخريطة
    </a>
  );
}

export function NoEmployee() {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <Icon name="user" size={32} className="text-muted" />
      <span className="text-[16px] font-bold">حسابك غير مرتبط بملف موظف</span>
      <span className="max-w-sm text-muted">البصمة وسجل الحضور تعمل بعد ربط حسابك بملفك الوظيفي. تواصل مع الموارد البشرية أو مدير النظام.</span>
      <Link to="/" className="text-accent-fg no-underline">العودة إلى الرئيسية</Link>
    </Card>
  );
}

/** تصدير جدول إلى ملف CSV يفتحه Excel بالعربية */
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
