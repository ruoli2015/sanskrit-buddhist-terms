import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyTermAnswer, newProgress, STAGE, DEFAULT_SETTINGS, buildSession, curriculumOrder,
  makeTermQuestion, makeCompareQuestion, dueAt,
} from '../app/js/srs.js';

const raw = JSON.parse(readFileSync(new URL('../app/data/content.json', import.meta.url)));
const content = {
  terms: new Map(raw.terms.map((t) => [t.id, t])),
  lists: raw.lists,
  comparisons: raw.comparisons,
};
const day = (n) => new Date(2026, 0, 1 + n, 9);

test('promotion to typed recall needs 5 correct over 2 days', () => {
  let p = newProgress(day(0));
  for (let i = 0; i < 5; i++) p = applyTermAnswer(p, { mode: 'mcq', correct: true }, DEFAULT_SETTINGS, day(0)).progress;
  assert.equal(p.stage, STAGE.RECOGNIZE, 'same day is not enough');
  const r = applyTermAnswer(p, { mode: 'mcq', correct: true }, DEFAULT_SETTINGS, day(1));
  assert.equal(r.progress.stage, STAGE.RECALL);
  assert.equal(r.event, 'promoted');
});

test('wrong multiple-choice answer costs one point', () => {
  let p = newProgress(day(0));
  p = applyTermAnswer(p, { mode: 'mcq', correct: true }, DEFAULT_SETTINGS, day(0)).progress;
  p = applyTermAnswer(p, { mode: 'mcq', correct: true }, DEFAULT_SETTINGS, day(0)).progress;
  p = applyTermAnswer(p, { mode: 'mcq', correct: false }, DEFAULT_SETTINGS, day(0)).progress;
  assert.equal(p.mcqOk, 1);
  assert.equal(p.wrong, 1);
});

test('two typed failures demote back to multiple choice', () => {
  let p = { ...newProgress(day(0)), stage: STAGE.RECALL };
  p = applyTermAnswer(p, { mode: 'typed', correct: false, partial: true }, DEFAULT_SETTINGS, day(1)).progress;
  assert.equal(p.stage, STAGE.RECALL);
  const r = applyTermAnswer(p, { mode: 'typed', correct: false }, DEFAULT_SETTINGS, day(1));
  assert.equal(r.progress.stage, STAGE.RECOGNIZE);
  assert.equal(r.event, 'demoted');
  assert.equal(r.progress.mcqOk, DEFAULT_SETTINGS.mcqThreshold - 2);
});

test('three typed successes unlock the produce stage', () => {
  let p = { ...newProgress(day(0)), stage: STAGE.RECALL };
  for (let i = 0; i < 3; i++) p = applyTermAnswer(p, { mode: 'typed', correct: true }, DEFAULT_SETTINGS, day(i + 1)).progress;
  assert.equal(p.stage, STAGE.PRODUCE);
});

test('stage-1 cards come back within 2 days', () => {
  let p = newProgress(day(0));
  for (let i = 0; i < 4; i++) p = applyTermAnswer(p, { mode: 'mcq', correct: true }, DEFAULT_SETTINGS, new Date(dueAt(p))).progress;
  assert.equal(p.stage, STAGE.RECOGNIZE);
  assert.ok(dueAt(p) - new Date(p.card.last_review).getTime() <= 2 * 86400000 + 1000);
});

test('curriculum starts with the five aggregates, head term first', () => {
  const order = curriculumOrder(content);
  assert.deepEqual(order.slice(0, 6), ['skandha', 'rupa', 'vedana', 'samjna', 'samskara', 'vijnana']);
  assert.equal(new Set(order).size, order.length, 'no duplicates (vedanā/saṃjñā are in two lists)');
});

test('first session introduces new words (with room for follow-ups)', () => {
  const q = buildSession({ content, prog: () => undefined, size: 15 });
  const intros = q.filter((x) => x.kind === 'intro');
  assert.equal(intros.length, 5);
  assert.equal(intros[0].id, 'skandha');
});

test('due reviews come before new words and respect the size', () => {
  const now = day(10);
  const progs = new Map();
  for (const id of ['rupa', 'vedana', 'samjna']) progs.set('t:' + id, { ...newProgress(day(0)) });
  const q = buildSession({ content, prog: (k) => progs.get(k), size: 5, now });
  assert.ok(q.length <= 5);
  assert.equal(q[0].kind, 'term');
});

test('retired words are never scheduled', () => {
  const progs = new Map([['t:rupa', { ...newProgress(day(0)), retired: true }]]);
  const q = buildSession({ content, prog: (k) => progs.get(k), size: 40, now: day(10) });
  assert.ok(!q.some((x) => x.id === 'rupa'));
});

test('multiple-choice question has 4 distinct options including the answer', () => {
  const t = content.terms.get('cetana');
  for (let i = 0; i < 20; i++) {
    const q = makeTermQuestion(content, t, newProgress(), DEFAULT_SETTINGS);
    assert.equal(q.mode, 'mcq');
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options.map((o) => o.text)).size, 4);
    assert.equal(q.options[q.answer].id, 'cetana');
  }
});

test('comparison questions keep the right answer after shuffling', () => {
  const c = content.comparisons.find((x) => x.id === 'samskara-cetana');
  for (let i = 0; i < 20; i++) {
    const q = makeCompareQuestion(c, null);
    if (q.mode === 'cmp-mcq') assert.deepEqual(q.options[q.answer], c.questions[q.qIndex].options[c.questions[q.qIndex].answer]);
  }
});
