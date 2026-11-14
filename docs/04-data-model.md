# 04 — نموذج البيانات

> الحالة: **مسودة للاعتماد** · آخر تحديث: 2026-11-14
>
> كل جدول = ورقة في ملف الوحدة. الأعمدة تُقرأ بأسمائها. الأنواع: `text` · `num` · `money` (بالفلس، عدد صحيح) · `date` (yyyy-mm-dd) · `ts` (طابع زمني ISO) · `bool` · `json` · `ref:<جدول>`.
> كل جدول فيه ضمنياً: `id`, `createdAt`, `createdBy`, `updatedAt`.

## 1. الصورة الكبيرة

```
                         ┌──────────────┐
                         │    Users     │  حساب الدخول
                         └──────┬───────┘
                                │ 1:1 (اختياري)
                         ┌──────▼───────┐
          ┌──────────────┤  Employees   ├──────────────┐
          │              └──────┬───────┘              │
   Attendance              LeaveRequests            Custodies
   Overtime                (HR)                     (العهد)
          │                                            │
          └──────────────► Projects ◄──────────────────┘
                         (النواة: مراكز التكلفة)
                              ▲      ▲
                       Tasks ─┘      └─ Transactions (المالية)
                         │                    ▲
                         └──► Customers ──────┘ (CRM ← فواتير ← مقبوضات)
```

- **Users** للدخول فقط. **Employees** هو الملف الوظيفي. يمكن وجود مستخدم ليس موظفاً (محاسب خارجي مثلاً).
- كل وحدة تشير إلى الموظف بـ `employeeId`، وإلى المشروع بـ `projectId`.
- الربط العام بين أي كيانين بالحقلين `linkedType` + `linkedId` (مثل مهمة مرتبطة بعميل).

## 2. النواة — `KMK-Core`

| الجدول | الأعمدة الرئيسية |
|---|---|
| **Users** | username, fullName, passwordHash, salt, active, mustChangePassword, failedAttempts, lockedUntil, lastLogin, employeeId, isSuperAdmin |
| **UserRoles** | userId, module (`attendance`/`hr`/`custody`/`tasks`/`crm`/`finance`), role |
| **Employees** | empNo, fullName, userId, departmentId, branchId, managerId (ref:Employees), shiftId (ref:Shifts، الوردية الحالية؛ سجل الورديات EmployeeShifts مؤجل)، jobTitle, hireDate, status (`active`/`leave`/`terminated`), phone, email, nationality, birthDate, civilId, civilIdExpiry, residencyNo, residencyExpiry, passportNo, passportExpiry, contractType, contractEnd, address, emergencyName, emergencyPhone, notes |
| **Departments** | name, managerId, active |
| **Branches** | name, address, lat, lng, geoRadius, active |
| **Projects** | code, name, type (`project`/`debt`/`internal`), customerId, active, sortOrder |
| **Settings** | key, value (json) |
| **Lists** | listName, name, active, sortOrder (التصنيفات وأنواع المستندات وغيرها) |
| **Files** | module, entityType, entityId, fileName, driveFileId, mimeType, size, uploadedBy |
| **Signatures** | userId, data |
| **SignLinks** | kind, targetId, tokenHash, managerName, expiresAt, status, actedAt, signatureFileId, rejectReason |
| **Notifications** | userId, module, type, title, body, link, readAt |
| **AuditLog** | ts, userId, module, action, entity, entityId, details (json: قبل/بعد) |
| **Serials** | key (`NTH-2026`, `PV-2026`…), last |
| **Passkeys** 🆕 | userId, employeeId, credId, rpId, alg (-7 أو -257), publicKey (المفتاح العام فقط), signCount, backup (متزامن عبر iCloud/Google), label, status (`active`/`revoked`), createdAt, lastUsedAt, revokedAt, revokedBy, revokeReason |

> مفاتيح الدخول بالبصمة (WebAuthn): مفتاح نشط واحد لكل مستخدم، للدخول وللبصمة في الحضور معاً. الخادم يتحقق من التوقيع بنفسه (`core/WebAuthn.js`) ولا تصله أي بيانات حيوية. الموظف يغيّر جهازه عبر الموارد البشرية، ومن ليس موظفاً يزيله من «ملفي».

## 3. الحضور — `KMK-Attendance`

