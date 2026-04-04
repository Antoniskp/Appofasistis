'use strict';

const https = require('https');
const http = require('http');
const { parse } = require('node-html-parser');
const logger = require('../logger');

const REQUEST_TIMEOUT_MS = 10000;

/**
 * Fetches a URL and extracts OpenGraph / meta preview data.
 *
 * @param {{ url: string }} payload
 * @returns {Promise<{ url: string, title: string|null, description: string|null, image: string|null, siteName: string|null }>}
 */
async function linkPreview({ url }) {
  if (!url || typeof url !== 'string') {
    throw new Error('linkPreview: "url" is required and must be a string.');
  }

  logger.debug(`Fetching link preview for: ${url}`);

  const html = await fetchHtml(url);
  const root = parse(html);

  function getMeta(property) {
    const byProperty = root.querySelector(`meta[property="${property}"]`);
    if (byProperty) return byProperty.getAttribute('content') || null;
    const byName = root.querySelector(`meta[name="${property}"]`);
    if (byName) return byName.getAttribute('content') || null;
    return null;
  }

  const title =
    getMeta('og:title') ||
    getMeta('twitter:title') ||
    root.querySelector('title')?.text?.trim() ||
    null;

  const description =
    getMeta('og:description') ||
    getMeta('twitter:description') ||
    getMeta('description') ||
    null;

  const image =
    getMeta('og:image') ||
    getMeta('twitter:image') ||
    null;

  const siteName =
    getMeta('og:site_name') ||
    null;

  return { url, title, description, image, siteName };
}

/**
 * Makes an HTTP/HTTPS GET request and returns the response body as a string.
 * Follows up to 3 redirects.
 */
function fetchHtml(url, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Appofasistis-Worker/1.0 (link-preview-bot)',
        Accept: 'text/html,application/xhtml+xml',
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

module.exports = { linkPreview };
