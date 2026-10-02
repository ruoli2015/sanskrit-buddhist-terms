// Sanskrit pronunciation playback.
// Built-in terms have recordings in audio/<id>.mp3 (generated with Indic Parler-TTS, see
// scripts/audio/). Words the user adds use the device's Hindi voice, which is only approximate
// (Hindi drops the final "a").
//
// play() must start the <audio> element synchronously inside the tap handler: Chrome on Android
// rejects play() that happens after an await. The service worker answers Range requests for
// audio files, so Safari can play them straight from the offline cache.
import * as store from './store.js';

let current = null;
export let lastError = null;

export const hasRecording = (term) => !!term?.audio;
export const recordingUrl = (term) => `audio/${term.id}.mp3`;

export function stop() {
  if (current) {
    current.pause();
    current = null;
  }
  if ('speechSynthesis' in globalThis) speechSynthesis.cancel();
}

/**
 * Play a term's pronunciation. Call directly from a tap handler (no await before it).
 * Resolves when playback ends; rejects with a readable message if a recording can't play.
 */
export function play(term, { quiet = false } = {}) {
  stop();
  const slow = store.settings().audioSpeed === 'slow';
  if (!hasRecording(term)) return speak(term.deva || iastToDevanagari(term.skt || ''), slow);

  const a = new Audio(recordingUrl(term));
  a.preservesPitch = true;
  a.playbackRate = slow ? 0.75 : 1;
  current = a;
  const started = a.play(); // synchronous call keeps the user gesture
  return new Promise((resolve, reject) => {
    const fail = (why) => {
      lastError = why;
      if (current === a) current = null;
      if (quiet) resolve(); else reject(new Error(why));
    };
    a.addEventListener('ended', () => resolve(), { once: true });
    a.addEventListener('pause', () => resolve(), { once: true }); // stopped by another play()
    a.addEventListener('error', () => fail(`錄音無法播放 Recording could not play (media error ${a.error?.code ?? '?'})`), { once: true });
    started?.catch((e) => fail(e.name === 'NotAllowedError'
      ? '瀏覽器擋下了自動播放，請點 🔊 · The browser blocked playback; tap 🔊'
      : `錄音無法播放 Recording could not play (${e.name}: ${e.message})`));
  });
}

function speak(text, slow) {
  if (!('speechSynthesis' in globalThis) || !text) return Promise.resolve();
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const v = voices.find((x) => /^(sa|hi)[-_]/i.test(x.lang)) || voices.find((x) => /^mr|^ne/i.test(x.lang));
  if (v) u.voice = v;
  u.lang = v?.lang || 'hi-IN';
  u.rate = slow ? 0.6 : 0.8;
  return new Promise((r) => {
    u.onend = r;
    u.onerror = r;
    speechSynthesis.speak(u);
  });
}

// ---------- IAST → Devanagari (for user-added words) ----------
const V = { a: 'अ', ā: 'आ', i: 'इ', ī: 'ई', u: 'उ', ū: 'ऊ', ṛ: 'ऋ', ṝ: 'ॠ', ḷ: 'ऌ', e: 'ए', ai: 'ऐ', o: 'ओ', au: 'औ' };
const M = { a: '', ā: 'ा', i: 'ि', ī: 'ी', u: 'ु', ū: 'ू', ṛ: 'ृ', ṝ: 'ॄ', ḷ: 'ॢ', e: 'े', ai: 'ै', o: 'ो', au: 'ौ' };
const C = {
  kh: 'ख', gh: 'घ', ch: 'छ', jh: 'झ', ṭh: 'ठ', ḍh: 'ढ', th: 'थ', dh: 'ध', ph: 'फ', bh: 'भ',
  k: 'क', g: 'ग', ṅ: 'ङ', c: 'च', j: 'ज', ñ: 'ञ', ṭ: 'ट', ḍ: 'ड', ṇ: 'ण', t: 'त', d: 'द', n: 'न',
  p: 'प', b: 'ब', m: 'म', y: 'य', r: 'र', l: 'ल', v: 'व', ś: 'श', ṣ: 'ष', s: 'स', h: 'ह',
};
const tokens = (keys) => keys.sort((a, b) => b.length - a.length);
const VK = tokens(Object.keys(V));
const CK = tokens(Object.keys(C));

export function iastToDevanagari(input) {
  const s = input.toLowerCase().normalize('NFC');
  let out = '';
  let i = 0;
  let afterConsonant = false;
  const match = (keys) => keys.find((k) => s.startsWith(k, i));
  while (i < s.length) {
    const c = match(CK);
    if (c) {
      if (afterConsonant) out += '्';
      out += C[c];
      i += c.length;
      afterConsonant = true;
      continue;
    }
    const v = match(VK);
    if (v) {
      out += afterConsonant ? M[v] : V[v];
      i += v.length;
      afterConsonant = false;
      continue;
    }
    if (afterConsonant && !/[ṃṁḥ]/.test(s[i])) { out += '्'; }
    if (s[i] === 'ṃ' || s[i] === 'ṁ') out += 'ं';
    else if (s[i] === 'ḥ') out += 'ः';
    else if (/[\s-]/.test(s[i])) out += s[i] === '-' ? '' : ' ';
    afterConsonant = false;
    i++;
  }
  if (afterConsonant) out += '्';
  return out;
}
