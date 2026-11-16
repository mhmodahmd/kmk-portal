/**
 * فحص الترجمة الإنجليزية: npm run i18n:check
 * يجمع نصوص tr() في الواجهة، والنصوص العربية في الخادم (رسائل وتسميات)، ويطبع ما لا ترجمة له في src/lib/i18n-en.ts.
 * --json يطبع الناقص بصيغة JSON (للإضافة إلى القاموس).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(WEB, 'package.json'));
const ts = require('typescript');
const AR = /[؀-ۿ]/;
const walk = (d) => fs.readdirSync(d).flatMap((n) => { const p = path.join(d, n); return fs.statSync(p).isDirectory() ? walk(p) : [p]; });

/** نصوص tr('...') في الواجهة */
function uiKeys() {
  const keys = new Set();
  for (const f of walk(path.join(WEB, 'src')).filter((x) => /\.tsx?$/.test(x))) {
    const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (n) => {
      if (ts.isCallExpression(n) && n.expression.getText() === 'tr' && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) keys.add(n.arguments[0].text);
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return keys;
}

/**
 * نصوص الخادم: الثابتة كما هي، والمركّبة بـ + قوالب {0}.
 * ما لا يُعرض للمستخدم (تفقيط، أسماء ملفات، قوالب بريد، سجلات المحرر) يُستثنى بتعليق:
 * «// i18n:line» في نهاية السطر، أو «// i18n:off» … «// i18n:on» حول كتلة.
 */
function ignoredRanges(text) {
  const ranges = [];
  let off = -1;
  const lines = text.split('\n');
  let pos = 0;
  for (const line of lines) {
    if (line.includes('i18n:off')) off = pos;
    else if (line.includes('i18n:on') && off >= 0) { ranges.push([off, pos + line.length]); off = -1; }
    else if (line.includes('i18n:line')) ranges.push([pos, pos + line.length]);
    pos += line.length + 1;
  }
  if (off >= 0) ranges.push([off, text.length]);
  return ranges;
}

function serverKeys() {
  const exact = new Set(), patterns = new Set();
  const dirs = ['core', 'modules'].map((d) => path.join(WEB, '..', 'server', d));
  for (const f of dirs.flatMap(walk).filter((x) => x.endsWith('.js') && !x.includes('Vectors'))) {
    const text = fs.readFileSync(f, 'utf8');
    const ignored = ignoredRanges(text);
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const skip = (n) => { const p = n.getStart(sf); return ignored.some(([a, b]) => p >= a && p <= b); };
    const visit = (n) => {
      if (skip(n)) return;
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken && !(ts.isBinaryExpression(n.parent) && n.parent.operatorToken.kind === ts.SyntaxKind.PlusToken)) {
        const parts = [];
        const flat = (x) => {
          if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken) { flat(x.left); flat(x.right); }
          else if (ts.isParenthesizedExpression(x) && ts.isBinaryExpression(x.expression) && x.expression.operatorToken.kind !== ts.SyntaxKind.PlusToken) parts.push(null);
          else parts.push(ts.isStringLiteralLike(x) ? x.text : null);
        };
        flat(n);
        if (parts.some((p) => p && AR.test(p))) {
          let key = '', i = 0;
          parts.forEach((p) => { if (p === null) key += '{' + i++ + '}'; else key += p; });
          if (i) patterns.add(key.replace(/\}\{\d+\}/g, '}'));
          else exact.add(key);
        }
      }
      if (ts.isStringLiteralLike(n) && AR.test(n.text) && !(ts.isBinaryExpression(n.parent) && n.parent.operatorToken.kind === ts.SyntaxKind.PlusToken)) exact.add(n.text);
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { exact, patterns };
}

const src = fs.readFileSync(path.join(WEB, 'src/lib/i18n-en.ts'), 'utf8');
const mod = await import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText).toString('base64'));
const EN = mod.default, PAT = mod.EN_PATTERNS;
const ui = uiKeys(), srv = serverKeys();
const missing = { ui: [...ui].filter((k) => !EN[k]), server: [...srv.exact].filter((k) => !EN[k]), patterns: [...srv.patterns].filter((k) => !PAT[k]) };
if (process.argv.includes('--json')) console.log(JSON.stringify(missing, null, 1));
else {
  console.log(`الواجهة: ${ui.size} نص، ناقص ${missing.ui.length} · الخادم: ${srv.exact.size} نص، ناقص ${missing.server.length} · قوالب الخادم: ${srv.patterns.size}، ناقص ${missing.patterns.length}`);
  [...missing.ui, ...missing.server, ...missing.patterns].slice(0, 40).forEach((k) => console.log('  ✗ ' + k));
  if (missing.ui.length) process.exitCode = 1;
}
