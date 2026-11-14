/**
 * أدوات الاختبار: تحميل الخادم في المحاكي، واستدعاء الإجراءات كما تفعل الواجهة.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClock, createGas, loadServer } from './gas-emulator.js';

const SERVER = fileURLToPath(new URL('..', import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function serverSources() {
  return ['core', 'modules'].flatMap((d) => walk(join(SERVER, d)))
    .filter((p) => p.endsWith('.js'))
    .map((p) => ({ path: relative(SERVER, p).replace(/\\/g, '/'), code: readFileSync(p, 'utf8') }));
}

/** خادم جديد ببيانات فارغة */
export function boot(startAt = '2026-11-15T05:00:00Z') {
  const clock = createClock();
  clock.set(startAt);
  const gas = createGas({ clock, log: process.env.DEBUG ? console.log : undefined });
  const srv = loadServer(serverSources(), gas.globals);
  const call = (action, payload = {}, token = '') => srv.Router.handle({ action, payload, token, v: '9.9.9' });
  /** يستدعي ويتوقع النجاح */
  const ok = (action, payload, token) => {
    const r = call(action, payload, token);
    if (!r.ok) throw new Error(`${action} failed: ${r.error.code} ${r.error.message}`);
    return r.data;
  };
  /** يستدعي ويتوقع الفشل، ويعيد الخطأ */
  const fail = (action, payload, token) => {
    const r = call(action, payload, token);
    if (r.ok) throw new Error(`${action} should have failed but returned ${JSON.stringify(r.data).slice(0, 200)}`);
    return r.error;
  };
  return { gas, clock, srv, call, ok, fail };
}

// ───────── إطار اختبار صغير ─────────
const tests = [];
export function test(name, fn) { tests.push({ name, fn }); }

export function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}
export function truthy(v, msg = 'expected truthy') { if (!v) throw new Error(msg); }

export async function runAll() {
  let pass = 0;
  const failed = [];
  for (const t of tests) {
    try { await t.fn(); pass++; process.stdout.write('.'); }
    catch (e) { failed.push({ name: t.name, e }); process.stdout.write('F'); }
  }
  console.log(`\n${pass} passed, ${failed.length} failed`);
  failed.forEach(({ name, e }) => console.log(`\n✗ ${name}\n  ${e.stack || e}`));
  if (failed.length) process.exit(1);
}
