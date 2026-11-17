export interface Opt { id: string; label: string }
export type PackageKind = 'subscription' | 'gift' | 'test';
export type Method = 'knet' | 'applepay' | 'card' | 'other';

export interface PackageView {
  id: string; platformId: string; name: string; code: string; aliases: string[]; kind: PackageKind; kindLabel: string;
  price: number; durationDays: number; unitPrice: number; rank: number; active: boolean; sortOrder: number;
}

export interface PltLookups {
  isManager: boolean; isAccountant: boolean; today: string; month: string;
  platforms: { id: string; key: string; name: string; hasAppSales: boolean; gateway: string; active: boolean }[];
  packages: PackageView[];
  centers: { id: string; platformId: string; name: string; status: string }[];
  campaigns: { id: string; platformId: string; centerId: string; name: string; status: string }[];
  fees: Record<Method, { pct: number; fixed: number }>;
  kinds: Opt[]; methods: Opt[]; channels: Opt[]; centerStatuses: Opt[]; campaignKinds: Opt[]; campaignStatuses: Opt[]; revenueKinds: Opt[];
}

export interface Group { key: string; label: string; count: number; amount: number; fee: number; net: number }

export interface PltDashboard {
  platform: string; month: string; prevMonth: string; months: string[]; monthStatus: '' | 'draft' | 'approved';
  summary: {
    count: number; prevCount: number; amount: number; prevAmount: number; fee: number; prevFee: number; net: number; prevNet: number;
    avg: number; prevAvg: number; people: number; prevPeople: number; sponsorship: number; prevSponsorship: number; revenue: number; prevRevenue: number;
    ytdSales: number; ytdSponsorship: number; ytd: number;
  };
  byPackage: { packageId: string; name: string; kind: PackageKind; count: number; amount: number; net: number; share: number }[];
  gift: { count: number; amount: number; people: number; avgPeople: number; one: number; two: number; threeFour: number; fivePlus: number; review: number };
  buyers: { buyers: number; newBuyers: number; returning: number; repeat: number; upgrades: number; active: number; expiring: number; historyFrom: string };
  methods: Group[]; channels: Group[]; countries: Group[];
  trend: { month: string; sales: number; sponsorship: number }[];
  centers: { id: string; name: string; collected: number; scheduled: number; projectsCount: number; campaignsCount: number }[];
  campaigns: CampaignView[];
  clients: { clientId: string; name: string; collected: number; scheduled: number; overdue: number; projects: number; rate: number | null }[];
}

export interface MonthRow {
  platformId: string; platformName: string; month: string; count: number; amount: number; fee: number; net: number; refunded: number; people: number;
  status: 'draft' | 'approved'; statusLabel: string; approvedByName: string; approvedAt: string; reopenReason: string;
  lastImport: { fileName: string; at: string; byName: string } | null;
}

export interface SaleRow {
  id: string; gatewayId: string; paidAt: string; packageId: string; packageName: string; kind: PackageKind; kindLabel: string;
  method: Method; methodLabel: string; channel: string; channelLabel: string; amount: number; fee: number; net: number; people: number;
  country: string; buyer: '' | 'new' | 'returning'; upgrade: boolean; expiresAt: string;
}

export interface ImportPreview {
  platformId: string; platformName: string;
  stats: { rows: number; accepted: number; duplicates: number; notCaptured: number; test: number; invalid: number; amount: number };
  unmatched: { name: string; count: number; amount: number; type: string }[];
  months: { month: string; count: number; status: 'draft' | 'approved' }[];
  packages: { packageId: string; name: string; kind: PackageKind; count: number; amount: number; people: number }[];
  fee: number;
  packageOptions: { id: string; name: string; kind: PackageKind }[];
}

export interface CenterView {
  id: string; platformId: string; name: string; status: 'active' | 'paused' | 'closed'; statusLabel: string; startDate: string; endDate: string;
  managerName: string; notes: string; projectsCount: number; collected: number; scheduled: number;
  sponsors: { id: string; name: string }[]; projects: { id: string; name: string; clientName: string; revenueKind: string }[]; campaignsCount: number;
}

export interface CampaignView {
  id: string; platformId: string; centerId: string; centerName: string; kind: 'competition' | 'challenge'; kindLabel: string; name: string;
  startDate: string; endDate: string; status: 'planned' | 'running' | 'ended' | 'cancelled'; statusLabel: string; participants: number; notes: string;
  pledged: number; collected: number; remaining: number; sponsors: { projectId: string; projectName: string; clientName: string }[];
}
