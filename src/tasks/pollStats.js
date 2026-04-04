'use strict';

/**
 * Aggregates poll vote arrays into counts and percentages.
 *
 * @param {{ votes: number[], options?: string[] }} payload
 *   - votes: array where each element is the index of the chosen option
 *   - options: optional array of option labels
 * @returns {{ total: number, results: Array<{ option: string, votes: number, percentage: number }> }}
 */
function pollStats({ votes, options }) {
  if (!Array.isArray(votes)) {
    throw new Error('pollStats: "votes" must be an array.');
  }

  const total = votes.length;
  const counts = {};

  for (const vote of votes) {
    const key = String(vote);
    counts[key] = (counts[key] || 0) + 1;
  }

  // Determine all unique option indices
  const allIndices = new Set(votes.map(String));
  if (options) {
    options.forEach((_, i) => allIndices.add(String(i)));
  }

  const results = Array.from(allIndices)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => {
      const count = counts[key] || 0;
      const label =
        options && options[Number(key)] !== undefined
          ? options[Number(key)]
          : `Option ${Number(key) + 1}`;
      return {
        option: label,
        votes: count,
        percentage: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
      };
    });

  return { total, results };
}

module.exports = { pollStats };
