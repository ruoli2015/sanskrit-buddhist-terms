import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchZh, matchEn, matchSkt, normEn } from '../app/js/grade.js';

const s2t = { '识': '識', '蕴': '蘊', '触': '觸', '为': '為' };

test('Chinese: traditional, simplified and alternates', () => {
  assert.ok(matchZh('識', ['識', '識蘊'], s2t));
  assert.ok(matchZh('识', ['識'], s2t));
  assert.ok(matchZh(' 识蕴 ', ['識', '識蘊'], s2t));
  assert.ok(!matchZh('想', ['識'], s2t));
  assert.ok(!matchZh('', ['識'], s2t));
});

test('English: case, articles, plurals, parentheses, small typos', () => {
  const ans = ['formations', 'mental formations', 'omnipresent (factors)'];
  assert.ok(matchEn('Formations', ans));
  assert.ok(matchEn('formation', ans));
  assert.ok(matchEn('the mental formations', ans));
  assert.ok(matchEn('omnipresent', ans));
  assert.ok(matchEn('omnipresent factors', ans));
  assert.ok(matchEn('formatoins', ans)); // typo
  assert.ok(matchEn('dependent-origination', ['dependent origination']));
  assert.ok(!matchEn('feeling', ans));
  assert.ok(!matchEn('perception', ['conception']));
  assert.equal(normEn('The Mind-King!'), 'mind king');
});

test('Sanskrit: diacritics optional, ṃ/ś variants', () => {
  assert.ok(matchSkt('saṃskāra', ['saṃskāra']));
  assert.ok(matchSkt('samskara', ['saṃskāra']));
  assert.ok(matchSkt('sanskara', ['saṃskāra']));
  assert.ok(matchSkt('sparsha', ['sparśa']));
  assert.ok(matchSkt('sparsa', ['sparśa']));
  assert.ok(matchSkt('pratityasamutpada', ['pratītyasamutpāda']));
  assert.ok(matchSkt('pratityasamutpda', ['pratītyasamutpāda'])); // one typo in a long word
  assert.ok(!matchSkt('vedana', ['saṃjñā']));
});
