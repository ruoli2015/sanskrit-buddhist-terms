// Audiobook playback plans: which stretches of the book's single MP3 to play, in order, and
// whether to loop. Pure functions (unit-tested in tests/bookplan.test.js); the player calls
// step() on every time update.
//
// A manifest (made by scripts/audiobook/make.py) lists segments in time order:
//   { kind: intro|section|heading|verse|word|grammar|translation|xuanzang|repeat, verse?, start, end }

export const LOOPS = ['off', 'book', 'verse', 'part', 'range'];

/** Verse numbers in book order. */
export const verseNumbers = (m) => [...new Set(m.segments.filter((s) => s.verse != null).map((s) => s.verse))];

/** End of a segment including the pause after it (= start of the next segment). */
const endOf = (m, i) => (i + 1 < m.segments.length ? m.segments[i + 1].start : m.duration);

/** Index of the segment playing at time t (the last one starting at or before t). */
export function segmentAt(m, t) {
  let lo = 0, hi = m.segments.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (m.segments[mid].start <= t + 0.01) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** [start, end] of verses a..b, from the "Verse n" heading to the end of the second reading. */
export function verseSpan(m, a, b = a) {
  const idx = m.segments.map((s, i) => [s, i]).filter(([s]) => s.verse != null);
  const order = verseNumbers(m);
  const [lo, hi] = [order.indexOf(a), order.indexOf(b)].sort((x, y) => x - y);
  const inside = idx.filter(([s]) => { const k = order.indexOf(s.verse); return k >= lo && k <= hi; });
  if (!inside.length) return null;
  return [inside[0][0].start, endOf(m, inside.at(-1)[1])];
}

/** The verse containing time t, or the first verse when t is before it (intro, section title). */
export function verseAt(m, t) {
  for (let i = segmentAt(m, t); i < m.segments.length; i++) if (m.segments[i].verse != null) return m.segments[i].verse;
  return verseNumbers(m).at(-1);
}

/**
 * Build a plan.
 *   loop:    off | book | verse | part | range
 *   at:      current time (picks the verse / part for 'verse' and 'part')
 *   from,to: verse numbers for 'range'
 *   sktOnly: play only the Sanskrit reading of each verse (not for 'part')
 * Returns { intervals: [[start, end], ...], loop: bool }.
 */
export function planFor(m, { loop = 'off', at = 0, from, to, sktOnly = false } = {}) {
  let span;
  if (loop === 'part') {
    const i = segmentAt(m, at);
    return { intervals: [[m.segments[i].start, endOf(m, i)]], loop: true };
  }
  if (loop === 'verse') span = verseSpan(m, verseAt(m, at));
  else if (loop === 'range') span = verseSpan(m, from ?? verseNumbers(m)[0], to ?? from ?? verseNumbers(m)[0]);
  span ||= [0, m.duration];
  let intervals = [span];
  if (sktOnly) {
    intervals = m.segments
      .map((s, i) => [s, i])
      .filter(([s]) => s.kind === 'verse' && s.start >= span[0] - 0.01 && s.end <= span[1] + 0.01)
      .map(([s, i]) => [s.start, endOf(m, i)]);
    if (!intervals.length) intervals = [span];
  }
  return { intervals, loop: loop !== 'off' };
}

const EPS = 0.05;

/**
 * Called with the current time. Returns null (keep playing), { seek: t } or { stop: true }.
 * Times outside every interval jump forward to the next interval (or wrap / stop at the end).
 */
export function step(plan, t) {
  const iv = plan.intervals;
  const k = iv.findIndex(([s, e]) => t >= s - EPS && t < e - EPS);
  if (k >= 0) return null;
  const next = iv.find(([s]) => s > t - EPS);
  if (next) return { seek: next[0] };
  return plan.loop ? { seek: iv[0][0] } : { stop: true };
}

/** Is time t inside the plan? (Used to decide whether tapping a line keeps the loop.) */
export const inPlan = (plan, t) => plan.intervals.some(([s, e]) => t >= s - EPS && t < e - EPS);

/** Index of the cue (line or sentence) of segment s being read at time t; 0 before the first cue. */
export function cueAt(s, t) {
  if (!s?.cues?.length) return -1;
  let k = 0;
  for (let j = 0; j < s.cues.length; j++) if (s.cues[j].start <= t + 0.05) k = j;
  return k;
}
