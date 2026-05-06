'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('node-html-parser');

const {
  parseDate,
  mapStatus,
  deriveExternalId,
  normalizeText,
  resolveUrl,
  extractItemsFromRoot,
} = require('../src/adapters/parliamentBills');

// ── parseDate ──────────────────────────────────────────────────────────────

test('parseDate — parses Greek DD/MM/YYYY format', () => {
  assert.equal(parseDate('05/05/2026'), '2026-05-05');
  assert.equal(parseDate('1/1/2025'), '2025-01-01');
  assert.equal(parseDate('30/04/2026'), '2026-04-30');
});

test('parseDate — parses ISO YYYY-MM-DD format', () => {
  assert.equal(parseDate('2026-05-05'), '2026-05-05');
  assert.equal(parseDate('2025-12-31'), '2025-12-31');
});

test('parseDate — returns null for empty or unparseable input', () => {
  assert.equal(parseDate(''), null);
  assert.equal(parseDate(null), null);
  assert.equal(parseDate('not-a-date'), null);
});

// ── mapStatus ──────────────────────────────────────────────────────────────

test('mapStatus — maps submitted', () => {
  assert.equal(mapStatus('Κατατεθέντα (Σχέδιο νόμου)'), 'submitted');
});

test('mapStatus — maps in_committee', () => {
  assert.equal(mapStatus('Επεξεργασία στις Επιτροπές'), 'in_committee');
  assert.equal(mapStatus('Διαρκής Επιτροπή'), 'in_committee');
});

test('mapStatus — maps passed', () => {
  assert.equal(mapStatus('Ψηφισθέντα Νομοσχέδια'), 'passed');
});

test('mapStatus — maps completed', () => {
  assert.equal(mapStatus('Νόμος 4321/2026'), 'completed');
  assert.equal(mapStatus('Ολοκλήρωση'), 'completed');
});

test('mapStatus — returns unknown for unrecognised text', () => {
  assert.equal(mapStatus('Κάτι άλλο'), 'unknown');
  assert.equal(mapStatus(''), 'unknown');
  assert.equal(mapStatus(null), 'unknown');
});

// ── normalizeText ──────────────────────────────────────────────────────────

test('normalizeText — collapses whitespace', () => {
  assert.equal(normalizeText('  hello   world  '), 'hello world');
  assert.equal(normalizeText('line1\n  line2'), 'line1 line2');
});

test('normalizeText — handles null/undefined', () => {
  assert.equal(normalizeText(null), '');
  assert.equal(normalizeText(undefined), '');
});

// ── resolveUrl ────────────────────────────────────────────────────────────

test('resolveUrl — returns absolute URL unchanged', () => {
  const abs = 'https://www.hellenicparliament.gr/Nomothetiko-Ergo/foo';
  assert.equal(resolveUrl(abs), abs);
});

test('resolveUrl — resolves relative path against base', () => {
  const rel = '/Nomothetiko-Ergo/Katatethenta';
  const result = resolveUrl(rel);
  assert.equal(result, 'https://www.hellenicparliament.gr/Nomothetiko-Ergo/Katatethenta');
});

test('resolveUrl — returns SOURCE_URL for null/empty input', () => {
  const result = resolveUrl(null);
  assert.equal(result, 'https://www.hellenicparliament.gr/Nomothetiko-Ergo');
});

// ── deriveExternalId ──────────────────────────────────────────────────────

test('deriveExternalId — generates a non-empty slug', () => {
  const id = deriveExternalId('Σύσταση Ταμείου Καινοτομίας', '2026-05-05');
  assert.ok(id.length > 0);
  assert.ok(id.includes('2026-05-05'));
});

test('deriveExternalId — omits date suffix when null', () => {
  const id = deriveExternalId('Νόμος για κάτι', null);
  assert.ok(id.length > 0);
  assert.ok(!id.endsWith('-null'));
});

