'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const taskHandlers = require('../src/tasks');
const {
  greekLegalCitations,
  importParliamentLaws,
  normalizeGreekLaw,
} = require('../src/tasks/greekLaw');

test('task registry exposes Greek law handlers', () => {
  assert.equal(taskHandlers.greekLegalCitations, greekLegalCitations);
  assert.equal(taskHandlers.importParliamentLaws, importParliamentLaws);
  assert.equal(taskHandlers.normalizeGreekLaw, normalizeGreekLaw);
});

test('greekLegalCitations task returns citation stats', () => {
  const result = greekLegalCitations({
    text: 'Σύμφωνα με το άρθρο 5 του ν. 2690/1999.',
    knownDocuments: [{ id: 'doc-2690', type: 'law', law_number: 2690, law_year: 1999 }],
  });

  assert.equal(result.stats.citation_count, 1);
  assert.equal(result.stats.resolved_count, 1);
  assert.equal(result.citations[0].target_canonical_id, 'law:2690:1999:article:5');
});

test('normalizeGreekLaw task returns a normalized legal graph payload', () => {
  const result = normalizeGreekLaw({
    document: { type: 'law', law_number: 1, law_year: 2026 },
    text: 'Άρθρο 1\n1. Κατά τον ν. 4412/2016 εφαρμόζονται οι κανόνες.',
  });

  assert.equal(result.document.canonical_id, 'law:1:2026');
  assert.equal(result.stats.article_count, 1);
  assert.equal(result.stats.reference_count, 1);
});

test('greekLegalCitations task validates text', () => {
  assert.throws(() => greekLegalCitations({ text: null }), /must be a string/);
});
