'use strict';

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { LawStore } = require('../src/localLaw/store');
const { graphSettings } = require('../src/localLaw/runtime');
const { buildFoundationGraph } = require('./import-basic-laws');
const { buildRecentGraph, prepareRecent } = require('./import-recent-laws');
const sources = require('../config/citation-library.json');
const example = require('../config/recent-laws.json').entries.find(entry => entry.number === '5275');
const readJson = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const migration = { number: '5038', year: '2023', article_count: 179, topics: [] };

function addAnnex(graph, annex) {
  const documentId = graph.document.canonical_id;
  const id = documentId + ':body:annex';
  const label = 'Παράρτημα · Κανονισμός (ΕΕ) 2017/1954';
  const heading = label + '\nα) Περιγραφή · επιλεγμένα πεδία';
  const sections = annex.fields.map(([number, text]) => number + '. ' + text);
  const common = { document_id: documentId, source_page: annex.source_page, source_url: annex.source_url };
  const text = [heading, ...sections].join('\n');
  graph.units.push({ ...common, id, unit_type: 'body', navigation_number: 'annex', label, text, position: graph.units.length + 1 });
  let start = heading.length + 1;
  for (const [index, [number, field]] of annex.fields.entries()) {
    const end = start + sections[index].length;
    graph.units.push({ ...common, id: id + ':paragraph:' + number, parent_id: id, unit_type: 'paragraph',
      paragraph_number: number, label: 'Πεδίο ' + number, text: field, start_offset: start, end_offset: end,
      position: graph.units.length + 1,
    });
    start = end + 1;
  }
  graph.document.source_text += '\n\n' + text;
  graph.attachments.push({ url: annex.source_url, file_type: 'Παράρτημα · Κανονισμός (ΕΕ) 2017/1954',
    title: 'Επίσημη Εφημερίδα της Ευρωπαϊκής Ένωσης', source_field: 'eu_annex', position: 2 });
}

function prepareCitedPublications(directory, known) {
  const identity = source => (source.document_type || 'law') + ':' + source.number + ':' + source.year;
  const knownDocuments = [...known, ...[migration, ...sources].map(source => ({ canonical_id: identity(source) }))];
  const excerpts = sources.map(source => {
    const raw = source.sections || readJson(path.join(directory, 'directive-1233-2024.json'));
    const sections = raw.map(section => ({
      ...section, label: 'Άρθρο ' + section.number,
      text: section.text || [section.title, section.provenance_line, ...section.paragraphs].filter(Boolean).join('\n'),
    }));
    if (!sections.length || sections.some(section => !section.text.trim() || section.source_page < 1 || section.source_page > source.page_count)) {
      throw new Error('Invalid cited provisions for ' + identity(source));
    }
    const graph = buildFoundationGraph({ ...source, sections, text_coverage: 'excerpt',
      source: source.fek_number ? 'national_printing_office' : 'eu_publications_office',
      text: sections.map(section => section.label + '\n' + section.text).join('\n\n'),
    }, knownDocuments);
    if (source.annex) addAnnex(graph, source.annex);
    return { graph, source, pdf: path.join(directory, source.pdf_filename),
      ...(source.annex ? { additionalPdf: path.join(directory, source.annex.pdf_filename) } : {}) };
  });
  const source = readJson(path.join(directory, 'law-5038-2023.json'));
  if (source.number !== migration.number || source.year !== migration.year || source.fek_number !== '81' ||
      source.source_url !== 'https://api.et.gr/apiLAW/1/2023/5038/pdf' ||
      source.sha256 !== '826446ab38961ce1a697c9795609e51298ccfc6989db097af061eefc7037e0d3' ||
      source.sections.length !== migration.article_count || source.sections.some((section, index) => section.number !== String(index + 1))) {
    throw new Error('The Migration Code extraction does not match the original publication');
  }
  return [{ graph: buildRecentGraph(source, migration, knownDocuments), source,
    pdf: path.join(directory, 'law-5038-2023.pdf') }, ...excerpts];
}

async function main() {
  const directory = path.resolve(process.argv[2] || path.join(__dirname, '../output/citation-library'));
  const settings = graphSettings();
  const status = await fetch('http://127.0.0.1:' + (process.env.INTERNAL_API_PORT || 3001) + '/api/laws/status').then(response => response.json());
  if (status.importing || path.resolve(status.dataDirectory) !== settings.dataDirectory) {
    throw new Error('App is busy or uses another data directory');
  }
  const store = new LawStore(settings);
  const jobId = 'cited-publications-' + crypto.randomUUID();
  try {
    await store.ready;
    const known = await store.knownDocuments();
    const publications = prepareCitedPublications(directory, known);
    const prepared = [];
    for (const item of publications) {
      const existing = await store.get(item.graph.document.canonical_id);
      if (existing?.document.text_kind === 'source_text' &&
        (existing.document.source_hash !== item.source.sha256 ||
         existing.units.filter(unit => !unit.parent_id).length > item.graph.units.filter(unit => !unit.parent_id).length)) continue;
      prepared.push(item);
    }
    prepared.push(...prepareRecent(path.join(__dirname, '../output/laws-2026'), [example], [
      ...known, ...publications.map(item => item.graph.document),
    ]));
    const filesByDocument = prepared.map(item => {
      const files = [{ ...item.source, pdf: item.pdf }];
      if (item.additionalPdf) files.push({ ...item.source.annex, pdf: item.additionalPdf });
      for (const file of files) {
        const bytes = fs.readFileSync(file.pdf);
        if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) || hash(bytes) !== file.sha256) {
          throw new Error('The source PDF failed verification for ' + item.graph.document.canonical_id);
        }
      }
      return { id: item.graph.document.canonical_id, files };
    });
    const before = await store.stats();
    const backup = path.join(settings.dataDirectory, 'backups', 'greek-laws-before-cited-publications-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
    await store.backup(backup);
    await store.startJob(jobId, { source: 'official_publications', collection: 'cited_publications', pageSize: prepared.length });
    const saved = await store.saveGraphs(prepared.map(item => item.graph), 'source_text');
    const files = path.join(settings.dataDirectory, 'files');
    fs.mkdirSync(files, { recursive: true });
    for (const { id, files: publicationFiles } of filesByDocument) {
      const document = await store.get(id);
      for (const file of publicationFiles) {
        const attachment = document.attachments.find(item => item.url === file.source_url);
        const filename = hash(file.source_url) + '.pdf';
        fs.copyFileSync(file.pdf, path.join(files, filename));
        await store.markDownloaded(attachment.id, filename);
      }
    }
    const after = await store.stats();
    await store.finishJob(jobId, { ...saved, before, after, backup });
    console.log(JSON.stringify({ saved, before, after, backup }));
  } catch (error) {
    await store.finishJob(jobId, null, error.message).catch(() => {});
    throw error;
  } finally {
    await store.close();
  }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
