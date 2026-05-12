'use strict';

const http = require('http');

const MAX_BODY_BYTES = 1024 * 1024; // 1MB

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const err = new Error('Payload too large');
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        err.statusCode = 400;
        err.message = 'Invalid JSON body';
        reject(err);
      }
    });

    req.on('error', reject);
  });
}

function startInternalApiServer({ port, workerToken, logger }) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, {
        ok: true,
        service: 'appofasistis',
        time: new Date().toISOString(),
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/internal/snapshots') {
      const providedToken = req.headers['x-worker-token'];
      if (!providedToken || providedToken !== workerToken) {
        sendJson(res, 401, {
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Unauthorized',
          },
        });
        return;
      }

      try {
        const payload = await readJsonBody(req);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          sendJson(res, 400, {
            ok: false,
            error: {
              code: 'INVALID_PAYLOAD',
              message: 'Payload must be a JSON object',
            },
          });
          return;
        }

        sendJson(res, 200, {
          ok: true,
          receivedAt: new Date().toISOString(),
        });
      } catch (err) {
        const statusCode = err.statusCode || 500;
        const message = statusCode === 500 ? 'Internal server error' : err.message;
        logger.error('Internal snapshots request failed:', message);
        sendJson(res, statusCode, {
          ok: false,
          error: {
            code: statusCode === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
            message,
          },
        });
      }
      return;
    }

    sendJson(res, 404, {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Not found',
      },
    });
  });

  server.listen(port, () => {
    const address = server.address();
    const resolvedPort = typeof address === 'object' && address ? address.port : port;
    logger.info(`Internal API listening on port ${resolvedPort}`);
  });

  return () => {
    server.close();
  };
}

module.exports = {
  startInternalApiServer,
};
