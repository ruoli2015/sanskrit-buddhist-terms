#!/usr/bin/env node
// CBETA helper: find passages, fetch lines, and verify every quote in content/ against the canon.
//
//   node scripts/cbeta.mjs search <phrase>            which works/fascicles contain the phrase
//   node scripts/cbeta.mjs kwic <phrase> <work> <juan> line numbers + context, e.g. kwic 六思身 T0099 2
//   node scripts/cbeta.mjs lines <linehead> [count]   print lines, e.g. lines T02n0099_p0009c08 4
//   node scripts/cbeta.mjs verify                     check all quotes in content/**/*.yaml

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://cbdata.dila.edu.tw/stable';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function api(path, params) {
  const url = `${API}/${path}?${new URLSearchParams(params)}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt >= 2) throw new Error(`${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

const stripHtml = (s) => s.replace(/<[^>]+>/g, '');
// Compare characters only: drop punctuation, whitespace, quote marks and ellipses.
export const normalize = (s) =>
  s.replace(/[\s\p{P}\p{S}]/gu, '');

// Linehead like T02n0099_p0009c08 -> the following line (same page/column not required).
export async function fetchLines(start, end) {
  const params = end ? { linehead_start: start, linehead_end: end } : { linehead: start };
  const data = await api('lines', params);
  return data.results.map((r) => ({ linehead: r.linehead, text: stripHtml(r.html) }));
}

async function fetchCount(start, count) {
  // The API takes a range; ask for up to two pages ahead and keep the first `count` lines.
  const m = start.match(/^(.+_p)(\d{4})[a-z]\d{2}$/);
  if (!m) throw new Error(`bad linehead ${start}`);
  const end = `${m[1]}${String(+m[2] + 2).padStart(4, '0')}c99`;
  const lines = await fetchLines(start, end);
  return lines.slice(0, count);
}

function* walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (f.endsWith('.yaml') || f.endsWith('.yml')) yield p;
  }
}

async function collectQuotes() {
  const { parse } = await import('yaml');
  const quotes = [];
  const visit = (node, where) => {
    if (Array.isArray(node)) node.forEach((n, i) => visit(n, `${where}[${i}]`));
    else if (node && typeof node === 'object') {
      if (Array.isArray(node.quotes)) {
        for (const q of node.quotes) quotes.push({ ...q, where: `${where}${node.id ? ` (${node.id})` : ''}` });
      }
      for (const [k, v] of Object.entries(node)) if (k !== 'quotes') visit(v, where);
    }
  };
  for (const file of walk(join(ROOT, 'content'))) visit(parse(readFileSync(file, 'utf8')), file.slice(ROOT.length + 1));
  return quotes;
}

export async function verifyQuote(q) {
  if (!q.ref) return { ok: false, reason: 'missing ref' };
  const lines = await fetchLines(q.ref, q.refEnd || q.ref);
  if (!lines.length) return { ok: false, reason: `no lines for ${q.ref}..${q.refEnd || ''}` };
  const canon = normalize(lines.map((l) => l.text).join(''));
  // An ellipsis (…… or ...) in the quote marks an omission: each segment must appear, in order.
  const segments = q.text.split(/……|\.\.\.|…/).map(normalize).filter(Boolean);
  let pos = 0;
  for (const seg of segments) {
    const at = canon.indexOf(seg, pos);
    if (at < 0) return { ok: false, reason: `segment not found: ${seg}`, canon };
    pos = at + seg.length;
  }
  return { ok: true };
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'search') {
    const data = await api('search', { q: args[0], rows: args[1] || 30 });
    console.log(`found in ${data.num_found} fascicles`);
    for (const r of data.results) console.log(`${r.work}\t卷${r.juan}\t${r.title}\t${r.byline}\thits=${r.term_hits}`);
  } else if (cmd === 'kwic') {
    const [q, work, juan] = args;
    const data = await api('search/kwic', { q, work, juan, around: 30 });
    for (const r of data.results) console.log(`${r.vol}n${work.slice(1)}_p${r.lb}\t${r.kwic}`);
  } else if (cmd === 'lines') {
    const lines = await fetchCount(args[0], +(args[1] || 1));
    for (const l of lines) console.log(`${l.linehead}\t${l.text}`);
  } else if (cmd === 'verify') {
    const quotes = await collectQuotes();
    let bad = 0;
    for (const q of quotes) {
      let r;
      try { r = await verifyQuote(q); } catch (e) { r = { ok: false, reason: e.message }; }
      if (!r.ok) {
        bad++;
        console.log(`✗ ${q.where}  ${q.ref}\n   ${r.reason}${r.canon ? `\n   canon: ${r.canon}` : ''}`);
      } else console.log(`✓ ${q.ref}  ${q.text.slice(0, 30)}`);
    }
    console.log(`\n${quotes.length - bad}/${quotes.length} quotes verified`);
    process.exit(bad ? 1 : 0);
  } else {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 8).join('\n'));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
