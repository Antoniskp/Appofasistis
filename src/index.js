'use strict';

const config = require('./config');
config.validate();

const logger = require('./logger');
const Connection = require('./connection');
const { startHeartbeat } = require('./heartbeat');
const { createTaskRunner } = require('./taskRunner');

logger.info(`Starting Appofasistis worker "${config.workerName}"...`);
logger.info(`Server: ${config.serverUrl}`);
logger.info(`Max concurrent tasks: ${config.maxConcurrentTasks}`);

// Placeholder connection so taskRunner can reference it before the real connection is set
let connection;

const taskRunner = createTaskRunner({
  send: (obj) => connection && connection.send(obj),
});

connection = new Connection((msg) => taskRunner.handleMessage(msg));
connection.connect();

const stopHeartbeat = startHeartbeat(connection, () => taskRunner.getActiveTasks());

// Graceful shutdown
function shutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  stopHeartbeat();
  connection.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason instanceof Error ? reason.message : reason);
});
