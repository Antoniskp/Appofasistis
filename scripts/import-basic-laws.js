'use strict';

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { LawStore } = require('../src/localLaw/store');
const { graphSettings } = require('../src/localLaw/runtime');
const { parseGreekLegalCitations, resolveGreekLegalReferences } = require('../src/legal/citations');

const { splitNumberedParagraphs } = require('../src/legal/paragraphs');
const { parseCodeReferences } = require('../src/legal/codeReferences');

const TOPICS = [
  { article: '299', title: 'Ανθρωποκτονία με δόλο', description: 'Προστασία της ανθρώπινης ζωής · «μη σκοτώνεις».' },
  { article: '302', title: 'Ανθρωποκτονία από αμέλεια', description: 'Πρόκληση θανάτου από αμέλεια.' },
  { article: '308', title: 'Σωματική βλάβη', description: 'Προστασία της σωματικής ακεραιότητας.' },
  { article: '330', title: 'Παράνομη βία', description: 'Εξαναγκασμός με βία ή απειλή.' },
  { article: '333', title: 'Απειλή', description: 'Προστασία από την πρόκληση φόβου και ανησυχίας.' },
  { article: '336', title: 'Βιασμός', description: 'Προστασία της γενετήσιας ελευθερίας.' },
  { article: '372', title: 'Κλοπή', description: 'Ξένα κινητά πράγματα · «μην κλέβεις».' },
  { article: '378', title: 'Φθορά ξένης ιδιοκτησίας', description: 'Καταστροφή ή βλάβη ξένων πραγμάτων.' },
  { article: '380', title: 'Ληστεία', description: 'Αφαίρεση πράγματος με βία ή απειλή.' },
  { article: '386', title: 'Απάτη', description: 'Εξαπάτηση που προκαλεί περιουσιακή ζημία.' },
];

