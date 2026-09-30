#!/usr/bin/env node
// CBETA helper: find passages, fetch lines, and verify every quote in content/ against the canon.
//
//   node scripts/cbeta.mjs search <phrase>            which works/fascicles contain the phrase
//   node scripts/cbeta.mjs kwic <phrase> <work> <juan> line numbers + context, e.g. kwic 六思身 T0099 2
//   node scripts/cbeta.mjs lines <linehead> [count]   print lines, e.g. lines T02n0099_p0009c08 4
//   node scripts/cbeta.mjs verify                     check all quotes in content/**/*.yaml
//   node scripts/cbeta.mjs grab <work> <start> [end]  exact quote text + refs, e.g. grab T1585 觸謂三和 所依為業
//   node scripts/cbeta.mjs resolve [files...]         replace `grab:` quote stubs in content YAML with exact text + refs
//
// A quote stub in YAML looks like:   - grab: T1585 | 觸謂三和 | 所依為業
//                                      note_en: ...
// Optional extra fields after the phrases: `juan=3` (search only that fascicle), `at=<linehead>` (start there).

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
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

// Titles used for `source` / `source_en` when resolving stubs.
const WORKS = {
  T0001: ['長阿含經', 'Dīrghāgama'],
  T0026: ['中阿含經', 'Madhyamāgama'],
  T0099: ['雜阿含經', 'Saṃyuktāgama'],
  T0100: ['別譯雜阿含經', 'Saṃyuktāgama (alternative translation)'],
  T0125: ['增壹阿含經', 'Ekottarikāgama'],
  T0220: ['大般若波羅蜜多經', 'Mahāprajñāpāramitā-sūtra'],
  T0223: ['摩訶般若波羅蜜經', 'Pañcaviṃśatisāhasrikā Prajñāpāramitā'],
  T0235: ['金剛般若波羅蜜經', 'Vajracchedikā (Diamond Sūtra), tr. Kumārajīva'],
  T0251: ['般若波羅蜜多心經', 'Heart Sūtra, tr. Xuanzang'],
  T0262: ['妙法蓮華經', 'Lotus Sūtra, tr. Kumārajīva'],
  T0279: ['大方廣佛華嚴經', 'Avataṃsaka-sūtra (80 fasc.)'],
  T0353: ['勝鬘師子吼一乘大方便方廣經', 'Śrīmālādevī-sūtra'],
  T0278: ['大方廣佛華嚴經', 'Avataṃsaka-sūtra (60 fasc.)'],
  T0389: ['佛垂般涅槃略說教誡經', 'Sūtra of the Bequeathed Teaching (Yijiao jing)'],
  T0374: ['大般涅槃經', 'Mahāparinirvāṇa-sūtra (Dharmakṣema)'],
  T0475: ['維摩詰所說經', 'Vimalakīrti-nirdeśa, tr. Kumārajīva'],
  T0666: ['大方等如來藏經', 'Tathāgatagarbha-sūtra'],
  T0670: ['楞伽阿跋多羅寶經', 'Laṅkāvatāra-sūtra (Guṇabhadra)'],
  T0676: ['解深密經', 'Saṃdhinirmocana-sūtra'],
  T1509: ['大智度論', 'Dazhidu lun (*Mahāprajñāpāramitāśāstra)'],
  T1544: ['阿毘達磨發智論', 'Jñānaprasthāna'],
  T1545: ['阿毘達磨大毘婆沙論', 'Abhidharma-mahāvibhāṣā'],
  T1558: ['阿毘達磨俱舍論', 'Abhidharmakośabhāṣya'],
  T1562: ['阿毘達磨順正理論', 'Nyāyānusāra'],
  T1564: ['中論', 'Mūlamadhyamakakārikā, tr. Kumārajīva'],
  T1579: ['瑜伽師地論', 'Yogācārabhūmi'],
  T1585: ['成唯識論', 'Cheng weishi lun'],
  T1586: ['唯識三十論頌', 'Triṃśikā (Thirty Verses)'],
  T1590: ['唯識二十論', 'Viṃśikā (Twenty Verses)'],
  T1594: ['攝大乘論本', 'Mahāyānasaṃgraha, tr. Xuanzang'],
  T1600: ['辯中邊論', 'Madhyāntavibhāga'],
  T1602: ['顯揚聖教論', 'Xianyang shengjiao lun'],
  T1605: ['大乘阿毘達磨集論', 'Abhidharmasamuccaya'],
  T1606: ['大乘阿毘達磨雜集論', 'Abhidharmasamuccaya-vyākhyā'],
  T1612: ['大乘五蘊論', 'Pañcaskandhaka'],
  T1614: ['大乘百法明門論', 'Mahāyāna Hundred Dharmas Treatise'],
  T1666: ['大乘起信論', 'Awakening of Faith'],
};
const AGAMA_NUMBERED = new Set(['T0026', 'T0099', 'T0100']);

