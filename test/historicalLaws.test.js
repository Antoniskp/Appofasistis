'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {buildHistoricalGraph}=require('../src/legal/historical');
const {prepareHistory}=require('../scripts/import-historical-laws');
const entries=require('../config/historical-collection.json').entries;
test('historical originals retain their actual types, source dates and coverage',()=>{
 for(const entry of entries){const graph=buildHistoricalGraph(entry);assert.equal(graph.document.canonical_id,entry.id);assert.equal(graph.document.historical,true);assert.notEqual(graph.document.canonical_id,'law:1:1833');if(entry.coverage==='scan_only'){assert.equal(graph.units.length,0);assert.equal(graph.document.source_text,null);}}
 const royal=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:2:1833'));assert.deepEqual(royal.units.map(u=>u.article_number),['1','2','3','4','5','6','7']);assert.equal(royal.units[3].source_page,3);assert.equal(royal.units[4].source_page,4);assert.equal(royal.document.issued_at_julian,'1833-02-01');assert.equal(royal.document.issued_at_gregorian,'1833-02-13');assert.match(royal.document.source_text,/Αντιβασιλεία/);
 const circular=buildHistoricalGraph(entries.find(e=>e.id==='ministerial_circular:interior:62:1833'));assert.equal(circular.document.text_coverage,'excerpt');assert.equal(circular.references[0].document_canonical_id,'royal_decree:2:1833');
 assert.equal(buildHistoricalGraph(entries.find(e=>e.type==='fek')).document.published_at_gregorian,'1833-02-28');
});
test('historical importer rejects changed scans and fictitious provision identities',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'historical-import-'));
 try{
 const entry=structuredClone(entries.find(e=>e.id==='royal_decree:2:1833'));const bytes=Buffer.from('%PDF-1.4 fixture');entry.sha256=crypto.createHash('sha256').update(bytes).digest('hex');fs.writeFileSync(path.join(directory,entry.pdf_filename),bytes);assert.equal(prepareHistory(directory,[entry])[0].graph.units.length,7);
 fs.appendFileSync(path.join(directory,entry.pdf_filename),'changed');assert.throws(()=>prepareHistory(directory,[entry]),/checksum mismatch/);
 const duplicate=structuredClone(entry);duplicate.sections[1].number='1';assert.throws(()=>buildHistoricalGraph(duplicate),/Duplicate/);
 const scanned=structuredClone(entries.find(e=>e.coverage==='scan_only'));scanned.sections=[entry.sections[0]];assert.throws(()=>buildHistoricalGraph(scanned),/cannot claim indexed legal text/);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('Epidaurus retains all printed paragraph numbers, source pages and the unnumbered closing',()=>{
 const entry=entries.find(e=>e.id==='constitution:epidaurus:1822');const graph=buildHistoricalGraph(entry);
 assert.equal(graph.document.text_coverage,'complete_greek_transcription');
 const digits=['','α','β','γ','δ','ε','ς','ζ','η','θ'];
 const tens=['','ι','κ','λ','μ','ν','ξ','ο','π','ϟ','ρ'];
 const numbers=Array.from({length:109},(_,i)=>tens[Math.floor((i+1)/10)]+digits[(i+1)%10]);
 const paragraphs=graph.units.filter(u=>u.unit_type==='paragraph');
 assert.equal(graph.document.original_provision_count,109);
 assert.deepEqual(paragraphs.map(u=>u.paragraph_number),numbers);
 assert.ok(paragraphs.every(u=>u.parent_id===null&&u.article_number===null&&u.original_label===u.paragraph_number+'΄'));
 assert.equal(graph.units[5].id,'constitution:epidaurus:1822:paragraph:ς');
 assert.equal(graph.units[5].original_label,'ς΄');assert.deepEqual(graph.units[0].source_pages,[2,3]);
 assert.deepEqual(graph.units.find(u=>u.paragraph_number==='κς').source_pages,[4,5]);
 assert.match(graph.units.find(u=>u.paragraph_number==='κβ').text,/8\. Ο της Αστυνομίας/);
 assert.equal(graph.units.some(u=>u.id.endsWith(':paragraph:2')),false);
 for(const [number,pages] of [['νθ',[7,8]],['οδ',[8,9]],['πδ',[9,10]],['ϟς',[10,11]]]){
  assert.deepEqual(paragraphs.find(u=>u.paragraph_number===number).source_pages,pages);
 }
 assert.equal(paragraphs.at(-1).source_page,12);
 assert.equal(graph.units.length,110);
 assert.equal(graph.units.at(-1).id,entry.id+':body:publication');
 assert.equal(graph.units.at(-1).paragraph_number,null);
 assert.match(graph.units.at(-1).text,/Αρχεία του Βουλευτικού Σώματος/);
 assert.deepEqual(graph.references.map(ref=>ref.target_canonical_id),['ν','με','νβ','λδ','με','μα','με','νβ','νγ'].map(number=>entry.id+':paragraph:'+number));
 assert.match(graph.document.source_text,/ς΄/);assert.equal(graph.units.some(u=>u.id.includes(':article:')),false);
});
test('Law No. 12 and the provincial organization retain their own paragraph scopes and the printed date discrepancy',()=>{
 const lawId='law:12:1822';
 const organizationId='legal_annex:provincial_organization:1822';
 const build=id=>buildHistoricalGraph(entries.find(entry=>entry.id===id));
 const law=build(lawId);
 const organization=build(organizationId);
 assert.deepEqual(law.units.filter(unit=>unit.unit_type==='paragraph').map(unit=>unit.paragraph_number),['α','β','γ','δ','ε']);
 assert.deepEqual(law.units.find(unit=>unit.paragraph_number==='δ').source_pages,[12,13]);
 assert.equal(law.document.chronology_key,'1822-04-30');
 assert.match(law.units.find(unit=>unit.navigation_number==='signatures').text,/30 Απριλίου, 1823/);
 assert.match(law.units.at(-1).text,/ις΄ Απριλίου αωκγ΄/);
 assert.equal(law.units.at(-1).source_page,16);
 assert.equal(law.references[0].target_canonical_id,organizationId);
 const digits=['','α','β','γ','δ','ε','ς','ζ','η','θ'];
 const tens=['','ι','κ','λ'];
 const numbered=organization.units.filter(unit=>unit.unit_type==='paragraph');
 assert.deepEqual(numbered.map(unit=>unit.paragraph_number),
  Array.from({length:36},(_,i)=>tens[Math.floor((i+1)/10)]+digits[(i+1)%10]));
 for(const [number,length] of [['γ',5],['ιη',3],['κθ',3]]){
  assert.equal(numbered.find(unit=>unit.paragraph_number===number).text.match(/^\d\./gm).length,length);
 }
 assert.equal(organization.units.at(-1).id,organizationId+':body:crete_annex');
 assert.match(organization.units.at(-1).text,/τριμελή Επιτροπήν.*αωκβ΄/s);
 assert.deepEqual(organization.references.map(ref=>ref.target_canonical_id),
  ['ε','κθ','η'].map(number=>organizationId+':paragraph:'+number));
});
test('Crete keeps the preamble and all 40 articles on their manuscript pages',()=>{
 const entry=entries.find(e=>e.id==='historical_act:crete:1822');
 const {document,units}=buildHistoricalGraph(entry);
 const digits=['','α','β','γ','δ','ε','ς','ζ','η','θ'];
 const tens=['','ι','κ','λ','μ'];
 const articleNumbers=Array.from({length:40},(_,i)=>tens[Math.floor((i+1)/10)]+digits[(i+1)%10]);
 const articles=units.slice(1);
 const article=number=>articles.find(unit=>unit.article_number===number);
 assert.equal(document.text_coverage,'complete_greek_transcription');
 assert.equal(document.chronology_key,'1822-05-20');
 assert.equal(document.source_page_count,8);
 assert.equal(document.original_provision_count,40);
 assert.equal(units[0].id,entry.id+':body:preamble');
 assert.equal(units[0].article_number,null);
 assert.match(units[0].text,/γενικού συστήματος της Ελλάδος/);
 assert.deepEqual(articles.map(unit=>unit.article_number),articleNumbers);
 assert.ok(articles.every(unit=>unit.source_page<=5&&unit.original_label===unit.article_number+'΄'));
 assert.deepEqual(article('β').source_pages,[1,2]);
 assert.deepEqual(article('κβ').source_pages,[3,4]);
 assert.match(article('ιβ').text,/24 επαρχίας[\s\S]*Γαυδοπούλα/);
 assert.equal(article('ιζ').text.match(/^([α-ες])\) /gm).length,6);
 assert.match(article('κ').text,/άχρι 100 γροσίων/);
 assert.match(document.source_text,/Εν Αρμένοις, τη 20 Μαΐου 1822 και β΄ έτος Ανεξαρτησίας\.$/);
});
test('Astros preserves 99 primary paragraphs, the final oath and the separate adoption resolution',()=>{
 const entry=entries.find(e=>e.id==='constitution:astros:1823');
 const {document,units,references}=buildHistoricalGraph(entry);
 const digits=['','α','β','γ','δ','ε','ς','ζ','η','θ'];
 const tens=['','ι','κ','λ','μ','ν','ξ','ο','π','ϟ'];
 const paragraphs=units.filter(unit=>unit.unit_type==='paragraph');
 const unit=number=>paragraphs.find(item=>item.paragraph_number===number);
 assert.deepEqual(paragraphs.map(item=>item.paragraph_number),
  Array.from({length:99},(_,i)=>tens[Math.floor((i+1)/10)]+digits[(i+1)%10]));
 assert.equal(document.original_provision_count,99);
 assert.equal(document.chronology_key,'1823-04-13');
 for(const [number,pages] of [['ιζ',[2,3]],['ξα',[5,6]],['ο',[6,7]],['πς',[7,8]]]){
  assert.deepEqual(unit(number).source_pages,pages);
 }
 assert.match(unit('θ').text,/αργυρώνητος/);
 assert.match(unit('κε').text,/6\. Της Θρησκείας/);
 assert.match(unit('ϟθ').text,/Ορκίζομαι/);
 const adoption=units.at(-1);
 assert.equal(adoption.id,entry.id+':body:ratification');
 assert.equal(adoption.source_page,9);
 assert.match(adoption.text,/^Αριθ\. 19/);
 assert.equal([...adoption.text.matchAll(/^[αβγδ]΄\./gm)].length,4);
 assert.deepEqual(references.filter(ref=>ref.from_unit_id===unit('ιγ').id).map(ref=>ref.paragraph),['β','ς','η']);
 assert.ok(references.some(ref=>ref.target_canonical_id==='legal_code:criminal_anthology:1824'));
});
test('Astros declaration and Election Law No. 17 keep their own dates and citation routes',()=>{
 const astros='constitution:astros:1823';
 const law='law:17:1822';
 const read=id=>buildHistoricalGraph(entries.find(entry=>entry.id===id));
 const election=read(law);
 assert.equal(election.document.chronology_key,'1822-11-09');
 assert.equal(election.document.original_provision_count,11);
 assert.match(election.units[0].text,/17 του Κώδικος των Νόμων/);
 assert.match(election.units.find(unit=>unit.paragraph_number==='ε').text,/παρ\. ια΄ του Νόμου της Επιδαύρου/);
 assert.match(election.units.find(unit=>unit.navigation_number==='signatures').text,/Εν Ερμιόνη/);
 assert.deepEqual(election.units.at(-1).source_pages,[11,12]);
 assert.match(election.units.at(-1).text,/ις΄ Απριλ\. αωκγ΄/);
 assert.deepEqual(read(astros).references.filter(ref=>ref.document_canonical_id===law).map(ref=>ref.target_canonical_id),
  ['ς','ς','ζ'].map(number=>law+':paragraph:'+number));
 const declaration=read('historical_act:astros_declaration:1823');
 assert.equal(declaration.document.chronology_key,'1823-04-18');
 assert.equal(declaration.units.length,1);
 assert.deepEqual(declaration.units[0].source_pages,[9,10]);
 assert.equal(declaration.references[0].target_canonical_id,astros);
});
test('Troezen indexes the complete Constitution, the three oaths and the separately dated acts',()=>{
 const constitutionId='constitution:troezen:1827';
 const declarationId='historical_act:troezen_declaration:1827';
 const resolutionId='national_assembly_resolution:troezen:ιε:1827';
 const read=id=>buildHistoricalGraph(entries.find(entry=>entry.id===id));
 const constitution=read(constitutionId);
 const [preamble]=constitution.units;
 const articles=constitution.units.filter(unit=>unit.unit_type==='article');
 const oaths=constitution.units.slice(151);
 assert.equal(constitution.document.chronology_key,'1827-05-01');
 assert.equal(constitution.document.text_coverage,'complete_greek_transcription');
 assert.equal(constitution.document.original_provision_count,150);
 assert.equal(preamble.id,constitutionId+':body:preamble');
 assert.deepEqual(preamble.source_pages,[6]);
 assert.deepEqual(articles.map(article=>article.article_number),Array.from({length:150},(_,i)=>String(i+1)));
 for(const [number,pages] of [[1,[6,7]],[6,[7,8]],[13,[8,9]],[21,[9,10]],[32,[11,12]],[52,[13,14]],[63,[14,15]],[75,[16,17]],[82,[17,18]],[101,[19,20]],[108,[20,21]],[119,[21,22]],[132,[23,24,25]],[142,[25,26]],[148,[26,27]]]){
  assert.deepEqual(articles[number-1].source_pages,pages);
 }
 assert.match(articles[4].text,/Η κυριαρχία ενυπάρχει εις το έθνος/);
 assert.equal(articles[5].text.match(/^[α-ε]΄\./gm).length,5);
 assert.equal(articles[25].text.match(/^[α-γ]΄\./gm).length,3);
 assert.match(articles[131].text,/ρητήν ημέραν συνεδριάσεως[\s\S]*επιβαλλομένην ποινήν/);
 assert.match(articles[149].text,/την Αθηνάν/);
 assert.deepEqual(oaths.map(unit=>[unit.navigation_number,unit.source_pages]),[
  ['citizens_oath',[27]],['legislative_oath',[27,28]],['governors_oath',[28]]
 ]);
 assert.ok(oaths.every(unit=>unit.unit_type==='body'&&unit.article_number===null));
 assert.deepEqual(constitution.references.filter(ref=>ref.document_canonical_id===constitutionId&&ref.article).map(ref=>ref.article),['73','48','10','75','95','73','99']);
 const governorOath=constitution.references.find(ref=>ref.from_unit_id===constitutionId+':article:122');
 assert.equal(governorOath.target_canonical_id,constitutionId+':body:governors_oath');
 const {referenceUrl}=require('../public/laws/citationText');
 assert.equal(new URLSearchParams(referenceUrl(governorOath).slice(1)).get('article'),'governors_oath');
 const resolution=read(resolutionId);
 assert.equal(resolution.document.date_precision,'month');
 assert.equal(resolution.document.chronology_key,'1827-05');
 assert.equal(resolution.document.source_hash,constitution.document.source_hash);
 assert.equal(resolution.document.original_provision_count,5);
 assert.deepEqual(resolution.units.filter(unit=>unit.unit_type==='paragraph').map(unit=>unit.original_label),['Α΄','Β΄','Γ΄','Δ΄','Ε΄']);
 assert.match(resolution.units[2].text,/νομοθετήση ή να ενεργήση/);
 assert.match(resolution.units.at(-1).text,/κατά μήνα Μάιον/);
 assert.deepEqual(resolution.references.map(ref=>ref.target_canonical_id),['constitution:astros:1823',constitutionId]);
 const proclamation=read(declarationId);
 assert.equal(proclamation.document.chronology_key,'1827-05-05');
 assert.equal(proclamation.document.text_coverage,'complete_greek_transcription');
 assert.equal(proclamation.units.length,1);
 assert.deepEqual(proclamation.units[0].source_pages,[1,2,3,4,5]);
 assert.match(proclamation.units[0].text,/5 Μαΐου 1827[\s\S]*Ν\. Σπηλιάδης/);
 assert.deepEqual(proclamation.references.map(ref=>ref.target_canonical_id),['constitution:astros:1823',constitutionId]);
 assert.ok(proclamation.document.source_hash===constitution.document.source_hash);
});
test('Argos indexes four resolutions with their dates and separate numbering for the attached bases',()=>{
 const read=letter=>buildHistoricalGraph(entries.find(entry=>entry.id==='national_assembly_resolution:argos:'+letter+':1829'));
 const [a,b,g,d]=['α','β','γ','δ'].map(read);
 assert.deepEqual([a,b,g,d].map(graph=>graph.document.chronology_key),['1829-07-22','1829-07-22','1829-07-26','1829-07-26']);
 assert.deepEqual([a,b,g,d].map(graph=>graph.document.original_provision_count),[4,22,10,4]);
 assert.equal(b.document.source_edition_year,1852);
 assert.ok(a.document.source_hash===g.document.source_hash&&g.document.source_hash===d.document.source_hash);
 assert.notEqual(a.document.source_hash,b.document.source_hash);
 const first=b.units.find(unit=>unit.navigation_number==='α');
 const firstBasis=b.units.find(unit=>unit.navigation_number==='bases-α');
 assert.equal(first.original_label,firstBasis.original_label);
 assert.notEqual(first.id,firstBasis.id);
 assert.deepEqual(b.units.filter(unit=>unit.navigation_number?.startsWith('bases-')).map(unit=>unit.original_label),['Α΄','Β΄','Γ΄','Δ΄','Ε΄','Ϛ΄','Ζ΄']);
 assert.deepEqual(b.units.find(unit=>unit.navigation_number==='bases-δ').source_pages,[5,6]);
 assert.match(b.units.find(unit=>unit.navigation_number==='bases-ζ').text,/Το παρόν Ψήφισμα κτλ\./);
 assert.deepEqual(b.references.filter(ref=>ref.from_unit_id.endsWith(':body:bases')).map(ref=>ref.target_canonical_id),['constitution:epidaurus:1822','constitution:astros:1823','constitution:troezen:1827']);
 const tax=g.units.find(unit=>unit.article_number==='6');
 assert.deepEqual(tax.source_pages,[217,218]);
 assert.equal(tax.text.match(/^\d+\./gm).length,3);
 assert.doesNotMatch(g.document.source_text,/υπ’ Αρ\. Κ΄/);
 assert.equal(d.references[0].target_canonical_id,'national_assembly_resolution:troezen:κ:1827');
});

test('the Hegemonic Constitution indexes all 294 articles, its oaths and the linked adoption resolution',()=>{
 const constitutionId='constitution:hegemonic:1832';
 const resolutionId='national_assembly_resolution:nauplio:κα:1832';
 const read=id=>buildHistoricalGraph(entries.find(entry=>entry.id===id));
 const constitution=read(constitutionId);
 const articles=constitution.units.filter(unit=>unit.unit_type==='article');
 const oaths=constitution.units.filter(unit=>unit.unit_type==='body');
 assert.equal(constitution.document.chronology_key,'1832-03-15');
 assert.equal(constitution.document.text_coverage,'complete_greek_transcription');
 assert.equal(constitution.document.original_provision_count,294);
 assert.deepEqual(articles.map(unit=>unit.article_number),Array.from({length:294},(_,index)=>String(index+1)));
 for(const [number,pages] of [[15,[2,3]],[22,[3,4]],[38,[4,5]],[53,[5,6]],[81,[7]],[85,[7,8]],[101,[8,9]],[154,[11,12]],[184,[13,14]],[216,[16]],[233,[16,17]],[261,[18]],[283,[19,20]],[294,[20]]]){
  assert.deepEqual(articles[number-1].source_pages,pages);
 }
 assert.match(articles[35].text,/άμα πατήση την Ελληνικήν γην, είναι ελεύθερος/);
 assert.match(articles[167].text,/από 27 μέλη τουλάχιστον, και από 35 το πλείστον/);
 assert.equal(articles[185].text.match(/^[α-ηϛ]΄\)/gm).length,8);
 assert.match(articles[203].text,/του καθενός συνεδρίου εννέα μέλη/);
 assert.match(articles[206].text,/εντός 15 ημερών/);
 assert.match(articles[260].text,/«Ορκίζεσθε[\s\S]*Τα δύο τρίτα των φερομένων ψήφων/);
 assert.match(articles[282].text,/Λογιστελεγκτικόν Κριτήριον/);
 assert.match(articles[293].text,/ο Φοίνιξ/);
 assert.deepEqual(oaths.map(unit=>[unit.navigation_number,unit.source_pages]),[
  ['greek_oath',[20]],['citizens_oath',[20,21]],['representatives_oath',[21]],['senators_oath',[21]]
 ]);
 assert.deepEqual(constitution.references.filter(ref=>ref.from_unit_id===constitutionId+':article:14').map(ref=>ref.target_canonical_id),[
  constitutionId+':body:greek_oath',constitutionId+':body:citizens_oath'
 ]);
 const proposal=constitution.references.find(ref=>ref.from_unit_id===constitutionId+':article:85');
 assert.equal(proposal.target_canonical_id,constitutionId+':article:119');
 assert.equal(proposal.source_page,8);
 const invalid=structuredClone(entries.find(entry=>entry.id===constitutionId));
 invalid.verified_references.find(ref=>ref.from_number==='85').source_page=9;
 assert.throws(()=>buildHistoricalGraph(invalid),/citation page is outside the source section/);
 assert.deepEqual(constitution.references.filter(ref=>['127','135','177'].includes(ref.from_unit_id.split(':').at(-1))).map(ref=>ref.target_canonical_id),[
  constitutionId+':body:representatives_oath',constitutionId+':body:representatives_oath',constitutionId+':body:senators_oath'
 ]);
 assert.equal(constitution.references.find(ref=>ref.from_unit_id===constitutionId+':article:202').target_canonical_id,constitutionId+':article:163');
 const indexedIds=new Set(constitution.units.map(unit=>unit.id));
 assert.ok(constitution.references.filter(ref=>ref.document_canonical_id===constitutionId).every(ref=>indexedIds.has(ref.target_canonical_id)));
 assert.deepEqual(constitution.references.filter(ref=>ref.from_unit_id===constitutionId+':article:243').map(ref=>[ref.raw_text,ref.article]),[
  ['κατά το 157 165 άρθρον','157'],['κατά το 157 165 άρθρον','165']
 ]);
 assert.equal(constitution.references.find(ref=>ref.from_unit_id===constitutionId+':article:283').source_page,20);
 assert.deepEqual(constitution.references.filter(ref=>ref.from_unit_id===constitutionId+':article:291').map(ref=>ref.target_canonical_id),[
  constitutionId+':article:118','legal_code:criminal_anthology:1824','legal_code:french_commercial_code:undated'
 ]);
 const resolution=read(resolutionId);
 assert.equal(resolution.document.source_hash,constitution.document.source_hash);
 assert.equal(resolution.document.chronology_key,'1832-03-15');
 assert.deepEqual(resolution.units.filter(unit=>unit.unit_type==='paragraph').map(unit=>unit.original_label),['Α΄','Β΄','Γ΄','Δ΄','Ε΄','Ϛ΄','Ζ΄']);
 assert.deepEqual(resolution.units[1].source_pages,[21,22]);
 assert.match(resolution.units.at(-1).text,/15 Μαρτίου 1832/);
 assert.deepEqual(resolution.references.map(ref=>ref.target_canonical_id),[
  'national_assembly_resolution:argos:β:1829',constitutionId,constitutionId+':article:81'
 ]);
});

