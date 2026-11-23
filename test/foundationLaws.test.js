'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildFoundationGraph, TOPICS } = require('../scripts/import-basic-laws');

function source(number, section) {
  return { number, year: number === '4855' ? '2021' : '2024', title: 'Amendment', published_at: '2024-02-23',
    fek_number: '30', source_url: 'https://api.et.gr/apiLAW/1/2024/5090/pdf', text: section.text, sha256: 'test', page_count: 1, sections: [section] };
}

test('quoted Criminal Code headings remain inside their actual amending article', () => {
  const graph = buildFoundationGraph(source('5090', { number: '58', label: 'Άρθρο 58', title: 'Κλοπή', source_page: 21,
    text: 'Στην παρ. 1 του άρθρου 372 του Ποινικού Κώδικα προστίθενται λέξεις.\n«Άρθρο 372\nΚλοπή\n1. Κείμενο αντικατάστασης.»' }));
  assert.equal(graph.units.length, 1);
  assert.equal(graph.units[0].id, 'law:5090:2024:article:58');
  assert.match(graph.units[0].text, /Άρθρο 372/);
  const reference = graph.references.find(ref => ref.evidence_basis === 'official_gazette_amendment_text');
  assert.equal(reference.target_canonical_id, 'law:4619:2019:article:372:paragraph:1');
  assert.equal(reference.from_unit_id, 'law:5090:2024:article:58');
  assert.equal(graph.document.consolidation_status, 'original_publication_not_consolidated');
});

test('source article identities are unique and unverified amendment text is rejected', () => {
  const section = { number: '63', label: 'Άρθρο 63', title: 'Ανθρωποκτονία', source_page: 28, text: 'Τροποποίηση της παρ. 1 του άρθρου 299 ΠΚ.' };
  const value = source('4855', section);
  value.sections.push(section);
  assert.throws(() => buildFoundationGraph(value), /Duplicate legal units/);
  assert.throws(() => buildFoundationGraph(source('4855', { ...section, text: 'Unrelated content' })), /could not be verified/);
  assert.equal(TOPICS.length, 10);
});
