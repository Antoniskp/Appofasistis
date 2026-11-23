'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { once } = require('node:events');
const { LawStore, fold } = require('../src/localLaw/store');
const { graphSettings } = require('../src/localLaw/runtime');
const { createLawApp, officialPdfUrl } = require('../src/localLaw/app');
const { buildGreekLawDocument } = require('../src/legal/document');
const graphTest = process.env.NEO4J_TESTS === 'true' ? test : test.skip;

function graph(number = '100', text = 'Άρθρο 1\n1. Σύμφωνα με τον ν. 200/2020.', title = 'Προστασία περιβάλλοντος') {
  return buildGreekLawDocument({ document: { canonical_id: 'law:' + number + ':2020', type: 'law', law_number: number, law_year: '2020', title, source_url: 'https://www.hellenicparliament.gr/example.pdf', source_text: text }, text });
}

async function withStore(fn) {
  const settings = { ...graphSettings(), namespace: 'test-' + crypto.randomUUID() };
  const store = new LawStore(settings);
  try { await store.ready; await fn(store, settings); }
  finally {
    try { await store.write(tx => tx.run('MATCH (n:LegalEntity {namespace:$ns}) DETACH DELETE n')); }
    finally { await store.close(); }
  }
}

test('Greek search folding handles accents and final sigma', () => {
  assert.equal(fold('Προστασία περιβάλλοντος'), fold('ΠΡΟΣΤΑΣΙΑ ΠΕΡΙΒΑΛΛΟΝΤΟΣ'));
});

graphTest('previously imported text exposes newly recognized citations with live local availability', async () => withStore(async store => {
  const source = graph('100', 'Άρθρο 1\n[Άρθρα 4 και 5 της Οδηγίας (ΕΕ) 2024/1233]');
  source.references = [];
  const target = buildGreekLawDocument({ document: { canonical_id: 'eu_directive:1233:2024', type: 'eu_directive',
    title: 'Οδηγία (ΕΕ) 2024/1233', source_url: 'https://eur-lex.europa.eu/eli/dir/2024/1233/oj/ell' },
  text: 'Άρθρο 4\nΕνιαία διαδικασία υποβολής αίτησης.' });
  await store.saveGraphs([source, target], 'source_text');
  const { references } = await store.get(source.document.canonical_id);
  assert.deepEqual(references.map(ref => [ref.raw_text, ref.resolved, ref.target_resolved]), [
    ['4', true, true], ['5', true, false], ['Οδηγίας (ΕΕ) 2024/1233', true, true],
  ]);
}));

graphTest('Neo4j searches Greek accents, legal numbers, and saved notes', async () => withStore(async store => {
  await store.saveGraphs([graph()]);
  assert.equal((await store.list({ q: 'ΠΡΟΣΤΑΣΙΑ ΠΕΡΙΒΑΛΛΟΝΤΟΣ' })).total, 1);
  assert.equal((await store.list({ q: '100/2020' })).total, 1);
  assert.equal((await store.list({ q: '" OR *' })).total, 0);
  assert.equal((await store.list({ q: "'; DROP TABLE documents;--" })).total, 0);
  await store.saveAnnotation('law:100:2020', { summary: 'Δημοτικές συμβάσεις', notes: 'Σημείωση', tags: ['προμήθειες'], revision: 0 });
  assert.equal((await store.list({ q: 'προμηθειες' })).total, 1);
  assert.equal((await store.list({ q: 'προμηθειες', sourceOnly: true })).total, 0);
  assert.equal((await store.list({ q: 'ΠΡΟΣΤΑΣΙΑ ΠΕΡΙΒΑΛΛΟΝΤΟΣ', sourceOnly: true })).total, 1);
}));

graphTest('topic filters combine with Greek search and preserve unfiltered documents', async () => withStore(async store => {
  const privacy = graph('4624', 'Άρθρο 1\n1. Επεξεργασία δεδομένων.', 'Νόμος δεδομένων');
  privacy.document.canonical_id = 'law:4624:2019';
  await store.saveGraphs([privacy, graph()]);
  assert.equal((await store.list({ category: 'Ιδιωτικότητα' })).total, 1);
  assert.equal((await store.list({ category: 'Ιδιωτικότητα', q: 'προσωπικα' })).total, 1);
  assert.equal((await store.list({ category: 'Καταναλωτής' })).total, 0);
  assert.equal((await store.list({ category: 'unknown' })).total, 0);
  assert.equal((await store.list()).total, 2);
}));

