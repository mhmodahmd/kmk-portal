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
- الربط العام بين أي كيانين بالحقلين `linkedType` + `linkedId` (مثل مهمة مرتبطة بعميل، أو خطاب مرتبط بمهمة).

## 2. النواة — `KMK-Core`

| الجدول | الأعمدة الرئيسية |
|---|---|
| **Users** | username, fullName, passwordHash, salt, active, mustChangePassword, failedAttempts, lockedUntil, lastLogin, employeeId, isSuperAdmin |
| **UserRoles** | userId, module (`attendance`/`hr`/`custody`/`tasks`/`crm`/`finance`), role |
| **Employees** | empNo, fullName, userId, departmentId, branchId, managerId (ref:Employees), shiftId (ref:Shifts، الوردية الحالية؛ سجل الورديات EmployeeShifts مؤجل)، jobTitle, hireDate, status (`active`/`leave`/`terminated`), phone, email, nationality, birthDate, civilId, civilIdExpiry, residencyNo, residencyExpiry, passportNo, passportExpiry, contractType, contractEnd, address, emergencyName, emergencyPhone, notes |
| **Departments** | name, managerId, active |
| **Branches** | name, address, lat, lng, geoRadius, active |
| **Settings** | key, value (json) |
| **AuditLog** | ts, userId, module, action, entity, entityId, details (json: قبل/بعد) |
| **Serials** | key (`NTH-2026`, `PV-2026`…), last |
| **Passkeys** 🆕 | userId, employeeId, credId, rpId, alg (-7 أو -257), publicKey (المفتاح العام فقط), signCount, backup (متزامن عبر iCloud/Google), label, status (`active`/`revoked`), createdAt, lastUsedAt, revokedAt, revokedBy, revokeReason |
| **Notifications** 🆕 | userId, kind (`approval` بانتظار قرارك / `event`), module, title (جملة ثابتة تُترجم), detail, link, refKey (يمنع التكرار لنفس المرحلة), read, actorName, createdAt, emailedAt · تُحذف بعد 60 يوماً |
| **NotifyState** 🆕 | id = userId، readUntil («تعليم الكل كمقروء»)، email (تفضيل البريد) |

> **ما بقي في الوحدات ولم ينتقل إلى النواة (الواقع في 0.9.x):** `Projects` قائمة في العهد (`Categories · DocTypes · Projects`) وسجل كامل في العملاء؛ الملفات ثلاثة جداول `Attachments` (عهد) و`Links` (عملاء) و`TaskFiles` (مهام)؛ `Signatures` و`SignLinks` في العهد. الدمج في جداول نواة موحّدة مؤجل إلى بناء المالية.
| **MailQueue** 🆕 0.9.3 | to, title, detail, link, actorName, createdAt, attempts · رسائل بريد بانتظار الإرسال، يصرفها المشغّل `processMailQueue` كل دقيقة ويحذف المرسَل (ثلاث محاولات ثم تُهمل) |

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
كما في النظام السابق (نُقل في 15 نوفمبر 2026)، مع ربط صاحب العهدة بالموظف الموحد. **المبالغ بالفلس** (1 د.ك = 1000).
المنفّذون في الحقول (createdBy, reviewedBy, approvedBy…) مستخدمو البوابة، و`manager` = توقيع المدير عبر الرابط، و`import` = مستورد.

