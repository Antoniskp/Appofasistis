'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const neo4j = require('neo4j-driver');
const { parseGreekLegalCitations, scopeNumberedCodeCitation } = require('../legal/citations');
const { parseCodeReferences } = require('../legal/codeReferences');

const fold = text => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ς/g, 'σ');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const parse = text => text ? JSON.parse(text) : null;
const catalogueMetadata = text => { const { source_text, ...metadata } = parse(text) || {}; return JSON.stringify(metadata); };
const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const labels = new Set(['LegalEntity', 'LegalDocument', 'LegalUnit', 'Source', 'Annotation', 'Revision', 'LegalReference', 'ImportJob', 'TextVersion']);
const relationships = new Set(['HAS_UNIT', 'CONTAINS', 'HAS_SOURCE', 'HAS_REFERENCE', 'TARGETS', 'FROM_UNIT', 'CITES', 'AMENDS', 'REPEALS', 'REPLACES', 'APPLIES', 'HAS_ANNOTATION', 'HAS_REVISION', 'HAS_TEXT_VERSION']);

async function supplementIndexedCitations(tx, units, references, document) {
  const relocated = [];
  references = references.map(ref => {
    const target = scopeNumberedCodeCitation(ref.target_canonical_id);
    if (target === ref.target_canonical_id) return ref;
    const updated = { ...ref, target_canonical_id: target };
    relocated.push(updated);
    return updated;
  });
  const byId = new Map(units.map(unit => [unit.id, unit]));
  const stored = new Set(references.map(ref => {
    const source = byId.get(ref.from_unit_id);
    return JSON.stringify([source?.parent_id || ref.from_unit_id, ref.raw_text, ref.target_canonical_id]);
  }));
  const additions = [];
  for (const unit of units) {
    if (unit.parent_id || !unit.text) continue;
    const explicit = parseGreekLegalCitations(unit.text, { modernConstitution: !document.historical && Number(document.law_year) >= 2020 })
      .filter(ref => ref.document_type.startsWith('eu_') || ref.document_type === 'constitution' || ref.evidence_basis === 'explicit_article_list');
    const named = parseCodeReferences(unit.text, document.canonical_id, { scope: unit.scope_key })
      .filter(ref => ref.evidence_basis === 'explicit_named_code_reference' && ['law:5038:2023', 'law:2690:1999', 'law:5219:2025', 'law:5222:2025'].includes(ref.document_canonical_id));
    for (const ref of [...explicit, ...named]) {
      // Older imports predate EU citations and explicit article lists.
      if (stored.has(JSON.stringify([unit.id, ref.raw_text, ref.target_canonical_id]))) continue;
      additions.push({ ...ref, from_document_id: document.canonical_id, from_unit_id: unit.id });
    }
  }
  const toResolve = [...relocated, ...additions];
  if (!toResolve.length) return references;
  const keys = new Map(toResolve.map(ref => [ref.target_canonical_id, {
    targetId: ref.target_canonical_id, documentId: ref.document_canonical_id,
    articleId: ref.article ? ref.target_canonical_id.replace(/:paragraph:[^:]+$/u, '') : '',
  }]));
  const availability = await tx.run(`UNWIND $keys AS key
    OPTIONAL MATCH (d:LegalEntity:LegalDocument {namespace:$ns,id:key.documentId,imported:true})
    OPTIONAL MATCH (u:LegalEntity:LegalUnit {namespace:$ns,id:key.targetId,active:true})
    OPTIONAL MATCH (a:LegalEntity:LegalUnit {namespace:$ns,id:key.articleId,active:true})
    RETURN key.targetId AS id, d IS NOT NULL AS resolved, d IS NOT NULL AND (u IS NOT NULL OR key.documentId=key.targetId) AS target_resolved,
      d IS NOT NULL AND a IS NOT NULL AS article_resolved`, { keys: [...keys.values()] });
  const states = new Map(availability.records.map(row => [row.get('id'), {
    resolved: row.get('resolved'), target_resolved: row.get('target_resolved'), article_resolved: row.get('article_resolved'),
  }]));
  for (const ref of toResolve) Object.assign(ref, states.get(ref.target_canonical_id));
  return [...references, ...additions];
}