function buildFoundationGraph(source, knownDocuments = []) {
  const type = source.document_type || 'law';
  const id = type + ':' + source.number + ':' + source.year;
  const publicationLabel = source.published_at.split('-').reverse().join('.');
  const gazette = source.fek_number ? {
    fek_issue: 'Α', fek_number: source.fek_number, fek_year: source.year,
    fek_canonical_id: 'fek:Α:' + source.fek_number + ':' + source.year,
    fek_raw: source.fek_number + ' Α΄/' + publicationLabel,
  } : {};
  const document = {
    canonical_id: id, type, document_type: type, law_number: source.number, law_year: source.year,
    ...(source.citation_label ? { citation_label: source.citation_label } : {}),
    title: source.number === '4619' ? 'Ποινικός Κώδικας — Κύρωση με τον Ν. 4619/2019' : source.title,
    title_official: source.title, source: source.source || 'national_printing_office', source_url: source.source_url,
    source_text: source.text, published_at: source.published_at, ...gazette,
    text_provenance: source.text_provenance || 'official_gazette_pdf_extraction', source_hash: source.sha256, source_page_count: source.page_count,
    ...(source.text_coverage ? { text_coverage: source.text_coverage, coverage_note: source.coverage_note } : {}),
    publication_label: publicationLabel, consolidation_status: 'original_publication_not_consolidated',
    publication_notes: source.publication_notes || [],
    ...(source.number === '4619' ? { starter_topics: TOPICS } : {}),
  };
  const units = [];
  const references = [];
  for (const section of source.sections) {
    const articleId = id + ':article:' + section.number.toLowerCase();
    const article = { id: articleId, document_id: id, parent_id: null, unit_type: 'article', label: section.label,
      article_number: section.number, paragraph_number: null, title: section.title, text: section.text,
      position: units.length + 1, source_page: section.source_page, ...(section.source_pages ? { source_pages: section.source_pages } : {}) };
    units.push(article);
    const paragraphRanges = [];
    for (const paragraph of splitNumberedParagraphs(section.text, section.ignored_quote_offsets)) {
      const paragraphId = articleId + ':paragraph:' + paragraph.number;
      units.push({ id: paragraphId, document_id: id, parent_id: articleId, unit_type: 'paragraph', label: 'παρ. ' + paragraph.number,
        article_number: section.number, paragraph_number: paragraph.number, title: null, text: paragraph.text,
        position: units.length + 1, source_page: section.source_page,
        start_offset: paragraph.start, end_offset: paragraph.end });
      paragraphRanges.push({ start: paragraph.start, end: paragraph.end, id: paragraphId });
    }
    for (const ref of resolveGreekLegalReferences([...parseGreekLegalCitations(section.text, { modernConstitution: Number(source.year) >= 2020 }), ...parseCodeReferences(section.text, id)], knownDocuments)) {
      const paragraph = paragraphRanges.find(range => ref.start >= range.start && ref.start < range.end);
      references.push({ ...ref, from_document_id: id, from_unit_id: paragraph?.id || articleId, source_page: section.source_page });
    }
  }
  // Two relations checked against the actual Gazette pages, not guessed from a law number nearby.
  const explicit = source.number === '4855' ? { from: '63', target: '299', paragraph: '1', page: 28 } :
    source.number === '5090' ? { from: '58', target: '372', paragraph: '1', page: 21 } : null;
  if (explicit) {
    const section = source.sections.find(section => section.number === explicit.from);
    if (!section || !section.text.includes('άρθρου ' + explicit.target)) throw new Error('The amendment source text could not be verified.');
    references.push({ raw_text: 'παρ. ' + explicit.paragraph + ' άρθρου ' + explicit.target + ' Ποινικού Κώδικα',
      document_type: 'law', document_number: '4619', document_year: '2019', document_canonical_id: 'law:4619:2019',
      target_canonical_id: 'law:4619:2019:article:' + explicit.target + ':paragraph:' + explicit.paragraph,
      article: explicit.target, paragraph: explicit.paragraph, relation_type: 'amends', confidence: 1,
      from_document_id: id, from_unit_id: id + ':article:' + explicit.from, source_page: explicit.page,
      evidence_source_url: source.source_url, evidence_basis: 'official_gazette_amendment_text', resolved: true });
  }
  const ids = units.map(unit => unit.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate legal units in ' + id);
  if (source.number === '4619') for (const topic of TOPICS) {
    const unit = units.find(unit => unit.id === id + ':article:' + topic.article);
    if (!unit || !unit.text.includes(topic.title)) throw new Error('Starter topic missing: ' + topic.article);
  }
  return { document, units, references, attachments: [{ url: source.source_url,
    file_type: document.fek_raw ? 'Πρωτότυπο ΦΕΚ · ' + document.fek_raw : 'Επίσημη Εφημερίδα της Ευρωπαϊκής Ένωσης',
    title: document.fek_raw ? 'Εθνικό Τυπογραφείο — αρχική δημοσίευση' : 'Αρχική δημοσίευση',
    source_field: document.fek_raw ? 'official_gazette' : 'eu_official_journal', position: 1 }] };
}

async function main() {
  const directory = path.resolve(process.argv[2] || path.join(__dirname, '../output/legal-foundations'));
  const settings = graphSettings();
  const status = await fetch('http://127.0.0.1:' + (process.env.INTERNAL_API_PORT || '3001') + '/api/laws/status').then(r => r.json());
  if (status.importing) throw new Error('Wait until the active import completes.');
  const sources = [[4619,2019],[4855,2021],[5090,2024]].map(([n,y]) => JSON.parse(fs.readFileSync(path.join(directory, 'law-' + n + '-' + y + '.json'), 'utf8')));
  // Verify every input PDF before making any database changes.
  for (const source of sources) {
    const bytes = fs.readFileSync(path.join(directory, source.pdf_filename));
    if (!bytes.subarray(0,5).equals(Buffer.from('%PDF-')) || crypto.createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error('Source PDF checksum mismatch.');
  }
  const graphs = sources.map(source => buildFoundationGraph(source, sources.map(item => ({ canonical_id: 'law:' + item.number + ':' + item.year }))));
  const store = new LawStore(settings);
  const jobId = 'foundations-' + crypto.randomUUID();
  try {
    await store.ready;
    await store.startJob(jobId, { source: 'national_printing_office', collection: 'basic_criminal_law', pageNo: 1, pageSize: graphs.length });
    const saved = await store.saveGraphs(graphs, 'source_text');
    const fileDir = path.join(settings.dataDirectory, 'files');
    fs.mkdirSync(fileDir, { recursive: true });
    for (let index = 0; index < graphs.length; index++) {
      const graph = graphs[index];
      const source = sources[index];
      const doc = await store.get(graph.document.canonical_id);
      const attachment = doc.attachments.find(item => item.url === source.source_url);
      const name = crypto.createHash('sha256').update(source.source_url).digest('hex') + '.pdf';
      fs.copyFileSync(path.join(directory, source.pdf_filename), path.join(fileDir, name));
      await store.markDownloaded(attachment.id, name);
      const isCode = source.number === '4619';
      if (doc.annotation.revision === 0) await store.saveAnnotation(graph.document.canonical_id, {
        revision: 0, summary: isCode ? 'Βασική συλλογή ποινικού δικαίου: ανθρωποκτονία (299), αμέλεια (302), σωματική βλάβη (308), παράνομη βία (330), απειλή (333), βιασμός (336), κλοπή (372), φθορά ξένης ιδιοκτησίας (378), ληστεία (380), απάτη (386). Το αποθηκευμένο κείμενο είναι η αρχική δημοσίευση του 2019.' :
          source.number === '4855' ? 'Μεταγενέστερος τροποποιητικός νόμος. Το άρθρο 63 τροποποιεί την παρ. 1 του άρθρου 299 ΠΚ για την ανθρωποκτονία. Αποθηκεύεται το πρωτότυπο ΦΕΚ του 2021.' :
            'Μεταγενέστερος τροποποιητικός νόμος. Το άρθρο 58 τροποποιεί την παρ. 1 του άρθρου 372 ΠΚ για την κλοπή. Αποθηκεύεται το πρωτότυπο ΦΕΚ του 2024.',
        notes: 'Ιστορική δημοσίευση από το Εθνικό Τυπογραφείο. Δεν έχει γίνει πλήρης κωδικοποίηση όλων των μεταγενέστερων τροποποιήσεων έως σήμερα. Για την ισχύουσα διατύπωση απαιτείται έλεγχος όλων των σχετικών ΦΕΚ.\n\n' +
          (isCode ? 'Συνδεδεμένες βασικές μεταβολές: Ν. 4855/2021, άρθρο 63 (άρθρο 299 ΠΚ) και Ν. 5090/2024, άρθρο 58 (άρθρο 372 ΠΚ).' : 'Η σχέση τροποποίησης συνδέθηκε με το συγκεκριμένο άρθρο του Ν. 4619/2019 βάσει του πρωτότυπου ΦΕΚ.'),
        tags: isCode ? ['βασικά', 'Ποινικός Κώδικας', 'ανθρωποκτονία', 'μη σκοτώνεις', 'κλοπή', 'μην κλέβεις', 'σωματική βλάβη', 'απειλή', 'βιασμός', 'ληστεία', 'απάτη', 'dont kill', 'dont steal', 'theft', 'homicide', 'fraud'] : ['Ποινικός Κώδικας','τροποποιήσεις','αρχική δημοσίευση'],
      });
      console.log(graph.document.canonical_id + ': ' + graph.units.filter(unit => !unit.parent_id).length + ' source articles/groups; PDF saved locally.');
    }
    await store.finishJob(jobId, { ...saved, source_url: 'https://search.et.gr/el/ypiresia-api-fek/', page: { total_records: graphs.length } });
    console.log(JSON.stringify({ saved, stats: await store.stats() }));
  } catch (error) {
    try { await store.finishJob(jobId, null, error.message); } catch { /* Preserve the original error. */ }
    throw error;
  } finally { await store.close(); }
}

module.exports = { buildFoundationGraph, TOPICS };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
