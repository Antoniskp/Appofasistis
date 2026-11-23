'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {prepareRecent,buildRecentGraph,parseExplicitOwnReferences,selectRecentEntries}=require('../scripts/import-recent-laws');const {parseCodeReferences}=require('../src/legal/codeReferences');
function fixture(){const bytes=Buffer.from('%PDF-1.7 official fixture');const entry={number:'5355',year:'2026',published_at:'2026-11-13',fek_number:'188',article_count:2,topics:['1'],short_title:'Recent law',category:'Φορολογία'};const section=(n,text)=>({number:String(n),label:'Άρθρο '+n,original_label:'Άρθρο '+n,title:null,text,source_page:1,source_pages:[1,2],page_spans:[{page:1,start:0,end:4},{page:2,start:4,end:text.length}]});const source={number:'5355',year:'2026',title:'Official law',published_at:entry.published_at,fek_number:'188',source_url:'https://api.et.gr/apiLAW/1/2026/5355/pdf',pdf_filename:'law-5355-2026.pdf',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),page_count:2,text:'Whole publication',sections:[section(1,'1. Πρώτη παράγραφος.\n2. Δεύτερη παράγραφος.'),section(2,'Ισχύει η παρ. 1 του παρόντος άρθρου.')],closing:{text:'Παραγγέλλουμε τη δημοσίευση.',source_page:2,source_pages:[2]}};return {bytes,entry,source};}
test('recent import rejects changed official PDFs, identities, article gaps and missing source ranges before writes',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recent-laws-'));try{const {bytes,entry,source}=fixture();const p=path.join(dir,'law-5355-2026.json');fs.writeFileSync(path.join(dir,source.pdf_filename),bytes);fs.writeFileSync(p,JSON.stringify(source));assert.equal(prepareRecent(dir,[entry]).length,1);fs.writeFileSync(p,JSON.stringify({...source,published_at:'2026-11-14'}));assert.throws(()=>prepareRecent(dir,[entry]),/identity mismatch/);fs.writeFileSync(p,JSON.stringify({...source,sections:[source.sections[1]]}));assert.throws(()=>prepareRecent(dir,[entry]),/Incomplete recent article sequence/);const altered=structuredClone(source);altered.sections[0].page_spans=[];fs.writeFileSync(p,JSON.stringify(altered));assert.throws(()=>prepareRecent(dir,[entry]),/source ranges/);fs.writeFileSync(p,JSON.stringify(source));fs.appendFileSync(path.join(dir,source.pdf_filename),'changed');assert.throws(()=>prepareRecent(dir,[entry]),/checksum mismatch/);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('recent graph retains paragraph identities, precise page evidence and separately navigable publication closing',()=>{const {entry,source}=fixture(),g=buildRecentGraph(source,entry);assert.equal(g.units.filter(u=>u.unit_type==='article').length,2);assert.equal(g.units.filter(u=>u.unit_type==='paragraph').length,2);const second=g.units.find(u=>u.id==='law:5355:2026:article:1:paragraph:2');assert.equal(second.source_page,2);assert.deepEqual(second.source_pages,[2]);assert.equal(g.units.at(-1).id,'law:5355:2026:body:closing');assert.equal(g.units.at(-1).article_number,null);assert.equal(g.document.chronology_key,'2026-11-13');assert.equal(g.document.consolidation_status,'original_publication_not_consolidated');});

test('a paragraph after a page break uses the page containing the printed marker', () => {
 const {entry,source}=fixture();
 const section=source.sections[0];
 section.text=section.text.replace('\n','\n\n');
 const markerOffset=section.text.indexOf('2.');
 section.page_spans=[
  {page:1,start:0,end:markerOffset-2},
  {page:2,start:markerOffset,end:section.text.length},
 ];
 const graph=buildRecentGraph(source,entry);
 const paragraph=graph.units.find(unit=>unit.id==='law:5355:2026:article:1:paragraph:2');
 assert.equal(paragraph.start_offset,markerOffset-1);
 assert.equal(paragraph.source_page,2);
 assert.deepEqual(paragraph.source_pages,[2]);
});
test('explicit current-law citations resolve grouped targets while quoted amendments keep their own scope',()=>{const id='law:5355:2026';const refs=parseExplicitOwnReferences('Τα άρθρα 1 και 2 του παρόντος νόμου εφαρμόζονται. Η παρ. 1 του παρόντος άρθρου ισχύει. «Το άρθρο 4 του παρόντος νόμου αντικαθίσταται.»',id,'3');assert.deepEqual(refs.map(r=>r.target_canonical_id),[id+':article:1',id+':article:2',id+':article:3:paragraph:1']);assert.ok(refs.every(r=>r.raw_text.length&&r.start<r.end));assert.equal(parseExplicitOwnReferences('Άρθρο 4 του ν. 4172/2013 και απλή μνεία άρθρου 7.',id,'1').length,0);});
test('income-tax code references use their verified code identity rather than the enclosing 2026 amendment',()=>{const refs=parseCodeReferences('Στο άρθρο 11 του Κώδικα Φορολογίας Εισοδήματος (ν. 4172/2013) επέρχονται τροποποιήσεις.','law:5355:2026');assert.equal(refs.length,1);assert.equal(refs[0].target_canonical_id,'law:4172:2013:article:11');});

test('recent import selects a complete explicit batch and rejects unknown or duplicate IDs before writes',()=>{const entries=[{number:'5326'},{number:'5327'},{number:'5329'}];assert.deepEqual(selectRecentEntries(entries,'5329,5326'),[entries[0],entries[2]]);assert.equal(selectRecentEntries(entries),entries);assert.throws(()=>selectRecentEntries(entries,'5326,9999'),/Unknown law/);assert.throws(()=>selectRecentEntries(entries,'5326,5326'),/Invalid/);assert.throws(()=>selectRecentEntries(entries,''),/Invalid/);});


test('ordinal ratifying articles retain printed labels, independent paragraph scope and explicit PDF agreement coverage',()=>{
 const {source,entry}=fixture();source.extraction_profile='recent_gazette_ordinal_v1';source.text_coverage='ratifying_articles_with_pdf_only_agreement';source.coverage_note='Agreement is available in the original PDF.';source.pdf_only_pages=[2,3,4];source.sections[0]={...source.sections[0],label:'Άρθρο πρώτο',original_label:'Άρθρο πρώτο',title:'Κύρωση',text:'Κύρωση\nΚυρώνεται η συμφωνία.'};source.sections[1]={...source.sections[1],label:'Άρθρο δεύτερο',original_label:'Άρθρο δεύτερο',title:'Εξουσιοδοτικές διατάξεις',text:'Εξουσιοδοτικές διατάξεις\n1. Πρώτη εξουσιοδότηση.\n2. Δεύτερη εξουσιοδότηση.'};
 const g=buildRecentGraph(source,entry);assert.equal(g.units.find(u=>u.id==='law:5355:2026:article:1').label,'Άρθρο πρώτο');assert.equal(g.units.find(u=>u.id==='law:5355:2026:article:2').original_label,'Άρθρο δεύτερο');assert.equal(g.units.filter(u=>u.parent_id==='law:5355:2026:article:1').length,0);assert.equal(g.units.filter(u=>u.parent_id==='law:5355:2026:article:2').length,2);assert.equal(g.document.text_coverage,source.text_coverage);assert.equal(g.document.coverage_note,source.coverage_note);assert.deepEqual(g.document.pdf_only_pages,[2,3,4]);
});


test('ratification import preserves the printed corrected-edition notice without claiming code transcription',()=>{
 const {source,entry}=fixture();source.source_edition_note='Το ΦΕΚ επανεκτυπώθηκε λόγω σφάλματος.';source.text_coverage='ratifying_articles_with_pdf_only_agreement';source.coverage_note='The incorporated Code is PDF-only.';const graph=buildRecentGraph(source,entry);assert.equal(graph.document.source_edition_note,source.source_edition_note);assert.equal(graph.document.coverage_note,source.coverage_note);assert.equal(graph.units.filter(u=>u.unit_type==='article').length,2);
});

test('reviewed citations preserve exact offsets, page evidence and already parsed identities',()=>{
 const {source,entry}=fixture();
 const section=source.sections[0];
 section.text='Εφαρμόζεται το άρθρο 45 του π.δ. 18/1989. Το άρθρο 26 εφαρμόζεται.';
 section.page_spans=[{page:2,start:0,end:section.text.length}];
 entry.reviewed_citations=[
  {from_article:'1',raw_text:'π.δ. 18/1989',target:'presidential_decree:18:1989:article:45',target_source_page:7},
  {from_article:'1',raw_text:'άρθρο 26',target:'law:5038:2023:article:26',target_source_page:29},
 ];
 const refs=buildRecentGraph(source,entry).references.filter(ref=>entry.reviewed_citations.some(review=>review.target===ref.target_canonical_id));
 assert.equal(refs.length,2);
 assert.deepEqual(refs.map(ref=>[ref.source_page,ref.target_source_page]),[[2,7],[2,29]]);
 assert.ok(refs.every(ref=>section.text.slice(ref.start,ref.end)===ref.raw_text));
 entry.reviewed_citations[1].raw_text='μη τεκμηριωμένη αναφορά';
 assert.throws(()=>buildRecentGraph(source,entry),/Invalid reviewed citation/);
});
