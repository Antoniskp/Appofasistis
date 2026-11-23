'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLawsApiUrl,
  mapParliamentLawRecord,
  parseFekNum,
} = require('../src/adapters/hellenicParliamentLaws');

const SAMPLE_RECORD = {
  LawNum: '5329',
  Title: 'Νέο πλαίσιο μέτρων - Τροποποιήσεις ν. 4797/2021 και ν. 5116/2024',
  Ministry: 'Κλιματικής Κρίσης και Πολιτικής Προστασίας',
  Commission: 'Διαρκής Επιτροπή Παραγωγής και Εμπορίου',
  Type: 'Νόμος',
  LawPhaseDate: '2026-09-04T00:00:00+03:00',
  DateInserted: '2026-08-24T00:00:00+03:00',
  DateVoted: '2026-09-02T00:00:00+03:00',
  FekNum: "134 A'/4.9.2026",
  LawPhotocopy: [
    {
      File: 'https://www.hellenicparliament.gr/UserFiles/example/bill.pdf',
      FileType: 'Διατάξεις Σχεδίου ή Πρότασης Νόμου',
    },
  ],
  VotedLaws: [
    {
      Title: null,
      File: 'https://www.hellenicparliament.gr/UserFiles/example/voted.pdf',
    },
  ],
  Amendments: [
    {
      File: 'https://www.hellenicparliament.gr/UserFiles/example/amendment.pdf',
      AmendmentNumber: '537/11 1.9.2026',
      AmendmentMinistry: 'Κλιματικής Κρίσης και Πολιτικής Προστασίας',
      Description: 'Προσθήκη παρ. 9 στο άρθρο 20 του ν. 4797/2021.',
      SpecialDetails: null,
      Removal: false,
    },
  ],
  CommissionSessions: [
    {
      CommiteeTitle: 'Διαρκής Επιτροπή Παραγωγής και Εμπορίου',
      SessionTitle: '<p>Συνέχιση επεξεργασίας</p>',
      DiscussionIssues: [
        {
          Title: 'Συνέχιση της επεξεργασίας και εξέτασης.',
        },
      ],
    },
  ],
  LawPhase: 'Ολοκλήρωση',
};

test('parseFekNum normalizes Parliament FEK labels', () => {
  const fek = parseFekNum("134 A'/4.9.2026");

  assert.equal(fek.fek_issue, 'Α');
  assert.equal(fek.fek_number, '134');
  assert.equal(fek.fek_year, '2026');
  assert.equal(fek.fek_date, '2026-09-04');
  assert.equal(fek.fek_canonical_id, 'fek:Α:134:2026');
});

test('mapParliamentLawRecord maps metadata into a legal graph document', () => {
  const result = mapParliamentLawRecord(SAMPLE_RECORD, {
    knownDocuments: [
      { id: 'law-4797', type: 'law', law_number: 4797, law_year: 2021 },
      { id: 'law-5116', type: 'law', law_number: 5116, law_year: 2024 },
    ],
  });

  assert.equal(result.document.canonical_id, 'law:5329:2026');
  assert.equal(result.document.document_type, 'law');
  assert.equal(result.document.date_voted, '2026-09-02');
  assert.equal(result.document.fek_canonical_id, 'fek:Α:134:2026');
  assert.equal(result.attachments.length, 3);
  assert.equal(result.stats.reference_count, 3);
  assert.equal(result.stats.resolved_reference_count, 3);
  assert.ok(result.references.some((ref) => ref.target_canonical_id === 'law:4797:2021:article:20:paragraph:9'));
});

test('mapParliamentLawRecord uses stable fallback IDs when LawNum is missing', () => {
  const result = mapParliamentLawRecord({
    ...SAMPLE_RECORD,
    LawNum: null,
    Type: 'Διεθνής Σύμβαση',
  });

  assert.match(result.document.canonical_id, /^parliament:[0-9a-f]{16}$/);
  assert.equal(result.document.document_type, 'international_convention_bill');
});

test('buildLawsApiUrl limits page size and applies filters', () => {
  const url = new URL(buildLawsApiUrl({
    pageNo: 2,
    pageSize: 500,
    lawNum: 5329,
    title: 'στεγαστικής',
  }));

  assert.equal(url.searchParams.get('q'), 'laws');
  assert.equal(url.searchParams.get('pageNo'), '2');
  assert.equal(url.searchParams.get('pageSize'), '100');
  assert.equal(url.searchParams.get('lawnum'), '5329');
  assert.equal(url.searchParams.get('title'), 'στεγαστικής');
});

test('Parliament .NET timestamps preserve the source calendar date and stable law ID', () => {
  const result = mapParliamentLawRecord({ ...SAMPLE_RECORD, LawNum: '5355', DateVoted: '/Date(1794520800000+0200)/', FekNum: '188 Α΄/13.11.2026' });
  assert.equal(result.document.date_voted, '2026-11-13');
  assert.equal(result.document.canonical_id, 'law:5355:2026');
  assert.ok(result.document.source_url.includes('lawnum=5355'));
});

test('publication year determines the law ID when voting and publication cross a year boundary', () => {
  const result = mapParliamentLawRecord({ ...SAMPLE_RECORD, DateVoted: '2025-12-30', FekNum: '1 Α΄/2.1.2026' });
  assert.equal(result.document.law_year, '2026');
  assert.equal(result.document.date_voted, '2025-12-30');
});
