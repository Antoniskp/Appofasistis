'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
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
    port: 0,
    workerToken: 'test-token',
    logger: createLoggerStub(),
  });

  try {
    await once(stop.server, 'listening');
    await fn('http://127.0.0.1:' + stop.server.address().port);
  } finally {
    stop();
  }
}

test('internal API health and snapshots contract', async () => {
  await withServer(async (base) => {
    const healthRes = await fetch(base + '/health');
    assert.equal(healthRes.status, 200);
    const healthBody = await healthRes.json();
    assert.equal(healthBody.ok, true);
    assert.equal(healthBody.service, 'appofasistis');
    assert.ok(/\d{4}-\d{2}-\d{2}T/.test(healthBody.time));

    const unauthorizedRes = await fetch(base + '/internal/snapshots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });
    assert.equal(unauthorizedRes.status, 401);

    const invalidPayloadRes = await fetch(base + '/internal/snapshots', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-worker-token': 'test-token',
      },
      body: JSON.stringify(['bad-payload']),
    });
    assert.equal(invalidPayloadRes.status, 400);

    const successRes = await fetch(base + '/internal/snapshots', {
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
