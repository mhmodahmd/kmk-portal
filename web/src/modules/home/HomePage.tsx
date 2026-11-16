import { tr } from '../../lib/i18n';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { useSummary } from '../../app/Shell';
import { useApi } from '../../lib/useApi';
import type { HomeCard, InboxItem } from '../../lib/types';
import { duration, formatTime, greeting, hm, monthLabel, relativeTime, todayLabel } from '../../lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Skeleton } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Bars, Kpi, MiniStats, PanelTitle, type BarRow, type KpiTone } from '../../ui/Dashboard';
import { Icon, type IconName } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import { QuickTaskButton } from '../tasks/shared';
import { QuickLetterButton } from '../correspondence/shared';

const MODULE_ICONS: Record<string, IconName> = { attendance: 'clock', hr: 'users', custody: 'wallet', tasks: 'tasks', crm: 'crm', correspondence: 'mail', finance: 'finance' };
const PHASE: Record<string, number> = { attendance: 1, hr: 1, custody: 2, tasks: 3, crm: 4, correspondence: 4, finance: 5 };

interface Attention { kind: string; tone: 'bad' | 'warn' | 'info'; title: string; detail: string; link: string }
interface HomeDashboard {
  today: string; attention: Attention[]; inbox: InboxItem[];
  my: {
    attendance: { month: string; presentDays: number; absentDays: number; lateDays: number; lateMin: number; overtimeMin: number; totalMinutes: number; leaveDays: number } | null;
    tasks: { open: number; overdue: number; dueWeek: number; doneMonth: number; review: number } | null;
    leave: { name: string; available: number | null; used: number; pending: number } | null;
  };
}

