#!/usr/bin/env node
// Compile content/*.yaml -> app/data/content.json, validate it, and stamp the service worker.
//   node scripts/build.mjs          build
//   node scripts/build.mjs --check  validate only (CI)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import * as OpenCC from 'opencc-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
const APP = join(ROOT, 'app');
const checkOnly = process.argv.includes('--check');

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const readYaml = (p) => parse(readFileSync(p, 'utf8'));
const yamlFiles = (dir) =>
  readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort().map((f) => join(dir, f));

// ---------- load ----------
const lists = readYaml(join(CONTENT, 'lists.yaml'));
const terms = [];
for (const f of yamlFiles(join(CONTENT, 'terms'))) {
  const arr = readYaml(f) || [];
  for (const t of arr) terms.push({ ...t, _file: relative(ROOT, f) });
}
const comparisons = yamlFiles(join(CONTENT, 'comparisons')).map((f) => ({ ...readYaml(f), _file: relative(ROOT, f) }));

// ---------- validate ----------
const termIds = new Set();
const REQUIRED_TERM = ['id', 'skt', 'zh', 'en', 'short_zh', 'short_en'];
const REF_RE = /^[A-Z]+\d+n\w+_p\d{4}[a-z]\d{2}$/;

function checkQuotes(owner, quotes = []) {
  for (const q of quotes) {
    if (!q.text) err(`${owner}: quote without text`);
    if (!q.source) err(`${owner}: quote without source`);
    if (!REF_RE.test(q.ref || '')) err(`${owner}: bad or missing CBETA ref "${q.ref}"`);
    if (q.refEnd && !REF_RE.test(q.refEnd)) err(`${owner}: bad refEnd "${q.refEnd}"`);
  }
}

for (const t of terms) {
  const where = `${t._file} (${t.id || '?'})`;
  for (const k of REQUIRED_TERM) if (!t[k]) err(`${where}: missing ${k}`);
  if (termIds.has(t.id)) err(`${where}: duplicate term id`);
  termIds.add(t.id);
  if (!/^[a-z0-9-]+$/.test(t.id || '')) err(`${where}: id must be lowercase ascii/hyphens`);
  if (!t.detail_zh || !t.detail_en) warn(`${where}: no detail_zh/detail_en`);
  if (!t.quotes?.length) warn(`${where}: no scripture quotes`);
  checkQuotes(where, t.quotes);
  for (const k of ['zhAlt', 'enAlt', 'related', 'compare']) if (t[k] && !Array.isArray(t[k])) err(`${where}: ${k} must be a list`);
}

const listIds = new Set();
const inList = new Set();
for (const l of lists) {
  if (listIds.has(l.id)) err(`lists.yaml: duplicate list ${l.id}`);
  listIds.add(l.id);
  for (const id of [l.head, ...(l.items || [])].filter(Boolean)) {
    if (!termIds.has(id)) err(`lists.yaml (${l.id}): unknown term ${id}`);
    inList.add(id);
  }
}
for (const t of terms) if (!inList.has(t.id)) warn(`${t._file} (${t.id}): not in any list, so it will never be introduced`);

