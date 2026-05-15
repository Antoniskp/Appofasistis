'use strict';

const os = require('os');
const config = require('./config');
const logger = require('./logger');
const taskHandlers = require('./tasks');

/**
 * Creates a task runner that routes incoming task messages to the correct handler
 * and sends results back via the connection.
 *
 * @param {import('./connection')} connection
 * @returns {{ handleMessage: (msg: object) => void, getActiveTasks: () => number }}
 */
function createTaskRunner(connection) {
  let activeTasks = 0;

  function getActiveTasks() {
    return activeTasks;
  }

  async function executeTask(taskId, taskType, payload) {
    activeTasks += 1;
    logger.info(`Task [${taskId}] started — type: ${taskType}`);

    try {
      const handler = taskHandlers[taskType];
      if (!handler) {
        throw new Error(`Unknown task type: "${taskType}"`);
      }

      const result = await handler(payload);

      logger.info(`Task [${taskId}] completed — type: ${taskType}`);
      connection.send({
        type: 'taskResult',
        taskId,
        status: 'success',
        result,
      });
    } catch (err) {
      logger.error(`Task [${taskId}] failed — ${err.message}`);
      connection.send({
        type: 'taskResult',
        taskId,
        status: 'error',
        error: err.message,
      });
    } finally {
      activeTasks -= 1;
    }
  }

  function handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'task': {
        const { taskId, taskType, payload } = msg;

        if (!taskId || !taskType) {
          logger.warn('Received task message without taskId or taskType, ignoring.');
          return;
        }

        if (activeTasks >= config.maxConcurrentTasks) {
          logger.warn(
            `At capacity (${activeTasks}/${config.maxConcurrentTasks}). Rejecting task [${taskId}].`
          );
          connection.send({
            type: 'taskResult',
            taskId,
            status: 'rejected',
            error: 'Worker at capacity',
          });
          return;
        }

        executeTask(taskId, taskType, payload || {});
        break;
      }

      case 'ping':
        logger.debug('Received ping, sending pong.');
        connection.send({ type: 'pong' });
        break;

      case 'ack':
        logger.debug(`Server acknowledged: ${JSON.stringify(msg)}`);
        break;

      case 'health_request': {
        const totalMem = os.totalmem();
        const usedMem = totalMem - os.freemem();

        connection.send({
          type: 'health_response',
          requestId: msg.requestId,
          ok: true,
          service: 'appofasistis',
          time: new Date().toISOString(),
          load: os.loadavg()[0],
          memory: {
            usedMB: Math.round(usedMem / 1024 / 1024),
            totalMB: Math.round(totalMem / 1024 / 1024),
          },
          activeTasks: getActiveTasks(),
        });
        break;
      }

      case 'snapshot_request':
        logger.info('Snapshot received via WebSocket:', JSON.stringify(msg.snapshot));
        connection.send({
          type: 'snapshot_response',
          requestId: msg.requestId,
          ok: true,
          receivedAt: new Date().toISOString(),
        });
        break;

      default:
        logger.debug(`Unhandled message type: "${msg.type}"`);
    }
  }

  return { handleMessage, getActiveTasks };
}

module.exports = { createTaskRunner };
