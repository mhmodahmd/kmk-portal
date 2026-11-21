/**
 * المستندات — المرحلة 1 (docs/08): الأنواع والحقول، السرية وقائمة الاطلاع، الملف الرئيسي بإصداراته،
 * ملفات Office والنصوص حتى 25 ميجابايت مع معاينة PDF، ومؤشر مساحة Drive.
 */
import { eq, test, truthy } from './harness.mjs';
import { company, at, SUN } from './phase1.test.mjs';

const b64 = (buf) => Buffer.from(buf).toString('base64');
const PDF = b64('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
/** ZIP بالحد الأدنى بأسماء ملفات Office في دليله */
const zip = (...names) => b64(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26), Buffer.from(['[Content_Types].xml', ...names].join('\n'))]));
const DOCX = zip('word/document.xml');
const XLSX = zip('xl/workbook.xml');
const DOCM_AS_DOCX = zip('word/document.xml', 'word/vbaProject.bin');
const OLE = (extra = '') => b64(Buffer.concat([Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]), Buffer.alloc(600), Buffer.from(extra, 'utf16le')]));

/** سارة وأحمد موظفا مستندات، هدى مديرة. */
function setup() {
  const c = company(at(SUN, '07:00'));
  const users = c.ok('users.list', {}, c.A).users;
  const uid = (u) => users.find((x) => x.username === u).id;
  c.ok('users.setRoles', { id: uid('sara'), roles: { correspondence: 'clerk' } }, c.A);
  c.ok('users.setRoles', { id: uid('ahmad'), roles: { correspondence: 'clerk' } }, c.A);
  c.ok('users.setRoles', { id: uid('huda'), roles: { attendance: 'hr', hr: 'hr', correspondence: 'manager' } }, c.A);
  const types = () => c.ok('cor.types', {}, c.T.huda);
  const type = (code) => types().find((t) => t.code === code);
  return { ...c, uid: { sara: uid('sara'), ahmad: uid('ahmad'), huda: uid('huda') }, types, type };
}

test('documents: default types are seeded; incoming and outgoing keep their numbering; internal types number by their own code', () => {
  const c = setup();
  eq(c.types().map((t) => [t.code, t.direction, t.builtin]), [['IN', 'in', true], ['OUT', 'out', true], ['MEMO', 'internal', false], ['CIRC', 'internal', false], ['DEC', 'internal', false]]);
  const a = c.ok('cor.save', { direction: 'in', subject: 'وارد قديم الطريقة', party: 'جهة', date: SUN }, c.T.sara);
  eq([a.number, a.typeCode, a.typeName, a.confidentiality], ['IN-2026-0001', 'IN', 'وارد', 'internal']);
  const memo = c.ok('cor.save', { typeId: c.type('MEMO').id, subject: 'مذكرة بشأن الدوام', date: SUN }, c.T.sara);
  eq([memo.number, memo.direction, memo.status, memo.party, memo.channel], ['MEMO-2026-0001', 'internal', 'draft', '', '']);
  const out = c.ok('cor.save', { typeId: c.type('OUT').id, subject: 'صادر بالنوع', party: 'جهة', date: SUN }, c.T.sara);
  eq(out.number, 'OUT-2026-0001');
  truthy(c.fail('cor.save', { direction: 'internal', subject: 'x', date: SUN }, c.T.sara).message.includes('نوع المستند'));
  truthy(c.fail('cor.save', { typeId: c.type('MEMO').id, direction: 'in', subject: 'x', date: SUN }, c.T.sara).message.includes('لا يطابق'));
  truthy(c.fail('cor.save', { id: memo.id, typeId: c.type('DEC').id, subject: 'x', date: SUN }, c.T.sara).message.includes('نوع المستند'));
  // الداخلي: يُرسل ولا يُرد عليه
  eq(c.ok('cor.status', { id: memo.id, status: 'sent' }, c.T.sara).status, 'sent');
  truthy(c.fail('cor.status', { id: memo.id, status: 'replied' }, c.T.sara).message.includes('للوارد والصادر'));
  truthy(c.fail('cor.save', { direction: 'out', subject: 'رد', party: 'x', date: SUN, replyToId: memo.id }, c.T.sara).message.includes('وارد وآخر صادر'));
  eq(c.ok('cor.list', { typeId: c.type('MEMO').id }, c.T.sara).map((x) => x.number), ['MEMO-2026-0001']);
  eq(c.ok('cor.list', { typeId: c.type('IN').id }, c.T.sara).map((x) => x.number), ['IN-2026-0001'], 'letters without typeId belong to their direction type');
});

