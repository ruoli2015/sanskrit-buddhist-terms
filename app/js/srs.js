// Learning engine: stages decide HOW a term is tested, FSRS decides WHEN.
// Pure logic, no DOM — unit-tested in tests/srs.test.js.
import { fsrs, generatorParameters, createEmptyCard, Rating } from '../vendor/fsrs.js';
import { dayKey, shuffle, pick, DAY_MS } from './util.js';

export { Rating };

export const STAGE = { NEW: 0, RECOGNIZE: 1, RECALL: 2, PRODUCE: 3 };
export const STAGE_LABEL = {
  0: { zh: '新詞', en: 'New' },
  1: { zh: '辨認', en: 'Recognize' },
  2: { zh: '回想', en: 'Recall' },
  3: { zh: '產出', en: 'Produce' },
};

export const DEFAULT_SETTINGS = {
  dailyGoal: 20,          // answers per day
  newPerDay: 5,
  mcqThreshold: 5,        // correct multiple-choice answers before typed recall
  mcqMinDays: 2,          // ...spread over at least this many different days
  produceStage: true,     // after recall, also ask Chinese/English -> Sanskrit
  lang: 'both',           // explanation language: both | zh | en
  sessionSize: 15,
  disabledLists: [],
  masteredStability: 21,  // days of FSRS stability counted as "mastered"
  autoplay: 'intro',      // pronunciation: off | intro (new-word cards) | all (also after each answer)
  audioSpeed: 'normal',   // normal | slow
};

const scheduler = fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9 }));
const STAGE1_MAX_INTERVAL = 2 * DAY_MS; // keep multiple-choice cards coming back quickly

// FSRS cards are stored as JSON; revive Date fields.
export function reviveCard(c) {
  if (!c) return null;
  return { ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review) : undefined };
}
const serializeCard = (c) => ({ ...c, due: c.due.toISOString(), last_review: c.last_review ? c.last_review.toISOString() : null });

export function newProgress(now = new Date()) {
  return {
    stage: STAGE.RECOGNIZE,
    mcqOk: 0,
    mcqDays: [],
    typedOk: 0,
    typedFail: 0,
    wrong: 0,
    retired: false,
    introducedAt: now.getTime(),
    card: serializeCard(createEmptyCard(now)),
  };
}

export const isIntroduced = (p) => !!p && !!p.card;
export const dueAt = (p) => (p?.card ? new Date(p.card.due).getTime() : Infinity);
export const isMastered = (p, s = DEFAULT_SETTINGS) =>
  !!p && (p.retired || (p.stage >= STAGE.RECALL && (p.card?.stability || 0) >= s.masteredStability));

function schedule(p, rating, now) {
  const card = reviveCard(p.card) || createEmptyCard(now);
  const next = scheduler.next(card, now, rating).card;
  if (p.stage <= STAGE.RECOGNIZE && next.due.getTime() - now.getTime() > STAGE1_MAX_INTERVAL) {
    next.due = new Date(now.getTime() + STAGE1_MAX_INTERVAL);
  }
  return serializeCard(next);
}

/**
 * Apply an answer to a term's progress.
 * result: { mode: 'mcq'|'typed'|'produce'|'cloze', correct: bool, partial?: bool }
 * Returns { progress, rating, event } where event is 'promoted' | 'demoted' | null.
 */
export function applyTermAnswer(prev, result, settings = DEFAULT_SETTINGS, now = new Date()) {
  const p = { ...(prev || newProgress(now)) };
  p.mcqDays = [...(p.mcqDays || [])];
  let event = null;
  const rating = result.correct ? Rating.Good : result.partial ? Rating.Hard : Rating.Again;
  if (!result.correct) p.wrong = (p.wrong || 0) + 1;

  if (result.mode === 'mcq' && p.stage === STAGE.RECOGNIZE) {
    if (result.correct) {
      p.mcqOk += 1;
      const today = dayKey(now);
      if (!p.mcqDays.includes(today)) p.mcqDays = [...p.mcqDays, today].slice(-10);
      if (p.mcqOk >= settings.mcqThreshold && p.mcqDays.length >= settings.mcqMinDays) {
        p.stage = STAGE.RECALL;
        p.typedOk = 0;
        p.typedFail = 0;
        event = 'promoted';
      }
    } else {
      p.mcqOk = Math.max(0, p.mcqOk - 1);
    }
  } else if (result.mode === 'typed' || result.mode === 'produce') {
    if (result.correct) {
      p.typedOk += 1;
      p.typedFail = 0;
      if (p.stage === STAGE.RECALL && settings.produceStage && p.typedOk >= 3) {
        p.stage = STAGE.PRODUCE;
        event = 'promoted';
      }
    } else {
      p.typedOk = 0;
      p.typedFail += 1;
      if (p.typedFail >= 2) {
        p.typedFail = 0;
        if (p.stage === STAGE.PRODUCE) p.stage = STAGE.RECALL;
        else if (p.stage === STAGE.RECALL) {
          p.stage = STAGE.RECOGNIZE;
          p.mcqOk = Math.max(0, settings.mcqThreshold - 2);
          p.mcqDays = [];
        }
        event = 'demoted';
      }
    }
  }
  p.card = schedule(p, rating, now);
  return { progress: p, rating, event };
}

