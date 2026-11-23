'use strict';

const CAPABILITY = 'lawLibraryRead';
const CHUNK_BYTES = 64 * 1024;
const MAX_BYTES = 48 * 1024 * 1024;
const MAX_REQUESTS = 12;
const ALLOWED_PATHS = new Set([
  '/laws', '/laws/favicon.svg', '/laws/style.css', '/laws/app.js', '/laws/citationText.js', '/laws/topicGuides.js',
  '/laws/logos/parliament.gif', '/laws/logos/national-printing.png', '/laws/logos/diavgeia.png',
  '/laws/logos/eurlex.svg', '/laws/logos/european-union.svg',
  '/api/laws/status', '/api/laws/guides', '/api/laws/gazettes', '/api/laws/documents',
  '/api/laws/document', '/api/laws/connections',
]);
const isReaderPath = path => typeof path === 'string' &&
  (ALLOWED_PATHS.has(path) || /^\/api\/laws\/files\/[a-f0-9]{64}$/.test(path));
const send = (socket, message) => new Promise((resolve, reject) => {
  socket.send(JSON.stringify(message), error => error ? reject(error) : resolve());
});

function createLawLibraryRelay({ port, logger }) {
  const origin = 'http://127.0.0.1:' + port;
  const active = new Map();

  async function respond(socket, message) {
    const { requestId, path, search } = message;
    const controller = new AbortController();
    const sendReply = (type, fields = {}) => send(socket, { type, requestId, ...fields });
    if (!isReaderPath(path) || typeof search !== 'string' || search.length > 8192 || active.size >= MAX_REQUESTS) {
      await sendReply('law_library_error');
      return;
    }

    const url = new URL(path, origin);
    url.search = search;
    url.searchParams.set('scope', 'source');
    active.set(requestId, { socket, controller });

    try {
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
      });
      await sendReply('law_library_start', {
        status: response.status,
        contentType: response.headers.get('content-type') || 'application/octet-stream',
      });
      let bytes = 0;
      for await (const chunk of response.body || []) {
        bytes += chunk.byteLength;
        if (bytes > MAX_BYTES) throw new Error('Legal library response exceeds the size limit.');
        const buffer = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        for (let offset = 0; offset < buffer.length; offset += CHUNK_BYTES) {
          if (controller.signal.aborted) return;
          await sendReply('law_library_chunk', { data: buffer.subarray(offset, offset + CHUNK_BYTES).toString('base64') });
        }
      }
      await sendReply('law_library_end');
    } catch {
      if (!controller.signal.aborted) await sendReply('law_library_error');
    } finally {
      controller.abort();
      active.delete(requestId);
    }
  }

  function handleMessage(message, socket) {
    if (message?.type !== 'law_library_request' && message?.type !== 'law_library_cancel') return false;
    const { requestId } = message;
    if (typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/.test(requestId)) return true;
    const request = active.get(requestId);
    if (message.type === 'law_library_cancel') {
      if (request?.socket === socket) request.controller.abort();
    } else if (!request) {
      respond(socket, message).catch(() => logger.debug('Unable to send legal library response.'));
    }
    return true;
  }

  function handleClose(socket) {
    for (const request of active.values()) {
      if (request.socket === socket) request.controller.abort();
    }
  }

  return { capability: CAPABILITY, handleMessage, handleClose };
}

module.exports = { createLawLibraryRelay };