| الجدول | الأعمدة الرئيسية |
|---|---|
| **Attendance** | employeeId, date, inTs, outTs, inLat, inLng, inAcc, outLat, outLng, outAcc, source (`app`/`manual`/`correction`), note, editedBy, inVerify, outVerify (`device` = بصمة الجهاز) |
| **Corrections** 🆕 | employeeId, date, kind (`missingOut`/`missingIn`/`wrongTime`), attendanceId, inTime, outTime, reason, status, decidedBy, decidedAt, decisionNote |

> الورديات والعطل والإجازات المعتمدة تُقرأ من الموارد البشرية عبر `Hr.calendar_()`.
> بصمة الجهاز تستخدم مفتاح الدخول بالبصمة نفسه (`core.Passkeys`). تغيير هاتف الموظف = إعادة ضبط من إعدادات الحضور بسبب إلزامي.
> الإعدادات (`Settings.attendance`): التحقق من الموقع، اشتراط بصمة الجهاز، أقصى مدة للحضور المفتوح، وبداية احتساب الحضور (لا يُحتسب غياب قبلها؛ الافتراضي تاريخ أول بصمة).

## 4. الموارد البشرية — `KMK-HR`

| الجدول | الأعمدة الرئيسية |
|---|---|
| **Shifts** | name, start, end, graceMin, workDays (json), active |
| **EmployeeShifts** | employeeId, shiftId, from, to |
| **Holidays** | date, dateTo, name |
| **LeaveTypes** | name, annualDays, paid, requiresAttachment, active |
| **LeaveBalances** | employeeId, typeId, year, adjustment, note |
| **LeaveRequests** | employeeId, typeId, from, to, days, reason, status, managerId, managerAt, managerNote, decidedBy, decidedAt, decisionNote |
| **OvertimeRequests** | employeeId, date, minutes, reason, status, decidedBy, decidedAt, decisionNote |
| **Terminations** 🆕 | employeeId, lastDay, reason, checklist (json), status |

## 5. العهد — `KMK-Custody`
كما في النظام الحالي تقريباً، مع استبدال `employeeId` بمعرّف الموظف الموحد و`project` بـ `projectId`.

| الجدول | الأعمدة الرئيسية |
|---|---|
| **Custodies** | number (`NTH-2026-001`), periodLabel, employeeId, amount, carriedBalance, openDate, status, disburseStage, carryMode, totals…, settlementMethod, settlementVoucherId, previousCustodyId, driveFolderId, isImported, closeSigned… |
| **Expenses** | custodyId, entryType, date, categoryId, projectId, description, amount, docType, noAttachmentReason, vendor, invoiceNo, paymentMethod, reviewNote |
| **Requests** | employeeId, amount, reason, status, custodyId, handledBy, handledAt, rejectReason |
| **Vouchers** | ينتقل إلى المالية لاحقاً (انظر 8) |

## 6. المهام — `KMK-Tasks` 🆕

| الجدول | الأعمدة الرئيسية |
|---|---|
| **Tasks** | number, title, description, status (`todo`/`doing`/`review`/`done`/`cancelled`), priority (`low`/`normal`/`high`/`urgent`), assigneeId, watchers (json), dueDate, startDate, completedAt, projectId, linkedType, linkedId, parentId, recurrence (json), sortOrder |
| **TaskChecklist** | taskId, text, done, sortOrder |
| **TaskComments** | taskId, body, mentions (json) |

## 7. العملاء — `KMK-CRM` 🆕

| الجدول | الأعمدة الرئيسية |
|---|---|
| **Customers** | code, name, type (`company`/`individual`), sector, status (`lead`/`active`/`inactive`), ownerId, phone, email, address, taxNo, source, tags (json), notes |
| **Contacts** | customerId, name, role, phone, email, isPrimary |
| **Interactions** | customerId, contactId, kind (`call`/`meeting`/`whatsapp`/`email`/`visit`), date, summary, nextAction, nextDate, taskId |
| **Deals** | customerId, title, stage (`lead`/`quote`/`negotiation`/`won`/`lost`), value, probability, expectedClose, ownerId, lostReason, projectId |
| **Quotes** | number, customerId, dealId, date, validUntil, items (json), subtotal, discount, total, status, notes |

## 8. المالية — `KMK-Finance` 🆕

