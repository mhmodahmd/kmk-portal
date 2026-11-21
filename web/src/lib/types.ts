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
  /** دور يملكه الجميع تلقائياً (لا خيار «بلا وصول») */
  defaultRole?: string;
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
  cards: HomeCard[];
  setup: null | { hasCompany: boolean; usersCount: number; rolesCount: number; companyName: string };
}

export interface InboxItem {
  id: string;
  kind: string;
  refId: string;
  needsNoteOnReject?: boolean;
  /** يُقرَّر من صفحة السجل فقط (مثل مرحلة توقيع) */
  linkOnly?: boolean;
  module: string;
  moduleLabel: string;
  title: string;
  who: string;
  createdAt: string;
  status: string;
  facts?: { k: string; v: string }[];
  note?: string;
  approveLabel?: string;
  rejectLabel?: string;
  link?: string;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface HomeCard { kind: string; [k: string]: any }

// ───────── الموارد البشرية ─────────
export interface EmployeeView {
  id: string; empNo: string; fullName: string; jobTitle: string; status: 'active' | 'leave' | 'terminated'; statusLabel: string;
  phone: string; email: string; hireDate: string;
  departmentId: string; departmentName: string; branchId: string; branchName: string;
  managerId: string; effectiveManagerId: string; managerName: string; shiftId: string; shiftName: string;
  userId: string; username: string; userActive: boolean;
  nationality?: string; birthDate?: string; civilId?: string; civilIdExpiry?: string; residencyNo?: string; residencyExpiry?: string;
  passportNo?: string; passportExpiry?: string; contractType?: string; contractEnd?: string; address?: string;
  emergencyName?: string; emergencyPhone?: string; notes?: string;
}
export interface Department { id: string; name: string; managerId: string; active: boolean }
export interface Branch { id: string; name: string; address: string; lat: string; lng: string; geoRadius: number; active: boolean }
export interface Shift { id: string; name: string; start: string; end: string; graceMin: number; workDays: string; active: boolean }
export interface Holiday { id: string; date: string; dateTo: string; name: string }
export interface LeaveType { id: string; name: string; annualDays: number; paid: boolean; active: boolean }
export interface Structure { departments: Department[]; branches: Branch[]; shifts: Shift[]; holidays: Holiday[]; leaveTypes: LeaveType[] }
export interface ExpiringDoc { employeeId: string; name: string; doc: string; field: string; date: string; daysLeft: number }
export interface Directory extends Structure {
  employees: EmployeeView[]; expiring: ExpiringDoc[]; canManageAccounts: boolean;
  freeUsers?: { id: string; username: string; fullName: string; active: boolean }[];
}
export interface Balance {
  typeId: string; name: string; paid: boolean; active: boolean; unlimited: boolean; entitled: number;
  adjustment: number; used: number; pending: number; available: number | null; adjNote: string;
}
export type LeaveStatus = 'pending_manager' | 'pending_hr' | 'approved' | 'rejected' | 'cancelled';
export interface LeaveView {
  id: string; employeeId: string; name: string; typeId: string; typeName: string; from: string; to: string; days: number;
  reason: string; status: LeaveStatus; statusLabel: string; managerId: string; managerName: string; managerNote: string;
  decidedBy: string; decidedAt: string; decisionNote: string; createdAt: string;
}
export type OtStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export interface OtView {
  id: string; employeeId: string; name: string; date: string; minutes: number; reason: string;
  status: OtStatus; statusLabel: string; createdByName: string; decidedBy: string; decidedAt: string; decisionNote: string; createdAt: string;
}
export interface HrMe {
  employee: EmployeeView | null; year: string; types: { id: string; name: string }[]; balances: Balance[];
  leaves: LeaveView[]; overtime: OtView[]; isManager: boolean; isHr: boolean; teamCount?: number;
}
export interface HrTeam { members: EmployeeView[]; leaves: LeaveView[]; overtime: OtView[] }

// ───────── الحضور ─────────
export interface Session { id: string; inTs: string; outTs: string; minutes: number; source: string; note: string; edited: boolean; inVerified?: boolean; outVerified?: boolean }
export interface AttToday {
  employee: { id: string; name: string; empNo: string }; date: string; dayName: string; serverNow: string;
  isIn: boolean; openSince: string; closedMinutes: number; sessions: Session[];
  shift: { name: string; start: string; end: string; graceMin: number } | null;
  dayType: string; detail: string; late: number;
  geo: { required: boolean; branches: { name: string; lat: number; lng: number; radius: number }[] };
  device: { required: boolean; registered: boolean; label: string; since: string };
  pendingCorrections: number;
}
export interface DeviceInfo { id: string; label: string; createdAt: string; lastUsedAt: string; synced: boolean }
export interface DeviceRow { employeeId: string; name: string; jobTitle: string; departmentName: string; hasAccount: boolean; device: DeviceInfo | null }
export interface DeviceList { rows: DeviceRow[]; registered: number; required: boolean }
export type DayStatus = 'in' | 'present' | 'missing' | 'holiday' | 'leave' | 'weekend' | 'absent' | 'none' | 'future';
export interface MonthDay {
  date: string; dayName: string; firstIn: string; lastOut: string; sessions: number; minutes: number; status: DayStatus; statusLabel: string;
  dayType: string; detail: string; late: number; early: number; overtime: number; note: string; edited: boolean;
}
export interface MonthSummary {
  daysPresent: number; totalMinutes: number; incomplete: number; lateDays: number; lateMin: number; earlyMin: number;
  overtimeMin: number; absentDays: number; leaveDays: number; holidays: number;
}
export interface MonthReport {
  employee: { id: string; name: string; empNo: string; jobTitle: string }; month: string; shiftName: string; hasShift: boolean;
  days: MonthDay[]; summary: MonthSummary;
}
export interface ReportRow extends MonthSummary { employeeId: string; name: string; empNo: string; jobTitle: string; shiftName: string; hasShift: boolean }
export type BoardStatus = 'in' | 'out' | 'absent' | 'none' | 'leave' | 'off';
export interface BoardRow {
  employeeId: string; name: string; jobTitle: string; departmentName: string; status: BoardStatus; late: number; detail: string;
  shiftName: string; firstIn: string; lastOut: string; minutes: number; sessions: number; inLoc: string;
}
export interface Board {
  date: string; dayName: string; isToday: boolean; scope: 'all' | 'team';
  counts: Record<BoardStatus | 'total' | 'late', number>; rows: BoardRow[];
}
export interface RecordRow extends Session { employeeId: string; name: string; date: string; dayName: string; inLoc: string; outLoc: string; editedBy: string }
export interface Correction {
  id: string; employeeId: string; name: string; date: string; dayName: string; kind: 'missingOut' | 'missingIn' | 'wrongTime'; kindLabel: string;
  inTime: string; outTime: string; reason: string; status: 'pending' | 'approved' | 'rejected' | 'cancelled'; statusLabel: string;
  decidedBy: string; decidedAt: string; decisionNote: string; createdAt: string;
}