graphTest('reimport preserves source text and notes and deduplicates graph identities', async () => withStore(async store => {
  await store.saveGraphs([graph()], 'source_text');
  await store.saveAnnotation('law:100:2020', { summary: 'Περίληψη', notes: 'Κράτησέ με', tags: [], revision: 0 });
  const refreshed = graph('100', 'Μόνο μεταδεδομένα', 'Ενημερωμένος τίτλος');
  refreshed.document.source_url = 'https://www.hellenicparliament.gr/api.ashx';
  assert.deepEqual(await store.saveGraphs([refreshed]), { created: 0, updated: 1, total: 1 });
  const doc = await store.get('law:100:2020');
  assert.equal(doc.document.title, 'Ενημερωμένος τίτλος');
  assert.equal(doc.document.source_url, 'https://www.hellenicparliament.gr/example.pdf');
  assert.equal(doc.document.text_kind, 'source_text');
  assert.match(doc.sourceText, /Σύμφωνα/);
  assert.equal(doc.annotation.notes, 'Κράτησέ με');
  assert.equal(doc.references.length, 1);
  assert.equal((await store.stats()).documents, 1);
}));

graphTest('graph placeholders resolve later and support incoming and multi-hop links', async () => withStore(async store => {
  await store.saveGraphs([graph()]);
  assert.equal((await store.get('law:100:2020')).references[0].resolved, false);
  await store.saveGraphs([graph('200', 'Άρθρο 1\n1. Σύμφωνα με τον ν. 300/2020.')]);
  await store.saveGraphs([graph('300', 'Άρθρο 1\n1. Κείμενο αναφοράς.')]);
  assert.equal((await store.get('law:100:2020')).references[0].resolved, true);
  assert.equal((await store.get('law:200:2020')).incoming[0].id, 'law:100:2020');
  const connected = await store.connections('law:100:2020', 4);
  assert.ok(connected.some(doc => doc.id === 'law:300:2020' && doc.distance === 4));
  assert.equal((await store.stats()).documents, 3);
}));

graphTest('failed batches roll back and concurrent stale notes cannot overwrite edits', async () => withStore(async store => {
  await assert.rejects(store.saveGraphs([graph(), { document: {} }]));
  assert.equal((await store.stats()).documents, 0);
  await store.saveGraphs([graph()]);
  const edits = await Promise.allSettled(['First', 'Second'].map(summary => store.saveAnnotation('law:100:2020', { summary, notes: '', tags: [], revision: 0 })));
  assert.equal(edits.filter(edit => edit.status === 'fulfilled').length, 1);
  assert.equal(edits.filter(edit => edit.status === 'rejected' && edit.reason.statusCode === 409).length, 1);
  const saved = await store.get('law:100:2020');
  await store.saveAnnotation('law:100:2020', { summary: 'Next', notes: '', tags: [], revision: saved.annotation.revision });
  assert.equal((await store.get('law:100:2020')).revisions.length, 2);
}));

