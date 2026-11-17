/**
 * قراءة جدول من ملف Excel (.xlsx) أو CSV في المتصفح، دون مكتبات: الملف مضغوط ZIP يُفك بـ DecompressionStream،
 * وتُقرأ أول ورقة فيه صفوفاً من النصوص. يكفي لملفات التصدير البسيطة (ملف بوابة الدفع مثلاً).
 */

/** يعيد صفوف أول ورقة: string[][] (الخلايا الفارغة نصوص فارغة) */
export async function readTable(file: File): Promise<string[][]> {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return parseCsv(await file.text());
  const zip = await unzip(await file.arrayBuffer());
  const text = async (name: string) => (zip[name] ? new TextDecoder().decode(await zip[name]()) : '');
  const sheetPath = await firstSheet(text, Object.keys(zip));
  if (!sheetPath) throw new Error('bad-xlsx');
  const shared = parseShared(await text('xl/sharedStrings.xml'));
  return parseSheet(await text(sheetPath), shared);
}

type Entry = () => Promise<Uint8Array>;

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf: ArrayBuffer): Promise<Record<string, Entry>> {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('bad-xlsx');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out: Record<string, Entry> = {};
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('bad-xlsx');
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    out[name] = async () => {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const raw = u8.subarray(start, start + size);
      if (method === 0) return raw;
      if (method === 8) return inflate(raw);
      throw new Error('bad-xlsx');
    };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');

async function firstSheet(text: (n: string) => Promise<string>, names: string[]) {
  try {
    const wb = xml(await text('xl/workbook.xml'));
    const rid = wb.getElementsByTagName('sheet')[0]?.getAttribute('r:id');
    const rels = xml(await text('xl/_rels/workbook.xml.rels')).getElementsByTagName('Relationship');
    for (const r of Array.from(rels)) {
      if (r.getAttribute('Id') === rid) {
        const t = r.getAttribute('Target') || '';
        const path = t.startsWith('/') ? t.slice(1) : 'xl/' + t;
        if (names.includes(path)) return path;
      }
    }
  } catch { /* نكمل بالبديل */ }
  return names.filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort()[0] || '';
}

function parseShared(s: string): string[] {
  if (!s) return [];
  return Array.from(xml(s).getElementsByTagName('si')).map((si) => Array.from(si.getElementsByTagName('t')).map((t) => t.textContent || '').join(''));
}

function colIndex(ref: string) {
  const letters = /^[A-Z]+/.exec(ref)?.[0] || 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** رقم Excel ← نص بلا كسور عائمة (6 ← "6"، 2.5000000001 ← "2.5") */
const num = (v: string) => { const n = Number(v); return Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : v; };

function parseSheet(s: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const r of Array.from(xml(s).getElementsByTagName('row'))) {
    const row: string[] = [];
    for (const c of Array.from(r.getElementsByTagName('c'))) {
      const i = colIndex(c.getAttribute('r') || '');
      const t = c.getAttribute('t');
      const vEl = c.getElementsByTagName('v')[0];
      let val = '';
      if (t === 's') val = shared[Number(vEl?.textContent)] ?? '';
      else if (t === 'inlineStr') val = Array.from(c.getElementsByTagName('t')).map((x) => x.textContent || '').join('');
      else if (t === 'str' || t === 'b' || t === 'e') val = vEl?.textContent || '';
      else val = vEl ? num(vEl.textContent || '') : '';
      while (row.length < i) row.push('');
      row[i] = val.trim();
    }
    rows.push(row);
  }
  return rows;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some(Boolean));
}
