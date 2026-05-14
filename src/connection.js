'use strict';

const WebSocket = require('ws');
const config = require('./config');
const logger = require('./logger');

const MAX_RECONNECT_DELAY = 60000; // 60 seconds cap
const SEND_RETRY_BASE_DELAY = 500;
const SEND_RETRY_MAX_ATTEMPTS = 3;

function sanitizeErrorMessage(message) {
  const text = typeof message === 'string' ? message : String(message || 'Unknown error');
  return config.workerToken ? text.split(config.workerToken).join('[REDACTED]') : text;
}

class Connection {
  constructor(onMessage) {
    this._onMessage = onMessage;
    this._ws = null;
    this._reconnectAttempt = 0;
    this._reconnectTimer = null;
    this._closing = false;
  }

  connect() {
    if (this._closing) return;

    const url = `${config.serverUrl}?token=${config.workerToken}`;
    const headers = {
      'x-worker-id': config.workerId,
      'x-worker-token': config.workerToken,
    };
    logger.info(`Connecting to ${config.serverUrl} ...`);

    const ws = new WebSocket(url, { headers });
    this._ws = ws;

    ws.on('open', () => {
      this._reconnectAttempt = 0;
      logger.info('WebSocket connection established.');
      this.send({
        type: 'register',
        workerId: config.workerId,
        name: config.workerName,
        capabilities: ['linkPreview', 'pollStats', 'leaderboard', 'textAnalysis'],
        maxConcurrentTasks: config.maxConcurrentTasks,
      });
    });

    ws.on('message', (data) => {
      let parsed;
      try {
        parsed = JSON.parse(data.toString());
      } catch (err) {
        logger.warn('Received non-JSON message, ignoring.', data.toString().slice(0, 200));
        return;
      }
      this._onMessage(parsed);
    });

    ws.on('close', (code, reason) => {
      logger.warn(`WebSocket closed (code=${code}, reason=${reason || 'none'}).`);
      if (code === 1008 || code === 4001 || code === 4003) {
        logger.warn('Authentication failure while connecting to backend.', {
          workerId: config.workerId,
          code,
        });
      }
      if (!this._closing) {
        this._scheduleReconnect();
      }
    });

    ws.on('error', (err) => {
      logger.error('WebSocket error:', sanitizeErrorMessage(err.message), {
        workerId: config.workerId,
      });
      // The 'close' event will fire after this, triggering reconnect
    });
  }

  _scheduleReconnect() {
    const delay = Math.min(
      config.reconnectDelay * Math.pow(2, this._reconnectAttempt),
      MAX_RECONNECT_DELAY
    );
    this._reconnectAttempt += 1;
    logger.info(`Reconnecting in ${delay}ms (attempt #${this._reconnectAttempt})...`);
    this._reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  send(obj, attempt = 1) {
    const message = {
      ...obj,
      workerId: (obj && obj.workerId) || config.workerId,
    };
    const messageType = message && message.type ? message.type : 'unknown';

    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      if (attempt >= SEND_RETRY_MAX_ATTEMPTS) {
        logger.error('Outbound API call failed: WebSocket not open.', {
          workerId: config.workerId,
          messageType,
          attempt,
        });
        return;
      }

      const delay = Math.min(SEND_RETRY_BASE_DELAY * Math.pow(2, attempt - 1), MAX_RECONNECT_DELAY);
      logger.warn('Outbound API call failed; retrying send.', {
        workerId: config.workerId,
        messageType,
        attempt,
        nextDelayMs: delay,
      });
      setTimeout(() => this.send(message, attempt + 1), delay);
      return;
    }

    try {
      this._ws.send(JSON.stringify(message));
    } catch (err) {
      if (attempt >= SEND_RETRY_MAX_ATTEMPTS) {
        logger.error('Outbound API call failed permanently during send.', {
          workerId: config.workerId,
          messageType,
          attempt,
          error: sanitizeErrorMessage(err.message),
        });
        return;
      }

      const delay = Math.min(SEND_RETRY_BASE_DELAY * Math.pow(2, attempt - 1), MAX_RECONNECT_DELAY);
      logger.warn('Outbound API call send error; retrying.', {
        workerId: config.workerId,
        messageType,
        attempt,
        nextDelayMs: delay,
        error: sanitizeErrorMessage(err.message),
      });
      setTimeout(() => this.send(message, attempt + 1), delay);
    }
  }

  close() {
    this._closing = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    logger.info('Connection closed gracefully.');
  }
}

module.exports = Connection;
