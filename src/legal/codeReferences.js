'use strict';

const CODES = [
  { id: 'law:5038:2023', explicit_only: true, pattern: /Κώδικ(?:ας|α)\s+Μετανάστευσης/giu },
  { id: 'law:2690:1999', explicit_only: true, pattern: /Κώδικ(?:ας|α)\s+Διοικητικής\s+Διαδικασίας/giu },
  { id: 'law:5219:2025', scope_key: 'property_tax', name: 'Κώδικας Φορολογίας Περιουσίας', pattern: /Κώδικ(?:ας|α)\s+Φορολογίας\s+Περιουσίας/giu },
  { id: 'law:5222:2025', explicit_only: true, pattern: /Εθνικ(?:ός|ού|ό|ο)\s+Τελωνειακ(?:ός|ού|ό|ο)\s+Κώδικ(?:ας|α)/giu },
  { id: 'law:5306:2026', scope_key: 'planning', name: 'Κώδικας Χωροταξίας - Πολεοδομίας', pattern: /Κώδικ(?:ας|α)\s+Χωροταξίας\s*(?:[-–]\s*|και\s+)Πολεοδομίας/giu },
  { id: 'law:4172:2013', name: 'Κώδικας Φορολογίας Εισοδήματος', pattern: /Κώδικ(?:ας|α)\s+Φορολογίας\s+Εισοδήματος/giu },
  { id: 'law:4619:2019', name: 'Ποινικός Κώδικας', pattern: /Ποινικ(?:ός|ού|ό|ο)\s+Κώδικ(?:ας|α)|(?<![\p{L}])Π\.?\s*Κ\.(?![\p{L}])/giu },
  { id: 'law:4620:2019', name: 'Κώδικας Ποινικής Δικονομίας', pattern: /Κώδικ(?:ας|α)\s+Ποινικής\s+Δικονομίας|(?<![\p{L}])Κ\.?\s*Π\.?\s*Δ\.(?![\p{L}])/giu },
];
const LABEL = '\\d+[A-Za-zΑ-Ωα-ω]?';
function articleLabel(value) {
  const lookalikes = { a: 'α', b: 'β', e: 'ε', h: 'η', i: 'ι', k: 'κ', m: 'μ', n: 'ν', o: 'ο', p: 'ρ', t: 'τ', y: 'υ', x: 'χ' };
  return value.toLowerCase().replace(/[a-z]$/u, c => lookalikes[c] || c);
}
function namedCodes(text) {
  return CODES.flatMap(code => [...text.matchAll(new RegExp(code.pattern))].map(m => ({ ...code, start: m.index, end: m.index + m[0].length })));
}
function quotedCodeRegions(text) {
  const regions = []; let depth = 0, start = -1;
  for (const m of text.matchAll(/[«»]/gu)) {
    if (m[0] === '«') { if (!depth) start = m.index; depth++; }
    else if (depth && !--depth) {
      const heading = text.slice(start, m.index + 1).match(new RegExp('^«\\s*Άρθρο\\s+(' + LABEL + ')', 'iu'));
      if (heading) {
        const before = text.slice(0, start);
        // A named code in this article's introducing amendment is required.
        const codes = namedCodes(before); const code = codes.at(-1);
        if (code && !code.explicit_only && start - code.end < 500) regions.push({ start, end: m.index + 1, code, article: articleLabel(heading[1]) });
      }
    }
  }
  return regions;
}
function parseCodeReferences(text, documentId, options = {}) {
  const refs = [], codes = namedCodes(text), regions = quotedCodeRegions(text);
  const ownCode = CODES.find(code => !code.explicit_only && code.id === documentId && (!code.scope_key || code.scope_key === options.scope));
  const pattern = new RegExp('(?:(?:παρ\\.?|παραγράφ(?:ου|ος|ων))\\s+(' + LABEL + ')\\s+(?:του|των)\\s+)?άρθρ(?:ο|ου|α|ων)\\s+(' + LABEL + '(?:\\s*,\\s*' + LABEL + '|\\s+και\\s+' + LABEL + ')*)(?![\\p{L}\\p{N}])', 'giu');
  for (const match of text.matchAll(pattern)) {
    const start = match.index, end = start + match[0].length;
    const before = text.slice(Math.max(0, start - 40), start), after = text.slice(end, end + 120);
    // A quoted definition is text being enacted, not a citation to a stored version.
    if (/^\s*[«]?\s*$/u.test(text.slice(text.lastIndexOf('\n', start - 1) + 1, start)) && /^Άρθρο/u.test(match[0])) continue;
    if (/(?:νέο|νέου|πρ[oο]σθήκη|προστίθεται)\s*$/iu.test(before)) continue;
    const following = codes.find(code => code.start >= end && code.start - end < 40 && /^\s*(?:(?:του|στον|στο|τον)\s+)?$/iu.test(text.slice(end, code.start)));
    const foreign = /^(?:\s+(?:επ\.|και\s+επόμενα|έως\s+\d+|[–-]\s*\d+))?\s+(?:του|της|των)\s+(?:ν\s*\.|ν\.δ\.|π\s*\.\s*δ\s*\.|β\s*\.\s*δ\s*\.|α\s*\.\s*ν\s*\.|νόμου|(?:ίδιου|ανωτέρω|προαναφερόμενου|προαναφερθέντος|αυτού|ως\s+άνω)\s+νόμου|(?:ίδιου|παρόντος|ανωτέρω)\s+(?:διατάγματος|κανονισμού)|(?:ίδιας|παρούσας|ανωτέρω)\s+οδηγίας|(?:Αστικού|Εμπορικού|Τελωνειακού)\s+Κώδικα|Κώδικα|Κώδικος|Συντάγματος|Σύμβασης|Διεθνούς|Πρωτοκόλλου|Συνθήκης|[\p{L}\d]+\/\d{4}\s+ψηφίσματος|Κ\.?\s*Α\.?\s*Α\.?\s*Α\.?|(?:Νέου\s+)?Οικοδομικού\s+Κανονισμού|Ν\.?\s*Ο\.?\s*Κ\.?|Ευρωπαϊκής|ΕΣΔΑ|Κανονισμού|οδηγίας|Οδηγίας)/iu.test(after);
    if (foreign && !following) continue;
    const region = regions.find(r => start > r.start && end < r.end);
    const code = following || region?.code || ownCode;
    if (!code) continue;
    const numbers = [...match[2].matchAll(new RegExp(LABEL, 'gu'))];
    for (const number of numbers) {
      const article = articleLabel(number[0]), paragraph = match[1] ? articleLabel(match[1]) : null;
      const numberStart = start + match[0].lastIndexOf(match[2]) + number.index;
      const from = numbers.length === 1 ? start : numberStart, to = numbers.length === 1 ? end : numberStart + number[0].length;
      refs.push({ raw_text: text.slice(from, to), start: from, end: to, document_type: 'law', document_number: code.id.split(':')[1], document_year: code.id.split(':')[2], document_canonical_id: code.id,
        target_canonical_id: code.id + (code.scope_key ? ':code:' + code.scope_key : '') + ':article:' + article + (paragraph ? ':paragraph:' + paragraph : ''), article, paragraph,
        relation_type: 'mentions', confidence: following || ownCode ? 0.98 : 0.94, evidence_basis: following ? 'explicit_named_code_reference' : ownCode ? 'internal_code_article_reference' : 'named_code_quoted_provision_context' });
    }
  }
  return refs;
}
module.exports = { parseCodeReferences, quotedCodeRegions, articleLabel };