| الجدول | الأعمدة الرئيسية |
|---|---|
| **Custodies** | id (`NTH-2026-001`), periodLabel, employeeId, amount, carriedBalance, openDate, status (open/pending/signing/closed), disburseStage (awaiting_signature/disbursing/received), carryMode, totalReceipts, totalSpent, remaining, settlementMethod (carry/voucher), settlementVoucherId, previousCustodyId, openVoucherId, receivedAt, reviewedBy, closeSignedAt/By, closeMgrSignId, closeSignedNote, isImported |
| **Expenses** | custodyId, entryType (expense/receipt), date, category, project, description, amount, docType, noAttachmentReason, vendor, invoiceNo, paymentMethod, attachmentIds, reviewNote |
| **Attachments** | custodyId, expenseId, fileName, driveFileId, url, mimeType, fileSize (الملفات القديمة باقية على Drive حساب kw2kmk) |
| **Vouchers** | type (payment/receipt), number (`PV-2026-0001`/`RV-…`), date, custodyId, partyName, amount, amountInWords, reason, paymentMethod, status (requested/active/rejected/cancelled), approvedBy, signedAt/By/Note, mgrSignId, requestedBy… (ينتقل إلى المالية لاحقاً) |
| **SignLinks** | kind (voucher/statement), targetId, tokenHash (بصمة الرابط فقط), managerName, expiresAt, status, signatureData (صورة توقيع المدير) |
| **Signatures** | userId, data (صورة توقيع المستخدم للمطبوعات) |
| **Requests** | employeeId, amount, reason, status, custodyId, handledBy, handledAt, rejectReason |
| **Categories · DocTypes · Projects** | name, active, sortOrder (والمشاريع: type project/debt). تنتقل المشاريع إلى النواة مع المهام |

> الإعدادات (`Settings.custody`): اسم المدير وجواله، نسبة التنبيه، المبلغ الافتراضي. الترقيم من `Serials` (NTH/PV/RV لكل سنة).
> رفع المرفقات والنسخ الموقّعة إلى Drive يحتاج منح الخادم صلاحية Drive (موافقة حساب tahfeezcenter)، وحتى ذلك: سبب عدم المرفق، وتأكيد التوقيع الورقي أو رابط المدير.

## 6. المهام — `KMK-Tasks` 🆕

| الجدول | الأعمدة الرئيسية |
|---|---|
| **Tasks** | number (`T-0001`), title, description, status (`todo`/`doing`/`review`/`done`/`cancelled`), priority (`low`/`normal`/`high`/`urgent`), assigneeId (userId), watchers (json: userIds), dueDate, startDate, completedAt, projectId (مشاريع العملاء أو العهد), linkedType (`client`/`project`/`custody`/`employee`), linkedId, parentId (مستوى واحد), recurrence (json: `{freq: weekly|monthly}`), nextTaskId, sortOrder, createdBy, updatedBy, private (0.9.6: خاصة لمنشئها فقط؛ يضيفه `ensureSchema_` تلقائياً) |
| **TaskChecklist** | taskId, text, done, sortOrder, doneBy, doneAt |
| **TaskComments** | taskId, kind (`comment` أو `event` لسجل النشاط), body, mentions (json: userIds يصبحون متابعين) |
| **TaskFiles** | taskId, fileName, driveFileId, mimeType, fileSize, uploadedBy (على Drive في «بوابة KMK — الملفات/المهام/YYYY-MM») |

## 6ب. المراسلات — `KMK-Correspondence` 🆕 (0.9.7)

> قاعدة بيانات مستقلة (`DB_CORRESPONDENCE` في Script Properties) تُنشأ تلقائياً عند أول استخدام مع جداولها، وتُزرع التصنيفات الافتراضية عند أول قراءة.

| الجدول | الأعمدة الرئيسية |
|---|---|
| **Letters** | number (`IN-2026-0001` / `OUT-2026-0001` تسلسلي بسنة تاريخ الخطاب عبر `Db.nextSerial`), direction (`in`/`out`), subject, summary, party (اسم الجهة؛ يُملأ من العميل إن اختير), clientId (عميل من `KMK-CRM`), date, receivedAt, sentAt, refNo (رقم مرجع الجهة), channel (`mail`/`hand`/`whatsapp`/`email`/`fax`), category (من جدول Categories), status (`draft`/`sent`/`received`/`replied`/`archived`), replyToId (الأصل الذي يُجاب عليه؛ تسجيل الرد يجعل الأصل `replied`), dueDate (موعد الرد المطلوب), assigneeId (userId المسؤول عن المتابعة), linkedType (`client`/`project`/`custody`/`employee`/`task`), linkedId, projectId (مشاريع العملاء؛ يملأ clientId إن كان فارغاً), tags (json), archivedAt, createdBy, createdAt, updatedBy, updatedAt |
| **LetterFiles** | letterId, fileName, driveFileId, mimeType, fileSize, uploadedBy (على Drive في «بوابة KMK — الملفات/المراسلات/YYYY») |
| **LetterLog** | letterId, kind (`create`/`update`/`send`/`receive`/`reply`/`archive`/`restore`/`forward`/`file`), body (نص عربي يُترجم في الواجهة), byId, at |
| **Categories** | name, active, sortOrder (إعادة التسمية تُطبَّق على الخطابات المسجلة) |

