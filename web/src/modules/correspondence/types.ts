/** أنواع وحدة المراسلات */
export type Direction = 'in' | 'out' | 'internal';
export type Confidentiality = 'public' | 'internal' | 'secret' | 'top_secret';
export type FieldKind = 'text' | 'number' | 'money' | 'date' | 'select' | 'user' | 'client' | 'project';
export type LetterStatus = 'draft' | 'sent' | 'received' | 'replied' | 'archived';
export type Channel = 'mail' | 'hand' | 'whatsapp' | 'email' | 'fax';
/** ما يمكن ربط الخطاب به (المشروع له حقله المستقل projectId أيضاً) */
export type LinkType = 'client' | 'project' | 'custody' | 'employee' | 'task';

export interface FieldView { key: string; label: string; kind: FieldKind; value: string | number; display: string; inList: boolean }

export interface LetterView {
  typeId: string; typeName: string; typeCode: string; confidentiality: Confidentiality; confidentialityLabel: string; readers: string[];
  version: number; hasMainFile: boolean; restricted: boolean; fields: FieldView[]; listFields: { label: string; display: string }[]; canFiles: boolean;
  id: string; number: string; direction: Direction; directionLabel: string; subject: string; summary: string;
  party: string; clientId: string; clientName: string; date: string; receivedAt: string; sentAt: string; refNo: string;
  channel: Channel | ''; channelLabel: string; category: string; status: LetterStatus; statusLabel: string; open: boolean;
  replyToId: string; replyToNumber: string; replyToSubject: string; dueDate: string; overdue: boolean; daysLeft: number | null;
  assigneeId: string; assigneeName: string; linkedType: LinkType | ''; linkedTypeLabel: string; linkedId: string; linkedLabel: string;
  projectId: string; projectName: string; tags: string[]; archivedAt: string;
  createdBy: string; createdByName: string; createdAt: string; updatedAt: string; filesCount: number; repliesCount: number;
  canEdit: boolean; canRemove: boolean;
}

export interface LetterFile {
  id: string; fileName: string; mimeType: string; isImage: boolean; isPdf: boolean; hasPreview: boolean; fileSize: number;
  role: 'main' | 'attachment'; version: number; uploadedByName: string; uploadedAt: string; canDelete: boolean;
}
export interface DocVersion { version: number; fileId: string; fileName: string; note: string; byName: string; at: string; current: boolean }
export interface LetterLog { id: string; kind: string; kindLabel: string; body: string; byName: string; at: string }

export interface LetterDetail {
  letter: LetterView; original: LetterView | null; replies: LetterView[]; files: LetterFile[]; log: LetterLog[];
  main: LetterFile | null; versions: DocVersion[]; readers: { id: string; name: string }[];
  can: { edit: boolean; remove: boolean; files: boolean };
}

export interface Opt { id: string; label: string }
export interface CorLookups {
  me: string; isManager: boolean; today: string; drive: boolean;
  people: { id: string; name: string }[]; clients: { id: string; name: string }[]; projects: { id: string; name: string; clientId: string }[];
  directions: Opt[]; statuses: Opt[]; channels: Opt[]; categories: string[]; years: string[];
  links: Record<LinkType, { id: string; name: string }[]>;
  confidentialities: Opt[]; fieldKinds: Opt[]; types: DocType[];
}

export interface DocField {
  id: string; key: string; label: string; kind: FieldKind; kindLabel: string; options: string[]; required: boolean; inList: boolean; active: boolean;
}
export interface DocType {
  id: string; name: string; code: string; direction: Direction; directionLabel: string; numberPattern: string; confidentiality: Confidentiality;
  builtin: boolean; active: boolean; documents: number; fields: DocField[];
}

export interface Category { id: string; name: string; active: boolean }

export interface CorDashboard {
  today: string; scope: 'all' | 'mine';
  kpis: {
    open: number; overdue: number; dueSoon: number; drafts: number; awaitingReply: number; awaitingParty: number;
    monthIn: number; monthOut: number; prevIn: number; prevOut: number; total: number; archived: number; noDue: number;
    avgReplyDays: number | null; repliedCount: number;
  };
  byMonth: { month: string; in: number; out: number }[];
  byStatus: { status: LetterStatus; label: string; count: number }[];
  byCategory: { category: string; count: number }[];
  byChannel: { channel: string; label: string; count: number }[];
  byAssignee: { id: string; name: string; open: number; overdue: number }[];
  topParties: { party: string; count: number; open: number }[];
  overdue: LetterView[]; dueSoon: LetterView[]; recent: LetterView[];
}

export interface CorReport {
  year: string; total: number; in: number; out: number; archived: number; awaiting: number; overdueCount: number; repliedIn: number;
  byMonth: { month: string; in: number; out: number }[];
  byCategory: { category: string; count: number }[];
  byStatus: { status: LetterStatus; label: string; count: number }[];
  byChannel: { channel: string; label: string; count: number }[];
  overdue: LetterView[];
}
