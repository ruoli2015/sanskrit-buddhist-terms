import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFor, step, segmentAt, verseSpan, verseAt, verseNumbers, inPlan, cueAt } from '../app/js/bookplan.js';

// A two-verse book: intro, section, then per verse heading → verse → word → repeat.
const seg = (kind, start, end, verse) => ({ kind, start, end, ...(verse != null ? { verse } : {}) });
const m = {
  duration: 100,
  segments: [
    seg('intro', 0, 8), seg('section', 10, 14),
    seg('heading', 15, 17, 1), seg('verse', 18, 25, 1), seg('word', 27, 40, 1), seg('repeat', 42, 49, 1),
    seg('heading', 52, 54, 2), seg('verse', 55, 62, 2), seg('word', 64, 80, 2), seg('repeat', 82, 90, 2),
  ],
};

test('segment and verse lookup', () => {
  assert.equal(segmentAt(m, 0), 0);
  assert.equal(segmentAt(m, 30), 4);
  assert.equal(segmentAt(m, 26), 3); // in the pause after the verse
  assert.equal(verseAt(m, 5), 1); // intro counts as before verse 1
  assert.equal(verseAt(m, 70), 2);
  assert.deepEqual(verseNumbers(m), [1, 2]);
  assert.deepEqual(verseSpan(m, 1), [15, 52]);
  assert.deepEqual(verseSpan(m, 2), [52, 100]);
  assert.deepEqual(verseSpan(m, 2, 1), [15, 100]);
});

test('whole book: plays to the end, loops only when asked', () => {
  assert.deepEqual(step(planFor(m, { loop: 'off' }), 99.99), { stop: true });
  assert.deepEqual(step(planFor(m, { loop: 'book' }), 99.99), { seek: 0 });
  assert.equal(step(planFor(m, { loop: 'book' }), 50), null);
});

test('loop a verse or a part', () => {
  const v = planFor(m, { loop: 'verse', at: 30 });
  assert.deepEqual(v.intervals, [[15, 52]]);
  assert.equal(step(v, 40), null);
  assert.deepEqual(step(v, 52), { seek: 15 });
  const p = planFor(m, { loop: 'part', at: 30 });
  assert.deepEqual(p.intervals, [[27, 42]]); // includes the pause after the part
  assert.deepEqual(step(p, 42), { seek: 27 });
});

test('range of verses', () => {
  const r = planFor(m, { loop: 'range', from: 1, to: 2 });
  assert.deepEqual(r.intervals, [[15, 100]]);
  assert.deepEqual(step(r, 5), { seek: 15 }); // before the range: jump in
});

test('Sanskrit only: skips the explanations', () => {
  const s = planFor(m, { loop: 'book', sktOnly: true });
  assert.deepEqual(s.intervals, [[18, 27], [55, 64]]);
  assert.deepEqual(step(s, 0), { seek: 18 });
  assert.deepEqual(step(s, 27), { seek: 55 });
  assert.deepEqual(step(s, 64), { seek: 18 }); // wraps
  assert.deepEqual(step(planFor(m, { loop: 'off', sktOnly: true }), 64), { stop: true });
  assert.deepEqual(planFor(m, { loop: 'verse', at: 70, sktOnly: true }).intervals, [[55, 64]]);
  assert.equal(inPlan(s, 30), false);
});

test('cue (sentence) being read', () => {
  const s = { start: 10, cues: [{ start: 10, end: 14 }, { start: 14.5, end: 20 }, { start: 20.3, end: 25 }] };
  assert.equal(cueAt(s, 10), 0);
  assert.equal(cueAt(s, 14.2), 0); // in the pause after a sentence: keep it highlighted
  assert.equal(cueAt(s, 14.5), 1);
  assert.equal(cueAt(s, 24), 2);
  assert.equal(cueAt({ start: 0 }, 3), -1);
});