## 7. العملاء — `KMK-CRM` 🆕

> **Projects** في وحدة العملاء: `billing` (`fixed` عقد ثابت / `open` اشتراك أو مفتوح)، وللاشتراك `billingCycle` (`monthly`/`quarterly`/`yearly`) و`cycleAmount` (فلس): الدورات تبدأ من `startDate`، والمستحق للدورة الحالية = قيمتها − المحصّل خلالها. أُضيف العمودان في 0.9.2 (الدفعة 2 من المراجعة) ويُنشئهما `Db.ensureSchema_` تلقائياً بلا حذف.

| الجدول | الأعمدة الرئيسية |
|---|---|
| **Customers** | code, name, type (`company`/`individual`), sector, status (`lead`/`active`/`inactive`), ownerId, phone, email, address, taxNo, source, tags (json), notes |
| **Contacts** | customerId, name, role, phone, email, isPrimary |
| **Interactions** | customerId, contactId, kind (`call`/`meeting`/`whatsapp`/`email`/`visit`), date, summary, nextAction, nextDate, taskId |
| **Deals** | customerId, title, stage (`lead`/`quote`/`negotiation`/`won`/`lost`), value, probability, expectedClose, ownerId, lostReason, projectId |
| **Quotes** | number, customerId, dealId, date, validUntil, items (json), subtotal, discount, total, status, notes |

## 7ب. المنصات — `KMK-Platforms` (0.10.0 · 2026-11-17)

> متابعة إيرادات التطبيقات التي تشغّلها الشركة: **صاد القرآني** (مبيعات باقات عبر بوابة دفع + رعاة للمراكز والمسابقات) و**مقرأة تراث** (عقود مع جهات ومؤسسات). قاعدة بيانات مستقلة (`DB_PLATFORMS` في Script Properties) تُنشأ عند أول استخدام، وتُزرع فيها المنصتان.

**مصدران للإيراد، لا يُجمع المبلغ مرتين:**
1. **مبيعات التطبيق** — من ملف بوابة الدفع الشهري، تُحفظ عملية بعملية في `Sales` (هذه الوحدة تملكها).
2. **العقود والرعايات** — كل رعاية (لمركز أو مسابقة) وكل عقد مع جهة هو **مشروع في وحدة العملاء** بعميله (الراعي أو الجهة) ودفعاته المجدولة والمحصّلة كما هي اليوم. المشروع يشير إلى المنصة والمركز والمسابقة؛ وحدة المنصات تقرأ الدفعات عبر واجهة العملاء العامة ولا تكتب فيها.

