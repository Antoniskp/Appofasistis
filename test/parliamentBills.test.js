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
  lawIdFromUrl,
  inferCategory,
  extractItemsFromRoot,
  validateItem,
  validateItems,
  KNOWN_SECTIONS,
  VALID_STATUSES,
  VALID_CATEGORIES,
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
  assert.ok(result.startsWith('https://www.hellenicparliament.gr'));
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

// ── KNOWN_SECTIONS ────────────────────────────────────────────────────────

test('KNOWN_SECTIONS — is a non-empty array', () => {
  assert.ok(Array.isArray(KNOWN_SECTIONS), 'KNOWN_SECTIONS must be an array');
  assert.ok(KNOWN_SECTIONS.length > 0, 'KNOWN_SECTIONS must not be empty');
});

test('KNOWN_SECTIONS — each entry has a url and label', () => {
  for (const section of KNOWN_SECTIONS) {
    assert.ok(typeof section.url === 'string' && section.url.startsWith('https://'), `url must be an https string, got: ${section.url}`);
    assert.ok(typeof section.label === 'string' && section.label.length > 0, `label must be a non-empty string, got: ${section.label}`);
  }
});

test('KNOWN_SECTIONS — contains submitted, in_committee, passed, and completed sections', () => {
  const labels = KNOWN_SECTIONS.map((s) => s.label);
  assert.ok(labels.some((l) => /κατατεθ/i.test(l)), 'Should include a submitted (Κατατεθέντα) section');
  assert.ok(labels.some((l) => /επιτροπ/i.test(l)), 'Should include an in_committee (Επιτροπές) section');
  assert.ok(labels.some((l) => /ψηφισθ/i.test(l)), 'Should include a passed (Ψηφισθέντα) section');
  assert.ok(labels.some((l) => /νόμοι|ολοκλήρ|ολοκληρ/i.test(l)), 'Should include a completed (Νόμοι) section');
});

test('KNOWN_SECTIONS — section labels map to expected status codes', () => {
  const expectedMappings = [
    { labelFragment: /κατατεθ/i, expectedStatus: 'submitted' },
    { labelFragment: /επιτροπ/i, expectedStatus: 'in_committee' },
    { labelFragment: /ψηφισθ/i, expectedStatus: 'passed' },
    { labelFragment: /νόμοι/i, expectedStatus: 'completed' },
  ];
  for (const { labelFragment, expectedStatus } of expectedMappings) {
    const section = KNOWN_SECTIONS.find((s) => labelFragment.test(s.label));
    assert.ok(section, `No section found matching ${labelFragment}`);
    assert.equal(mapStatus(section.label), expectedStatus, `Section "${section.label}" should map to ${expectedStatus}`);
  }
});

// ── extractItemsFromRoot — legislationTable ───────────────────────────────

test('extractItemsFromRoot — extracts items from a legislationTable structure', () => {
  const html = `
    <html><body>
      <table class="legislationTable">
        <thead>
          <tr><th>Αριθ. Πρωτ.</th><th>Ημ/νία Κατάθεσης</th><th>Τίτλος</th><th>Υπουργείο</th><th>Κατάσταση</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>ΔΙΕΚΠ/ΥΠ/123</td>
            <td>06/05/2026</td>
            <td><a href="/Nomothetiko-Ergo/Details?id=1">Νομοσχέδιο για την ανάπτυξη τεχνολογίας</a></td>
            <td>Υπ. Υγείας</td>
            <td>Κατατεθέν</td>
          </tr>
          <tr>
            <td>ΔΙΕΚΠ/ΥΠ/456</td>
            <td>04/05/2026</td>
            <td><a href="/Nomothetiko-Ergo/Details?id=2">Κύρωση διεθνούς σύμβασης περιβαλλοντικής προστασίας</a></td>
            <td>Υπ. Περιβάλλοντος</td>
            <td>Επεξεργασία</td>
          </tr>
        </tbody>
      </table>
    </body></html>`;

  const root = parse(html);
  const items = extractItemsFromRoot(root, 'https://www.hellenicparliament.gr/Nomothetiko-Ergo/Katatethenta-Nomosxedia', 'Κατατεθέντα (Σχέδιο νόμου)');

  assert.ok(items.length >= 2, `Expected ≥2 items from legislationTable, got ${items.length}`);

  const first = items[0];
  assert.ok(first.title_official.includes('τεχνολογίας'), 'title should come from title column anchor');
  assert.equal(first.published_at, '2026-05-06', 'date should be parsed from date column');
  assert.equal(first.status, 'submitted', 'status should be derived from section label');
  assert.equal(first.category, 'health', 'category should be inferred from ministry column');
  assert.ok(first.source_url.startsWith('https://'), 'source_url must be absolute');
});