const juanCache = new Map();
async function findJuans(phrase, work) {
  const key = phrase + '|' + work;
  if (juanCache.has(key)) return juanCache.get(key);
  const data = await api('search', { q: phrase, rows: 1000 });
  const hits = data.results.filter((r) => r.work === work);
  const out = { juans: [...new Set(hits.map((r) => +r.juan))].sort((a, b) => a - b), single: hits[0] ? hits[0].juan_list === '1' : false, title: hits[0]?.title };
  juanCache.set(key, out);
  return out;
}

// Map each normalized character back to its index in the raw text.
function normIndex(raw) {
  const norm = [];
  const map = [];
  [...raw].forEach((ch, i) => {
    if (!/[\s\p{P}\p{S}]/u.test(ch)) { norm.push(ch); map.push(i); }
  });
  return { norm: norm.join(''), map };
}

async function sutraNumber(ref) {
  const m = ref.match(/^(.+_p)(\d{4})[a-z]\d{2}$/);
  const from = `${m[1]}${String(Math.max(1, +m[2] - 3)).padStart(4, '0')}a01`;
  const lines = await fetchLines(from, ref);
  const text = lines.map((l) => l.text).join('');
  const all = [...text.matchAll(/（([〇一二三四五六七八九]+)）/g)];
  if (!all.length) return null;
  return +[...all.at(-1)[1]].map((c) => '〇一二三四五六七八九'.indexOf(c)).join('');
}

/** Find `start` … `end` in a work and return the exact canonical text with its line references. */
export async function grab({ work, start, end, juan, at }) {
  const raws = [...(start + (end || '')).matchAll(/./gu)];
  if (!raws.length) throw new Error('empty phrase');
  let candidates = [];
  let info = { single: false };
  if (at) candidates.push({ lh: at, juan });
  else {
    info = await findJuans(start, work);
    const juans = juan ? [+juan] : info.juans;
    if (!juans.length) throw new Error(`"${start}" not found in ${work}`);
    for (const j of juans) {
      const k = await api('search/kwic', { q: start, work, juan: j });
      for (const r of k.results || []) candidates.push({ lh: `${r.vol}n${work.slice(1)}_p${r.lb}`, juan: j });
      if (candidates.length) break;
    }
  }
  const nStart = normalize(start);
  const nEnd = end ? normalize(end) : null;
  for (const c of candidates) {
    const lines = await fetchCount(c.lh, 30);
    let raw = '';
    const lineOf = [];
    for (const l of lines) { for (const _ of l.text) lineOf.push(l.linehead); raw += l.text; }
    const { norm, map } = normIndex(raw);
    const s = norm.indexOf(nStart);
    if (s < 0) continue;
    let eNorm;
    if (nEnd) {
      const e = norm.indexOf(nEnd, s + nStart.length - Math.min(nStart.length, nEnd.length));
      if (e < 0 || e - s > 600) continue;
      eNorm = e + nEnd.length - 1;
    } else {
      // No end phrase: run to the end of the sentence.
      const stop = raw.slice(map[s]).search(/[。？！]/);
      eNorm = norm.length - 1;
      if (stop >= 0) { const rawEnd = map[s] + stop; eNorm = map.findLastIndex((x) => x < rawEnd); }
    }
    let rs = map[s];
    let re = map[eNorm] + 1;
    // Keep closing punctuation right after the end (。；？！ and closing quotes).
    while (re < raw.length && /[。；？！」』]/.test(raw[re]) && re - map[eNorm] <= 3) re++;
    let text = raw.slice(rs, re).trim();
    // Balance quote marks: drop dangling closers/openers, use 『』 inside our 「」.
    const opens = (text.match(/「/g) || []).length, closes = (text.match(/」/g) || []).length;
    if (closes > opens) text = text.replace(/」(?=[^」]*$)/, '');
    if (opens > closes) text = text.replace(/「(?=[^「]*$)/, '');
    text = text.replace(/「/g, '『').replace(/」/g, '』');
    const ref = lineOf[rs];
    const refEnd = lineOf[re - 1];
    const juanNo = c.juan;
    const [zh, en] = WORKS[work] || [info.title || work, info.title || work];
    let source = `《${zh}》`;
    let source_en = en;
    if (juanNo && !info.single) { source += `卷${juanNo}`; source_en += `, fasc. ${juanNo}`; }
    if (AGAMA_NUMBERED.has(work)) {
      const n = await sutraNumber(ref).catch(() => null);
      if (n) { source += `（第${n}經）`; source_en += `, sūtra ${n}`; }
    }
    return { text, source, source_en, ref, ...(refEnd !== ref ? { refEnd } : {}) };
  }
  throw new Error(`could not locate "${start}"${end ? ` … "${end}"` : ''} in ${work}`);
}

