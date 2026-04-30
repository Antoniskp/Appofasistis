'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pollStats } = require('../src/tasks/pollStats');

test('pollStats — counts votes and computes percentages', () => {
  const result = pollStats({
    votes: [0, 1, 0, 2, 1, 0],
    options: ['Alpha', 'Beta', 'Gamma'],
  });

  assert.equal(result.total, 6);
  assert.equal(result.results.length, 3);
  assert.equal(result.results[0].option, 'Alpha');
  assert.equal(result.results[0].votes, 3);
  assert.equal(result.results[0].percentage, 50);
  assert.equal(result.results[1].option, 'Beta');
  assert.equal(result.results[1].votes, 2);
  assert.equal(result.results[2].option, 'Gamma');
  assert.equal(result.results[2].votes, 1);
});

test('pollStats — works without option labels', () => {
  const result = pollStats({ votes: [0, 0, 1] });

  assert.equal(result.total, 3);
  assert.equal(result.results[0].option, 'Option 1');
  assert.equal(result.results[1].option, 'Option 2');
});

test('pollStats — empty votes array returns zero total', () => {
  const result = pollStats({ votes: [], options: ['A', 'B'] });

  assert.equal(result.total, 0);
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].percentage, 0);
});

test('pollStats — includes all options even if none voted', () => {
  const result = pollStats({ votes: [0], options: ['Yes', 'No', 'Abstain'] });

  assert.equal(result.results.length, 3);
  assert.equal(result.results[1].votes, 0);
  assert.equal(result.results[2].votes, 0);
});

test('pollStats — throws if votes is not an array', () => {
  assert.throws(() => pollStats({ votes: null }), /must be an array/);
});
