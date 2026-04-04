'use strict';

const WORDS_PER_MINUTE = 200;
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'as', 'be', 'was', 'are',
  'were', 'has', 'have', 'had', 'do', 'does', 'did', 'that', 'this',
  'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he',
  'she', 'his', 'her', 'they', 'their', 'them', 'its', 'not', 'no',
  'so', 'if', 'up', 'out', 'all', 'can', 'will', 'just', 'than', 'then',
  'also', 'more', 'into', 'about', 'which', 'when', 'what', 'how',
]);

/**
 * Analyses a piece of text:
 * - word count
 * - estimated reading time (minutes)
 * - top keyword extraction (excluding common stop words)
 *
 * @param {{ text: string, topKeywords?: number }} payload
 * @returns {{ wordCount: number, readingTimeMinutes: number, keywords: Array<{ word: string, count: number }> }}
 */
function textAnalysis({ text, topKeywords = 10 }) {
  if (typeof text !== 'string') {
    throw new Error('textAnalysis: "text" must be a string.');
  }

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);

  const wordCount = words.length;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));

  // Count word frequencies, excluding stop words
  const freq = {};
  for (const word of words) {
    const cleaned = word.replace(/^['-]+|['-]+$/g, '');
    if (!cleaned || STOP_WORDS.has(cleaned)) continue;
    freq[cleaned] = (freq[cleaned] || 0) + 1;
  }

  const limit = Math.max(1, parseInt(topKeywords, 10) || 10);
  const keywords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));

  return { wordCount, readingTimeMinutes, keywords };
}

module.exports = { textAnalysis };
