import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streak, dailyCounts, heatmap, longestStreak } from '../app/js/stats.js';

const counts = (days) => new Map(days.map((d) => [d, { n: 10, ok: 8 }]));

test('streak counts consecutive days, today optional', () => {
  assert.equal(streak(counts(['2026-09-28', '2026-09-29', '2026-09-30']), '2026-09-30').days, 3);
  assert.equal(streak(counts(['2026-09-28', '2026-09-29']), '2026-09-30').days, 2);
});

test('freeze days bridge single gaps (max 2 per month)', () => {
  const s = streak(counts(['2026-09-25', '2026-09-27', '2026-09-29', '2026-09-30']), '2026-09-30');
  assert.equal(s.days, 4);
  assert.deepEqual(s.frozen, ['2026-09-28', '2026-09-26']);
  const s2 = streak(counts(['2026-09-23', '2026-09-25', '2026-09-27', '2026-09-29', '2026-09-30']), '2026-09-30');
  assert.equal(s2.days, 4, 'third gap in the same month breaks the streak');
});

test('no practice ever means zero', () => {
  assert.equal(streak(new Map(), '2026-09-30').days, 0);
});

test('dailyCounts and heatmap', () => {
  const c = dailyCounts([{ ts: new Date(2026, 8, 30, 8).getTime(), correct: true }, { ts: new Date(2026, 8, 30, 9).getTime(), correct: false }]);
  assert.deepEqual(c.get('2026-09-30'), { n: 2, ok: 1 });
  const cells = heatmap(c, 4, '2026-09-30');
  assert.equal(cells.length, 28);
  assert.equal(cells.find((x) => x.day === '2026-09-30').n, 2);
  assert.equal(longestStreak(counts(['2026-09-01', '2026-09-02', '2026-09-04'])), 2);
});
