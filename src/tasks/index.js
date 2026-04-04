'use strict';

const { linkPreview } = require('./linkPreview');
const { pollStats } = require('./pollStats');
const { leaderboard } = require('./leaderboard');
const { textAnalysis } = require('./textAnalysis');

/**
 * Task registry — maps task type strings to handler functions.
 * Each handler receives the task payload and must return a Promise (or value).
 *
 * @type {Record<string, (payload: object) => Promise<object> | object>}
 */
const taskHandlers = {
  linkPreview,
  pollStats,
  leaderboard,
  textAnalysis,
};

module.exports = taskHandlers;