test('chronological archives preserve the date of an act separately from its later source edition',()=>{
 const samos=buildHistoricalGraph(entries.find(e=>e.id==='historical_act:samos:1821'));
 const west=buildHistoricalGraph(entries.find(e=>e.id==='historical_act:western_greece:1821'));
 assert.equal(samos.document.document_year,'1821');assert.equal(samos.document.source_edition_year,1881);
 assert.equal(west.document.chronology_key,'1821-11-09');assert.equal(west.document.source_edition_year,1839);
 assert.equal(samos.document.text_coverage,'excerpt');
 assert.deepEqual(samos.units.map(unit=>unit.navigation_number),['civil_system','general_administrator','civil_judges','secretary']);
 assert.deepEqual(samos.units[2].source_pages,[4,5]);
 assert.match(samos.units[2].text,/4\. Να καταγράφωσι/);
 assert.ok(samos.units.every(unit=>unit.unit_type==='body'&&unit.article_number===null));
 assert.equal(west.document.text_coverage,'scan_only');
});
test('the next Gazette preserves numbered and unnumbered decrees and evidence-backed oath links',()=>{
 const oath=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:1:1833'));
 assert.deepEqual(oath.units.map(u=>u.article_number),['1','2','3','4','5']);
 assert.deepEqual(oath.units[1].source_pages,[2,3]);
 assert.equal(oath.document.issued_at_gregorian,'1833-02-11');
 assert.equal(oath.references.length,2);assert.ok(oath.references.every(r=>r.target_canonical_id==='royal_decree:1:1833:article:1'));
 const circular=buildHistoricalGraph(entries.find(e=>e.id==='ministerial_circular:interior:4:1833'));
 assert.equal(circular.document.text_coverage,'excerpt');assert.equal(circular.references[0].target_canonical_id,oath.document.canonical_id);
 const ministries=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:state_secretaries:1833'));
 assert.deepEqual(ministries.units.map(u=>u.article_number),['α','β','γ','δ']);
 assert.equal(ministries.document.issued_at_gregorian,'1833-02-06');
 const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:2:1833'));
 assert.equal(issue.document.source_page_count,8);assert.equal(issue.document.published_at_gregorian,'1833-03-06');assert.equal(issue.units.length,0);
 const forged=structuredClone(entries.find(e=>e.id==='royal_decree:1:1833'));forged.verified_references[0].raw_text='not in the original';
 assert.throws(()=>buildHistoricalGraph(forged),/lacks source evidence/);
});

test('monetary regulation preserves all 22 articles, source figures and tables within their original articles',()=>{
 const entry=entries.find(e=>e.id==='royal_decree:monetary_system:1833'),graph=buildHistoricalGraph(entry);
 assert.deepEqual(graph.units.map(u=>u.article_number),Array.from({length:22},(_,i)=>String(i+1)));
 assert.equal(graph.document.text_coverage,'complete_greek_transcription');assert.equal(graph.document.issued_at_gregorian,'1833-02-20');
 assert.match(graph.units[5].text,/4,477/);assert.match(graph.units[8].text,/1,553/);
 assert.match(graph.units[15].text,/Πεντάφραγκον 5 Δραχ. 53 Λεπ./);
 assert.deepEqual(graph.units[17].source_pages,[7,8]);
 assert.equal(graph.units.some(u=>u.parent_id),false);assert.equal(new Set(graph.units.map(u=>u.id)).size,22);
 assert.match(graph.document.signature||graph.document.source_text,/Ο επί της Οικονομίας/);
 const broken=structuredClone(entry);broken.sections.splice(8,1);assert.throws(()=>buildHistoricalGraph(broken),/sequence mismatch/);
});

test('territorial declaration preserves its unnumbered body and the identities of pending treaty targets',()=>{
 const graph=buildHistoricalGraph(entries.find(e=>e.id==='royal_proclamation:territorial_possession:1833'));
 assert.equal(graph.units.length,1);assert.equal(graph.units[0].unit_type,'body');assert.equal(graph.units[0].article_number,null);
 assert.deepEqual(graph.units[0].source_pages,[4,5]);assert.equal(graph.document.issued_at_gregorian,'1833-02-22');
 assert.equal(graph.references.length,4);
 assert.deepEqual(graph.references.filter(r=>r.document_type==='international_treaty'&&r.article).map(r=>r.target_canonical_id),['international_treaty:london:7_may:1832:article:4','international_treaty:london:7_may:1832:article:5']);
 assert.ok(graph.references.every(r=>graph.units[0].text.includes(r.raw_text)&&r.from_unit_id===graph.units[0].id));
});

test('third Gazette separates an 1824 penal excerpt from its 1833 republication and links the monetary regulation',()=>{
 const entry=entries.find(e=>e.id==='legal_code:criminal_anthology:1824'),graph=buildHistoricalGraph(entry);
 assert.equal(graph.document.document_year,'1824');assert.equal(graph.document.source_edition_year,1833);assert.equal(graph.document.fek_year,'1833');
 assert.equal(graph.document.text_coverage,'excerpt');assert.deepEqual(graph.units.map(u=>u.article_number),['ια','ιβ','ιγ','ιδ','ιε','ις','ιζ']);
 assert.equal(graph.units.every(u=>u.source_page===7),true);assert.match(graph.units[5].text,/ειδοποιήση περί τούτου/);
 const money=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:monetary_system:1833'));
 assert.equal(money.references[0].target_canonical_id,entry.id);assert.equal(money.references[0].from_unit_id,'royal_decree:monetary_system:1833:article:1');
 const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:3:1833'));assert.equal(issue.document.published_at_gregorian,'1833-03-12');assert.equal(issue.units.length,0);
});

test('property acts preserve unnumbered lists and exact links, while monetary table coverage stays explicit',()=>{
 const property=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:948:1833'));
 assert.equal(property.units.length,1);assert.equal(property.units[0].unit_type,'body');assert.deepEqual(property.units[0].source_pages,[7,8]);assert.equal(property.units[0].article_number,null);
 assert.match(property.units[0].text,/ι΄\. Το όνομα/);assert.equal(property.document.issued_at_gregorian,'1833-02-18');
 const notice=buildHistoricalGraph(entries.find(e=>e.id==='ministerial_proclamation:finance:154:1833'));
 assert.equal(notice.references[0].target_canonical_id,'royal_decree:948:1833');assert.equal(notice.document.issued_at_gregorian,'1833-02-23');
 const valuation=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:foreign_coin_valuation:1833'));
 assert.equal(valuation.document.text_coverage,'excerpt');assert.equal(valuation.units.length,1);assert.equal(valuation.units[0].article_number,null);
 const circle=buildHistoricalGraph(entries.find(e=>e.id==='ministerial_circular:finance:monetary_system:1833'));
 assert.deepEqual(circle.references.map(r=>r.document_number),['966','980']);assert.deepEqual(circle.references.map(r=>r.target_canonical_id),['royal_decree:monetary_system:1833','royal_decree:foreign_coin_valuation:1833']);
 assert.equal(circle.document.text_coverage,'excerpt');assert.equal(circle.units[0].source_page,4);
});

test('fourth Gazette preserves forty source articles across five separate acts and the printed issue date',()=>{
 const sizes={'royal_decree:amnesty:1833':3,'royal_decree:public_security:1833':11,'royal_decree:firearms_licences:1833':18,'royal_decree:three_courts_jurisdiction:1833':3,'royal_decision:three_courts_appointments:1833':5};
 let count=0;for(const [id,size] of Object.entries(sizes)){const g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.deepEqual(g.units.map(u=>u.article_number),Array.from({length:size},(_,i)=>String(i+1)));assert.equal(g.document.text_coverage,'complete_greek_transcription');count+=g.units.length;}
 assert.equal(count,40);
 const amnesty=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:amnesty:1833'));
 assert.match(amnesty.units[0].text,/Δίδομεν γενικήν αμνηστείαν/);assert.match(amnesty.units[0].text,/25 Ιανουαρίου/);assert.equal(amnesty.document.issued_at_gregorian,'1833-02-21');
 const permit=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:firearms_licences:1833'));
 assert.deepEqual(permit.units[4].source_pages,[4,5]);assert.deepEqual(permit.units[15].source_pages,[6,7]);assert.match(permit.units[10].text,/δι’ έν έτος/);assert.equal(permit.units[10].article_number,'11');
 const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:4:1833'));assert.equal(issue.units.length,0);assert.equal(issue.document.published_at_julian,'1833-03-04');assert.equal(issue.document.published_at_gregorian,'1833-03-16');
});

test('licensing and court references preserve the Greek source target even where the German column differs',()=>{
 const permit=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:firearms_licences:1833'));
 assert.equal(permit.references.find(r=>r.from_unit_id.endsWith(':article:14')).target_canonical_id,'royal_decree:firearms_licences:1833:article:7');assert.match(permit.document.transcription_note,/γερμανική στο άρθρο 8/);
 assert.equal(permit.references.find(r=>r.from_unit_id.endsWith(':article:2')).target_canonical_id,'royal_decree:firearms_licences:1833:article:5');
 assert.equal(permit.references.filter(r=>r.document_canonical_id==='royal_decree:public_security:1833').length,2);
 const courts=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:three_courts_jurisdiction:1833'));
 assert.deepEqual(courts.references.map(r=>r.article),['7','8','9']);assert.ok(courts.references.every(r=>r.document_canonical_id==='royal_decree:public_security:1833'));
 const appointments=buildHistoricalGraph(entries.find(e=>e.id==='royal_decision:three_courts_appointments:1833'));
 assert.deepEqual(appointments.references.map(r=>r.document_canonical_id),['royal_decree:public_security:1833','royal_decree:three_courts_jurisdiction:1833']);assert.equal(appointments.units.length,5);assert.match(appointments.units[0].text,/Ανδρέας Λόντας/);
});


test('fifth Gazette retains establishment tables within article 3 and unnumbered formation acts',()=>{
 const army=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:army_organisation:1833'));
 assert.deepEqual(army.units.map(u=>u.article_number),Array.from({length:22},(_,i)=>String(i+1)));
 assert.deepEqual(army.units[2].source_pages,[1,2,3]);assert.deepEqual(army.units[6].source_pages,[3,4]);assert.deepEqual(army.units[14].source_pages,[4,5]);assert.deepEqual(army.units[18].source_pages,[5,6]);
 assert.match(army.units[2].text,/132 Εν όλοις/);assert.match(army.units[2].text,/86 Εν όλοις/);assert.match(army.document.transcription_note,/παραρτήματα Α και Β δεν περιλαμβάνονται/);
 assert.equal(army.references[0].target_canonical_id,army.document.canonical_id+':article:13');assert.equal(army.document.issued_at_gregorian,'1833-03-09');
 const transport=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:transport_company:1833'));
 assert.equal(transport.units.length,1);assert.equal(transport.units[0].unit_type,'body');assert.equal(transport.units[0].article_number,null);assert.equal(transport.references[0].target_canonical_id,army.document.canonical_id+':article:3');assert.match(transport.references[0].raw_text,/Γ΄ § 4/);
 const cavalry=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:lancer_regiment:1833'));
 assert.equal(cavalry.units.length,1);assert.deepEqual(cavalry.units[0].source_pages,[6,7,8]);assert.match(cavalry.units[0].text,/Το Μητρώον του στρατού και των ίππων/);assert.match(cavalry.units[0].text,/9η του ισταμένου μηνός/);assert.equal(cavalry.references.length,0);assert.equal(cavalry.document.issued_at_gregorian,'1833-03-12');
 const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:5:1833'));assert.equal(issue.units.length,0);assert.equal(issue.document.published_at_julian,'1833-03-08');assert.equal(issue.document.published_at_gregorian,'1833-03-20');
});


test('sixth Gazette retains 18 articles and 15 primary sections with original dates and source tables',()=>{
 const dissolution=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:irregular_troops_dissolution:1833'));
 assert.deepEqual(dissolution.units.map(u=>u.article_number),Array.from({length:18},(_,i)=>String(i+1)));
 assert.deepEqual(dissolution.units[4].source_pages,[1,2]);assert.deepEqual(dissolution.units[12].source_pages,[3,4]);assert.deepEqual(dissolution.units[16].source_pages,[4,5]);
 assert.equal(dissolution.document.issued_at_gregorian,'1833-03-14');assert.match(dissolution.units[1].text,/1 Δεκεμβρίου 1831/);
 const rifle=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:rifle_battalions:1833'));
 assert.equal(rifle.document.primary_unit_type,'paragraph');assert.deepEqual(rifle.units.map(u=>u.paragraph_number),Array.from({length:15},(_,i)=>String(i+1)));assert.ok(rifle.units.every(u=>u.article_number===null&&u.parent_id===null));
 assert.deepEqual(rifle.units[4].source_pages,[6,7]);assert.deepEqual(rifle.units[10].source_pages,[7,8]);assert.match(rifle.units[4].text,/κατά μήνα 45 Δραχ/);assert.match(rifle.units[4].text,/καθ’ ημέραν 72 Λεπ/);assert.match(rifle.units[4].text,/703 γραμμάς/);assert.match(rifle.units[10].text,/Το περί ταύτης της επισήμου πράξεως πρωτόκολλον/);
 const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:6:1833'));assert.equal(issue.units.length,0);assert.equal(issue.document.published_at_julian,'1833-03-08');assert.equal(issue.document.published_at_gregorian,'1833-03-20');
});

test('sixth Gazette links exact provisions and preserves printed discrepancies without guessed targets',()=>{
 const dissolution=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:irregular_troops_dissolution:1833'));
 assert.equal(dissolution.references.length,19);assert.equal(dissolution.references.some(r=>r.from_unit_id.endsWith(':article:11')),false);
 assert.equal(dissolution.references.find(r=>r.document_canonical_id==='royal_decree:firearms_licences:1833').target_canonical_id,'royal_decree:firearms_licences:1833:article:15');assert.equal(dissolution.references.find(r=>r.document_canonical_id==='royal_decree:public_security:1833').article,'4');
 const rifle=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:rifle_battalions:1833'));
 assert.equal(rifle.references[0].target_canonical_id,dissolution.document.canonical_id+':article:5');assert.equal(rifle.references[1].target_canonical_id,rifle.document.canonical_id+':paragraph:11');assert.equal(rifle.references[1].paragraph,'11');assert.equal(rifle.references[1].article,null);assert.match(rifle.document.transcription_note,/πίνακας μισθών βρίσκεται στη § 5/);
 assert.match(rifle.document.source_text,/21 Φεβρουαρίου/);assert.equal(rifle.references.some(r=>r.document_canonical_id==='royal_decree:army_organisation:1833'),false);
});


test('seventh Gazette preserves infantry officer lists within nine source sections and their exact organisation links',()=>{
 const infantry=buildHistoricalGraph(entries.find(e=>e.id==='royal_decision:line_infantry_battalions:1833'));
 assert.equal(infantry.document.primary_unit_type,'paragraph');assert.equal(infantry.document.issued_at_gregorian,'1833-03-10');assert.deepEqual(infantry.units.map(u=>u.paragraph_number),Array.from({length:9},(_,i)=>String(i+1)));assert.ok(infantry.units.every(u=>u.article_number===null&&u.parent_id===null));assert.deepEqual(infantry.units[0].source_pages,[1,2]);assert.deepEqual(infantry.units[3].source_pages,[2,3]);assert.deepEqual(infantry.units[8].source_pages,[3,4]);
 assert.match(infantry.units[0].text,/Υπολοχαγός, ο Σταύρος Πούλος/);assert.match(infantry.document.transcription_note,/κενές θέσεις/);assert.equal(infantry.references.length,3);assert.equal(infantry.references[0].target_canonical_id,'royal_decree:army_organisation:1833:article:7');assert.ok(infantry.references.slice(1).every(r=>r.target_canonical_id==='royal_decree:army_organisation:1833'&&r.article===null));
});

test('military amnesty keeps its own identity, date and original three-section scope',()=>{
 const amnesty=buildHistoricalGraph(entries.find(e=>e.id==='royal_proclamation:military_deserters_amnesty:1833'));
 assert.equal(amnesty.document.document_type,'royal_proclamation');assert.equal(amnesty.document.issued_at_gregorian,'1833-03-19');assert.deepEqual(amnesty.units.map(u=>u.original_label),['1ον.','2ον.','3ον.']);assert.equal(amnesty.units.every(u=>u.source_page===4&&u.unit_type==='paragraph'),true);assert.match(amnesty.units[0].text,/έξ εβδομάδων/);assert.match(amnesty.units[1].text,/δεν εκτείνεται εις άλλα εγκλήματα/);assert.equal(amnesty.references.length,0);
 const previous=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:amnesty:1833'));assert.equal(previous.document.issued_at_gregorian,'1833-02-21');assert.notEqual(previous.document.canonical_id,amnesty.document.canonical_id);
 const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:7:1833'));assert.equal(issue.units.length,0);assert.equal(issue.document.published_at_julian,'1833-03-12');assert.equal(issue.document.published_at_gregorian,'1833-03-24');
});


test('eighth Gazette separates promised appendices from the parent act and declares salary-table coverage honestly',()=>{
 const a=buildHistoricalGraph(entries.find(e=>e.id==='legal_annex:army_organisation:A:1833'));
 assert.equal(a.units.length,0);assert.equal(a.document.text_coverage,'scan_only');assert.equal(a.document.issued_at_gregorian,'1833-03-09');assert.equal(a.document.published_at_gregorian,'1833-03-30');
 const b=buildHistoricalGraph(entries.find(e=>e.id==='legal_annex:army_organisation:B:1833'));
 assert.equal(b.document.text_coverage,'excerpt');assert.deepEqual(b.units.map(u=>u.paragraph_number),Array.from({length:14},(_,i)=>String(i+1)));assert.ok(b.units.every(u=>u.article_number===null&&u.parent_id===null));assert.match(b.document.transcription_note,/πίνακες μισθοδοσίας.*ΔΕΝ έχουν μεταγραφεί/);assert.equal(b.units[0].source_page,10);assert.equal(b.units[9].source_page,11);
 assert.match(b.units[8].text,/260 δράμια/);assert.match(b.units[10].text,/ε΄\. Αφού παρέλθη/);assert.match(b.units[13].text,/δεν λαμβάνουν πίστωσιν/);
 const parent=entries.find(e=>e.id==='royal_decree:army_organisation:1833');assert.ok(parent.related.includes(a.document.canonical_id));assert.ok(parent.related.includes(b.document.canonical_id));assert.equal(parent.sections.length,22);
});

test('cockade proportions and printed clarification and erratum targets retain their separate identities',()=>{
 const cockade=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:national_cockade:1833'));
 assert.deepEqual(cockade.units.map(u=>u.paragraph_number),['1','2','3']);assert.match(cockade.units[0].text,/δύο τριτημόρια/);assert.equal(cockade.document.issued_at_gregorian,'1833-03-14');
 const clarification=buildHistoricalGraph(entries.find(e=>e.id==='ministerial_clarification:irregular_troops_dissolution:1833'));
 assert.equal(clarification.units[0].unit_type,'body');assert.equal(clarification.references[0].target_canonical_id,'royal_decree:irregular_troops_dissolution:1833:article:1');assert.equal(clarification.document.issued_at_gregorian,'1833-03-26');
 const erratum=buildHistoricalGraph(entries.find(e=>e.id==='gazette_erratum:three_courts_jurisdiction:1833'));
 assert.match(erratum.units[0].text,/Σελ\. 27, Στήλ\. 1, Στίχ\. 28/);assert.match(erratum.units[0].text,/ανάγνωθι περιεχόμενα/);assert.equal(erratum.references[0].target_canonical_id,'royal_decree:three_courts_jurisdiction:1833:article:1');
 const court=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:three_courts_jurisdiction:1833'));assert.match(court.units[0].text,/τα πραττόμενα εντός/);assert.match(court.document.transcription_note,/αντί «πραττόμενα» διαβάζεται «περιεχόμενα»/);
 const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:8:1833'));assert.equal(issue.document.published_at_gregorian,'1833-03-30');assert.equal(issue.document.source_page_count,12);assert.equal(issue.units.length,0);
});

