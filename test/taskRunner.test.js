'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const logger = require('../src/logger');
const { createTaskRunner } = require('../src/taskRunner');

test('taskRunner handles health_request over websocket', () => {
  const sentMessages = [];
  const taskRunner = createTaskRunner({
    send: (msg) => sentMessages.push(msg),
  });

  taskRunner.handleMessage({ type: 'health_request', requestId: 'health-req-1' });

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, 'health_response');
  assert.equal(sentMessages[0].requestId, 'health-req-1');
  assert.equal(sentMessages[0].ok, true);
  assert.equal(sentMessages[0].service, 'appofasistis');
  assert.ok(/\d{4}-\d{2}-\d{2}T/.test(sentMessages[0].time));
  assert.equal(typeof sentMessages[0].load, 'number');
  assert.equal(typeof sentMessages[0].memory.usedMB, 'number');
  assert.equal(typeof sentMessages[0].memory.totalMB, 'number');
  assert.ok(sentMessages[0].memory.usedMB >= 0);
  assert.ok(sentMessages[0].memory.totalMB >= sentMessages[0].memory.usedMB);
  assert.equal(sentMessages[0].activeTasks, 0);
});

test('taskRunner handles snapshot_request over websocket', () => {
  const sentMessages = [];
  const infoCalls = [];
  const originalInfo = logger.info;
  logger.info = (...args) => infoCalls.push(args);

  try {
    const taskRunner = createTaskRunner({
      send: (msg) => sentMessages.push(msg),
    });
    const snapshot = { source: 'appofa', items: [{ id: 1 }] };

    taskRunner.handleMessage({
      type: 'snapshot_request',
      requestId: 'snapshot-req-1',
      snapshot,
    });

    assert.equal(infoCalls.length, 1);
    assert.equal(infoCalls[0][0], 'Snapshot received via WebSocket:');
    assert.equal(infoCalls[0][1], JSON.stringify(snapshot));

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].type, 'snapshot_response');
    assert.equal(sentMessages[0].requestId, 'snapshot-req-1');
    assert.equal(sentMessages[0].ok, true);
    assert.ok(/\d{4}-\d{2}-\d{2}T/.test(sentMessages[0].receivedAt));
  } finally {
    logger.info = originalInfo;
  }
});
