'use strict';

// A catalogue is an explicit inventory, never an inferred maximum issue number.
const catalogue = require('../../config/gazette-catalogue.json');
const guides = require('../../config/law-collection.json');
const normalizeSeries = value => String(value || '').normalize('NFD').replace(/[\p{M}΄’'\s]/gu, '').toUpperCase().replace(/^A$/, 'Α').replace(/^B$/, 'Β');

function gazetteIdentity(document) {
  const id = /^fek:([^:]+):(\d+):(\d{4})$/.exec(document.canonical_id || '');
  const series = normalizeSeries(document.fek_issue || id?.[1]);
  const issue = Number(document.fek_number || id?.[2]);
  const year = Number(document.fek_year || id?.[3]);
  if (!series || !Number.isInteger(issue) || issue < 1 || !Number.isInteger(year) || year < 1833 || year > 9999) return null;
  return { id: `fek:${series}:${issue}:${year}`, series, issue, year };
}

function buildGazetteIndex(records, inventories = catalogue.inventories) {
  const issues = new Map();
  const getIssue = identity => {
    if (!issues.has(identity.id)) issues.set(identity.id, { ...identity, inCatalogue: false, saved: false, documents: [] });
    return issues.get(identity.id);
  };
  for (const inventory of inventories) for (const issue of inventory.issues) {
    const row = getIssue({ id: `fek:${inventory.series}:${issue}:${inventory.year}`, year: inventory.year, series: inventory.series, issue });
    row.inCatalogue = true;
    row.sourceUrl = `https://api.et.gr/apiFEK/${inventory.seriesCode}/${inventory.year}/${issue}/pdf`;
  }
  for (const record of records) {
    const doc = record.document;
    const identity = gazetteIdentity(doc);
    if (!identity) continue;
    const row = getIssue(identity);
    const sources = record.sources || [];
    const gazetteSources = sources.filter(source => source.source_field === 'official_gazette' || (source.url === doc.source_url && (doc.source === 'national_printing_office' || doc.type === 'fek')));
    row.saved ||= gazetteSources.some(source => source.available);
    row.sourceUrl ||= gazetteSources[0]?.url || null;
    const standalone = doc.type === 'fek' || doc.canonical_id === identity.id;
    if (standalone) row.documentId = doc.canonical_id;
    else row.documents.push({ id: doc.canonical_id, title: guides[doc.canonical_id]?.short_title || doc.title,
      category: guides[doc.canonical_id]?.category || doc.category || 'Χωρίς κατηγορία',
      hasText: doc.text_kind === 'source_text' && record.units > 0,
      excerpt: doc.text_coverage === 'excerpt', units: record.units });
  }
  const rows = [...issues.values()].sort((a, b) => a.year - b.year || a.series.localeCompare(b.series, 'el') || a.issue - b.issue);
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.year}:${row.series}`;
    if (!groups.has(key)) {
      const inventory = inventories.find(item => item.year === row.year && item.series === row.series);
      groups.set(key, { year: row.year, series: row.series, total: inventory?.issues.length ?? null,
        sourceUrl: inventory?.sourceUrl || null, verifiedAt: inventory?.verifiedAt || null, openYear: Boolean(inventory?.openYear),
        saved: 0, registered: 0, withText: 0, missing: [], unexpected: [] });
    }
    const group = groups.get(key);
    group.saved += Number(row.saved);
    group.registered += Number(Boolean(row.documentId || row.documents.length));
    group.withText += Number(row.documents.some(doc => doc.hasText));
    if (row.inCatalogue && !row.saved) group.missing.push(row.issue);
    if (group.total !== null && !row.inCatalogue && row.saved) group.unexpected.push(row.issue);
  }
  const years = [...groups.values()].map(group => ({ ...group,
    complete: group.total !== null && !group.openYear && !group.missing.length && !group.unexpected.length,
    percent: group.total !== null ? (group.total - group.missing.length) / group.total * 100 : null }));
  return { issues: rows, years, summary: { saved: rows.filter(row => row.saved).length,
    registered: rows.filter(row => row.documentId || row.documents.length).length,
    catalogued: rows.filter(row => row.inCatalogue).length,
    withText: rows.filter(row => row.documents.some(doc => doc.hasText)).length,
    complete: years.filter(year => year.complete).length }, categories: [...new Set(rows.flatMap(row => row.documents.map(doc => doc.category)))].sort((a, b) => a.localeCompare(b, 'el')) };
}

module.exports = { buildGazetteIndex, gazetteIdentity };