test('ninth Gazette keeps the seven officers-claims articles and appointments within their source scope',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:irregular_officers_claims:1833'));
 assert.deepEqual(g.units.map(u=>u.article_number),['1','2','3','4','5','6','7']);assert.equal(g.document.issued_at_gregorian,'1833-03-25');assert.deepEqual(g.units[1].source_pages,[1,2]);assert.deepEqual(g.units[6].source_pages,[2,3]);
 assert.match(g.units[1].text,/εντός δύο μηνών/);assert.match(g.units[1].text,/ς΄ Περί της οικειακής/);assert.match(g.units[5].text,/Αλ\. Βλαχόπουλον/);assert.match(g.document.transcription_note,/Art\. IV\./);
 assert.equal(g.references.length,1);assert.equal(g.references[0].from_unit_id,g.units[3].id);assert.equal(g.references[0].target_canonical_id,g.units[2].id);
});

test('public-order proclamation separates the two February ninth acts without inventing provisions or an 1824 target',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='ministerial_proclamation:public_order_measures:1833'));
 assert.equal(g.units.length,1);assert.equal(g.units[0].unit_type,'body');assert.equal(g.units[0].article_number,null);assert.deepEqual(g.units[0].source_pages,[3,4]);assert.equal(g.document.issued_at_gregorian,'1833-03-21');
 assert.deepEqual(g.references.map(r=>r.target_canonical_id),['royal_decree:amnesty:1833','royal_decree:public_security:1833','royal_decree:firearms_licences:1833','royal_decree:three_courts_jurisdiction:1833']);assert.notEqual(g.references[0].raw_text,g.references[1].raw_text);assert.match(g.units[0].text,/νόμον της 1 Ιουλίου 1824/);assert.ok(g.references.every(r=>r.document_year==='1833'&&r.article===null));
 const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:9:1833'));assert.equal(issue.units.length,0);assert.equal(issue.document.published_at_julian,'1833-03-22');assert.equal(issue.document.published_at_gregorian,'1833-04-03');assert.equal(issue.document.source_page_count,4);
});

test('tenth Gazette keeps five enforcement instructions as primary paragraphs and its distinct act date',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:irregular_troops_enforcement:1833'));
 assert.equal(g.document.primary_unit_type,'paragraph');assert.deepEqual(g.units.map(u=>u.paragraph_number),['1','2','3','4','5']);assert.ok(g.units.every(u=>u.article_number===null&&u.parent_id===null));assert.deepEqual(g.units[1].source_pages,[1,2]);assert.equal(g.document.issued_at_gregorian,'1833-03-21');assert.match(g.document.source_text,/από 6 \(18\) του ενεστώτος αποφάσεώς μας/);assert.match(g.units[2].text,/Βασιλικών Βαυαρικών/);assert.match(g.units[4].text,/παρουσίασιν του λογαριασμού/);assert.equal(g.references.length,0);
 const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:10:1833'));assert.equal(issue.document.published_at_julian,'1833-03-26');assert.equal(issue.document.published_at_gregorian,'1833-04-07');assert.equal(issue.units.length,0);assert.match(issue.document.transcription_note,/διορισμών δεν έχουν χωριστή μεταγραφή/);
});

test('hygiene decree preserves source fines and appeal limits with the correct same-date court target',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:public_hygiene_building_offences:1833'));
 assert.deepEqual(g.units.map(u=>u.article_number),Array.from({length:14},(_,i)=>String(i+1)));assert.ok(g.units.every(u=>u.parent_id===null));assert.equal(g.document.issued_at_gregorian,'1833-03-18');assert.deepEqual(g.units.map(u=>u.source_page),[2,2,3,3,3,3,3,3,3,4,4,4,4,4]);
 assert.match(g.units[5].text,/πενήντα έως διακοσίας Δραχμάς/);assert.match(g.units[5].text,/Αι δε τροφαί παραδίδονται εις φθοράν/);assert.match(g.units[7].text,/τριάντα έως εκατόν πενήντα/);assert.match(g.units[12].text,/υπερβαίνη τριών ημερών φυλακήν ή εκατόν Δραχμών/);assert.match(g.units[13].text,/τα ταμεία των κοινοτήτων/);
 assert.equal(g.references.length,1);assert.equal(g.references[0].from_unit_id,g.units[12].id);assert.equal(g.references[0].document_canonical_id,'royal_decree:public_security:1833');assert.equal(g.references[0].article,null);assert.equal(g.references[0].target_canonical_id,g.references[0].document_canonical_id);assert.ok(g.units[12].text.includes(g.references[0].raw_text));
});

test('eleventh Gazette keeps commanders and commissions unnumbered and joins the school text across three source pages',()=>{
 const majors=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:rifle_battalion_commanders:1833'));
 const schools=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:school_organisation_commission:1833'));
 const church=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:church_monasteries_commission:1833'));
 for(const g of [majors,schools,church]){assert.equal(g.units.length,1);assert.equal(g.units[0].unit_type,'body');assert.equal(g.units[0].article_number,null);assert.equal(g.document.text_coverage,'complete_greek_transcription');}
 assert.match(majors.units[0].text,/10 Ιωαν\. Βελέντζαν/);assert.equal(majors.document.issued_at_gregorian,'1833-03-26');assert.deepEqual(schools.units[0].source_pages,[2,3,4]);assert.match(schools.units[0].text,/ενός Πανεπιστημίου/);assert.match(schools.units[0].text,/να συναχθώσιν εις Ναύπλιον/);assert.doesNotMatch(schools.units[0].text,/Πρόξενοι|Πρακτόρων/);assert.equal(schools.document.issued_at_gregorian,'1833-04-03');assert.match(church.units[0].text,/Πανούτσον Νοταράν/);assert.equal(church.document.issued_at_gregorian,'1833-03-27');
});

test('consular-notice excerpt leaves its directory outside the text and preserves the treaty identity now resolved by Gazette eighteen',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='ministerial_notice:reciprocal_consular_assistance:1833'));
 assert.equal(g.units.length,1);assert.equal(g.document.text_coverage,'excerpt');assert.match(g.document.transcription_note,/χωρίς τις γραμμές του πίνακα/);assert.doesNotMatch(g.units[0].text,/Μάλτα|Πετρούπολις/);assert.equal(g.references.length,1);assert.equal(g.references[0].target_canonical_id,'treaty:greek_bavarian_consular_assistance:1832');assert.equal(g.references[0].document_year,'1832');assert.equal(g.references[0].article,null);assert.ok(g.units[0].text.includes(g.references[0].raw_text));assert.equal(entries.some(e=>e.id===g.references[0].target_canonical_id),true);
 const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:11:1833'));assert.equal(issue.units.length,0);assert.equal(issue.document.published_at_julian,'1833-03-31');assert.equal(issue.document.published_at_gregorian,'1833-04-12');
});

test('twelfth Gazette preserves twenty articles and the printed province-count discrepancy without creating list units',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:kingdom_division_administration:1833'));
 assert.deepEqual(g.units.map(u=>u.article_number),Array.from({length:20},(_,i)=>String(i+1)));assert.ok(g.units.every(u=>u.parent_id===null));assert.equal(g.document.issued_at_gregorian,'1833-04-15');assert.match(g.units[0].text,/δέκα Νομούς και 42 επαρχίας/);
 const sizes=g.units.slice(2,12).map(u=>[...u.text.matchAll(/^\d+\./gm)].length);assert.deepEqual(sizes,[6,4,5,4,4,5,4,5,3,7]);assert.equal(sizes.reduce((a,b)=>a+b,0),47);assert.match(g.document.transcription_note,/συνολικά 47/);assert.deepEqual(g.units[1].source_pages,[3,4]);assert.deepEqual(g.units[4].source_pages,[4,5]);assert.deepEqual(g.units[7].source_pages,[5,6]);assert.deepEqual(g.units[9].source_pages,[6,7]);assert.deepEqual(g.units[12].source_pages,[7,8]);assert.doesNotMatch(g.units[11].text,/Πρωτεύουσα Νάξος/);
});

test('administration article twenty links only the explicit Greek article numbers despite the German range',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:kingdom_division_administration:1833'));
 assert.equal(g.references.length,2);assert.deepEqual(g.references.map(r=>r.article),['14','19']);assert.ok(g.references.every(r=>r.from_unit_id===g.units[19].id&&r.raw_text==='των άρθρων 14, 19'));assert.deepEqual(g.references.map(r=>r.target_canonical_id),[g.units[13].id,g.units[18].id]);assert.match(g.document.transcription_note,/Art\. 14 bis 19/);assert.match(g.units[14].text,/Συμβούλιον της Επικρατείας/);assert.match(g.units[17].text,/Δημογεροντικόν Συμβούλιον/);
});

test('ministerial decisions retain separate body identities and leave the faded Trikoupis original scan-only',()=>{
 const ids=['mavrocordatos_finance_war','praides_justice','psyllas_interior','kolettis_navy','praides_interim_interior'];
 const graphs=ids.map(slug=>buildHistoricalGraph(entries.find(e=>e.id==='royal_decision:'+slug+':1833')));
 for(const g of graphs){assert.equal(g.units.length,1);assert.equal(g.units[0].unit_type,'body');assert.equal(g.units[0].article_number,null);assert.equal(g.document.issued_at_gregorian,'1833-04-15');assert.equal(g.references.length,0);}
 assert.deepEqual(graphs[0].units[0].source_pages,[1,2]);assert.match(graphs[0].units[0].text,/προσωρινώς την διεύθυνσιν/);assert.match(graphs[4].units[0].text,/μέχρι της ελεύσεως του Κυρίου Γ\. Ψύλλα/);
 const faded=buildHistoricalGraph(entries.find(e=>e.id==='royal_decision:trikoupis_state_secretary:1833'));assert.equal(faded.document.text_coverage,'scan_only');assert.equal(faded.document.source_text,null);assert.equal(faded.units.length,0);assert.match(faded.document.transcription_note,/δεν ανασυντίθεται ελληνικό/);
 const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:12:1833'));assert.equal(issue.document.published_at_julian,'1833-04-06');assert.equal(issue.document.published_at_gregorian,'1833-04-18');assert.equal(issue.units.length,0);
});

test('thirteenth Gazette keeps the ministry formation and foreign-affairs article scopes separate',()=>{
 const formation=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:ministries_formation:1833'));const foreign=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:royal_house_foreign_affairs:1833'));
 assert.deepEqual(formation.units.map(u=>u.article_number),Array.from({length:13},(_,i)=>String(i+1)));assert.deepEqual(formation.units[7].source_pages,[2,3]);assert.deepEqual(formation.units[11].source_pages,[3,4]);assert.match(formation.units[0].text,/επτά Γραμματείαι/);assert.match(formation.units[5].text,/η΄\./);assert.equal(formation.references.length,0);
 assert.deepEqual(foreign.units.map(u=>u.article_number),['1','2','3']);assert.deepEqual(foreign.units[0].source_pages,[7,8]);assert.match(foreign.units[0].text,/Τρεις Γραμματείς/);assert.match(foreign.units[2].text,/ια΄\. Η επιστασία/);assert.equal(foreign.references.length,0);assert.ok([...formation.units,...foreign.units].every(u=>u.parent_id===null));
});

test('office procedure preserves the missing article sixteen and the explicit Greek companion-article target',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:ministries_office_procedure:1833'));
 assert.equal(g.document.text_coverage,'excerpt');assert.equal(g.document.original_provision_count,18);assert.deepEqual(g.units.map(u=>u.article_number),Array.from({length:18},(_,i)=>String(i+1)).filter(n=>n!=='16'));assert.deepEqual(g.units.find(u=>u.article_number==='12').source_pages,[5,6]);assert.match(g.document.transcription_note,/άρθρο 16/);assert.match(g.document.source_text,/Ανατίθεται εις τους ημετέρους/);
 assert.equal(g.references.length,4);assert.deepEqual(g.references.slice(0,2).map(r=>r.target_canonical_id),[g.document.canonical_id+':article:2',g.document.canonical_id+':article:2']);assert.equal(g.references[2].target_canonical_id,'royal_decree:ministries_formation:1833:article:7');assert.match(g.document.transcription_note,/άρθρο VI/);assert.equal(g.references[3].target_canonical_id,'legal_annex:ministries_office_procedure:A:1833');assert.ok(g.references.every(r=>g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)));
});

test('protocol form remains a separate scan rather than invented table articles and keeps the issue date',()=>{
 const annex=buildHistoricalGraph(entries.find(e=>e.id==='legal_annex:ministries_office_procedure:A:1833'));assert.equal(annex.document.text_coverage,'scan_only');assert.equal(annex.units.length,0);assert.equal(annex.references.length,0);assert.equal(annex.document.source_text,null);assert.match(annex.document.transcription_note,/ενδεικτικές γραμμές/);
 const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:13:1833'));assert.equal(issue.document.published_at_julian,'1833-04-10');assert.equal(issue.document.published_at_gregorian,'1833-04-22');assert.equal(issue.units.length,0);
});

test('fourteenth Gazette keeps Justice Greek article boundaries and the Finance competency list within article two',()=>{
 const justice=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:justice_ministry_organisation:1833'));const finance=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:finance_ministry_organisation:1833'));
 for(const g of [justice,finance]){assert.equal(g.document.text_coverage,'complete_greek_transcription');assert.deepEqual(g.units.map(u=>u.article_number),['1','2','3']);assert.ok(g.units.every(u=>u.parent_id===null));assert.equal(g.references.length,0);}
 assert.deepEqual(justice.units[1].source_pages,[1,2]);assert.match(justice.units[1].text,/θ΄\)/);assert.match(justice.units[2].text,/απέχει αυστηρώς από πάσαν παρέμβασιν/);assert.match(justice.document.transcription_note,/Art\. III/);
 assert.deepEqual(finance.units[1].source_pages,[7,8]);assert.equal([...finance.units[1].text.matchAll(/^[α-ω]+΄\)/gm)].length,19);assert.match(finance.units[1].text,/κυνηγεσίων/);assert.match(finance.document.transcription_note,/Salzaeraren/);assert.match(finance.units[2].text,/ανεξαρτησίαν της/);
});

test('Interior excerpt preserves the article-two gap and the distinct military ministry target resolved by the next Gazette',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:interior_ministry_organisation:1833'));
 assert.equal(g.document.text_coverage,'excerpt');assert.equal(g.document.original_provision_count,4);assert.deepEqual(g.units.map(u=>u.article_number),['1','3','4']);assert.match(g.document.transcription_note,/άρθρο 2/);assert.equal(g.references.length,1);assert.equal(g.references[0].from_unit_id,g.units[1].id);assert.equal(g.references[0].target_canonical_id,'royal_decree:war_ministry_organisation:1833');assert.ok(g.units[1].text.includes(g.references[0].raw_text));assert.equal(entries.some(e=>e.id===g.references[0].target_canonical_id),true);assert.notEqual(g.references[0].target_canonical_id,'royal_decree:army_organisation:1833');
});

test('Church and Education excerpt keeps Greek article letters and does not imply the omitted article is transcribed',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:church_education_ministry_organisation:1833'));
 assert.equal(g.document.text_coverage,'excerpt');assert.equal(g.document.original_provision_count,3);assert.deepEqual(g.units.map(u=>u.article_number),['α','γ']);assert.deepEqual(g.units.map(u=>u.original_label),['Άρθρ. Α.','Άρθρ. Γ.']);assert.match(g.document.transcription_note,/άρθρο Β΄ παραμένει στο PDF/);assert.equal(g.references.length,0);assert.match(g.units[1].text,/δημοσίαν εκπαίδευσιν/);
 const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:14:1833'));assert.equal(issue.units.length,0);assert.equal(issue.document.published_at_julian,'1833-04-13');assert.equal(issue.document.published_at_gregorian,'1833-04-25');
});


test('fifteenth Gazette preserves military and naval Greek article scopes and the conflicting printed dates',()=>{
 const war=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:war_ministry_organisation:1833'));const navy=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:navy_ministry_organisation:1833'));
 assert.equal(war.document.text_coverage,'excerpt');assert.equal(war.document.original_provision_count,2);assert.deepEqual(war.units.map(u=>u.article_number),['2']);assert.deepEqual(war.units[0].source_pages,[1,2]);assert.match(war.units[0].text,/ις΄\)/);assert.match(war.units[0].text,/χωροφυλακαί/);assert.match(war.document.transcription_note,/Art\. III/);
 assert.deepEqual(navy.units.map(u=>u.article_number),['1','2','3']);assert.deepEqual(navy.units.map(u=>u.source_page),[2,3,3]);assert.match(navy.units[1].text,/ια΄\)/);assert.equal(navy.document.issued_at_gregorian,'1833-04-15');
 const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:15:1833'));assert.equal(issue.units.length,0);assert.equal(issue.document.date_basis,'printed_dates_disagree');assert.equal(issue.document.published_at_julian,'1833-04-19');assert.equal(issue.document.published_at_gregorian,'1833-04-28');assert.match(issue.document.publication_label,/ασυμφωνία/);
});

test('saltworks keeps original lettered primary paragraphs and exact targets even across declared gaps',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:national_saltworks_administration:1833'));
 assert.equal(g.document.primary_unit_type,'paragraph');assert.equal(g.document.original_provision_count,21);assert.equal(g.document.text_coverage,'excerpt');assert.deepEqual(g.units.map(u=>u.paragraph_number),['α','β','γ','δ','ε','ς','ζ','η','ια','ιβ','ιγ','ιδ','ιε','ιη','ιθ','κ','κα']);assert.ok(g.units.every(u=>u.article_number===null&&u.parent_id===null));assert.match(g.units[2].text,/20 οκάδων/);assert.match(g.units.find(u=>u.paragraph_number==='ιδ').text,/οκτώ Λεπτά/);
 assert.equal(g.references.length,5);assert.deepEqual(g.references.map(r=>r.paragraph),['β','θ','ιζ','ιβ','ιζ']);assert.equal(g.references.every(r=>g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)),true);assert.equal(g.units.some(u=>u.id===g.references[1].target_canonical_id),false);assert.equal(g.references[3].target_canonical_id,g.units.find(u=>u.paragraph_number==='ιβ').id);
});

test('revenue and inspector dates and foreign quoted articles remain separate from publication and local units',()=>{
 const r=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:revenue_collection:1833'));assert.equal(r.document.primary_unit_type,'paragraph');assert.deepEqual(r.units.map(u=>u.paragraph_number),Array.from({length:11},(_,i)=>String(i+1)));assert.deepEqual(r.units[8].source_pages,[6,7]);assert.match(r.units[6].text,/έξ ίσας προθεσμίας/);assert.equal(r.document.issued_at_gregorian,'1833-04-27');
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:army_general_inspector:1833'));assert.deepEqual(g.units.map(u=>u.article_number),['1','2','3','4','5','6','7']);assert.equal(g.document.chronology_key,'1833-02-21');assert.deepEqual(g.units[4].source_pages,[7,8]);assert.match(g.units[4].text,/δις κατ’ έτος/);assert.equal(g.references.length,0);
 const n=buildHistoricalGraph(entries.find(e=>e.id==='ministerial_notice:two_sicilies_grain_duties:1833'));assert.equal(n.units.length,1);assert.equal(n.units[0].unit_type,'body');assert.match(n.units[0].text,/Άρθρον 1/);assert.match(n.units[0].text,/Άρθ\. 2/);assert.equal(n.references[0].target_canonical_id,'foreign_decree:two_sicilies_grain_import_duties:1833');assert.equal(entries.some(e=>e.id===n.references[0].target_canonical_id),false);
});

test('sixteenth Gazette links the original court and firearms provisions without inventing local articles',()=>{
 const j=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:euboea_northern_islands_jurisdiction:1833'));const f=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:firearms_guarantee_fees:1833'));
 for(const g of [j,f]){assert.equal(g.units.length,1);assert.equal(g.units[0].unit_type,'body');assert.equal(g.document.text_coverage,'complete_greek_transcription');assert.equal(g.units[0].article_number,null);}
 assert.match(j.document.title_official,/Βόρειοι Κυκλάδες/);assert.match(j.units[0].text,/βόρειοι Σποράδες/);assert.equal(j.references[0].target_canonical_id,'royal_decree:public_security:1833:article:7');assert.equal(j.document.issued_at_gregorian,'1833-05-05');
 assert.deepEqual(f.units[0].source_pages,[1,2]);assert.match(f.units[0].text,/30 Λεπτά δι’ ολικά έξοδα/);assert.equal(f.references[0].target_canonical_id,'royal_decree:firearms_licences:1833:article:7');assert.equal(f.document.issued_at_gregorian,'1833-05-03');
});

test('customs Greek articles and naval primary paragraphs retain the source boundaries and exact older targets',()=>{
 const c=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:liberated_territories_customs:1833'));assert.deepEqual(c.units.map(u=>u.article_number),['1','2','3']);assert.equal(c.document.issued_at_gregorian,'1833-04-06');assert.match(c.units[1].text,/5 \(17\) Απριλίου/);assert.match(c.units[2].text,/δέκα Λεπτά την οκάν/);assert.match(c.document.transcription_note,/Art\. 4/);assert.equal(c.references.length,1);assert.equal(c.references[0].target_canonical_id,c.units[1].id);
 const n=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:naval_officers_claims_commission:1833'));assert.equal(n.document.primary_unit_type,'paragraph');assert.deepEqual(n.units.map(u=>u.paragraph_number),['1','2','3','4','5']);assert.ok(n.units.every(u=>u.parent_id===null&&u.article_number===null));assert.equal(n.units[0].source_page,2);assert.match(n.units[1].text,/1 Πού/);assert.match(n.units[1].text,/2 Αν/);assert.match(n.units[2].text,/μήνας τρεις/);assert.equal(n.references.length,5);assert.equal(n.references[0].target_canonical_id,'royal_decree:irregular_officers_claims:1833');assert.deepEqual(n.references.slice(1).map(r=>r.article),['2','3','4','7']);assert.ok(n.references.every(r=>n.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)));
});