test('extractItemsFromRoot — legislationTable category is null when fewer than 5 columns', () => {
  const html = `
    <html><body>
      <table class="legislationTable">
        <tbody>
          <tr>
            <td>01/01/2026</td>
            <td><a href="/item-short">Σύντομος τίτλος για νόμο περί ασφαλείας δεδομένων</a></td>
            <td>Κατατεθέν</td>
          </tr>
        </tbody>
      </table>
    </body></html>`;

  const root = parse(html);
  const items = extractItemsFromRoot(root, 'https://www.hellenicparliament.gr', null);
  assert.ok(items.length >= 1, `Expected ≥1 item, got ${items.length}`);
  assert.equal(items[0].category, null, 'category should be null for 3-column table');
});

// ── lawIdFromUrl ──────────────────────────────────────────────────────────

test('lawIdFromUrl — extracts law_id from a full parliament URL', () => {
  const url = 'https://www.hellenicparliament.gr/Nomothetiko-Ergo/Katatethenta-Nomosxedia?law_id=cf7398d9-168a-4134-85e4-b4420006f9f9';
  assert.equal(lawIdFromUrl(url), 'cf7398d9-168a-4134-85e4-b4420006f9f9');
});

test('lawIdFromUrl — returns null when no law_id param present', () => {
  assert.equal(lawIdFromUrl('https://www.hellenicparliament.gr/Nomothetiko-Ergo/Details?id=1'), null);
  assert.equal(lawIdFromUrl('https://www.hellenicparliament.gr/foo'), null);
});

test('lawIdFromUrl — returns null for null/empty input', () => {
  assert.equal(lawIdFromUrl(null), null);
  assert.equal(lawIdFromUrl(''), null);
});

test('lawIdFromUrl — returns null for an invalid URL', () => {
  assert.equal(lawIdFromUrl('not-a-url'), null);
});

// ── inferCategory ─────────────────────────────────────────────────────────

test('inferCategory — maps health ministry', () => {
  assert.equal(inferCategory('Υπ. Υγείας'), 'health');
  assert.equal(inferCategory('Υπουργείο Υγείας'), 'health');
});

test('inferCategory — maps energy ministry', () => {
  assert.equal(inferCategory('Περιβάλλοντος και Ενέργειας'), 'energy');
  assert.equal(inferCategory('Εκσυγχρονισμός ανανεώσιμων πηγών ενέργειας'), 'energy');
});

test('inferCategory — maps economy ministry', () => {
  assert.equal(inferCategory('Εθνικής Οικονομίας και Οικονομικών'), 'economy');
  assert.equal(inferCategory('Υπουργείο Οικονομικών'), 'economy');
});

test('inferCategory — maps education ministry', () => {
  assert.equal(inferCategory('Παιδείας, Θρησκευμάτων και Αθλητισμού'), 'education');
  assert.equal(inferCategory('Υπ. Παιδείας'), 'education');
});

test('inferCategory — maps agriculture ministry', () => {
  assert.equal(inferCategory('Αγροτικής Ανάπτυξης και Τροφίμων'), 'agriculture');
});

test('inferCategory — maps interior ministry', () => {
  assert.equal(inferCategory('Εσωτερικών'), 'interior');
});

test('inferCategory — maps social ministry', () => {
  assert.equal(inferCategory('Κοινωνικής Συνοχής και Οικογένειας'), 'social');
});

test('inferCategory — returns null for unrecognised text', () => {
  assert.equal(inferCategory('Υπ. Ανάπτυξης'), null);
  assert.equal(inferCategory('Κάτι άλλο'), null);
  assert.equal(inferCategory(''), null);
  assert.equal(inferCategory(null), null);
});

// ── extractItemsFromRoot — law_id external_id ─────────────────────────────

test('extractItemsFromRoot — uses hp-bill-<law_id> when law_id is present in href', () => {
  const html = `
    <html><body>
      <ul>
        <li><a href="/Nomothetiko-Ergo/Katatethenta-Nomosxedia?law_id=abc-123-def">Νόμος για ανανεώσιμες πηγές ενέργειας ΑΠΕ</a> 30/04/2026</li>
      </ul>
    </body></html>`;

  const root = parse(html);
  const items = extractItemsFromRoot(root, 'https://www.hellenicparliament.gr/Nomothetiko-Ergo', null);

  assert.ok(items.length >= 1, `Expected ≥1 item, got ${items.length}`);
  assert.equal(items[0].external_id, 'hp-bill-abc-123-def', 'external_id should use hp-bill-<law_id>');
});

test('extractItemsFromRoot — falls back to slug external_id when no law_id', () => {
  const html = `
    <html><body>
      <ul>
        <li><a href="/Nomothetiko-Ergo/Details?id=99">Νόμος για ανανεώσιμες πηγές ενέργειας ΑΠΕ</a> 30/04/2026</li>
      </ul>
    </body></html>`;

  const root = parse(html);
  const items = extractItemsFromRoot(root, 'https://www.hellenicparliament.gr/Nomothetiko-Ergo', null);

  assert.ok(items.length >= 1, `Expected ≥1 item, got ${items.length}`);
  assert.ok(!items[0].external_id.startsWith('hp-bill-'), 'external_id should be a slug when no law_id');
  assert.ok(items[0].external_id.length > 0, 'external_id must not be empty');
});

