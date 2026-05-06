'use strict';

/**
 * snapshotDiff.js
 *
 * Utilities for saving/loading parliament-bills snapshots and computing
 * machine-readable diffs between two consecutive runs.
 *
 * All I/O is local-file based — no database required.
 */

const fs = require('fs/promises');
const path = require('path');

/**
 * Loads a previously saved snapshot from disk.
 * Returns null if the file does not exist or cannot be parsed.
 *
 * @param {string} snapshotPath  Absolute path to the snapshot JSON file.
 * @returns {Promise<object|null>}
 */
async function loadSnapshot(snapshotPath) {
  try {
    const raw = await fs.readFile(snapshotPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Saves a payload as the new snapshot.
 *
 * @param {string} snapshotPath  Absolute path to write to.
 * @param {object} payload
 * @returns {Promise<void>}
 */
async function saveSnapshot(snapshotPath, payload) {
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, JSON.stringify(payload, null, 2), 'utf8');
}

/**
 * Computes a canonical string fingerprint for a single item for change
 * detection.  Only the fields relevant to content are included; metadata
 * such as `scraped_at` is intentionally excluded.
 *
 * @param {object} item
 * @returns {string}
 */
function itemFingerprint(item) {
  return JSON.stringify({
    title_official: item.title_official,
    summary_official: item.summary_official,
    status: item.status,
    category: item.category,
    published_at: item.published_at,
    meeting_date: item.meeting_date,
    vote_date: item.vote_date,
    source_url: item.source_url,
  });
}

/**
 * Compares two payloads and returns the sets of new, changed, and removed
 * items keyed by `external_id`.
 *
 * @param {object|null} prev  Previous snapshot payload (or null if none).
 * @param {object}      curr  Current payload.
 * @returns {{ newItems: object[], changedItems: Array<{prev: object, curr: object}>, removedItems: object[] }}
 */
function diffSnapshots(prev, curr) {
  const newItems = [];
  const changedItems = [];
  const removedItems = [];

  if (!prev || !Array.isArray(prev.items)) {
    // No previous snapshot — everything is "new".
    return { newItems: curr.items.slice(), changedItems: [], removedItems: [] };
  }

  const prevMap = new Map(prev.items.map((item) => [item.external_id, item]));
  const currMap = new Map(curr.items.map((item) => [item.external_id, item]));

  for (const [id, currItem] of currMap) {
    const prevItem = prevMap.get(id);
    if (!prevItem) {
      newItems.push(currItem);
    } else if (itemFingerprint(prevItem) !== itemFingerprint(currItem)) {
      changedItems.push({ prev: prevItem, curr: currItem });
    }
  }

  for (const [id, prevItem] of prevMap) {
    if (!currMap.has(id)) {
      removedItems.push(prevItem);
    }
  }

  return { newItems, changedItems, removedItems };
}

module.exports = { loadSnapshot, saveSnapshot, diffSnapshots, itemFingerprint };