export function applyCompareAnswer(prev, correct, qIndex, now = new Date()) {
  const p = { ...(prev || { card: null, seen: [], wrong: 0 }) };
  p.lastQ = qIndex;
  p.seen = [...new Set([...(p.seen || []), qIndex])];
  if (!correct) p.wrong = (p.wrong || 0) + 1;
  const card = reviveCard(p.card) || createEmptyCard(now);
  p.card = serializeCard(scheduler.next(card, now, correct ? Rating.Good : Rating.Again).card);
  return { progress: p };
}

// ---------------- Session building ----------------

/**
 * content: { terms: Map, lists: [], comparisons: [] }  (see content.js)
 * prog: (key) => progress doc or undefined; keys 't:<id>' and 'c:<id>'
 * stats: { newToday }
 * Returns an ordered queue of items: { kind: 'intro'|'term'|'compare'|'compare-intro', id }
 */
export function buildSession({ content, prog, settings = DEFAULT_SETTINGS, size = 15, newToday = 0, now = new Date(), extra = false }) {
  const t = now.getTime();
  const due = [];
  const learningAhead = [];
  for (const term of content.terms.values()) {
    const p = prog('t:' + term.id);
    if (!isIntroduced(p) || p.retired) continue;
    const d = dueAt(p);
    if (d <= t) due.push({ kind: 'term', id: term.id, due: d });
    else learningAhead.push({ kind: 'term', id: term.id, due: d });
  }
  due.sort((a, b) => a.due - b.due);

  // Comparisons: unlocked once all their terms have been introduced.
  const cmpDue = [];
  const cmpNew = [];
  for (const c of content.comparisons) {
    const unlocked = c.terms.every((id) => isIntroduced(prog('t:' + id)) || !content.terms.has(id));
    if (!unlocked) continue;
    const p = prog('c:' + c.id);
    if (!p?.card) cmpNew.push({ kind: 'compare-intro', id: c.id });
    else if (dueAt(p) <= t) cmpDue.push({ kind: 'compare', id: c.id, due: dueAt(p) });
  }

  // New terms, in curriculum order (enabled lists first-to-last, head term before members).
  const newItems = [];
  const newBudget = Math.max(0, settings.newPerDay - newToday);
  if (newBudget > 0) {
    for (const id of curriculumOrder(content, settings)) {
      if (newItems.length >= newBudget) break;
      if (!isIntroduced(prog('t:' + id))) newItems.push({ kind: 'intro', id });
    }
  }

  const queue = [];
  const cmpSlots = Math.max(1, Math.round(size * 0.2));
  const cmp = [...cmpNew.slice(0, 1), ...cmpDue].slice(0, cmpSlots);
  const reviews = due.slice(0, size - cmp.length);
  let room = size - reviews.length - cmp.length;
  // Each new term takes ~2 slots (intro + a follow-up question).
  const news = newItems.slice(0, Math.max(0, Math.floor(room / 2)));
  room -= news.length * 2;

  queue.push(...interleave(reviews, news));
  // Spread comparisons through the session rather than at the end.
  cmp.forEach((c, i) => queue.splice(Math.min(queue.length, Math.floor(((i + 1) * queue.length) / (cmp.length + 1)) + i), 0, c));

  if (extra && room > 0) {
    learningAhead.sort((a, b) => a.due - b.due);
    queue.push(...learningAhead.slice(0, room));
  }
  return queue.map(({ kind, id }) => ({ kind, id }));
}

