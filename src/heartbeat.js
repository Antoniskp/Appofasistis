'use strict';

const os = require('os');
const config = require('./config');
const logger = require('./logger');

/**
 * Starts a periodic heartbeat that reports CPU load and memory usage to the server.
 *
 * @param {import('./connection')} connection - The active Connection instance.
 * @param {function(): number} getActiveTasks - Returns current number of active tasks.
 * @returns {function} A stop function that cancels the heartbeat.
 */
function startHeartbeat(connection, getActiveTasks) {
  const interval = setInterval(() => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const heartbeat = {
      type: 'heartbeat',
      load: os.loadavg()[0],
      memory: {
        used: usedMem,
        total: totalMem,
        usedMB: Math.round(usedMem / 1024 / 1024),
        totalMB: Math.round(totalMem / 1024 / 1024),
      },
      activeTasks: getActiveTasks(),
    };

    logger.debug('Sending heartbeat:', JSON.stringify(heartbeat));
    connection.send(heartbeat);
  }, config.heartbeatInterval);

  logger.info(`Heartbeat started (interval: ${config.heartbeatInterval}ms).`);

  return function stopHeartbeat() {
    clearInterval(interval);
    logger.info('Heartbeat stopped.');
  };
}

module.exports = { startHeartbeat };