| الجدول | الأعمدة الرئيسية |
|---|---|
| **Platforms** | key (`saad`/`maqraa`), name, hasAppSales (bool: صاد نعم، المقرأة لا), gateway (اسم بوابة الدفع), currency (`KWD`), active, sortOrder |
| **Packages** | platformId, name (الباقة البرونزية…), code (كما يظهر في ملف البوابة، للمطابقة عند الاستيراد), kind (`subscription` اشتراك له مدة / `gift` إهداء / `test` تجريبية تُستبعد), price (money، سعر مرجعي), durationDays (للاشتراك), unitPrice (للإهداء: قيمة رعاية الفرد), rank (لحساب الترقية), active, sortOrder. البذرة لصاد: برونزي 6 د.ك 30 يوماً · فضي 15 د.ك 90 يوماً · ذهبي 30 د.ك 120 يوماً · «علم وتعلم» باقة الإهداء (يشتريها شخص لغيره من الويب، رعاية الفرد 10 د.ك، فالمبلغ ÷ 10 = عدد الأفراد) · «باقة تجريبية» 1 د.ك تُستبعد |
| **Centers** | platformId, name (مركز المعلم المتقن…), status (`active`/`paused`/`closed`), startDate, endDate, managerName, notes |
| **Campaigns** | platformId, centerId (اختياري), kind (`competition` مسابقة / `challenge` تحدٍّ), name (تحدي قراءة سورة القلم، مسابقة سورة الطور…), startDate, endDate, status (`planned`/`running`/`ended`/`cancelled`), participants (num، اختياري), notes |
| **Sales** | عملية لكل سطر من ملف البوابة، **بلا بيانات شخصية**: gatewayId (رقم العملية، فريد يمنع التكرار عند تداخل ملفين), chargeRef, platformId, packageId, kind (`subscription`/`gift`/`test`), method (`knet`/`applepay`/`card`), channel (`app`/`web`), paidAt (بتوقيت الكويت), month (`YYYY-MM`), amount (money), fee (money: تقديرية من نسب الإعدادات أو فعلية من كشف التسوية), net (money), people (للإهداء: المبلغ ÷ قيمة رعاية الفرد), country, buyerKey (HMAC للجوال أو البريد بمفتاح سري في Script Properties، يكفي لمعرفة الجديد والعائد والترقية ولا يُسترجع منه الرقم), expiresAt (للاشتراك: paidAt + مدة الباقة), refunded (money), importId |
| **Months** | platformId, month (`YYYY-MM`), status (`draft` مسودة / `approved` معتمد ومقفل), approvedBy, approvedAt, reopenedBy, reopenReason |
| **Config** | key, value (json): عمولة كل وسيلة دفع `fees` = { knet: { pct, fixed } … } |
| **Imports** | platformId, month, fileName, rows, accepted, duplicates, excluded (json: تجريبية، غير مقبوضة), unmatched (json: أسماء باقات غير معروفة), totals (json), status (`draft` مسودة قابلة للاستبدال / `approved` معتمد ومقفل), importedBy, approvedBy, approvedAt. **الملف الأصلي لا يُحفظ** افتراضياً لأنه يحوي أسماء المشترين وجوالاتهم وبريدهم (خيار بديل بانتظار القرار: حفظه في مجلد لمدير المنصات فقط مع حذف تلقائي بعد مدة) |

**إضافات على `Projects` في وحدة العملاء** (يضيفها `Db.ensureSchema_` بلا حذف): `platformId` (ينفّذ في: صاد / المقرأة / فارغ)، `centerId`، `campaignId`، `revenueKind` (`sponsorship` رعاية / `contract` عقد خدمة). مشروع المعلم المتقن مثلاً: ينفّذ في صاد ← مركز المعلم المتقن ← رعاية.

**التعريفات في اللوحات:**
- **إيراد الشهر** = صافي مبيعات الشهر (مجموع `Sales.net` للشهر) + المحصّل في الشهر من دفعات مشاريع المنصة (`Payments` بحالة `paid` وتاريخها في الشهر).
- **المستحق** = الدفعات المجدولة + مستحق دورة الاشتراك الحالية للمشاريع المفتوحة (القاعدة الحالية في العملاء). **نسبة التحصيل** = المحصّل ÷ (المحصّل + المستحق حتى اليوم).
- شهر المبيعات المعتمد لا يُستبدل إلا بإعادة فتحه من مدير المنصات (يُسجَّل في السجل).

## 7ج. متابعة المشتركين — `KMK-Subscribers` (معتمد · المرحلة 1 مبنية 0.11.0)

> متابعة مشتركي باقات صاد: من سارٍ، ومن يقترب انتهاؤه، ومن انتهى ولم يجدد، والتواصل معهم تلقائياً (البريد أولاً ثم واتساب). قاعدة مستقلة (`DB_SUBSCRIBERS`). **هذه الوحدة وحدها تحفظ بيانات التواصل، مشفّرة**؛ وحدة المنصات تبقى بلا بيانات شخصية كما هي.

