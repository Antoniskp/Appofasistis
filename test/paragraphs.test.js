'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {splitNumberedParagraphs} = require('../src/legal/paragraphs');
const {buildFoundationGraph} = require('../scripts/import-basic-laws');
test('top-level paragraphs ignore nested replacement numbering and preserve offsets', () => {
  const text = 'Τίτλος\n1. Αλλάζει ως εξής: «\n1. Εσωτερικό.\n2. Εσωτερικό.»\n2. Δεύτερη εξωτερική.';
  const parts=splitNumberedParagraphs(text);
  assert.deepEqual(parts.map(p=>p.number), ['1','2']);
  assert.match(parts[0].text,/2. Εσωτερικό/);
  assert.equal(text.slice(parts[1].textStart,parts[1].end).trim(), parts[1].text);
  assert.deepEqual(splitNumberedParagraphs('«Άρθρο 5\n1. Αντικατάσταση.»'),[]);
  assert.deepEqual(splitNumberedParagraphs('1. Α\n1. Β\n2. Γ'),[]);
  assert.deepEqual(splitNumberedParagraphs('2. Αποσπασματική διάταξη.'),[]);
});
test('foundation paragraphs have stable IDs and references originate in the paragraph', () => {
  const text='Τίτλος\n1. Η παρ. 2 του άρθρου 6 του ν. 3500/2006.\n2. Άλλο κείμενο.';
  const graph=buildFoundationGraph({number:'4620',year:'2019',title:'Κώδικας',published_at:'2019-06-11',fek_number:'96',source_url:'https://api.et.gr/apiLAW/1/2019/4620/pdf',text,sections:[{number:'10',label:'Άρθρο 10',text,source_page:3}]});
  assert.equal(graph.units[1].id,'law:4620:2019:article:10:paragraph:1');
  assert.equal(graph.references[0].from_unit_id,graph.units[1].id);
  assert.equal(graph.references[0].target_canonical_id,'law:3500:2006:article:6:paragraph:2');
});


test('attached Greek case labels preserve outer paragraph identities without accepting decimal numbers', () => {
  const text='Τίτλος\n1.α) Πρώτη περίπτωση.\nβ) Δεύτερη περίπτωση. «\n1.α) Εσωτερική παράγραφος.»\n2. Δεύτερη εξωτερική.\n3.στ) Τρίτη εξωτερική.';
  const parts=splitNumberedParagraphs(text);
  assert.deepEqual(parts.map(p=>p.number), ['1','2','3']);
  assert.ok(parts[0].text.startsWith('α) Πρώτη περίπτωση.'));
  assert.ok(parts[2].text.startsWith('στ) Τρίτη εξωτερική.'));
  for(const p of parts)assert.equal(text.slice(p.textStart,p.end).trim(),p.text);
  assert.deepEqual(splitNumberedParagraphs('«\n1.α) Εσωτερική.\n2. Άλλη εσωτερική.»'),[]);
  assert.deepEqual(splitNumberedParagraphs('1.25 ποσοστό\n2. Δεν υπάρχει πρώτη παράγραφος.'),[]);
  assert.deepEqual(splitNumberedParagraphs('1.αόριστη λέξη\n2. Δεν υπάρχει πρώτη παράγραφος.'),[]);
});


test('wrapped article citations cannot masquerade as top-level paragraph labels', () => {
  const text='Τίτλος\n1. Ισχύει η ρύθμιση του άρθρου\n79. Το ποσό καθορίζεται με απόφαση.\n2. Δεύτερη παράγραφος.';
  const parts=splitNumberedParagraphs(text);
  assert.deepEqual(parts.map(p=>p.number),['1','2']);
  assert.ok(parts[0].text.includes('79. Το ποσό'));
  for(const p of parts)assert.equal(text.slice(p.textStart,p.end).trim(),p.text);
  assert.deepEqual(splitNumberedParagraphs('1. Το κείμενο του άρθρου.\n2. Νέα παράγραφος.').map(p=>p.number),['1','2']);
});

test('an unmatched guillemet at a reviewed offset preserves wording and later numbered paragraphs', () => {
  const text = '1. Πρώτη.\n2. Άδεια τύπου «Ε.5).\n3. Τρίτη.';
  assert.deepEqual(splitNumberedParagraphs(text).map(part => part.number), ['1', '2']);
  const parts = splitNumberedParagraphs(text, [text.indexOf('«')]);
  assert.deepEqual(parts.map(part => part.number), ['1', '2', '3']);
  assert.equal(parts[1].text, 'Άδεια τύπου «Ε.5).');
});