test('copper exchange links all three monetary provisions while separate appointment bodies and conflicting dates remain intact',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:old_copper_exchange_extension:1833'));assert.equal(g.units.length,1);assert.deepEqual(g.units[0].source_pages,[3,4]);assert.match(g.units[0].text,/1 \(13\) Οκτωβρίου/);assert.match(g.units[0].text,/80 τοις %/);assert.deepEqual(g.references.map(r=>r.article),['18','14','21']);assert.ok(g.references.every(r=>r.document_canonical_id==='royal_decree:monetary_system:1833'));assert.equal(g.document.date_basis,'printed_act_dates_disagree');assert.equal(g.document.issued_at_julian,'1833-04-23');assert.equal(g.document.issued_at_gregorian,'1833-05-03');assert.match(g.document.transcription_note,/21 April \(3 Mai\)/);
 const p=buildHistoricalGraph(entries.find(e=>e.id==='royal_decision:ten_prefects_appointments:1833'));const a=buildHistoricalGraph(entries.find(e=>e.id==='royal_decision:metaxas_extraordinary_state_councillor:1833'));assert.equal(p.units.length,1);assert.equal(a.units.length,1);assert.equal([...p.units[0].text.matchAll(/^\d+ Νομάρχην/gm)].length,10);assert.match(p.units[0].text,/5 Νομάρχην της Λακωνίας/);assert.match(a.units[0].text,/εις έκτακτον υπηρεσίαν/);assert.equal(p.references.length+a.references.length,0);
 const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:16:1833'));assert.equal(issue.units.length,0);assert.equal(issue.document.published_at_julian,'1833-04-28');assert.equal(issue.document.published_at_gregorian,'1833-05-10');assert.equal(issue.document.source_page_count,4);
});

test('seventeenth Gazette prefect decree retains all 30 original articles, complete internal lists and cross-page boundaries',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:prefects_powers_office_procedure:1833'));assert.equal(g.document.text_coverage,'complete_greek_transcription');assert.equal(g.document.original_provision_count,30);assert.deepEqual(g.units.map(u=>u.article_number),Array.from({length:30},(_,i)=>String(i+1)));assert.ok(g.units.every(u=>u.parent_id===null&&u.unit_type==='article'));
 for(const [n,pages] of [['4',[1,2]],['10',[3,4]],['16',[11,12]],['24',[12,13]],['30',[13,14]]])assert.deepEqual(g.units.find(u=>u.article_number===n).source_pages,pages);
 assert.deepEqual(g.units[10].source_pages,[4,5,6,7,8]);assert.deepEqual(g.units[11].source_pages,[8,9,10]);assert.deepEqual([...g.units[10].text.matchAll(/^(\d+)\./gm)].map(m=>Number(m[1])),Array.from({length:72},(_,i)=>i+1));assert.deepEqual([...g.units[11].text.matchAll(/^(\d+)\./gm)].map(m=>Number(m[1])),Array.from({length:30},(_,i)=>i+1));assert.match(g.units[10].text,/ληξ|γεννώνται/);assert.match(g.units[11].text,/βιβλιοθηκών/);assert.equal([...g.units.find(u=>u.article_number==='10').text.matchAll(/^\d+\./gm)].length,6);assert.match(g.units.find(u=>u.article_number==='24').text,/Ο Νομάρχης/);assert.equal(g.document.issued_at_gregorian,'1833-05-08');
});

test('prefect source references distinguish formation from procedure and do not borrow a German-only article number',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:prefects_powers_office_procedure:1833'));assert.equal(g.references.length,5);assert.equal(g.references[0].target_canonical_id,'royal_decree:ministries_formation:1833:article:12');assert.ok(g.references.slice(1,3).every(r=>r.target_canonical_id==='royal_decree:ministries_office_procedure:1833'&&r.article===null));assert.ok(g.references.slice(3).every(r=>r.target_canonical_id===g.document.canonical_id+':article:24'));assert.ok(g.references.every(r=>g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)));
});

test('civil-service oath and salary rows keep article scopes, annual amounts and exact existing links',()=>{
 const s=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:civil_service_appointments_oath_salary:1833'));assert.deepEqual(s.units.map(u=>u.article_number),['1','2','3','4','5','6','7']);assert.match(s.units[0].text,/100 Δραχμών/);assert.match(s.units[1].text,/Ορκίζομαι/);assert.match(s.units[1].text,/μυστικής αγνώστου/);assert.equal(s.references[0].target_canonical_id,s.units[1].id);assert.equal(s.document.issued_at_gregorian,'1833-05-06');assert.doesNotMatch(s.document.source_text,/Γ\. ΠΡΑΪΔΗΣ/);
 const w=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:administrative_authorities_salaries:1833'));assert.deepEqual(w.units.map(u=>u.article_number),['1','2','3']);assert.equal([...w.units[0].text.matchAll(/^\d+\./gm)].length,7);assert.match(w.units[0].text,/12000/);assert.match(w.units[0].text,/4200/);assert.match(w.units[0].text,/εξακοσίας κατ’ έτος/);assert.match(w.units[0].text,/τριακοσίων κατ’ έτος/);assert.match(w.units[2].text,/κατά μήνα εις το τέλος του μηνός/);assert.equal(w.references[0].target_canonical_id,'royal_decree:ministries_office_procedure:1833:article:2');assert.equal(w.references[1].target_canonical_id,w.units[0].id);assert.equal(w.units[2].source_page,16);
});

test('complete revenue appointment notice preserves its ten directory groups and pending 3648 identity',()=>{
 const n=buildHistoricalGraph(entries.find(e=>e.id==='appointment_notice:revenue_commissioners:1833'));assert.equal(n.document.document_type,'appointment_notice');assert.equal(n.document.text_coverage,'complete_greek_transcription');assert.equal(n.units.length,1);assert.equal(n.units[0].unit_type,'body');assert.match(n.units[0].text,/3648/);assert.match(n.units[0].text,/Σωτήριος Βαλτινός/);assert.equal([...n.units[0].text.matchAll(/^[Α-Ως]΄\./gm)].length,10);assert.equal([...n.units[0].text.matchAll(/^Νάξου,/gm)].length,1);assert.match(n.units[0].text,/ο Γενικός Έφορος Αντώνιος Αλεξόπουλος/);assert.equal(n.document.issued_at_julian,null);assert.equal(n.document.chronology_key,'1833-05-16');assert.equal(n.references[0].document_number,'3648');assert.equal(n.references[0].target_canonical_id,'royal_decree:3648:1833');assert.equal(entries.some(e=>e.id===n.references[0].target_canonical_id),false);
 const f=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:17:1833'));assert.equal(f.units.length,0);assert.equal(f.document.source_page_count,16);assert.equal(f.document.published_at_julian,'1833-05-04');assert.equal(f.document.published_at_gregorian,'1833-05-16');
});

test('eighteenth Gazette activates the old consular identity with all twelve articles and the separate original dates',()=>{
 const t=buildHistoricalGraph(entries.find(e=>e.id==='treaty:greek_bavarian_consular_assistance:1832'));assert.equal(t.document.document_year,'1832');assert.equal(t.document.fek_year,'1833');assert.equal(t.document.chronology_key,'1832-11-01');assert.equal(t.document.published_at_gregorian,'1833-05-30');assert.deepEqual(t.units.map(u=>u.article_number),Array.from({length:12},(_,i)=>String(i+1)));assert.deepEqual(t.units[4].source_pages,[2,3]);assert.deepEqual(t.units[9].source_pages,[3,4]);assert.match(t.units[10].text,/Πρόξενοι/);assert.match(t.units[10].text,/υπεράσπισιν και συνδρομήν/);assert.match(t.units[5].text,/3,500 άνδρας/);assert.match(t.units[6].text,/τρία έτη/);
 assert.equal(t.references.length,6);assert.deepEqual(t.references.filter(r=>r.document_canonical_id==='international_treaty:london:7_may:1832').map(r=>r.article),[null,'9','14','14']);assert.equal(t.references.at(-1).target_canonical_id,t.units[6].id);assert.ok(t.references.every(r=>t.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)));
 const n=buildHistoricalGraph(entries.find(e=>e.id==='ministerial_notice:greek_bavarian_treaty_publication:1833'));assert.equal(n.units.length,1);assert.equal(n.references[0].target_canonical_id,t.document.canonical_id);assert.equal(n.document.issued_at_gregorian,'1833-05-28');
 const r=buildHistoricalGraph(entries.find(e=>e.id==='royal_ratification:greek_bavarian_friendship_alliance:1832'));assert.equal(r.document.issued_at_gregorian,'1832-12-09');assert.equal(r.units.length,1);assert.equal(r.units[0].unit_type,'body');assert.match(r.units[0].text,/Επικυρούμεν/);assert.equal(r.references.length,0);
 const f=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:18:1833'));assert.equal(f.units.length,0);assert.equal(f.document.published_at_julian,'1833-05-18');assert.equal(f.document.published_at_gregorian,'1833-05-30');
});

test('nineteenth Gazette Order decree preserves all twelve articles and flags the absent design separately',()=>{
 const id='royal_decree:order_of_saviour_establishment:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.text_coverage,'complete_greek_transcription');assert.equal(g.document.original_provision_count,12);assert.deepEqual(g.units.map(u=>u.article_number),Array.from({length:12},(_,i)=>String(i+1)));assert.deepEqual(g.units[2].source_pages,[1,2]);assert.match(g.units[2].text,/Αργυρού Σταυρού.*απεριόριστος/s);assert.match(g.units[2].text,/Χρυσού Σταυρού περιορίζεται εις 120/);assert.match(g.units[4].text,/διάμετρος του σμάλτου είναι 7 εκατοστομέτρων/);assert.equal(g.document.issued_at_julian,'1833-05-20');assert.equal(g.document.issued_at_gregorian,'1833-06-01');assert.equal(g.references.length,2);assert.equal(g.references[0].target_canonical_id,'legal_annex:order_of_saviour_design:1833');assert.equal(entries.some(e=>e.id===g.references[0].target_canonical_id),false);assert.equal(g.references[1].target_canonical_id,g.units[3].id);assert.match(g.document.transcription_note,/δεν υπάρχει στις τέσσερις σελίδες/);
});

test('returning-soldiers amnesty keeps one original article and links both the earlier decree and its article six',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:returning_irregular_soldiers_amnesty:1833'));assert.equal(g.document.text_coverage,'complete_greek_transcription');assert.equal(g.units.length,1);assert.equal(g.units[0].article_number,'1');assert.equal(g.units[0].unit_type,'article');assert.deepEqual(g.units[0].source_pages,[4]);assert.equal([...g.units[0].text.matchAll(/^[αβγδ]΄\./gm)].length,4);assert.match(g.units[0].text,/3 \(15\) Ιουνίου/);assert.match(g.units[0].text,/δικαιωμάτων του άχρι τούδε ιδιοκτήτου/);assert.equal(g.document.issued_at_gregorian,'1833-06-01');assert.deepEqual(g.references.map(r=>r.target_canonical_id),['royal_decree:irregular_troops_dissolution:1833','royal_decree:irregular_troops_dissolution:1833:article:6']);assert.ok(g.references.every(r=>g.units[0].text.includes(r.raw_text)));const earlier=buildHistoricalGraph(entries.find(e=>e.id===g.references[0].target_canonical_id));assert.ok(earlier.units.some(u=>u.id===g.references[1].target_canonical_id));const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:19:1833'));assert.equal(issue.document.source_page_count,4);assert.equal(issue.document.text_coverage,'scan_only');assert.equal(issue.units.length,0);
});

test('twentieth Gazette recruitment treaty retains all 27 articles, original boundaries and distinct repeated links',()=>{
 const id='treaty:greek_bavarian_recruitment:1832',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.text_coverage,'complete_greek_transcription');assert.equal(g.document.original_provision_count,27);assert.deepEqual(g.units.map(u=>u.article_number),Array.from({length:27},(_,i)=>String(i+1)));for(const [n,pages] of [['2',[2,3]],['8',[3,4]],['12',[4,5]],['19',[5,6]],['24',[6,7]]])assert.deepEqual(g.units.find(u=>u.article_number===n).source_pages,pages);assert.match(g.units[0].text,/3500 στρατιώτας/);assert.match(g.units[5].text,/έτη τέσσαρα/);assert.match(g.units[24].text,/τρίμηνος μισθός/);assert.match(g.units[24].text,/διά έξ μήνας/);assert.equal(g.document.issued_at_gregorian,'1832-11-01');assert.equal(g.document.published_at_gregorian,'1833-06-10');assert.equal(g.references.length,10);const repeated=g.references.filter(r=>r.from_unit_id===id+':article:9');assert.equal(repeated.length,3);assert.equal(new Set(repeated.map(r=>r.raw_text)).size,3);assert.ok(repeated.every(r=>r.target_canonical_id===id+':article:8'));assert.ok(g.references.every(r=>g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)));
});

test('civil-service uniforms keep the five actual designs separate from the absent Order drawing',()=>{
 const id='royal_decree:civil_service_uniforms:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.deepEqual(g.units.map(u=>u.article_number),['1','2','3','4','5','6']);assert.deepEqual(g.units[1].source_pages,[12,13]);assert.deepEqual(g.units[2].source_pages,[13,14]);assert.equal(g.document.issued_at_gregorian,'1833-04-18');assert.match(g.units[1].text,/Α\. Ως μεγάλην στολήν/);assert.match(g.units[1].text,/Β\. Ως μικράν στολήν/);const design='legal_annex:civil_service_uniform_embroidery:1833';assert.equal(g.references.filter(r=>r.target_canonical_id===design).length,5);assert.deepEqual(g.references.filter(r=>r.article).map(r=>r.article),['2','2','5']);const a=buildHistoricalGraph(entries.find(e=>e.id===design));assert.equal(a.document.text_coverage,'scan_only');assert.equal(a.units.length,0);assert.match(a.document.transcription_note,/Δεν έχουν μεταγραφεί/);assert.equal(entries.some(e=>e.id==='legal_annex:order_of_saviour_design:1833'),false);
});

test('twentieth Gazette appointments preserve Greek-only rows and the repeated Cyclades row number',()=>{
 const e=buildHistoricalGraph(entries.find(e=>e.id==='royal_decision:eparchs_appointments:1833'));assert.equal(e.units.length,10);assert.equal(e.units.reduce((n,u)=>n+[...u.text.matchAll(/^\d+\./gm)].length,0),36);assert.equal([...e.units[4].text.matchAll(/^\d+\./gm)].length,2);assert.deepEqual([...e.units[9].text.matchAll(/^(\d+)\./gm)].map(m=>m[1]),['1','1','3','4','5','6']);assert.deepEqual(e.units[1].source_pages,[14,15]);assert.equal(e.document.issued_at_gregorian,'1833-05-14');const d=buildHistoricalGraph(entries.find(e=>e.id==='royal_decision:prefecture_directors_secretaries:1833'));assert.equal(d.units.length,2);assert.deepEqual(d.units.map(u=>[...u.text.matchAll(/^\d+\./gm)].length),[10,10]);assert.match(d.units[0].text,/Γουστάβον Βρέδεν/);assert.match(d.units[1].text,/Μεσσηνέζην/);
});

test('twentieth Gazette corrections link exact earlier acts without rewriting their original printing',()=>{
 const id='erratum:gazette_twenty_corrections:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.units.length,1);assert.equal(g.units[0].unit_type,'body');assert.equal(g.references.length,4);assert.equal(g.references[1].target_canonical_id,'royal_decree:prefects_powers_office_procedure:1833:article:15');assert.match(g.units[0].text,/Αθανάσιος Χατζόπουλος/);assert.match(g.units[0].text,/Άρθρ\. 2/);for(const r of g.references){const old=entries.find(e=>e.id===r.document_canonical_id);assert.ok(old);assert.ok(old.related.includes(id));assert.ok(old.transcription_note.includes('φύλλο 20'));assert.ok(g.units[0].text.includes(r.raw_text));}const amnesty=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:returning_irregular_soldiers_amnesty:1833'));assert.equal(amnesty.units.length,1);assert.match(amnesty.document.transcription_note,/Άρθρ\. 2/);const rat=buildHistoricalGraph(entries.find(e=>e.id==='royal_ratification:greek_bavarian_recruitment:1832'));assert.equal(rat.document.date_basis,'printed_act_dates_disagree');assert.equal(rat.document.issued_at_gregorian,'1832-12-09');for(const kind of ['pay','clothing']){const a=buildHistoricalGraph(entries.find(e=>e.id==='legal_annex:greek_bavarian_recruitment_'+kind+':1832'));assert.equal(a.units.length,0);assert.equal(a.document.source_page_count,18);assert.equal(a.document.text_coverage,'scan_only');}
});

test('twenty-first Gazette keeps all 34 gendarmerie articles, cross-page boundaries, oath and pay lists',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:gendarmerie_formation:1833'));assert.equal(g.document.text_coverage,'complete_greek_transcription');assert.equal(g.document.original_provision_count,34);assert.deepEqual(g.units.map(u=>u.article_number),Array.from({length:34},(_,i)=>String(i+1)));for(const [n,pages] of [['10',[2,3]],['18',[4,5]],['24',[5,6]],['33',[6,7]]])assert.deepEqual(g.units.find(u=>u.article_number===n).source_pages,pages);assert.match(g.units[2].text,/103 Ενωμοτάρχας/);assert.match(g.units[2].text,/120 Χωροφύλακας εφίππους/);assert.match(g.units[2].text,/800 όμ. πεζούς/);assert.equal([...g.units[11].text.matchAll(/^[ΑΒΓΔ]΄\./gm)].length,4);assert.match(g.units[16].text,/Ορκίζομαι και υπόσχομαι/);assert.match(g.units[22].text,/Συνάμα Δραχμ\. 522/);assert.match(g.units[23].text,/Συνάμα Δραχμ\. 300/);assert.match(g.units[25].text,/Συνάμα Δραχμ\. 150/);assert.match(g.units[26].text,/έφιππος Δραχμ\. 75/);assert.match(g.units[26].text,/πεζός 32/);assert.equal(g.document.date_basis,'greek_signature_month_incomplete_german_dual_date');assert.equal(g.document.issued_at_gregorian,'1833-06-01');assert.match(g.document.source_text,/20 \(1\) Ιουνίου 1833/);assert.match(g.document.transcription_note,/1 Juni \(20 Mai\) 1833/);
});

test('gendarmerie qualifications resolve exact older provisions and internal conditions without fake paragraph units',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:gendarmerie_formation:1833'));assert.equal(g.references.length,4);assert.equal(g.references[0].target_canonical_id,'royal_decree:army_organisation:1833:article:19');assert.equal(g.references[1].target_canonical_id,'royal_decree:irregular_troops_dissolution:1833');assert.ok(g.references.slice(2).every(r=>r.target_canonical_id===g.document.canonical_id+':article:8'&&r.paragraph===null));assert.ok(g.references.every(r=>g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)));assert.ok(g.units.every(u=>u.parent_id===null));const army=buildHistoricalGraph(entries.find(e=>e.id===g.references[0].document_canonical_id));assert.ok(army.units.some(u=>u.id===g.references[0].target_canonical_id));
});

test('twenty-first Gazette unnumbered acts retain authentic flag drawings, separate courts and amnesty dates',()=>{
 const flag=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:naval_merchant_flags:1833'));assert.equal(flag.units.length,1);assert.equal(flag.units[0].unit_type,'body');assert.equal(flag.document.issued_at_gregorian,'1833-04-16');assert.match(flag.units[0].text,/πέντε μεν κυανάς, και τέσσαρας λευκάς/);assert.match(flag.units[0].text,/δεν φέρει τα παράσημα/);const drawing=buildHistoricalGraph(entries.find(e=>e.id===flag.references[0].target_canonical_id));assert.equal(drawing.document.text_coverage,'scan_only');assert.equal(drawing.document.source_page_count,10);assert.equal(drawing.units.length,0);assert.match(drawing.document.transcription_note,/σελίδα 9/);assert.match(drawing.document.transcription_note,/λευκή τελευταία/);const assist=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:state_prosecutors_assistants_duties:1833'));assert.deepEqual(assist.units[0].source_pages,[7,8]);assert.equal(assist.units[0].article_number,null);const aegina=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:aegina_thebes_court_jurisdiction:1833'));assert.match(aegina.units[0].text,/Δικαστηρίου Θηβών/);assert.equal(aegina.references.length,0);const ext=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:regular_soldiers_amnesty_extension:1833'));assert.equal(ext.units.length,1);assert.equal(ext.document.issued_at_gregorian,'1833-05-10');assert.equal(ext.document.published_at_gregorian,'1833-06-15');assert.match(ext.units[0].text,/18 \(30\) Ιουνίου/);assert.match(ext.document.transcription_note,/8 \(30\) Juni/);assert.match(ext.units[0].text,/μόνον ως απλοί στρατιώται/);assert.equal(ext.references[0].target_canonical_id,'royal_proclamation:military_deserters_amnesty:1833');assert.equal(ext.references[0].article,null);const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:21:1833'));assert.equal(issue.document.published_at_julian,'1833-06-03');assert.equal(issue.document.published_at_gregorian,'1833-06-15');assert.equal(issue.units.length,0);
});