class LawStore {
  constructor({ uri = 'bolt://127.0.0.1:7687', username = 'neo4j', password, database = 'neo4j', namespace = 'laws', dataDirectory = path.resolve(__dirname, '../../data') }) {
    const endpoint = new URL(uri);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) throw new Error('The law database must run locally on this PC.');
    if (!password) throw new Error('Local Neo4j credentials are missing. Run npm run local after npm run db:setup.');
    this.driver = neo4j.driver(uri, neo4j.auth.basic(username, password), { disableLosslessIntegers: true, maxTransactionRetryTime: 10000 });
    this.database = database;
    this.namespace = namespace;
    this.dataDirectory = path.resolve(dataDirectory);
    this.filename = uri + '/' + database;
    this.ready = this.initialize();
  }

  async session(mode, work, sessionOptions = {}) {
    const session = this.driver.session({ database: this.database, ...sessionOptions });
    try { return await session[mode](tx => work({ run: (query, params = {}) => tx.run(query, { ...params, ns: this.namespace }) })); }
    finally { await session.close(); }
  }
  async read(work) { await this.ready; return this.session('executeRead', work); }
  async write(work, sessionOptions = {}) {
    await this.ready;
    return this.session('executeWrite', async tx => {
      await tx.run('MERGE (c:LawCollection {namespace:$ns}) SET c.write_lock=coalesce(c.write_lock,0)+1');
      return work(tx);
    }, sessionOptions);
  }

  async initialize() {
    await this.driver.verifyConnectivity();
    await this.session('executeWrite', async tx => {
      await tx.run('CREATE CONSTRAINT law_entity_id IF NOT EXISTS FOR (n:LegalEntity) REQUIRE (n.namespace, n.id) IS UNIQUE');
      await tx.run('CREATE CONSTRAINT law_collection_id IF NOT EXISTS FOR (n:LawCollection) REQUIRE n.namespace IS UNIQUE');
      await tx.run('CREATE FULLTEXT INDEX law_search IF NOT EXISTS FOR (n:LegalDocument) ON EACH [n.search_text]');
      await tx.run('CREATE FULLTEXT INDEX law_source_search IF NOT EXISTS FOR (n:LegalDocument) ON EACH [n.source_search_text]');
    });
    await this.session('executeWrite', tx => tx.run("MATCH (j:ImportJob {namespace:$ns, status:'running'}) SET j.status='interrupted', j.error='The app stopped before this import finished.', j.finished_at=$now", { now: new Date().toISOString() }));
    await this.session('executeRead', tx => tx.run('CALL db.awaitIndexes(60)'));
    await this.backfillCatalogueMetadata();
    await this.backfillSourceSearch();
  }

  async backfillSourceSearch() {
    for (;;) {
      const count = await this.session('executeWrite', async tx => {
        const rows = await tx.run(`MATCH (d:LegalDocument {namespace:$ns,imported:true})
          WHERE d.source_search_text IS NULL RETURN d.id AS id LIMIT 20`);
        for (const row of rows.records) await this.indexDocument(tx, row.get('id'));
        return rows.records.length;
      });
      if (!count) return;
    }
  }

  async backfillCatalogueMetadata() {
    // Existing collections are upgraded in bounded batches without transferring
    // full search indexes or changing source texts, revisions or import dates.
    for (;;) {
      const rows = await this.session('executeRead', async tx => (await tx.run(`MATCH (d:LegalDocument {namespace:$ns,imported:true})
        WHERE d.catalogue_metadata IS NULL RETURN d.id AS id,d.metadata AS metadata LIMIT 20`)).records.map(row => ({ id: row.get('id'), original: row.get('metadata') })));
      if (!rows.length) return;
      const items = rows.map(row => ({ ...row, catalogue: catalogueMetadata(row.original) }));
      await this.session('executeWrite', tx => tx.run(`UNWIND $items AS item MATCH (d:LegalDocument {namespace:$ns,id:item.id})
        WHERE d.metadata=item.original SET d.catalogue_metadata=item.catalogue`, { items }));
    }
  }

  summary(properties) {
    const { source_text, ...metadata } = parse(properties.catalogue_metadata || properties.metadata) || {};
    return { ...metadata, canonical_id: properties.id, title: properties.title, text_kind: properties.text_kind, imported_at: properties.imported_at, updated_at: properties.updated_at };
  }

  async indexDocument(tx, id) {
    const result = await tx.run(`MATCH (d:LegalDocument {namespace:$ns,id:$id})
      OPTIONAL MATCH (d)-[:HAS_UNIT]->(u:LegalUnit {active:true})
      WITH d, collect(u.payload) AS units
      OPTIONAL MATCH (d)-[:HAS_ANNOTATION]->(a:Annotation)
      RETURN d, units, a`, { id });
    const row = result.records[0];
    const doc = row.get('d').properties;
    const annotation = row.get('a')?.properties || {};
    const metadata = parse(doc.metadata);
    const guide = require('../../config/law-collection.json')[id];
    const sourceContent = [id, doc.title, metadata.short_title, metadata.category, guide?.short_title, guide?.category, guide?.summary, metadata.law_number, metadata.law_year, metadata.ministry, metadata.source_text,
      ...row.get('units').map(item => parse(item).text)].join('\n');
    const annotatedContent = [sourceContent, annotation.summary, annotation.notes, ...(annotation.tags || [])].join('\n');
    await tx.run(`MATCH (d:LegalDocument {namespace:$ns,id:$id})
      SET d.search_text=$content,d.source_search_text=$sourceContent,d.catalogue_metadata=$catalogue,d.chronology_key=$chronology`,
    { id, content: fold(annotatedContent), sourceContent: fold(sourceContent), catalogue: catalogueMetadata(doc.metadata),
      chronology: String(metadata.chronology_key || metadata.published_at || metadata.law_year || metadata.document_year || '9999').slice(0,10) });
  }

  async saveGraphs(graphs, textKind = 'parliament_metadata') {
    return this.write(async tx => {
      let created = 0;
      let updated = 0;
      for (const graph of graphs) {
        const sourceKind = graph.text_kind || textKind;
        if (!['parliament_metadata','source_text','archival_scan'].includes(sourceKind)) throw fail('Unknown source text kind.', 400);
        const doc = graph.document;
        if (!doc?.canonical_id || !doc.title) throw fail('Document ID and title are required.', 400);
        const id = doc.canonical_id;
        // Lock the document before reading its current text/annotations.
        const found = await tx.run(`MERGE (d:LegalEntity {namespace:$ns,id:$id}) SET d:LegalDocument
          SET d.write_lock=coalesce(d.write_lock,0)+1 RETURN d`, { id });
        const existing = found.records[0].get('d').properties;
        const wasImported = existing.imported === true;
        const keepSource = wasImported && ['source_text','archival_scan'].includes(existing.text_kind) && sourceKind === 'parliament_metadata';
        const oldMetadata = parse(existing.metadata) || {};
        const metadata = keepSource ? { ...oldMetadata, ...doc, source_url: oldMetadata.source_url, source_text: oldMetadata.source_text, text_provenance: oldMetadata.text_provenance } : doc;
        const now = new Date().toISOString();
        await tx.run(`MATCH (d:LegalEntity {namespace:$ns,id:$id}) SET d.imported=true, d.placeholder=false,
          d.title=$title, d.text_kind=$kind, d.metadata=$metadata, d.updated_at=$now, d.imported_at=coalesce(d.imported_at,$now)`,
        { id, title: doc.title, kind: keepSource ? existing.text_kind : sourceKind, metadata: JSON.stringify(metadata), now });
        if (!keepSource) {
          // Retain referenced unit identities and source versions when a text is refreshed.
          await tx.run('MATCH (d:LegalEntity {namespace:$ns,id:$id})-[:HAS_UNIT]->(u:LegalUnit) SET u.active=false', { id });
          await tx.run('MATCH (d:LegalEntity {namespace:$ns,id:$id})-[:HAS_REFERENCE]->(r:LegalReference) DETACH DELETE r', { id });
          await tx.run(`MATCH (s:LegalEntity {namespace:$ns}) WHERE s.id=$id OR EXISTS {
            MATCH (:LegalEntity {namespace:$ns,id:$id})-[:HAS_UNIT]->(s) }
            MATCH (s)-[r]->() WHERE r.owner_id=$id AND type(r) IN ['CITES','AMENDS','REPEALS','REPLACES','APPLIES'] DELETE r`, { id });
          const units = (graph.units || []).map(unit => ({ id: unit.id, position: unit.position || 0, parent: unit.parent_id || null, payload: JSON.stringify(unit) }));
          if (units.length) {
            await tx.run(`MATCH (d:LegalEntity {namespace:$ns,id:$id}) UNWIND $units AS item
              MERGE (u:LegalEntity {namespace:$ns,id:item.id}) SET u:LegalUnit,
              u.active=true,u.placeholder=false,u.position=item.position,u.payload=item.payload
              MERGE (d)-[:HAS_UNIT]->(u)`, { id, units });
            await tx.run(`UNWIND $units AS item WITH item WHERE item.parent IS NOT NULL
              MATCH (u:LegalEntity {namespace:$ns,id:item.id}) MATCH (p:LegalEntity {namespace:$ns,id:item.parent})
              MERGE (p)-[:CONTAINS]->(u)`, { units });
          }
          for (let index = 0; index < (graph.references || []).length; index++) {
            const ref = graph.references[index];
            const targetId = ref.document_canonical_id;
            const targetUnitId = ref.target_canonical_id || targetId;
            const refId = 'reference:' + hash(id + ':' + index);
            await tx.run(`MATCH (d:LegalEntity {namespace:$ns,id:$id})
              MERGE (t:LegalEntity {namespace:$ns,id:$targetId}) ON CREATE SET t.placeholder=true
              SET t:LegalDocument
              CREATE (r:LegalEntity:LegalReference {namespace:$ns,id:$refId,payload:$payload,review_status:'unreviewed',confidence:$confidence})
              MERGE (d)-[:HAS_REFERENCE]->(r) MERGE (r)-[:TARGETS]->(t)`,
            { id, targetId, refId, payload: JSON.stringify(ref), confidence: ref.confidence || 0 });
            let to = targetId;
            if (targetUnitId !== targetId) {
              await tx.run(`MATCH (t:LegalEntity {namespace:$ns,id:$targetId})
                MERGE (u:LegalEntity {namespace:$ns,id:$targetUnitId}) ON CREATE SET u.placeholder=true
                SET u:LegalUnit MERGE (t)-[:HAS_UNIT]->(u)`, { targetId, targetUnitId });
              to = targetUnitId;
            }
            const from = ref.from_unit_id || id;
            await tx.run(`MATCH (r:LegalEntity {namespace:$ns,id:$refId}), (s:LegalEntity {namespace:$ns,id:$from}), (t:LegalEntity {namespace:$ns,id:$to})
              MERGE (r)-[:FROM_UNIT]->(s)
              MERGE (s)-[c:CITES {reference_id:$refId}]->(t)
              SET c.owner_id=$id,c.namespace=$ns,c.review_status='unreviewed',c.confidence=$confidence`,
            { id, refId, from, to, confidence: ref.confidence || 0 });
            const relation = { amends: 'AMENDS', repeals: 'REPEALS', replaces: 'REPLACES', applies: 'APPLIES' }[ref.relation_type];
            if (relation) await tx.run(`MATCH (s:LegalEntity {namespace:$ns,id:$from}), (t:LegalEntity {namespace:$ns,id:$to})
              MERGE (s)-[r:${relation} {reference_id:$refId}]->(t)
              SET r.owner_id=$id,r.namespace=$ns,r.review_status='unreviewed',r.confidence=$confidence`,
            { id, from, to, refId, confidence: ref.confidence || 0 });
          }
          const snapshot = JSON.stringify({ document: metadata, units: graph.units || [], references: graph.references || [], text_kind: sourceKind });
          await tx.run(`MATCH (d:LegalEntity {namespace:$ns,id:$id})
            MERGE (v:LegalEntity {namespace:$ns,id:$versionId}) ON CREATE SET v:TextVersion,v.payload=$payload,v.created_at=$now
            MERGE (d)-[:HAS_TEXT_VERSION]->(v)`, { id, versionId: 'text-version:' + hash(id + snapshot), payload: snapshot, now });
        }
        for (const attachment of graph.attachments || []) {
          const sourceId = hash(id + '\0' + attachment.url);
          await tx.run(`MATCH (d:LegalEntity {namespace:$ns,id:$id})
            MERGE (s:LegalEntity {namespace:$ns,id:$sourceId}) SET s:Source,s.url=$url,s.payload=$payload
            MERGE (d)-[:HAS_SOURCE]->(s)`, { id, sourceId, url: attachment.url, payload: JSON.stringify(attachment) });
        }
        await this.indexDocument(tx, id);
        if (wasImported) updated++; else created++;
      }
      return { created, updated, total: graphs.length };
    });
  }

  async list({ q = '', page = 1, category = '', sort = 'recent', type = '', sourceOnly = false } = {}) {
    if (!['', 'law'].includes(type)) throw fail('Unknown document type.', 400);
    const tokens = fold(q).match(/[\p{L}\p{N}]+/gu)?.slice(0, 20) || [];
    const match = tokens.map(token => token + '*').join(' AND ');
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * 30;
    const index = sourceOnly ? 'law_source_search' : 'law_search';
    let start = match ? 'CALL db.index.fulltext.queryNodes($index,$match) YIELD node AS d, score WHERE d.namespace=$ns AND d.imported=true' : 'MATCH (d:LegalDocument {namespace:$ns,imported:true})';
    const categoryIds = Object.entries(require('../../config/law-collection.json')).filter(([, guide]) => guide.category === category).map(([id]) => id);
    if (category) start += (match ? ' AND' : ' WHERE') + ' d.id IN $categoryIds';
    if (type === 'law') start += (match || category ? ' AND' : ' WHERE') + " d.id STARTS WITH 'law:'";
    return this.read(async tx => {
      const total = (await tx.run(start + ' RETURN count(d) AS n', { index, match, categoryIds })).records[0].get('n');
      const ordering = sort === 'oldest' ? 'd.chronology_key ASC,d.id' : (match ? 'score DESC,' : '') + 'd.updated_at DESC,d.id';
      const result = await tx.run(start + ' RETURN d { .id,.title,.text_kind,.imported_at,.updated_at,metadata:d.catalogue_metadata } AS document ORDER BY ' + ordering + ' SKIP $offset LIMIT 30', { index, match, categoryIds, offset: neo4j.int(offset) });
      return { items: result.records.map(r => this.summary(r.get('document'))), total, page: offset / 30 + 1, pageSize: 30 };
    });
  }

  async get(id, { sourceOnly = false } = {}) {
    return this.read(async tx => {
      const found = await tx.run('MATCH (d:LegalDocument {namespace:$ns,id:$id,imported:true}) RETURN d', { id });
      if (!found.records.length) return null;
      const doc = found.records[0].get('d').properties;
      const unitRows = await tx.run('MATCH (:LegalEntity {namespace:$ns,id:$id})-[:HAS_UNIT]->(u:LegalUnit {active:true}) RETURN u ORDER BY u.position', { id });
      // Use the indexed base label for the article lookup performed per reference.
      const refs = await tx.run(`MATCH (:LegalEntity {namespace:$ns,id:$id})-[:HAS_REFERENCE]->(r:LegalReference)-[:TARGETS]->(t)
        OPTIONAL MATCH (r)-[:FROM_UNIT]->(s)-[c:CITES]->(u) WHERE c.reference_id=r.id
        OPTIONAL MATCH (a:LegalEntity:LegalUnit {namespace:$ns,active:true}) WHERE a.id=split(u.id,':paragraph:')[0]
        RETURN r.payload AS payload, coalesce(t.imported,false) AS resolved,
          CASE WHEN u.id=t.id THEN coalesce(t.imported,false) ELSE coalesce(u.active,false) END AS target_resolved,
          coalesce(a.active,false) AS article_resolved ORDER BY r.id`, { id });
      const incoming = await tx.run(`MATCH (d:LegalDocument {namespace:$ns,imported:true})-[:HAS_REFERENCE]->(:LegalReference)-[:TARGETS]->(:LegalEntity {namespace:$ns,id:$id})
        RETURN DISTINCT d.id AS id,d.title AS title ORDER BY d.id`, { id });
      const sources = await tx.run('MATCH (:LegalEntity {namespace:$ns,id:$id})-[:HAS_SOURCE]->(s:Source) RETURN s ORDER BY s.id', { id });
      const annotations = sourceOnly ? null : await tx.run('MATCH (:LegalEntity {namespace:$ns,id:$id})-[:HAS_ANNOTATION]->(a:Annotation) RETURN a', { id });
      const revisions = sourceOnly ? null : await tx.run('MATCH (:LegalEntity {namespace:$ns,id:$id})-[:HAS_REVISION]->(r:Revision) RETURN r ORDER BY r.revision DESC', { id });
      const units = unitRows.records.map(r => parse(r.get('u').properties.payload));
      const references = refs.records.map(r => ({ ...parse(r.get('payload')), resolved: r.get('resolved'), target_resolved: r.get('target_resolved'), article_resolved: r.get('article_resolved') }));
      const document = this.summary(doc);
      return { document, sourceText: parse(doc.metadata).source_text || null, units,
        references: await supplementIndexedCitations(tx, units, references, document),
        incoming: incoming.records.map(r => r.toObject()),
        attachments: sources.records.map(r => { const p = r.get('s').properties; return { ...parse(p.payload), id: p.id, local_file: sourceOnly ? Boolean(p.local_file) : p.local_file || null }; }),
        annotation: annotations?.records.length ? this.annotationValue(annotations.records[0].get('a').properties) : { summary: '', notes: '', tags: [], revision: 0 },
        revisions: (revisions?.records || []).map(r => { const p = r.get('r').properties; return { ...parse(p.payload), revision: p.revision, created_at: p.created_at }; }) };
    });
  }

  annotationValue(p) { return { summary: p.summary, notes: p.notes, tags: p.tags || [], revision: p.revision }; }
  async saveAnnotation(id, input) {
    if (typeof input.summary !== 'string' || typeof input.notes !== 'string' || !Array.isArray(input.tags) || input.tags.some(tag => typeof tag !== 'string')) throw fail('Summary, notes, and tags are required.', 400);
    return this.write(async tx => {
      const result = await tx.run(`MATCH (d:LegalDocument {namespace:$ns,id:$id,imported:true})
        SET d.write_lock=coalesce(d.write_lock,0)+1
        WITH d
        OPTIONAL MATCH (d)-[:HAS_ANNOTATION]->(a:Annotation) RETURN d,a`, { id });
      if (!result.records.length) throw fail('Law not found.', 404);
      const current = result.records[0].get('a')?.properties.revision || 0;
      if (input.revision !== current) throw fail('These notes changed in another window. Reload before saving.', 409);
      const tags = [...new Set(input.tags.map(t => t.trim()).filter(Boolean))].slice(0, 30);
      const value = { summary: input.summary, notes: input.notes, tags, revision: current + 1 };
      await tx.run(`MATCH (d:LegalEntity {namespace:$ns,id:$id})
        MERGE (a:LegalEntity {namespace:$ns,id:$annotationId}) SET a:Annotation,
        a.summary=$summary,a.notes=$notes,a.tags=$tags,a.revision=$revision
        MERGE (d)-[:HAS_ANNOTATION]->(a)
        CREATE (r:LegalEntity:Revision {namespace:$ns,id:$revisionId,revision:$revision,payload:$payload,created_at:$now})
        MERGE (d)-[:HAS_REVISION]->(r)`, { id, annotationId: 'annotation:' + id, revisionId: 'revision:' + id + ':' + value.revision,
        ...value, revision: neo4j.int(value.revision), payload: JSON.stringify(value), now: new Date().toISOString() });
      await this.indexDocument(tx, id);
      return value;
    });
  }

  async stats() {
    return this.read(async tx => {
      const documents = (await tx.run(`MATCH (d:LegalDocument {namespace:$ns,imported:true})
        RETURN count(d) AS documents,
          count(CASE WHEN d.id STARTS WITH 'law:' THEN 1 END) AS laws,
          count(CASE WHEN d.text_kind='source_text' THEN 1 END) AS textDocuments,
          count(CASE WHEN d.text_kind='parliament_metadata' THEN 1 END) AS metadataDocuments,
          count(CASE WHEN d.text_kind='archival_scan' THEN 1 END) AS archivalDocuments,
          max(d.updated_at) AS lastUpdated`)).records[0].toObject();
      // Unit identities end in :article:<label> or :paragraph:<label>.
      // Active units exclude unresolved placeholders and superseded text versions.
      const units = (await tx.run(`MATCH (u:LegalUnit {namespace:$ns,active:true})
        WITH u, split(u.id,':')[-2] AS kind
        RETURN count(u) AS units,
          count(CASE WHEN kind='article' THEN 1 END) AS articles,
          count(CASE WHEN kind='paragraph' THEN 1 END) AS paragraphs`)).records[0].toObject();
      const references = (await tx.run('MATCH (r:LegalReference {namespace:$ns}) RETURN count(r) AS references')).records[0].toObject();
      const sources = (await tx.run(`MATCH (s:Source {namespace:$ns})
        RETURN count(s) AS attachments,
          count(CASE WHEN s.local_file IS NOT NULL AND s.local_file<>'' THEN 1 END) AS downloadedPdfs`)).records[0].toObject();
      return { ...documents, ...units, ...references, ...sources };
    });
  }
  async knownDocuments() { return this.read(async tx => (await tx.run('MATCH (d:LegalDocument {namespace:$ns,imported:true}) RETURN coalesce(d.catalogue_metadata,d.metadata) AS metadata')).records.map(r => parse(r.get('metadata')))); }
  async gazetteIndex() {
    const { buildGazetteIndex } = require('./gazetteIndex');
    const records = await this.read(async tx => (await tx.run(`MATCH (d:LegalDocument {namespace:$ns,imported:true})
      OPTIONAL MATCH (d)-[:HAS_UNIT]->(u:LegalUnit {active:true})
      WITH d, count(u) AS units
      OPTIONAL MATCH (d)-[:HAS_SOURCE]->(s:Source)
      RETURN d { .id,.title,.text_kind,.imported_at,.updated_at,metadata:d.catalogue_metadata } AS document, units, collect(s) AS sources`)).records.map(row => ({
      document: this.summary(row.get('document')), units: row.get('units'),
      sources: row.get('sources').map(source => {
        const p = source.properties;
        const name = p.local_file;
        return { ...parse(p.payload), available: Boolean(name && path.basename(name) === name && fs.existsSync(path.join(this.dataDirectory, 'files', name))) };
      }),
    })));
    return buildGazetteIndex(records);
  }
  async attachment(id) { return this.read(async tx => (await tx.run('MATCH (s:Source {namespace:$ns,id:$id}) RETURN s', { id })).records[0]?.get('s').properties || null); }
  async markDownloaded(id, name) { return this.write(tx => tx.run('MATCH (s:Source {namespace:$ns,id:$id}) SET s.local_file=$name', { id, name })); }
  async jobs() {
    return this.read(async tx => (await tx.run('MATCH (j:ImportJob {namespace:$ns}) RETURN j ORDER BY j.started_at DESC LIMIT 30')).records.map(r => {
      const p = r.get('j').properties; return { ...p, query: parse(p.query), result: parse(p.result) };
    }));
  }
  async startJob(id, query) { return this.write(tx => tx.run("CREATE (j:LegalEntity:ImportJob {namespace:$ns,id:$id,status:'running',query:$query,started_at:$now})", { id, query: JSON.stringify(query), now: new Date().toISOString() })); }
  async finishJob(id, result, error) { return this.write(tx => tx.run('MATCH (j:ImportJob {namespace:$ns,id:$id}) SET j.status=$status,j.result=$result,j.error=$error,j.finished_at=$now', { id, status: error ? 'failed' : 'completed', result: result ? JSON.stringify(result) : null, error: error || null, now: new Date().toISOString() })); }

  async connections(id, depth = 2) {
    const hops = Math.min(4, Math.max(1, parseInt(depth, 10) || 2));
    return this.read(async tx => {
      const result = await tx.run(`MATCH p=(d:LegalDocument {namespace:$ns,id:$id,imported:true})-[:HAS_UNIT|CITES|HAS_REFERENCE|TARGETS*1..${hops}]->(t:LegalDocument {imported:true})
        WHERE t.namespace=$ns AND t.id<>$id RETURN t.id AS id,t.title AS title,min(length(p)) AS distance ORDER BY distance,id LIMIT 100`, { id });
      return result.records.map(r => r.toObject());
    });
  }

  async backup(destination) {
    const dump = await this.write(async tx => {
      const nodes = [];
      let after = '';
      for (;;) {
        const batch = (await tx.run(`MATCH (n:LegalEntity {namespace:$ns}) WHERE n.id>$after
          RETURN labels(n) AS labels,properties(n) AS properties ORDER BY n.id LIMIT 20`, { after })).records.map(r => r.toObject());
        if (!batch.length) break;
        nodes.push(...batch);
        after = batch.at(-1).properties.id;
      }
      const edges = (await tx.run('MATCH (a:LegalEntity {namespace:$ns})-[r]->(b:LegalEntity {namespace:$ns}) RETURN a.id AS from,b.id AS to,type(r) AS type,properties(r) AS properties')).records.map(r => r.toObject());
      return { format: 'appofasistis-graph', version: 1, created_at: new Date().toISOString(), nodes, relationships: edges };
    }, { fetchSize: 1 });
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(dump));
    return destination;
  }

  async restore(filename) {
    const dump = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (dump.format !== 'appofasistis-graph' || dump.version !== 1 || !Array.isArray(dump.nodes) || !Array.isArray(dump.relationships)) throw new Error('Unsupported graph backup.');
    for (const node of dump.nodes) if (!node.properties?.id || !Array.isArray(node.labels) || node.labels.some(label => !labels.has(label))) throw new Error('Invalid backup node.');
    const ids = new Set(dump.nodes.map(node => node.properties.id));
    if (ids.size !== dump.nodes.length) throw new Error('Duplicate identities in graph backup.');
    for (const edge of dump.relationships) if (!relationships.has(edge.type) || !ids.has(edge.from) || !ids.has(edge.to)) throw new Error('Invalid backup relationship.');
    return this.write(async tx => {
      const count = (await tx.run('MATCH (n:LegalEntity {namespace:$ns}) RETURN count(n) AS n')).records[0].get('n');
      if (count) throw new Error('Restore requires an empty law collection.');
      for (const node of dump.nodes) {
        const properties = { ...node.properties, namespace: this.namespace };
        if (node.labels.includes('LegalDocument') && properties.imported) properties.catalogue_metadata = catalogueMetadata(properties.metadata);
        await tx.run('CREATE (n:' + [...new Set(['LegalEntity', ...node.labels])].join(':') + ') SET n=$properties', { properties });
      }
      for (const edge of dump.relationships) await tx.run('MATCH (a:LegalEntity {namespace:$ns,id:$from}),(b:LegalEntity {namespace:$ns,id:$to}) CREATE (a)-[r:' + edge.type + ']->(b) SET r=$properties', { from: edge.from, to: edge.to, properties: { ...edge.properties, ...(edge.properties.namespace ? { namespace: this.namespace } : {}) } });
      for (const node of dump.nodes) {
        if (node.labels.includes('LegalDocument') && node.properties.imported) await this.indexDocument(tx, node.properties.id);
      }
      return { nodes: dump.nodes.length, relationships: dump.relationships.length };
    });
  }
  async close() { await this.driver.close(); }
}

module.exports = { LawStore, fold };
