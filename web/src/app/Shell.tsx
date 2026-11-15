import { tr } from '../lib/i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { HomeSummary } from '../lib/types';
import { useTheme } from '../lib/theme';
import { LangToggle } from '../ui/LangToggle';
import { useAuth } from './auth';
import { Icon, type IconName } from '../ui/Icon';
import { Avatar } from '../ui/Display';
import { IconButton } from '../ui/Button';
import { cx } from '../ui/cx';
import { ErrorBoundary } from '../ui/ErrorBoundary';

const BASE = import.meta.env.BASE_URL;

interface NavItem { to: string; label: string; icon: IconName; module?: string; superOnly?: boolean; soon?: boolean }

const GROUPS: { label: string; items: NavItem[] }[] = [
  { label: tr("عام"), items: [{ to: '/', label: tr("الرئيسية"), icon: 'home' }, { to: '/inbox', label: tr("الموافقات"), icon: 'inbox' }] },
  { label: tr("الموظفون"), items: [{ to: '/attendance', label: tr("الحضور والانصراف"), icon: 'clock', module: 'attendance' }, { to: '/hr', label: tr("الموارد البشرية"), icon: 'users', module: 'hr' }] },
  { label: tr("العمل"), items: [{ to: '/tasks', label: tr("المهام"), icon: 'tasks', module: 'tasks' }, { to: '/crm', label: tr("العملاء"), icon: 'crm', module: 'crm', soon: true }] },
  { label: tr("المالية"), items: [{ to: '/custody', label: tr("العهد والنثريات"), icon: 'wallet', module: 'custody' }, { to: '/finance', label: tr("المالية"), icon: 'finance', module: 'finance', soon: true }] },
  { label: tr("النظام"), items: [{ to: '/settings/users', label: tr("المستخدمون والأدوار"), icon: 'shield', superOnly: true }, { to: '/settings/company', label: tr("بيانات الشركة"), icon: 'building', superOnly: true }, { to: '/settings/audit', label: tr("سجل العمليات"), icon: 'history', superOnly: true }] }
];

export function useSummary() {
  return useQuery({ queryKey: ['home.summary'], queryFn: () => api<HomeSummary>('home.summary'), staleTime: 30_000 });
}

