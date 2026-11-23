'use strict';
function buildHistoricalGraph(entry) {
  if (!entry.id || !entry.id.startsWith(entry.type + ':') || !entry.id.endsWith(':' + entry.year)) throw Error('Historical identity mismatch');
  if (!['scan_only','excerpt','complete_greek_transcription'].includes(entry.coverage)) throw Error('Unknown historical text coverage');
  if (entry.coverage === 'scan_only' && (entry.sections.length || entry.text_kind !== 'archival_scan')) throw Error('An archival scan cannot claim indexed legal text');
  if (entry.coverage !== 'scan_only' && !entry.sections.length) throw Error('A transcription needs source sections');
  const ids = new Set(), navigationNumbers = new Set();
  const units = entry.sections.map((section,index) => {
    if (!section.text.trim() || !Number.isInteger(section.source_page) || section.source_page < 1 || section.source_page > entry.page_count) throw Error('Invalid historical source section');
    const body = section.number === 'body' || section.unit_type === 'body';
    if (body && section.number !== 'body' && (!/^[a-z][a-z0-9_]*$/.test(section.number) || section.navigation_number !== section.number)) throw Error('Named historical body requires a stable navigation alias');
    const unitType = body ? 'body' : section.unit_type || 'article';
    if (!['body','article','paragraph'].includes(unitType)) throw Error('Unknown historical provision type');
    const id = entry.id + (body ? ':body' + (section.number === 'body' ? '' : ':' + section.number) : ':' + unitType + ':' + section.number);
    if (ids.has(id)) throw Error('Duplicate historical provision identity');
    ids.add(id);
    const navigationNumber = body ? section.navigation_number ?? null : section.number;
    if (navigationNumber !== null) {
      if (typeof navigationNumber !== 'string' || !navigationNumber.trim() || navigationNumbers.has(navigationNumber)) throw Error('Invalid or duplicate historical navigation number');
      navigationNumbers.add(navigationNumber);
    }
    return { id, document_id: entry.id, parent_id: null, unit_type: unitType,
      label: section.label, original_label: section.original_label || section.label,
      navigation_number: navigationNumber,
      article_number: unitType === 'article' ? section.number : null, paragraph_number: unitType === 'paragraph' ? section.number : null,
      title: section.title, text: section.text, position: index + 1, source_page: section.source_page, source_pages: section.source_pages || [section.source_page],
      transcription_coverage: entry.coverage, transcription_review: 'compared_with_original_scan' };
  });
  if (entry.id === 'royal_decree:2:1833' && units.map(u=>u.article_number).join(',') !== '1,2,3,4,5,6,7') throw Error('The original decree has exactly seven articles');
  if (entry.expected_indexed_numbers && units.map(u=>u.navigation_number).join(',') !== entry.expected_indexed_numbers.join(',')) throw Error('Reviewed historical provision sequence mismatch');
  const references = [];
  if (entry.id === 'ministerial_circular:interior:62:1833') {
    const raw = 'υπ’ Αρ. 2 υψηλού Βασιλικού διατάγματος';
    if (!units[0].text.includes(raw)) throw Error('Circular citation is not present in its source text');
    references.push({ raw_text: raw, document_type: 'royal_decree', document_number: '2', document_year: '1833',
      document_canonical_id: 'royal_decree:2:1833', target_canonical_id: 'royal_decree:2:1833', article: null, paragraph: null,
      relation_type: 'mentions', confidence: 1, from_document_id: entry.id, from_unit_id: units[0].id,
      source_page: 4, evidence_source_url: entry.source_url, evidence_basis: 'original_scan_explicit_numbered_reference' });
  }
  if (entry.id === 'royal_decree:2:1833') {
    if (!units[1].text.includes('ως το άρθρον 1')) throw Error('Internal article citation is not present');
    references.push({ raw_text: 'ως το άρθρον 1', document_type: 'royal_decree', document_number: '2', document_year: '1833',
      document_canonical_id: entry.id, target_canonical_id: entry.id + ':article:1', article: '1', paragraph: null,
      relation_type: 'mentions', confidence: 1, from_document_id: entry.id, from_unit_id: units[1].id,
      source_page: 3, evidence_source_url: entry.source_url, evidence_basis: 'original_scan_internal_article_reference' });
  }
  for (const ref of entry.verified_references || []) {
    const source = units.find(unit => unit.navigation_number === ref.from_number || (ref.from_number === 'body' && unit.unit_type === 'body'));
    if (!source || !ref.raw_text || !source.text.includes(ref.raw_text) || !ref.document_canonical_id || !ref.target_canonical_id) throw Error('Historical citation lacks source evidence');
    const sourcePage = ref.source_page ?? source.source_page;
    if (!source.source_pages.includes(sourcePage)) throw Error('Historical citation page is outside the source section');
    references.push({ raw_text: ref.raw_text, document_type: ref.document_type,
      document_number: ref.document_number || null, document_year: String(ref.document_year || entry.year),
      document_canonical_id: ref.document_canonical_id, target_canonical_id: ref.target_canonical_id,
      article: ref.article || null, paragraph: ref.paragraph || null, relation_type: 'mentions', confidence: 1,
      from_document_id: entry.id, from_unit_id: source.id, source_page: sourcePage,
      evidence_source_url: entry.source_url, evidence_basis: 'original_scan_explicit_reference' });
  }
  const sourceText = entry.coverage === 'scan_only' ? null : [entry.preamble || '', ...units.map(u=>(u.unit_type!=='body' ? u.original_label+'\n' : '')+u.text), entry.signature || ''].filter(Boolean).join('\n\n');
  return { document: { canonical_id: entry.id, type: entry.type, document_type: entry.type, document_year: String(entry.year),
    title: entry.title, title_official: entry.original_heading || entry.title, title_is_editorial: Boolean(entry.original_heading),
    citation_label: entry.citation_label, historical: true, category: entry.category,
    chronology_key: entry.chronology_key, date_basis: entry.date_basis, publication_label: entry.date_label,
    source: entry.source_url.includes('api.et.gr') ? 'national_printing_office' : 'hellenic_parliament_library',
    source_url: entry.source_url, source_text: sourceText,
    source_hash: entry.sha256, source_page_count: entry.page_count, text_coverage: entry.coverage,
    text_provenance: entry.coverage === 'scan_only' ? 'official_archival_scan' : 'reviewed_scan_transcription_monotonic',
    transcription_note: entry.transcription_note, primary_unit_type: entry.primary_unit_type || 'article',
    original_provision_count: entry.original_provision_count || null, date_precision: entry.date_precision || null,
    source_edition_note: entry.source_edition_note || null, source_edition_year: entry.source_edition_year || null,
    published_at_julian: entry.published_at_julian || null, published_at_gregorian: entry.published_at_gregorian || null,
    issued_at_julian: entry.issued_at_julian || null, issued_at_gregorian: entry.issued_at_gregorian || null,
    fek_issue: entry.fek_issue || null, fek_number: entry.fek_number || null, fek_year: entry.fek_year || null,
    fek_raw: entry.fek_raw || null, consolidation_status: 'historical_document_not_current_legislation' },
    units, references, attachments: [{url:entry.source_url,file_type:'Πρωτότυπη ιστορική σάρωση · PDF',title:entry.title,source_field:'historical_archive',position:1}] };
}
module.exports = { buildHistoricalGraph };
