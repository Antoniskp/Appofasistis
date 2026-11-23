'use strict';

const {
  parseGreekLegalCitations,
  resolveGreekLegalReferences,
} = require('../legal/citations');
const { importParliamentLaws: runParliamentLawsImport } = require('../adapters/hellenicParliamentLaws');
const { buildGreekLawDocument } = require('../legal/document');

function greekLegalCitations({ text, knownDocuments = [] }) {
  if (typeof text !== 'string') {
    throw new Error('greekLegalCitations: "text" must be a string.');
  }

  const citations = parseGreekLegalCitations(text);
  const references = resolveGreekLegalReferences(citations, knownDocuments);

  return {
    citations: references,
    stats: {
      citation_count: references.length,
      resolved_count: references.filter((ref) => ref.resolved).length,
    },
  };
}

function normalizeGreekLaw({ document = {}, text, knownDocuments = [] }) {
  return buildGreekLawDocument({ document, text, knownDocuments });
}

function importParliamentLaws(payload = {}) {
  return runParliamentLawsImport(payload);
}

module.exports = {
  greekLegalCitations,
  importParliamentLaws,
  normalizeGreekLaw,
};
