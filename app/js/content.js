// Built-in content (data/content.json, compiled from content/*.yaml) merged with the user's own terms.
import * as store from './store.js';
import { normSkt, normZh } from './grade.js';

let base = null;
let merged = null;
let mergedFor = null;

export async function loadBase() {
  const res = await fetch('data/content.json', { cache: 'no-cache' }).catch(() => null);
  base = res && res.ok ? await res.json() : await (await fetch('data/content.json')).json();
  return base;
}

/** Content with custom terms merged in. Rebuilt only when custom docs change. */
export function get() {
  const sig = store.kindVersion('custom');
  if (merged && mergedFor === sig) return merged;
  const custom = store.listDocs('custom');

  const terms = new Map(base.terms.map((t) => [t.id, t]));
  const lists = base.lists.map((l) => ({ ...l }));
  const byTag = new Map();
  for (const [key, d] of custom) {
    const t = {
      zhAlt: [], enAlt: [], quotes: [], related: [], compare: [],
      ...d,
      id: key,
      custom: true,
    };
    terms.set(key, t);
    const tags = d.tags?.length ? d.tags : ['my-words'];
    for (const tag of tags) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(key);
    }
  }
  for (const [tag, items] of byTag) {
    lists.push(
      tag === 'my-words'
        ? { id: 'my-words', zh: '我的詞彙', en: 'My words', items, custom: true }
        : { id: 'tag:' + tag, zh: tag, en: tag, items, custom: true },
    );
  }
  const termLists = new Map();
  for (const l of lists) {
    for (const id of [l.head, ...(l.items || [])].filter(Boolean)) {
      if (!termLists.has(id)) termLists.set(id, []);
      if (!termLists.get(id).includes(l.id)) termLists.get(id).push(l.id);
    }
  }
  const cmpByTerm = new Map();
  for (const c of base.comparisons) {
    for (const id of c.terms) {
      if (!cmpByTerm.has(id)) cmpByTerm.set(id, []);
      cmpByTerm.get(id).push(c.id);
    }
  }
  merged = {
    version: base.version,
    s2t: base.s2t,
    terms,
    lists,
    listById: new Map(lists.map((l) => [l.id, l])),
    comparisons: base.comparisons,
    cmpById: new Map(base.comparisons.map((c) => [c.id, c])),
    termLists,
    cmpByTerm,
  };
  mergedFor = sig;
  return merged;
}

export function search(content, q) {
  const raw = q.trim().toLowerCase();
  if (!raw) return [];
  const skt = normSkt(raw);
  const zh = normZh(raw, content.s2t);
  const out = [];
  for (const t of content.terms.values()) {
    let score = 0;
    const skts = [t.skt, t.pali].filter(Boolean).map(normSkt);
    if (skt && skts.some((s) => s === skt)) score = 100;
    else if (skt && skts.some((s) => s.startsWith(skt))) score = 80;
    else if (skt.length >= 3 && skts.some((s) => s.includes(skt))) score = 50;
    const zhs = [t.zh, ...(t.zhAlt || [])].map((s) => normZh(s, content.s2t));
    if (zh && zhs.some((s) => s === zh)) score = Math.max(score, 100);
    else if (zh && zhs.some((s) => s.includes(zh))) score = Math.max(score, 60);
    const ens = [t.en, ...(t.enAlt || [])].map((s) => s.toLowerCase());
    if (ens.some((s) => s === raw)) score = Math.max(score, 90);
    else if (raw.length >= 3 && ens.some((s) => s.includes(raw))) score = Math.max(score, 40);
    if (!score && raw.length >= 2 && ((t.short_zh || '').includes(q.trim()) || (t.short_en || '').toLowerCase().includes(raw))) score = 10;
    if (score) out.push([score, t]);
  }
  return out.sort((a, b) => b[0] - a[0]).map(([, t]) => t);
}
