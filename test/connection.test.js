'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WebSocketServer } = require('ws');

function clearWorkerModules() {
  delete require.cache[require.resolve('../src/config')];
  delete require.cache[require.resolve('../src/logger')];
  delete require.cache[require.resolve('../src/connection')];
}

test('connection sends worker auth headers and identifies outbound messages', async () => {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((resolve) => wss.once('listening', resolve));
  const port = wss.address().port;

  const oldEnv = {
    SERVER_URL: process.env.SERVER_URL,
    WORKER_TOKEN: process.env.WORKER_TOKEN,
    WORKER_ID: process.env.WORKER_ID,
    WORKER_NAME: process.env.WORKER_NAME,
    MAX_CONCURRENT_TASKS: process.env.MAX_CONCURRENT_TASKS,
  };

  process.env.SERVER_URL = `ws://127.0.0.1:${port}/ws/workers`;
  process.env.WORKER_TOKEN = 'test-worker-token';
  process.env.WORKER_ID = 'worker-a';
  process.env.WORKER_NAME = 'test-worker-name';
  process.env.MAX_CONCURRENT_TASKS = '4';

  clearWorkerModules();
  const Connection = require('../src/connection');

  let reqHeaders;
  let reqUrl;
  const received = [];

  wss.on('connection', (socket, req) => {
    reqHeaders = req.headers;
    reqUrl = req.url;
    socket.on('message', (data) => received.push(JSON.parse(data.toString())));
  });

  const connection = new Connection(() => {});
  connection.connect();

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timed out waiting for register payload')), 1000);
      const poll = () => {
        if (received.length > 0) {
          clearTimeout(timeout);
          resolve();
          return;
        }
        setTimeout(poll, 25);
      };
      poll();
    });

    assert.equal(reqHeaders['x-worker-id'], 'worker-a');
    assert.equal(reqHeaders['x-worker-token'], 'test-worker-token');
    assert.ok(reqUrl.includes('token=test-worker-token'));

    assert.equal(received[0].type, 'register');
    assert.equal(received[0].workerId, 'worker-a');
    assert.equal(received[0].name, 'test-worker-name');
    assert.equal(received[0].maxConcurrentTasks, 4);

    connection.send({ type: 'pong' });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timed out waiting for outbound message')), 1000);
      const poll = () => {
        if (received.length > 1) {
          clearTimeout(timeout);
          resolve();
          return;
        }
        setTimeout(poll, 25);
      };
      poll();
    });

    assert.equal(received[1].type, 'pong');
    assert.equal(received[1].workerId, 'worker-a');
  } finally {
    connection.close();
    await new Promise((resolve) => wss.close(resolve));

    process.env.SERVER_URL = oldEnv.SERVER_URL;
    process.env.WORKER_TOKEN = oldEnv.WORKER_TOKEN;
    process.env.WORKER_ID = oldEnv.WORKER_ID;
    process.env.WORKER_NAME = oldEnv.WORKER_NAME;
    process.env.MAX_CONCURRENT_TASKS = oldEnv.MAX_CONCURRENT_TASKS;
    clearWorkerModules();
  }
});
