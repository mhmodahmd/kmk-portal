/** أنواع وحدة المراسلات */
export type Direction = 'in' | 'out' | 'internal';
export type Confidentiality = 'public' | 'internal' | 'secret' | 'top_secret';
export type FieldKind = 'text' | 'number' | 'money' | 'date' | 'select' | 'user' | 'client' | 'project';
export type LetterStatus = 'draft' | 'in_review' | 'returned' | 'approved' | 'rejected' | 'sent' | 'received' | 'replied' | 'archived';
export type Channel = 'mail' | 'hand' | 'whatsapp' | 'email' | 'fax';
/** ما يمكن ربط الخطاب به (المشروع له حقله المستقل projectId أيضاً) */
export type LinkType = 'client' | 'project' | 'custody' | 'employee' | 'task';

export interface FieldView { key: string; label: string; kind: FieldKind; value: string | number; display: string; inList: boolean }

export interface LetterView {
  typeId: string; typeName: string; typeCode: string; confidentiality: Confidentiality; confidentialityLabel: string; readers: string[];
  version: number; hasMainFile: boolean; restricted: boolean; locked: boolean; lockedAt: string; wf: ChainSummary | null; fields: FieldView[]; listFields: { label: string; display: string }[]; canFiles: boolean;
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
  can: { edit: boolean; remove: boolean; files: boolean; modify: boolean; attach: boolean; reopen: boolean };
  workflow: ChainView | null; drive: boolean; signatures: { name: string; at: string; method: string; code: string; version: number; step: string }[];
  submit: { resubmit: boolean; defaultTemplateId: string; defaultSource?: 'rule' | 'type' | ''; ruleName?: string; templates: { id: string; name: string; steps: string[] }[] } | null;
}

export interface Opt { id: string; label: string }
export interface CorLookups {
  me: string; isManager: boolean; today: string; drive: boolean;
  people: { id: string; name: string }[]; clients: { id: string; name: string }[]; projects: { id: string; name: string; clientId: string }[];
  directions: Opt[]; statuses: Opt[]; channels: Opt[]; categories: string[]; years: string[];
  links: Record<LinkType, { id: string; name: string }[]>;
  confidentialities: Opt[]; fieldKinds: Opt[]; types: DocType[]; canArchive: boolean; archiveClerks: boolean;
}

export interface DocField {
  id: string; key: string; label: string; kind: FieldKind; kindLabel: string; options: string[]; required: boolean; inList: boolean; active: boolean;
}
export interface DocType {
  id: string; name: string; code: string; direction: Direction; directionLabel: string; numberPattern: string; confidentiality: Confidentiality;
  builtin: boolean; active: boolean; documents: number; fields: DocField[]; templateId: string;
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

/** السلسلة الإجرائية */
export type ChainStatus = 'running' | 'returned' | 'approved' | 'rejected' | 'cancelled';
export type StepStatus = 'pending' | 'current' | 'done' | 'rejected' | 'returned' | 'skipped' | 'cancelled';
export type StepKind = 'review' | 'approve' | 'sign' | 'execute' | 'inform';
export type AssigneeType = 'user' | 'role' | 'direct_manager' | 'dept_manager' | 'creator_dept_manager' | 'company_manager' | 'party';

export interface ChainSummary {
  instanceId: string; status: ChainStatus; statusLabel: string; templateName: string; stepName: string; assigneeNames: string[];
  asking: boolean; overdue: boolean; dots: StepStatus[]; done: number; total: number;
}
export interface ChainStep {
  id: string; order: number; group: number; parallel: boolean; name: string; kind: StepKind; kindLabel: string; status: StepStatus; statusLabel: string;
  mode: StepMode; modeLabel: string; approvals: number; need: number; dueAt: string; overdue: boolean; escalationLevel: number;
  assignees: { id: string; name: string; done: boolean }[]; fallback: boolean; asking: boolean; startedAt: string; endedAt: string; actedByName: string; note: string;
}
export type StepMode = 'any' | 'all' | 'count';
export interface ChainAction { id: string; action: string; label: string; byName: string; onBehalfOfName: string; toName: string; step: string; note: string; version: number; at: string }
export interface ChainView {
  id: string; status: ChainStatus; statusLabel: string; templateName: string; templateVersion: number; startedAt: string; endedAt: string; startedByName: string;
  steps: ChainStep[]; actions: ChainAction[]; current: { id: string; name: string; kind: StepKind; asking: boolean; onBehalfOfName: string } | null;
  can: { act: boolean; ask: boolean; sign: boolean; answer: boolean; cancel: boolean; reassign: boolean };
}
export interface WfCondition { field: string; op: CondOp; value: string | number }
export type CondOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
export interface WfTemplateStep { order: number; name: string; kind: StepKind; kindLabel: string; assignee: { type: AssigneeType; id?: string; role?: string; module?: string; key?: string }; assigneeLabel: string; onReject: 'end' | 'creator'; condition: WfCondition | null; conditionLabel: string;
  group: number; mode: StepMode; count: number; slaHours: number; workingDays: boolean; escalation: { notifyManager: boolean; reassignTo: string } | null }
export interface CondField { key: string; label: string; kind: 'select' | 'money' | 'number' | 'text'; typeId?: string; options: { id: string; label: string }[] }
export interface WfRule {
  id: string; name: string; typeId: string; departmentId: string; confidentiality: string; field: string; op: CondOp; value: string | number;
  templateId: string; templateName: string; templateLive: boolean; priority: number; active: boolean; summary: string;
}
export interface WfVersion { version: number; current: boolean; savedAt: string; savedByName: string; documents: number; steps: { name: string; kindLabel: string; condition: string }[] }
export interface WfSimulation {
  template: { id: string; name: string; version: number } | null; source: 'chosen' | 'rule' | 'default' | 'none'; ruleName?: string;
  steps: { order: number; name: string; kind: StepKind; kindLabel: string; skipped: boolean; condition: string; assignees: string[]; fallback: boolean }[];
}
export interface WfTemplate { id: string; name: string; description: string; module: string; version: number; status: 'published' | 'retired'; statusLabel: string; updatedAt: string; running: number; steps: WfTemplateStep[] }
export interface WfLookups { kinds: Opt[]; assignees: Opt[]; onReject: Opt[]; ops: Opt[]; modes: Opt[]; conditionFields: CondField[]; roles: Opt[]; departments: { id: string; name: string }[]; people: { id: string; name: string }[]; companyManager?: string; parties?: { id: string; label: string }[] }
