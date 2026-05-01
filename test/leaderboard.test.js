'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { leaderboard } = require('../src/tasks/leaderboard');

test('leaderboard — sorts and ranks scores', () => {
  const result = leaderboard({
    scores: [
      { id: 1, name: 'Alice', score: 80 },
      { id: 2, name: 'Bob', score: 100 },
      { id: 3, name: 'Carol', score: 90 },
    ],
  });

  assert.equal(result.ranked.length, 3);
  assert.equal(result.ranked[0].name, 'Bob');
  assert.equal(result.ranked[0].rank, 1);
  assert.equal(result.ranked[1].name, 'Carol');
  assert.equal(result.ranked[1].rank, 2);
  assert.equal(result.ranked[2].name, 'Alice');
  assert.equal(result.ranked[2].rank, 3);
});

test('leaderboard — tied scores share the same rank', () => {
  const result = leaderboard({
    scores: [
      { id: 1, name: 'Alice', score: 100 },
      { id: 2, name: 'Bob', score: 100 },
      { id: 3, name: 'Carol', score: 80 },
    ],
  });

  assert.equal(result.ranked[0].rank, 1);
  assert.equal(result.ranked[1].rank, 1);
  assert.equal(result.ranked[2].rank, 3);
});

test('leaderboard — respects topN limit', () => {
  const result = leaderboard({
    scores: [
      { id: 1, name: 'A', score: 10 },
      { id: 2, name: 'B', score: 20 },
      { id: 3, name: 'C', score: 30 },
    ],
    topN: 2,
  });

  assert.equal(result.ranked.length, 2);
  assert.equal(result.ranked[0].name, 'C');
});

test('leaderboard — empty scores returns empty ranked list', () => {
  const result = leaderboard({ scores: [] });
  assert.equal(result.ranked.length, 0);
});

test('leaderboard — throws if scores is not an array', () => {
  assert.throws(() => leaderboard({ scores: 'bad' }), /must be an array/);
});