function parseStub(stub) {
  const [work, start, end, ...rest] = String(stub).split('|').map((x) => x.trim());
  const opts = { work, start, end: end || undefined };
  for (const r of rest) {
    const [k, v] = r.split('=');
    if (k === 'juan') opts.juan = +v;
    if (k === 'at') opts.at = v;
  }
  return opts;
}

async function resolve(files) {
  const { parseDocument, visit, isMap } = await import('yaml');
  if (!files.length) files = [...walk(join(ROOT, 'content'))];
  let failed = 0, done = 0;
  const cachePath = join(ROOT, 'node_modules', '.cache-cbeta-grab.json');
  let cache = {};
  try { cache = JSON.parse(readFileSync(cachePath, 'utf8')); } catch {}
  for (const file of files) {
    // Plain one-line values containing ": " or " #" are invalid YAML; wrap them in single quotes.
    const src = readFileSync(file, 'utf8').split('\n').map((line) => {
      const m = line.match(/^(\s*(?:- )?[A-Za-z_]+: )(.+)$/);
      if (!m || /^['"|>\[{]/.test(m[2]) || !(/: /.test(m[2]) || / #/.test(m[2]))) return line;
      return m[1] + "'" + m[2].replace(/'/g, "''") + "'";
    }).join('\n');
    const doc = parseDocument(src);
    if (doc.errors.length) {
      console.log(`✗ ${file}: YAML error, fix first:\n${doc.errors.map((e) => '   ' + e.message.split('\n')[0]).join('\n')}`);
      failed++;
      continue;
    }
    const jobs = [];
    visit(doc, {
      Map(_, node) {
        if (isMap(node) && node.has('grab')) jobs.push(node);
      },
    });
    if (!jobs.length) continue;
    for (const node of jobs) {
      const stub = node.get('grab');
      try {
        const q = cache[stub] || (cache[stub] = await grab(parseStub(stub)));
        writeFileSync(cachePath, JSON.stringify(cache));
        node.delete('grab');
        const keep = node.items.map((p) => [p.key.value ?? p.key, p.value]);
        node.items = [];
        for (const [k, v] of Object.entries(q)) node.set(k, v);
        for (const [k, v] of keep) node.set(k, v);
        done++;
        console.log(`✓ ${stub}\n   ${q.source} ${q.ref}${q.refEnd ? '–' + q.refEnd.slice(-5) : ''}\n   ${q.text}`);
      } catch (e) {
        failed++;
        console.log(`✗ ${file.split('/').pop()}: ${stub}\n   ${e.message}`);
      }
    }
    writeFileSync(file, doc.toString({ lineWidth: 0 }));
  }
  console.log(`\n${done} resolved, ${failed} failed`);
  process.exit(failed ? 1 : 0);
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
  } else if (cmd === 'grab') {
    const [work, start, end] = args;
    console.log(await grab({ work, start, end }));
  } else if (cmd === 'resolve') {
    await resolve(args.map((a) => join(process.cwd(), a)));
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