test('documents: the manager adds and edits types; built-in types keep their code and direction; patterns and codes are validated', () => {
  const c = setup();
  eq(c.fail('cor.type.save', { name: 'عقد', code: 'CON', direction: 'internal' }, c.T.sara).code, 'FORBIDDEN');
  const list = c.ok('cor.type.save', { name: 'عقد', code: 'con', direction: 'out', numberPattern: 'KMK/{code}/{year}-{seq:3}', confidentiality: 'secret' }, c.T.huda);
  const con = list.find((t) => t.code === 'CON');
  eq([con.direction, con.numberPattern, con.confidentiality, con.builtin, con.active], ['out', 'KMK/{code}/{year}-{seq:3}', 'secret', false, true]);
  const d = c.ok('cor.save', { typeId: con.id, subject: 'عقد صيانة', party: 'شركة', date: SUN }, c.T.sara);
  eq([d.number, d.confidentiality], ['KMK/CON/2026-001', 'secret'], 'the type default confidentiality applies');
  truthy(c.fail('cor.type.save', { name: 'آخر', code: 'CON', direction: 'in' }, c.T.huda).message.includes('مستخدم'));
  truthy(c.fail('cor.type.save', { name: 'آخر', code: '1X', direction: 'in' }, c.T.huda).message.includes('رمز'));
  truthy(c.fail('cor.type.save', { name: 'آخر', code: 'OTH', direction: 'in', numberPattern: '{year}-{seq}' }, c.T.huda).message.includes('نمط'));
  truthy(c.fail('cor.type.save', { name: 'آخر', code: 'OTH', direction: 'in', numberPattern: '{code}-{seq:9}' }, c.T.huda).message.includes('نمط'));
  truthy(c.fail('cor.type.save', { id: con.id, name: 'عقد', code: 'CON', direction: 'in' }, c.T.huda).message.includes('اتجاه'), 'a type with documents keeps its direction');
  const inT = c.type('IN');
  const after = c.ok('cor.type.save', { id: inT.id, name: 'الوارد', code: 'ZZ', direction: 'out', active: false }, c.T.huda).find((t) => t.id === inT.id);
  eq([after.name, after.code, after.direction, after.active], ['الوارد', 'IN', 'in', true], 'built-in types: only the name changes');
  // الإيقاف والترتيب
  c.ok('cor.type.save', { id: con.id, name: 'عقد', code: 'CON', direction: 'out', active: false }, c.T.huda);
  eq(c.ok('cor.lookups', {}, c.T.sara).types.some((t) => t.code === 'CON'), false, 'inactive types are not offered');
  truthy(c.fail('cor.save', { typeId: con.id, subject: 'x', party: 'y', date: SUN }, c.T.sara).message.includes('موقوف'));
  const moved = c.ok('cor.type.move', { id: c.type('DEC').id, dir: 'up' }, c.T.huda);
  eq(moved.map((t) => t.code).slice(2, 5), ['MEMO', 'DEC', 'CIRC']);
  truthy(c.ok('audit.list', { module: 'correspondence' }, c.A).rows.some((r) => r.action === 'type.create'));
});

