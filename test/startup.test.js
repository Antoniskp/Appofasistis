'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { checkLocalStartup } = require('../src/localLaw/startup');

async function withServer(handler, fn) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await fn(server.address().port); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('second launcher recognizes the running law app without starting another instance', async () => {
  await withServer((req, res) => {
    assert.equal(req.url, '/api/laws/status');
    res.end(JSON.stringify({ storageEngine: 'Neo4j', stats: { documents: 4 } }));
  }, async port => {
    assert.deepEqual(await checkLocalStartup(port), { alreadyRunning: true, url: 'http://localhost:' + port + '/' });
  });
});

test('an unrelated occupied port produces a clear startup error', async () => {
  await withServer((req, res) => { res.writeHead(404); res.end('Other app'); }, async port => {
    await assert.rejects(checkLocalStartup(port), /being used by another application/);
  });
});

test('an available port permits a normal start', async () => {
  let port;
  await withServer((req, res) => res.end(), async value => { port = value; });
  assert.equal((await checkLocalStartup(port)).alreadyRunning, false);
  await assert.rejects(checkLocalStartup(0), /between 1 and 65535/);
});
