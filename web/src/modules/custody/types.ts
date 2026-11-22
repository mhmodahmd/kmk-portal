import type { ChainBrief } from '../../ui/Timeline';
/** أنواع وحدة العهد والنثريات. المبالغ بالفلس (1 د.ك = 1000 فلس). */
export type CustodyStatus = 'open' | 'pending' | 'signing' | 'closed';
export type Stage = 'awaiting_signature' | 'disbursing' | 'received';

export interface CustodyView {
  id: string; periodLabel: string; employeeId: string; employeeName: string;
  amount: number; carriedBalance: number; totalReceipts: number; totalSpent: number; remaining: number; available: number;
  percent: number; alert: boolean; overspent: boolean; alertPercent: number;
  openDate: string; status: CustodyStatus; statusLabel: string; closeRequestDate: string; closeNote: string;
  reviewedByName: string; reviewDate: string; rejectReason: string; settlementMethod: string; settlementLabel: string;
  settlementVoucherId: string; notes: string; previousCustodyId: string; isImported: boolean;
  stage: Stage; receivedAt: string; openVoucherId: string; carryMode: 'add' | 'include'; carryModeLabel: string; targetAmount: number;
  closeSignedAt: string; hasCloseSigned: boolean; hasCloseSignedFile: boolean; closeSignedByName: string; closeSignedNote: string;
}

export interface StageStep { label: string; state: 'done' | 'current' | 'todo'; at: string; by: string; note: string }

export interface Attachment { id: string; fileName: string; mimeType: string; isImage: boolean; fileSize: number; url: string; uploadedAt: string }

export interface ExpenseView {
  id: string; custodyId: string; entryType: 'expense' | 'receipt'; entryLabel: string; date: string; category: string; project: string;
  description: string; amount: number; docType: string; noAttachmentReason: string; vendor: string; invoiceNo: string;
  paymentMethod: string; reviewNote: string; isImported: boolean; createdByName: string; createdAt: string; updatedAt: string;
  attachments: Attachment[];
}

export interface SignLinkInfo { status: 'open' | 'expired' | 'signed' | 'rejected' | 'revoked'; createdAt: string; expiresAt: string; actedAt: string; rejectReason: string; managerName: string; sentByName: string }

export interface VoucherView {
  id: string; type: 'payment' | 'receipt'; typeLabel: string; number: string; date: string; custodyId: string; custodyLabel: string;
  partyName: string; amount: number; amountInWords: string; reason: string; paymentMethod: string; paymentMethodLabel: string; chequeNo: string;
  status: 'requested' | 'signing' | 'active' | 'rejected' | 'cancelled'; statusLabel: string; cancelReason: string; createdByName: string; createdAt: string;
  approved: boolean; approvedByName: string; approvedAt: string; signed: boolean; signedAt: string; signedNote: string; mgrSigned: boolean; hasSignedFile: boolean;
  signedByName: string; isOpening: boolean; requestedBy: string; requestedByName: string; requestedAt: string;
  rejectReason: string; rejectedByName: string; rejectedAt: string; signLink: SignLinkInfo | null; chain: ChainState | null;
  /** في القائمة: هل يعتمده المستخدم الحالي (محاسب الشركة، أو أي محاسب إن لم يُحدَّد) */
  canApprove?: boolean;
}

export interface CustodyDetail {
  custody: CustodyView; requestReason: string; stages: StageStep[]; expenses: ExpenseView[]; vouchers: VoucherView[];
  can: { edit: boolean; requestClose: boolean; review: boolean; note: boolean; correct: boolean; confirmReceipt: boolean; signOpen: boolean; approveOpen: boolean; signStatement: boolean; delete: boolean };
  openVoucherStatus: '' | VoucherView['status']; companyAccountantName: string;
  signLinks: { statement: SignLinkInfo | null; openVoucher: SignLinkInfo | null };
  chains: { statement: ChainState | null; openVoucher: ChainState | null };
}

/** اعتماد الإدارة في السلسلة الإجرائية (docs/09): ملخصها، وهل يُرسل إليها */
export interface ChainState { wf: ChainBrief | null; canStart: boolean }

export interface CusRequest {
  id: string; employeeId: string; employeeName: string; amount: number; reason: string; status: 'pending' | 'accountant' | 'signing' | 'approved' | 'rejected' | 'cancelled' | 'in_chain' | 'returned';
  statusLabel: string; custodyId: string; handledByName: string; handledAt: string; rejectReason: string; createdAt: string; activeCustodyId: string;
  wfInstanceId: string; wf: ChainBrief | null;
}

export interface Lookups {
  categories: string[]; projects: { name: string; type: string; typeLabel: string }[]; docTypes: string[];
  paymentMethods: { id: string; label: string }[]; alertPercent: number; defaultAmount: number; today: string; managerName: string; drive: boolean;
  /** محاسب الشركة الذي يعتمد السندات قبل المدير ('' = أي محاسب) */
  companyAccountantName: string; isCompanyAccountant: boolean;
}

export interface CusHome {
  defaultAmount: number; isHolder: boolean; myCustody: CustodyView | null; myRequest: CusRequest | null; myClosed?: number;
  staff: null | {
    pendingClose: CustodyView[]; awaitingOpenSign: CustodyView[]; awaitingCloseSign: CustodyView[]; pendingRequests: CusRequest[];
    voucherRequests: VoucherView[]; voucherSigning: VoucherView[]; openCount: number; openBalance: number; monthSpent: number;
  };
}

export interface Holder { id: string; fullName: string; jobTitle: string; hasAccount: boolean; activeCustodyId: string; activeStatusLabel: string; carried: number; carryFrom: string; carryFromLabel: string }

export interface SignBox { label: string; name: string; image: string }
export interface Company { name: string; address: string; phone: string }
export interface VoucherDoc { company: Company; voucher: VoucherView; signs: SignBox[] }
export interface StatementDoc {
  company: Company; custody: CustodyView; expenses: ExpenseView[]; vouchers: VoucherView[];
  signs: { holder: { name: string; image: string }; reviewer: { name: string; image: string }; manager: { name: string; image: string; signedAt: string } };
}
