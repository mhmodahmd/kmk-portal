import { Outlet, useSearchParams } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { PageHeader } from '../../ui/Display';
import { Segmented, TabNav } from '../../ui/Controls';
import type { PltLookups } from './types';

export const PLT_KEYS = ['plt.lookups', 'plt.dashboard', 'plt.months', 'plt.sales', 'plt.centers', 'plt.campaigns', 'crm.lookups'];

export const usePltLookups = () => useApi<PltLookups>('plt.lookups', {}, { staleTime: 5 * 60_000 });

const STORE = 'kmk.platform';
const remembered = () => { try { return localStorage.getItem(STORE) || 'all'; } catch { return 'all'; } };

/** المنصة المختارة: من الرابط (?p=) ثم آخر اختيار على هذا الجهاز */
export function usePlatform(): [string, (p: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get('p') || remembered();
  const set = (p: string) => {
    try { localStorage.setItem(STORE, p); } catch { /* المتصفح يمنع التخزين */ }
    const next = new URLSearchParams(params);
    next.set('p', p);
    setParams(next, { replace: true });
  };
  return [value, set];
}

/** رابط داخل الوحدة يحفظ المنصة المختارة */
export function pltLink(path: string, platform: string, extra: Record<string, string | undefined> = {}) {
  const q = new URLSearchParams({ p: platform });
  Object.entries(extra).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v); });
  return path + '?' + q.toString();
}

export function PltLayout() {
  const L = usePltLookups().data;
  const [platform, setPlatform] = usePlatform();
  const items = [
    { to: pltLink('/platforms', platform), label: tr("نظرة عامة"), end: true },
    { to: pltLink('/platforms/sales', platform), label: tr("المبيعات الشهرية") },
    { to: pltLink('/platforms/centers', platform), label: tr("المراكز") },
    { to: pltLink('/platforms/campaigns', platform), label: tr("المسابقات والتحديات") },
    ...(L?.isManager ? [{ to: pltLink('/platforms/settings', platform), label: tr("الإعدادات") }] : [])
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={tr("المالية")} title={tr("المنصات")} subtitle={tr("إيرادات صاد القرآني ومقرأة تراث: مبيعات التطبيق، والرعايات والعقود")} />
      {L && (
        <div className="overflow-x-auto">
          <Segmented label={tr("المنصة")} value={platform} onChange={setPlatform}
            options={[{ value: 'all', label: tr("الكل") }, ...L.platforms.map((p) => ({ value: p.key, label: p.name }))]} />
        </div>
      )}
      <TabNav label={tr("أقسام المنصات")} items={items} />
      <Outlet />
    </div>
  );
}
