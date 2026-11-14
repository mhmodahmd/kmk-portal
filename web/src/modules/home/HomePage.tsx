import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { useSummary } from '../../app/Shell';
import { greeting, todayLabel } from '../../lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, PageHeader, Skeleton, StatTile } from '../../ui/Display';
import { Icon, type IconName } from '../../ui/Icon';

const MODULE_ICONS: Record<string, IconName> = { attendance: 'clock', hr: 'users', custody: 'wallet', tasks: 'tasks', crm: 'crm', finance: 'finance' };
const PHASE: Record<string, number> = { attendance: 1, hr: 1, custody: 2, tasks: 3, crm: 4, finance: 5 };

export default function HomePage() {
  const { user } = useAuth();
  const q = useSummary();
  const first = (user?.fullName || '').split(' ')[0];
  const s = q.data;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`${greeting()}، ${first}`} subtitle={todayLabel() + (s ? (s.inboxCount ? ` · لديك ${s.inboxCount} طلبات بانتظار قرارك` : ' · لا شيء ينتظر قرارك') : '')} />

      {q.isError && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {q.isPending ? [0, 1, 2].map((i) => <Card key={i} className="flex flex-col gap-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-16" /><Skeleton className="h-3 w-32" /></Card>) : s && (
          <>
            <StatTile label="بانتظار موافقتي" value={s.inboxCount} icon="inbox" foot={<Link to="/inbox" className="text-accent-fg no-underline">فتح صندوق الموافقات</Link>} />
            <StatTile label="وحداتي" value={s.modules.length} icon="grid" foot={s.modules.length ? s.modules.map((m) => m.label).join('، ') : 'لم تُسند لك وحدات بعد'} />
            {s.setup && <StatTile label="مستخدمو البوابة" value={s.setup.usersCount} icon="users" foot={<Link to="/settings/users" className="text-accent-fg no-underline">إدارة المستخدمين والأدوار</Link>} />}
          </>
        )}
      </div>

      {s?.setup && <SetupChecklist setup={s.setup} />}

      <Card padded={false}>
        <CardHeader title="الوحدات" />
        {q.isPending ? <div className="p-5"><Skeleton className="h-16" /></div> : s && s.modules.length === 0 ? (
          <EmptyState title="لا وحدات مسندة لك بعد" body="سيحدد مدير النظام الوحدات التي تعمل عليها، وتظهر هنا فوراً." />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-px border-t border-line bg-line">
            {s?.modules.map((m) => (
              <div key={m.key} className="flex items-center gap-3 bg-surface px-5 py-4">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-chip text-muted"><Icon name={MODULE_ICONS[m.key] || 'grid'} /></span>
                <span className="flex flex-1 flex-col">
                  <span className="font-semibold">{m.label}</span>
                  <span className="text-[13px] text-muted">{m.enabled ? 'متاحة' : `قريباً · المرحلة ${PHASE[m.key]}`}</span>
                </span>
                {!m.enabled && <Badge>قريباً</Badge>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function SetupChecklist({ setup }: { setup: NonNullable<ReturnType<typeof useSummary>['data']>['setup'] }) {
  if (!setup) return null;
  const steps = [
    { done: setup.hasCompany, title: 'بيانات الشركة', body: 'الاسم والعنوان والهاتف، وتظهر في المطبوعات.', to: '/settings/company' },
    { done: setup.usersCount > 1, title: 'أضف الموظفين', body: 'أنشئ حساباً لكل موظف، وسلّمه كلمة المرور المؤقتة.', to: '/settings/users' },
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
