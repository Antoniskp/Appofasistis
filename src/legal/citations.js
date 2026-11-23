'use strict';

const GREEK_ALPHA_NUM = '[0-9A-Za-zΑ-Ωα-ωΆΈΉΊΌΎΏάέήίόύώϊϋΐΰ]+';

const CITATION_PATTERNS = [
  {
    documentType: 'royal_decree',
    regex: /(?<![\p{L}\p{N}_])(?:β\.?\s*δ\.?|βασιλικ(?:ό|ο)\s+διάταγμα)\s*(\d{1,6})\s*\/\s*(\d{4})/giu,
  },
  {
    documentType: 'law',
    regex: /(?<![\p{L}\p{N}_])(?:ν\s*\.?|νόμος)\s*(\d{1,6})\s*\/\s*(\d{4})/giu,
  },
  {
    documentType: 'presidential_decree',
    regex: /(?<![\p{L}\p{N}_])(?:π\.?\s*δ\.?|προεδρικ(?:ό|ο)\s+διάταγμα)\s*(\d{1,6})\s*\/\s*(\d{4})/giu,
  },
  {
    documentType: 'joint_ministerial_decision',
    regex: /(?<![\p{L}\p{N}_])(?:κ\.?\s*υ\.?\s*α\.?|κοιν(?:ή|η)\s+υπουργικ(?:ή|η)\s+απόφαση)\s*([0-9A-Za-zΑ-Ωα-ω.\/-]+)\s*\/\s*(\d{4})/giu,
  },
  {
    documentType: 'legislative_content_act',
    regex: /(?<![\p{L}\p{N}_])(?:π\.?\s*ν\.?\s*π\.?|πράξη\s+νομοθετικ(?:ού|ου)\s+περιεχομένου)\s*(\d{1,6})?\s*\/?\s*(\d{4})/giu,
  },
  {
    documentType: 'eu_directive',
    yearFirst: true,
    regex: /(?<!\p{L})Οδηγί(?:α|ας|αν)\s*\([ΕE][ΕE]\)\s*(\d{4})\s*\/\s*(\d{1,4})(?![\d/])/giu,
  },
  {
    documentType: 'eu_directive',
    yearFirst: true,
    regex: /(?<!\p{L})Οδηγί(?:α|ας|αν)\s*(\d{4})\s*\/\s*(\d{1,4})\s*\/\s*(?:ΕΟΚ|ΕΚ|ΕΕ)(?![\p{L}\p{N}])/giu,
  },
  {
    documentType: 'eu_regulation',
    yearFirst: true,
    regex: /(?<!\p{L})Κανονισμ(?:ός|ού|ό)\s*\(ΕΕ\)\s*((?:201[5-9]|20[2-9]\d))\s*\/\s*(\d{1,4})(?![\d/])/giu,
  },
  {
    documentType: 'eu_regulation',
    regex: /(?<!\p{L})Κανονισμ(?:ός|ού|ό)\s*\((?:ΕΟΚ|ΕΚ|ΕΕ)\)\s*(?:αριθ\.?\s*)?(\d{1,4})\s*\/\s*(19\d{2}|200\d|201[0-4])(?![\d/])/giu,
  },
];

const FEK_PATTERN =
  /(?<![\p{L}\p{N}_])Φ\.?\s*Ε\.?\s*Κ\.?\s*(?:(Α|Β|Γ|Δ|A|B|C|D)[΄'’]?\s*)?(\d{1,6})\s*(?:\/|\s+)(?:(Α|Β|Γ|Δ|A|B|C|D)[΄'’]?\s*\/?\s*)?((?:\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})|\d{4})/giu;

function normalizeGreekIssue(issue) {
  if (!issue) return null;
  const upper = issue.toUpperCase();
  const map = {
    A: 'Α',
    B: 'Β',
    C: 'Γ',
    D: 'Δ',
  };
  return map[upper] || upper;
}

function yearFromDateLike(value) {
  if (!value) return null;
  const match = String(value).match(/(\d{4})$/);
  return match ? match[1] : null;
}

