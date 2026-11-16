/** أنواع وحدة المراسلات */
export type Direction = 'in' | 'out';
export type LetterStatus = 'draft' | 'sent' | 'received' | 'replied' | 'archived';
export type Channel = 'mail' | 'hand' | 'whatsapp' | 'email' | 'fax';
/** ما يمكن ربط الخطاب به (المشروع له حقله المستقل projectId أيضاً) */
export type LinkType = 'client' | 'project' | 'custody' | 'employee' | 'task';

export interface LetterView {
  id: string; number: string; direction: Direction; directionLabel: string; subject: string; summary: string;
  party: string; clientId: string; clientName: string; date: string; receivedAt: string; sentAt: string; refNo: string;
  channel: Channel | ''; channelLabel: string; category: string; status: LetterStatus; statusLabel: string; open: boolean;
  replyToId: string; replyToNumber: string; replyToSubject: string; dueDate: string; overdue: boolean; daysLeft: number | null;
  assigneeId: string; assigneeName: string; linkedType: LinkType | ''; linkedTypeLabel: string; linkedId: string; linkedLabel: string;
  projectId: string; projectName: string; tags: string[]; archivedAt: string;
  createdBy: string; createdByName: string; createdAt: string; updatedAt: string; filesCount: number; repliesCount: number;
  canEdit: boolean; canRemove: boolean;
}

export interface LetterFile { id: string; fileName: string; mimeType: string; isImage: boolean; fileSize: number; uploadedByName: string; uploadedAt: string; canDelete: boolean }
export interface LetterLog { id: string; kind: string; kindLabel: string; body: string; byName: string; at: string }

export interface LetterDetail {
  letter: LetterView; original: LetterView | null; replies: LetterView[]; files: LetterFile[]; log: LetterLog[];
  can: { edit: boolean; remove: boolean };
}

export interface Opt { id: string; label: string }
export interface CorLookups {
  me: string; isManager: boolean; today: string; drive: boolean;
  people: { id: string; name: string }[]; clients: { id: string; name: string }[]; projects: { id: string; name: string; clientId: string }[];
  directions: Opt[]; statuses: Opt[]; channels: Opt[]; categories: string[]; years: string[];
  links: Record<LinkType, { id: string; name: string }[]>;
}

export interface Category { id: string; name: string; active: boolean }

export interface CorReport {
  year: string; total: number; in: number; out: number; archived: number; awaiting: number; overdueCount: number; repliedIn: number;
  byMonth: { month: string; in: number; out: number }[];
  byCategory: { category: string; count: number }[];
  byStatus: { status: LetterStatus; label: string; count: number }[];
  byChannel: { channel: string; label: string; count: number }[];
  overdue: LetterView[];
}
