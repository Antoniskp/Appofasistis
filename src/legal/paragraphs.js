'use strict';

// Only index an unambiguous, consecutive top-level sequence. Numbered text inside
// guillemets belongs to a quoted provision, not to the article containing it.
function splitNumberedParagraphs(text, ignoredQuoteOffsets = []) {
  const candidates = [];
  let depth = 0;
  for (const match of text.matchAll(/(?:^|\n)[ \t]*(\d+)\.(?:[ \t]+|(?=[α-ω]{1,3}\)))|[«»]/g)) {
    if (match[0] === '«') { if (!ignoredQuoteOffsets.includes(match.index)) depth++; continue; }
    if (match[0] === '»') { depth = Math.max(0, depth - 1); continue; }
    // A wrapped citation such as «του άρθρου\n79.» continues the preceding
    // sentence; its article number is not a new paragraph label.
    const prefix = text.slice(0, match.index).trimEnd();
    const continuesArticleReference = /(?:^|\s)(?:του|το|στο)\s+άρθρ(?:ου|ο)$/iu.test(prefix);
    if (!depth && !continuesArticleReference) candidates.push({ number: match[1], start: match.index, textStart: match.index + match[0].length });
  }
  if (!candidates.length || candidates.some((item, index) => Number(item.number) !== index + 1)) return [];
  return candidates.map((item, index) => {
    const end = candidates[index + 1]?.start ?? text.length;
    return { ...item, end, text: text.slice(item.textStart, end).trim() };
  });
}
module.exports = { splitNumberedParagraphs };