graphTest('graph export restores all relationships and revisions; interrupted jobs persist', async () => withStore(async (store, settings) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'appofasistis-graph-'));
  const filename = path.join(directory, 'backup.json');
  try {
    await store.saveGraphs([graph()], 'source_text');
    await store.saveAnnotation('law:100:2020', { summary: 'Saved', notes: '', tags: [], revision: 0 });
    await store.startJob('job-1', { pageNo: 1 });
    await store.backup(filename);
    const legacyDump = JSON.parse(fs.readFileSync(filename, 'utf8'));
    for (const node of legacyDump.nodes) delete node.properties.catalogue_metadata;
    fs.writeFileSync(filename, JSON.stringify(legacyDump));
    const reopened = new LawStore(settings);
    try {
      await reopened.ready;
      assert.equal((await reopened.jobs())[0].status, 'interrupted');
      assert.equal((await reopened.get('law:100:2020')).annotation.summary, 'Saved');
    } finally { await reopened.close(); }
    await withStore(async restored => {
      await restored.restore(filename);
      assert.equal((await restored.list()).items[0].law_number, '100');
      assert.equal((await restored.get('law:100:2020')).sourceText, graph().document.source_text);
      assert.equal((await restored.get('law:100:2020')).references.length, 1);
      assert.equal((await restored.get('law:100:2020')).annotation.summary, 'Saved');
      assert.equal((await restored.get('law:100:2020')).revisions.length, 1);
      await assert.rejects(restored.restore(filename), /empty/);
    });
  } finally { if (fs.existsSync(filename)) fs.unlinkSync(filename); fs.rmdirSync(directory); }
}));

