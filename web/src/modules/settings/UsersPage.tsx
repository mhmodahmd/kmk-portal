import { tr } from '../../lib/i18n';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { ManagedUser, ModuleRoleDef, Roles } from '../../lib/types';
import { formatDateTime } from '../../lib/format';
import { useAuth } from '../../app/auth';
import { Avatar, Badge, Card, ErrorBox, PageHeader, Skeleton } from '../../ui/Display';
import { Button } from '../../ui/Button';
import { Checkbox, Select, TextInput } from '../../ui/Field';
import { Dialog, useToast } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';

interface ListResult { users: ManagedUser[]; modules: ModuleRoleDef[] }
interface Draft { id?: string; fullName: string; username: string; jobTitle: string; phone: string; email: string; active: boolean; isSuperAdmin: boolean; roles: Roles }

const empty: Draft = { fullName: '', username: '', jobTitle: '', phone: '', email: '', active: true, isSuperAdmin: false, roles: {} };

export default function UsersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user: me } = useAuth();
  const q = useQuery({ queryKey: ['users.list'], queryFn: () => api<ListResult>('users.list') });
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(empty);
  const [error, setError] = useState('');
  const [temp, setTemp] = useState<{ name: string; username: string; password: string } | null>(null);

  const users = q.data?.users || [];
  const modules = q.data?.modules || [];
  const visible = useMemo(() => users.filter((u) => (showInactive || u.active) && (!search || (u.fullName + ' ' + u.username).toLowerCase().includes(search.toLowerCase()))), [users, search, showInactive]);
  const selected = users.find((u) => u.id === selectedId) || null;

  useEffect(() => {
    if (creating) { setDraft(empty); setError(''); return; }
    // مستخدم مُنشأ للتو قد لا يكون في القائمة بعد: ننتظر التحديث بدل القفز لغيره
    const u = selectedId ? selected : visible[0];
    if (u) { setSelectedId(u.id); setDraft({ id: u.id, fullName: u.fullName, username: u.username, jobTitle: u.jobTitle, phone: u.phone, email: u.email, active: u.active, isSuperAdmin: u.isSuperAdmin, roles: { ...u.roles } }); setError(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, creating, q.data]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ['users.list'] }); qc.invalidateQueries({ queryKey: ['home.summary'] }); };
  const onErr = (e: unknown) => setError(e instanceof ApiError ? e.message : tr("تعذّر الحفظ."));

  type SaveResult = { created: { user: ManagedUser; tempPassword: string } | null };
  const save = useMutation({
    mutationFn: async (d: Draft): Promise<SaveResult> => d.id
      ? (await api<ManagedUser>('users.update', d), { created: null })
      : { created: await api<{ user: ManagedUser; tempPassword: string }>('users.create', d) },
    onSuccess: ({ created }) => {
      refresh();
      if (created) {
        setTemp({ name: created.user.fullName, username: created.user.username, password: created.tempPassword });
        setCreating(false); setSelectedId(created.user.id);
      } else toast(tr("تم حفظ التغييرات"));
    },
    onError: onErr
  });
  const reset = useMutation({
    mutationFn: (id: string) => api<{ tempPassword: string }>('users.resetPassword', { id }),
    onSuccess: (r) => { if (selected) setTemp({ name: selected.fullName, username: selected.username, password: r.tempPassword }); refresh(); },
    onError: onErr
  });
  const unlock = useMutation({ mutationFn: (id: string) => api('users.unlock', { id }), onSuccess: () => { toast(tr("تم فك قفل الحساب")); refresh(); }, onError: onErr });

  const roleLabel = (m: ModuleRoleDef, key: string) => m.roles.find((r) => r.key === key)?.label || key;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={tr("النظام")} title={tr("المستخدمون والأدوار")}
        actions={<Button variant="primary" icon="plus" onClick={() => { setCreating(true); setSelectedId(null); }}>{tr("مستخدم جديد")}</Button>} />
      {q.isError && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}

      <div className="flex flex-wrap items-start gap-4">
        <Card padded={false} className="min-w-0 flex-[3_1_520px] overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-line p-3.5">
            <label className="sr-only" htmlFor="user-search">{tr("بحث في المستخدمين")}</label>
            <div className="flex h-10 flex-[1_1_220px] items-center gap-2 rounded-lg border border-line bg-bg px-3 text-muted">
              <Icon name="search" size={18} />
              <input id="user-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("ابحث بالاسم أو اسم المستخدم")} className="h-full flex-1 bg-transparent text-fg outline-none" />
            </div>
            <Checkbox label={tr("إظهار المعطّلين")} checked={showInactive} onChange={setShowInactive} />
          </div>
          {q.isPending ? <div className="flex flex-col gap-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div> : (
            <ul className="m-0 list-none p-0">
              {visible.map((u) => {
                const tags = [
                  ...(u.isSuperAdmin ? [tr("مدير النظام")] : []),
                  ...modules.filter((m) => u.roles[m.key]).map((m) => m.label.split(' ')[0] + ': ' + roleLabel(m, u.roles[m.key]))
                ];
                return (
                  <li key={u.id} className="border-t border-line first:border-t-0">
                    <button type="button" onClick={() => { setCreating(false); setSelectedId(u.id); }}
                      className={cx('flex w-full items-center gap-3 px-4 py-3 text-right cursor-pointer', !creating && selectedId === u.id ? 'bg-accent-soft' : 'hover:bg-chip/50')}>
                      <Avatar name={u.fullName} size={34} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold">{u.fullName}{u.id === me?.id && <span className="text-[12px] font-normal text-muted"> {tr("(أنت)")}</span>}</span>
                        <span className="ltr text-right text-[12px] text-muted">{u.username}</span>
                      </span>
                      <span className="hidden max-w-[280px] flex-wrap justify-end gap-1 md:flex">
                        {tags.length ? tags.map((t) => <Badge key={t} tone="info">{t}</Badge>) : <Badge>{tr("بلا أدوار")}</Badge>}
                      </span>
                      {!u.active ? <Badge>{tr("معطّل")}</Badge> : u.locked ? <Badge tone="bad">{tr("مقفل")}</Badge> : u.mustChangePassword ? <Badge tone="warn">{tr("لم يدخل بعد")}</Badge> : null}
                    </button>
                  </li>
                );
              })}
              {!visible.length && <li className="p-8 text-center text-muted">{tr("لا نتائج.")}</li>}
            </ul>
          )}
        </Card>

        {(creating || selected) && (
          <Card as="aside" className="flex min-w-0 flex-[2_1_340px] flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar name={draft.fullName || '+'} size={44} />
              <div className="flex flex-col">
                <span className="text-[17px] font-bold">{creating ? tr("مستخدم جديد") : draft.fullName}</span>
                {!creating && selected && <span className="text-[13px] text-muted">{tr("آخر دخول:")} {selected.lastLogin ? formatDateTime(selected.lastLogin) : tr("لم يدخل بعد")}</span>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextInput label={tr("الاسم الكامل")} value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} />
              <TextInput label={tr("اسم المستخدم")} ltr value={draft.username} disabled={!creating} onChange={(e) => setDraft({ ...draft, username: e.target.value })} autoCapitalize="none" hint={creating ? tr("حروف إنجليزية صغيرة وأرقام") : undefined} />
              <TextInput label={tr("المسمى الوظيفي")} value={draft.jobTitle} onChange={(e) => setDraft({ ...draft, jobTitle: e.target.value })} />
              <TextInput label={tr("الهاتف")} ltr inputMode="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            </div>

            <div className="flex flex-col">
              <span className="font-semibold">{tr("الصلاحيات لكل وحدة")}</span>
              <span className="mb-1 text-[13px] text-muted">{tr("المدير المباشر سيرى طلبات فريقه تلقائياً عند تفعيل الموارد البشرية.")}</span>
              {modules.map((m) => (
                <div key={m.key} className="flex items-center gap-3 border-t border-line py-2">
                  <span className="flex flex-1 flex-col"><span className="font-medium">{m.label}</span>{!m.enabled && <span className="text-[12px] text-muted">{tr("قريباً")}</span>}</span>
                  <Select label={tr("دور ") + m.label} className="w-[170px] [&>label]:sr-only" value={draft.roles[m.key] || ''}
                    onChange={(e) => setDraft({ ...draft, roles: { ...draft.roles, [m.key]: e.target.value } })}
                    options={[{ value: '', label: tr("بلا وصول") }, ...m.roles.map((r) => ({ value: r.key, label: r.label }))]} />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 border-t border-line pt-3">
              <Checkbox label={tr("مدير النظام")} description={tr("كل الصلاحيات في كل الوحدات وإدارة المستخدمين")} checked={draft.isSuperAdmin} onChange={(v) => setDraft({ ...draft, isSuperAdmin: v })} />
              {!creating && <Checkbox label={tr("الحساب نشط")} description={tr("الحساب المعطّل لا يستطيع الدخول")} checked={draft.active} disabled={draft.id === me?.id} onChange={(v) => setDraft({ ...draft, active: v })} />}
            </div>

            {error && <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2.5 text-bad">{error}</div>}

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" className="flex-[1_1_140px]" loading={save.isPending} onClick={() => { setError(''); save.mutate(draft); }}>{creating ? tr("إنشاء الحساب") : tr("حفظ التغييرات")}</Button>
              {!creating && selected && <Button icon="key" className="flex-[1_1_140px]" loading={reset.isPending} onClick={() => { setError(''); reset.mutate(selected.id); }}>{tr("كلمة مرور مؤقتة")}</Button>}
              {!creating && selected?.locked && <Button icon="lock" onClick={() => unlock.mutate(selected.id)}>{tr("فك القفل")}</Button>}
              {creating && <Button variant="ghost" onClick={() => setCreating(false)}>{tr("إلغاء")}</Button>}
            </div>
          </Card>
        )}
      </div>

      <Dialog open={!!temp} onClose={() => setTemp(null)} title={tr("كلمة المرور المؤقتة")}
        footer={<Button variant="primary" onClick={() => setTemp(null)}>{tr("تم، سلّمتها")}</Button>}>
        {temp && (
          <div className="flex flex-col gap-4">
            <p className="m-0 leading-relaxed text-muted">{tr("سلّم هذه البيانات إلى")} <b className="text-fg">{temp.name}</b>{tr(". لن تظهر مرة أخرى، وسيُطلب منه اختيار كلمة مرور خاصة عند أول دخول.")}</p>
            <div className="flex flex-col gap-2 rounded-xl bg-bg p-4">
              <span className="text-[13px] text-muted">{tr("اسم المستخدم")}</span>
              <span className="ltr text-right text-[17px] font-semibold">{temp.username}</span>
              <span className="mt-2 text-[13px] text-muted">{tr("كلمة المرور المؤقتة")}</span>
              <span className="ltr text-right font-mono text-[20px] font-bold tracking-wider">{temp.password}</span>
            </div>
            <Button icon="copy" onClick={() => { navigator.clipboard?.writeText(tr("اسم المستخدم: {0}\nكلمة المرور المؤقتة: {1}\n{2}{3}", temp.username, temp.password, location.origin, import.meta.env.BASE_URL)).then(() => toast(tr("تم النسخ"))); }}>{tr("نسخ البيانات مع الرابط")}</Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
