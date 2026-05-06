'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const { loadSnapshot, saveSnapshot, diffSnapshots, itemFingerprint } = require('../src/lib/snapshotDiff');
const { buildUploadPayload, buildStats } = require('../src/lib/uploadPayload');

// ── Helper ─────────────────────────────────────────────────────────────────

function makeItem(id, overrides = {}) {
  return {
    external_id: id,
    title_official: `Title for ${id}`,
    summary_official: null,
    status: 'submitted',
    status_label_el: 'Κατατεθέντα (Σχέδιο νόμου)',
    category: 'health',
    published_at: '2026-05-05',
    meeting_date: null,
    vote_date: null,
    source_url: `https://www.hellenicparliament.gr/Nomothetiko-Ergo?law_id=${id}`,
    raw_text: `raw text for ${id}`,
    ...overrides,
  };
}

function makePayload(items, scrapedAt = '2026-05-06T12:00:00.000Z') {
  return {
    source_name: 'hellenic-parliament-bills',
    source_type: 'bill',
    scraped_at: scrapedAt,
    items,
  };
}

// ── itemFingerprint ────────────────────────────────────────────────────────

test('itemFingerprint — same item produces same fingerprint', () => {
  const item = makeItem('hp-bill-aaa');
  assert.equal(itemFingerprint(item), itemFingerprint({ ...item }));
});

test('itemFingerprint — different titles produce different fingerprints', () => {
  const a = makeItem('hp-bill-aaa', { title_official: 'Title A' });
  const b = makeItem('hp-bill-aaa', { title_official: 'Title B' });
  assert.notEqual(itemFingerprint(a), itemFingerprint(b));
});

test('itemFingerprint — scraped_at and raw_text do not affect fingerprint', () => {
  const a = makeItem('hp-bill-aaa');
  const b = { ...a, scraped_at: '2099-01-01T00:00:00.000Z', raw_text: 'something completely different' };
  assert.equal(itemFingerprint(a), itemFingerprint(b));
});

// ── diffSnapshots — no previous snapshot ─────────────────────────────────

test('diffSnapshots — treats all items as new when no previous snapshot', () => {
  const curr = makePayload([makeItem('hp-bill-1'), makeItem('hp-bill-2')]);
  const { newItems, changedItems, removedItems } = diffSnapshots(null, curr);
  assert.equal(newItems.length, 2);
  assert.equal(changedItems.length, 0);
  assert.equal(removedItems.length, 0);
});

test('diffSnapshots — treats all items as new when prev has empty items array', () => {
  const prev = makePayload([]);
  const curr = makePayload([makeItem('hp-bill-1')]);
  const { newItems } = diffSnapshots(prev, curr);
  assert.equal(newItems.length, 1);
});

// ── diffSnapshots — new items ─────────────────────────────────────────────

test('diffSnapshots — detects new items added since last snapshot', () => {
  const prev = makePayload([makeItem('hp-bill-1')]);
  const curr = makePayload([makeItem('hp-bill-1'), makeItem('hp-bill-2')]);
  const { newItems, changedItems, removedItems } = diffSnapshots(prev, curr);
  assert.equal(newItems.length, 1);
  assert.equal(newItems[0].external_id, 'hp-bill-2');
  assert.equal(changedItems.length, 0);
  assert.equal(removedItems.length, 0);
});

// ── diffSnapshots — changed items ─────────────────────────────────────────

test('diffSnapshots — detects changed items', () => {
  const prev = makePayload([makeItem('hp-bill-1', { title_official: 'Old Title' })]);
  const curr = makePayload([makeItem('hp-bill-1', { title_official: 'New Title' })]);
  const { newItems, changedItems, removedItems } = diffSnapshots(prev, curr);
  assert.equal(newItems.length, 0);
  assert.equal(changedItems.length, 1);
  assert.equal(changedItems[0].curr.external_id, 'hp-bill-1');
  assert.equal(changedItems[0].prev.title_official, 'Old Title');
  assert.equal(changedItems[0].curr.title_official, 'New Title');
  assert.equal(removedItems.length, 0);
});

test('diffSnapshots — does not flag item as changed if only raw_text differs', () => {
  const prev = makePayload([makeItem('hp-bill-1', { raw_text: 'old raw' })]);
  const curr = makePayload([makeItem('hp-bill-1', { raw_text: 'new raw' })]);
  const { changedItems } = diffSnapshots(prev, curr);
  assert.equal(changedItems.length, 0);
});

// ── diffSnapshots — removed items ─────────────────────────────────────────

test('diffSnapshots — detects removed items', () => {
  const prev = makePayload([makeItem('hp-bill-1'), makeItem('hp-bill-2')]);
  const curr = makePayload([makeItem('hp-bill-1')]);
  const { newItems, changedItems, removedItems } = diffSnapshots(prev, curr);
  assert.equal(newItems.length, 0);
  assert.equal(changedItems.length, 0);
  assert.equal(removedItems.length, 1);
  assert.equal(removedItems[0].external_id, 'hp-bill-2');
});

