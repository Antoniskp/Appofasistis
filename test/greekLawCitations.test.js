'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  canonicalDocumentId,
  parseGreekLegalCitations,
  resolveGreekLegalReferences,
} = require('../src/legal/citations');

test('parseGreekLegalCitations extracts law references with article and paragraph context', () => {
  const text = 'Η παρ. 2 του άρθρου 5 του ν. 2690/1999 αντικαθίσταται ως εξής.';
  const citations = parseGreekLegalCitations(text);

  assert.equal(citations.length, 1);
  assert.equal(citations[0].document_type, 'law');
  assert.equal(citations[0].document_number, '2690');
  assert.equal(citations[0].document_year, '1999');
  assert.equal(citations[0].document_canonical_id, 'law:2690:1999');
  assert.equal(citations[0].target_canonical_id, 'law:2690:1999:article:5:paragraph:2');
  assert.equal(citations[0].article, '5');
  assert.equal(citations[0].paragraph, '2');
  assert.equal(citations[0].relation_type, 'replaces');
});

test('parseGreekLegalCitations extracts presidential decrees and repeal relation', () => {
  const text = 'Καταργείται το άρθρο 12 του π.δ. 18/1989.';
  const citations = parseGreekLegalCitations(text);

  assert.equal(citations.length, 1);
  assert.equal(citations[0].document_type, 'presidential_decree');
  assert.equal(citations[0].document_canonical_id, 'presidential_decree:18:1989');
  assert.equal(citations[0].target_canonical_id, 'presidential_decree:18:1989:article:12');
  assert.equal(citations[0].relation_type, 'repeals');
});

test('parseGreekLegalCitations extracts FEK references in common Greek forms', () => {
  const text = 'Ν.4624/2019 (ΦΕΚ Α 137/29.8.2019) και ΦΕΚ 133 Α΄/3.9.2026.';
  const citations = parseGreekLegalCitations(text);
  const fekCitations = citations.filter((citation) => citation.document_type === 'fek');

  assert.equal(fekCitations.length, 2);
  assert.equal(fekCitations[0].document_canonical_id, 'fek:Α:137:2019');
  assert.equal(fekCitations[0].fek_date, '2019-08-29');
  assert.equal(fekCitations[1].document_canonical_id, 'fek:Α:133:2026');
  assert.equal(fekCitations[1].fek_date, '2026-09-03');
});

test('resolveGreekLegalReferences marks known documents as resolved', () => {
  const citations = parseGreekLegalCitations('Σύμφωνα με τον ν. 4412/2016 εφαρμόζονται οι διατάξεις.');
  const references = resolveGreekLegalReferences(citations, [
    { id: 'doc-4412', type: 'law', law_number: 4412, law_year: 2016 },
  ]);

  assert.equal(references.length, 1);
  assert.equal(references[0].resolved, true);
  assert.equal(references[0].resolved_document_id, 'doc-4412');
});

test('canonicalDocumentId builds stable document IDs', () => {
  assert.equal(canonicalDocumentId('law', { number: '5328', year: '2026' }), 'law:5328:2026');
  assert.equal(
    canonicalDocumentId('fek', { issue: 'Α', number: '133', year: '2026' }),
    'fek:Α:133:2026',
  );
});


test('citation targets cannot borrow a nearby article from another law or sentence', () => {
  const refs=parseGreekLegalCitations('Το άρθρο 5 του ν. 2690/1999 και ο ν. 3500/2006. Το άρθρο 9 αλλάζει.');
  assert.equal(refs[0].article,'5');
  assert.equal(refs[1].article,null);
  const next=parseGreekLegalCitations('Ο ν. 3500/2006. Η παρ. 2 του άρθρου 8 του ν. 2690/1999.');
  assert.equal(next[0].article,null);
  assert.equal(next[1].paragraph,'2');
  assert.equal(parseGreekLegalCitations('Ο ν. 2690/1999, άρθρο 5 παρ. 2.')[0].target_canonical_id,'law:2690:1999:article:5:paragraph:2');
  assert.equal(parseGreekLegalCitations('Το άρθρο 17Α του ν. 2690/1999.')[0].target_canonical_id,'law:2690:1999:article:17α');
});

test('royal decrees keep distinct identities from modern laws and presidential decrees', () => {
  const refs=parseGreekLegalCitations('Το άρθρο 2 του β.δ. 2/1833 και ο ν. 2/1833 και το π.δ. 2/1833.');
  assert.deepEqual(refs.map(r=>r.document_canonical_id),['royal_decree:2:1833','law:2:1833','presidential_decree:2:1833']);
  assert.equal(refs[0].target_canonical_id,'royal_decree:2:1833:article:2');
  assert.equal(refs[1].article,null);
});