graphTest('local HTTP app uses Neo4j and rejects cross-origin writes', async () => {
  const storeOptions = { ...graphSettings(), namespace: 'test-' + crypto.randomUUID() };
  const app = createLawApp({ storeOptions, importer: async () => ({ documents: [graph()], page: { total_records: 1 }, source_url: 'https://www.hellenicparliament.gr/api.ashx' }) });
  await app.store.ready;
  const server = http.createServer((req, res) => { app.handle(req, res).then(handled => { if (!handled) { res.writeHead(404); res.end(); } }); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const headers = { 'content-type': 'application/json', 'x-local-request': '1' };
  try {
    assert.equal((await fetch(base + '/')).status, 200);
    const readerScript = await fetch(base + '/laws/app.js');
    assert.equal(readerScript.headers.get('cache-control'), 'no-store');
    const readerSource = await readerScript.text();
    const citationSource = fs.readFileSync(path.join(__dirname, '../public/laws/citationText.js'), 'utf8');
    const appSource = fs.readFileSync(path.join(__dirname, '../public/laws/app.js'), 'utf8');
    assert.equal(readerSource, citationSource + '\n' + appSource);
    const guides = await (await fetch(base + '/api/laws/guides')).json();
    assert.equal(guides['law:5089:2024'].category, 'Οικογένεια');
    const rejected = await fetch(base + '/api/laws/import', { method: 'POST', headers: { ...headers, origin: 'https://evil.example' }, body: '{}' });
    assert.equal(rejected.status, 403);
    const noHeader = await fetch(base + '/api/laws/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(noHeader.status, 403);
    assert.equal((await fetch(base + '/api/laws/import', { method: 'POST', headers, body: '{}' })).status, 202);
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await app.store.jobs())[0]?.status === 'completed') break;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.equal((await app.store.list({ q: '100' })).total, 1);
    assert.equal((await app.store.jobs())[0].status, 'completed');
    const status = await (await fetch(base + '/api/laws/status')).json();
    assert.equal(status.worker.enabled, false);
    assert.equal(status.storageEngine, 'Neo4j');
    const gazettes = await (await fetch(base + '/api/laws/gazettes')).json();
    assert.equal(gazettes.summary.saved, 0);
    assert.equal(gazettes.years.find(group => group.year === 1833).total, 42);
    assert.equal(gazettes.years.find(group => group.year === 1833).complete, false);
    const lawsOnly = await (await fetch(base + '/api/laws/documents?type=law')).json();
    assert.equal(lawsOnly.total, 1);
    assert.equal((await fetch(base + '/api/laws/documents?type=invalid')).status, 400);
    const textResponse = await fetch(base + '/api/laws/text', { method: 'POST', headers, body: JSON.stringify({ number: '200', year: '2020', title: 'Νόμος προορισμού', sourceUrl: 'https://www.hellenicparliament.gr/example.pdf', text: 'Προοίμιο\nΆρθρο 1\n1. Διάταξη.' }) });
    assert.equal(textResponse.status, 201);
    assert.equal((await app.store.get('law:100:2020')).references[0].resolved, true);
    assert.match((await app.store.get('law:200:2020')).sourceText, /Προοίμιο/);
    const unsafe = await fetch(base + '/api/laws/text', { method: 'POST', headers, body: JSON.stringify({ number: '1', year: '2020', title: 'Invalid', sourceUrl: 'javascript:alert(1)', text: 'text' }) });
    assert.equal(unsafe.status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await app.store.write(tx => tx.run('MATCH (n:LegalEntity {namespace:$ns}) DETACH DELETE n'));
    await app.close();
  }
});

test('PDF downloads restrict redirects to official HTTPS sources', () => {
  assert.equal(officialPdfUrl('https://www.hellenicparliament.gr/UserFiles/law.pdf').protocol, 'https:');
  for (const url of ['http://www.hellenicparliament.gr/law.pdf', 'https://127.0.0.1/law.pdf', 'https://hellenicparliament.gr.evil.example/law.pdf', 'https://www.hellenicparliament.gr:444/law.pdf']) assert.throws(() => officialPdfUrl(url));
});


graphTest('article and paragraph placeholders resolve after later imports and refreshes without changing the source', async () => withStore(async store => {
  const source=graph('901', 'Άρθρο 1\n1. Η παρ. 2 του άρθρου 5 του ν. 902/2020.');
  await store.saveGraphs([source], 'source_text');
  let ref=(await store.get('law:901:2020')).references[0];
  assert.equal(ref.resolved,false);
  assert.equal(ref.target_resolved,false);
  await store.saveGraphs([graph('902','Άρθρο 1\n1. Άλλο άρθρο.')], 'source_text');
  ref=(await store.get('law:901:2020')).references[0];
  assert.equal(ref.resolved,true);
  assert.equal(ref.target_resolved,false);
  assert.equal(ref.article_resolved,false);
  await store.saveGraphs([graph('902','Άρθρο 5\n1. Πρώτη.\n2. Δεύτερη.')], 'source_text');
  ref=(await store.get('law:901:2020')).references[0];
  assert.equal(ref.target_resolved,true);
  assert.equal(ref.article_resolved,true);
  assert.equal(ref.target_canonical_id,'law:902:2020:article:5:paragraph:2');
  assert.equal((await store.get('law:902:2020')).incoming[0].id,'law:901:2020');
  await store.saveGraphs([graph('902','Άρθρο 5\n1. Μόνο μία παράγραφος.')], 'source_text');
  ref=(await store.get('law:901:2020')).references[0];
  assert.equal(ref.resolved,true);
  assert.equal(ref.article_resolved,true);
  assert.equal(ref.target_resolved,false);
}));

graphTest('mixed historical types sort by source chronology and archival scans survive metadata refreshes', async () => withStore(async store => {
  const {buildHistoricalGraph}=require('../src/legal/historical');
  const entries=require('../config/historical-collection.json').entries;
  const constitution={...entries.find(e=>e.id==='constitution:epidaurus:1822'),sections:[],coverage:'scan_only',text_kind:'archival_scan',expected_indexed_numbers:undefined,verified_references:[]};
  const royal=entries.find(e=>e.id==='royal_decree:2:1833');
  const circular=entries.find(e=>e.id==='ministerial_circular:interior:62:1833');
  await store.saveGraphs([{...buildHistoricalGraph(circular),text_kind:'source_text'}]);
  assert.equal((await store.get(circular.id)).references[0].resolved,false);
  await store.saveGraphs([{...buildHistoricalGraph(royal),text_kind:'source_text'}]);
  assert.equal((await store.get(circular.id)).references[0].target_resolved,true);
  await store.saveGraphs([{...buildHistoricalGraph(constitution),text_kind:'archival_scan'}]);
  await store.saveGraphs([graph()], 'source_text');
  const sorted=await store.list({sort:'oldest'});
  assert.deepEqual(sorted.items.map(d=>d.canonical_id),[constitution.id,royal.id,circular.id,'law:100:2020']);
  const filtered=await store.list({sort:'oldest',category:'Ιστορικές αφετηρίες'});
  assert.deepEqual(filtered.items.map(d=>d.canonical_id),[constitution.id,royal.id,circular.id]);
  assert.equal((await store.list({sort:'oldest',q:'1833'})).total,2);
  await store.saveGraphs([{document:{canonical_id:constitution.id,title:'Updated catalogue entry'},units:[],references:[]}]);
  const retained=await store.get(constitution.id);
  assert.equal(retained.document.text_kind,'archival_scan');
  assert.equal(retained.document.source_url,constitution.source_url);
  assert.equal(retained.units.length,0);
  assert.equal(retained.sourceText,null);
}));
graphTest('collection statistics exclude placeholders and superseded provisions and split coverage', async () => withStore(async store => {
  const empty = await store.stats();
  for (const key of ['documents','laws','units','articles','paragraphs','textDocuments','metadataDocuments','archivalDocuments','references','attachments','downloadedPdfs']) assert.equal(empty[key], 0, key);
  assert.equal(empty.lastUpdated, null);
  await store.saveGraphs([graph('981', 'Άρθρο 1\n1. Πρώτη.\n2. Δεύτερη.\nΆρθρο 2\n1. Η παρ. 3 του άρθρου 5 του ν. 999/2020.')], 'source_text');
  let counts = await store.stats();
  assert.equal(counts.documents, 1);
  assert.equal(counts.laws, 1);
  assert.equal(counts.articles, 2);
  assert.equal(counts.paragraphs, 3);
  assert.equal(counts.units, 5);
  assert.equal(counts.textDocuments, 1);
  assert.equal(counts.references, 1);
  assert.ok(counts.lastUpdated);
  await store.saveGraphs([graph('981', 'Άρθρο 1\n1. Νέο κείμενο.')], 'source_text');
  await store.saveGraphs([graph('982', 'Στοιχεία Βουλής χωρίς νομοθετικό κείμενο.')]);
  const scan = graph('983', '');
  scan.document.canonical_id = 'constitution:983:2020';
  scan.units = [];
  scan.references = [];
  scan.attachments = [{ id: 'stats-test-pdf', url: 'https://www.hellenicparliament.gr/stats-test.pdf', file_type: 'PDF' }];
  await store.saveGraphs([scan], 'archival_scan');
  const sourceId = crypto.createHash('sha256').update(scan.document.canonical_id + '\0' + scan.attachments[0].url).digest('hex');
  await store.markDownloaded(sourceId, 'stats-test.pdf');
  counts = await store.stats();
  assert.equal(counts.documents, 3);
  assert.equal(counts.laws, 2);
  assert.equal(counts.articles, 1);
  assert.equal(counts.paragraphs, 1);
  assert.equal(counts.units, 3); // Metadata body is separate from articles and paragraphs.
  assert.equal(counts.textDocuments, 1);
  assert.equal(counts.metadataDocuments, 1);
  assert.equal(counts.archivalDocuments, 1);
  assert.equal(counts.references, 0);
  assert.equal(counts.downloadedPdfs, 1);
  assert.ok(counts.attachments >= counts.downloadedPdfs);
}));

graphTest('a historical paragraph link activates when an archival scan gains a reviewed transcription',async()=>withStore(async store=>{
 const {buildHistoricalGraph}=require('../src/legal/historical');const entry=require('../config/historical-collection.json').entries.find(e=>e.id==='constitution:epidaurus:1822');
 const source=graph('991','Άρθρο 1\n1. Παραπομπή στην παράγραφο γ΄ του Πολιτεύματος του 1822.');
 source.references=[{raw_text:'παράγραφος γ΄ του Πολιτεύματος του 1822',document_type:'constitution',document_canonical_id:entry.id,target_canonical_id:entry.id+':paragraph:γ',article:null,paragraph:'γ',relation_type:'mentions',from_unit_id:source.units[1].id}];
 await store.saveGraphs([source],'source_text');assert.equal((await store.get(source.document.canonical_id)).references[0].resolved,false);
 const scan={...entry,coverage:'scan_only',text_kind:'archival_scan',sections:[],expected_indexed_numbers:undefined,verified_references:[]};
 await store.saveGraphs([{...buildHistoricalGraph(scan),text_kind:'archival_scan'}]);
 let ref=(await store.get(source.document.canonical_id)).references[0];assert.equal(ref.resolved,true);assert.equal(ref.target_resolved,false);
 await store.saveGraphs([{...buildHistoricalGraph(entry),text_kind:'source_text'}]);
 ref=(await store.get(source.document.canonical_id)).references[0];assert.equal(ref.target_resolved,true);assert.equal(ref.article_resolved,false);
 assert.equal(ref.target_canonical_id,entry.id+':paragraph:γ');assert.equal((await store.get(entry.id)).units.length,entry.sections.length);
}));
graphTest('pending treaty citations do not inflate the collection and resolve exact articles on later import',async()=>withStore(async store=>{
 const {buildHistoricalGraph}=require('../src/legal/historical');
 const entry=require('../config/historical-collection.json').entries.find(e=>e.id==='royal_proclamation:territorial_possession:1833');
 await store.saveGraphs([{...buildHistoricalGraph(entry),text_kind:'source_text'}]);
 let declaration=await store.get(entry.id);assert.equal(declaration.references.length,4);assert.ok(declaration.references.every(ref=>!ref.resolved));
 let counts=await store.stats();assert.equal(counts.documents,1);assert.equal(counts.articles,0);assert.equal(counts.units,1);
 const treatyId='international_treaty:london:7_may:1832';
 const fixture={...entry,id:treatyId,type:'international_treaty',year:1832,title:'Test treaty fixture',chronology_key:'1832-05-07',verified_references:[],sections:[{number:'4',label:'Article 4',title:null,text:'Test provision four.',source_page:1}]};
 await store.saveGraphs([{...buildHistoricalGraph(fixture),text_kind:'source_text'}]);
 declaration=await store.get(entry.id);
 assert.equal(declaration.references.find(ref=>ref.article==='4').target_resolved,true);
 assert.equal(declaration.references.find(ref=>ref.article==='5').resolved,true);
 assert.equal(declaration.references.find(ref=>ref.article==='5').target_resolved,false);
 fixture.sections.push({number:'5',label:'Article 5',title:null,text:'Test provision five.',source_page:1});
 await store.saveGraphs([{...buildHistoricalGraph(fixture),text_kind:'source_text'}]);
 declaration=await store.get(entry.id);assert.equal(declaration.references.find(ref=>ref.article==='5').target_resolved,true);
 counts=await store.stats();assert.equal(counts.documents,2);assert.equal(counts.articles,2);assert.equal(counts.references,4);
}));

graphTest('law lists filter before pagination and combine with search and topic filters', async () => withStore(async store => {
  const laws = Array.from({ length: 31 }, (_, i) => graph(String(7000 + i), 'Άρθρο 1\n1. Κοινό κείμενο.', 'Δοκιμαστικός νόμος ' + i));
  laws[0] = buildGreekLawDocument({ document: { canonical_id: 'law:4624:2019', type: 'law', title: 'Νόμος ιδιωτικότητας' }, text: 'Άρθρο 1\n1. Δεδομένα.' });
  const decree = buildGreekLawDocument({ document: { canonical_id: 'presidential_decree:1:2020', type: 'presidential_decree', title: 'Προεδρικό διάταγμα με αναφορά σε νόμους' }, text: 'Άρθρο 1\n1. Δεδομένα.' });
  await store.saveGraphs([...laws, decree], 'source_text');
  assert.equal((await store.list()).total, 32);
  const first = await store.list({ type: 'law' });
  assert.equal(first.total, 31);
  assert.equal(first.items.length, 30);
  assert.ok(first.items.every(doc => doc.canonical_id.startsWith('law:')));
  const second = await store.list({ type: 'law', page: 2 });
  assert.equal(second.items.length, 1);
  assert.equal(new Set([...first.items, ...second.items].map(doc => doc.canonical_id)).size, 31);
  assert.equal((await store.list({ type: 'law', q: 'Προεδρικό' })).total, 0);
  assert.equal((await store.list({ type: 'law', q: 'ιδιωτικοτητα', category: 'Ιδιωτικότητα' })).total, 1);
  assert.equal((await store.list({ type: 'law', category: 'Ιστορικές αφετηρίες' })).total, 0);
  await assert.rejects(store.list({ type: 'invalid' }), error => error.statusCode === 400);
}));

graphTest('catalogue summaries backfill old collections and stay current without exposing full source/search text', async () => withStore(async (store, settings) => {
 const source=graph('998','Άρθρο 1\n1. Κείμενο με πλήρη πηγή.');
 Object.assign(source.document,{fek_issue:'Α',fek_number:'2',fek_year:'2020',category:'Δοκιμή',chronology_key:'2020-01-02'});
 await store.saveGraphs([source],'source_text');
 const before=await store.stats();
 await store.write(tx=>tx.run('MATCH (d:LegalDocument {namespace:$ns,id:$id}) REMOVE d.catalogue_metadata',{id:source.document.canonical_id}));
 const reopened=new LawStore(settings);
 try {
  await reopened.ready;
  const row=(await reopened.read(tx=>tx.run('MATCH (d:LegalDocument {namespace:$ns,id:$id}) RETURN d.catalogue_metadata AS summary,d.metadata AS full,d.search_text AS search',{id:source.document.canonical_id}))).records[0];
  assert.equal(JSON.parse(row.get('summary')).source_text,undefined);
  assert.equal(JSON.parse(row.get('full')).source_text,source.document.source_text);
  assert.ok(row.get('search').includes('κειμενο'));
  assert.equal((await reopened.get(source.document.canonical_id)).sourceText,source.document.source_text);
  assert.equal((await reopened.knownDocuments())[0].source_text,undefined);
  assert.equal((await reopened.knownDocuments())[0].canonical_id,source.document.canonical_id);
  const listing=await reopened.list({q:'πλήρη'});assert.equal(listing.total,1);assert.equal(listing.items[0].source_text,undefined);
  const catalogue=await reopened.gazetteIndex();const issue=catalogue.issues.find(i=>i.id==='fek:Α:2:2020');assert.equal(issue.documents[0].id,source.document.canonical_id);assert.equal(issue.documents[0].hasText,true);
  assert.deepEqual(await reopened.stats(),before);
  source.document.title='Ενημερωμένος τίτλος';await reopened.saveGraphs([source],'source_text');
  assert.equal((await reopened.list()).items[0].title,'Ενημερωμένος τίτλος');
  assert.equal((await reopened.gazetteIndex()).issues.find(i=>i.id==='fek:Α:2:2020').documents[0].title,'Ενημερωμένος τίτλος');
 } finally {await reopened.close();}
}));

graphTest('graph backups retain every node and edge across keyset page boundaries', async () => withStore(async store => {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'law-paged-backup-')),filename=path.join(directory,'backup.json');
 try {
  const ids=Array.from({length:405},(_,i)=>'unit:'+String(i).padStart(4,'0'));
  await store.write(async tx=>{
   await tx.run('UNWIND $ids AS id CREATE (:LegalEntity:LegalUnit {namespace:$ns,id:id,payload:$payload})',{ids,payload:JSON.stringify({text:'Preserved source fixture'})});
   await tx.run('UNWIND $edges AS edge MATCH (a:LegalEntity {namespace:$ns,id:edge.a}),(b:LegalEntity {namespace:$ns,id:edge.b}) CREATE (a)-[:CONTAINS]->(b)',{edges:ids.slice(1).map((id,i)=>({a:ids[i],b:id}))});
  });
  await store.backup(filename);const dump=JSON.parse(fs.readFileSync(filename,'utf8'));
  assert.equal(dump.nodes.length,405);assert.equal(dump.relationships.length,404);assert.deepEqual(dump.nodes.map(n=>n.properties.id),ids);assert.ok(dump.nodes.every(n=>JSON.parse(n.properties.payload).text==='Preserved source fixture'));
  await withStore(async restored=>{assert.deepEqual(await restored.restore(filename),{nodes:405,relationships:404});const saved=await restored.read(tx=>tx.run('MATCH (a:LegalEntity {namespace:$ns})-[:CONTAINS]->(b:LegalEntity {namespace:$ns}) RETURN count(*) AS count'));assert.equal(saved.records[0].get('count'),404);});
 } finally {if(fs.existsSync(filename))fs.unlinkSync(filename);fs.rmdirSync(directory);}
}));
