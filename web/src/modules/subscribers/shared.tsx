import { tr } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { dateText, daysWord, monthLabel } from '../../lib/format';
import { Badge } from '../../ui/Display';

export type Status = 'active' | 'expiring' | 'pending' | 'lapsed';
export type Channel = 'whatsapp' | 'email' | 'call' | 'app';
export type Reply = 'waiting' | 'no_answer' | 'interested' | 'promised' | 'renewed' | 'refused' | 'wrong_contact' | 'optout';
export type AutoKind = 'before14' | 'before7' | 'on_expiry' | 'after7';

export interface SubSettings {
  renewalLink: string; retentionMonths: number; autoEmail: boolean; autoKinds: Record<AutoKind, boolean>;
  sendFrom: number; sendTo: number; dailyCap: number; senderName: string;
}
export interface SubLookups {
  isManager: boolean; isStaff: boolean; today: string; statuses: { id: Status; label: string }[]; packages: { id: string; name: string }[];
  platforms: { id: string; key: string; name: string }[]; people: { id: string; name: string }[]; settings: SubSettings | null;
  channels: { id: Channel; label: string }[]; kinds: { id: string; label: string; auto: boolean }[]; replies: { id: Reply; label: string }[]; vars: string[];
}
/** آخر تواصل وحالة الرد في الدورة الحالية (من الخادم) */
export interface LastContact {
  lastContactAt: string; lastContactBy: string; lastContactAuto: boolean; lastChannel: Channel | ''; lastChannelLabel: string;
  contactedThisCycle: boolean; contactsThisCycle: number; reply: Reply | ''; replyLabel: string; nextFollowUpAt: string; lastContactId: string;
}
export interface SubRow extends LastContact {
  id: string; ref: string; platformId: string; status: Status; statusLabel: string; packageId: string; packageName: string; expiresAt: string; daysLeft: number | null;
  waitFor: string; lastPaidAt: string; firstPaidAt: string; purchases: number; totalPaid: number; winback: boolean; name: string; mobileMask: string; emailMask: string;
  hasContact: boolean; hasMobile: boolean; hasEmail: boolean; suggestKind: string; country: string; optOut: boolean; forgotten: boolean; assignedTo: string; assignedName: string;
}
export interface Contact {
  id: string; channel: Channel; channelLabel: string; direction: 'out' | 'in'; kind: string; kindLabel: string; templateName: string; subject: string;
  status: 'sent' | 'failed' | 'skipped'; statusLabel: string; skipLabel: string; error: string; auto: boolean; byName: string;
  reply: Reply | ''; replyLabel: string; replyAt: string; replyByName: string; nextFollowUpAt: string; note: string; createdAt: string;
}
export interface SubDetail extends SubRow {
  notes: string; optOutAt: string; optOutReason: string; contacts: Contact[];
  cycles: { gatewayId: string; packageName: string; paidAt: string; expiresAt: string; amount: number; outcome: string; outcomeLabel: string; waitFor: string }[];
}
export interface SubDashboard {
  today: string; lastMonth: string; counts: Record<Status, number>;
  coverage: { total: number; withContact: number; withMobile: number; withEmail: number; optOut: number; winback: number };
  byPackage: { packageId: string; name: string; active: number; expiring: number; pending: number; lapsed: number }[];
  renewal: { month: string; total: number; renewed: number; pending: number; lapsed: number; rate: number | null; final: boolean }[];
}
export interface Template { id: string; channel: 'whatsapp' | 'email'; channelLabel: string; kind: string; kindLabel: string; name: string; subject: string; body: string; active: boolean; sort: number }

export const KEYS = ['sub.lookups', 'sub.dashboard', 'sub.list', 'sub.get', 'sub.followup', 'sub.report'];
export const useSubLookups = () => useApi<SubLookups>('sub.lookups', {}, { staleTime: 5 * 60_000 });
export const useTemplates = (enabled = true) => useApi<Template[]>('sub.templates', {}, { staleTime: 60_000, enabled });
export const detailLink = (ref: string) => '/subscribers/s/' + encodeURIComponent(ref);

const TONE: Record<Status, 'ok' | 'warn' | 'info' | 'bad'> = { active: 'ok', expiring: 'warn', pending: 'info', lapsed: 'bad' };
const REPLY_TONE: Record<Reply, 'ok' | 'warn' | 'info' | 'bad' | 'neutral'> = {
  waiting: 'info', no_answer: 'warn', interested: 'ok', promised: 'ok', renewed: 'ok', refused: 'bad', wrong_contact: 'bad', optout: 'neutral'
};

export function StatusBadge({ s }: { s: Pick<SubRow, 'status' | 'statusLabel' | 'waitFor' | 'winback'> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={TONE[s.status]}>{s.status === 'pending' && s.waitFor ? tr("لم يجدد — بانتظار كشف {0}", monthLabel(s.waitFor)) : s.statusLabel}</Badge>
      {s.winback && (s.status === 'active' || s.status === 'expiring') && <Badge tone="info">{tr("عاد بعد انقطاع")}</Badge>}
    </span>
  );
}

export function ReplyBadge({ reply, label }: { reply: Reply | ''; label: string }) {
  if (!reply) return null;
  return <Badge tone={REPLY_TONE[reply]}>{label}</Badge>;
}

/** خلية «آخر تواصل»: التاريخ، ومن تواصل أو «آلي»، والقناة */
export function LastContactCell({ r }: { r: LastContact }) {
  if (!r.lastContactAt) return <span className="text-[13px] text-muted">{tr("لم يُتواصل معه")}</span>;
  return (
    <span className="flex flex-col text-[13px]">
      <span className="num whitespace-nowrap">{dateText(r.lastContactAt, false)}</span>
      <span className="text-[12px] text-muted">{tr("{0} · {1}", r.lastChannelLabel, r.lastContactAuto ? tr("آلي") : r.lastContactBy || '—')}</span>
    </span>
  );
}

/** الأيام المتبقية بنص قصير */
export function daysLeftText(r: Pick<SubRow, 'daysLeft'>) {
  if (r.daysLeft == null) return tr("انتهت");
  if (r.daysLeft === 0) return tr("تنتهي اليوم");
  return tr("بعد {0}", daysWord(r.daysLeft));
}