| الجدول | الأعمدة الرئيسية |
|---|---|
| **Accounts** | name, kind (`cash`/`bank`/`custody`), openingBalance, active |
| **Transactions** | date, direction (`in`/`out`/`transfer`), accountId, toAccountId, amount, categoryId, projectId, customerId, employeeId, sourceModule, sourceType, sourceId, voucherId, description, status (`posted`/`void`) |
| **Invoices** | number, customerId, projectId, quoteId, date, dueDate, items (json), subtotal, discount, total, paid, status |
| **Payments** | invoiceId, customerId, date, amount, method, accountId, reference, voucherId |
| **Vouchers** | (من العهد) type, number, date, partyName, amount, amountInWords, reason, paymentMethod, chequeNo, status, approvedBy, signedFileId, mgrSignId, sourceModule, sourceId |

**مبدأ الدفتر الموحد:** كل حركة مال في أي وحدة تُسجَّل قيداً في `Transactions` مع مصدرها (`sourceModule` + `sourceId`): صرف عهدة، تسوية، تحصيل فاتورة، مصروف عام، راتب. الدفتر مصمم بحيث يمكن تحويله لاحقاً إلى قيد مزدوج (مدين/دائن) دون إعادة بناء.

## 9. الأحداث بين الوحدات

| الحدث | يُطلقه | يستجيب له |
|---|---|---|
| `hr.employee.created` | الموارد البشرية | النواة (إنشاء حساب دخول اختياري) |
| `hr.employee.terminating` | الموارد البشرية | العهد (منع إن وُجدت عهدة مفتوحة)، المهام (إعادة إسناد) |
| `hr.leave.approved` | الموارد البشرية | الحضور (اليوم إجازة لا غياب) |
| `custody.opened` / `custody.settled` | العهد | المالية (قيد صرف أو تسوية) |
| `crm.deal.won` | العملاء | المهام (مهمة بدء)، المالية (فاتورة مسودة) |
| `finance.invoice.overdue` | المالية | المهام (متابعة تحصيل)، الإشعارات |

## 10. نقل البيانات من النظامين الحاليين

| من | إلى | ملاحظات |
|---|---|---|
| مستخدمو الحضور + مستخدمو العهد | `Users` واحد | الدمج حسب اسم المستخدم مع جدول مطابقة تراجعه أنت يدوياً. كلمات المرور لا تُنقل بين النظامين: من كان في نظام واحد يحتفظ بكلمته، والمكرر يختار أحدهما |
| `Employees`, `Departments`, `Branches` في الحضور | النواة | `Employees.id` ⇐ موظف موحد |
| `Shifts`, `Holidays`, `Leave*`, `OvertimeRequests` | الموارد البشرية | `userId` ⇐ `employeeId` |
| `Attendance` | الحضور | `userId` ⇐ `employeeId` |
| `Custodies`, `Expenses`, `Requests` | العهد | `employeeId` ⇐ الموظف الموحد، `project` (نص) ⇐ `projectId` |
| `Attachments` | `Files` في النواة | `custodyId/expenseId` ⇐ `entityType/entityId`، الملفات تبقى في مكانها على Drive |
| `Vouchers`, `SignLinks`, `Signatures` | المالية / النواة | كما هي |
| `Categories`, `DocTypes` | `Lists` | |
| `Projects` | النواة | |
| `AuditLog` | النواة | مع `module` |

- النقل بسكربت يمكن تشغيله عدة مرات بأمان، ومعه تقرير مطابقة للأعداد والمجاميع قبل وبعد.
- **الحضور: نُقل في 15 نوفمبر 2026** عبر `system.migrate.legacyAttendance` (مدير النظام، `modules/system/Migration.js`): 6 مستخدمين (مدير النظام القديم رُبط بحساب المدير الحالي)، 4 موظفين، 3 أقسام، فرع، 62 تسجيل حضور، طلبا إجازة. المطابقة 100% (العدد والدقائق لكل موظف وشهر). كلمات المرور القديمة تعمل وتُعاد بطريقة البوابة عند أول دخول. التشغيل مرة أخرى يضيف ويحدّث التسجيلات فقط ولا يمس الموظفين والهيكل بعد النقل الأول.
- النظامان القديمان يبقيان يعملان حتى اعتماد النقل، ثم يصبحان للقراءة فقط.
