'use strict';

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const collection = require('../config/law-collection.json');
const { LawStore } = require('../src/localLaw/store');
const { graphSettings } = require('../src/localLaw/runtime');
const { buildFoundationGraph } = require('./import-basic-laws');

function prepareCollection(directory) {
  return Object.entries(collection).filter(([, guide]) => guide.article_count).map(([id, guide]) => {
    const source = JSON.parse(fs.readFileSync(path.join(directory, `law-${guide.number}-${guide.year}.json`), 'utf8'));
    if (source.number !== String(guide.number) || source.year !== String(guide.year) || source.published_at !== guide.published_at || source.fek_number !== guide.fek_number || source.source_url !== `https://api.et.gr/apiLAW/1/${guide.year}/${guide.number}/pdf`) throw new Error('Source identity mismatch: ' + id);
    const pdf = path.join(directory, `law-${guide.number}-${guide.year}.pdf`);
    const bytes = fs.readFileSync(pdf);
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) || crypto.createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error('Source PDF checksum mismatch: ' + id);
    if (source.sections.length !== guide.article_count || source.sections.some((section, index) => section.number !== String(index + 1) || !section.text.trim() || !Number.isInteger(section.source_page) || section.source_page < 1 || section.source_page > source.page_count)) throw new Error('Incomplete article sequence: ' + id);
    const graph = buildFoundationGraph(source, Object.keys(collection).map(canonical_id => ({ canonical_id })));
    graph.document.short_title = guide.short_title;
    graph.document.category = guide.category;
    for (const topic of guide.topics) {
      if (!source.sections.some(section => section.number === topic.article)) throw new Error('Missing reading-guide article: ' + id);
    }
    return { source, graph, pdf };
  });
}

async function main() {
  const directory = path.resolve(process.argv[2] || path.join(__dirname, '../output/legal-foundations'));
  const prepared = prepareCollection(directory); // Validate the entire batch before connecting or writing.
  const port = process.env.INTERNAL_API_PORT || '3001';
  const response = await fetch(`http://127.0.0.1:${port}/api/laws/status`);
  if (!response.ok) throw new Error('Start the local law app before importing.');
  const status = await response.json();
  if (status.importing) throw new Error('Wait until the active import completes.');
  const settings = graphSettings();
  if (path.resolve(status.dataDirectory) !== settings.dataDirectory) throw new Error('The running app uses a different data directory.');
  const store = new LawStore(settings);
  const jobId = 'collection-' + crypto.randomUUID();
  try {
    await store.ready;
    await store.startJob(jobId, { source: 'national_printing_office', collection: 'everyday_law', pageSize: prepared.length });
    const saved = await store.saveGraphs(prepared.map(item => item.graph), 'source_text');
    const fileDir = path.join(settings.dataDirectory, 'files');
    fs.mkdirSync(fileDir, { recursive: true });
    for (const { graph, source, pdf } of prepared) {
      const doc = await store.get(graph.document.canonical_id);
      const attachment = doc.attachments.find(item => item.url === source.source_url);
      const name = crypto.createHash('sha256').update(source.source_url).digest('hex') + '.pdf';
      fs.copyFileSync(pdf, path.join(fileDir, name));
      await store.markDownloaded(attachment.id, name);
      console.log(`${graph.document.canonical_id}: ${source.sections.length} articles; original PDF saved.`);
    }
    await store.finishJob(jobId, { ...saved, page: { total_records: prepared.length } });
    console.log(JSON.stringify(saved));
  } catch (error) {
    try { await store.finishJob(jobId, null, error.message); } catch { /* Keep the import error. */ }
    throw error;
  } finally { await store.close(); }
}

module.exports = { prepareCollection };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
