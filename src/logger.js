'use strict';

const config = require('./config');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const EMOJIS = { debug: '🔍', info: 'ℹ️', warn: '⚠️', error: '❌' };

const currentLevel = LEVELS[config.logLevel] ?? LEVELS.info;

function log(level, ...args) {
  if (LEVELS[level] < currentLevel) return;
  const timestamp = new Date().toISOString();
  const emoji = EMOJIS[level];
  const prefix = `[${timestamp}] ${emoji} [${level.toUpperCase()}]`;
  if (level === 'error') {
    console.error(prefix, ...args);
  } else if (level === 'warn') {
    console.warn(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}

const logger = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
};

module.exports = logger;
