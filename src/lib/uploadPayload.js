'use strict';

/**
 * uploadPayload.js
 *
 * Builds an upload-ready JSON payload derived from a validated set of
 * normalised parliament-bills items.  The payload is deterministic and
 * suitable for downstream ingestion by appofasi.gr.
 *
 * The output file is written to output/parliament-bills-upload.json.
 */

/**
 * Builds a summary statistics block from an array of items.
 *
 * @param {object[]} items
 * @returns {object}
 */
function buildStats(items) {
  const byStatus = {};
  const byCategory = {};

  for (const item of items) {
    const s = item.status || 'unknown';
    byStatus[s] = (byStatus[s] || 0) + 1;

    const c = item.category || 'uncategorised';
    byCategory[c] = (byCategory[c] || 0) + 1;
  }

  return {
    total: items.length,
    by_status: byStatus,
    by_category: byCategory,
  };
}

/**
 * Produces an upload-ready payload from a validated items array.
 *
 * The payload intentionally omits `raw_text` (internal-only field) and
 * includes only the fields needed by the downstream ingestion API.
 *
 * @param {object[]} validItems  Items that passed schema validation.
 * @param {string}   scrapedAt   ISO timestamp from the scraper run.
 * @returns {object}
 */
function buildUploadPayload(validItems, scrapedAt) {
  const uploadItems = validItems.map((item) => ({
    external_id: item.external_id,
    title_official: item.title_official,
    summary_official: item.summary_official,
    status: item.status,
    status_label_el: item.status_label_el,
    category: item.category,
    published_at: item.published_at,
    meeting_date: item.meeting_date,
    vote_date: item.vote_date,
    source_url: item.source_url,
  }));

  return {
    schema_version: '1',
    generated_at: scrapedAt,
    source: 'hellenic-parliament-bills',
    stats: buildStats(uploadItems),
    items: uploadItems,
  };
}

module.exports = { buildUploadPayload, buildStats };