// ── diffSnapshots — no changes ────────────────────────────────────────────

test('diffSnapshots — reports no changes for identical snapshots', () => {
  const items = [makeItem('hp-bill-1'), makeItem('hp-bill-2')];
  const prev = makePayload(items);
  const curr = makePayload(items.map((i) => ({ ...i, scraped_at: 'ignored' })));
  const { newItems, changedItems, removedItems } = diffSnapshots(prev, curr);
  assert.equal(newItems.length, 0);
  assert.equal(changedItems.length, 0);
  assert.equal(removedItems.length, 0);
});

// ── loadSnapshot / saveSnapshot ────────────────────────────────────────────

test('loadSnapshot — returns null for non-existent file', async () => {
  const result = await loadSnapshot('/tmp/this-file-does-not-exist-12345.json');
  assert.equal(result, null);
});

test('loadSnapshot — returns null for invalid JSON', async () => {
  const tmpFile = path.join(os.tmpdir(), `test-snapshot-${Date.now()}.json`);
  await fs.writeFile(tmpFile, 'not valid json', 'utf8');
  const result = await loadSnapshot(tmpFile);
  assert.equal(result, null);
  await fs.unlink(tmpFile).catch(() => {});
});

test('saveSnapshot and loadSnapshot — round-trip', async () => {
  const tmpFile = path.join(os.tmpdir(), `test-snapshot-${Date.now()}.json`);
  const payload = makePayload([makeItem('hp-bill-roundtrip')]);
  await saveSnapshot(tmpFile, payload);
  const loaded = await loadSnapshot(tmpFile);
  assert.deepEqual(loaded, payload);
  await fs.unlink(tmpFile).catch(() => {});
});

// ── buildUploadPayload ─────────────────────────────────────────────────────

test('buildUploadPayload — excludes raw_text from upload items', () => {
  const items = [makeItem('hp-bill-1'), makeItem('hp-bill-2')];
  const payload = buildUploadPayload(items, '2026-05-06T12:00:00.000Z');
  for (const item of payload.items) {
    assert.ok(!Object.hasOwn(item, 'raw_text'), 'raw_text must be excluded from upload payload');
  }
});

test('buildUploadPayload — preserves all required upload fields', () => {
  const items = [makeItem('hp-bill-x')];
  const payload = buildUploadPayload(items, '2026-05-06T12:00:00.000Z');
  const REQUIRED = ['external_id', 'title_official', 'summary_official', 'status', 'status_label_el', 'category', 'published_at', 'meeting_date', 'vote_date', 'source_url'];
  for (const field of REQUIRED) {
    assert.ok(Object.hasOwn(payload.items[0], field), `Upload item must have field: ${field}`);
  }
});

test('buildUploadPayload — sets schema_version, generated_at, source, stats', () => {
  const payload = buildUploadPayload([], '2026-05-06T12:00:00.000Z');
  assert.equal(payload.schema_version, '1');
  assert.equal(payload.generated_at, '2026-05-06T12:00:00.000Z');
  assert.equal(payload.source, 'hellenic-parliament-bills');
  assert.ok(typeof payload.stats === 'object');
});

test('buildUploadPayload — stats.total matches items length', () => {
  const items = [makeItem('hp-bill-1'), makeItem('hp-bill-2'), makeItem('hp-bill-3')];
  const payload = buildUploadPayload(items, '2026-05-06T12:00:00.000Z');
  assert.equal(payload.stats.total, 3);
});

// ── buildStats ─────────────────────────────────────────────────────────────

test('buildStats — counts by_status correctly', () => {
  const items = [
    makeItem('a', { status: 'submitted' }),
    makeItem('b', { status: 'submitted' }),
    makeItem('c', { status: 'passed' }),
  ];
  const stats = buildStats(items);
  assert.equal(stats.by_status.submitted, 2);
  assert.equal(stats.by_status.passed, 1);
});

test('buildStats — counts by_category correctly', () => {
  const items = [
    makeItem('a', { category: 'health' }),
    makeItem('b', { category: 'economy' }),
    makeItem('c', { category: 'health' }),
    makeItem('d', { category: null }),
  ];
  const stats = buildStats(items);
  assert.equal(stats.by_category.health, 2);
  assert.equal(stats.by_category.economy, 1);
  assert.equal(stats.by_category.uncategorised, 1);
});

test('buildStats — handles empty items array', () => {
  const stats = buildStats([]);
  assert.equal(stats.total, 0);
  assert.deepEqual(stats.by_status, {});
  assert.deepEqual(stats.by_category, {});
});