/** الرئيسية: لوحة شخصية حسب الدور — اليوم، المؤشرات، ما يحتاج انتباهك، شهري، الموافقات، الفريق، والوحدات */
export default function HomePage() {
  const { user, roles } = useAuth();
  const q = useSummary();
  const dq = useApi<HomeDashboard>('home.dashboard', {}, { staleTime: 60_000 });
  const first = (user?.fullName || '').split(' ')[0];
  const s = q.data, d = dq.data;
  const card = (kind: string) => s?.cards.find((c) => c.kind === kind);
  const today = card('att.today'), board = card('att.board'), cusMine = card('cus.mine'), cusStaff = card('cus.staff'), tasks = card('tsk.mine'), crm = card('crm.home'), cor = card('cor.home'), docs = card('hr.docs');
  const admin = !!user?.isSuperAdmin;
  const has = (m: string) => admin || !!roles[m];
  const moduleCount: Record<string, string> = {
    attendance: board ? tr("{0} حاضرون الآن", board.counts.in) : today ? (today.isIn ? tr("داخل الدوام") : tr("لم تسجّل بعد")) : '',
    tasks: tasks ? (tasks.overdue ? tr("{0} مفتوحة · {1} متأخرة", tasks.open, tasks.overdue) : tr("{0} مفتوحة", tasks.open)) : '',
    crm: crm ? (crm.overdue ? tr("{0} دفعات متأخرة", crm.overdue) : tr("{0} مشروع جارٍ", crm.ongoing)) : '',
    correspondence: cor ? (cor.overdue ? tr("{0} بانتظار الرد · {1} متأخرة", cor.open, cor.overdue) : tr("{0} بانتظار الرد", cor.open)) : '',
    custody: cusStaff ? tr("{0} عهدة مفتوحة", cusStaff.openCount) : cusMine?.custody ? tr("المتبقي {0}", kwdText(cusMine.custody.remaining)) : '',
    hr: docs ? tr("{0} مستندات تنتهي قريباً", docs.count) : d?.my.leave ? tr("رصيد {0}: {1}", d.my.leave.name, d.my.leave.available ?? '∞') : ''
  };

  return (
    <div className="flex flex-col gap-5">
      {/* الترويسة والإجراءات السريعة */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-1 basis-[260px] flex-col gap-1">
          <h1 className="m-0 text-[22px] font-bold leading-tight sm:text-[24px]">{greeting()}{tr("،")} {first}</h1>
          <span className="text-muted">{todayLabel()}{s === undefined ? '' : s.inboxCount ? tr(" · لديك {0} طلبات بانتظار قرارك", s.inboxCount) : tr(" · لا شيء ينتظر قرارك")}</span>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          {has('tasks') && <QuickTaskButton draft={{}} size="md" variant="secondary" />}
          {has('correspondence') && <QuickLetterButton draft={{ direction: 'in' }} size="md" variant="secondary" label={tr("تسجيل خطاب")} />}
          {has('hr') && !admin && <Link to="/hr/leave" className="no-underline"><Button variant="secondary" icon="calendar">{tr("طلب إجازة")}</Button></Link>}
          {s && s.inboxCount > 0 && <Link to="/inbox" className="no-underline"><Button variant="primary" icon="inbox">{tr("الموافقات ({0})", s.inboxCount)}</Button></Link>}
        </div>
      </div>
      {q.isError && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}

      {today && <TodayCard c={today} />}

      {/* المؤشرات الرئيسية */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {q.isPending ? [0, 1, 2, 3].map((i) => <Card key={i} className="flex flex-col gap-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-16" /><Skeleton className="h-3 w-32" /></Card>) : s && (
          <>
            <Kpi label={tr("بانتظار موافقتي")} value={s.inboxCount} icon="inbox" tone={s.inboxCount ? 'warn' : 'ok'} to="/inbox" foot={s.inboxCount ? tr("اعتمد أو ارفض من صندوق الموافقات") : tr("لا طلبات تنتظرك")} />
            {tasks && <Kpi label={tr("مهامي المفتوحة")} value={tasks.open} icon="tasks" tone={tasks.overdue ? 'bad' : tasks.today ? 'warn' : 'info'} strong to="/tasks"
              foot={tasks.overdue ? tr("{0} متأخرة", tasks.overdue) : tasks.today ? tr("{0} موعدها اليوم", tasks.today) : tasks.week ? tr("{0} خلال أسبوع", tasks.week) : tr("لا مواعيد قريبة")} />}
            {cor && <Kpi label={cor.scope === 'all' ? tr("مراسلات بانتظار الرد") : tr("مراسلاتي بانتظار الرد")} value={cor.open} icon="mail" tone={cor.overdue ? 'bad' : cor.dueSoon ? 'warn' : 'info'} strong to="/correspondence"
              foot={cor.overdue ? tr("{0} متأخرة عن موعد الرد", cor.overdue) : cor.dueSoon ? tr("{0} يحين موعدها قريباً", cor.dueSoon) : cor.drafts ? tr("{0} مسودة لم تُرسل", cor.drafts) : tr("فتح المراسلات")} />}
            {crm && <Kpi label={crm.overdue ? tr("دفعات متأخرة التحصيل") : tr("دفعات مستحقة قريباً")} value={crm.overdue || crm.due.length} icon="crm" tone={crm.overdue ? 'bad' : crm.due.length ? 'warn' : 'ok'} strong to="/crm/payments"
              foot={crm.review ? tr("و{0} مشاريع تحتاج مراجعة", crm.review) : tr("{0} مشروع جارٍ", crm.ongoing)} />}
            {cusStaff && <Kpi label={tr("العهد بانتظار إجرائك")} value={cusStaff.pendingClose + cusStaff.pendingRequests + cusStaff.voucherRequests + cusStaff.awaitingSign} icon="wallet" tone={cusStaff.pendingClose + cusStaff.pendingRequests + cusStaff.voucherRequests + cusStaff.awaitingSign ? 'warn' : 'ok'} to="/custody/overview"
              foot={tr("{0} عهدة مفتوحة · رصيدها {1}", cusStaff.openCount, kwdText(cusStaff.openBalance))} />}
            {cusMine?.custody && <Kpi label={tr("رصيد عهدتي")} value={<span className="ltr inline-block text-[22px]">{kwdText(cusMine.custody.remaining)}</span>} icon="wallet" tone={cusMine.custody.overspent ? 'bad' : cusMine.custody.alert ? 'warn' : 'ok'} to={'/custody/' + cusMine.custody.id}
              foot={tr("صُرف {0}% · {1}", cusMine.custody.percent, cusMine.custody.statusLabel)} />}
            {d?.my.leave && <Kpi label={d.my.leave.name} value={d.my.leave.available ?? '∞'} icon="calendar" to="/hr/leave" foot={d.my.leave.pending ? tr("{0} طلب قيد الموافقة", d.my.leave.pending) : tr("يوم متاح · {0} مستخدم", d.my.leave.used)} />}
            {docs && <Kpi label={tr("مستندات تنتهي خلال 30 يوماً")} value={docs.count} icon="file" tone={docs.count ? 'warn' : 'ok'} to="/hr/employees" foot={tr("{0} موظف في الدليل", docs.employees)} />}
            {s.setup && !docs && <Kpi label={tr("مستخدمو البوابة")} value={s.setup.usersCount} icon="users" to="/settings/users" foot={tr("إدارة المستخدمين والأدوار")} />}
          </>
        )}
      </div>

      {/* يحتاج انتباهك + شهري */}
      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <Card padded={false}>
          <CardHeader title={d ? tr("يحتاج انتباهك · {0}", d.attention.length) : tr("يحتاج انتباهك")} />
          {dq.isError ? <p className="m-0 px-5 pb-4 text-[13px] text-bad">{(dq.error as Error).message}</p> : !d ? <div className="flex flex-col gap-2 p-5"><Skeleton className="h-5" /><Skeleton className="h-5 w-3/4" /><Skeleton className="h-5 w-1/2" /></div>
            : d.attention.length === 0 ? <EmptyState title={tr("كل شيء على ما يرام")} body={tr("لا مهام متأخرة ولا خطابات تنتظر ردّك ولا تنبيهات.")} />
            : d.attention.map((a, i) => <AttentionRow key={a.kind + i} a={a} />)}
        </Card>
        <div className="flex flex-col gap-4">
          {d?.my.attendance && <MyMonthCard a={d.my.attendance} />}
          {d?.my.tasks && (d.my.tasks.open > 0 || d.my.tasks.doneMonth > 0) && (
            <Card className="flex flex-col gap-3">
              <PanelTitle title={tr("مهامي هذا الشهر")} action={<Link to="/tasks/overview" className="text-[13px] font-semibold text-accent-fg no-underline">{tr("نظرة عامة")}</Link>} />
              <MiniStats items={[{ label: tr("مفتوحة"), value: d.my.tasks.open }, { label: tr("أُنجزت"), value: d.my.tasks.doneMonth }, { label: tr("خلال أسبوع"), value: d.my.tasks.dueWeek }]} />
              {d.my.tasks.open > 0 && <Bars max={d.my.tasks.open} rows={([
                { key: 'overdue', label: tr("متأخرة"), value: d.my.tasks.overdue, tone: 'bad' },
                { key: 'week', label: tr("تحين خلال أسبوع"), value: d.my.tasks.dueWeek, tone: 'warn' },
                { key: 'review', label: tr("بانتظار مراجعة"), value: d.my.tasks.review, tone: 'accent' }
              ] as BarRow[]).filter((r) => r.value > 0)} />}
            </Card>
          )}
        </div>
      </div>

      {/* الموافقات والفريق */}
      {(d && d.inbox.length > 0) || board ? (
        <div className={cx('grid items-start gap-4', d && d.inbox.length > 0 && board && 'lg:grid-cols-2')}>
          {d && d.inbox.length > 0 && (
            <Card padded={false}>
              <CardHeader title={tr("بانتظار قرارك")} action={<Link to="/inbox" className="text-[13px] font-semibold text-accent-fg no-underline">{tr("صندوق الموافقات")}</Link>} />
              {d.inbox.map((x) => (
                <Link key={x.id} to={x.link || '/inbox'} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3 text-fg no-underline hover:bg-chip/40">
                  <span className="flex min-w-0 flex-1 flex-col"><span className="font-semibold">{x.title}</span><span className="text-[12px] text-muted">{[x.moduleLabel, x.who, relativeTime(x.createdAt)].filter(Boolean).join(' · ')}</span></span>
                  <Badge tone="warn">{x.status}</Badge>
                </Link>
              ))}
            </Card>
          )}
          {board && <BoardCard c={board} />}
        </div>
      ) : null}

      {s?.setup && <SetupChecklist setup={s.setup} />}

      {/* الوحدات */}
      <Card padded={false}>
        <CardHeader title={tr("الوحدات")} />
        {q.isPending ? <div className="p-5"><Skeleton className="h-16" /></div> : s && s.modules.length === 0 ? (
          <EmptyState title={tr("لا وحدات مسندة لك بعد")} body={tr("سيحدد مدير النظام الوحدات التي تعمل عليها، وتظهر هنا فوراً.")} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-px border-t border-line bg-line">
            {s?.modules.map((m) => {
              const inner = (
                <>
                  <span className={cx('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', m.enabled ? 'bg-accent-soft text-accent-fg' : 'bg-chip text-muted')}><Icon name={MODULE_ICONS[m.key] || 'grid'} /></span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">{m.label}</span>
                    <span className="truncate text-[13px] text-muted">{m.enabled ? moduleCount[m.key] || tr("متاحة") : tr("قريباً · المرحلة {0}", PHASE[m.key])}</span>
                  </span>
                  {m.enabled ? <Icon name="chevron" size={18} className="text-muted" /> : <Badge>{tr("قريباً")}</Badge>}
                </>
              );
              return m.enabled
                ? <Link key={m.key} to={'/' + m.key} className="flex items-center gap-3 bg-surface px-5 py-4 text-fg no-underline hover:bg-chip/40">{inner}</Link>
                : <div key={m.key} className="flex items-center gap-3 bg-surface px-5 py-4">{inner}</div>;
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

const A_ICON: Record<string, IconName> = { 'att.punch': 'clock', 'tsk.overdue': 'tasks', 'tsk.today': 'tasks', 'tsk.review': 'inbox', 'cor.overdue': 'mail', 'cor.soon': 'mail', 'hr.docs': 'file', 'crm.overdue': 'crm', 'crm.review': 'briefcase', 'cus.alerts': 'wallet', 'cus.mine': 'wallet' };
const A_TONE: Record<Attention['tone'], string> = { bad: 'bg-bad-bg text-bad', warn: 'bg-warn-bg text-warn', info: 'bg-accent-soft text-accent-fg' };

function AttentionRow({ a }: { a: Attention }) {
  return (
    <Link to={a.link} className="flex items-center gap-3 border-t border-line px-5 py-3 text-fg no-underline first:border-t-0 hover:bg-chip/40">
      <span className={cx('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', A_TONE[a.tone])}><Icon name={A_ICON[a.kind] || 'alert'} size={18} /></span>
      <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-semibold">{a.title}</span>{a.detail && <span className="truncate text-[12px] text-muted">{a.detail}</span>}</span>
      <Icon name="chevron" size={18} className="shrink-0 text-muted" />
    </Link>
  );
}

/** شهري: حضور الشهر الحالي باختصار */
function MyMonthCard({ a }: { a: NonNullable<HomeDashboard['my']['attendance']> }) {
  const tone = (v: number, bad: KpiTone = 'bad') => (v ? bad : 'ok');
  return (
    <Card className="flex flex-col gap-3">
      <PanelTitle title={tr("حضوري · {0}", monthLabel(a.month))} action={<Link to="/attendance/me" className="text-[13px] font-semibold text-accent-fg no-underline">{tr("سجلي")}</Link>} />
      <MiniStats items={[{ label: tr("يوم حضور"), value: a.presentDays }, { label: tr("ساعات"), value: hm(a.totalMinutes) }, { label: tr("إضافي"), value: duration(a.overtimeMin) }]} />
      <div className="flex flex-wrap gap-1.5 text-[12px]">
        <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1', tone(a.lateDays, 'warn') === 'ok' ? 'bg-ok-bg text-ok' : 'bg-warn-bg text-warn')}><Icon name="clock" size={13} />{a.lateDays ? tr("{0} يوم تأخير · {1}", a.lateDays, duration(a.lateMin)) : tr("بلا تأخير")}</span>
        <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1', a.absentDays ? 'bg-bad-bg text-bad' : 'bg-ok-bg text-ok')}><Icon name="alert" size={13} />{a.absentDays ? tr("{0} يوم غياب", a.absentDays) : tr("بلا غياب")}</span>
        {a.leaveDays > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-chip px-2.5 py-1"><Icon name="calendar" size={13} />{tr("{0} يوم إجازة", a.leaveDays)}</span>}
      </div>
    </Card>
  );
}

function TodayCard({ c }: { c: HomeCard }) {
  const label = c.isIn ? tr("داخل الدوام منذ {0}", formatTime(c.openSince)) : c.sessions ? tr("انصرفت · {0} ساعة اليوم", hm(c.closedMinutes)) : tr("لم تسجّل حضورك بعد");
  const off = c.dayType === 'holiday' ? tr("عطلة رسمية: {0}", c.detail) : c.dayType === 'leave' ? tr("في إجازة ({0})", c.detail) : c.dayType === 'weekend' ? tr("عطلة أسبوعية") : '';
  return (
    <Link to="/attendance" className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4 text-fg no-underline hover:border-line-strong sm:p-5">
      <span className={cx('inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full', c.isIn ? 'bg-ok-bg text-ok' : 'bg-accent text-on-accent')}>
        <Icon name={c.isIn ? 'logoutArrow' : 'login'} size={24} strokeWidth={2} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[16px] font-bold">{label}</span>
        <span className="text-[13px] text-muted">
          {c.shift ? <>{c.shift.name} <span className="ltr num">{c.shift.start}–{c.shift.end}</span></> : tr("بلا وردية")}
          {[off, c.late ? tr("تأخير {0}", duration(c.late)) : ''].filter(Boolean).map((x) => ' · ' + x).join('')}
        </span>
      </span>
      <span className="hidden font-semibold text-accent-fg sm:inline">{c.isIn ? tr("تسجيل الانصراف") : tr("تسجيل الحضور")}</span>
      <Icon name="chevron" className="text-muted" />
    </Link>
  );
}

function BoardCard({ c }: { c: HomeCard }) {
  const n = c.counts;
  const items: { k: string; v: number; tone?: string }[] = [
    { k: tr("حاضرون الآن"), v: n.in, tone: 'text-ok' }, { k: tr("متأخرون"), v: n.late, tone: n.late ? 'text-warn' : '' },
    { k: tr("غائبون"), v: n.absent, tone: n.absent ? 'text-bad' : '' }, { k: tr("لم يسجّلوا بعد"), v: n.none },
    { k: tr("إجازة"), v: n.leave }, { k: tr("انصرفوا"), v: n.out }
  ];
  return (
    <Card padded={false}>
      <CardHeader title={c.scope === 'team' ? tr("حضور فريقي اليوم") : tr("حضور اليوم")} action={<Link to="/attendance/overview" className="text-[13px] font-semibold text-accent-fg no-underline">{tr("نظرة عامة")}</Link>} />
      <div className="grid grid-cols-3 gap-px border-t border-line bg-line sm:grid-cols-6">
        {items.map((x) => (
          <div key={x.k} className="flex flex-col gap-1 bg-surface px-4 py-3">
            <span className={cx('text-[22px] font-bold leading-none num', x.tone)}>{x.v}</span>
            <span className="text-[12px] text-muted">{x.k}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SetupChecklist({ setup }: { setup: NonNullable<ReturnType<typeof useSummary>['data']>['setup'] }) {
  if (!setup) return null;
  const steps = [
    { done: setup.hasCompany, title: tr("بيانات الشركة"), body: tr("الاسم والعنوان والهاتف، وتظهر في المطبوعات."), to: '/settings/company' },
    { done: setup.usersCount > 1, title: tr("أضف الموظفين"), body: tr("من الموارد البشرية ← الموظفون، ثم أنشئ لكل موظف حساب دخول."), to: '/hr/employees' },
    { done: setup.rolesCount > 0, title: tr("حدّد الصلاحيات"), body: tr("اختر دور كل مستخدم في كل وحدة."), to: '/settings/users' }
  ];
  if (steps.every((x) => x.done)) return null;
  return (
    <Card padded={false}>
      <CardHeader title={tr("تجهيز البوابة")} action={<span className="text-[13px] text-muted">{tr("{0} من {1}", steps.filter((x) => x.done).length, steps.length)}</span>} />
      {steps.map((st) => (
        <Link key={st.title} to={st.to} className="flex items-center gap-3 border-t border-line px-5 py-3.5 text-fg no-underline hover:bg-chip/50">
          <span className={'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ' + (st.done ? 'bg-accent text-on-accent' : 'bg-chip text-muted')}>
            {st.done ? <Icon name="check" size={16} strokeWidth={2.4} /> : <Icon name="chevron" size={16} />}
          </span>
          <span className="flex flex-1 flex-col">
            <span className={'font-semibold ' + (st.done ? 'text-muted line-through' : '')}>{st.title}</span>
            <span className="text-[13px] text-muted">{st.body}</span>
          </span>
        </Link>
      ))}
    </Card>
  );
}

/** فلوس ← "12.500 د.ك" */
function kwdText(f: number) {
  const a = Math.abs(Math.round(f || 0));
  return (f < 0 ? '-' : '') + Math.floor(a / 1000).toLocaleString('en-US') + '.' + String(a % 1000).padStart(3, '0') + ' ' + tr("د.ك");
}
