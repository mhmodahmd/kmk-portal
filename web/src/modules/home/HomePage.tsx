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

  return (
    <div className="flex flex-col gap-5">
      <PageHeaderLine first={first} inbox={s?.inboxCount} />
      {q.isError && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}

      {today && <TodayCard c={today} />}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {q.isPending ? [0, 1, 2].map((i) => <Card key={i} className="flex flex-col gap-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-16" /><Skeleton className="h-3 w-32" /></Card>) : s && (
          <>
            <StatTile label="بانتظار موافقتي" value={s.inboxCount} icon="inbox" foot={<Link to="/inbox" className="text-accent-fg no-underline">فتح صندوق الموافقات</Link>} />
            {leave && leave.balances[0] && (
              <StatTile label={leave.balances[0].name} value={leave.balances[0].available} icon="calendar"
                foot={<Link to="/hr/leave" className="text-accent-fg no-underline">{leave.openRequests ? `${leave.openRequests} طلب قيد الموافقة` : 'يوم متاح · طلب إجازة'}</Link>} />
            )}
            {docs && <StatTile label="مستندات تنتهي خلال 30 يوماً" value={docs.count} icon="file" foot={<Link to="/hr/employees" className="text-accent-fg no-underline">{docs.employees} موظف في الدليل</Link>} />}
            {s.setup && !docs && <StatTile label="مستخدمو البوابة" value={s.setup.usersCount} icon="users" foot={<Link to="/settings/users" className="text-accent-fg no-underline">إدارة المستخدمين والأدوار</Link>} />}
          </>
        )}
      </div>

      {board && <BoardCard c={board} />}
      {docs && docs.items.length > 0 && <DocsCard c={docs} />}
      {s?.setup && <SetupChecklist setup={s.setup} />}

      <Card padded={false}>
        <CardHeader title="الوحدات" />
        {q.isPending ? <div className="p-5"><Skeleton className="h-16" /></div> : s && s.modules.length === 0 ? (
          <EmptyState title="لا وحدات مسندة لك بعد" body="سيحدد مدير النظام الوحدات التي تعمل عليها، وتظهر هنا فوراً." />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-px border-t border-line bg-line">
            {s?.modules.map((m) => {
              const inner = (
                <>
                  <span className={cx('inline-flex h-10 w-10 items-center justify-center rounded-lg', m.enabled ? 'bg-accent-soft text-accent-fg' : 'bg-chip text-muted')}><Icon name={MODULE_ICONS[m.key] || 'grid'} /></span>
                  <span className="flex flex-1 flex-col">
                    <span className="font-semibold">{m.label}</span>
                    <span className="text-[13px] text-muted">{m.enabled ? 'متاحة' : `قريباً · المرحلة ${PHASE[m.key]}`}</span>
                  </span>
                  {m.enabled ? <Icon name="chevron" size={18} className="text-muted" /> : <Badge>قريباً</Badge>}
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
      <h1 className="m-0 text-[22px] font-bold leading-tight sm:text-[24px]">{greeting()}، {first}</h1>
      <span className="text-muted">{todayLabel()}{inbox === undefined ? '' : inbox ? ` · لديك ${inbox} طلبات بانتظار قرارك` : ' · لا شيء ينتظر قرارك'}</span>
    </div>
  );
}

function TodayCard({ c }: { c: HomeCard }) {
  const label = c.isIn ? `داخل الدوام منذ ${formatTime(c.openSince)}` : c.sessions ? `انصرفت · ${hm(c.closedMinutes)} ساعة اليوم` : 'لم تسجّل حضورك بعد';
  const off = c.dayType === 'holiday' ? `عطلة رسمية: ${c.detail}` : c.dayType === 'leave' ? `في إجازة (${c.detail})` : c.dayType === 'weekend' ? 'عطلة أسبوعية' : '';
  return (
    <Link to="/attendance" className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4 text-fg no-underline hover:border-line-strong sm:p-5">
      <span className={cx('inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full', c.isIn ? 'bg-ok-bg text-ok' : 'bg-accent text-on-accent')}>
        <Icon name={c.isIn ? 'logoutArrow' : 'login'} size={24} strokeWidth={2} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[16px] font-bold">{label}</span>
        <span className="text-[13px] text-muted">
          {c.shift ? <>{c.shift.name} <span className="ltr num">{c.shift.start}–{c.shift.end}</span></> : 'بلا وردية'}
          {[off, c.late ? `تأخير ${duration(c.late)}` : ''].filter(Boolean).map((x) => ' · ' + x).join('')}
        </span>
      </span>
      <span className="hidden font-semibold text-accent-fg sm:inline">{c.isIn ? 'تسجيل الانصراف' : 'تسجيل الحضور'}</span>
      <Icon name="chevron" className="text-muted" />
    </Link>
  );
}

function BoardCard({ c }: { c: HomeCard }) {
  const n = c.counts;
  const items: { k: string; v: number; tone?: string }[] = [
    { k: 'حاضرون الآن', v: n.in, tone: 'text-ok' }, { k: 'متأخرون', v: n.late, tone: n.late ? 'text-warn' : '' },
    { k: 'غائبون', v: n.absent, tone: n.absent ? 'text-bad' : '' }, { k: 'لم يسجّلوا بعد', v: n.none },
    { k: 'إجازة', v: n.leave }, { k: 'انصرفوا', v: n.out }
  ];
  return (
    <Card padded={false}>
      <CardHeader title={c.scope === 'team' ? 'حضور فريقي اليوم' : 'حضور اليوم'} action={<Link to="/attendance/today" className="text-[13px] text-accent-fg no-underline">التفاصيل</Link>} />
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
      <CardHeader title="مستندات قاربت على الانتهاء" action={<Link to="/hr/employees" className="text-[13px] text-accent-fg no-underline">دليل الموظفين</Link>} />
      {c.items.map((x: { employeeId: string; field: string; name: string; doc: string; date: string; daysLeft: number }) => (
        <div key={x.employeeId + x.field} className="flex items-center gap-3 border-t border-line px-5 py-3">
          <Icon name="file" className={x.daysLeft < 0 ? 'text-bad' : 'text-warn'} />
          <span className="flex-1"><b>{x.name}</b> <span className="text-muted">· {x.doc} · {dmy(x.date)}</span></span>
          <Badge tone={x.daysLeft < 0 ? 'bad' : 'warn'}>{x.daysLeft < 0 ? 'منتهية' : `${x.daysLeft} يوم`}</Badge>
        </div>
      ))}
    </Card>
  );
}

function SetupChecklist({ setup }: { setup: NonNullable<ReturnType<typeof useSummary>['data']>['setup'] }) {
  if (!setup) return null;
  const steps = [
    { done: setup.hasCompany, title: 'بيانات الشركة', body: 'الاسم والعنوان والهاتف، وتظهر في المطبوعات.', to: '/settings/company' },
    { done: setup.usersCount > 1, title: 'أضف الموظفين', body: 'من الموارد البشرية ← الموظفون، ثم أنشئ لكل موظف حساب دخول.', to: '/hr/employees' },
    { done: setup.rolesCount > 0, title: 'حدّد الصلاحيات', body: 'اختر دور كل مستخدم في كل وحدة.', to: '/settings/users' }
  ];
  if (steps.every((x) => x.done)) return null;
  return (
    <Card padded={false}>
      <CardHeader title="تجهيز البوابة" action={<span className="text-[13px] text-muted">{steps.filter((x) => x.done).length} من {steps.length}</span>} />
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
