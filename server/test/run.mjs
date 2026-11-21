/**
 * تشغيل اختبارات الخادم: node server/test/run.mjs
 */
import { runAll } from './harness.mjs';
import './core.test.mjs';
import './phase1.test.mjs';
import './device.test.mjs';
import './migration.test.mjs';
import './custody.test.mjs';
import './files.test.mjs';
import './tasks.test.mjs';
import './notify.test.mjs';
import './crm.test.mjs';
import './jobs.test.mjs';
import './correspondence.test.mjs';
import './documents.test.mjs';
import './workflow.test.mjs';
import './workflow3.test.mjs';
import './signature.test.mjs';
import './workflow5.test.mjs';
import './archive.test.mjs';
import './platforms.test.mjs';
import './subscribers.test.mjs';
import './dashboards.test.mjs';

await runAll();
