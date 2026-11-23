'use strict';

const {
  parseGreekLegalCitations,
  resolveGreekLegalReferences,
  documentCanonicalIdFromMetadata,
} = require('./citations');

const { splitNumberedParagraphs } = require('./paragraphs');
const { parseCodeReferences } = require('./codeReferences');

function normalizeWhitespace(text) {
  return (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function unitId(documentId, type, label, parentId) {
  const safeLabel = String(label || '1')
    .toLowerCase()
    .replace(/[^0-9a-zα-ωάέήίόύώϊϋΐΰ]+/giu, '-')
    .replace(/^-+|-+$/g, '');
  return parentId ? `${parentId}:${type}:${safeLabel}` : `${documentId}:${type}:${safeLabel}`;
}

function splitParagraphs(articleUnit, body) {
  return splitNumberedParagraphs(body).map((paragraph, index) => ({
    id: unitId(articleUnit.id, 'paragraph', paragraph.number, articleUnit.id),
    document_id: articleUnit.document_id, parent_id: articleUnit.id, unit_type: 'paragraph',
    label: 'παρ. ' + paragraph.number, article_number: articleUnit.article_number,
    paragraph_number: paragraph.number, title: null, text: paragraph.text,
    position: articleUnit.position + index + 1, start_offset: paragraph.start, end_offset: paragraph.end,
  }));
}

function splitGreekLegalUnits(text, documentId = 'document') {
  if (typeof text !== 'string') {
    throw new Error('splitGreekLegalUnits: "text" must be a string.');
  }

  const normalized = normalizeWhitespace(text);
  const articleMatches = [...normalized.matchAll(/(?:^|\n)[ \t]*Άρθρο[ \t]+([0-9Α-ΩA-Za-zα-ω]+)[ \t]*([^\n]*)/giu)];

  if (articleMatches.length === 0) {
    return [
      {
        id: `${documentId}:body`,
        document_id: documentId,
        parent_id: null,
        unit_type: 'body',
        label: 'body',
        article_number: null,
        paragraph_number: null,
        title: null,
        text: normalized,
        position: 1,
      },
    ];
  }

  const units = [];
  for (let index = 0; index < articleMatches.length; index++) {
    const match = articleMatches[index];
    const articleStart = match.index;
    const bodyStart = articleStart + match[0].length;
    const articleEnd = index + 1 < articleMatches.length ? articleMatches[index + 1].index : normalized.length;
    const articleNumber = match[1];
    const title = match[2] ? match[2].replace(/^[-.:]\s*/, '').trim() || null : null;
    const body = normalized.slice(bodyStart, articleEnd).trim();

    const articleUnit = {
      id: unitId(documentId, 'article', articleNumber),
      document_id: documentId,
      parent_id: null,
      unit_type: 'article',
      label: `Άρθρο ${articleNumber}`,
      article_number: articleNumber,
      paragraph_number: null,
      title,
      text: body,
      position: units.length + 1,
    };
    units.push(articleUnit);
    units.push(...splitParagraphs(articleUnit, body));
  }

  return units;
}

function leafUnits(units) {
  const parentIds = new Set(units.map((unit) => unit.parent_id).filter(Boolean));
  return units.filter((unit) => !parentIds.has(unit.id));
}

function buildGreekLawDocument({ document = {}, text, knownDocuments = [] }) {
  if (typeof text !== 'string') {
    throw new Error('buildGreekLawDocument: "text" must be a string.');
  }

  const documentId =
    document.canonical_id ||
    documentCanonicalIdFromMetadata(document) ||
    document.external_id ||
    document.id ||
    'legal-document';

  const normalizedDocument = {
    ...document,
    canonical_id: documentId,
  };

  const units = splitGreekLegalUnits(text, documentId);
  const references = [];

  for (const unit of leafUnits(units)) {
    const citations = [...parseGreekLegalCitations(unit.text), ...parseCodeReferences(unit.text, documentId)];
    const resolved = resolveGreekLegalReferences(citations, knownDocuments);
    for (const citation of resolved) {
      references.push({
        ...citation,
        from_document_id: documentId,
        from_unit_id: unit.id,
      });
    }
  }

  return {
    document: normalizedDocument,
    units,
    references,
    stats: {
      unit_count: units.length,
      article_count: units.filter((unit) => unit.unit_type === 'article').length,
      paragraph_count: units.filter((unit) => unit.unit_type === 'paragraph').length,
      reference_count: references.length,
      resolved_reference_count: references.filter((ref) => ref.resolved).length,
    },
  };
}

module.exports = {
  normalizeWhitespace,
  splitGreekLegalUnits,
  buildGreekLawDocument,
};
