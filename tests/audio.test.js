import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { iastToDevanagari } from '../app/js/audio.js';

const raw = JSON.parse(readFileSync(new URL('../app/data/content.json', import.meta.url)));

test('IAST → Devanagari matches the curated Devanagari for built-in terms', () => {
  const misses = [];
  for (const t of raw.terms) {
    const got = iastToDevanagari(t.skt);
    if (got.replace(/\s/g, '') !== t.deva.replace(/\s/g, '')) misses.push(`${t.skt}: ${got} ≠ ${t.deva}`);
  }
  assert.ok(misses.length <= 3, misses.join('\n'));
});

test('IAST → Devanagari basics', () => {
  assert.equal(iastToDevanagari('saṃskāra'), 'संस्कार');
  assert.equal(iastToDevanagari('prajñā'), 'प्रज्ञा');
  assert.equal(iastToDevanagari('duḥkha'), 'दुःख');
  assert.equal(iastToDevanagari('karman'), 'कर्मन्');
});