function normalizeDateLike(value) {
  if (!value || /^\d{4}$/.test(value)) return null;
  const match = String(value).match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function canonicalDocumentId(documentType, parts) {
  if (documentType === 'fek') {
    return `fek:${parts.issue}:${parts.number}:${parts.year}`;
  }
  return `${documentType}:${parts.number}:${parts.year}`;
}

function canonicalTargetId(documentType, parts, unit) {
  let id = canonicalDocumentId(documentType, parts);
  if (unit.article) id += `:article:${String(unit.article).toLowerCase()}`;
  if (unit.paragraph) id += `:paragraph:${String(unit.paragraph).toLowerCase()}`;
  return scopeNumberedCodeCitation(id);
}

function scopeNumberedCodeCitation(id) {
  // The two enacting articles use Greek ordinals. Numbered citations refer to the Code.
  return id?.replace(/^law:5219:2025:article:(?=\d)/u, 'law:5219:2025:code:property_tax:article:');
}

function extractUnitContext(text, start, end) {
  const before = text.slice(Math.max(0, start - 180), start);
  const label = '\\d+[A-Za-zΑ-Ωα-ω]?';
  const paragraph = '(?:παρ\\.?|παράγραφος|παραγράφου)';
  // Require a grammatical attachment to this citation. A nearby article number,
  // another law or a later sentence cannot supply this law's target provision.
  const preceding = before.match(new RegExp('(?:' + paragraph + '\\s*(' + label + ')\\s+(?:του|στο)\\s+)?άρθρ(?:ο|ου)\\s+(' + label + ')(?:\\s*,?\\s*' + paragraph + '\\s*(' + label + '))?\\s+(?:του|της)\\s*$', 'iu'));
  if (preceding) return { article: preceding[2], paragraph: preceding[1] || preceding[3] || null };
  const following = text.slice(end, end + 100).match(new RegExp('^\\s*,\\s*άρθρ(?:ο|ου)\\s+(' + label + ')(?:\\s*,?\\s*' + paragraph + '\\s*(' + label + '))?', 'iu'));
  return following ? { article: following[1], paragraph: following[2] || null } : { article: null, paragraph: null };
}

function extractArticleList(text, start) {
  const before = text.slice(Math.max(0, start - 180), start);
  const list = before.match(/άρθρ(?:α|ων)\s+(\d+[Α-Ωα-ω]?(?:(?:\s*,\s*|\s+και\s+)\d+[Α-Ωα-ω]?)+)\s+(?:του|της)\s*$/diu);
  if (!list) return [];
  const offset = start - before.length + list.indices[1][0];
  return Array.from(list[1].matchAll(/\d+[Α-Ωα-ω]?/gu), item => ({
    article: item[0], paragraph: null, start: offset + item.index, end: offset + item.index + item[0].length,
  }));
}

function inferRelationType(text, start, end) {
  const windowText = text.slice(Math.max(0, start - 90), Math.min(text.length, end + 90));

  if (/καταργ(?:είται|ούνται|ηση)|παύει\s+να\s+ισχύει/iu.test(windowText)) {
    return 'repeals';
  }
  if (/αντικαθ(?:ίσταται|ίστανται|ίσταται|ιστάται)|αντικατάσταση/iu.test(windowText)) {
    return 'replaces';
  }
  if (/τροποποι(?:είται|ούνται)|προστίθεται|συμπληρώνεται|αναριθμείται/iu.test(windowText)) {
    return 'amends';
  }
  if (/σύμφωνα\s+με|κατ[άα]\s+την\s+έννοια|εφαρμογ(?:ή|η)/iu.test(windowText)) {
    return 'applies';
  }
  return 'mentions';
}

function sortAndNumber(citations) {
  return citations
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map((citation, index) => ({
      id: `citation-${index + 1}`,
      ...citation,
    }));
}

function parseGreekLegalCitations(text, { modernConstitution = false } = {}) {
  if (typeof text !== 'string') {
    throw new Error('parseGreekLegalCitations: "text" must be a string.');
  }

  const citations = [];

  if (modernConstitution) {
    const pattern = /(?:(?:παρ\.?|παράγραφ(?:ος|ο|ου))\s*(\d+)\s+(?:του|στο)\s+)?άρθρ(?:ο|ου)\s+(\d{1,3}[Α-Ωα-ω]?)(?:\s*,?\s*(?:παρ\.?|παράγραφ(?:ος|ο|ου))\s*(\d+))?\s+του\s+Συντάγματος(?!\s+(?:του|της)(?!\p{L})|\p{L})/giu;
    for (const match of text.matchAll(pattern)) {
      const [raw_text, before, article, after] = match;
      const paragraph = before || after || null;
      const document_canonical_id = 'constitution:greece:2019';
      const target_canonical_id = document_canonical_id + ':article:' + article.toLowerCase() + (paragraph ? ':paragraph:' + paragraph : '');
      citations.push({ raw_text, start: match.index, end: match.index + raw_text.length,
        document_type: 'constitution', document_number: 'greece', document_year: '2019',
        document_canonical_id, target_canonical_id, article, paragraph, relation_type: 'mentions', confidence: 0.98,
      });
    }
  }

  for (const { documentType, regex, yearFirst } of CITATION_PATTERNS) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      const start = match.index;
      const end = start + match[0].length;
      const [, first, second] = match;
      const [number, year] = yearFirst ? [second, first] : [first, second];
      if (!number || !year) continue;

      const unit = extractUnitContext(text, start, end);
      const parts = { number, year };

      citations.push({
        raw_text: match[0],
        start,
        end,
        document_type: documentType,
        document_number: number,
        document_year: year,
        document_canonical_id: canonicalDocumentId(documentType, parts),
        target_canonical_id: canonicalTargetId(documentType, parts, unit),
        article: unit.article,
        paragraph: unit.paragraph,
        relation_type: inferRelationType(text, start, end),
        confidence: unit.article || unit.paragraph ? 0.88 : 0.8,
      });
      for (const item of extractArticleList(text, start)) {
        citations.push({
          ...item, raw_text: text.slice(item.start, item.end),
          document_type: documentType, document_number: number, document_year: year,
          document_canonical_id: canonicalDocumentId(documentType, parts),
          target_canonical_id: canonicalTargetId(documentType, parts, item),
          relation_type: inferRelationType(text, start, end), confidence: 0.88,
          evidence_basis: 'explicit_article_list',
        });
      }
    }
  }

  FEK_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(FEK_PATTERN)) {
    const start = match.index;
    const end = start + match[0].length;
    const issue = normalizeGreekIssue(match[1] || match[3]);
    const number = match[2];
    const dateOrYear = match[4];
    const year = yearFromDateLike(dateOrYear);
    if (!issue || !number || !year) continue;

    const parts = { issue, number, year };
    citations.push({
      raw_text: match[0],
      start,
      end,
      document_type: 'fek',
      document_number: number,
      document_year: year,
      fek_issue: issue,
      fek_date: normalizeDateLike(dateOrYear),
      document_canonical_id: canonicalDocumentId('fek', parts),
      target_canonical_id: canonicalDocumentId('fek', parts),
      article: null,
      paragraph: null,
      relation_type: inferRelationType(text, start, end),
      confidence: 0.82,
    });
  }

  return sortAndNumber(citations);
}

