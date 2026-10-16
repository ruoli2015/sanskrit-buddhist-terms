// Audiobook player: one <audio> element for the whole app, so a book keeps playing while you
// browse other pages. Loops and "Sanskrit only" are plans of time intervals (bookplan.js) checked
// on every time update, and on every animation frame while the page is visible for exact loop
// points. The book is one MP3 (not one file per verse) because iPhone home-screen apps often can't
// start a new file with the screen locked, but they can seek within one.
//
// play() must run synchronously inside a tap handler (see audio.js).
import { planFor, step, segmentAt, verseAt, verseNumbers, inPlan } from './bookplan.js';
import * as books from './books.js';
import { stop as stopPronunciation } from './audio.js';

const st = {
  book: null, status: 'idle', error: null, loaded: 0, loadedTime: 0, saved: false,
  playing: false, t: 0, loop: 'off', sktOnly: false, from: null, to: null, rate: 1,
};
let audio = null;
let plan = { intervals: [[0, 0]], loop: false };
let url = null;
let raf = 0;
let lastSave = 0;
const listeners = new Set();

export const state = () => st;
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn(st));

const posKey = (id) => `book-pos:${id}`;
function savePosition(force = false) {
  if (!st.book || (!force && Date.now() - lastSave < 5000)) return;
  lastSave = Date.now();
  try { localStorage.setItem(posKey(st.book.id), JSON.stringify({ t: st.t, loop: st.loop, sktOnly: st.sktOnly, from: st.from, to: st.to, rate: st.rate })); } catch {}
}
function restore(id) {
  try { return JSON.parse(localStorage.getItem(posKey(id))) || {}; } catch { return {}; }
}

window.addEventListener('sbt-pronounce', () => audio?.pause());

function el() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  audio.preservesPitch = true;
  audio.addEventListener('timeupdate', () => tick());
  audio.addEventListener('ended', () => tick(true));
  audio.addEventListener('play', () => { st.playing = true; startFrames(); emit(); });
  audio.addEventListener('pause', () => { st.playing = false; savePosition(true); emit(); });
  audio.addEventListener('error', () => { if (audio.src) { st.error = `音檔無法播放 · Audio could not play (${audio.error?.code ?? '?'})`; emit(); } });
  return audio;
}

function tick(ended = false) {
  if (!st.book) return;
  const t = ended ? st.book.duration : audio.currentTime;
  const r = step(plan, t);
  if (r?.seek != null) {
    seekRaw(r.seek);
    if (ended || audio.paused) audio.play().catch(() => {});
  } else if (r?.stop) {
    audio.pause();
  }
  st.t = audio.currentTime;
  savePosition();
  emit();
}

