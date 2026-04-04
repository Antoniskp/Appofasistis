'use strict';

const WebSocket = require('ws');
const config = require('./config');
const logger = require('./logger');

const MAX_RECONNECT_DELAY = 60000; // 60 seconds cap

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
    logger.info(`Connecting to ${config.serverUrl} ...`);

    const ws = new WebSocket(url);
    this._ws = ws;

    ws.on('open', () => {
      this._reconnectAttempt = 0;
      logger.info('WebSocket connection established.');
      this.send({
        type: 'register',
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
      if (!this._closing) {
        this._scheduleReconnect();
      }
    });

    ws.on('error', (err) => {
      logger.error('WebSocket error:', err.message);
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

  send(obj) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot send — WebSocket is not open.');
      return;
    }
    try {
      this._ws.send(JSON.stringify(obj));
    } catch (err) {
      logger.error('Failed to send message:', err.message);
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