function useNav() {
  const { user, roles } = useAuth();
  return GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => (it.superOnly ? user?.isSuperAdmin : it.module ? user?.isSuperAdmin || roles[it.module] : true))
  })).filter((g) => g.items.length);
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useAuth();
  const groups = useNav();
  const summary = useSummary();
  const inbox = summary.data?.inboxCount || 0;
  return (
    <nav aria-label={tr("القائمة الرئيسية")} className="flex h-full flex-col gap-1 bg-side px-3 py-5 text-side-fg">
      <img src={BASE + 'logo-on-dark.png'} alt="KMK" className="mx-3 mb-5 mt-1 h-[26px] w-auto self-start" />
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-0.5">
            <span className="px-3 pb-1 pt-1.5 text-[12px] text-side-muted">{g.label}</span>
            {g.items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.to === '/'} onClick={onNavigate}
                className={({ isActive }) => cx('flex h-10 items-center gap-3 rounded-lg px-3 font-medium no-underline transition-colors',
                  isActive ? 'bg-side-active text-white shadow-[inset_-3px_0_0_var(--c-brand)]' : 'text-side-fg hover:bg-side-active/60 hover:text-white')}>
                <Icon name={it.icon} />
                <span className="flex-1">{it.label}</span>
                {it.to === '/inbox' && inbox > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[12px] font-semibold text-white">{inbox}</span>}
                {it.soon && <span className="text-[11px] text-side-muted">{tr("قريباً")}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2.5 border-t border-side-line px-2 pt-3">
        <NavLink to="/profile" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 no-underline hover:bg-side-active/60">
          <Avatar name={user?.fullName || ''} dark />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-white">{user?.fullName}</span>
            <span className="truncate text-[12px] text-side-muted">{user?.jobTitle || (user?.isSuperAdmin ? tr("مدير النظام") : '')}</span>
          </span>
        </NavLink>
        <button type="button" onClick={signOut} aria-label={tr("تسجيل الخروج")} title={tr("تسجيل الخروج")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-side-fg hover:bg-side-active hover:text-white cursor-pointer"><Icon name="logout" /></button>
      </div>
    </nav>
  );
}

function useMobileTabs(): { to: string; label: string; icon: IconName; end?: boolean }[] {
  const { user, roles } = useAuth();
  const all = !!user?.isSuperAdmin;
  return [
    { to: '/', label: tr("الرئيسية"), icon: 'home', end: true },
    ...(all || roles.attendance ? [{ to: '/attendance', label: tr("البصمة"), icon: 'clock' as IconName, end: true }] : []),
    ...(roles.custody ? [{ to: '/custody', label: tr("العهدة"), icon: 'wallet' as IconName }] : []),
    { to: '/inbox', label: tr("الموافقات"), icon: 'inbox' },
    all || roles.hr ? { to: '/hr', label: tr("ملفي"), icon: 'user', end: true } : { to: '/profile', label: tr("ملفي"), icon: 'user' }
  ];
}

export default function Shell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const { toggle, isDark } = useTheme();
  const loc = useLocation();
  const summary = useSummary();
  const tabs = useMobileTabs();
  useEffect(() => { setDrawer(false); }, [loc.pathname]);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 lg:block"><Sidebar /></aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={tr("القائمة")}>
          <div className="absolute inset-0 bg-overlay" onClick={() => setDrawer(false)} />
          <div className="kmk-in absolute inset-y-0 start-0 w-[280px] max-w-[85vw]"><Sidebar onNavigate={() => setDrawer(false)} /></div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface/95 px-3 py-2.5 backdrop-blur sm:px-6 lg:py-3">
          <IconButton icon="menu" label={tr("القائمة")} className="lg:hidden" onClick={() => setDrawer(true)} />
          <img src={BASE + 'logo.png'} alt="KMK" className="h-5 w-auto lg:hidden dark:hidden" />
          <img src={BASE + 'logo-on-dark.png'} alt="KMK" className="hidden h-5 w-auto dark:inline lg:dark:hidden" />
          <div className="ms-auto flex items-center gap-1">
            <LangToggle />
            <IconButton icon={isDark ? 'sun' : 'moon'} label={isDark ? tr("الوضع النهاري") : tr("الوضع الليلي")} onClick={toggle} />
            <NavLink to="/inbox" aria-label={tr("الموافقات")} className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-chip hover:text-fg">
              <Icon name="bell" />
              {(summary.data?.inboxCount || 0) > 0 && <span className="absolute top-2 end-2 h-2 w-2 rounded-full bg-brand ring-2 ring-surface" />}
            </NavLink>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-28 pt-5 sm:px-7 sm:pt-7 lg:pb-10">
          <ErrorBoundary resetKey={loc.pathname}>{children}</ErrorBoundary>
        </main>

        <nav aria-label={tr("التنقل السفلي")} style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
          className="no-print fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface px-1.5 pb-[max(env(safe-area-inset-bottom),10px)] pt-1.5 lg:hidden">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end}
              className={({ isActive }) => cx('relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] no-underline', isActive ? 'font-bold text-brand' : 'font-medium text-muted')}>
              <Icon name={t.icon} size={23} />{t.label}
              {t.to === '/inbox' && (summary.data?.inboxCount || 0) > 0 && <span className="absolute top-1.5 left-1/2 ml-2 h-2 w-2 rounded-full bg-brand" />}
            </NavLink>
          ))}
          <button type="button" onClick={() => setDrawer(true)} className="flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium text-muted cursor-pointer">
            <Icon name="grid" size={23} />{tr("المزيد")}
          </button>
        </nav>
      </div>
    </div>
  );
}
