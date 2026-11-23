'use strict';

const http = require('node:http');
const net = require('node:net');

function readLocalStatus(port) {
  return new Promise(resolve => {
    const request = http.get({ hostname: '127.0.0.1', port, path: '/api/laws/status', timeout: 2000 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 65536) request.destroy();
      });
      response.on('end', () => {
        try {
          const status = JSON.parse(body);
          resolve(response.statusCode === 200 && status.storageEngine === 'Neo4j' && status.stats ? status : null);
        } catch { resolve(null); }
      });
      response.on('error', () => resolve(null));
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  });
}

async function checkLocalStartup(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('INTERNAL_API_PORT must be between 1 and 65535.');
  const existing = await readLocalStatus(port);
  if (existing) return { alreadyRunning: true, url: 'http://localhost:' + port + '/' };
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', error => reject(new Error(error.code === 'EADDRINUSE'
      ? 'Port ' + port + ' is being used by another application. Set a different INTERNAL_API_PORT in .env.'
      : 'Cannot open local port ' + port + ': ' + error.message)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
  return { alreadyRunning: false, url: 'http://localhost:' + port + '/' };
}

module.exports = { checkLocalStartup };