test('twenty-second Gazette preserves all 43 auxiliary-corps articles, cross-page boundaries, lists and fractional amounts',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='treaty:greek_bavarian_auxiliary_corps:1832'));assert.equal(g.document.text_coverage,'complete_greek_transcription');assert.equal(g.document.original_provision_count,43);assert.deepEqual(g.units.map(u=>u.article_number),Array.from({length:43},(_,i)=>String(i+1)));assert.ok(g.units.every(u=>u.parent_id===null&&u.unit_type==='article'));
 for(const [n,pages] of [['9',[3,4]],['14',[4,5]],['23',[6,7]],['29',[7,8]],['35',[8,9]],['40',[9,10]]])assert.deepEqual(g.units.find(u=>u.article_number===n).source_pages,pages);
 assert.match(g.units[1].text,/10 Δεκανείς/);assert.match(g.units[1].text,/δύο υπαξιωματικούς και δέκα στρατιώτας/);assert.match(g.units[9].text,/86,439 51\/60/);assert.match(g.units[10].text,/4,166 40\/60/);assert.match(g.units[15].text,/1\/30/);assert.match(g.units[15].text,/1\/20/);assert.match(g.units[22].text,/1 12\/60/);assert.match(g.units[28].text,/1\/8 μέτρου ρακής/);assert.deepEqual([...g.units[39].text.matchAll(/^(\d+)\./gm)].map(m=>m[1]),['1','2','3','4']);assert.match(g.document.source_text,/ΚΑΡΟΛΟΣ ΑΒΕΛ/);
});

test('auxiliary-corps citations resolve exact companion treaties and both range targets without invented paragraphs',()=>{
 const id='treaty:greek_bavarian_auxiliary_corps:1832',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.references.length,12);assert.ok(g.references.every(r=>g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)));assert.equal(g.references[0].target_canonical_id,'treaty:greek_bavarian_consular_assistance:1832');assert.equal(g.references[1].target_canonical_id,'international_treaty:london:7_may:1832:article:15');assert.equal(entries.some(e=>e.id===g.references[1].document_canonical_id),false);assert.equal(g.references[2].target_canonical_id,'treaty:greek_bavarian_recruitment:1832');assert.equal(g.references[3].target_canonical_id,'legal_annex:greek_bavarian_auxiliary_corps_pay:1832');assert.equal(g.references[5].target_canonical_id,id+':article:21');assert.equal(g.references[5].paragraph,null);const range=g.references.filter(r=>r.raw_text==='των Άρθ. 11 και 15');assert.deepEqual(range.map(r=>r.target_canonical_id),[id+':article:11',id+':article:15']);for(const r of g.references.filter(r=>r.document_canonical_id===id))assert.ok(g.units.some(u=>u.id===r.target_canonical_id));for(const name of ['consular_assistance','recruitment'])assert.ok(entries.find(e=>e.id==='treaty:greek_bavarian_'+name+':1832').related.includes(id));
});

test('auxiliary-corps signature, ratification, notice and publication dates stay separate and pay table remains an honest scan',()=>{
 const t=buildHistoricalGraph(entries.find(e=>e.id==='treaty:greek_bavarian_auxiliary_corps:1832')),r=buildHistoricalGraph(entries.find(e=>e.id==='royal_ratification:greek_bavarian_auxiliary_corps:1832')),n=buildHistoricalGraph(entries.find(e=>e.id==='ministerial_notice:greek_bavarian_auxiliary_corps_publication:1833'));assert.equal(t.document.issued_at_gregorian,'1832-11-01');assert.equal(r.document.issued_at_gregorian,'1832-12-09');assert.equal(n.document.issued_at_gregorian,'1833-07-13');for(const g of [r,n]){assert.equal(g.units.length,1);assert.equal(g.units[0].unit_type,'body');assert.equal(g.units[0].article_number,null);assert.equal(g.document.published_at_gregorian,'1833-07-22');}assert.deepEqual(r.units[0].source_pages,[10]);assert.match(r.document.source_text,/άρθρων 14 και 15/);assert.equal(n.references[0].target_canonical_id,t.document.canonical_id);
 for(const id of ['legal_annex:greek_bavarian_auxiliary_corps_pay:1832','fek:Α:22:1833']){const g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.text_coverage,'scan_only');assert.equal(g.document.source_page_count,12);assert.equal(g.document.source_text,null);assert.equal(g.units.length,0);assert.equal(g.document.issued_at_gregorian,null);}const p=entries.find(e=>e.id==='legal_annex:greek_bavarian_auxiliary_corps_pay:1832');assert.equal(p.date_basis,'parent_treaty_date');assert.match(p.transcription_note,/Δεν έχουν μεταγραφεί/);
});

test('twenty-third Gazette retains 25 Church declaration articles, oath, original lists and source-page continuations',()=>{
 const id='royal_decree:greek_church_independence:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.text_coverage,'complete_greek_transcription');assert.deepEqual(g.units.map(u=>u.article_number),Array.from({length:25},(_,i)=>String(i+1)));assert.ok(g.units.every(u=>u.parent_id===null&&u.unit_type==='article'));for(const [n,pages] of [['2',[1,2]],['8',[2,3]],['13',[3,4]],['23',[5,6]]])assert.deepEqual(g.units.find(u=>u.article_number===n).source_pages,pages);assert.match(g.units[7].text,/Ομνύω πίστιν εις τον Βασιλέα/);assert.equal([...g.units[9].text.matchAll(/^[α-ω]΄\./gm)].length,8);assert.equal([...g.units[13].text.matchAll(/^\d+\./gm)].length,9);assert.equal([...g.units[17].text.matchAll(/^\d+\./gm)].length,6);assert.deepEqual(g.references.slice(0,3).map(r=>r.article),['11','12','17']);assert.equal(g.references[4].target_canonical_id,id+':article:10');assert.equal(g.references[4].paragraph,null);assert.equal(g.document.issued_at_gregorian,'1833-08-04');assert.equal(g.document.published_at_gregorian,'1833-08-13');
});

test('four Church proceedings stay unnumbered and dated separately, with exact prior-session links and Greek time preserved',()=>{
 const gs=[15,16,21,26].map(day=>buildHistoricalGraph(entries.find(e=>e.id==='meeting_minutes:church_independence:'+day+'_july:1833')));assert.deepEqual(gs.map(g=>g.document.issued_at_gregorian),['1833-07-27','1833-07-28','1833-08-02','1833-08-07']);assert.deepEqual(gs.map(g=>g.units[0].source_pages),[[6,7,8],[8],[8,9],[9]]);for(const g of gs){assert.equal(g.units.length,1);assert.equal(g.units[0].unit_type,'body');assert.equal(g.units[0].article_number,null);assert.equal(g.document.date_basis,'local_julian_meeting_date_with_gregorian_conversion');assert.ok(g.references.every(r=>g.units[0].text.includes(r.raw_text)));}assert.equal(gs[0].references.length,2);assert.match(gs[0].document.source_text,/Μοσχονησίων/);assert.deepEqual(gs[2].references.map(r=>r.target_canonical_id),gs.slice(0,2).map(g=>g.document.canonical_id));assert.deepEqual(gs[3].references.map(r=>r.target_canonical_id),gs.slice(0,3).map(g=>g.document.canonical_id));assert.match(gs[3].units[0].text,/περί την 1 μετά μεσημβρ/);assert.match(gs[3].document.source_text,/ΤΣΡΙΚΟΥΠΗΣ/);assert.match(gs[3].document.transcription_note,/γερμανική 2/);
});

test('conservatory decree keeps Greek article six pending rather than borrowing German article two or inventing chapter articles',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:courts_conservatory_measures:1833')),old=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:three_courts_jurisdiction:1833'));assert.equal(g.units.length,1);assert.equal(g.units[0].unit_type,'body');assert.equal(g.references[0].target_canonical_id,old.document.canonical_id+':article:6');assert.equal(old.units.some(u=>u.id===g.references[0].target_canonical_id),false);assert.ok(old.units.some(u=>u.article_number==='2'));assert.match(g.units[0].text,/άρθρου ς΄/);assert.match(g.document.transcription_note,/γερμανική στήλη παραπέμπει στο άρθρο 2/);assert.equal(g.references[1].article,null);assert.equal(g.references[1].target_canonical_id,'legal_code:civil_procedure:1830');assert.match(g.references[1].raw_text,/Κεφλ\. ΙΕ΄/);assert.equal(g.references[3].target_canonical_id,'decree:judicial_costs:1830:article:16');assert.ok(g.references.every(r=>g.units[0].text.includes(r.raw_text)));const military=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:military_courts_jurisdiction_clarification:1833'));assert.match(military.units[0].text,/4 \(6\) Μαΐου/);assert.match(military.document.transcription_note,/4 \(16\) Mai/);assert.equal(military.document.issued_at_gregorian,'1833-06-14');
});

test('Synod pay, consular identities and ministry staff groups preserve scope while the German-only erratum stays a scan',()=>{
 const s=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:holy_synod_first_appointments:1833'));assert.deepEqual(s.units[0].source_pages,[9,10]);assert.equal(s.units.length,1);assert.equal([...s.units[0].text.matchAll(/^\d+\./gm)].length,4);assert.match(s.units[0].text,/3000 Δραχ\. κατ’ έτος/);assert.match(s.units[0].text,/2400 Δραχ\. ετησίως/);assert.match(s.units[0].text,/επιμίσθιον 600/);assert.equal(s.document.issued_at_gregorian,'1833-08-06');const c=buildHistoricalGraph(entries.find(e=>e.id==='ministerial_notice:foreign_consuls_recognition:1833'));assert.deepEqual(c.references.map(r=>r.document_number),['4514','4145','4891','4777','5713']);assert.ok(c.references.every(r=>r.target_canonical_id==='royal_decree:'+r.document_number+':1833'));assert.equal(c.document.issued_at_gregorian,'1833-08-12');const a=buildHistoricalGraph(entries.find(e=>e.id==='appointment_notice:ministries_staff:1833'));assert.equal(a.units.length,1);assert.deepEqual(a.units[0].source_pages,[11,12]);assert.equal([...a.units[0].text.matchAll(/^Εις την επί /gm)].length,6);assert.match(a.units[0].text,/15 \(3\) Μαΐου/);assert.equal(a.references.length,5);assert.equal(a.document.issued_at_gregorian,null);for(const id of ['erratum:gazette_twenty_two_german_contents:1833','fek:Α:23:1833']){const g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.text_coverage,'scan_only');assert.equal(g.document.source_page_count,12);assert.equal(g.units.length,0);assert.equal(g.document.source_text,null);}for(const id of ['fek:Α:22:1833','treaty:greek_bavarian_auxiliary_corps:1832'])assert.ok(entries.find(e=>e.id===id).related.includes('erratum:gazette_twenty_two_german_contents:1833'));
});

test('twenty-fourth Gazette retains all 109 continuous naval provisions and original division headings across source pages',()=>{
 const id='royal_decree:naval_directorate_organisation:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.text_coverage,'complete_greek_transcription');assert.equal(g.document.original_provision_count,109);assert.deepEqual(g.units.map(u=>u.article_number),Array.from({length:109},(_,i)=>String(i+1)));assert.ok(g.units.every(u=>u.parent_id===null&&u.unit_type==='article'));for(const [n,pages] of [['4',[1,2]],['21',[3,4]],['27',[4,5]],['31',[5,6]],['39',[6,7]],['51',[7,8]],['61',[8,9]],['85',[10,11]]])assert.deepEqual(g.units.find(u=>u.article_number===n).source_pages,pages);const headings=g.units.filter(u=>u.title);assert.equal(headings.length,12);assert.ok(headings.every(u=>u.text.startsWith(u.title+'\n')));assert.match(g.units[108].title,/^Β\. Τελευταίαι/);assert.match(g.document.source_text,/Καθήκοντα του τροφοδότου/);assert.equal(g.document.issued_at_gregorian,'1833-08-01');assert.equal(g.document.published_at_gregorian,'1833-08-17');assert.match(g.units[11].text,/η τελεία απόφασις/);assert.match(g.units[12].text,/να φυλάττεται η οδός/);
});

test('naval staffing, equipment lists, family pay and both three-lock treasuries retain original provision scopes',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:naval_directorate_organisation:1833'));assert.equal([...g.units[1].text.matchAll(/^[α-ω]΄\)/gm)].length,9);assert.equal([...g.units[13].text.matchAll(/^[α-ω]΄\)/gm)].length,6);assert.equal([...g.units[20].text.matchAll(/^\d+\)/gm)].length,6);assert.equal([...g.units[28].text.matchAll(/^[α-ω]΄ /gm)].length,8);assert.equal([...g.units[50].text.matchAll(/^\d+\)/gm)].length,6);assert.match(g.units[38].text,/εις τας οικογενείας των/);assert.match(g.units[37].text,/24 ώρας/);assert.match(g.units[85].text,/των τριών μηνών/);assert.match(g.units[89].text,/τρεις κλείδωνας/);assert.match(g.units[97].text,/τρεις κλείδωνας/);assert.match(g.units[89].text,/Διευθυντής/);assert.match(g.units[97].text,/πρώτος λογιστής/);assert.match(g.units[62].text,/εξεταστικήν επιτροπήν/);
});

test('naval form and instruction citations stay pending with their Greek labels while the office-procedure reference resolves exactly',()=>{
 const id='royal_decree:naval_directorate_organisation:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.references.length,25);assert.ok(g.references.every(r=>g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)));const office=g.references.find(r=>r.document_canonical_id==='royal_decree:ministries_office_procedure:1833');assert.ok(office);assert.equal(office.from_unit_id,id+':article:100');assert.equal(office.article,null);const pending=g.references.filter(r=>r!==office);assert.equal(pending.length,24);assert.ok(pending.every(r=>!entries.some(e=>e.id===r.document_canonical_id)));const forms=g.references.filter(r=>r.from_unit_id===id+':article:104');assert.deepEqual(forms.map(r=>r.document_canonical_id),['ΑΒ','ΑΓ','Β'].map(n=>'legal_annex:naval_directorate_form:'+n+':1833'));assert.deepEqual(g.references.filter(r=>r.from_unit_id===id+':article:31').map(r=>r.document_canonical_id),['Ο','Π'].map(n=>'legal_annex:naval_directorate_form:'+n+':1833'));assert.deepEqual(g.references.filter(r=>r.from_unit_id===id+':article:78').map(r=>r.target_canonical_id),['5','6'].map(n=>'legal_instruction:naval_harbour_captain:1833:article:'+n));assert.equal(g.references.find(r=>r.from_unit_id===id+':article:96').target_canonical_id,'legal_instruction:naval_controller:1833:article:7');assert.match(g.units[95].text,/§ 7/);const f=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:24:1833'));assert.equal(f.units.length,0);assert.equal(f.document.source_page_count,12);assert.equal(f.document.source_text,null);assert.equal(f.document.issued_at_gregorian,null);assert.match(f.document.transcription_note,/δεν εμφανίζονται/);
});

test('twenty-fifth Gazette keeps currency enactment, publication and commencement distinct',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:turkish_coins_prohibition:1833'));assert.deepEqual(g.units.map(u=>u.article_number),['1','2','3','4','5','6','7']);assert.deepEqual(g.units.map(u=>u.source_page),[1,1,2,2,2,2,2]);assert.equal(g.document.issued_at_gregorian,'1833-08-29');assert.equal(g.document.published_at_gregorian,'1833-09-02');assert.match(g.units[5].text,/1 \(13\) Οκτωβρίου/);assert.match(g.units[2].text,/100–500 Δραχμών/);assert.equal([...g.units[3].text.matchAll(/το ήμισυ/g)].length,2);assert.match(g.document.source_text,/8 \(20\) Φεβρουαρίου/);assert.equal(g.references.length,0);assert.ok(entries.find(e=>e.id==='royal_decree:monetary_system:1833').related.includes(g.document.canonical_id));
});

test('vineyard circular keeps twelve primary paragraphs and eight exact internal links including both grouped targets',()=>{
 const id='ministerial_circular:vineyards_raisins_revenue:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.primary_unit_type,'paragraph');assert.equal(g.document.issued_at_gregorian,'1833-07-24');assert.deepEqual(g.units.map(u=>u.paragraph_number),Array.from({length:12},(_,i)=>String(i+1)));assert.ok(g.units.every(u=>u.unit_type==='paragraph'&&u.article_number===null&&u.parent_id===null));assert.deepEqual(g.units.map(u=>u.source_page),[2,2,3,3,3,3,3,3,3,3,3,3]);assert.match(g.units[0].text,/οκτώ τοις %/);assert.match(g.units[0].text,/δέκα έξ τοις %/);assert.match(g.units[0].text,/είκοσι τέσσαρα τοις %/);assert.match(g.units[5].text,/προς τρία/);assert.match(g.units[6].text,/τριπλού/);assert.equal(g.references.length,9);const internal=g.references.filter(r=>r.document_canonical_id===id);assert.equal(internal.length,8);assert.ok(internal.every(r=>r.article===null&&g.units.some(u=>u.id===r.target_canonical_id)));assert.deepEqual(internal.filter(r=>r.raw_text==='§ 2, 9').map(r=>r.target_canonical_id),[id+':paragraph:2',id+':paragraph:9']);assert.ok(g.references.every(r=>g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)));assert.equal(g.references.at(-1).target_canonical_id,'legal_annex:vineyards_raisins_duty_receipt_book:1833');assert.equal(entries.some(e=>e.id===g.references.at(-1).document_canonical_id),false);
});

test('eight Gazette 25 appointment notices retain original bodies, cited decision scopes and no invented issue dates',()=>{
 const es=entries.filter(e=>e.fek_number==='25'&&e.type==='appointment_notice');assert.equal(es.length,8);const gs=es.map(buildHistoricalGraph);for(const g of gs){assert.equal(g.units.length,1);assert.equal(g.units[0].unit_type,'body');assert.equal(g.units[0].article_number,null);assert.deepEqual(g.units[0].source_pages,[4]);assert.equal(g.document.issued_at_gregorian,null);assert.equal(g.document.published_at_gregorian,'1833-09-02');}const rs=gs.flatMap(g=>g.references);assert.equal(rs.length,6);assert.ok(rs.every(r=>!entries.some(e=>e.id===r.document_canonical_id)));const war=gs.find(g=>g.document.canonical_id.includes('war_ministry'));assert.equal(war.references[0].document_number,'4441');assert.equal(war.references[0].target_canonical_id,'royal_decree:4441:1833');assert.match(war.units[0].text,/Χρήστος Σμάλτς/);assert.equal(war.document.date_basis,'cited_decision_date_notice_undated');const courts=gs.find(g=>g.document.canonical_id.includes('three_courts'));assert.equal(courts.references.length,0);assert.match(courts.units[0].text,/Βουισέρης/);assert.match(courts.units[0].text,/Κασσέρης/);assert.match(courts.units[0].text,/Γ\. Τερτσέτης/);assert.match(courts.units[0].text,/Πολυζωΐδης/);assert.equal(courts.document.chronology_key,'1833-09-02');const peace=gs.find(g=>g.document.canonical_id.includes('peace_commercial'));assert.equal(peace.references.length,0);assert.match(peace.units[0].text,/Συνδίκασται/);assert.equal([...peace.units[0].text.matchAll(/»/g)].length,4);assert.match(peace.units[0].text,/\(2 Αυγούστ\. Βασιλικών/);const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:25:1833'));assert.equal(issue.document.source_page_count,4);assert.equal(issue.document.text_coverage,'scan_only');assert.equal(issue.document.source_text,null);assert.equal(issue.units.length,0);
});

test('Gazette 26 Synod decree retains seven Greek headings and links every article in both declaration ranges',()=>{
 const id='royal_decree:holy_synod_procedure:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.deepEqual(g.units.map(u=>u.article_number),['1','2','3','4','5','6','7']);assert.deepEqual(g.units.map(u=>u.source_page),[1,1,1,1,2,2,2]);assert.equal(g.document.original_provision_count,7);assert.match(g.document.source_text,/να εκτελέση και δημοσιεύση το παρόν Διάταγμα/);assert.match(g.document.transcription_note,/γερμανική στήλη/);assert.match(g.units[3].text,/της επί επί των/);assert.match(g.units[4].text,/50–500/);assert.match(g.units[4].text,/κατωτέρων των 50/);assert.match(g.units[4].text,/μέχρις 6 εβδομάδων/);assert.equal([...g.units[4].text.matchAll(/^[α-γ]΄\./gm)].length,3);assert.equal(g.document.issued_at_gregorian,'1833-08-27');assert.equal(g.document.published_at_gregorian,'1833-09-08');assert.equal(g.references.length,12);const target='royal_decree:greek_church_independence:1833';for(const from of ['1','2'])assert.deepEqual(g.references.filter(r=>r.from_unit_id===id+':article:'+from).map(r=>r.target_canonical_id),[9,10,11,12].map(n=>target+':article:'+n));assert.deepEqual(g.references.filter(r=>r.from_unit_id===id+':article:4').map(r=>r.target_canonical_id),Array(3).fill(target+':article:14'));assert.ok(g.references.every(r=>r.paragraph===null));assert.equal(g.references.at(-1).target_canonical_id,id+':article:4');
});

test('late-crops circular retains ten lettered sections, page boundaries, nested trials and exact internal item scope',()=>{
 const id='ministerial_circular:late_crops_revenue_clarification:1833',e=entries.find(e=>e.id===id),g=buildHistoricalGraph(e);assert.deepEqual(g.units.map(u=>u.article_number),Array.from({length:10},(_,i)=>String(i+1)));assert.deepEqual(g.units.map(u=>u.original_label),['Α΄.','Β΄.','Γ΄.','Δ΄.','Ε΄.','Ϛ.','Ζ΄.','Η΄.','Θ΄.','Ι΄.']);assert.deepEqual(g.units[2].source_pages,[2,3]);assert.deepEqual(g.units[3].source_pages,[3,4]);assert.deepEqual([...g.units[3].text.matchAll(/^(\d)\)/gm)].map(m=>m[1]),['1','2','3','4','5','6','7']);assert.equal([...g.units[3].text.matchAll(/^[α-γ]΄\./gm)].length,3);for(const pattern of [/περίπου 65 οκάδας/,/75–80 οκάδας/,/διακοσίας πεντήκοντα οκάδας/,/είκοσι πέντε ημέρας/,/αεριζόμενον και μη υγρόν/,/ελευθέραν θέλησιν/])assert.match(g.units[3].text,pattern);assert.match(g.units[4].text,/10 %/);assert.match(g.units[4].text,/25 %/);assert.match(g.units[5].text,/παρελθόντα δύο έτη/);assert.match(g.units[8].text,/εις τρεις δόσεις/);assert.match(g.units[8].text,/30 Δεκεμβρίου/);const internal=g.references.filter(r=>r.document_canonical_id===id);assert.equal(internal.length,4);assert.ok(internal.every(r=>r.target_canonical_id===id+':article:4'&&r.paragraph===null));assert.equal(g.units.filter(u=>u.unit_type==='paragraph').length,0);assert.equal(g.document.issued_at_julian,'1833-08-10');assert.equal(g.document.issued_at_gregorian,'1833-08-22');assert.equal(g.document.date_basis,'local_julian_act_date_with_gregorian_conversion');
});

