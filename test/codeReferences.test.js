'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseCodeReferences}=require('../src/legal/codeReferences');
const {citationRanges,renderCitationText,referenceLink}=require('../public/laws/citationText');
const {parseGreekLegalCitations}=require('../src/legal/citations');

test('Property Tax and Customs Code citations preserve the exact in-app destination',()=>{
 const property='law:5219:2025:code:property_tax:article:2:paragraph:5';
 const [named]=parseCodeReferences('Στην παρ. 5 του άρθρου 2 του Κώδικα Φορολογίας Περιουσίας','law:5313:2026');
 const [numbered]=parseGreekLegalCitations('Η παρ. 5 του άρθρου 2 του ν. 5219/2025');
 assert.equal(named.target_canonical_id,property);
 assert.equal(numbered.target_canonical_id,property);
 assert.match(referenceLink({...named,target_resolved:true},named.raw_text),/article=code-2&amp;paragraph=5/);
 const [customs]=parseCodeReferences('Στην παρ. 6 του άρθρου 136 του Εθνικού Τελωνειακού Κώδικα','law:5313:2026');
 assert.equal(customs.target_canonical_id,'law:5222:2025:article:136:paragraph:6');
 assert.match(referenceLink({...customs,target_resolved:true},customs.raw_text),/article=136&amp;paragraph=6/);
});