test('documents: custom fields are validated, stored (money in fils), shown, searchable, and keep their values when stopped', () => {
  const c = setup();
  const memo = c.type('MEMO');
  const types = c.ok('cor.type.save', { id: memo.id, name: memo.name, code: 'MEMO', direction: 'internal', fields: [
    { label: 'المبلغ', kind: 'money', required: true, inList: true },
    { label: 'الأولوية', kind: 'select', options: 'عادي، عاجل', inList: true },
    { label: 'المعني', kind: 'user' },
    { label: 'تاريخ التنفيذ', kind: 'date' }
  ] }, c.T.huda);
  const fields = types.find((t) => t.code === 'MEMO').fields;
  eq(fields.map((f) => [f.key, f.kind, f.required]), [['f1', 'money', true], ['f2', 'select', false], ['f3', 'user', false], ['f4', 'date', false]]);
  eq(fields[1].options, ['عادي', 'عاجل']);
  truthy(c.fail('cor.save', { typeId: memo.id, subject: 'بلا مبلغ', date: SUN }, c.T.sara).message.includes('المبلغ'));
  truthy(c.fail('cor.save', { typeId: memo.id, subject: 'x', date: SUN, fields: { f1: '10', f2: 'متوسط' } }, c.T.sara).message.includes('القائمة'));
  truthy(c.fail('cor.save', { typeId: memo.id, subject: 'x', date: SUN, fields: { f1: '10', f3: 'nobody' } }, c.T.sara).message.includes('الشخص'));
  const d = c.ok('cor.save', { typeId: memo.id, subject: 'شراء أجهزة', date: SUN, fields: { f1: '1,250.5', f2: 'عاجل', f3: c.uid.ahmad, f4: '2026-11-30' } }, c.T.sara);
  eq(d.fields.map((f) => [f.key, f.value, f.display]), [['f1', 1250500, '1,250.500 د.ك'], ['f2', 'عاجل', 'عاجل'], ['f3', c.uid.ahmad, 'أحمد'], ['f4', '2026-11-30', '30/11/2026']]);
  eq(d.listFields, [{ label: 'المبلغ', display: '1,250.500 د.ك' }, { label: 'الأولوية', display: 'عاجل' }]);
  eq(c.ok('cor.list', { q: 'عاجل' }, c.T.sara).map((x) => x.id), [d.id], 'field values are searchable');
  // نوع الحقل لا يتغير، والحذف من القائمة يوقف الحقل وتبقى قيمته
  truthy(c.fail('cor.type.save', { id: memo.id, name: memo.name, code: 'MEMO', direction: 'internal', fields: [{ id: fields[0].id, label: 'المبلغ', kind: 'text' }] }, c.T.huda).message.includes('لا يتغيّر'));
  const t2 = c.ok('cor.type.save', { id: memo.id, name: memo.name, code: 'MEMO', direction: 'internal', fields: [{ id: fields[1].id, label: 'الأولوية', kind: 'select', options: ['عادي', 'عاجل'] }, { label: 'الجهة الطالبة', kind: 'text' }] }, c.T.huda).find((t) => t.code === 'MEMO');
  eq(t2.fields.filter((f) => f.active).map((f) => [f.key, f.label]), [['f2', 'الأولوية'], ['f5', 'الجهة الطالبة']], 'new keys never reuse old ones');
  const edited = c.ok('cor.save', { id: d.id, subject: 'شراء أجهزة', date: SUN, fields: { f2: 'عادي' } }, c.T.sara);
  eq(edited.fields.map((f) => f.key), ['f2', 'f5'], 'stopped fields are hidden');
  eq(c.ok('cor.get', { id: d.id }, c.T.sara).letter.fields.find((f) => f.key === 'f2').value, 'عادي');
  c.ok('cor.type.save', { id: memo.id, name: memo.name, code: 'MEMO', direction: 'internal', fields: [...t2.fields.filter((f) => f.active), { id: fields[0].id, label: 'المبلغ', kind: 'money' }] }, c.T.huda);
  eq(c.ok('cor.get', { id: d.id }, c.T.sara).letter.fields.find((f) => f.key === 'f1').value, 1250500, 'a re-activated field shows its kept value');
});

