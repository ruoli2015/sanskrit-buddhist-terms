// Motivation stats from the review log. Pure functions (unit-tested).
import { dayKey, addDays } from './util.js';

export const FREEZES_PER_MONTH = 2;

/** reviews: [{ ts, correct, item }] -> Map(dayKey -> { n, ok }) */
export function dailyCounts(reviews) {
  const m = new Map();
  for (const r of reviews) {
    const k = dayKey(r.ts);
    const e = m.get(k) || { n: 0, ok: 0 };
    e.n += 1;
    if (r.correct) e.ok += 1;
    m.set(k, e);
  }
  return m;
}

/**
 * Current streak in days. A day counts when at least `minPerDay` answers were given.
 * Up to FREEZES_PER_MONTH missed days per calendar month are bridged automatically.
 * Today not yet practised does not break the streak.
 */
export function streak(counts, today = dayKey(), minPerDay = 1) {
  const active = (k) => (counts.get(k)?.n || 0) >= minPerDay;
  let day = active(today) ? today : addDays(today, -1);
  let days = 0;
  const frozen = [];
  const usedInMonth = new Map();
  // Never bridge before the first ever practice day.
  const first = [...counts.keys()].sort()[0];
  if (!first) return { days: 0, frozen, practicedToday: false };
  for (let guard = 0; guard < 3660 && day >= first; guard++) {
    if (active(day)) {
      days++;
    } else {
      const month = day.slice(0, 7);
      const used = usedInMonth.get(month) || 0;
      // A freeze only bridges a gap if the streak continues on the day before.
      if (used < FREEZES_PER_MONTH && active(addDays(day, -1))) {
        usedInMonth.set(month, used + 1);
        frozen.push(day);
      } else break;
    }
    day = addDays(day, -1);
  }
  return { days, frozen, practicedToday: active(today) };
}

export function longestStreak(counts) {
  const days = [...counts.keys()].sort();
  let best = 0, cur = 0, prev = null;
  for (const d of days) {
    cur = prev && addDays(prev, 1) === d ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

/** Heatmap cells for the last `weeks` weeks, oldest first, aligned so each column is a week (Sun..Sat). */
export function heatmap(counts, weeks = 18, today = dayKey()) {
  const [y, m, d] = today.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  const start = addDays(today, -(weeks * 7 - 1) + (6 - dow)); // last column = the current week
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const k = addDays(start, i);
    cells.push({ day: k, n: counts.get(k)?.n || 0, future: k > today });
  }
  return cells;
}

/** Items answered wrong often: candidates for extra attention. */
export function leeches(progressEntries, minWrong = 4) {
  return progressEntries
    .filter(([, p]) => (p.wrong || 0) >= minWrong && !p.retired)
    .sort((a, b) => (b[1].wrong || 0) - (a[1].wrong || 0));
}
