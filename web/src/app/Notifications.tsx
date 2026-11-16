import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tr } from '../lib/i18n';
import { api } from '../lib/api';
import { relativeTime } from '../lib/format';
import { Icon } from '../ui/Icon';
import { cx } from '../ui/cx';

export interface NotificationItem { id: string; kind: 'approval' | 'event'; module: string; title: string; detail: string; link: string; actorName: string; createdAt: string; read: boolean }
export interface NotificationList { items: NotificationItem[]; unread: number; email: { on: boolean; available: boolean; address: string } }

const BROWSER_KEY = 'kmk.notify.browser';
const SEEN_KEY = 'kmk.notify.seen';
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* لا تخزين */ } }
};

export const browserAlertsSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const browserAlertsOn = () => browserAlertsSupported() && Notification.permission === 'granted' && store.get(BROWSER_KEY) === '1';
export async function setBrowserAlerts(on: boolean) {
  if (!on) { store.set(BROWSER_KEY, '0'); return false; }
  if (!browserAlertsSupported()) return false;
  const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  store.set(BROWSER_KEY, p === 'granted' ? '1' : '0');
  return p === 'granted';
}

/** الإشعارات: كل دقيقتين والتبويب ظاهر (refetchIntervalInBackground=false افتراضياً فيتوقف الاستطلاع عند إخفائه)، وفوراً عند العودة */
export function useNotifications() {
  return useQuery({ queryKey: ['notify.list'], queryFn: () => api<NotificationList>('notify.list', { limit: 40 }), refetchInterval: 120_000, refetchIntervalInBackground: false, staleTime: 20_000 });
}

/** تنبيه المتصفح للإشعارات الجديدة التي وصلت والصفحة في الخلفية */
function useBrowserAlerts(items: NotificationItem[] | undefined) {
  const nav = useNavigate();
  useEffect(() => {
    if (!items?.length) return;
    const newest = items[0].createdAt;
    const seen = store.get(SEEN_KEY);
    store.set(SEEN_KEY, newest);
    if (!seen || !browserAlertsOn() || !document.hidden) return;
    items.filter((n) => !n.read && n.createdAt > seen).slice(0, 3).forEach((n) => {
      const opts = { body: n.detail, tag: n.id, icon: import.meta.env.BASE_URL + 'icon-192.png', data: { link: n.link || '/' } };
      // الجوال يشترط عامل الخدمة؛ وإلا فتنبيه مباشر
      const sw = 'serviceWorker' in navigator ? navigator.serviceWorker.getRegistration() : Promise.resolve(undefined);
      sw.then((reg) => {
        if (reg) return reg.showNotification(n.title, opts);
        const a = new Notification(n.title, opts);
        a.onclick = () => { window.focus(); nav(n.link || '/'); a.close(); };
      }).catch(() => { /* المتصفح منعه */ });
    });
  }, [items, nav]);
}

export function NotificationBell() {
  const q = useNotifications();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useBrowserAlerts(q.data?.items);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const unread = q.data?.unread || 0;
  const markAll = async () => { await api('notify.read', { all: true }); await qc.invalidateQueries({ queryKey: ['notify.list'] }); };
  const openItem = async (n: NotificationItem) => {
    setOpen(false);
    if (n.link) nav(n.link);
    if (!n.read) { await api('notify.read', { id: n.id }).catch(() => undefined); void qc.invalidateQueries({ queryKey: ['notify.list'] }); }
  };

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog"
        aria-label={unread ? tr("الإشعارات ({0} جديد)", unread) : tr("الإشعارات")} title={tr("الإشعارات")}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-chip hover:text-fg cursor-pointer">
        <Icon name="bell" />
        {unread > 0 && <span className="absolute -top-0.5 -end-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-white ring-2 ring-surface num">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label={tr("الإشعارات")}
          className="kmk-in fixed inset-x-3 top-[60px] z-50 flex max-h-[75vh] flex-col overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-xl sm:absolute sm:inset-x-auto sm:end-0 sm:top-12 sm:w-[380px]">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <h2 className="m-0 flex-1 text-[16px] font-bold">{tr("الإشعارات")}</h2>
            {unread > 0 && <button type="button" onClick={markAll} className="text-[13px] font-semibold text-accent-fg cursor-pointer">{tr("تعليم الكل كمقروء")}</button>}
          </div>
          <div className="flex-1 overflow-y-auto">
            {!q.data ? <p className="m-0 p-5 text-center text-muted">{tr("جارٍ التحميل")}</p> : q.data.items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center text-muted">
                <Icon name="bell" size={28} />
                <span>{tr("لا إشعارات بعد")}</span>
                <span className="text-[12px]">{tr("تصلك هنا الطلبات التي تنتظر قرارك ونتائج طلباتك والمهام المسندة إليك.")}</span>
              </div>
            ) : q.data.items.map((n) => (
              <button key={n.id} type="button" onClick={() => openItem(n)}
                className={cx('flex w-full items-start gap-3 border-b border-line px-4 py-3 text-start last:border-b-0 cursor-pointer hover:bg-chip/50', !n.read && 'bg-accent-soft/40')}>
                <span className={cx('mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full', n.kind === 'approval' ? 'bg-warn-bg text-warn' : 'bg-chip text-muted')}>
                  <Icon name={n.kind === 'approval' ? 'inbox' : n.module === 'tasks' ? 'tasks' : n.module === 'correspondence' ? 'mail' : n.module === 'custody' ? 'wallet' : n.module === 'attendance' ? 'clock' : 'bell'} size={16} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cx('leading-snug', !n.read ? 'font-semibold' : 'text-muted')}>{n.title}</span>
                  {n.detail && <span className="line-clamp-2 text-[13px] text-muted">{n.detail}</span>}
                  <span className="text-[12px] text-muted">{relativeTime(n.createdAt)}</span>
                </span>
                {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" aria-label={tr("جديد")} />}
              </button>
            ))}
          </div>
          <Link to="/profile" onClick={() => setOpen(false)} className="border-t border-line px-4 py-2.5 text-center text-[13px] font-semibold text-accent-fg no-underline">{tr("تفضيلات الإشعارات")}</Link>
        </div>
      )}
    </div>
  );
}
