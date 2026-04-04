'use strict';

/**
 * Sorts and ranks an array of score objects, returning the top N entries.
 *
 * @param {{ scores: Array<{ id: string|number, name: string, score: number }>, topN?: number }} payload
 * @returns {{ ranked: Array<{ rank: number, id: string|number, name: string, score: number }> }}
 */
function leaderboard({ scores, topN = 10 }) {
  if (!Array.isArray(scores)) {
    throw new Error('leaderboard: "scores" must be an array.');
  }

  const limit = Math.max(1, parseInt(topN, 10) || 10);

  const sorted = [...scores].sort((a, b) => b.score - a.score);

  const ranked = [];
  let currentRank = 1;

  for (let i = 0; i < sorted.length && ranked.length < limit; i++) {
    const entry = sorted[i];
    // Handle ties: entries with the same score share the same rank
    if (i > 0 && sorted[i].score < sorted[i - 1].score) {
      currentRank = i + 1;
    }
    ranked.push({
      rank: currentRank,
      id: entry.id,
      name: entry.name,
      score: entry.score,
    });
  }

  return { ranked };
}

module.exports = { leaderboard };
