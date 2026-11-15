import { eq, test, truthy } from './harness.mjs';
import { company, at, SUN } from './phase1.test.mjs';

test('jobs: triggers are installed once when the system admin signs in; status lists them', () => {
  const c = company(at(SUN, '07:00'));
  c.ok('auth.me', {}, c.T.sara);
  eq(c.gas.triggers.length, 0, 'an ordinary user does not install anything');
  c.ok('auth.me', {}, c.A);
  eq(c.gas.triggers.map((t) => t.getHandlerFunction()).sort(), ['dailyMaintenance', 'processMailQueue'], 'installed when the system admin signs in');
  c.ok('auth.me', {}, c.A);
  eq(c.gas.triggers.length, 2, 'not duplicated');
  const st = c.ok('system.jobs', {}, c.A);
  eq([st.available, st.triggers.sort(), st.mailQueue], [true, ['dailyMaintenance', 'processMailQueue'], 0]);
  eq(c.fail('system.jobs', {}, c.T.sara).code, 'FORBIDDEN');
  eq(c.srv.installTriggers(), [], 'editor helper is idempotent');
});

test('backup: daily copy of every database into a Drive folder, kept 30 days', () => {
  const c = company(at(SUN, '07:00'));
  const out = c.ok('system.backup', {}, c.A);
  // في المحاكي لا تُنشأ ملفات الوحدات إلا عند أول استخدام؛ ما لم يُنشأ يُتخطّى
  eq(out.copied.slice(0, 2), ['core', 'hr']);
  eq(out.copied.length + out.skipped.length, 6);
  const n = out.copied.length;
  eq(out.day, '2026-11-15');
  const folder = c.gas.globals.DriveApp.getFolderById(c.gas.globals.PropertiesService.getScriptProperties().getProperty('BACKUP_FOLDER'));
  const names = () => { const it = folder.getFiles(); const a = []; while (it.hasNext()) a.push(it.next().getName()); return a.sort(); };
  eq(names().length, n);
  truthy(names().includes('KMK-hr-2026-11-15'));
  const again = c.ok('system.backup', {}, c.A);
  eq([again.copied, again.skipped.length], [[], 6], 'same day: nothing copied twice');
  eq(c.ok('system.jobs', {}, c.A).backup.last.day, '2026-11-15');
  eq(c.fail('system.backup', {}, c.T.sara).code, 'FORBIDDEN');

  c.clock.advance(31 * 86400000);
  const daily = c.srv.dailyMaintenance();
  eq(daily.backup.copied.length, n);
  eq(daily.backup.removed.length, n, 'the 31-day-old copies are trashed');
  eq(names().length, n, 'only the fresh copies remain');
  const log = c.ok('audit.list', { module: 'system' }, c.A);
  truthy(JSON.stringify(log).includes('backup.run'), 'manual backups are audited');
});
