'use strict';

const https = require('https');
const http = require('http');
const { parse } = require('node-html-parser');
const logger = require('../logger');

const BASE_URL = 'https://www.hellenicparliament.gr';
const SOURCE_URL = `${BASE_URL}/Nomothetiko-Ergo`;
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Maps Greek status text fragments to canonical English status codes.
 */
const STATUS_MAP = [
  { pattern: /κατατεθ/i, code: 'submitted' },
  { pattern: /επεξεργασ|επιτροπ/i, code: 'in_committee' },
  { pattern: /ψηφισθ/i, code: 'passed' },
  { pattern: /νόμος|ολοκλήρ|εψηφίσθη/i, code: 'completed' },
  { pattern: /διαβούλευση|consultation/i, code: 'consultation' },
  { pattern: /ημερήσια|agenda/i, code: 'scheduled' },
];

/**
 * Resolves a potentially relative URL against the base URL.
 *
 * @param {string} href
 * @returns {string}
 */
function resolveUrl(href) {
  if (!href) return SOURCE_URL;
  try {
    return new URL(href, BASE_URL).toString();
  } catch {
    return SOURCE_URL;
  }
}

/**
 * Derives a canonical status code from Greek label text.
 *
 * @param {string} text
 * @returns {string}
 */
function mapStatus(text) {
  if (!text) return 'unknown';
  for (const { pattern, code } of STATUS_MAP) {
    if (pattern.test(text)) return code;
  }
  return 'unknown';
}

/**
 * Parses a Greek date string (DD/MM/YYYY or YYYY-MM-DD) to ISO date string.
 * Returns null if unparseable.
 *
 * @param {string} raw
 * @returns {string|null}
 */
function parseDate(raw) {
  if (!raw) return null;
  // Already ISO format
  const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  // Greek format: DD/MM/YYYY
  const grMatch = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (grMatch) {
    const [, d, m, y] = grMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

/**
 * Derives a slug-style external ID from a title and date.
 *
 * @param {string} title
 * @param {string|null} date
 * @returns {string}
 */
function deriveExternalId(title, date) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\u0370-\u03ff\u1f00-\u1fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return date ? `${slug}-${date}` : slug;
}

/**
 * Normalises whitespace in a string.
 *
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

/**
 * Extracts bill items from a parsed HTML root node.
 * Handles common Hellenic Parliament page structures:
 *  - table rows with date + title columns
 *  - list items (<li>) containing anchors and date spans
 *  - generic news/article divs
 *
 * @param {import('node-html-parser').HTMLElement} root
 * @param {string} pageUrl  — used to resolve relative hrefs
 * @param {string} sectionLabel — Greek label for this section (e.g. "Κατατεθέντα")
 * @returns {Array<object>}
 */
function extractItemsFromRoot(root, pageUrl, sectionLabel) {
  const items = [];
  const seen = new Set();

  // ── Strategy 1: table rows ─────────────────────────────────────────────────
  const rows = root.querySelectorAll('table tr');
  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) continue;

    const anchor = row.querySelector('a');
    if (!anchor) continue;

    const titleText = normalizeText(anchor.text);
    if (!titleText || titleText.length < 10) continue;

    const href = anchor.getAttribute('href');
    const sourceUrl = resolveUrl(href);

    const rawText = normalizeText(row.text);
    const dateMatch = rawText.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
    const publishedAt = parseDate(dateMatch ? dateMatch[0] : null);

    const statusLabelEl = normalizeText(cells[cells.length - 1].text);
    const status = mapStatus(sectionLabel || statusLabelEl);

    const id = deriveExternalId(titleText, publishedAt);
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({
      external_id: id,
      title_official: titleText,
      summary_official: null,
      status,
      status_label_el: sectionLabel || statusLabelEl || null,
      category: null,
      published_at: publishedAt,
      meeting_date: null,
      vote_date: null,
      source_url: sourceUrl,
      raw_text: rawText,
    });
  }

  // ── Strategy 2: list items ─────────────────────────────────────────────────
  if (items.length === 0) {
    const listItems = root.querySelectorAll('li');
    for (const li of listItems) {
      const anchor = li.querySelector('a');
      if (!anchor) continue;

      const titleText = normalizeText(anchor.text);
      if (!titleText || titleText.length < 10) continue;

      const href = anchor.getAttribute('href');
      const sourceUrl = resolveUrl(href);

      const rawText = normalizeText(li.text);
      const dateMatch = rawText.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
      const publishedAt = parseDate(dateMatch ? dateMatch[0] : null);

      const status = mapStatus(sectionLabel || rawText);

      const id = deriveExternalId(titleText, publishedAt);
      if (seen.has(id)) continue;
      seen.add(id);

      items.push({
        external_id: id,
        title_official: titleText,
        summary_official: null,
        status,
        status_label_el: sectionLabel || null,
        category: null,
        published_at: publishedAt,
        meeting_date: null,
        vote_date: null,
        source_url: sourceUrl,
        raw_text: rawText,
      });
    }
  }

  // ── Strategy 3: anchors with substantive text (fallback) ──────────────────
  if (items.length === 0) {
    const anchors = root.querySelectorAll('a');
    for (const anchor of anchors) {
      const titleText = normalizeText(anchor.text);
      if (!titleText || titleText.length < 20) continue;

      const href = anchor.getAttribute('href');
      if (!href) continue;

      const sourceUrl = resolveUrl(href);
      const rawText = titleText;
      const dateMatch = rawText.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
      const publishedAt = parseDate(dateMatch ? dateMatch[0] : null);

      const status = mapStatus(sectionLabel || rawText);

      const id = deriveExternalId(titleText, publishedAt);
      if (seen.has(id)) continue;
      seen.add(id);

      items.push({
        external_id: id,
        title_official: titleText,
        summary_official: null,
        status,
        status_label_el: sectionLabel || null,
        category: null,
        published_at: publishedAt,
        meeting_date: null,
        vote_date: null,
        source_url: sourceUrl,
        raw_text: rawText,
      });
    }
  }

  return items;
}

