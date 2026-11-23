'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {prepareRecent,buildRecentGraph}=require('../scripts/import-recent-laws');
const {loadIncorporatedCodes}=require('../scripts/incorporated-codes');
const {parseCodeReferences}=require('../src/legal/codeReferences');
const {referenceUrl,citationRanges,renderCitationText}=require('../public/laws/citationText');
const profile=require('../config/incorporated-codes.json').planning;
const id='law:5306:2026',prefix=id+':code:planning';
const entry={number:'5306',year:'2026',article_count:2,incorporated_codes:['planning']};
const section=(n,page=14)=>{const title=profile.reviewed_titles?.[String(n)]?.title||'Τίτλος '+n,text=title+'\n1. Το άρθρο 2 εφαρμόζεται.\n2. Η παρ. 1 του παρόντος άρθρου.';return {number:String(n),label:'Άρθρο '+n,original_label:'Άρθρο '+n,title,text,source_page:page,source_pages:[page],page_spans:[{page,start:0,end:text.length}]};};
const source={number:'5306',year:'2026',title:'Κύρωση',published_at:'2026-06-08',fek_number:'88',source_url:profile.source_url,sha256:profile.sha256,page_count:632,text:'Κύρωση',sections:[section(1),section(2,445)],closing:{text:'Παραγγέλλομε τη δημοσίευση.',source_page:632,source_pages:[632]}};
const code={...profile,scope_key:'planning',scope_title:'Κώδικας Χωροταξίας - Πολεοδομίας',sections:Array.from({length:profile.last_article},(_,i)=>section(i+1,i+1>=179?156:14)),coverage_note:'Code 1–100 only.',text_coverage:'ratifying_law_with_partial_incorporated_code',pdf_only_pages:Array.from({length:source.page_count-profile.boundary_page},(_,i)=>profile.boundary_page+i)};

test('incorporated Code keeps ratification identities, source order and independent paragraph parents',()=>{
 const base=buildRecentGraph(source,{...entry,incorporated_codes:[]});
 const g=buildRecentGraph(source,entry,[],[code]);
 for(const u of base.units){const actual=g.units.find(v=>v.id===u.id);assert.equal(actual.text,u.text);assert.equal(actual.parent_id,u.parent_id);assert.equal(actual.label,u.label);}
 assert.equal(g.units.filter(u=>u.scope_key&&u.unit_type==='article').length,profile.last_article);
 assert.equal(g.units.filter(u=>u.scope_key&&u.parent_id).length,2*profile.last_article);
 assert.equal(g.units[0].id,id+':article:1');assert.equal(g.units.at(-1).id,id+':body:closing');
 for(const s of code.sections){const a=g.units.find(u=>u.id===prefix+':article:'+s.number);assert.equal(a.navigation_number,'code-'+s.number);assert.equal(a.text,s.text);assert.deepEqual(a.source_pages,s.source_pages);for(const p of g.units.filter(u=>u.parent_id===a.id)){assert.equal(a.text.slice(p.start_offset,p.end_offset).trim().replace(/^\d+[.)]\s*/u,''),p.text);assert.ok(s.page_spans.some(span=>span.page===p.source_page&&span.start<=p.start_offset&&span.end>p.start_offset)||p.source_page===s.source_page);}}
 for(const r of g.references){const u=g.units.find(u=>u.id===r.from_unit_id);const a=u.parent_id?g.units.find(a=>a.id===u.parent_id):u;assert.equal(a.text.slice(r.start,r.end),r.raw_text);assert.ok(a.source_pages.includes(r.source_page));}
 assert.equal(g.document.incorporated_code_total_articles,477);assert.equal(g.document.pdf_only_pages[0],profile.boundary_page);assert.equal(g.document.pdf_only_pages.at(-1),631);assert.equal(g.document.original_provision_count,2);
});

