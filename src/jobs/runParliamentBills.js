'use strict';

/**
 * runParliamentBills.js
 *
 * Standalone CLI job: scrapes the Hellenic Parliament legislative work pages
 * and writes the result to output/parliament-bills.json.
 *
 * Usage:
 *   node src/jobs/runParliamentBills.js
 *   npm run scrape:parliament
 */

const fs = require('fs/promises');
const path = require('path');
const logger = require('../logger');
const { scrapeParliamentBills } = require('../adapters/parliamentBills');

const OUTPUT_DIR = path.resolve(__dirname, '../../output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'parliament-bills.json');

async function run() {
  logger.info('Parliament Bills scraper starting…');

  let result;
  try {
    result = await scrapeParliamentBills();
  } catch (err) {
    logger.error('Scraper failed:', err.message);
    process.exit(1);
  }

  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf8');
  } catch (err) {
    logger.error('Could not write output file:', err.message);
    process.exit(1);
  }

  logger.info(`Saved ${result.items.length} item(s) → ${OUTPUT_FILE}`);
  logger.info('Done.');
}

run();