/**
 * Fetches HTML from a URL, following up to `redirectsLeft` redirects.
 *
 * @param {string} url
 * @param {number} [redirectsLeft=3]
 * @returns {Promise<string>}
 */
function fetchHtml(url, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return reject(new Error(`Invalid URL: ${url}`));
    }

    const lib = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Appofasistis-Scraper/1.0 (parliament-bills-bot)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'el,en;q=0.9',
        'Accept-Encoding': 'identity',
      },
      timeout: REQUEST_TIMEOUT_MS,
    };

    const req = lib.request(options, (res) => {
      if (
        redirectsLeft > 0 &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        const redirectUrl = new URL(res.headers.location, url).href;
        res.resume();
        resolve(fetchHtml(redirectUrl, redirectsLeft - 1));
        return;
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms for ${url}`));
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Scrapes the Hellenic Parliament legislative work pages and returns a
 * normalised JSON payload.
 *
 * @returns {Promise<{ source_name: string, source_type: string, scraped_at: string, items: Array<object> }>}
 */
async function scrapeParliamentBills() {
  logger.info(`Fetching Hellenic Parliament page: ${SOURCE_URL}`);

  let html;
  try {
    html = await fetchHtml(SOURCE_URL);
  } catch (err) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: ${err.message}`);
  }

  logger.debug(`Fetched ${html.length} bytes from ${SOURCE_URL}`);

  const root = parse(html);

  // Collect sub-section URLs from the navigation/links on the main page so we
  // can fetch each category separately and tag items with the correct status.
  const sectionLinks = [];
  const sectionPatterns = [
    { pattern: /katatethenta|Katatethenta|κατατεθ/i, label: 'Κατατεθέντα (Σχέδιο νόμου)' },
    { pattern: /psifisthenta|Psifisthenta|ψηφισθ/i, label: 'Ψηφισθέντα Νομοσχέδια' },
    { pattern: /nomoi|Nomoi|νόμοι/i, label: 'Νόμοι' },
    { pattern: /epitropes|Epitropes|επιτροπ/i, label: 'Επεξεργασία στις Επιτροπές' },
  ];

  for (const anchor of root.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') || '';
    for (const { pattern, label } of sectionPatterns) {
      if (pattern.test(href)) {
        const resolved = resolveUrl(href);
        if (!sectionLinks.find((s) => s.url === resolved)) {
          sectionLinks.push({ url: resolved, label });
        }
        break;
      }
    }
  }

  logger.info(`Found ${sectionLinks.length} section link(s) to crawl`);

  const allItems = [];

  // First, extract items from the main page itself
  const mainItems = extractItemsFromRoot(root, SOURCE_URL, null);
  if (mainItems.length > 0) {
    logger.info(`Extracted ${mainItems.length} item(s) from main page`);
    allItems.push(...mainItems);
  }

  // Then crawl each section page
  for (const { url, label } of sectionLinks) {
    logger.info(`Fetching section "${label}": ${url}`);
    try {
      const sectionHtml = await fetchHtml(url);
      const sectionRoot = parse(sectionHtml);
      const sectionItems = extractItemsFromRoot(sectionRoot, url, label);
      logger.info(`Extracted ${sectionItems.length} item(s) from "${label}"`);
      allItems.push(...sectionItems);
    } catch (err) {
      logger.warn(`Could not fetch section "${label}" (${url}): ${err.message}`);
    }
  }

  // De-duplicate by external_id across all sections
  const seen = new Set();
  const uniqueItems = allItems.filter((item) => {
    if (seen.has(item.external_id)) return false;
    seen.add(item.external_id);
    return true;
  });

  logger.info(`Total unique items: ${uniqueItems.length}`);

  return {
    source_name: 'hellenic-parliament-bills',
    source_type: 'bill',
    scraped_at: new Date().toISOString(),
    items: uniqueItems,
  };
}

module.exports = {
  scrapeParliamentBills,
  // Exported for testing
  parseDate,
  mapStatus,
  deriveExternalId,
  normalizeText,
  resolveUrl,
  extractItemsFromRoot,
};
