// Small shared helpers (no DOM access, so they can be unit-tested in Node).

export const DAY_MS = 86400000;

// Local calendar day, e.g. "2026-09-30".
export function dayKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Strip IAST diacritics: saṃskāra -> samskara.
export const stripDiacritics = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Minimal Markdown: paragraphs, **bold**, *italic*, "- " and "1. " lists. Input is escaped first.
export function md(text) {
  if (!text) return '';
  const inline = (s) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
  const blocks = String(text).trim().split(/\n\s*\n/);
  return blocks
    .map((b) => {
      const lines = b.split('\n');
      if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`;
      }
      if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
        return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+\.\s+/, ''))}</li>`).join('')}</ol>`;
      }
      return `<p>${lines.map(inline).join('<br>')}</p>`;
    })
    .join('');
}

// A stable pseudo-random index for a given string (e.g. today's date -> quote of the day).
export function hashIndex(str, n) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return Math.abs(h) % n;
}

export function cbetaUrl(ref) {
  return `https://cbetaonline.dila.edu.tw/zh/${ref}`;
}

// T02n0099_p0009c07 -> "T02, no. 99, p. 9c07"
export function formatRef(ref) {
  const m = /^([A-Z]+)(\d+)n(\w+?)_p(\d+)([a-z])(\d+)$/.exec(ref || '');
  if (!m) return ref || '';
  return `${m[1]}${m[2]}, no. ${m[3].replace(/^0+/, '')}, p. ${+m[4]}${m[5]}${m[6]}`;
}