test('Gazette 26 pending instructions and Lambda resolution retain unknown years and explicit paragraph targets without guessed documents',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='ministerial_circular:late_crops_revenue_clarification:1833'));assert.equal(g.references.length,16);assert.ok(g.references.every(r=>g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)));const pending=g.references.filter(r=>r.document_canonical_id!==g.document.canonical_id);assert.equal(pending.length,12);assert.ok(pending.every(r=>r.document_year==='undated'&&!entries.some(e=>e.id===r.document_canonical_id)));assert.deepEqual(pending.filter(r=>r.paragraph).map(r=>r.target_canonical_id),[30,31,34,35].map(n=>'ministerial_instruction:revenue_collection:1234:undated:paragraph:'+n));assert.ok(pending.filter(r=>r.document_type==='ministerial_instruction').every(r=>r.document_number==='1234'));assert.equal(pending.filter(r=>r.document_type==='resolution').length,2);const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:26:1833'));assert.equal(issue.document.source_page_count,4);assert.equal(issue.document.source_text,null);assert.equal(issue.document.text_coverage,'scan_only');assert.equal(issue.units.length,0);assert.equal(issue.document.issued_at_gregorian,null);assert.ok(entries.find(e=>e.id==='royal_decree:greek_church_independence:1833').related.includes('royal_decree:holy_synod_procedure:1833'));
});

test('Amfissa proclamation preserves restarted A/B article numbering and independently selectable unnumbered closing rules',()=>{
 const e=entries.find(e=>e.id==='ministerial_proclamation:amfissa_olive_grove_leasing:1833'),g=buildHistoricalGraph(e);const numbers=[...Array.from({length:16},(_,i)=>'Α.'+(i+1)),...Array.from({length:5},(_,i)=>'Β.'+(i+1))];assert.deepEqual(g.units.filter(u=>u.unit_type==='article').map(u=>u.article_number),numbers);assert.deepEqual(g.units.map(u=>u.navigation_number),[...numbers,'closing']);assert.equal(g.document.original_provision_count,21);assert.equal(g.units.at(-1).id,e.id+':body');assert.equal(g.units.at(-1).article_number,null);assert.match(g.units.at(-1).text,/Τελευταίοι Ορισμοί/);assert.match(g.units.at(-1).text,/20 Δεκεμβρίου 1833/);assert.match(g.units.at(-1).text,/πρόστιμον 5 %/);assert.deepEqual(g.units[1].source_pages,[1,2]);assert.deepEqual(g.units[9].source_pages,[2,3]);assert.match(g.units[5].text,/55 %/);assert.match(g.units[3].text,/Φεβρουαρίου 1834/);assert.match(g.units[4].text,/20 Νοεμβρίου/);assert.match(g.units[11].text,/εγγυηταί/);assert.equal(g.document.issued_at_gregorian,'1833-09-05');assert.equal(g.document.published_at_gregorian,'1833-09-14');const duplicate=structuredClone(e);duplicate.sections.at(-1).navigation_number='Α.1';assert.throws(()=>buildHistoricalGraph(duplicate),/duplicate historical navigation/);const invalid=structuredClone(e);invalid.sections.at(-1).navigation_number='';assert.throws(()=>buildHistoricalGraph(invalid),/historical navigation/);const old=buildHistoricalGraph(entries.find(e=>e.id==='ministerial_circular:amfissa_olive_grove_publicity:1833'));assert.equal(old.units[0].navigation_number,null);assert.equal(old.units[0].id,old.document.canonical_id+':body');
});

test('Amfissa references keep preceding and cross-part targets exact rather than borrowing restarted B article numbers',()=>{
 const id='ministerial_proclamation:amfissa_olive_grove_leasing:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.references.length,11);assert.ok(g.references.every(r=>g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)));assert.equal(g.references[0].target_canonical_id,'legal_annex:amfissa_olive_grove_inventory:1833');for(const [source,target] of [['Α.9','Α.8'],['Α.11','Α.10'],['Β.4','Α.4']])assert.equal(g.references.find(r=>r.from_unit_id===id+':article:'+source).target_canonical_id,id+':article:'+target);for(const source of ['Α.12','Α.13','Β.3'])assert.deepEqual(g.references.filter(r=>r.from_unit_id===id+':article:'+source).map(r=>r.target_canonical_id),['Α.8','Α.10'].map(n=>id+':article:'+n));assert.ok(g.references.filter(r=>r.document_canonical_id===id).every(r=>g.units.some(u=>u.id===r.target_canonical_id)));const circular=buildHistoricalGraph(entries.find(e=>e.id==='ministerial_circular:amfissa_olive_grove_publicity:1833'));assert.equal(circular.references[0].target_canonical_id,id);assert.equal(circular.document.issued_at_gregorian,null);
});

test('Amfissa inventory declares its omitted location column and preserves Greek fractions, totals and note separately from the German',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='legal_annex:amfissa_olive_grove_inventory:1833'));assert.equal(g.document.text_coverage,'excerpt');assert.equal(g.units.length,1);assert.equal(g.units[0].unit_type,'body');assert.deepEqual(g.units[0].source_pages,[4]);assert.match(g.document.transcription_note,/δεν μεταγράφεται η αναλυτική στήλη/);assert.match(g.units[0].text,/ΤΟΠΟΛΙΑΙ · 265 2\/4 · 1674 \/ 118 · 402 \/ 25/);assert.match(g.units[0].text,/4581 3\/4 · 37421 \/ 2150 · 4588 \/ 119/);assert.match(g.units[0].text,/172 3\/4/);assert.match(g.units[0].text,/1301 περίπου/);assert.doesNotMatch(g.units[0].text,/1300/);assert.equal(g.document.issued_at_gregorian,null);assert.equal(g.document.date_basis,'parent_proclamation_date');const f=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:27:1833'));assert.equal(f.document.text_coverage,'scan_only');assert.equal(f.document.source_page_count,4);assert.equal(f.document.source_text,null);assert.equal(f.units.length,0);
});

test('Gazette 27 personnel notices preserve undated publication, anonymous Greek resignation and exact available prefects article 29',()=>{
 const es=entries.filter(e=>e.fek_number==='27'&&e.type==='appointment_notice');assert.equal(es.length,5);const gs=es.map(buildHistoricalGraph);for(const g of gs){assert.equal(g.document.issued_at_gregorian,null);assert.equal(g.units.length,1);assert.equal(g.units[0].unit_type,'body');assert.deepEqual(g.units[0].source_pages,[4]);}const d=gs.find(g=>g.document.canonical_id.includes('diplomatic'));assert.equal(d.document.chronology_key,'1833-09-14');assert.equal(d.references.length,0);assert.match(d.units[0].text,/7 \(19\) Φεβρ/);assert.match(d.units[0].text,/10 Σεπτεμ/);const resign=gs.find(g=>g.document.canonical_id.includes('resignation'));assert.doesNotMatch(resign.units[0].text,/Σχινά/);const all=gs.flatMap(g=>g.references);assert.equal(all.length,5);assert.equal(all.filter(r=>!entries.some(e=>e.id===r.document_canonical_id)).length,4);const known=all.find(r=>r.article==='29');assert.equal(known.target_canonical_id,'royal_decree:prefects_powers_office_procedure:1833:article:29');assert.match(buildHistoricalGraph(entries.find(e=>e.id===known.document_canonical_id)).units.find(u=>u.id===known.target_canonical_id).text,/μυστικότητα/);
});

test('Gazette 28 law keeps its printed type, twenty articles, page continuations and issue-versus-publication dates',()=>{
 const id='law:extraordinary_military_justice:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.type,'law');assert.match(g.document.title_official,/ΝΟΜΟΣ/);assert.equal(g.document.historical,true);assert.equal(g.document.original_provision_count,20);assert.deepEqual(g.units.map(u=>u.article_number),Array.from({length:20},(_,i)=>String(i+1)));assert.ok(g.units.every(u=>u.unit_type==='article'&&u.parent_id===null));assert.deepEqual(g.units[1].source_pages,[1,2]);assert.deepEqual(g.units[8].source_pages,[3,4]);assert.equal([...g.units[0].text.matchAll(/^\d\./gm)].length,2);assert.equal([...g.units[1].text.matchAll(/^[α-ε]΄\.\)/gm)].length,5);assert.equal([...g.units[8].text.matchAll(/^[α-γ]΄\.\)/gm)].length,3);assert.equal([...g.units[9].text.matchAll(/^\d\)/gm)].length,6);assert.equal([...g.units[12].text.matchAll(/^\d\)/gm)].length,2);assert.equal(g.document.issued_at_gregorian,'1833-09-17');assert.equal(g.document.published_at_gregorian,'1833-09-19');assert.match(g.units[19].text,/αφ’ ης ημέρας δημοσιευθή/);assert.equal(g.references.length,3);assert.deepEqual(g.references.map(r=>r.target_canonical_id),[16,3,13].map(n=>id+':article:'+n));assert.ok(g.references.every(r=>r.paragraph===null&&g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)));
});

test('extraordinary military justice preserves court composition, exceptional scope and original timing without extra paragraph units',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='law:extraordinary_military_justice:1833'));assert.match(g.units[3].text,/εκ τεσσάρων Δικαστών με Πρόεδρον και Γραμματέα/);assert.match(g.units[3].text,/τας τυχόν άλλας αποδείξεις/);assert.match(g.units[1].text,/εντός 24 ωρών/);assert.match(g.units[2].text,/Κατ’ εξαίρεσιν/);assert.equal(g.units[2].text.split('\n\n').length,3);assert.match(g.units[5].text,/του Άρθρ\. 3, §\. 3/);assert.match(g.units[15].text,/εντός δύο ωρών/);assert.match(g.units[15].text,/εντός 24 ωρών/);assert.match(g.units[15].text,/τεσσάρων ψήφων κατά μιάς/);assert.match(g.units[16].text,/εντός τριών ημερών/);assert.match(g.units[17].text,/μέχρι 200 Δραχ/);assert.match(g.units[17].text,/δύο εβδομάδων/);assert.equal(g.units.filter(u=>u.unit_type==='paragraph').length,0);
});

test('Tinos decision keeps seven provisions, nested personnel list, opening date and exact new-law link while supporting papers stay pending',()=>{
 const id='royal_decision:tinos_extraordinary_military_court:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.units.length,7);assert.deepEqual(g.units.map(u=>u.article_number),['1','2','3','4','5','6','7']);assert.deepEqual(g.units[2].source_pages,[6,7]);assert.equal([...g.units[2].text.matchAll(/^\d\./gm)].length,4);assert.equal([...g.units[2].text.matchAll(/^[α-δ]΄\./gm)].length,4);assert.match(g.units[2].text,/Φαβρίκιον/);assert.match(g.units[2].text,/Κυπαρίσσην/);assert.match(g.units[2].text,/9 \(21\) του τρέχοντος/);assert.equal(g.document.issued_at_gregorian,'1833-09-19');assert.equal(g.document.published_at_gregorian,'1833-09-19');assert.equal(g.references.length,2);assert.equal(g.references[0].target_canonical_id,'law:extraordinary_military_justice:1833:article:2');assert.equal(g.references[0].paragraph,null);assert.match(g.references[0].raw_text,/§ 3/);assert.equal(g.references[1].target_canonical_id,'archival_bundle:tinos_unrest_reports:1833');assert.equal(entries.some(e=>e.id===g.references[1].document_canonical_id),false);assert.ok(g.references.every(r=>g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)));assert.match(g.units[5].text,/αλληλεγγύως/);
});

test('consular decrees, uniform reference and grain circular retain exact source scopes and independent dates',()=>{
 const c=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:smyrna_canea_preveza_salonica_consuls:1833')),u=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:consular_uniforms:1833')),g=buildHistoricalGraph(entries.find(e=>e.id==='ministerial_circular:russian_grain_shortage:1833'));assert.equal(c.units.length,4);assert.deepEqual(c.units[1].source_pages,[7,8]);assert.match(c.units[0].text,/6,000 Δραχμών/);assert.match(c.units[1].text,/δι’ ίδιον ή άλλου τινός λογαριασμόν/);assert.match(c.units[2].text,/προσωπικώς επί ορκωμοσία/);assert.equal(c.document.issued_at_gregorian,'1833-09-09');assert.equal(c.references.length,0);assert.equal(u.units.length,2);assert.equal(u.document.issued_at_gregorian,'1833-09-11');assert.equal(u.references[0].target_canonical_id,'royal_decree:civil_service_uniforms:1833');assert.equal(u.references[0].article,null);assert.ok(entries.find(e=>e.id===u.references[0].document_canonical_id).related.includes(u.document.canonical_id));assert.equal(g.document.issued_at_julian,'1833-09-04');assert.equal(g.document.issued_at_gregorian,'1833-09-16');assert.equal(g.units.length,1);assert.equal(g.units[0].unit_type,'body');assert.deepEqual(g.units[0].source_pages,[8]);assert.match(g.units[0].text,/Ρωσσίαν/);assert.match(g.units[0].text,/Οθωμανική Πύλη/);const f=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:28:1833'));assert.equal(f.document.text_coverage,'scan_only');assert.equal(f.document.source_page_count,8);assert.equal(f.document.source_text,null);assert.equal(f.units.length,0);
});

test('Gazette 29 licensing retains seven articles, restarted lists, original page continuation and two companion-law targets',()=>{
 const id='royal_decree:printing_lithography_booktrade_licensing:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.type,'royal_decree');assert.equal(g.document.original_provision_count,7);assert.deepEqual(g.units.map(u=>u.article_number),['1','2','3','4','5','6','7']);assert.deepEqual(g.units[2].source_pages,[1,2]);assert.deepEqual([...g.units[2].text.matchAll(/^(\d)\)/gm)].map(m=>m[1]),['1','2','1','2']);assert.equal([...g.units[4].text.matchAll(/^[α-δ]΄\)/gm)].length,4);assert.ok(g.units.every(u=>u.unit_type==='article'&&u.parent_id===null));assert.match(g.units[1].text,/Νομάρχην/);assert.match(g.units[1].text,/Εσωτερ/);assert.equal(g.document.issued_at_julian,'1833-09-11');assert.equal(g.document.issued_at_gregorian,'1833-09-23');assert.equal(g.document.published_at_gregorian,'1833-09-26');assert.deepEqual(g.references.map(r=>r.target_canonical_id),[3,4].map(n=>'law:press_police:1833:article:'+n));assert.ok(g.references.every(r=>r.from_unit_id===id+':article:6'&&g.units[5].text.includes(r.raw_text)));assert.equal(new Set(g.references.map(r=>r.raw_text)).size,1);
});

test('Gazette 29 press-police law preserves authentic type, source quirks, dates and every expanded range target',()=>{
 const id='law:press_police:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.type,'law');assert.match(g.document.title_official,/ΝΟΜΟΣ/);assert.equal(g.document.original_provision_count,20);assert.deepEqual(g.units.map(u=>u.article_number),Array.from({length:20},(_,i)=>String(i+1)));assert.deepEqual(g.units[2].source_pages,[2,3]);assert.deepEqual(g.units[6].source_pages,[3,4]);assert.deepEqual(g.units[13].source_pages,[4,5]);assert.equal(g.document.issued_at_gregorian,'1833-09-23');assert.equal(g.document.published_at_julian,'1833-09-14');assert.equal(g.document.published_at_gregorian,'1833-09-26');assert.match(g.units[18].text,/αφ’ ης ημέρας δημοσιευθή/);assert.equal(g.references.length,10);assert.equal(g.references[0].target_canonical_id,id+':article:2');assert.match(g.references[0].raw_text,/§\. 2/);assert.equal(g.references[0].paragraph,null);assert.equal(g.references[1].target_canonical_id,id+':article:5');assert.equal(g.references[2].target_canonical_id,id+':article:6');assert.deepEqual(g.references.slice(3).map(r=>r.target_canonical_id),Array.from({length:7},(_,i)=>id+':article:'+(i+5)));assert.equal(new Set(g.references.slice(3).map(r=>r.raw_text)).size,1);assert.ok(g.references.every(r=>g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)&&g.units.some(u=>u.id===r.target_canonical_id)));assert.equal(g.units.filter(u=>u.unit_type==='paragraph').length,0);assert.match(g.units[3].text,/κύοντα αριθμόν/);assert.match(g.document.transcription_note,/Absatz 3/);assert.match(g.document.transcription_note,/δεν διορθώνεται εικαστικά σε 6/);
});

test('press-police guarantees, periodical definition and transition periods remain original text while the complete Gazette is separately scanned',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='law:press_police:1833'));assert.match(g.units[5].text,/5000 Δραχ/);assert.match(g.units[6].text,/τόκον 4 %/);assert.match(g.units[7].text,/100–500/);assert.match(g.units[8].text,/4 εβδομάδας/);assert.match(g.units[9].text,/προ της διανομής και αποστολής/);assert.match(g.units[10].text,/συνήθη της καταχωρίσεως δικαιώματα/);assert.match(g.units[12].text,/συχνότερα παρ’ άπαξ του μηνός/);assert.match(g.units[15].text,/πεντήκοντα ισοδυναμεί με μιάς εβδομάδος/);assert.match(g.units[17].text,/τριών μηνών/);assert.match(g.units[19].text,/ημερών τριάκοντα/);assert.match(g.units[19].text,/εντός τριών ημερών/);const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:29:1833'));assert.equal(issue.document.source_page_count,12);assert.equal(issue.document.text_coverage,'scan_only');assert.equal(issue.document.source_text,null);assert.equal(issue.units.length,0);assert.equal(issue.document.issued_at_gregorian,null);assert.match(issue.document.transcription_note,/δεν δημοσιεύονται στο φύλλο/);assert.ok(entries.find(e=>e.id==='royal_decree:printing_lithography_booktrade_licensing:1833').related.includes(g.document.canonical_id));
});

test('press-abuse offences law retains 35 original articles, actual act date, page continuations and nested list scopes',()=>{
 const id='law:press_abuse_offences:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.type,'law');assert.match(g.document.title_official,/ΝΟΜΟΣ/);assert.equal(g.document.original_provision_count,35);assert.deepEqual(g.units.map(u=>u.article_number),Array.from({length:35},(_,i)=>String(i+1)));assert.deepEqual(g.units[13].source_pages,[6,7]);assert.deepEqual(g.units[29].source_pages,[8,9]);assert.deepEqual(g.units.map(u=>u.source_page),[5,...Array(13).fill(6),...Array(7).fill(7),...Array(9).fill(8),...Array(5).fill(9)]);assert.equal([...g.units[15].text.matchAll(/^[α-γ]΄\./gm)].length,3);assert.equal([...g.units[27].text.matchAll(/^[α-ε]΄\./gm)].length,5);assert.deepEqual([...g.units[29].text.matchAll(/^(\d)\./gm)].map(m=>m[1]),['1','2','3']);assert.ok(g.units.every(u=>u.unit_type==='article'&&u.parent_id===null));assert.equal(g.document.issued_at_julian,'1833-09-06');assert.equal(g.document.issued_at_gregorian,'1833-09-18');assert.equal(g.document.published_at_gregorian,'1833-09-26');assert.match(g.units[34].text,/αφ’ ης ημέρας δημοσιευθή/);assert.match(g.document.source_text,/Εξεδόθη εν Ναυπλίω/);assert.ok(entries.indexOf(entries.find(e=>e.id===id))<entries.indexOf(entries.find(e=>e.id==='law:press_police:1833')));
});

test('press-abuse citations retain Greek 14–19 range, independent overlapping scopes and exact original subitem evidence',()=>{
 const id='law:press_abuse_offences:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.references.length,24);const targets=n=>g.references.filter(r=>r.from_unit_id===id+':article:'+n).map(r=>r.target_canonical_id);assert.deepEqual(targets(12),[9,10,11].map(n=>id+':article:'+n));assert.deepEqual(targets(19),[16,17,18,17,18].map(n=>id+':article:'+n));assert.deepEqual(targets(20),[14,15,16,17,18,19].map(n=>id+':article:'+n));assert.match(g.units[19].text,/τα άρθρα 14–19/);assert.match(g.document.transcription_note,/γερμανική έχει 14–18/);assert.deepEqual(targets(29),[id+':article:28']);assert.match(g.references.find(r=>r.from_unit_id===id+':article:29').raw_text,/Αρ\. 5/);assert.deepEqual(targets(31),[28,30].map(n=>id+':article:'+n));assert.ok(g.references.filter(r=>r.from_unit_id===id+':article:31').every(r=>r.raw_text.endsWith('Αρ. 1 και 2')));assert.deepEqual(targets(33),[id+':article:27']);assert.ok(g.references.every(r=>r.paragraph===null&&g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)));assert.ok(g.references.every(r=>r.document_canonical_id!==id||g.units.some(u=>u.id===r.target_canonical_id)));
});

