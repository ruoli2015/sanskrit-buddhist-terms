// Answer checking for typed answers. Pure functions (unit-tested in tests/grade.test.js).
import { stripDiacritics } from './util.js';

// ---------- Chinese ----------
// s2t: simplified -> traditional character map generated at build time for characters used in answers.
export function normZh(s, s2t = {}) {
  return Array.from(String(s || '').replace(/[\s\p{P}\p{S}]/gu, ''))
    .map((c) => s2t[c] || c)
    .join('');
}

export function matchZh(input, answers, s2t) {
  const got = normZh(input, s2t);
  if (!got) return false;
  return answers.some((a) => normZh(a, s2t) === got);
}

// ---------- English ----------
const ARTICLES = /\b(the|a|an|to)\b/g;

export function normEn(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[‐-―-]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(ARTICLES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "omnipresent (factors)" -> ["omnipresent factors", "omnipresent"]
export function enForms(answer) {
  const withParen = answer.replace(/[()]/g, '');
  const without = answer.replace(/\([^)]*\)/g, '');
  return [...new Set([withParen, without].map(normEn).filter(Boolean))];
}

const singular = (w) => w.replace(/(ies)$/, 'y').replace(/(?<=[^s])s$/, '');

// Edit distance where swapping two adjacent letters counts as one typo (optimal string alignment).
export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

const typoAllowance = (len) => (len >= 10 ? 2 : len >= 5 ? 1 : 0);

export function matchEn(input, answers) {
  const got = normEn(input);
  if (!got) return false;
  const gotS = got.split(' ').map(singular).join(' ');
  for (const a of answers) {
    for (const f of enForms(a)) {
      if (f === got) return true;
      const fS = f.split(' ').map(singular).join(' ');
      if (fS === gotS) return true;
      if (levenshtein(fS, gotS) <= typoAllowance(fS.length)) return true;
    }
  }
  return false;
}

// ---------- Sanskrit (IAST) ----------
// Accepts answers typed without diacritics, with ṃ as m or n, ś/ṣ as s or sh, ṛ as r or ri.
export function sktForms(answer) {
  let forms = [String(answer).toLowerCase().normalize('NFC')];
  const expand = (re, alts) => {
    const out = [];
    for (const f of forms) for (const alt of alts) out.push(f.replace(re, alt));
    forms = [...new Set(out)];
  };
  expand(/ṃ|ṁ/g, ['ṃ', 'm', 'n']);
  expand(/[śṣ]/g, ['s', 'sh']);
  expand(/ṛ/g, ['r', 'ri']);
  return [...new Set(forms.map((f) => stripDiacritics(f).replace(/[^a-z]/g, '')))];
}

export const normSkt = (s) => stripDiacritics(String(s || '').toLowerCase()).replace(/[^a-z]/g, '');

export function matchSkt(input, answers) {
  const got = normSkt(input);
  if (!got) return false;
  return answers.some((a) => sktForms(a).some((f) => f === got || (f.length >= 8 && levenshtein(f, got) <= 1)));
}
