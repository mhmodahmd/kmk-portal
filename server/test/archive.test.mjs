/**
 * المرحلة 6: الأرشيف التاريخي — الاستيراد ملفاً بملف مع استخراج النص، التدقيق والاعتماد، الإخفاء من القوائم العادية،
 * صلاحية الموظفين بإذن المدير، والبحث في نص الملفات.
 */
import { eq, test, truthy } from './harness.mjs';
import { company, at, SUN } from './phase1.test.mjs';

const pdf = (text) => Buffer.from('%PDF-1.4\n' + text + '\n%%EOF\n').toString('base64');
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26), Buffer.from('[Content_Types].xml\nword/document.xml')]).toString('base64');

function setup() {
  const c = company(at(SUN, '07:00'));
  const users = c.ok('users.list', {}, c.A).users;
  const uid = (u) => users.find((x) => x.username === u).id;
  c.ok('users.setRoles', { id: uid('ahmad'), roles: { correspondence: 'clerk' } }, c.A);
  c.ok('users.setRoles', { id: uid('sara'), roles: { correspondence: 'clerk' } }, c.A);
  c.ok('users.setRoles', { id: uid('huda'), roles: { attendance: 'hr', hr: 'hr', correspondence: 'manager' } }, c.A);
  return c;
}

test('archive: only the manager imports until clerks are allowed; each PDF becomes an archived historical document with OCR text', () => {
  const c = setup();
  const up = (tok, meta = {}, text = 'Contract with Al Ofuq for maintenance', fileName = 'عقد الأفق.pdf') => c.call('cor.archive.import', { fileName, mimeType: 'application/pdf', data: pdf(text), meta }, tok);
  eq(up(c.T.ahmad).error.code, 'FORBIDDEN');
  eq(c.ok('cor.lookups', {}, c.T.ahmad).canArchive, false);
  eq(c.fail('cor.archive.settings.save', { archiveClerks: true }, c.T.ahmad).code, 'FORBIDDEN');
  c.ok('cor.archive.settings.save', { archiveClerks: true }, c.T.huda);
  eq(c.ok('cor.lookups', {}, c.T.ahmad).canArchive, true);
  const a = up(c.T.ahmad, { originalNo: '45/ص/2019', date: '2019-05-01', party: 'شركة الأفق' }).data;
  eq([a.number, a.status, a.originalNo === undefined, a.hasMainFile, a.subject], ['ARC-2019-0001', 'archived', true, true, 'Contract with Al Ofuq for maintenance'], 'subject suggested from the OCR text');
  const g = c.ok('cor.get', { id: a.id }, c.T.ahmad);
  eq([g.main.version, g.letter.typeCode], [1, 'IN']);
  truthy(c.call('cor.archive.import', { fileName: 'عقد.docx', mimeType: '', data: DOCX, meta: {} }, c.T.ahmad).error.message.includes('PDF'));
  truthy(up(c.T.ahmad, { date: '2019-13-40' }).error.message.includes('تاريخ'));
  const b = up(c.T.huda, { subject: 'تعميم قديم', date: '2018-02-10' }, 'Circular about working hours').data;
  eq(b.number, 'ARC-2018-0001');
  // مخفية من القوائم العادية والإحصاءات
  eq(c.ok('cor.list', { withArchived: true }, c.T.huda).length, 0);
  eq(c.ok('cor.report', { year: '2019' }, c.T.huda).total, 0);
  const list = c.ok('cor.archive.list', { review: 'pending' }, c.T.huda);
  eq([list.total, list.pending, list.rows.map((r) => r.number), list.rows[0].ocrText.includes('Circular')], [2, 2, ['ARC-2019-0001', 'ARC-2018-0001'], false]);
  eq(c.ok('cor.archive.list', { q: '45/ص' }, c.T.huda).rows.map((r) => r.number), ['ARC-2019-0001']);
  eq(c.ok('cor.archive.list', { pageSize: 5, page: 2 }, c.T.huda).rows.length, 0);
});

test('archive: review fixes the details and approves; text search finds documents by the words in their files', () => {
  const c = setup();
  const a = c.ok('cor.archive.import', { fileName: 'عقد.pdf', mimeType: 'application/pdf', data: pdf('Maintenance contract Al Ofuq 2019'), meta: { date: '2019-05-01' } }, c.T.huda);
  truthy(c.fail('cor.archive.review', { id: a.id, subject: '', date: '2019-05-01' }, c.T.huda).message.includes('الموضوع'));
  eq(c.fail('cor.archive.review', { id: a.id, subject: 'x', date: '2019-05-01' }, c.T.ahmad).code, 'FORBIDDEN');
  const r = c.ok('cor.archive.review', { id: a.id, subject: 'عقد صيانة مع شركة الأفق', date: '2019-05-03', party: 'شركة الأفق', originalNo: '45/2019', category: 'تعاقدي' }, c.T.huda);
  eq([r.subject, r.date, r.party, r.category], ['عقد صيانة مع شركة الأفق', '2019-05-03', 'شركة الأفق', 'تعاقدي']);
  eq(c.ok('cor.archive.list', { review: 'pending' }, c.T.huda).total, 0);
  eq(c.ok('cor.archive.list', { review: 'done' }, c.T.huda).rows[0].reviewStatus, 'done');
  // البحث في النص: الأرشيف ومستند عادي بملفه، ضمن ما يطّلع عليه المستخدم
  const memo = c.ok('cor.types', {}, c.T.huda).find((t) => t.code === 'MEMO');
  const d = c.ok('cor.save', { typeId: memo.id, subject: 'مذكرة', date: SUN }, c.T.ahmad);
  c.ok('cor.file.upload', { letterId: d.id, role: 'main', fileName: 'm.pdf', mimeType: 'application/pdf', data: pdf('Ofuq renewal request') }, c.T.ahmad);
  eq(c.ok('cor.search.text', { q: 'Ofuq' }, c.T.huda).map((x) => [x.number, x.historical]).sort(), [['ARC-2019-0001', true], ['MEMO-2026-0001', false]]);
  eq(c.ok('cor.search.text', { q: 'Ofuq' }, c.T.ahmad).map((x) => x.number), ['MEMO-2026-0001'], 'the archive item is internal: not his');
  eq(c.ok('cor.search.text', { q: 'Ofuq' }, c.T.sara).length, 0);
  truthy(c.fail('cor.search.text', { q: 'x' }, c.T.huda).message.includes('للبحث'));
  eq(c.ok('cor.search.text', { q: 'nothing-like-this' }, c.T.huda).length, 0);
});