test('companion press acts link reciprocally while historical liability, limitation and remaining scan coverage stay explicit',()=>{
 const id='law:press_abuse_offences:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.match(g.units[22].text,/εντός οκτώ ημερών/);assert.match(g.units[24].text,/η δήμευσις/);assert.match(g.units[25].text,/πολιτική κατηγορία/);assert.match(g.units[26].text,/αφού εκτελεσθούν/);assert.match(g.units[28].text,/Αρ\. 5 του άρθρου 28/);assert.match(g.units[29].text,/υπεγράφη παρ’ αυτού ιδιοχείρως/);assert.match(g.units[32].text,/έξ μήνες/);const other=g.references.find(r=>r.document_canonical_id!==id);assert.equal(other.target_canonical_id,'law:press_police:1833');assert.equal(other.article,null);for(const target of ['law:press_police:1833','royal_decree:printing_lithography_booktrade_licensing:1833','fek:Α:29:1833'])assert.ok(entries.find(e=>e.id===target).related.includes(id));const scan=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:29:1833'));assert.equal(scan.document.source_page_count,12);assert.equal(scan.units.length,0);assert.match(scan.document.transcription_note,/35 άρθρων/);assert.match(scan.document.transcription_note,/η απόφαση νέων οδών στις σελίδες 9–10/);
});

test('Gazette 29 roads retain seven source routes, exact route-2 link and independently selectable unnumbered implementation',()=>{
 const id='royal_decision:new_roads_network:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.type,'royal_decision');assert.equal(g.document.original_provision_count,7);assert.deepEqual(g.units.map(u=>u.navigation_number),['1','2','3','4','5','6','7','implementation']);assert.deepEqual(g.units.slice(0,7).map(u=>u.original_label),['α΄.','β΄.','γ΄.','δ΄.','ε΄.','ϛ΄.','ζ΄.']);assert.equal(g.units.at(-1).unit_type,'body');assert.equal(g.units.at(-1).article_number,null);assert.deepEqual(g.units.at(-1).source_pages,[9,10]);assert.equal([...g.units.at(-1).text.matchAll(/^[α-δ]΄\./gm)].length,4);assert.match(g.units.at(-1).text,/εντός 15 ημερών/);assert.match(g.document.transcription_note,/14 ημέρες/);assert.match(g.units[1].text,/Μεγαλοπόλεως και Τριπόλεως εις Κόρινθον/);assert.match(g.units[5].text,/Ζητούνιον/);assert.match(g.units.at(-1).text,/πρέπει να αρχίση από των λιμένων/);assert.equal(g.document.issued_at_gregorian,'1833-08-28');assert.equal(g.document.published_at_gregorian,'1833-09-26');assert.equal(g.references.length,1);assert.equal(g.references[0].from_unit_id,id+':article:3');assert.equal(g.references[0].target_canonical_id,id+':article:2');assert.ok(g.units[2].text.includes(g.references[0].raw_text));
});

test('civil-administration notice preserves fourteen Greek entries and five cited dates without invented issue dates or German-only personnel',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='appointment_notice:civil_administration_transfers_gazette29:1833'));assert.equal(g.units.length,1);assert.equal(g.units[0].unit_type,'body');assert.deepEqual(g.units[0].source_pages,[10,11]);assert.equal(g.units[0].text.split('\n\n').length,14);assert.equal(g.document.issued_at_gregorian,null);assert.equal(g.document.chronology_key,'1833-09-26');assert.equal(g.references.length,0);for(const text of ['29 Ιουλίου (10 Αυγούστου)','21 Αυγούστου (2 Σεπτεμβρ.)','24 Αυγούστου (5 Σεπτεμβρίου)','27 Αυγούστ. (8 Σεπτεμβ.)','29 Αυγούστ. (10 Σεπτεμ.)','Μοναρχίδης','Ζαΐμης','Θεοχάρης','Περίδης','Νέγκας'])assert.ok(g.units[0].text.includes(text));assert.doesNotMatch(g.units[0].text,/Περραιβός/);assert.match(g.document.transcription_note,/γερμανική/);
});

test('gendarmerie ranks preserve four source groups, 35 names, two unfilled posts and exact pending decree 5018',()=>{
 const id='appointment_notice:gendarmerie_officer_ranks:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.deepEqual(g.units.map(u=>u.navigation_number),['appointment','1','2','3','4']);assert.equal(g.units[0].id,id+':body');assert.equal(g.units[0].unit_type,'body');assert.deepEqual(g.units.slice(1).map(u=>u.article_number),['1','2','3','4']);assert.deepEqual(g.units[3].source_pages,[11,12]);assert.deepEqual(g.units.slice(1,4).map(u=>[...u.text.matchAll(/^\d+\)/gm)].length),[10,10,14]);assert.match(g.units[2].text,/ενδεκάτη και δωδεκάτη θέσις μένουν κεναί/);assert.match(g.units[2].text,/ηυξημένος κατά δύο/);assert.match(g.units[4].text,/Γεώργιος Παπαδόπουλος/);assert.equal(g.document.issued_at_gregorian,null);assert.equal(g.document.published_at_gregorian,'1833-09-26');assert.equal(g.references.length,1);assert.equal(g.references[0].from_unit_id,id+':body');assert.equal(g.references[0].document_number,'5018');assert.equal(g.references[0].target_canonical_id,'royal_decree:5018:1833');assert.equal(entries.some(e=>e.id===g.references[0].target_canonical_id),false);assert.ok(g.units[0].text.includes(g.references[0].raw_text));
});

test('district placement preserves ten NOMOS administrative headings, Greek name differences and distinct pending decree 5201',()=>{
 const id='appointment_notice:gendarmerie_officer_distribution:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.type,'appointment_notice');assert.equal(g.units.length,1);assert.equal(g.units[0].article_number,null);assert.deepEqual(g.units[0].source_pages,[12]);assert.equal([...g.units[0].text.matchAll(/^ΝΟΜΟΣ /gm)].length,10);assert.equal([...g.units[0].text.matchAll(/^Μητρόπολις,/gm)].length,10);assert.match(g.units[0].text,/ΝΟΜΟΣ ΜΕΣΣΗΝΙΑΣ\.\n\nΜητρόπολις, Αρκαδία/);assert.match(g.units[0].text,/Γεώργιος Βελέντζας/);assert.match(g.units[0].text,/Συνετάκης/);const ranks=buildHistoricalGraph(entries.find(e=>e.id==='appointment_notice:gendarmerie_officer_ranks:1833'));assert.match(ranks.units[1].text,/Ιωάννης Βελέντζας/);assert.match(ranks.units[3].text,/Σινετάκης/);assert.equal(g.document.issued_at_gregorian,null);assert.equal(g.references[0].document_number,'5201');assert.equal(g.references[0].target_canonical_id,'royal_decree:5201:1833');assert.equal(entries.some(e=>e.id===g.references[0].target_canonical_id),false);assert.ok(g.units[0].text.includes(g.references[0].raw_text));const formation=entries.find(e=>e.id==='royal_decree:gendarmerie_formation:1833');assert.ok(formation.related.includes(id));assert.ok(formation.related.includes(ranks.document.canonical_id));const issue=entries.find(e=>e.id==='fek:Α:29:1833');assert.equal(issue.related.length,7);assert.match(issue.transcription_note,/επτά|προσωρινή τοποθέτηση/);assert.match(issue.transcription_note,/5018 και 5201 δεν δημοσιεύονται/);
});

test('Gazette 30 exchange implementation retains all seven lettered sections and its separately selectable cited preamble',()=>{
 const id='royal_decree:old_copper_exchange_implementation:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.type,'royal_decree');assert.equal(g.document.original_provision_count,7);assert.deepEqual(g.units.map(u=>u.navigation_number),['origins','1','2','3','4','5','6','7']);assert.equal(g.units[0].id,id+':body');assert.equal(g.units[0].article_number,null);assert.deepEqual(g.units.slice(1).map(u=>u.original_label),['Α.','Β.','Γ.','Δ.','Ε.','Ϛ.','Ζ.']);assert.deepEqual(g.units[3].source_pages,[1,2]);assert.equal([...g.units[3].text.matchAll(/^[α-ωϛ]΄\./gm)].length,9);assert.match(g.units[3].text,/Χρυσανθάκη/);assert.match(g.units[3].text,/Γ\. Στήνω/);assert.match(g.units[2].text,/προς 80 %/);assert.match(g.units[5].text,/την 12 Οκτωβρίου/);assert.match(g.units[5].text,/την 15 Οκτωβρίου/);assert.match(g.units[5].text,/2 Δραχ\. και 50 Λεπ\. την οκάν/);assert.match(g.units[6].text,/καταρίθμησις και φακέλλωσις/);assert.match(g.units[7].text,/άνευ τινός περιορισμού/);assert.equal(g.document.issued_at_julian,'1833-09-19');assert.equal(g.document.issued_at_gregorian,'1833-10-01');assert.equal(g.document.published_at_gregorian,'1833-10-05');assert.match(g.document.source_text,/Το παρόν Διάταγμα θέλει δημοσιευθή/);assert.equal(g.units.filter(u=>u.unit_type==='paragraph').length,0);
});

test('later copper-exchange references preserve evidence and link both real earlier decrees without rewriting their conflicting April date',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:old_copper_exchange_implementation:1833'));assert.equal(g.references.length,2);assert.deepEqual(g.references.map(r=>r.target_canonical_id),['royal_decree:monetary_system:1833','royal_decree:old_copper_exchange_extension:1833']);assert.ok(g.references.every(r=>r.from_unit_id===g.units[0].id&&r.article===null&&r.paragraph===null&&g.units[0].text.includes(r.raw_text)));const old=entries.find(e=>e.id==='royal_decree:old_copper_exchange_extension:1833');assert.match(old.signature,/23 Απριλίου \(3 Μαΐου\)/);assert.match(g.units[0].text,/21 Απριλίου \(3 Μαΐου\)/);assert.match(g.document.transcription_note,/23 Απριλίου \(3 Μαΐου\)/);assert.ok(old.related.includes(g.document.canonical_id));assert.ok(entries.find(e=>e.id==='royal_decree:monetary_system:1833').related.includes(g.document.canonical_id));
});

test('postal notice keeps its independent date and stable contract identity while the issue scan declares remaining untranscribed text',()=>{
 const id='ministerial_notice:feraldi_postal_contract_publication:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.type,'ministerial_notice');assert.equal(g.units.length,1);assert.equal(g.units[0].unit_type,'body');assert.deepEqual(g.units[0].source_pages,[2]);assert.equal(g.document.issued_at_gregorian,'1833-09-19');assert.equal(g.document.published_at_gregorian,'1833-10-05');assert.match(g.units[0].text,/Φεράλδη/);assert.match(g.units[0].text,/Τεργέστιον, Μασσαλίαν, Σμύρνην και Αλεξάνδρειαν/);assert.equal(g.references.length,1);assert.equal(g.references[0].target_canonical_id,'public_contract:feraldi_postal_ships:1833');assert.equal(entries.some(e=>e.id===g.references[0].target_canonical_id),true);assert.ok(g.units[0].text.includes(g.references[0].raw_text));const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:30:1833'));assert.equal(issue.units.length,0);assert.equal(issue.document.text_coverage,'scan_only');assert.equal(issue.document.source_text,null);assert.equal(issue.document.source_page_count,12);assert.equal(issue.document.issued_at_gregorian,null);assert.equal(issue.document.published_at_julian,'1833-09-23');assert.equal(issue.document.published_at_gregorian,'1833-10-05');assert.match(issue.document.transcription_note,/και τα οκτώ ελληνικά κείμενα/);
});

test('Feraldi contract retains 21 authentic Greek articles, exact page continuations and its separate signature date',()=>{
 const id='public_contract:feraldi_postal_ships:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.type,'public_contract');assert.equal(g.document.original_provision_count,21);assert.deepEqual(g.units.map(u=>u.article_number),Array.from({length:21},(_,i)=>String(i+1)));assert.deepEqual(g.units[0].source_pages,[2,3]);assert.deepEqual(g.units[7].source_pages,[3,4]);assert.deepEqual(g.units[15].source_pages,[4,5]);assert.ok(g.units.every(u=>u.unit_type==='article'&&u.parent_id===null));assert.equal(g.document.issued_at_julian,'1833-08-29');assert.equal(g.document.issued_at_gregorian,'1833-09-10');assert.equal(g.document.published_at_gregorian,'1833-10-05');assert.match(g.document.source_text,/Φ\. ΦΕΡΑΛΔΗΣ\. ΙΩΑΝ\. ΜΙΣΣΙΟΣ/);assert.match(g.document.source_text,/Θεωρηθέν εγκρίνεται/);assert.equal(g.document.text_coverage,'complete_greek_transcription');
});

test('Feraldi Greek navigation, crew, schedules and liability preserve the source without importing German-only article rules',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='public_contract:feraldi_postal_ships:1833'));assert.match(g.units[0].text,/100 έως 140 τονέλων/);assert.match(g.units[0].text,/τα δύο τρίτα/);for(const port of ['Μασσαλίαν','Σμύρνην','Αλεξάνδρειαν','Τεργέστιον','Μάλταν','Κέρκυραν'])assert.ok(g.units[3].text.includes(port));assert.equal(g.units[5].text.split('\n\n').length,3);assert.match(g.units[5].text,/29 του παρόντος μηνός/);assert.match(g.units[5].text,/εικοσιπέντε ημέρας/);assert.match(g.units[10].text,/εικοσαπλάσιον/);assert.match(g.units[10].text,/θέλει αποβάλλεται/);assert.match(g.units[11].text,/ο εις άναυλος, ο δε άλλος επί το μισόναυλον/);assert.match(g.units[14].text,/24 ωρών/);assert.match(g.units[14].text,/εορτασίμων ημερών/);assert.match(g.units[16].text,/ημερολόγιόν/);assert.doesNotMatch(g.units[16].text,/υπερφορτωτή|υποπλοίαρχ/);assert.match(g.units[17].text,/δύο ολοκλήρους χρόνους/);assert.match(g.units[19].text,/τελωνιακών δικαιωμάτων χωρίς εξαίρεσιν/);assert.equal(g.references.some(r=>r.from_unit_id===g.document.canonical_id+':article:2'),false);
});

test('Feraldi references preserve exact tariff and French article 296 scopes with no fabricated code edition year',()=>{
 const id='public_contract:feraldi_postal_ships:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.references.length,3);assert.equal(g.references[0].target_canonical_id,'postal_regulation:feraldi_postal_service:1833');const rs=g.references.slice(1);assert.ok(rs.every(r=>r.document_canonical_id==='legal_code:french_commercial_code:undated'&&r.document_year==='undated'));assert.equal(rs[0].article,'296');assert.equal(rs[0].target_canonical_id,'legal_code:french_commercial_code:undated:article:296');assert.equal(rs[1].article,null);assert.equal(rs[1].target_canonical_id,'legal_code:french_commercial_code:undated');assert.ok(g.references.every(r=>r.paragraph===null&&g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)));assert.ok(entries.some(e=>e.id===g.references[0].document_canonical_id));assert.ok(g.references.slice(1).every(r=>!entries.some(e=>e.id===r.document_canonical_id)));
});

test('Feraldi publication reference resolves to the original pending identity without assigning its later notice date to the contract',()=>{
 const id='public_contract:feraldi_postal_ships:1833',c=entries.find(e=>e.id===id),n=entries.find(e=>e.id==='ministerial_notice:feraldi_postal_contract_publication:1833'),g=buildHistoricalGraph(n);assert.equal(g.references[0].target_canonical_id,id);assert.equal(g.document.issued_at_gregorian,'1833-09-19');assert.equal(c.issued_at_gregorian,'1833-09-10');assert.ok(c.related.includes(n.id));assert.ok(n.related.includes(id));assert.ok(entries.indexOf(c)<entries.indexOf(n));const issue=entries.find(e=>e.id==='fek:Α:30:1833');assert.ok(issue.related.includes(id));assert.match(issue.transcription_note,/21 άρθρων στις σελίδες 2–5/);assert.match(issue.transcription_note,/ο κανονισμός 16 άρθρων με δρομολόγια και πίνακα ναύλων/);
});

test('postal regulation retains sixteen original articles and selectable unnumbered schedules and tariff with actual page boundaries',()=>{
 const id='postal_regulation:feraldi_postal_service:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.type,'postal_regulation');assert.equal(g.document.original_provision_count,16);assert.equal(g.units.length,17);assert.deepEqual(g.units.map(u=>u.navigation_number),['timetable_tariff',...Array.from({length:16},(_,i)=>String(i+1))]);assert.equal(g.units[0].id,id+':body');assert.equal(g.units[0].article_number,null);assert.deepEqual(g.units[0].source_pages,[5,6]);assert.deepEqual(g.units[7].source_pages,[6,7]);assert.ok(g.units.slice(1).every(u=>u.unit_type==='article'&&u.parent_id===null));assert.equal(g.document.issued_at_julian,'1833-08-29');assert.equal(g.document.issued_at_gregorian,'1833-09-10');assert.equal(g.document.published_at_gregorian,'1833-10-05');assert.match(g.document.source_text,/ΙΩΑΝ\. ΜΙΣΣΙΟΣ\. Φ\. ΦΕΡΑΛΔΗΣ/);assert.equal(g.references.length,0);
});

test('postal tariff preserves all twelve cabin and deck pairs, half fare under five, exact fractions and original meal charges',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='postal_regulation:feraldi_postal_service:1833'));const pairs=g.units[0].text.split('\n\n').map(t=>t.match(/ · (\d+) · (\d+)$/)).filter(Boolean).map(m=>[Number(m[1]),Number(m[2])]);assert.deepEqual(pairs,[[48,24],[100,50],[52,26],[36,18],[72,36],[36,18],[16,8],[48,24],[32,16],[20,10],[70,35],[50,25]]);assert.match(g.units[0].text,/μικρότερα των πέντε χρόνων παιδιά/);assert.match(g.units[0].text,/τα ήμισα των ανωτέρω τιμών/);assert.match(g.units[0].text,/κάθε 25 ημέρας/);assert.match(g.units[0].text,/12 περίπου ώρας/);assert.match(g.units[0].text,/8 ημέρας εις Αλεξάνδρειαν/);assert.match(g.units[1].text,/1\/2 τοις %/);assert.match(g.units[1].text,/3\/4 τοις %/);assert.match(g.units[1].text,/μόνον 1\/4,/);assert.doesNotMatch(g.units[1].text,/1\/4\s*%/);assert.match(g.units[7].text,/εν κιβώτιον και εν στρώμα/);assert.match(g.units[11].text,/χάνει την οποίαν έδωσαν πληρωμήν/);assert.match(g.units[13].text,/τρεις Δραχμάς την ημέραν/);assert.match(g.units[14].text,/μία και ημισεία Δραχ/);assert.match(g.units[16].text,/να μαγειρεύη την τροφήν του/);
});

test('contract tariff resolves to its stable regulation identity while only French-code scopes remain pending',()=>{
 const id='postal_regulation:feraldi_postal_service:1833',c=entries.find(e=>e.id==='public_contract:feraldi_postal_ships:1833'),g=buildHistoricalGraph(c),reg=entries.find(e=>e.id===id);assert.equal(g.references[0].target_canonical_id,id);assert.equal(g.references[0].article,null);assert.ok(c.related.includes(id));assert.ok(reg.related.includes(c.id));assert.match(c.transcription_note,/συνδέεται πλέον στον πλήρη κανονισμό/);const missing=g.references.filter(r=>!entries.some(e=>e.id===r.document_canonical_id));assert.equal(missing.length,2);assert.ok(missing.every(r=>r.document_canonical_id==='legal_code:french_commercial_code:undated'));const issue=entries.find(e=>e.id==='fek:Α:30:1833');assert.ok(issue.related.includes(id));assert.match(issue.transcription_note,/κανονισμός 16 άρθρων/);assert.match(issue.transcription_note,/και τα οκτώ ελληνικά κείμενα/);
});


test('postal letters decree preserves 24 articles, date discrepancy, tariff structure and source page continuations',()=>{
 const id='royal_decree:postal_ship_letters:1833',e=entries.find(e=>e.id===id),g=buildHistoricalGraph(e);
 assert.equal(g.document.text_coverage,'complete_greek_transcription');assert.equal(g.document.original_provision_count,24);assert.deepEqual(g.units.map(u=>u.article_number),Array.from({length:24},(_,i)=>String(i+1)));assert.ok(g.units.every(u=>u.unit_type==='article'&&u.parent_id===null));
 for(const [n,pages] of [[1,[7,8]],[9,[8,9]],[22,[10,11]]])assert.deepEqual(g.units[n-1].source_pages,pages);
 assert.equal(g.document.issued_at_julian,'1833-08-26');assert.equal(g.document.issued_at_gregorian,'1833-09-07');assert.equal(g.document.published_at_gregorian,'1833-10-05');assert.match(g.document.transcription_note,/Δεν διορθώνεται σιωπηρά/);
 assert.match(g.units[10].text,/Δραχ\. 50/);assert.match(g.units[10].text,/εξ μήνες/);assert.match(g.units[16].text,/μέχρι 6 γραμμών/);assert.match(g.units[16].text,/βάρος τριών γραμμών/);assert.match(g.units[16].text,/ανά 1\/5/);assert.equal([...g.units[16].text.matchAll(/ανά 1\/10/g)].length,2);assert.deepEqual([...g.units[16].text.matchAll(/^(?:[1-8]\)) .*?(?:Λεπ\.|») (\d+)/gm)].map(x=>Number(x[1])),[30,30,40,40,10,20,15,30]);assert.match(g.units[18].text,/1\/5/);assert.match(g.units[20].text,/εικοσαπλάσιον/);assert.match(g.units[21].text,/100–500/);
});

