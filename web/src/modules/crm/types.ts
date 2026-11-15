/** أنواع وحدة العملاء. المبالغ بالفلس */
export interface Opt { id: string; label: string }
export interface Stage { id: string; name: string; color: string; kind: 'open' | 'won' | 'lost' }

export interface ClientView {
  id: string; name: string; type: string; typeLabel: string; category: 'current' | 'lead'; categoryLabel: string; status: string; statusLabel: string;
  stageId: string; stageName: string; stageColor: string; lostReason: string; phone: string; phone2: string; email: string; workplace: string;
  nationality: string; country: string; city: string; address: string; notes: string; assignedTo: string; assignedName: string; legacyOwner: string;
  createdAt: string; projectsCount: number; activeProjects: number; paid: number; remaining: number;
}

export interface ContactView { id: string; clientId: string; name: string; jobTitle: string; phone: string; email: string; nationality: string; active: boolean; notes: string }

export interface ProjectView {
  id: string; name: string; clientId: string; clientName: string; type: string; billing: 'fixed' | 'open'; billingLabel: string; contractValue: number;
  startDate: string; endDate: string; status: 'ongoing' | 'on_hold' | 'completed' | 'cancelled'; statusLabel: string; parentId: string; parentName: string;
  needsReview: boolean; reviewNote: string; notes: string; paid: number; scheduled: number; overdue: number; nextDue: string; paymentsCount: number;
  remaining: number; overCollected: boolean; percent: number; spent: number; createdAt: string;
  billingCycle: '' | 'monthly' | 'quarterly' | 'yearly'; billingCycleLabel: string; cycleAmount: number;
  cycle: { start: string; end: string; paid: number; due: number; future: boolean } | null;
}

export interface PaymentView {
  id: string; projectId: string; projectName: string; clientId: string; clientName: string; amount: number; kind: string; kindLabel: string;
  method: string; methodLabel: string; status: 'paid' | 'scheduled'; statusLabel: string; date: string; overdue: boolean; invoiceNo: string;
  recipient: string; notes: string; attachmentUrl: string;
}

export interface ProposalView {
  id: string; number: string; name: string; clientId: string; clientName: string; projectId: string; projectName: string; type: string; value: number;
  issueDate: string; status: 'draft' | 'negotiation' | 'accepted' | 'rejected'; statusLabel: string; notes: string; attachmentUrl: string; createdAt: string;
}

export interface ActivityView {
  id: string; type: string; typeLabel: string; clientId: string; clientName: string; contactId: string; contactName: string; projectId: string; projectName: string;
  userId: string; userName: string; title: string; description: string; at: string; durationMin: number; location: string; notes: string;
  followUpDate: string; followUpTaskId: string; followUpTask: { number: string; title: string; status: string } | null;
}

export interface LinkView { id: string; title: string; url: string; hasFile: boolean; mimeType: string; category: string; byName: string; createdAt: string }

export interface CrmLookups {
  me: string; isManager: boolean; isAccountant: boolean; hasTeam: boolean; today: string; drive: boolean; people: { id: string; name: string }[];
  stages: Stage[]; clientTypes: Opt[]; categories: Opt[]; statuses: Opt[]; projectStatuses: Opt[]; billing: Opt[]; payKinds: Opt[]; payMethods: Opt[];
  proposalStatuses: Opt[]; activityTypes: Opt[]; cycles: Opt[]; projectTypes: string[];
}

export interface ClientDetail {
  client: ClientView; contacts: ContactView[]; projects: ProjectView[]; payments: PaymentView[]; proposals: ProposalView[]; activities: ActivityView[];
  links: LinkView[]; can: { edit: boolean; pay: boolean; remove: boolean };
}

export interface ProjectDetail {
  project: ProjectView; subprojects: ProjectView[]; payments: PaymentView[]; activities: ActivityView[]; proposals: ProposalView[]; links: LinkView[];
  can: { edit: boolean; pay: boolean; remove: boolean };
}

export interface CrmHome {
  clients: number; leads: number; ongoing: number; review: number; collected: number; contract: number; remaining: number;
  due: PaymentView[]; overdue: number; openProposals: number;
  cycles: { projectId: string; projectName: string; clientName: string; due: number; end: string; late: boolean }[];
}

export interface Receivable { kind: 'payment' | 'cycle'; id: string; projectId: string; projectName: string; clientName: string; amount: number; date: string; daysLate: number }
export interface CrmReport {
  from: string; to: string; previousFrom: string; previousTo: string;
  collected: number; collectedChange: number; previousCollected: number; newClients: number; newClientsChange: number;
  receivables: { total: number; overdue: number; items: Receivable[] };
  byClient: { clientId: string; clientName: string; amount: number; projects: number; percent: number }[]; byMonth: { month: string; amount: number }[];
  projects: ProjectView[];
  proposals: { total: number; accepted: number; rejected: number; value: number; acceptedValue: number; previousTotal: number; previousAccepted: number };
  activities: { userName: string; total: number; types: Record<string, number> }[]; activitiesTotal: number; activitiesChange: number;
}
