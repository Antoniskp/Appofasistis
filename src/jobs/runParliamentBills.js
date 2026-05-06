'use strict';

/**
 * runParliamentBills.js
 *
 * Standalone CLI job: scrapes the Hellenic Parliament legislative work pages,
 * validates results, diffs against the previous snapshot, and writes:
 *   output/parliament-bills.json          — full normalised payload
 *   output/parliament-bills-snapshot.json — snapshot used for future diffs
 *   output/parliament-bills-upload.json   — upload-ready payload for appofasi.gr
 *   output/parliament-bills-diff.json     — machine-readable change report
 *
 * Usage:
 *   node src/jobs/runParliamentBills.js
 *   npm run scrape:parliament
 */

const fs = require('fs/promises');
const path = require('path');
const logger = require('../logger');
const { scrapeParliamentBills, validateItems } = require('../adapters/parliamentBills');
const { loadSnapshot, saveSnapshot, diffSnapshots } = require('../lib/snapshotDiff');
const { buildUploadPayload } = require('../lib/uploadPayload');

const OUTPUT_DIR = path.resolve(__dirname, '../../output');
const OUTPUT_FILE        = path.join(OUTPUT_DIR, 'parliament-bills.json');
const SNAPSHOT_FILE      = path.join(OUTPUT_DIR, 'parliament-bills-snapshot.json');
const UPLOAD_FILE        = path.join(OUTPUT_DIR, 'parliament-bills-upload.json');
const DIFF_FILE          = path.join(OUTPUT_DIR, 'parliament-bills-diff.json');

async function run() {
  logger.info('Parliament Bills scraper starting…');

  // ── 1. Scrape ──────────────────────────────────────────────────────────────
  let result;
  try {
    result = await scrapeParliamentBills();
  } catch (err) {
    logger.error('Scraper failed:', err.message);
    process.exit(1);
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // ── 2. Save full normalised payload ───────────────────────────────────────
  try {
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf8');
    logger.info(`Saved ${result.items.length} item(s) → ${OUTPUT_FILE}`);
  } catch (err) {
    logger.error('Could not write output file:', err.message);
    process.exit(1);
  }

  // ── 3. Validate ────────────────────────────────────────────────────────────
  logger.info(`Validating ${result.items.length} item(s)…`);
  const { valid, invalid } = validateItems(result.items);
  logger.info(`Validation: ${valid.length} valid, ${invalid.length} invalid`);
  if (invalid.length > 0) {
    for (const { item, errors } of invalid) {
      logger.warn(`  ✗ [${item.external_id || '(no id)'}]: ${errors.join('; ')}`);
    }
  }

  // ── 4. Snapshot diff ───────────────────────────────────────────────────────
  const prevSnapshot = await loadSnapshot(SNAPSHOT_FILE);
  const { newItems, changedItems, removedItems } = diffSnapshots(prevSnapshot, result);

  logger.info(
    `Diff vs previous snapshot: ${newItems.length} new, ` +
    `${changedItems.length} changed, ${removedItems.length} removed`,
  );

  const diffReport = {
    generated_at: result.scraped_at,
    new_count: newItems.length,
    changed_count: changedItems.length,
    removed_count: removedItems.length,
    new_items: newItems.map((i) => i.external_id),
    changed_items: changedItems.map(({ prev, curr }) => ({
      external_id: curr.external_id,
      changes: computeFieldChanges(prev, curr),
    })),
    removed_items: removedItems.map((i) => i.external_id),
  };

  try {
    await fs.writeFile(DIFF_FILE, JSON.stringify(diffReport, null, 2), 'utf8');
    logger.info(`Diff report saved → ${DIFF_FILE}`);
  } catch (err) {
    logger.warn('Could not write diff file:', err.message);
  }

  // Save current run as the new snapshot for next time.
  try {
    await saveSnapshot(SNAPSHOT_FILE, result);
    logger.info(`Snapshot saved → ${SNAPSHOT_FILE}`);
  } catch (err) {
    logger.warn('Could not write snapshot file:', err.message);
  }

  // ── 5. Upload-ready payload ────────────────────────────────────────────────
  const uploadPayload = buildUploadPayload(valid, result.scraped_at);
  try {
    await fs.writeFile(UPLOAD_FILE, JSON.stringify(uploadPayload, null, 2), 'utf8');
    logger.info(
      `Upload payload saved (${uploadPayload.stats.total} valid items) → ${UPLOAD_FILE}`,
    );
  } catch (err) {
    logger.warn('Could not write upload file:', err.message);
  }

  // ── 6. Summary ────────────────────────────────────────────────────────────
  logger.info('Done.');
  logger.info(
    `Summary: scraped=${result.items.length}, valid=${valid.length}, ` +
    `invalid=${invalid.length}, new=${newItems.length}, changed=${changedItems.length}`,
  );
}

/**
 * Returns a list of field names whose values differ between two item versions.
 *
 * @param {object} prev
 * @param {object} curr
 * @returns {string[]}
 */
function computeFieldChanges(prev, curr) {
  const TRACKED = [
    'title_official',
    'summary_official',
    'status',
    'category',
    'published_at',
    'meeting_date',
    'vote_date',
    'source_url',
  ];
  return TRACKED.filter((f) => prev[f] !== curr[f]);
}

run();