test('postal decree grouped internal targets resolve and its separately dated declaration is not confused with publication notice',()=>{
 const id='royal_decree:postal_ship_letters:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.references.length,7);assert.ok(g.references.every(r=>g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)));
 const internal=g.references.filter(r=>r.document_canonical_id===id);assert.equal(internal.length,5);assert.ok(internal.every(r=>g.units.some(u=>u.id===r.target_canonical_id)));assert.deepEqual(internal.filter(r=>r.from_unit_id===id+':article:14').map(r=>r.target_canonical_id),[7,8].map(n=>id+':article:'+n));
 const pending=g.references.filter(r=>!entries.some(e=>e.id===r.document_canonical_id));assert.equal(pending.length,1);assert.equal(pending[0].document_canonical_id,'ministerial_declaration:postal_ships:1833');assert.equal(pending[0].article,null);assert.equal(g.references.at(-1).document_canonical_id,'public_contract:feraldi_postal_ships:1833');assert.equal(g.references.at(-1).article,null);
 for(const related of entries.find(e=>e.id===id).related)assert.ok(entries.find(e=>e.id===related).related.includes(id));
});


test('mill circular retains eleven original numbers, rationale body, page scopes and financial rules',()=>{
 const id='ministerial_circular:leased_mill_construction:1833',e=entries.find(e=>e.id===id),g=buildHistoricalGraph(e);assert.equal(g.units.length,12);assert.equal(g.units[0].unit_type,'body');assert.equal(g.units[0].navigation_number,'origins');assert.deepEqual(g.units.slice(1).map(u=>u.original_label),Array.from({length:11},(_,i)=>String(i+1)+'.'));assert.deepEqual(g.units.map(u=>u.source_page),Array(7).fill(11).concat(Array(5).fill(12)));assert.equal(g.document.original_provision_count,11);assert.equal(g.document.issued_at_gregorian,'1833-09-25');assert.equal(g.document.published_at_gregorian,'1833-10-05');assert.match(g.units[3].text,/10 %/);assert.match(g.units[4].text,/20 %/);assert.match(g.units[5].text,/10 %/);assert.match(g.units[5].text,/δύο εκτιμητών/);assert.match(g.units[10].text,/δύο προθεσμίας/);assert.match(g.units[11].text,/επιτοπίου φόρου/);assert.equal(g.units.filter(u=>u.unit_type==='paragraph').length,0);
});

test('mill circular expands each of its three grouped citations into all three exact internal articles',()=>{
 const id='ministerial_circular:leased_mill_construction:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.references.length,9);for(const n of [6,10,11]){const rs=g.references.filter(r=>r.from_unit_id===id+':article:'+n);assert.deepEqual(rs.map(r=>r.target_canonical_id),[3,4,5].map(t=>id+':article:'+t));assert.equal(new Set(rs.map(r=>r.raw_text)).size,1);assert.ok(rs.every(r=>g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)&&g.units.some(u=>u.id===r.target_canonical_id)&&r.paragraph===null));}
});

test('final Gazette 30 notices preserve unnumbered scopes, distinct deadlines and auction dates without invented citations',()=>{
 const ids=['ministerial_notice:amfissa_olive_ownership_claims:1833','ministerial_notice:attica_olive_revenue_auction:1833'],gs=ids.map(id=>buildHistoricalGraph(entries.find(e=>e.id===id)));assert.deepEqual(gs.map(g=>g.document.issued_at_gregorian),['1833-09-24','1833-10-02']);for(const g of gs){assert.equal(g.units.length,1);assert.equal(g.units[0].unit_type,'body');assert.equal(g.units[0].article_number,null);assert.equal(g.units[0].navigation_number,null);assert.deepEqual(g.units[0].source_pages,[12]);assert.equal(g.references.length,0);assert.equal(g.document.published_at_gregorian,'1833-10-05');}
 for(const re of [/4 μηνών/,/40 ημερών/,/τριάκοντα ημερών/,/πρωτοτύπους τίτλους/])assert.match(gs[0].units[0].text,re);for(const re of [/την 5 του Οκτωβρ/,/την 12/,/εθνικών και συλλογικών/,/ιδιοκτήτων ελαιοδένδρων/])assert.match(gs[1].units[0].text,re);
 const issue=entries.find(e=>e.id==='fek:Α:30:1833');assert.equal(issue.related.length,8);assert.ok(issue.related.every(id=>entries.some(e=>e.id===id&&e.coverage==='complete_greek_transcription')));assert.match(issue.transcription_note,/και τα οκτώ ελληνικά κείμενα/);for(const id of ids)for(const target of entries.find(e=>e.id===id).related)assert.ok(entries.find(e=>e.id===target).related.includes(id));
});


test('Gazette 31 exchange decree keeps ten geographic groups and 44 places within its original unnumbered body',()=>{
 const id='royal_decree:regional_copper_exchange_offices:1833',e=entries.find(e=>e.id===id),g=buildHistoricalGraph(e);assert.equal(g.units.length,1);assert.equal(g.units[0].unit_type,'body');assert.equal(g.units[0].article_number,null);assert.equal(g.units[0].navigation_number,null);assert.deepEqual(g.units[0].source_pages,[1,2,3]);assert.deepEqual([...g.units[0].text.matchAll(/^(\d+)\) Διά τον Νομόν/gm)].map(x=>x[1]),Array.from({length:10},(_,i)=>String(i+1)));assert.equal([...g.units[0].text.matchAll(/^Εις /gm)].length,44);assert.match(g.units[0].text,/Διά τας λοιπάς νήσους/);assert.match(g.units[0].text,/να ενεργήση το παρόν Διάταγμα/);assert.equal(g.document.issued_at_gregorian,'1833-10-05');assert.equal(g.document.published_at_gregorian,'1833-10-16');assert.equal(g.references.length,2);const prior='royal_decree:old_copper_exchange_implementation:1833';assert.deepEqual(g.references.map(r=>r.target_canonical_id),[prior+':article:4',prior]);assert.ok(g.references.every(r=>g.units[0].text.includes(r.raw_text)));
});

test('Tinos dissolution preserves five clauses, selected legal basis and distinct founding-decision scopes',()=>{
 const id='royal_decision:tinos_extraordinary_military_court_dissolution:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.units.length,6);assert.equal(g.units[0].unit_type,'body');assert.equal(g.units[0].navigation_number,'origins');assert.deepEqual(g.units.slice(1).map(u=>u.original_label),['1.','2.','3.','4.','5.']);assert.ok(g.units.every(u=>u.source_page===3));assert.match(g.units[2].text,/εντός 4 εβδομάδων/);assert.match(g.units[3].text,/όπλα/);assert.match(g.units[3].text,/Σύραν/);assert.match(g.units[4].text,/Καραμπάμπα ή Μονεμβασίαν/);assert.equal(g.document.issued_at_gregorian,'1833-10-10');assert.equal(g.references.length,4);assert.ok(g.references.every(r=>g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)));assert.deepEqual(g.references.map(r=>r.target_canonical_id),['archival_bundle:tinos_court_dissolution_reports:1833','law:extraordinary_military_justice:1833:article:19','royal_decision:tinos_extraordinary_military_court:1833','royal_decision:tinos_extraordinary_military_court:1833:article:6']);assert.equal(entries.some(e=>e.id===g.references[0].document_canonical_id),false);assert.equal(g.references[0].article,null);const founding=entries.find(e=>e.id===g.references[2].target_canonical_id);assert.ok(founding.sections.some(s=>s.number==='6'&&s.text.includes('Όλα τα έξοδα')));assert.ok(founding.related.includes(id));
});

test('Gazette 31 scan has publication dates and honest pending coverage for later texts',()=>{
 const e=entries.find(e=>e.id==='fek:Α:31:1833'),g=buildHistoricalGraph(e);assert.equal(g.document.text_coverage,'scan_only');assert.equal(g.document.source_page_count,12);assert.equal(g.document.source_text,null);assert.equal(g.units.length,0);assert.equal(g.document.issued_at_gregorian,null);assert.equal(g.document.published_at_julian,'1833-10-04');assert.equal(g.document.published_at_gregorian,'1833-10-16');assert.match(g.document.transcription_note,/όλα τα ελληνικά κείμενα χωριστά μεταγραμμένα/);assert.equal(e.related.length,13);for(const id of e.related)assert.ok(entries.find(e=>e.id===id).related.includes(e.id));
});


test('named unnumbered historical closing bodies preserve original order, stable IDs and references without invented articles',()=>{
 const e=structuredClone(entries.find(e=>e.id==='royal_decree:deserters_capture_reward:1833'));e.sections.push({number:'closing',unit_type:'body',navigation_number:'closing',label:'Closing',title:null,text:'See original article 1.',source_page:4});e.expected_indexed_numbers=[...e.sections.slice(0,-1).map(s=>s.navigation_number||s.number),'closing'];e.verified_references=[{from_number:'closing',raw_text:'original article 1',document_type:e.type,document_year:'1833',document_canonical_id:e.id,target_canonical_id:e.id+':article:1',article:'1'}];const g=buildHistoricalGraph(e);const u=g.units.at(-1);assert.equal(u.id,e.id+':body:closing');assert.equal(u.unit_type,'body');assert.equal(u.article_number,null);assert.equal(u.navigation_number,'closing');assert.equal(g.references.at(-1).from_unit_id,u.id);assert.ok(g.document.source_text.indexOf('See original article 1.')>g.document.source_text.indexOf(g.units.at(-2).text));
 const bad=structuredClone(e);delete bad.sections.at(-1).navigation_number;assert.throws(()=>buildHistoricalGraph(bad),/stable navigation alias/);const duplicate=structuredClone(e);duplicate.sections.push(duplicate.sections.at(-1));assert.throws(()=>buildHistoricalGraph(duplicate),/Duplicate/);
});


test('Gazette 31 completion preserves military article sequences, page continuations and original lists',()=>{
 const counts={messolonghi_prefecture_capital:2,invalid_veterans_company:10,engineer_corps_formation:17,artillery_command_organisation:7,deserters_capture_reward:2};for(const [key,count] of Object.entries(counts)){const e=entries.find(e=>e.id==='royal_decree:'+key+':1833'),g=buildHistoricalGraph(e);assert.deepEqual(g.units.filter(u=>u.unit_type==='article').map(u=>u.article_number),Array.from({length:count},(_,i)=>String(i+1)));}
 const eng=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:engineer_corps_formation:1833'));for(const [i,ps] of [[0,[5,6]],[7,[6,7]],[12,[7,8]]])assert.deepEqual(eng.units[i].source_pages,ps);assert.match(eng.units[8].text,/μήτε να λαμβάνη, μήτε να διανέμη χρήματα/);const art=buildHistoricalGraph(entries.find(e=>e.id==='royal_decree:artillery_command_organisation:1833'));assert.equal(art.units[0].navigation_number,'origins');assert.equal(art.units.at(-1).id,art.document.canonical_id+':body:closing');assert.equal(art.units.at(-1).article_number,null);assert.equal(art.document.issued_at_julian,'1833-07-29');assert.match(art.document.signature||art.document.source_text,/9 Ιουλίου/);assert.match(art.document.transcription_note,/29 Jul/);assert.deepEqual(art.units.find(u=>u.article_number==='5').source_pages,[8,9]);
});

test('Sicily and debt forms preserve separate dated notices, original labels, postscripts and exact pending form scopes',()=>{
 const e=entries.find(e=>e.id==='foreign_decree:two_sicilies_greek_shipping:1833'),g=buildHistoricalGraph(e);assert.equal(g.document.issued_at_gregorian,null);assert.equal(g.document.issued_at_julian,null);assert.deepEqual(g.units.slice(0,4).map(u=>u.original_label),['Α΄.','Β΄.','Γ΄.','Δ΄.']);assert.match(g.units[0].text,/21 και 28/);assert.match(g.units.at(-1).text,/30 ημερών/);assert.match(g.units.at(-1).text,/40/);assert.equal(g.references[0].target_canonical_id,e.id+':article:1');
 const f=buildHistoricalGraph(entries.find(e=>e.id==='ministerial_notice:public_property_debt_instruments:1833'));assert.equal(f.units.length,8);assert.equal(f.units.at(-1).navigation_number,'closing');assert.equal(f.references.length,4);assert.deepEqual(f.references.filter(r=>r.document_canonical_id===f.document.canonical_id).map(r=>r.article),['2','4']);assert.equal(f.references.filter(r=>r.document_canonical_id==='legal_annex:public_property_debt_bond_form:1833').length,2);assert.ok(!entries.some(e=>e.id==='legal_annex:public_property_debt_bond_form:1833'));assert.match(f.units[4].text,/δευτέραν του χρέους του απόδοσιν/);
});

test('Gazette 31 final correction opens the exact press and postal targets while original text remains intact',()=>{
 const id='erratum:gazette_thirty_one_corrections:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.units.length,1);assert.deepEqual(g.references.map(r=>r.target_canonical_id),['law:press_police:1833:article:6','law:press_police:1833:article:11','royal_decree:postal_ship_letters:1833:article:10']);for(const r of g.references){const e=entries.find(e=>e.id===r.document_canonical_id);assert.ok(e.related.includes(id));assert.match(e.transcription_note,/φύλλο 31/);}assert.match(g.units[0].text,/αμισθί/);assert.match(g.units[0].text,/πληρόνοντες/);assert.match(entries.find(e=>e.id==='royal_decree:postal_ship_letters:1833').sections.find(s=>s.number==='10').text,/λαμβάνοντες/);
});


test('Court of Audit founding decree preserves 63 primary paragraphs and eight source bodies without fictitious articles',()=>{
 const id='royal_decree:court_of_audit_formation:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.primary_unit_type,'paragraph');assert.equal(g.document.original_provision_count,63);assert.equal(g.units.length,71);assert.deepEqual(g.units.filter(u=>u.unit_type==='paragraph').map(u=>u.paragraph_number),Array.from({length:63},(_,i)=>String(i+1)));assert.ok(g.units.every(u=>u.article_number===null&&u.parent_id===null));assert.equal(g.units.filter(u=>u.unit_type==='body').length,8);assert.deepEqual(g.units.filter(u=>u.unit_type==='body').map(u=>u.navigation_number),['origins','title_a','title_b','title_c','title_d','title_e','title_f','final']);for(const [n,ps] of [[4,[1,2]],[23,[3,4]],[38,[5,6]]])assert.deepEqual(g.units.find(u=>u.paragraph_number===String(n)).source_pages,ps);assert.equal(g.document.issued_at_gregorian,'1833-10-09');assert.equal(g.document.published_at_gregorian,'1833-10-19');
 const unit=n=>g.units.find(u=>u.paragraph_number===String(n));assert.match(unit(12).text,/7200/);assert.match(unit(12).text,/Κλήτωρ · 600/);assert.match(unit(17).text,/30–300/);assert.match(unit(18).text,/12 μήνας/);assert.match(unit(18).text,/οκτώ εβδομάδας/);assert.match(unit(22).text,/30 ημερών/);assert.match(unit(25).text,/24 ωρών/);assert.match(unit(26).text,/Ιανουαρίου 1822/);assert.match(unit(41).text,/50–100/);assert.match(unit(39).text,/αναφέρονται εν συνόψει/);
});

test('Court of Audit citations resolve actual primary paragraph targets including both members of the grouped citation',()=>{
 const id='royal_decree:court_of_audit_formation:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.references.length,4);assert.deepEqual(g.references.map(r=>r.paragraph),['17','19','39','41']);assert.ok(g.references.every(r=>r.article===null&&g.units.some(u=>u.id===r.target_canonical_id)&&g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)));assert.deepEqual(g.references.filter(r=>r.from_unit_id===id+':paragraph:42').map(r=>r.target_canonical_id),[39,41].map(n=>id+':paragraph:'+n));
});

test('Gazette 32 appointments retain seven named posts, pending underlying decision and no invented notice issue date',()=>{
 const id='appointment_notice:court_of_audit_first_members:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.units.length,1);assert.equal(g.units[0].unit_type,'body');assert.equal(g.document.issued_at_gregorian,null);assert.equal(g.document.date_basis,'cited_decision_date_notice_undated');assert.equal(g.references.length,1);assert.equal(g.references[0].target_canonical_id,'royal_decision:court_of_audit_appointments_4_october:1833');assert.ok(!entries.some(e=>e.id===g.references[0].target_canonical_id));assert.equal([...g.units[0].text.matchAll(/Ελεγκτής/g)].length,4);const issue=buildHistoricalGraph(entries.find(e=>e.id==='fek:Α:32:1833'));assert.equal(issue.units.length,0);assert.equal(issue.document.source_text,null);assert.equal(issue.document.source_page_count,8);assert.match(issue.document.transcription_note,/σύνολο των ελληνικών κειμένων/);
});


test('Gazette 33 garden lease keeps eight native lettered paragraphs, explicit planting/rent facts and correct beta-gamma-delta targets',()=>{
 const id='ministerial_proclamation:agios_theodoros_garden_lease:1833',g=buildHistoricalGraph(entries.find(e=>e.id===id));assert.equal(g.document.primary_unit_type,'paragraph');assert.equal(g.units.length,9);assert.deepEqual(g.units.slice(1).map(u=>u.original_label),['Α΄.','Β΄.','Γ΄.','Δ΄.','Ε΄.','Ϛ΄.','Ζ΄.','Η΄.']);assert.ok(g.units.every(u=>u.article_number===null));assert.match(g.units[0].text,/ογδοήκοντα ενός/);assert.match(g.units[3].text,/διακόσια ογδοήκοντα οκτώ/);assert.match(g.units[4].text,/οκτακόσια/);assert.match(g.units[4].text,/150/);assert.match(g.units[4].text,/πεντήκοντα/);assert.match(g.units[6].text,/επτά ίσας δόσεις/);assert.match(g.units[6].text,/τέσσαρα έτη/);assert.equal(g.references.length,4);assert.deepEqual(g.references.map(r=>r.paragraph),['4','2','3','4']);assert.ok(g.references.every(r=>r.article===null&&g.units.find(u=>u.id===r.from_unit_id).text.includes(r.raw_text)&&g.units.some(u=>u.id===r.target_canonical_id)));
});

test('Gazette 33 mill lease and Munich school retain distinct unnumbered and numbered scopes with original quantities and dates',()=>{
 const mill=buildHistoricalGraph(entries.find(e=>e.id==='ministerial_proclamation:argos_kefalari_mills_lease:1833'));assert.equal(mill.units.length,1);assert.equal(mill.units[0].unit_type,'body');assert.deepEqual(mill.units[0].source_pages,[2,3]);for(const re of [/272/,/1512/,/288/,/πέντε δόσεις/,/Ιανουαρίου 1834/,/νεροτριβή/])assert.match(mill.units[0].text,re);const school=buildHistoricalGraph(entries.find(e=>e.id==='ministerial_notice:munich_greek_school_places:1833'));assert.equal(school.units.length,3);assert.deepEqual(school.units.slice(1).map(u=>u.article_number),['1','2']);assert.match(school.units[1].text,/24 θέσεις/);assert.match(school.units[2].text,/ιερεύς Έλλην/);assert.equal(school.document.issued_at_gregorian,'1833-09-14');assert.equal(school.document.published_at_gregorian,'1833-10-25');
});

test('Gazette 33 appointments retain eight shared consular decision dates without fabricated individual assignments and preserve health officer title',()=>{
 const g=buildHistoricalGraph(entries.find(e=>e.id==='appointment_notice:consular_network_gazette33:1833'));assert.equal(g.units.length,1);assert.equal(g.references.length,8);assert.ok(g.references.every(r=>r.from_unit_id===g.units[0].id&&g.units[0].text.includes(r.raw_text)&&r.article===null&&r.paragraph===null));assert.equal(g.document.issued_at_gregorian,null);const h=buildHistoricalGraph(entries.find(e=>e.id==='appointment_notice:nafplio_health_officer_gazette33:1833'));assert.match(h.units[0].text,/Κωνσταντίνος Πολιάδης/);assert.match(h.units[0].text,/Υγειονόμος Ναυπλίας/);assert.equal(h.document.issued_at_gregorian,null);assert.equal(h.references.length,1);const teachers=buildHistoricalGraph(entries.find(e=>e.id==='appointment_notice:aegina_central_school_teachers:1833'));assert.match(teachers.units[0].text,/τρεις Διδάσκαλοι/);
});

test('Gazette 33 full scan links all twelve complete Greek texts and keeps customs commencement relative to local notification',()=>{
 const issue=entries.find(e=>e.id==='fek:Α:33:1833');assert.equal(issue.related.length,12);assert.ok(issue.related.every(id=>entries.some(e=>e.id===id&&e.coverage==='complete_greek_transcription'&&e.related.includes(issue.id))));const gs=issue.related.map(id=>buildHistoricalGraph(entries.find(e=>e.id===id)));assert.equal(gs.flatMap(g=>g.units).length,22);assert.equal(gs.flatMap(g=>g.references).length,19);const customs=gs.find(g=>g.document.canonical_id==='ministerial_notice:eastern_islands_customs:1833');assert.match(customs.units[0].text,/40 ημέρας μετά/);assert.match(customs.units[0].text,/διάφορα τελωνεία/);assert.equal(buildHistoricalGraph(issue).document.source_text,null);
});
