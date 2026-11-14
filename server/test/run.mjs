/**
 * تشغيل اختبارات الخادم: node server/test/run.mjs
 */
import { runAll } from './harness.mjs';
import './core.test.mjs';
import './phase1.test.mjs';
import './device.test.mjs';
import './migration.test.mjs';
import './custody.test.mjs';

await runAll();
