'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startInternalApiServer } = require('../src/internalApi');

function createLoggerStub() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

async function withServer(fn) {
  const stop = startInternalApiServer({
    port: 3101,
    workerToken: 'test-token',
    logger: createLoggerStub(),
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fn();
  } finally {
    stop();
  }
}

test('internal API health and snapshots contract', async () => {
  await withServer(async () => {
    const healthRes = await fetch('http://127.0.0.1:3101/health');
    assert.equal(healthRes.status, 200);
    const healthBody = await healthRes.json();
    assert.equal(healthBody.ok, true);
    assert.equal(healthBody.service, 'appofasistis');
    assert.ok(/\d{4}-\d{2}-\d{2}T/.test(healthBody.time));

    const unauthorizedRes = await fetch('http://127.0.0.1:3101/internal/snapshots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });
    assert.equal(unauthorizedRes.status, 401);

    const invalidPayloadRes = await fetch('http://127.0.0.1:3101/internal/snapshots', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-worker-token': 'test-token',
      },
      body: JSON.stringify(['bad-payload']),
    });
    assert.equal(invalidPayloadRes.status, 400);

    const successRes = await fetch('http://127.0.0.1:3101/internal/snapshots', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-worker-token': 'test-token',
      },
      body: JSON.stringify({ source: 'appofa', items: [] }),
    });
    assert.equal(successRes.status, 200);
    const successBody = await successRes.json();
    assert.equal(successBody.ok, true);
    assert.ok(/\d{4}-\d{2}-\d{2}T/.test(successBody.receivedAt));
  });
});
