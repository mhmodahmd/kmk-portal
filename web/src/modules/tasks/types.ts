/** أنواع وحدة المهام */
export type TaskStatus = 'todo' | 'doing' | 'review' | 'done' | 'cancelled';
export type Priority = 'urgent' | 'high' | 'normal' | 'low';
/** ما يمكن ربط المهمة به من الحوار (المشروع له حقله الخاص projectId) */
export type LinkType = 'client' | 'custody' | 'employee';

export interface TaskView {
  id: string; number: string; title: string; description: string; status: TaskStatus; statusLabel: string;
  priority: Priority; priorityLabel: string; assigneeId: string; assigneeName: string; watchers: { id: string; name: string }[];
  dueDate: string; startDate: string; completedAt: string; overdue: boolean; projectId: string; projectName: string;
  linkedType: '' | 'custody' | 'employee' | 'client' | 'project'; linkedTypeLabel: string; linkedId: string; linkedLabel: string;
  private: boolean;
  parentId: string; parentTitle: string; parentNumber: string; recurrence: { freq: 'weekly' | 'monthly' } | null; recurrenceLabel: string;
  sortOrder: number; createdBy: string; createdByName: string; createdAt: string; updatedAt: string;
  checklistDone: number; checklistTotal: number; commentsCount: number; filesCount: number; subtasksCount: number;
  mine: boolean; canWork: boolean; canManage: boolean; review?: boolean; nextNumber?: string;
}

export interface CheckItem { id: string; text: string; done: boolean; doneByName: string; doneAt: string }
export interface TaskComment { id: string; kind: 'comment' | 'event'; body: string; byId: string; byName: string; at: string; mentions: string[]; mine: boolean }
export interface TaskFile { id: string; fileName: string; mimeType: string; isImage: boolean; fileSize: number; uploadedByName: string; uploadedAt: string; canDelete: boolean }

export interface TaskDetail {
  task: TaskView; checklist: CheckItem[]; comments: TaskComment[]; files: TaskFile[]; subtasks: TaskView[];
  can: { work: boolean; manage: boolean; remove: boolean; recur: boolean; comment: boolean };
}

export interface Person { id: string; name: string; jobTitle: string }
export interface TaskLookups {
  me: string; people: Person[]; everyone: Person[]; projects: { id: string; name: string }[];
  statuses: { id: TaskStatus; label: string }[]; priorities: { id: Priority; label: string }[]; freqs: { id: string; label: string }[];
  /** خيارات الربط حسب أدوار المستخدم */
  links: Record<LinkType, { id: string; name: string }[]>;
  isManager: boolean; hasTeam: boolean; drive: boolean; today: string;
}