test('table row rendering preserves line breaks, escaping and exact citation offsets', () => {
  const {renderCitationText}=require('../public/laws/citationText');
  const text='Κελί | Τιμή\nΑ & Β | 1\nν. 100/2020 | 2',offset=50,label='ν. 100/2020',start=text.indexOf(label);
  const ref={document_canonical_id:'law:100:2020',target_canonical_id:'law:100:2020:article:3',target_resolved:true};
  const ranges=[{start:offset+start,end:offset+start+label.length,ref}];
  const rows=renderCitationText(text,ranges,offset,true);
  assert.equal(rows.split('\n').length,3);
  assert.ok(rows.includes('Α &amp; Β | 1'));
  assert.ok(rows.includes('data-inline-unit="law:100:2020:article:3"'));
  assert.ok(rows.includes('>ν. 100/2020</a> | 2'));
  assert.ok(!renderCitationText(text,ranges,offset).includes('\n'));
});


test('PDF annex page ranges preserve gaps between operative articles', () => {
 const {formatPageRanges}=require('../public/laws/citationText');
 const pages=[221,69,71,70,219,220,69,0,-1,1.5];
 assert.equal(formatPageRanges(pages),'69–71, 219–221');
 assert.deepEqual(pages,[221,69,71,70,219,220,69,0,-1,1.5]);
 assert.equal(formatPageRanges([58]),'58');
 assert.equal(formatPageRanges([]),'');
});


test('native PDF spacing before the law abbreviation period preserves the foreign article identity',()=>{
 const text='Η παρ. 1 του άρθρου 18 του ν . 2508/1997 και το άρθρο 8 του ν . 1599/1986.';
 const refs=parseGreekLegalCitations(text);assert.deepEqual(refs.map(r=>r.target_canonical_id),['law:2508:1997:article:18:paragraph:1','law:1599:1986:article:8']);for(const r of refs)assert.equal(text.slice(r.start,r.end),r.raw_text);
 assert.equal(parseGreekLegalCitations('Η ανάπτυξη και το άρθρο 8 παραμένουν.').length,0);
});

test('EU citations distinguish modern directives from regulations with the old numbering order',()=>{
 const text='της Οδηγίας (ΕΕ) 2024/1233 και του Κανονισμού (ΕΚ) 1030/2002, καθώς και τον Κανονισμό (ΕΕ) 2016/679 και την Οδηγία 2011/98/ΕΕ.';
 const refs=parseGreekLegalCitations(text);
 assert.deepEqual(refs.map(ref=>ref.document_canonical_id),[
  'eu_directive:1233:2024','eu_regulation:1030:2002','eu_regulation:679:2016','eu_directive:98:2011'
 ]);
 assert.ok(refs.every(ref=>text.slice(ref.start,ref.end)===ref.raw_text));
});

test('EU directive citations keep their target when the Gazette mixes Greek and Latin E', () => {
  const text = 'της παρ. 1 του άρθρου 3 της Οδηγίας (ΕE)\n2024/1226';
  const [reference] = parseGreekLegalCitations(text);
  assert.equal(reference.target_canonical_id, 'eu_directive:1226:2024:article:3:paragraph:1');
  assert.equal(text.slice(reference.start, reference.end), 'Οδηγίας (ΕE)\n2024/1226');
});

test('an explicit list gives every cited article a separate source range and retains the act link', () => {
  const text = '[Άρθρα 4, 5, 6, 7, 8, 9 και 10 της Οδηγίας (ΕΕ) 2024/1233]';
  const refs = parseGreekLegalCitations(text);
  assert.deepEqual(refs.map(ref => ref.target_canonical_id), [
    ...[4, 5, 6, 7, 8, 9, 10].map(number => 'eu_directive:1233:2024:article:' + number),
    'eu_directive:1233:2024',
  ]);
  assert.deepEqual(refs.slice(0, 7).map(ref => text.slice(ref.start, ref.end)), ['4', '5', '6', '7', '8', '9', '10']);
  assert.equal(parseGreekLegalCitations('Τα άρθρα 4 και 5 παραμένουν. Η Οδηγία (ΕΕ) 2024/1233.').length, 1);
});

test('modern constitutional citations preserve article and paragraph without rebinding historical references', () => {
  const first = 'την ισχύ που ορίζει η παρ. 1 του\nάρθρου 28 του Συντάγματος';
  const second = 'κατά το άρθρο 44, παρ. 1 του Συντάγματος';
  assert.equal(parseGreekLegalCitations(first).length, 0);
  assert.deepEqual(
    parseGreekLegalCitations(first + '. ' + second, { modernConstitution: true }).map(ref => ref.target_canonical_id),
    ['constitution:greece:2019:article:28:paragraph:1', 'constitution:greece:2019:article:44:paragraph:1'],
  );
  assert.equal(parseGreekLegalCitations('το άρθρο 28 του Συντάγματος της Τροιζήνας', { modernConstitution: true }).length, 0);
});