function interleave(a, b) {
  if (!b.length) return a.slice();
  const out = [];
  const step = Math.max(1, Math.floor(a.length / (b.length + 1)));
  let ai = 0;
  for (const item of b) {
    out.push(...a.slice(ai, ai + step));
    ai += step;
    out.push(item);
  }
  out.push(...a.slice(ai));
  return out;
}

export function curriculumOrder(content, settings = DEFAULT_SETTINGS) {
  const seen = new Set();
  const out = [];
  for (const l of content.lists) {
    if (settings.disabledLists?.includes(l.id)) continue;
    for (const id of [l.head, ...(l.items || [])]) {
      if (id && !seen.has(id) && content.terms.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

// ---------------- Question generation ----------------

/** Terms most similar to `term` (same list first), used as multiple-choice distractors. */
export function distractorPool(content, term) {
  const siblings = [];
  for (const l of content.lists) {
    const members = [l.head, ...(l.items || [])].filter(Boolean);
    if (members.includes(term.id)) siblings.push(...members);
  }
  const related = term.related || [];
  const ordered = [...shuffle(siblings), ...shuffle(related), ...shuffle([...content.terms.keys()])];
  const seen = new Set([term.id]);
  const out = [];
  for (const id of ordered) {
    if (seen.has(id) || !content.terms.has(id)) continue;
    seen.add(id);
    out.push(content.terms.get(id));
  }
  return out;
}

const MCQ_DIRECTIONS = [
  { from: 'skt', to: 'zh' },
  { from: 'skt', to: 'en' },
  { from: 'zh', to: 'skt' },
  { from: 'en', to: 'skt' },
];

function mcq(content, term, dir) {
  const val = (t) => (dir.to === 'skt' ? t.skt : t[dir.to]);
  const opts = [term];
  const used = new Set([val(term)]);
  for (const d of distractorPool(content, term)) {
    if (opts.length >= 4) break;
    if (used.has(val(d))) continue;
    used.add(val(d));
    opts.push(d);
  }
  const options = shuffle(opts);
  return {
    mode: 'mcq',
    termId: term.id,
    from: dir.from,
    to: dir.to,
    options: options.map((o) => ({ id: o.id, text: val(o) })),
    answer: options.findIndex((o) => o.id === term.id),
  };
}

/** A quote with the Chinese term blanked out, if the term occurs in one of its quotes. */
export function clozeFor(term) {
  const zh = term.zh;
  const q = (term.quotes || []).filter((x) => zh && x.text.includes(zh));
  if (!q.length) return null;
  const quote = pick(q);
  return { quote, text: quote.text.split(zh).join('＿'.repeat([...zh].length)) };
}

export function makeTermQuestion(content, term, p, settings = DEFAULT_SETTINGS) {
  const stage = p?.stage || STAGE.RECOGNIZE;
  const canMcq = content.terms.size >= 2;
  if (stage <= STAGE.RECOGNIZE && canMcq) return mcq(content, term, pick(MCQ_DIRECTIONS));

  const roll = Math.random();
  const cloze = clozeFor(term);
  if (cloze && roll < 0.2 && canMcq) {
    const q = mcq(content, term, { from: 'skt', to: 'zh' });
    return { ...q, mode: 'cloze', cloze };
  }
  if (stage >= STAGE.PRODUCE && settings.produceStage && roll < 0.6) {
    return { mode: 'produce', termId: term.id };
  }
  return { mode: 'typed', termId: term.id };
}

export function makeCompareQuestion(cmp, p) {
  const n = cmp.questions?.length || 0;
  if (!n) return null;
  // Prefer questions not seen yet, never repeat the last one if avoidable.
  const unseen = [...Array(n).keys()].filter((i) => !(p?.seen || []).includes(i));
  let pool = unseen.length ? unseen : [...Array(n).keys()];
  if (pool.length > 1) pool = pool.filter((i) => i !== p?.lastQ);
  const qIndex = pick(pool);
  const q = cmp.questions[qIndex];
  if (q.type === 'tf') return { mode: 'cmp-tf', cmpId: cmp.id, qIndex, q };
  // Shuffle options but remember where the answer went.
  const order = shuffle(q.options.map((_, i) => i));
  return {
    mode: 'cmp-mcq',
    cmpId: cmp.id,
    qIndex,
    q,
    options: order.map((i) => q.options[i]),
    answer: order.indexOf(q.answer),
  };
}
