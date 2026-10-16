#!/usr/bin/env node
// Check every Xuanzang quote in an audiobook script against CBETA (punctuation and verse numbers ignored).
//   node scripts/audiobook/verify-quotes.mjs private/audiobooks/<id>
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const CBETA = join(dirname(fileURLToPath(import.meta.url)), '..', 'cbeta.mjs');
const book = parse(readFileSync(join(process.argv[2], 'script.yaml'), 'utf8'));
const norm = (s) => s.replace(/[^\p{Script=Han}]/gu, '');
const lineNo = (ref) => { const m = /_p(\d{4})([a-z])(\d{2})$/.exec(ref); return [m[1] + m[2], +m[3]]; };
let bad = 0;
for (const sec of book.sections) for (const v of sec.verses) for (const q of v.xuanzang || []) {
  const [pa, a] = lineNo(q.ref), [pb, b] = lineNo(q.refEnd || q.ref);
  const n = pa === pb ? b - a + 1 : b + 30; // across a column break: fetch generously
  const out = execFileSync('node', [CBETA, 'lines', q.ref, String(n)], { encoding: 'utf8' });
  const lines = out.trim().split('\n').map((l) => l.split('\t'));
  const end = lines.findIndex(([r]) => r === (q.refEnd || q.ref));
  const canon = norm(lines.slice(0, end + 1).map((l) => l[1]).join(''));
  const ok = canon.includes(norm(q.text));
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} v${v.n} ${q.ref} ${q.text}${ok ? '' : `\n   canon: ${canon}`}`);
}
process.exit(bad ? 1 : 0);