function documentCanonicalIdFromMetadata(document) {
  if (!document || typeof document !== 'object') return null;

  const type = document.type || document.document_type;
  const number = document.law_number || document.document_number || document.number;
  const year = document.law_year || document.document_year || document.year;
  if (type && number && year) {
    return canonicalDocumentId(type, { number: String(number), year: String(year) });
  }

  const issue = document.fek_issue;
  const fekNumber = document.fek_number;
  const fekYear = document.fek_year || yearFromDateLike(document.fek_date);
  if (issue && fekNumber && fekYear) {
    return canonicalDocumentId('fek', {
      issue: normalizeGreekIssue(String(issue)),
      number: String(fekNumber),
      year: String(fekYear),
    });
  }

  return document.external_id || document.id || null;
}

function buildKnownDocumentIndex(knownDocuments = []) {
  const index = new Map();
  for (const document of knownDocuments) {
    const canonicalId = document.canonical_id || documentCanonicalIdFromMetadata(document);
    if (canonicalId) index.set(canonicalId, document);
  }
  return index;
}

function resolveGreekLegalReferences(citations, knownDocuments = []) {
  const index = buildKnownDocumentIndex(knownDocuments);
  return citations.map((citation) => {
    const resolvedDocument = index.get(citation.document_canonical_id);
    return {
      ...citation,
      resolved: Boolean(resolvedDocument),
      resolved_document_id: resolvedDocument ? resolvedDocument.id || resolvedDocument.external_id || null : null,
    };
  });
}

module.exports = {
  parseGreekLegalCitations,
  resolveGreekLegalReferences,
  canonicalDocumentId,
  canonicalTargetId,
  scopeNumberedCodeCitation,
  documentCanonicalIdFromMetadata,
};