// ── validateItem ──────────────────────────────────────────────────────────

/** Constructs a minimal valid item for testing. */
function makeValidItem(overrides = {}) {
  return {
    external_id: 'hp-bill-cf7398d9-168a-4134-85e4-b4420006f9f9',
    title_official: 'Σύσταση Ταμείου Καινοτομίας',
    summary_official: null,
    status: 'submitted',
    status_label_el: 'Κατατεθέντα (Σχέδιο νόμου)',
    category: 'health',
    published_at: '2026-05-05',
    meeting_date: null,
    vote_date: null,
    source_url: 'https://www.hellenicparliament.gr/Nomothetiko-Ergo/Katatethenta-Nomosxedia?law_id=cf7398d9-168a-4134-85e4-b4420006f9f9',
    raw_text: 'some raw text',
    ...overrides,
  };
}

test('validateItem — accepts a fully valid item', () => {
  const errors = validateItem(makeValidItem());
  assert.deepEqual(errors, []);
});

test('validateItem — accepts a valid item with null optional fields', () => {
  const errors = validateItem(makeValidItem({
    summary_official: null,
    category: null,
    published_at: null,
    meeting_date: null,
    vote_date: null,
  }));
  assert.deepEqual(errors, []);
});

test('validateItem — rejects missing external_id', () => {
  const errors = validateItem(makeValidItem({ external_id: '' }));
  assert.ok(errors.some((e) => /external_id/.test(e)));
});

test('validateItem — rejects missing title_official', () => {
  const errors = validateItem(makeValidItem({ title_official: '' }));
  assert.ok(errors.some((e) => /title_official/.test(e)));
});

test('validateItem — rejects unrecognised status', () => {
  const errors = validateItem(makeValidItem({ status: 'flying' }));
  assert.ok(errors.some((e) => /status/.test(e)));
});

test('validateItem — rejects unrecognised category', () => {
  const errors = validateItem(makeValidItem({ category: 'flying' }));
  assert.ok(errors.some((e) => /category/.test(e)));
});

test('validateItem — rejects malformed published_at', () => {
  const errors = validateItem(makeValidItem({ published_at: '05/05/2026' }));
  assert.ok(errors.some((e) => /published_at/.test(e)));
});

test('validateItem — rejects non-https source_url', () => {
  const errors = validateItem(makeValidItem({ source_url: 'http://example.com' }));
  assert.ok(errors.some((e) => /source_url/.test(e)));
});

test('validateItem — rejects non-object input', () => {
  const errors = validateItem(null);
  assert.ok(errors.length > 0);
  const errors2 = validateItem('string');
  assert.ok(errors2.length > 0);
});

// ── validateItems ─────────────────────────────────────────────────────────

test('validateItems — separates valid from invalid', () => {
  const validItem = makeValidItem();
  const invalidItem = makeValidItem({ external_id: '', status: 'nonsense' });
  const { valid, invalid } = validateItems([validItem, invalidItem]);
  assert.equal(valid.length, 1);
  assert.equal(invalid.length, 1);
  assert.ok(invalid[0].errors.length >= 2);
});

test('validateItems — returns all valid for clean list', () => {
  const items = [makeValidItem(), makeValidItem({ external_id: 'hp-bill-abc', category: null })];
  const { valid, invalid } = validateItems(items);
  assert.equal(valid.length, 2);
  assert.equal(invalid.length, 0);
});

test('validateItems — returns all invalid for all-broken list', () => {
  const items = [makeValidItem({ external_id: '' }), makeValidItem({ title_official: '' })];
  const { valid, invalid } = validateItems(items);
  assert.equal(valid.length, 0);
  assert.equal(invalid.length, 2);
});

// ── VALID_STATUSES / VALID_CATEGORIES ─────────────────────────────────────

test('VALID_STATUSES — is a Set containing canonical status codes', () => {
  assert.ok(VALID_STATUSES instanceof Set);
  assert.ok(VALID_STATUSES.has('submitted'));
  assert.ok(VALID_STATUSES.has('in_committee'));
  assert.ok(VALID_STATUSES.has('passed'));
  assert.ok(VALID_STATUSES.has('completed'));
  assert.ok(VALID_STATUSES.has('unknown'));
});

test('VALID_CATEGORIES — is a Set containing canonical category codes', () => {
  assert.ok(VALID_CATEGORIES instanceof Set);
  assert.ok(VALID_CATEGORIES.has('health'));
  assert.ok(VALID_CATEGORIES.has('economy'));
  assert.ok(VALID_CATEGORIES.has('education'));
});