test('deriveExternalId — truncates very long titles', () => {
  const longTitle = 'α'.repeat(200);
  const id = deriveExternalId(longTitle, null);
  assert.ok(id.length <= 70); // slug capped at 60 chars + optional date suffix
});

// ── extractItemsFromRoot ──────────────────────────────────────────────────

test('extractItemsFromRoot — extracts items from a table structure', () => {
  const html = `
    <html><body>
      <table>
        <tr><th>Ημερομηνία</th><th>Τίτλος</th><th>Κατάσταση</th></tr>
        <tr>
          <td>05/05/2026</td>
          <td><a href="/Nomothetiko-Ergo/item1">Σύσταση Ταμείου Καινοτομίας για ασθενείς</a></td>
          <td>Κατατεθέντα</td>
        </tr>
        <tr>
          <td>04/05/2026</td>
          <td><a href="/Nomothetiko-Ergo/item2">Διοικητική συνεργασία στον τομέα της φορολογίας</a></td>
          <td>Επεξεργασία στις Επιτροπές</td>
        </tr>
      </table>
    </body></html>`;

  const root = parse(html);
  const items = extractItemsFromRoot(root, 'https://www.hellenicparliament.gr/Nomothetiko-Ergo', null);

  assert.ok(items.length >= 2, `Expected ≥2 items, got ${items.length}`);

  const first = items[0];
  assert.ok(first.title_official.length > 0, 'title_official must be set');
  assert.ok(first.source_url.startsWith('https://'), 'source_url must be absolute');
  assert.ok(first.raw_text.length > 0, 'raw_text must be set');
  assert.ok(first.external_id.length > 0, 'external_id must be set');
  // Check required schema fields exist
  assert.ok(Object.hasOwn(first, 'summary_official'));
  assert.ok(Object.hasOwn(first, 'status'));
  assert.ok(Object.hasOwn(first, 'status_label_el'));
  assert.ok(Object.hasOwn(first, 'category'));
  assert.ok(Object.hasOwn(first, 'published_at'));
  assert.ok(Object.hasOwn(first, 'meeting_date'));
  assert.ok(Object.hasOwn(first, 'vote_date'));
});

test('extractItemsFromRoot — falls back to list items', () => {
  const html = `
    <html><body>
      <ul>
        <li><a href="/item-a">Νόμος για ανανεώσιμες πηγές ενέργειας ΑΠΕ</a> 30/04/2026</li>
        <li><a href="/item-b">Κύρωση σύμβασης παραχώρησης δικαιωμάτων παραγωγής</a> 28/04/2026</li>
      </ul>
    </body></html>`;

  const root = parse(html);
  const items = extractItemsFromRoot(root, 'https://www.hellenicparliament.gr/Nomothetiko-Ergo', 'Ψηφισθέντα Νομοσχέδια');

  assert.ok(items.length >= 2, `Expected ≥2 items, got ${items.length}`);
  assert.equal(items[0].status, 'passed');
  assert.equal(items[0].status_label_el, 'Ψηφισθέντα Νομοσχέδια');
});

test('extractItemsFromRoot — deduplicates items', () => {
  const html = `
    <html><body>
      <ul>
        <li><a href="/item-x">Επεξεργασία νομοσχεδίου για φορολογία εισοδήματος</a> 01/01/2026</li>
        <li><a href="/item-x">Επεξεργασία νομοσχεδίου για φορολογία εισοδήματος</a> 01/01/2026</li>
      </ul>
    </body></html>`;

  const root = parse(html);
  const items = extractItemsFromRoot(root, 'https://www.hellenicparliament.gr', null);
  assert.equal(items.length, 1, 'duplicates must be removed');
});

test('extractItemsFromRoot — returns empty array for empty HTML', () => {
  const root = parse('<html><body></body></html>');
  const items = extractItemsFromRoot(root, 'https://www.hellenicparliament.gr', null);
  assert.deepEqual(items, []);
});
