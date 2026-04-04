'use strict';

require('dotenv').config();

const REQUIRED = ['SERVER_URL', 'WORKER_TOKEN'];

const config = {
  serverUrl: process.env.SERVER_URL || '',
  workerToken: process.env.WORKER_TOKEN || '',
  workerName: process.env.WORKER_NAME || 'unnamed-worker',
  maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS || '3', 10),
  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '10000', 10),
  reconnectDelay: parseInt(process.env.RECONNECT_DELAY || '5000', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
};

/**
 * Validates that all required configuration values are present.
 * Exits the process with a clear error message if any are missing.
 */
function validate() {
  for (const key of REQUIRED) {
    if (!process.env[key]) {
      console.error(`❌ Missing required environment variable: ${key}`);
      console.error('   Copy .env.example to .env and fill in the values.');
      process.exit(1);
    }
  }
}

config.validate = validate;

module.exports = config;