**من أين تأتي البيانات:** عند استيراد ملف البوابة في المنصات، تُمرَّر بيانات التواصل لكل عملية اشتراك (الاسم والجوال والبريد مع `buyerKey`) **في الذاكرة فقط** إلى هذه الوحدة عبر واجهتها العامة (`Subscribers.onImport_` في `ModuleProviders_`)، فتحفظها مشفّرة وتحدّث حالات المشتركين. المنصات لا تكتب شيئاً شخصياً، ولا تعرف هذه الوحدة إلا ما يمرّ عبر الواجهة. ولملء البيانات للأشهر المستوردة قبل تفعيل الوحدة: إعادة رفع ملفاتها تمرّر التواصل حتى لو كانت عملياتها مكررة (لا تُضاف مبيعات). عمليات الإهداء («علم وتعلم» من الويب) بلا مشترٍ فلا تدخل.

| الجدول | الأعمدة الرئيسية |
|---|---|
| **Subscribers** | platformId, buyerKey (الرمز نفسه في `Sales`، فريد لكل منصة)، nameEnc, mobileEnc, emailEnc (مشفّرة)، mobileMask (`5•••••12` للعرض)، hasMobile, hasEmail, country, firstPaidAt, lastPaidAt, purchases, totalPaid (money), currentPackageId, expiresAt (date: آخر انتهاء), status (محسوبة: `active` سارٍ / `expiring` ينتهي خلال 7 أيام / `lapsed` انتهى ولم يجدد / `winback` عاد بعد انقطاع)، consent (`yes` / `no` / `unknown`)، consentAt, consentSource, optOut (bool), optOutAt, optOutChannel, assignedTo (userId)، notes, forgottenAt, createdAt, updatedAt |
| **Cycles** | دورة لكل اشتراك: subscriberId, saleGatewayId, packageId, paidAt, expiresAt, outcome (`open` سارية / `pending` انتهت وبانتظار كشف الشهر التالي / `renewed` جدّد / `lapsed` لم يجدد)، renewedBySaleId, afterReminder (bool: جدّد بعد تذكير)، closedAt |
| **Messages** | subscriberId, cycleId, channel (`email` / `whatsapp` / `call` / `app`)، kind (`before` / `on_expiry` / `after` / `winback` / `manual`)، templateId, status (`queued` / `sent` / `failed` / `delivered` / `read` / `replied` / `skipped`)، skipReason (`opted_out` / `no_contact` / `quiet_hours` / `cap`)، error, sentAt, byId (فارغ للآلي)، dedupeKey (cycleId+kind+channel يمنع الإرسال مرتين) |
| **Templates** | key, channel, name, subject, body (متغيرات: `{الاسم}` `{الباقة}` `{تاريخ_الانتهاء}` `{رابط_التجديد}` `{رابط_الإيقاف}`)، waTemplate (اسم القالب المعتمد في Meta)، lang, active |
| **Campaigns** | name, filter (json: منقطع منذ أكثر من N يوماً، الباقة، الدولة)، templateId, channel, status (`draft` / `scheduled` / `sent` / `cancelled`)، scheduledAt, counts (json: مستهدف، أُرسل، تخطّى، جدّد بعدها)، createdBy |
| **Config** | key, value (json): مواعيد التذكير (−7 و0 و+7 أيام)، ساعات الإرسال (9:00–21:00 بتوقيت الكويت)، الحد اليومي، رابط التجديد (رابط واحد للتطبيق أو المتجر)، اسم المرسل، مدة الاحتفاظ (24 شهراً)، تفعيل كل قناة |

**التشفير:** Apps Script لا يوفّر AES، فيُستخدم تشفير متماثل بمفتاح في Script Properties (`SUB_DATA_KEY`): تدفق مفتاح من HMAC-SHA256 بوضع العدّاد مع قيمة عشوائية لكل حقل، ورمز تحقق HMAC يكشف أي عبث (encrypt-then-MAC). ملف Sheets وحده لا يكشف شيئاً، والمفتاح لا يغادر الخادم. البحث بالجوال يتم عبر `buyerKey` لا بفك التشفير.

