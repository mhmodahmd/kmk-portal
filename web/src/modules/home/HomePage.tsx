import { tr } from '../../lib/i18n';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { useSummary } from '../../app/Shell';
import type { HomeCard } from '../../lib/types';
import { dmy, duration, formatTime, greeting, hm, todayLabel } from '../../lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Skeleton, StatTile } from '../../ui/Display';
import { Icon, type IconName } from '../../ui/Icon';
import { cx } from '../../ui/cx';

const MODULE_ICONS: Record<string, IconName> = { attendance: 'clock', hr: 'users', custody: 'wallet', tasks: 'tasks', crm: 'crm', finance: 'finance' };
const PHASE: Record<string, number> = { attendance: 1, hr: 1, custody: 2, tasks: 3, crm: 4, finance: 5 };

export default function HomePage() {
  const { user } = useAuth();
  const q = useSummary();
  const first = (user?.fullName || '').split(' ')[0];
  const s = q.data;
  const card = (kind: string) => s?.cards.find((c) => c.kind === kind);
  const today = card('att.today'), board = card('att.board'), leave = card('hr.leave'), docs = card('hr.docs');
  const cusMine = card('cus.mine'), cusStaff = card('cus.staff'), tasks = card('tsk.mine'), crm = card('crm.home');

  return (
    <div className="flex flex-col gap-5">
      <PageHeaderLine first={first} inbox={s?.inboxCount} />
      {q.isError && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}

      {today && <TodayCard c={today} />}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {q.isPending ? [0, 1, 2].map((i) => <Card key={i} className="flex flex-col gap-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-16" /><Skeleton className="h-3 w-32" /></Card>) : s && (
          <>
            <StatTile label={tr("بانتظار موافقتي")} value={s.inboxCount} icon="inbox" foot={<Link to="/inbox" className="text-accent-fg no-underline">{tr("فتح صندوق الموافقات")}</Link>} />
            {leave && leave.balances[0] && (
              <StatTile label={leave.balances[0].name} value={leave.balances[0].available} icon="calendar"
                foot={<Link to="/hr/leave" className="text-accent-fg no-underline">{leave.openRequests ? tr("{0} طلب قيد الموافقة", leave.openRequests) : tr("يوم متاح · طلب إجازة")}</Link>} />
            )}
            {cusMine?.custody && (
              <StatTile label={tr("رصيد عهدتي")} value={<span className="ltr inline-block">{kwdText(cusMine.custody.remaining)}</span>} icon="wallet"
                foot={<Link to={'/custody/' + cusMine.custody.id} className="text-accent-fg no-underline">{cusMine.custody.statusLabel}</Link>} />
            )}
            {cusStaff && (
              <StatTile label={tr("العهد بانتظار إجرائك")} value={cusStaff.pendingClose + cusStaff.pendingRequests + cusStaff.voucherRequests + cusStaff.awaitingSign} icon="wallet"
                foot={<Link to="/custody/all" className="text-accent-fg no-underline">{tr("{0} عهدة مفتوحة · رصيدها {1}", cusStaff.openCount, kwdText(cusStaff.openBalance))}</Link>} />
            )}
            {tasks && (tasks.open > 0 || tasks.review > 0) && (
              <StatTile label={tr("مهامي المفتوحة")} value={tasks.open} icon="tasks"
                foot={<Link to="/tasks" className={cx('no-underline', tasks.overdue ? 'font-semibold text-bad' : 'text-accent-fg')}>{tasks.overdue ? tr("{0} متأخرة", tasks.overdue) : tasks.today ? tr("{0} موعدها اليوم", tasks.today) : tasks.review ? tr("{0} بانتظار مراجعتك", tasks.review) : tr("فتح مهامي")}</Link>} />
            )}
            {crm && (crm.overdue > 0 || crm.due.length > 0 || crm.review > 0) && (
              <StatTile label={crm.overdue ? tr("دفعات متأخرة التحصيل") : crm.due.length ? tr("دفعات مستحقة قريباً") : tr("مشاريع تحتاج مراجعة")}
                value={crm.overdue || crm.due.length || crm.review} icon="crm"
                foot={<Link to={crm.overdue || crm.due.length ? '/crm/payments' : '/crm/projects?review=1'} className="text-accent-fg no-underline">{crm.review && (crm.overdue || crm.due.length) ? tr("و{0} مشاريع تحتاج مراجعة", crm.review) : tr("فتح العملاء")}</Link>} />
            )}
            {docs && <StatTile label={tr("مستندات تنتهي خلال 30 يوماً")} value={docs.count} icon="file" foot={<Link to="/hr/employees" className="text-accent-fg no-underline">{docs.employees} {tr("موظف في الدليل")}</Link>} />}
            {s.setup && !docs && <StatTile label={tr("مستخدمو البوابة")} value={s.setup.usersCount} icon="users" foot={<Link to="/settings/users" className="text-accent-fg no-underline">{tr("إدارة المستخدمين والأدوار")}</Link>} />}
          </>
        )}
      </div>

      {board && <BoardCard c={board} />}
      {tasks && tasks.items.length > 0 && <TasksCard c={tasks} />}
      {docs && docs.items.length > 0 && <DocsCard c={docs} />}
      {s?.setup && <SetupChecklist setup={s.setup} />}

      <Card padded={false}>
        <CardHeader title={tr("الوحدات")} />
        {q.isPending ? <div className="p-5"><Skeleton className="h-16" /></div> : s && s.modules.length === 0 ? (
          <EmptyState title={tr("لا وحدات مسندة لك بعد")} body={tr("سيحدد مدير النظام الوحدات التي تعمل عليها، وتظهر هنا فوراً.")} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-px border-t border-line bg-line">
            {s?.modules.map((m) => {
              const inner = (
                <>
                  <span className={cx('inline-flex h-10 w-10 items-center justify-center rounded-lg', m.enabled ? 'bg-accent-soft text-accent-fg' : 'bg-chip text-muted')}><Icon name={MODULE_ICONS[m.key] || 'grid'} /></span>
                  <span className="flex flex-1 flex-col">
                    <span className="font-semibold">{m.label}</span>
                    <span className="text-[13px] text-muted">{m.enabled ? tr("متاحة") : tr("قريباً · المرحلة {0}", PHASE[m.key])}</span>
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

function PageHeaderLine({ first, inbox }: { first: string; inbox?: number }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="m-0 text-[22px] font-bold leading-tight sm:text-[24px]">{greeting()}{tr("،")} {first}</h1>
      <span className="text-muted">{todayLabel()}{inbox === undefined ? '' : inbox ? tr(" · لديك {0} طلبات بانتظار قرارك", inbox) : tr(" · لا شيء ينتظر قرارك")}</span>
    </div>
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
      <CardHeader title={c.scope === 'team' ? tr("حضور فريقي اليوم") : tr("حضور اليوم")} action={<Link to="/attendance/today" className="text-[13px] text-accent-fg no-underline">{tr("التفاصيل")}</Link>} />
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

function DocsCard({ c }: { c: HomeCard }) {
  return (
    <Card padded={false}>
      <CardHeader title={tr("مستندات قاربت على الانتهاء")} action={<Link to="/hr/employees" className="text-[13px] text-accent-fg no-underline">{tr("دليل الموظفين")}</Link>} />
      {c.items.map((x: { employeeId: string; field: string; name: string; doc: string; date: string; daysLeft: number }) => (
        <div key={x.employeeId + x.field} className="flex items-center gap-3 border-t border-line px-5 py-3">
          <Icon name="file" className={x.daysLeft < 0 ? 'text-bad' : 'text-warn'} />
          <span className="flex-1"><b>{x.name}</b> <span className="text-muted">· {x.doc} · {dmy(x.date)}</span></span>
          <Badge tone={x.daysLeft < 0 ? 'bad' : 'warn'}>{x.daysLeft < 0 ? tr("منتهية") : tr("{0} يوم", x.daysLeft)}</Badge>
        </div>
      ))}
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

function TasksCard({ c }: { c: HomeCard }) {
  return (
    <Card padded={false}>
      <CardHeader title={tr("مهامي القادمة")} action={<Link to="/tasks" className="text-[13px] font-semibold text-accent-fg no-underline">{tr("كل مهامي")}</Link>} />
      {c.items.map((t: { id: string; number: string; title: string; dueDate: string; overdue: boolean; priority: string; priorityLabel: string }) => (
        <Link key={t.id} to={'/tasks/' + t.id} className="flex items-center gap-3 border-t border-line px-5 py-3 text-fg no-underline hover:bg-chip/40">
          <Icon name="tasks" size={18} className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
          {t.priority === 'urgent' || t.priority === 'high' ? <Badge tone={t.priority === 'urgent' ? 'bad' : 'warn'}>{t.priorityLabel}</Badge> : null}
          {t.dueDate && <span className={cx('text-[12px] num', t.overdue ? 'font-semibold text-bad' : 'text-muted')}>{dmy(t.dueDate)}</span>}
        </Link>
      ))}
    </Card>
  );
}
