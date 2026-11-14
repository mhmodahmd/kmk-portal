export type Roles = Record<string, string>;

export interface User {
  id: string;
  username: string;
  fullName: string;
  jobTitle: string;
  phone: string;
  email: string;
  active: boolean;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  lastLogin: string;
  locked: boolean;
}

export interface ManagedUser extends User {
  roles: Roles;
  createdAt: string;
}

export interface ModuleRoleDef {
  key: string;
  label: string;
  enabled: boolean;
  roles: { key: string; label: string }[];
}

export interface SessionResult {
  token: string;
  deviceToken: string;
  user: User;
  roles: Roles;
}

export interface SystemStatus {
  app: string;
  version: string;
  needsSetup: boolean;
  company: string;
}

export interface VisibleModule {
  key: string;
  label: string;
  enabled: boolean;
  role: string | null;
}

export interface HomeSummary {
  user: User;
  roles: Roles;
  modules: VisibleModule[];
  inboxCount: number;
  cards: unknown[];
  setup: null | { hasCompany: boolean; usersCount: number; rolesCount: number; companyName: string };
}

export interface InboxItem {
  id: string;
  module: string;
  moduleLabel: string;
  title: string;
  who: string;
  createdAt: string;
  status: string;
  facts?: { k: string; v: string }[];
  note?: string;
}

export interface AuditRow {
  id: string;
  ts: string;
  userId: string;
  userName: string;
  module: string;
  action: string;
  entity: string;
  entityId: string;
  details: unknown;
}

export interface CompanySettings {
  name: string;
  address: string;
  phone: string;
}