test('documents: confidentiality and readers decide who sees a document and its files', () => {
  const c = setup();
  const mk = (subject, confidentiality, extra = {}) => c.ok('cor.save', { direction: 'in', subject, party: 'جهة', date: SUN, summary: 'نص ' + subject, confidentiality, ...extra }, c.T.sara);
  const pub = mk('عام', 'public');
  const int = mk('داخلي', 'internal');
  const sec = mk('سري', 'secret', { readers: [c.uid.ahmad] });
  const top = mk('سري جداً', 'top_secret');
  c.ok('cor.file.upload', { letterId: sec.id, fileName: 'a.pdf', mimeType: 'application/pdf', data: PDF }, c.T.sara);
  const seen = (tok) => c.ok('cor.list', {}, tok).map((x) => x.subject).sort();
  eq(seen(c.T.ahmad), ['سري', 'عام'], 'another clerk: public documents and those where he is a reader');
  eq(seen(c.T.huda), ['داخلي', 'سري', 'عام'], 'the manager does not see top secret');
  eq(seen(c.A).length, 4, 'the system admin sees everything');
  // عام: يُرى ولا يُعدَّل
  eq([c.ok('cor.get', { id: pub.id }, c.T.ahmad).letter.canEdit, c.ok('cor.get', { id: pub.id }, c.T.ahmad).can.files], [false, true]);
  eq(c.fail('cor.save', { id: pub.id, subject: 'x', party: 'y', date: SUN }, c.T.ahmad).code, 'FORBIDDEN');
  // سري: المديرة ترى البيانات دون الملخص والملفات
  const hs = c.ok('cor.get', { id: sec.id }, c.T.huda);
  eq([hs.letter.restricted, hs.letter.summary, hs.files.length, hs.can.files, hs.can.edit], [true, '', 0, false, false]);
  const fid = c.ok('cor.get', { id: sec.id }, c.T.ahmad).files[0].id;
  eq(c.fail('cor.file.content', { id: fid }, c.T.huda).code, 'FORBIDDEN');
  eq(c.ok('cor.file.content', { id: fid }, c.T.ahmad).data, PDF, 'a reader opens the files');
  eq(c.ok('cor.list', { q: 'نص سري' }, c.T.huda).length, 0, 'the hidden summary is not searchable');
  // سري جداً: لا يراه غير المعنيين، ويُسجَّل فتح مدير النظام
  eq(c.fail('cor.get', { id: top.id }, c.T.huda).code, 'NOT_FOUND');
  c.ok('cor.get', { id: top.id }, c.A);
  truthy(c.ok('audit.list', { module: 'correspondence' }, c.A).rows.some((r) => r.action === 'letter.open' && r.entityId === top.id));
  // تعديل القائمة يمنح الاطلاع ويُسجَّل
  c.ok('cor.save', { id: top.id, subject: 'سري جداً', party: 'جهة', date: SUN, readers: [c.uid.huda] }, c.T.sara);
  eq(c.ok('cor.get', { id: top.id }, c.T.huda).letter.subject, 'سري جداً');
  truthy(c.ok('cor.get', { id: top.id }, c.T.sara).log.some((x) => x.body.includes('قائمة الاطلاع')));
  truthy(c.fail('cor.save', { direction: 'in', subject: 'x', party: 'y', date: SUN, readers: ['ghost'] }, c.T.sara).message.includes('الاطلاع'));
  truthy(c.fail('cor.save', { direction: 'in', subject: 'x', party: 'y', date: SUN, confidentiality: 'cosmic' }, c.T.sara).message.includes('السرية'));
});

test('documents: the main file has versions; each upload is a new version and old ones stay', () => {
  const c = setup();
  const d = c.ok('cor.save', { typeId: c.type('MEMO').id, subject: 'سياسة الإجازات', date: SUN }, c.T.sara);
  const v1 = c.ok('cor.file.upload', { letterId: d.id, role: 'main', fileName: 'السياسة.docx', mimeType: '', data: DOCX }, c.T.sara);
  eq([v1.version, v1.fileName, v1.hasPreview], [1, 'MEMO-2026-0001_v1_السياسة.docx', true]);
  c.ok('cor.save', { id: d.id, subject: 'سياسة الإجازات المعدّلة', date: SUN }, c.T.sara);
  const v2 = c.ok('cor.file.upload', { letterId: d.id, role: 'main', fileName: 'السياسة.pdf', mimeType: 'application/pdf', data: PDF, note: 'بعد ملاحظات الموارد البشرية' }, c.T.sara);
  eq(v2.version, 2);
  const g = c.ok('cor.get', { id: d.id }, c.T.sara);
  eq([g.letter.version, g.main.fileName, g.main.role, g.files.length, g.letter.filesCount, g.letter.hasMainFile], [2, 'MEMO-2026-0001_v2_السياسة.pdf', 'main', 0, 0, true], 'versions are not counted as attachments');
  eq(g.versions.map((v) => [v.version, v.current, v.note]), [[2, true, 'بعد ملاحظات الموارد البشرية'], [1, false, '']]);
  truthy(g.log.some((x) => x.kind === 'version' && x.body.includes('الإصدار 2')));
  // الإصدار السابق يُفتح، ومعاينته PDF، ولا يُحذف
  eq(c.ok('cor.file.content', { id: g.versions[1].fileId }, c.T.sara).data, DOCX);
  const pv = c.ok('cor.file.content', { id: g.versions[1].fileId, preview: true }, c.T.sara);
  eq([pv.mimeType, Buffer.from(pv.data, 'base64').toString().startsWith('%PDF')], ['application/pdf', true]);
  truthy(c.fail('cor.file.content', { id: g.versions[0].fileId, preview: true }, c.T.sara).message.includes('معاينة'));
  truthy(c.fail('cor.file.remove', { id: g.versions[1].fileId }, c.T.huda).message.includes('إصدار'));
  truthy(c.fail('cor.file.upload', { letterId: d.id, role: 'cover', fileName: 'a.pdf', mimeType: 'application/pdf', data: PDF }, c.T.sara).message.includes('غير معروف'));
  // الحذف النهائي يزيل الإصدارات وملفات المعاينة
  c.ok('cor.remove', { id: d.id }, c.T.huda);
  eq(c.fail('cor.get', { id: d.id }, c.T.sara).code, 'NOT_FOUND');
});