const cmpIds = new Set();
for (const c of comparisons) {
  const where = `${c._file} (${c.id})`;
  if (cmpIds.has(c.id)) err(`${where}: duplicate comparison id`);
  cmpIds.add(c.id);
  for (const k of ['title_zh', 'title_en', 'summary_zh', 'summary_en']) if (!c[k]) err(`${where}: missing ${k}`);
  for (const id of c.terms || []) if (!termIds.has(id)) err(`${where}: unknown term ${id}`);
  checkQuotes(where, c.quotes);
  if (c.table) {
    const n = c.table.columns.length;
    const cellOk = (x, what) => {
      const keys = Object.keys(x || {});
      if (typeof x?.zh !== 'string' || typeof x?.en !== 'string' || keys.some((k) => k !== 'zh' && k !== 'en'))
        err(`${where}: ${what} must be exactly {zh, en} strings (unquoted comma in a flow map?): ${JSON.stringify(x)}`);
    };
    c.table.columns.forEach((x, i) => cellOk(x, `column ${i + 1}`));
    for (const r of c.table.rows) {
      cellOk(r.label, 'row label');
      if (r.cells.length !== n) err(`${where}: table row "${r.label?.zh}" has ${r.cells.length} cells, expected ${n}`);
      r.cells.forEach((x) => cellOk(x, `cell in row "${r.label?.zh}"`));
    }
  }
  (c.questions || []).forEach((q, i) => {
    for (const o of q.options || []) {
      if (typeof o?.zh !== 'string' || typeof o?.en !== 'string' || Object.keys(o).length !== 2) err(`${where} q${i + 1}: option must be {zh, en}: ${JSON.stringify(o)}`);
    }
  });
  (c.questions || []).forEach((q, i) => {
    if (!q.q_zh || !q.q_en) err(`${where} q${i + 1}: missing q_zh/q_en`);
    if (q.type === 'mcq') {
      if (!Array.isArray(q.options) || q.options.length < 2) err(`${where} q${i + 1}: needs options`);
      else if (!(q.answer >= 0 && q.answer < q.options.length)) err(`${where} q${i + 1}: answer index out of range`);
    } else if (q.type === 'tf') {
      if (typeof q.answer !== 'boolean') err(`${where} q${i + 1}: tf answer must be true/false`);
    } else err(`${where} q${i + 1}: unknown type ${q.type}`);
  });
}
for (const t of terms) {
  for (const id of t.related || []) if (!termIds.has(id)) err(`${t._file} (${t.id}): related term ${id} not found`);
  for (const id of t.compare || []) if (!cmpIds.has(id)) err(`${t._file} (${t.id}): comparison ${id} not found`);
}

warnings.forEach((w) => console.warn('⚠︎', w));
if (errors.length) {
  errors.forEach((e) => console.error('✗', e));
  console.error(`\n${errors.length} error(s)`);
  process.exit(1);
}
console.log(`✓ ${terms.length} terms, ${lists.length} lists, ${comparisons.length} comparisons, ${terms.reduce((n, t) => n + (t.quotes?.length || 0), 0)} quotes`);
if (checkOnly) process.exit(0);

// ---------- simplified -> traditional map for typed answers ----------
const toSimp = OpenCC.Converter({ from: 'tw', to: 'cn' });
const s2t = {};
for (const t of terms) {
  for (const w of [t.zh, ...(t.zhAlt || [])]) {
    for (const ch of w) {
      const s = toSimp(ch);
      if (s !== ch && s.length === 1) s2t[s] = ch;
    }
  }
}

// ---------- write ----------
// Pronunciation recordings: app/audio/<id>.mp3 (generated by scripts/audio/, see README).
import { existsSync } from 'node:fs';
const audioDir = join(APP, 'audio');
let withAudio = 0;
for (const t of terms) {
  t.audio = existsSync(join(audioDir, `${t.id}.mp3`));
  if (t.audio) withAudio++;
}
console.log(`✓ ${withAudio}/${terms.length} terms have pronunciation audio`);
const strip = ({ _file, ...rest }) => rest;
const body = { lists, terms: terms.map(strip), comparisons: comparisons.map(strip), s2t };
const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 10);
const out = { version, ...body };
writeFileSync(join(APP, 'data', 'content.json'), JSON.stringify(out));
console.log(`✓ wrote app/data/content.json (version ${version})`);

// ---------- service worker: precache list + version stamp ----------
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(APP)
  .map((p) => relative(APP, p).split('\\').join('/'))
  .filter((p) => p !== 'sw.js' && !p.endsWith('.DS_Store') && !p.startsWith('icons/src'))
  .sort();
const hash = createHash('sha256');
for (const f of files) if (f !== 'data/content.json') hash.update(f).update(readFileSync(join(APP, f)));
hash.update(version);
const swVersion = hash.digest('hex').slice(0, 10);
const swPath = join(APP, 'sw.js');
const sw = readFileSync(swPath, 'utf8')
  .replace(/const VERSION = '.*?';/, `const VERSION = '${swVersion}';`)
  .replace(/const FILES = \[[\s\S]*?\];/, `const FILES = ${JSON.stringify(['./', ...files], null, 2)};`);
writeFileSync(swPath, sw);
console.log(`✓ stamped sw.js (version ${swVersion}, ${files.length} files)`);