test('scoped Code sources are mandatory and reject truncation, page drift and a different PDF',()=>{
 assert.throws(()=>buildRecentGraph(source,entry),/Required incorporated/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'incorporated-code-'));
 try{assert.throws(()=>loadIncorporatedCodes(dir,source,entry),/ENOENT/);const file=path.join(dir,code.filename);fs.writeFileSync(file,JSON.stringify({...code,sections:code.sections.slice(1)}));assert.throws(()=>loadIncorporatedCodes(dir,source,entry),/sequence/);const changed=structuredClone(code);changed.sections[0].page_spans[0].page=445;fs.writeFileSync(file,JSON.stringify(changed));assert.throws(()=>loadIncorporatedCodes(dir,source,entry),/source ranges/);fs.writeFileSync(file,JSON.stringify(code));assert.equal(loadIncorporatedCodes(dir,source,entry).length,1);assert.throws(()=>loadIncorporatedCodes(dir,{...source,sha256:'changed'},entry),/identity mismatch/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('planning Code fallback requires explicit scope and excludes other codes, decrees and ranges',()=>{
 assert.equal(parseCodeReferences('Το άρθρο 2 εφαρμόζεται.',id).length,0);
 const text='Η παρ. 1 του άρθρου 2 και το άρθρο 4. Το άρθρο 2 του π.δ. 503/1985. Το άρθρο 3 του β.δ. 1/1950. Τα άρθρα 1097 έως 1099 του Αστικού Κώδικα. Τα άρθρα 682 και επόμενα του Κώδικα Πολιτικής Δικονομίας. Το άρθρο 6 του Κώδικα Ποινικής Δικονομίας. Η παρ. 10 του άρθρου 2 του ίδιου νόμου. Το άρθρο 5 του Ν. 4014/2011.';
 assert.deepEqual(parseCodeReferences(text,id,{scope:'planning'}).map(r=>r.target_canonical_id),[prefix+':article:2:paragraph:1',prefix+':article:4','law:4620:2019:article:6']);
 assert.equal(parseCodeReferences('Το άρθρο 21 του Κώδικα Χωροταξίας - Πολεοδομίας.', 'law:5359:2026')[0].target_canonical_id,prefix+':article:21');
});

test('scoped links, paragraphs and quoted paragraphs preserve their Code identity in reload URLs',()=>{
 const target=prefix+':article:2:paragraph:1';const ref={document_canonical_id:id,target_canonical_id:target};const p=new URLSearchParams(referenceUrl(ref).slice(1));assert.equal(p.get('article'),'code-2');assert.equal(p.get('paragraph'),'1');assert.equal(new URLSearchParams(referenceUrl({...ref,target_canonical_id:id+':article:2'}).slice(1)).get('article'),'2');
 const unit={id:prefix+':article:8',article_number:'8',navigation_number:'code-8',text:'«Άρθρο 3\n1. Κείμενο.\n2. Κατά την παρ. 1.»'};const html=renderCitationText(unit.text,citationRanges(unit,{document:{canonical_id:id},units:[unit],references:[]}));assert.match(html,/article=code-8&amp;quote=3&amp;quoteParagraph=1/);assert.ok(html.includes('quoted-'+unit.id+'-3-1'));
});


test('a paragraph starting after an inter-page newline uses the page of its printed marker',()=>{
 const changed=structuredClone(code),s=changed.sections[0],boundary=s.text.indexOf('\n2.');s.page_spans=[{page:14,start:0,end:boundary},{page:15,start:boundary+1,end:s.text.length}];s.source_pages=[14,15];
 const g=buildRecentGraph(source,entry,[],[changed]),p=g.units.find(u=>u.id===prefix+':article:1:paragraph:2');assert.equal(p.source_page,15);assert.deepEqual(p.source_pages,[15]);
});


test('internal Code fallback excludes convention, appropriation-code, building-regulation and spaced-law references',()=>{
 const text='Το άρθρο 1 της Σύμβασης. Το άρθρο 1 της Διεθνούς Σύμβασης. Το άρθρο 2 του ΚΗ/1947 ψηφίσματος. Το άρθρο 8 του ν . 1599/1986. Το άρθρο 15 του Κ.Α.Α.Α.. Το άρθρο 32 του Νέου Οικοδομικού Κανονισμού. Το άρθρο 7 του Ν.Ο.Κ.. Το άρθρο 101 εφαρμόζεται.';
 assert.deepEqual(parseCodeReferences(text,id,{scope:'planning'}).map(r=>r.target_canonical_id),[prefix+':article:101']);
});

test('nested reviewed-title evidence is compared by value and cannot drift during import',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'incorporated-code-review-'));
 try{const file=path.join(dir,code.filename);const changed=structuredClone(code);changed.reviewed_titles['179'].source_page=155;fs.writeFileSync(file,JSON.stringify(changed));assert.throws(()=>loadIncorporatedCodes(dir,source,entry),/profile mismatch/);fs.writeFileSync(file,JSON.stringify(code));assert.equal(loadIncorporatedCodes(dir,source,entry).length,1);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