test('documents: Office and text files are accepted by extension and content; macros, executables and oversized files are refused', () => {
  const c = setup();
  const d = c.ok('cor.save', { direction: 'in', subject: 'مرفقات', party: 'جهة', date: SUN }, c.T.sara);
  const up = (fileName, mimeType, data) => c.call('cor.file.upload', { letterId: d.id, fileName, mimeType, data }, c.T.sara);
  truthy(up('عرض.xlsx', 'application/octet-stream', XLSX).ok, 'xlsx by extension');
  truthy(up('قديم.doc', 'application/msword', OLE()).ok, 'legacy Word');
  truthy(up('بيانات.csv', 'application/vnd.ms-excel', b64('الاسم,المبلغ\r\nأحمد,10\r\n')).ok, 'CSV declared as Excel by Windows');
  truthy(up('ملاحظات.txt', 'text/plain', b64('سطر أول\nسطر ثانٍ')).ok);
  truthy(up('صورة.png', '', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==').ok, 'image type from the extension when the browser sends none');
  truthy(up('ماكرو.docx', '', DOCM_AS_DOCX).error.message.includes('ماكرو'));
  truthy(up('ماكرو.xls', '', OLE('_VBA_PROJECT')).error.message.includes('ماكرو'));
  truthy(up('مزيف.docx', '', XLSX).error.message.includes('DOCX'), 'a workbook renamed to docx');
  truthy(up('مزيف.xlsx', '', PDF).error.message.includes('XLSX'));
  truthy(up('ثنائي.txt', 'text/plain', b64(Buffer.from([0x4d, 0x5a, 0x00, 0x01]))).error.message.includes('TXT'));
  truthy(up('برنامج.exe', 'application/x-msdownload', b64('MZ')).error.message.includes('غير مسموح'));
  truthy(up('ماكرو.docm', '', DOCX).error.message.includes('غير مسموح'));
  truthy(up('كبير.pdf', 'application/pdf', 'A'.repeat(Math.ceil(26 * 1024 * 1024 * 4 / 3))).error.message.includes('25 ميجابايت'));
  const files = c.ok('cor.get', { id: d.id }, c.T.sara).files;
  eq(files.map((f) => [f.fileName.split('_').pop(), f.hasPreview]), [['عرض.xlsx', true], ['قديم.doc', true], ['بيانات.csv', true], ['ملاحظات.txt', true], ['صورة.png', false]]);
  eq(files[2].mimeType, 'text/csv');
  // بقية الوحدات على حالها: صور و PDF حتى 10 ميجابايت
  const t = c.ok('tsk.save', { title: 'مهمة' }, c.T.sara);
  truthy(c.call('tsk.file.upload', { taskId: t.id, fileName: 'a.docx', mimeType: '', data: DOCX }, c.T.sara).error.message.includes('غير مسموح'));
});

test('documents: when Drive cannot convert, the original stays downloadable without a preview', () => {
  const c = setup();
  c.gas.state.driveConvertFails = true;
  const d = c.ok('cor.save', { direction: 'in', subject: 'x', party: 'y', date: SUN }, c.T.sara);
  const f = c.ok('cor.file.upload', { letterId: d.id, fileName: 'a.docx', mimeType: '', data: DOCX }, c.T.sara);
  eq(f.hasPreview, false);
  eq(c.ok('cor.file.content', { id: f.id }, c.T.sara).data, DOCX);
});

test('storage: the system admin sees Drive usage, and is alerted once a month at 80% and 95%', () => {
  const c = setup();
  eq(c.fail('system.storage', {}, c.T.huda).code, 'FORBIDDEN');
  const s = c.ok('system.storage', {}, c.A);
  eq([s.limit, s.warnAt, s.percent < 1], [15 * 1024 ** 3, 80, true]);
  const alerts = () => c.ok('notify.list', {}, c.A).items.filter((x) => x.title.includes('مساحة Google Drive'));
  c.srv.dailyMaintenance();
  eq(alerts().length, 0);
  c.gas.state.driveLimit = 1000;
  c.gas.state.driveExtraUsed = 850;
  c.srv.dailyMaintenance();
  c.srv.dailyMaintenance();
  eq(alerts().length, 1, 'once per level per month');
  c.gas.state.driveExtraUsed = 990;
  c.srv.dailyMaintenance();
  eq(alerts().length, 2, 'again at 95%');
  eq(c.ok('notify.list', {}, c.T.huda).items.some((x) => x.title.includes('مساحة')), false, 'only the system admin');
});
