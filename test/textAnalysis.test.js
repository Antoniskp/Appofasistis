'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { textAnalysis } = require('../src/tasks/textAnalysis');

test('textAnalysis — counts words correctly', () => {
  const result = textAnalysis({ text: 'Hello world hello world foo' });
  assert.equal(result.wordCount, 5);
});

test('textAnalysis — returns at least 1 minute reading time', () => {
  const result = textAnalysis({ text: 'short text' });
  assert.equal(result.readingTimeMinutes, 1);
});

test('textAnalysis — estimates reading time for long text', () => {
  const words = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
  const result = textAnalysis({ text: words });
  assert.equal(result.readingTimeMinutes, 2);
});

test('textAnalysis — extracts top keywords', () => {
  const result = textAnalysis({
    text: 'apple orange apple banana apple orange',
    topKeywords: 2,
  });

  assert.equal(result.keywords.length, 2);
  assert.equal(result.keywords[0].word, 'apple');
  assert.equal(result.keywords[0].count, 3);
  assert.equal(result.keywords[1].word, 'orange');
  assert.equal(result.keywords[1].count, 2);
});

test('textAnalysis — excludes stop words from keywords', () => {
  const result = textAnalysis({ text: 'the cat sat on the mat' });
  const words = result.keywords.map((k) => k.word);
  assert.ok(!words.includes('the'), 'stop word "the" should be excluded');
  assert.ok(!words.includes('on'), 'stop word "on" should be excluded');
});

test('textAnalysis — throws if text is not a string', () => {
  assert.throws(() => textAnalysis({ text: 42 }), /must be a string/);
});

test('textAnalysis — handles empty string', () => {
  const result = textAnalysis({ text: '' });
  assert.equal(result.wordCount, 0);
  assert.equal(result.keywords.length, 0);
});
