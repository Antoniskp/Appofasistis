'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');

function reloadConfig() {
  delete require.cache[require.resolve('../src/config')];
  return require('../src/config');
}

test('config uses WORKER_ID when provided', () => {
  const previous = process.env.WORKER_ID;
  process.env.WORKER_ID = 'worker-from-env';

  try {
    const config = reloadConfig();
    assert.equal(config.workerId, 'worker-from-env');
  } finally {
    process.env.WORKER_ID = previous;
    reloadConfig();
  }
});

test('config falls back to hostname when WORKER_ID is missing', () => {
  const previous = process.env.WORKER_ID;
  delete process.env.WORKER_ID;

  try {
    const config = reloadConfig();
    assert.equal(config.workerId, os.hostname());
  } finally {
    process.env.WORKER_ID = previous;
    reloadConfig();
  }
});