**الخصوصية:**
- الجوال والبريد يظهران مقنّعين، والإظهار الكامل أو التصدير يُسجَّل في `Audit` بمن وما ومتى.
- **الحذف بطلب المشترك** (`sub.forget`): تُمسح الحقول المشفّرة ويبقى الرمز والإحصاءات بلا هوية.
- **الاحتفاظ:** بعد مدة بلا نشاط (افتراضياً 24 شهراً، قرار للاعتماد) تُمسح بيانات التواصل تلقائياً بالطريقة نفسها.
- **الإيقاف** (`optOut`) يمنع كل الرسائل الآلية واليدوية. **الموافقة (قرار المستخدم، الخيار أ):** كل الرسائل (التذكير والاسترجاع) تُرسل لكل المشتركين، وفي كل رسالة طريقة للإيقاف: رابط في البريد، وكلمة «إيقاف» في واتساب. حقل `consent` يبقى للمستقبل ولا يمنع الإرسال.
- **المرحلة 1:** الدورات ونتائجها تُحسب من المبيعات عند كل طلب (لا تُخزَّن)، وتُخزَّن في `Cycles` مع التذكيرات في المرحلة 2.

**القواعد:**
- **مصدر الحقيقة هو كشف البوابة الشهري** (قرار المستخدم 2026-11-17): لا يُعتمد على مهلة زمنية ولا على واجهة ربط التطبيق. المشترك الذي انتهت باقته يُعد **«لم يجدد»** حتى يصل كشف الشهر التالي ويُستورد: إن وُجد فيه اشتراك جديد للمشتري نفسه يُسجَّل **«جدّد»** ويعود سارياً، وإن لم يوجد يبقى «لم يجدد» نهائياً لتلك الدورة.
- **الحالة** تُحسب بعد كل استيراد وكل يوم من آخر دورة: `active` إن بقي أكثر من 7 أيام، `expiring` إن بقي 0–7، `lapsed` إن انتهت ولم يظهر بعدها اشتراك في الكشوف المستوردة، و`winback` لمن اشترى بعد أن كان `lapsed` في دورة سابقة.
- **التجديد** = شراء اشتراك جديد من المشتري نفسه بعد شراء الدورة وحتى نهاية شهر انتهائها (أي يظهر في كشف ذلك الشهر)؛ يُغلق الدورة بنتيجة `renewed`. دورة انتهت ولم يُستورد كشف شهر انتهائها بعد نتيجتها `pending` (تظهر في القوائم «لم يجدد — بانتظار كشف {الشهر}»). بعد استيراد ذلك الكشف دون شراء تصبح `lapsed`، ومن يشتري بعدها يُعد عائداً (`winback`). **«جدّد بعد التذكير»** إن سبقه تذكير في الدورة نفسها.
- **نسبة التجديد لشهر** = الدورات المنتهية في الشهر التي نتيجتها `renewed` ÷ الدورات المنتهية في الشهر. تكون أولية حتى يُستورد كشف الشهر نفسه، ثم نهائية (تظهر بعلامة «أولية» في الشاشات).

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
| `plt.month.missing` (اليوم 5 من الشهر) | المنصات | الإشعارات: محاسب المنصات «لم تُستورد مبيعات الشهر الماضي» |
| `plt.month.approved` | المنصات | المالية لاحقاً (قيد إيراد بمصدره `platforms`) |
| `plt.campaign.ending` (قبل 7 أيام) | المنصات | الإشعارات: مدير المنصات إن كان للمسابقة رعاية لم تُحصَّل كاملة |
| `plt.import.done` (مع بيانات التواصل في الذاكرة) 🆕 | المنصات | متابعة المشتركين: حفظ التواصل مشفّراً، فتح الدورات وإغلاقها، تحديث الحالات |
| `sub.reminder.due` (يومياً) 🆕 | متابعة المشتركين | البريد ثم واتساب: تذكير قبل الانتهاء بـ 7 أيام، ويوم الانتهاء، وبعده بـ 7 أيام لمن لم يجدد |
| `sub.lapsed` (بعد آخر تذكير بـ 3 أيام، ولم يظهر تجديد في الكشوف) 🆕 | متابعة المشتركين | المهام: «اتصل بمشترك لم يجدد» لمسؤول المشترك أو لموظف المتابعة |

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