test('named Criminal Code and quoted article references keep exact paragraph context and Latin lookalikes',()=>{
 const text='Μετά από το άρθρο 71 του Ποινικού Κώδικα προστίθεται νέο άρθρο 72 ως εξής:\n«Άρθρο 72\n1. Η παρ. 6 του άρθρου 105Β και το άρθρο 374.\n2. Μέτρα των άρθρων 69A, 70 και 71. Η παρ. 2 του άρθρου 106.\n3. Το άρθρο 3 της Ευρωπαϊκής Σύμβασης των Δικαιωμάτων του Ανθρώπου.»';
 const refs=parseCodeReferences(text,'law:5090:2024');
 assert.deepEqual(refs.map(r=>r.target_canonical_id),['law:4619:2019:article:71','law:4619:2019:article:105β:paragraph:6','law:4619:2019:article:374','law:4619:2019:article:69α','law:4619:2019:article:70','law:4619:2019:article:71','law:4619:2019:article:106:paragraph:2']);
 for(const ref of refs)assert.equal(text.slice(ref.start,ref.end),ref.raw_text);
});
test('code context does not leak to foreign laws, definitions or unnamed outside-quote articles',()=>{
 assert.equal(parseCodeReferences('Το άρθρο 10 τροποποιείται.','law:5090:2024').length,0);
 const refs=parseCodeReferences('Το άρθρο 5 του ν. 3500/2006 και το άρθρο 9 του Συντάγματος. Το άρθρο 374 του Ποινικού Κώδικα.','law:4619:2019');assert.deepEqual(refs.map(r=>r.article),['374']);
 const procedure=parseCodeReferences('Η παρ. 1 του άρθρου 6 του Κώδικα Ποινικής Δικονομίας.','law:5090:2024');assert.equal(procedure[0].target_canonical_id,'law:4620:2019:article:6:paragraph:1');
 assert.deepEqual(parseCodeReferences('Πρoσθήκη άρθρου 81Α στον Κώδικα Μετανάστευσης','law:5275:2026'),[]);
});
test('inline references preserve source characters, escape markup and distinguish missing targets',()=>{
 const text='<img src=x> άρθρο 6 και άρθρο 999.';
 const unit={id:'law:1:2024:article:1',text};
 const refs=[{raw_text:'άρθρο 6',start:12,end:19,from_unit_id:unit.id,document_canonical_id:'law:2:2020',target_canonical_id:'law:2:2020:article:6',resolved:true,target_resolved:true},{raw_text:'άρθρο 999',from_unit_id:unit.id,document_canonical_id:'constitution:troezen:1827',target_canonical_id:'constitution:troezen:1827:article:999',resolved:true,target_resolved:false}];
 const html=renderCitationText(text,citationRanges(unit,{document:{canonical_id:'law:1:2024'},units:[unit],references:refs}));assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);assert.match(html,/href="#law=law%3A2%3A2020&amp;article=6"/);assert.match(html,/unavailable-reference" href="#law=constitution%3Atroezen%3A1827&amp;article=999"/);
});
test('every recognized reference uses its in-app route before and after import',()=>{
 const decree={document_canonical_id:'presidential_decree:18:1989',target_canonical_id:'presidential_decree:18:1989:article:45',target_source_page:7};
 const html=referenceLink(decree,'π.δ. 18/1989');
 assert.match(html,/unavailable-reference" href="#law=presidential_decree%3A18%3A1989&amp;article=45"/);
 assert.doesNotMatch(html,/https:|target="_blank"/);
 assert.match(referenceLink({...decree,target_resolved:true},'π.δ. 18/1989'),/href="#law=presidential_decree%3A18%3A1989&amp;article=45"/);
 assert.match(referenceLink({document_canonical_id:'fek:Β:45:1999'},'ΦΕΚ'),/href="#law=fek%3A%CE%92%3A45%3A1999"/);
 assert.match(referenceLink({document_canonical_id:'eu_regulation:1030:2002',target_canonical_id:'eu_regulation:1030:2002:body:annex:paragraph:15'},'15'),/article=annex&amp;paragraph=15/);
 assert.equal(referenceLink({},'<unknown>'),'&lt;unknown&gt;');
});
test('inner quotation marks leave the later paragraphs of an enacted article linkable',()=>{
 const unit={id:'law:5275:2026:article:5',article_number:'5',text:'«Άρθρο 81Α\n1. Η υπηρεσία «Μετανάστευση».\n2. Αναφορά στην παρ. 1. Η παρ. 1 του άρθρου 81.»'};
 const ranges=citationRanges(unit,{document:{canonical_id:'law:5275:2026'},units:[unit],references:[]});
 assert.equal(ranges.filter(range=>range.anchor).length,2);
 assert.equal(ranges.filter(range=>range.ref).length,1);
 assert.match(renderCitationText(unit.text,ranges),/article=5&amp;quote=81%CE%91&amp;quoteParagraph=1/);
});
test('quoted paragraph links remain inside the containing amending article and do not create legal units',()=>{
 const unit={id:'law:5090:2024:article:10',article_number:'10',text:'«Άρθρο 72\n1. Κείμενο.\n2. Κατά την παρ. 1. Η παρ. 6 του άρθρου 105Β.»'};
 const data={document:{canonical_id:'law:5090:2024'},units:[unit],references:[]};const ranges=citationRanges(unit,data);assert.equal(data.units.length,1);assert.equal(ranges.filter(r=>r.anchor).length,2);assert.equal(ranges.filter(r=>r.ref).length,1);
 const html=renderCitationText(unit.text,ranges);assert.match(html,/article=10&amp;quote=72&amp;quoteParagraph=1/);assert.match(html,/id="quoted-law:5090:2024:article:10-72-1"/);assert.doesNotMatch(html,/quoteParagraph=6/);
});
test('references whose raw labels coincide keep separate offsets and historical ranges expose all targets',()=>{
 const unit={id:'x',text:'άρθρο 2 και άρθρο 2'};const make=(start,id)=>({from_unit_id:'x',raw_text:'άρθρο 2',start,end:start+7,document_canonical_id:id,target_canonical_id:id+':article:2',resolved:true,target_resolved:true});
 const ranges=citationRanges(unit,{units:[unit],references:[make(0,'law:1:2020'),make(12,'law:2:2020')]});const html=renderCitationText(unit.text,ranges);assert.match(html,/law%3A1%3A2020/);assert.match(html,/law%3A2%3A2020/);
});

test('grouped citations follow printed range and explicit paragraph order despite shuffled graph results',()=>{
 const render=(label,numbers,paragraph=false)=>{const unit={id:'source',text:label};const references=numbers.map(n=>({from_unit_id:unit.id,raw_text:label,document_canonical_id:'target',target_canonical_id:'target:'+(paragraph?'paragraph':'article')+':'+n,[paragraph?'paragraph':'article']:String(n),resolved:true,target_resolved:true}));return renderCitationText(label,citationRanges(unit,{units:[unit],references}));};
 const range=render('εις τα άρθρα 9–12 της διακηρύξεως',[11,9,12,10]);assert.deepEqual([...range.matchAll(/data-inline-unit="target:article:(\d+)"/g)].map(m=>m[1]),['9','10','11','12']);assert.match(range,/εις τα άρθρα 9–12 της διακηρύξεως/);
 const explicit=render('§ 2, 9',[9,2],true);assert.deepEqual([...explicit.matchAll(/data-inline-unit="target:paragraph:(\d+)"/g)].map(m=>m[1]),['2','9']);assert.match(explicit,/provision=2/);assert.match(explicit,/provision=9/);
 const descending=render('άρθρα 12 και 9',[9,12]);assert.deepEqual([...descending.matchAll(/data-inline-unit="target:article:(\d+)"/g)].map(m=>m[1]),['12','9']);
});

test('chapter-qualified range links retain their A part and sort by the printed local article numbers',()=>{
 const id='ministerial_proclamation:amfissa_olive_grove_leasing:1833',unit={id:'source',text:'κατά τον § Α. άρθρ. 8 και 10'};const refs=['Α.10','Α.8'].map(n=>({from_unit_id:unit.id,raw_text:unit.text,document_canonical_id:id,target_canonical_id:id+':article:'+n,article:n,resolved:true,target_resolved:true}));const html=renderCitationText(unit.text,citationRanges(unit,{units:[unit],references:refs}));assert.deepEqual([...html.matchAll(/data-inline-unit="[^"]+:article:([^"]+)"/g)].map(m=>m[1]),['Α.8','Α.10']);assert.match(html,/article=%CE%91.8/);assert.match(html,/article=%CE%91.10/);
});
