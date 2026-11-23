'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { LawStore } = require('./store');
const { graphSettings } = require('./runtime');
const { importParliamentLaws } = require('../adapters/hellenicParliamentLaws');
const { buildGreekLawDocument } = require('../legal/document');

const assets = path.join(__dirname, '..', '..', 'public', 'laws');
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};
const badRequest = message => Object.assign(new Error(message), { statusCode: 400 });
const safeUrl = value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
};

function officialPdfUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || (url.hostname !== 'hellenicparliament.gr' && !url.hostname.endsWith('.hellenicparliament.gr')) || (url.port && url.port !== '443') || url.username || url.password) {
    throw badRequest('PDF downloads currently support HTTPS sources from the Hellenic Parliament only.');
  }
  return url;
}

async function fetchPdf(value) {
  let url = officialPdfUrl(value);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(45000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      url = officialPdfUrl(new URL(response.headers.get('location'), url).href);
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw badRequest('The official source returned HTTP ' + response.status + '.'); }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 30 * 1024 * 1024) throw badRequest('This PDF exceeds the 30 MB download limit.');
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw badRequest('The source did not return a PDF.');
    return buffer;
  }
  throw badRequest('The source redirected too many times.');
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) throw Object.assign(new Error('Request exceeds 4 MB.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw badRequest('A JSON object is required.'); }
}

function createLawApp({ storeOptions = {}, getWorkerStatus = () => ({ enabled: false, connected: false }), importer = importParliamentLaws } = {}) {
  const store = new LawStore({ ...graphSettings(), ...storeOptions });
  const dataDir = store.dataDirectory;
  let closed = false;
  let importing = false;

  async function startImport(input) {
    if (importing) throw Object.assign(new Error('An import is already running. Wait for it to finish.'), { statusCode: 409 });
    const query = { pageNo: Math.max(1, parseInt(input.pageNo, 10) || 1), pageSize: Math.min(100, Math.max(1, parseInt(input.pageSize, 10) || 10)) };
    if (typeof input.lawNum === 'string' && input.lawNum.trim()) query.lawNum = input.lawNum.trim().slice(0, 12);
    if (typeof input.title === 'string' && input.title.trim()) query.title = input.title.trim().slice(0, 250);
    const id = crypto.randomUUID();
    importing = true;
    try { await store.startJob(id, query); } catch (error) { importing = false; throw error; }
    Promise.resolve().then(() => importer(query)).then(async result => {
      if (closed) return;
      const saved = await store.saveGraphs(result.documents);
      await store.finishJob(id, { ...saved, page: result.page, source_url: result.source_url });
    }).catch(async error => { if (!closed) await store.finishJob(id, null, error.message); }).catch(error => console.error('Could not record import failure:', error.message)).finally(() => { importing = false; });
    return { id, status: 'running', query };
  }

  function sendFile(res, filename, type, headers = {}) {
    res.writeHead(200, { 'content-type': type, 'x-content-type-options': 'nosniff', ...headers });
    fs.createReadStream(filename).on('error', () => res.destroy()).pipe(res);
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    if (!(pathname === '/' || pathname === '/laws' || pathname.startsWith('/laws/') || pathname.startsWith('/api/laws'))) return false;
    try {
      const host = new URL('http://' + req.headers.host).hostname;
      if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) throw Object.assign(new Error('This application is available on this PC only.'), { statusCode: 403 });
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.headers['x-local-request'] !== '1' || !String(req.headers['content-type']).startsWith('application/json')) {
          throw Object.assign(new Error('Use the local application to make changes.'), { statusCode: 403 });
        }
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
          throw Object.assign(new Error('Cross-origin changes are not allowed.'), { statusCode: 403 });
        }
      }
      if (req.method === 'GET' && ['/', '/laws', '/laws/'].includes(pathname)) {
        sendFile(res, path.join(assets, 'index.html'), 'text/html; charset=utf-8', {
          'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
          'cache-control': 'no-cache',
        });
      } else if (req.method === 'GET' && pathname === '/laws/favicon.svg') {
        sendFile(res, path.join(assets, 'favicon.svg'), 'image/svg+xml', { 'cache-control': 'public, max-age=86400' });
      } else if (req.method === 'GET' && pathname === '/laws/app.js') {
        // Keep the reader and its citation renderer in one response, including for older open pages.
        const script = fs.readFileSync(path.join(assets, 'citationText.js'), 'utf8') + '\n' + fs.readFileSync(path.join(assets, 'app.js'), 'utf8');
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' });
        res.end(script);
      } else if (req.method === 'GET' && ['/laws/citationText.js', '/laws/topicGuides.js', '/laws/style.css'].includes(pathname)) {
        sendFile(res, path.join(assets, path.basename(pathname)), pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8');
      } else if (req.method === 'GET' && /^\/laws\/logos\/(parliament\.gif|national-printing\.png|diavgeia\.png|eurlex\.svg|european-union\.svg)$/.test(pathname)) {
        const type = pathname.endsWith('.svg') ? 'image/svg+xml' : pathname.endsWith('.gif') ? 'image/gif' : 'image/png';
        sendFile(res, path.join(assets, 'logos', path.basename(pathname)), type, { 'cache-control': 'public, max-age=86400' });
      } else if (req.method === 'GET' && pathname === '/api/laws/status') {
        const status = { stats: await store.stats(), sourceSearch: true, storageEngine: 'Neo4j' };
        if (url.searchParams.get('scope') !== 'source') {
          Object.assign(status, { databasePath: store.filename, dataDirectory: dataDir, worker: getWorkerStatus(), importing });
        }
        json(res, 200, status);
      } else if (req.method === 'GET' && pathname === '/api/laws/guides') {
        json(res, 200, require('../../config/law-collection.json'));
      } else if (req.method === 'GET' && pathname === '/api/laws/gazettes') {
        json(res, 200, await store.gazetteIndex());
      } else if (req.method === 'GET' && pathname === '/api/laws/documents') {
        json(res, 200, await store.list({
          q: url.searchParams.get('q'), page: url.searchParams.get('page'), category: url.searchParams.get('category'),
          sort: url.searchParams.get('sort'), type: url.searchParams.get('type') || '',
          sourceOnly: url.searchParams.get('scope') === 'source',
        }));
      } else if (req.method === 'GET' && pathname === '/api/laws/document') {
        const result = await store.get(url.searchParams.get('id'), { sourceOnly: url.searchParams.get('scope') === 'source' });
        json(res, result ? 200 : 404, result || { error: 'Law not found.' });
      } else if (req.method === 'GET' && pathname === '/api/laws/jobs') {
        json(res, 200, { jobs: await store.jobs() });
      } else if (req.method === 'GET' && pathname === '/api/laws/connections') {
        json(res, 200, { connections: await store.connections(url.searchParams.get('id'), url.searchParams.get('depth')) });
      } else if (req.method === 'POST' && pathname === '/api/laws/import') {
        json(res, 202, await startImport(await readBody(req)));
      } else if (req.method === 'PUT' && pathname === '/api/laws/annotation') {
        const body = await readBody(req);
        json(res, 200, await store.saveAnnotation(body.id, body));
      } else if (req.method === 'POST' && pathname === '/api/laws/text') {
        const body = await readBody(req);
        if (typeof body.title !== 'string' || !body.title.trim() || typeof body.text !== 'string' || !body.text.trim()) throw badRequest('Title and source text are required.');
        if (!/^\d{1,6}$/.test(String(body.number)) || !/^\d{4}$/.test(String(body.year))) throw badRequest('Enter a law number and a four-digit year.');
        if (!safeUrl(body.sourceUrl)) throw badRequest('A source URL beginning with http:// or https:// is required.');
        const id = 'law:' + body.number + ':' + body.year;
        const existing = await store.get(id);
        const graph = buildGreekLawDocument({ document: { ...existing?.document, canonical_id: id, type: 'law', document_type: 'law', law_number: String(body.number), law_year: String(body.year), title: body.title.trim(), source_url: body.sourceUrl, source_text: body.text, text_provenance: 'user_supplied_source_text' }, text: body.text });
        json(res, 201, { ...await store.saveGraphs([graph], 'source_text'), id });
      } else if (req.method === 'POST' && pathname === '/api/laws/download') {
        const body = await readBody(req);
        if (typeof body.id !== 'string' || !/^[a-f0-9]{64}$/.test(body.id)) throw badRequest('A source document ID is required.');
        const attachment = await store.attachment(body.id);
        if (!attachment) throw Object.assign(new Error('Source document not found.'), { statusCode: 404 });
        const name = crypto.createHash('sha256').update(attachment.url).digest('hex') + '.pdf';
        const directory = path.join(dataDir, 'files');
        const filename = path.join(directory, name);
        if (!fs.existsSync(filename)) {
          const buffer = await fetchPdf(attachment.url);
          fs.mkdirSync(directory, { recursive: true });
          fs.writeFileSync(filename, buffer, { flag: 'wx' });
        }
        await store.markDownloaded(body.id, name);
        json(res, 201, { url: '/api/laws/files/' + body.id });
      } else if (req.method === 'GET' && /^\/api\/laws\/files\/[a-f0-9]{64}$/.test(pathname)) {
        const attachment = await store.attachment(path.basename(pathname));
        const filename = attachment?.local_file && /^[a-f0-9]{64}\.pdf$/.test(attachment.local_file) ? path.join(dataDir, 'files', attachment.local_file) : null;
        if (!filename || !fs.existsSync(filename)) json(res, 404, { error: 'This PDF has not been saved on this PC.' });
        else sendFile(res, filename, 'application/pdf', { 'content-disposition': 'inline', 'content-security-policy': "sandbox; default-src 'none'" });
      } else if (req.method === 'POST' && pathname === '/api/laws/backup') {
        const directory = path.join(dataDir, 'backups');
        fs.mkdirSync(directory, { recursive: true });
        const name = 'greek-laws-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(3).toString('hex') + '.json';
        await store.backup(path.join(directory, name));
        json(res, 201, { url: '/api/laws/backups/' + name, filename: name });
      } else if (req.method === 'GET' && /^\/api\/laws\/backups\/greek-laws-[\w.-]+\.json$/.test(pathname)) {
        const name = path.basename(pathname);
        const filename = path.join(dataDir, 'backups', name);
        if (!fs.existsSync(filename)) json(res, 404, { error: 'Backup not found.' });
        else sendFile(res, filename, 'application/json', { 'content-disposition': 'attachment; filename="' + name + '"' });
      } else {
        json(res, 404, { error: 'Not found.' });
      }
    } catch (error) {
      json(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'The local application could not complete this request.' });
      if (!error.statusCode) console.error('Local law app:', error);
    }
    return true;
  }

  return { handle, store, async close() { closed = true; await store.close(); } };
}

module.exports = { createLawApp, safeUrl, officialPdfUrl };
