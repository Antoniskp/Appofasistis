'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildGazetteIndex, gazetteIdentity } = require('../src/localLaw/gazetteIndex');
const inventory = [{ year: 1833, series: 'Α', seriesCode: 1, issues: [1, 2, 4], sourceUrl: 'https://example.org/catalogue', verifiedAt: '2026-11-17' }];
const record = (id, issue = '1', { available = false, kind = 'source_text', units = 1 } = {}) => ({
  document: { canonical_id: id, title: id, type: id.startsWith('fek:') ? 'fek' : 'royal_decree',
    source: 'national_printing_office', source_url: 'https://example.org/gazette.pdf',
    fek_issue: 'Α', fek_number: issue, fek_year: '1833', text_kind: kind, category: 'Διοίκηση' },
  units, sources: [{ url: 'https://example.org/gazette.pdf', available }],
});

test('gazette identity normalizes series and requires a complete identity', () => {
  assert.equal(gazetteIdentity({ fek_issue: 'A΄', fek_number: '01', fek_year: '1833' }).id, 'fek:Α:1:1833');
  assert.equal(gazetteIdentity({ canonical_id: 'fek:Β:45:2020' }).series, 'Β');
  assert.equal(gazetteIdentity({ fek_issue: 'Α', fek_number: '2' }), null);
});

test('multiple acts and scan sharing one issue count once; metadata and excerpts do not imply saved PDFs', () => {
  const a = record('royal_decree:a:1833'); a.document.text_coverage = 'excerpt';
  const b = record('royal_decree:b:1833', '1', { available: true });
  const scan = record('fek:Α:1:1833', '1', { available: true, kind: 'archival_scan', units: 0 });
  const metadata = record('royal_decree:c:1833', '2', { kind: 'parliament_metadata' });
  const result = buildGazetteIndex([a, b, scan, metadata], inventory);
  assert.equal(result.summary.saved, 1);
  assert.equal(result.summary.registered, 2);
  assert.equal(result.summary.withText, 1);
  assert.equal(result.issues[0].documents.length, 2);
  assert.equal(result.issues[0].documentId, 'fek:Α:1:1833');
  assert.equal(result.issues[0].documents[0].excerpt, true);
  assert.deepEqual(result.years[0].missing, [2, 4]);
  assert.equal(result.years[0].complete, false);
});

test('completion uses the exact inventory, including gaps, and never infers an annual total from the largest issue', () => {
  let result = buildGazetteIndex([record('fek:Α:1:1833', '1', { available: true }), record('fek:Α:2:1833', '2', { available: true }), record('fek:Α:4:1833', '4', { available: true })], inventory);
  assert.equal(result.years[0].total, 3);
  assert.equal(result.years[0].complete, true);
  assert.equal(result.years[0].percent, 100);
  result = buildGazetteIndex([record('fek:Α:999:1833', '999', { available: true })], []);
  assert.equal(result.years[0].total, null);
  assert.equal(result.years[0].percent, null);
  assert.equal(result.years[0].complete, false);
});

test('non-gazette attachments and metadata units cannot inflate saved or text counts', () => {
  const a = record('royal_decree:a:1833', '1', { available: true, kind: 'parliament_metadata' });
  a.sources[0].url = 'https://example.org/committee-report.pdf';
  const result = buildGazetteIndex([a], inventory);
  assert.equal(result.summary.saved, 0);
  assert.equal(result.summary.withText, 0);
});

test('unexpected saved issues prevent a verified inventory from claiming completion', () => {
  const result = buildGazetteIndex([1,2,3,4].map(n => record('fek:Α:' + n + ':1833', String(n), { available: true })), inventory);
  assert.equal(result.years[0].complete, false);
  assert.deepEqual(result.years[0].unexpected, [3]);
});

test('a current-year snapshot is never called a completed year', () => {
  const result = buildGazetteIndex([1,2,4].map(n => record('fek:Α:' + n + ':1833', String(n), { available: true })), [{ ...inventory[0], openYear: true }]);
  assert.equal(result.years[0].percent, 100);
  assert.equal(result.years[0].complete, false);
  assert.equal(result.summary.catalogued, 3);
});
