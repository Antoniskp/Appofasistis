'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildGreekLawDocument,
  splitGreekLegalUnits,
} = require('../src/legal/document');

const SAMPLE_TEXT = `
Άρθρο 1
Σκοπός
1. Σκοπός του παρόντος είναι η εφαρμογή του ν. 4412/2016.
2. Η παρ. 2 του άρθρου 5 του ν. 2690/1999 τροποποιείται.

Άρθρο 2 - Καταργούμενες διατάξεις
Καταργείται το άρθρο 12 του π.δ. 18/1989.
`;

test('splitGreekLegalUnits splits Greek legal text into articles and paragraphs', () => {
  const units = splitGreekLegalUnits(SAMPLE_TEXT, 'law:100:2026');

  assert.equal(units.filter((unit) => unit.unit_type === 'article').length, 2);
  assert.equal(units.filter((unit) => unit.unit_type === 'paragraph').length, 2);
  assert.equal(units[0].id, 'law:100:2026:article:1');
  assert.equal(units[0].label, 'Άρθρο 1');
  assert.equal(units[1].parent_id, 'law:100:2026:article:1');
  assert.equal(units[1].paragraph_number, '1');
});

test('splitGreekLegalUnits returns a body unit when no article headings exist', () => {
  const units = splitGreekLegalUnits('Κείμενο χωρίς άρθρα.', 'doc-1');

  assert.equal(units.length, 1);
  assert.equal(units[0].unit_type, 'body');
  assert.equal(units[0].text, 'Κείμενο χωρίς άρθρα.');
});

test('buildGreekLawDocument returns document, units, references and stats', () => {
  const result = buildGreekLawDocument({
    document: {
      type: 'law',
      law_number: 100,
      law_year: 2026,
      title: 'Δοκιμαστικός νόμος',
    },
    text: SAMPLE_TEXT,
    knownDocuments: [
      { id: 'doc-4412', type: 'law', law_number: 4412, law_year: 2016 },
      { id: 'doc-2690', type: 'law', law_number: 2690, law_year: 1999 },
    ],
  });

  assert.equal(result.document.canonical_id, 'law:100:2026');
  assert.equal(result.stats.article_count, 2);
  assert.equal(result.stats.paragraph_count, 2);
  assert.equal(result.stats.reference_count, 3);
  assert.equal(result.stats.resolved_reference_count, 2);
  assert.ok(result.references.some((ref) => ref.from_unit_id.endsWith(':paragraph:2')));
  assert.ok(result.references.some((ref) => ref.relation_type === 'repeals'));
});
