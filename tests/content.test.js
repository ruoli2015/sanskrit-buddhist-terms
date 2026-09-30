import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchZh, matchEn, matchSkt } from '../app/js/grade.js';
import { makeTermQuestion, newProgress, DEFAULT_SETTINGS } from '../app/js/srs.js';

const raw = JSON.parse(readFileSync(new URL('../app/data/content.json', import.meta.url)));
const content = { terms: new Map(raw.terms.map((t) => [t.id, t])), lists: raw.lists, comparisons: raw.comparisons };

test('every term accepts its own answers when typed', () => {
  for (const t of raw.terms) {
    assert.ok(matchZh(t.zh, [t.zh, ...(t.zhAlt || [])], raw.s2t), `zh ${t.id}`);
    assert.ok(matchEn(t.en, [t.en, ...(t.enAlt || [])]), `en ${t.id}`);
    for (const a of t.enAlt || []) assert.ok(matchEn(a, [t.en, ...t.enAlt]), `enAlt ${t.id}: ${a}`);
    assert.ok(matchSkt(t.skt, [t.skt]), `skt ${t.id}`);
  }
});

test('multiple-choice questions for every term have 4 distinct options', () => {
  for (const t of raw.terms) {
    for (let i = 0; i < 8; i++) {
      const q = makeTermQuestion(content, t, newProgress(), DEFAULT_SETTINGS);
      assert.equal(new Set(q.options.map((o) => o.text)).size, 4, `${t.id} ${q.to}`);
      assert.equal(q.options[q.answer].id, t.id);
    }
  }
});

test('no two terms share the same Sanskrit, and primary Chinese clashes are listed', () => {
  const skt = new Map();
  for (const t of raw.terms) {
    assert.ok(!skt.has(t.skt), `duplicate skt ${t.skt}: ${t.id} / ${skt.get(t.skt)}`);
    skt.set(t.skt, t.id);
  }
});
