// Sanskrit pronunciation playback.
// Built-in terms have recorded files in audio/<id>.m4a (generated with Indic Parler-TTS, see
// scripts/audio/). Words the user adds fall back to the device's Hindi voice, which is only
// approximate (Hindi drops the final "a").
import * as store from './store.js';

const blobs = new Map(); // id -> object URL
let current = null;

export const hasRecording = (term) => !!term?.audio;

// Fetch the file as a blob first: Safari can't play media served from a service-worker cache
// without range support, but plays blob URLs fine, online or offline.
async function urlFor(term) {
  if (blobs.has(term.id)) return blobs.get(term.id);
  const res = await fetch(`audio/${term.id}.m4a`);
  if (!res.ok) throw new Error(`audio ${res.status}`);
  const url = URL.createObjectURL(await res.blob());
  blobs.set(term.id, url);
  return url;
}

export function stop() {
  if (current) {
    current.pause();
    current = null;
  }
  if ('speechSynthesis' in globalThis) speechSynthesis.cancel();
}

/** Play a term's pronunciation. Resolves when playback ends (or fails quietly). */
export async function play(term) {
  stop();
  const slow = store.settings().audioSpeed === 'slow';
  if (hasRecording(term)) {
    try {
      const a = new Audio(await urlFor(term));
      a.preservesPitch = true;
      a.playbackRate = slow ? 0.75 : 1;
      current = a;
      await a.play();
      await new Promise((r) => a.addEventListener('ended', r, { once: true }));
      return;
    } catch (e) {
      console.warn('recording failed, using device voice', e);
    }
  }
  return speak(term.deva || iastToDevanagari(term.skt || ''), slow);
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