// Exact loop points while the screen is on; time updates (about 4 a second) cover the background.
function startFrames() {
  cancelAnimationFrame(raf);
  const frame = () => {
    if (!st.playing) return;
    if (document.visibilityState === 'visible') {
      const r = step(plan, audio.currentTime);
      if (r) tick();
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

function seekRaw(t) {
  // While the first download is still running, only the part already loaded can be played.
  const max = st.saved ? st.book.duration : Math.max(0, st.loadedTime - 1);
  if (t > max) {
    window.__toast?.(`仍在下載 ${Math.round((100 * st.loaded) / (st.book.bytes || 1))}% · Still downloading`);
    t = max;
  }
  audio.currentTime = t;
  st.t = t;
}

function setSource(blob) {
  const a = el();
  const t = url ? a.currentTime : st.t;
  const wasPlaying = url && !a.paused;
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(blob);
  a.src = url;
  a.playbackRate = st.rate;
  a.addEventListener('loadedmetadata', () => {
    a.playbackRate = st.rate;
    a.currentTime = t;
    if (wasPlaying) a.play().catch(() => {});
  }, { once: true });
}

function replan(at = st.t) {
  if (!st.book) return;
  plan = planFor(st.book, { loop: st.loop, at, from: st.from, to: st.to, sktOnly: st.sktOnly });
}

/** Open a book (does not start playing). Loads the saved copy, or downloads it part by part. */
export async function open(m) {
  if (st.book?.id === m.id && st.book.version === m.version && st.status !== 'error') return;
  close();
  const saved = restore(m.id);
  Object.assign(st, {
    book: m, status: 'loading', error: null, loaded: 0, loadedTime: 0, saved: false, t: Math.min(saved.t || 0, m.duration),
    loop: saved.loop || 'off', sktOnly: !!saved.sktOnly, from: saved.from ?? null, to: saved.to ?? null, rate: saved.rate || 1,
  });
  replan();
  emit();
  setMediaSession(m);
  const blob = await books.savedAudio(m).catch(() => null);
  if (st.book !== m) return;
  if (blob) {
    Object.assign(st, { status: 'ready', saved: true, loaded: blob.size, loadedTime: m.duration });
    setSource(blob);
    emit();
    return;
  }
  try {
    await books.downloadAudio(m, {
      onProgress: (n) => { if (st.book === m) { st.loaded = n; emit(); } },
      onPart: (b, n, done) => {
        if (st.book !== m) return;
        Object.assign(st, { status: 'ready', loaded: n, loadedTime: done ? m.duration : (m.duration * n) / m.bytes, saved: done });
        setSource(b);
        emit();
      },
    });
  } catch (e) {
    if (st.book === m) Object.assign(st, { status: 'error', error: e.message });
    emit();
  }
}

export function close() {
  if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
  if (url) URL.revokeObjectURL(url);
  url = null;
  savePosition(true);
  Object.assign(st, { book: null, status: 'idle', playing: false, error: null });
  emit();
}

export function toggle() {
  const a = el();
  if (!st.book || !url) return;
  if (!a.paused) return a.pause();
  stopPronunciation();
  // Outside the plan (e.g. after changing the loop) jump in first; at the end, start over.
  const r = step(plan, a.currentTime);
  if (r?.seek != null) seekRaw(r.seek);
  else if (r?.stop) seekRaw(plan.intervals[0][0]);
  a.play().catch((e) => window.__toast?.(e.name === 'NotAllowedError' ? '請再點一次 ▶ · Tap ▶ again' : e.message));
}

/** Jump to a time (tapping a line in the transcript) and play. */
export function seek(t, { play = true } = {}) {
  if (!st.book || !url) return;
  if (st.loop === 'verse' || st.loop === 'part') replan(t);
  else if (!inPlan(plan, t)) { st.loop = 'off'; st.sktOnly = false; replan(t); }
  seekRaw(t);
  if (play && audio.paused) { stopPronunciation(); audio.play().catch(() => {}); }
  emit();
}

export function setLoop(loop) {
  st.loop = loop;
  if (loop === 'range' && st.from == null) {
    const v = verseAt(st.book, st.t);
    st.from = v; st.to = v;
  }
  replan();
  savePosition(true);
  emit();
}

export function setRange(from, to) {
  Object.assign(st, { from, to });
  replan();
  savePosition(true);
  emit();
}

export function setSktOnly(on) {
  st.sktOnly = on;
  replan();
  savePosition(true);
  emit();
}

export function setRate(rate) {
  st.rate = rate;
  if (audio) audio.playbackRate = rate;
  savePosition(true);
  emit();
}

/** Previous / next verse (−1 / +1): to the "Verse n" heading. */
export function skipVerse(dir) {
  if (!st.book) return;
  const order = verseNumbers(st.book);
  const cur = verseAt(st.book, st.t);
  const head = st.book.segments.find((s) => s.kind === 'heading' && s.verse === cur);
  // "previous" restarts the current verse when more than 3 s into it
  const target = dir < 0 && head && st.t - head.start > 3 ? cur : order[Math.max(0, Math.min(order.length - 1, order.indexOf(cur) + dir))];
  const s = st.book.segments.find((x) => x.kind === 'heading' && x.verse === target);
  if (s) seek(s.start, { play: !audio?.paused });
}

export const currentSegment = () => (st.book ? segmentAt(st.book, st.t) : -1);

/** Delete the saved copy of a book from this device. */
export async function deleteSaved(id) {
  if (st.book?.id === id) close();
  await books.deleteAudio(id);
  emit();
}

function setMediaSession(m) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: `${m.title_skt || ''} ${m.title_zh}`.trim(),
    artist: m.title_en,
    album: '梵語佛學名相 · Sanskrit Buddhist Terms',
    artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
  });
  const on = (action, fn) => { try { navigator.mediaSession.setActionHandler(action, fn); } catch {} };
  on('play', () => toggle());
  on('pause', () => audio?.pause());
  on('previoustrack', () => skipVerse(-1));
  on('nexttrack', () => skipVerse(1));
  on('seekbackward', () => seek(Math.max(0, st.t - 10), { play: false }));
  on('seekforward', () => seek(st.t + 10, { play: false }));
}
