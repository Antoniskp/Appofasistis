'use strict';
require('dotenv').config();
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const manifest=require('../config/recent-laws.json');
const {loadIncorporatedCodes,appendIncorporatedCodes}=require('./incorporated-codes');
const {buildFoundationGraph}=require('./import-basic-laws');
const {LawStore}=require('../src/localLaw/store');
const {graphSettings}=require('../src/localLaw/runtime');
function parseExplicitOwnReferences(text,documentId,currentArticle){
 const refs=[];const outsideQuotes=start=>{let depth=0;for(const q of text.slice(0,start).matchAll(/[«»]/gu))depth=q[0]==='«'?depth+1:Math.max(0,depth-1);return !depth;};
 const add=(match,article,paragraph)=>{if(!outsideQuotes(match.index))return;const [,number,year]=documentId.split(':');refs.push({raw_text:match[0],start:match.index,end:match.index+match[0].length,document_type:'law',document_number:number,document_year:year,document_canonical_id:documentId,target_canonical_id:documentId+':article:'+article+(paragraph?':paragraph:'+paragraph:''),article,paragraph:paragraph||null,relation_type:'mentions',confidence:1,evidence_basis:'explicit_unquoted_present_law_reference'});};
 const ownArticle=/(?:(?:παρ\.|παραγράφ(?:ου|ος))\s+(\d+)\s+του\s+)?άρθρ(?:ο|ου|α|ων)\s+(\d+(?:\s*,\s*\d+|\s+και\s+\d+)*)\s+του\s+παρόντος(?:\s+νόμου)?\b/giu;
 // Greek words do not have JavaScript ASCII word boundaries; check the trailing character explicitly.
 const pattern=new RegExp(ownArticle.source.replace('\\b','(?![\\p{L}\\p{N}])'),ownArticle.flags);
 for(const m of text.matchAll(pattern))for(const n of m[2].matchAll(/\d+/g))add(m,n[0],m[1]||null);
 for(const m of text.matchAll(/(?:παρ\.|παραγράφ(?:ου|ος))\s+(\d+)\s+του\s+παρόντος\s+άρθρου(?![\p{L}\p{N}])/giu))add(m,currentArticle,m[1]);
 return refs;
}
function pageAt(section,offset){return section.page_spans?.find(s=>offset>=s.start&&offset<s.end)?.page||section.source_page;}
function addReviewedCitations(graph, sections, reviews) {
 const sourceId=graph.document.canonical_id;
 for(const {from_article,raw_text,target,target_source_page} of reviews) {
  const section=sections.get(from_article);
  const identity=target.match(/^(law|presidential_decree|eu_regulation):(\d+):(\d{4}):(?:(?:article:(\d+[a-zα-ω]?))|body:annex)(?::paragraph:(\d+))?$/u);
  if(!raw_text || !section?.text.includes(raw_text) || !identity || !Number.isInteger(target_source_page) || target_source_page<1) throw Error('Invalid reviewed citation in '+sourceId);
  const [,document_type,document_number,document_year,article=null,paragraph=null]=identity;
  const document_canonical_id=identity.slice(1,4).join(':');
  const articleId=sourceId+':article:'+from_article;
  for(let start=section.text.indexOf(raw_text);start>=0;start=section.text.indexOf(raw_text,start+raw_text.length)) {
   const child=graph.units.find(unit=>unit.parent_id===articleId && start>=unit.start_offset && start<unit.end_offset);
   const from_unit_id=child?.id||articleId;
   const reviewed={raw_text,start,end:start+raw_text.length,document_type,document_number,document_year,document_canonical_id,
    target_canonical_id:target,article,paragraph,from_document_id:sourceId,from_unit_id,target_source_page,
    relation_type:'mentions',confidence:1,evidence_basis:'reviewed_source_and_target_publications'};
   const existing=graph.references.find(ref=>ref.from_unit_id===from_unit_id && ref.start===start && ref.target_canonical_id===target);
   if(existing) Object.assign(existing,reviewed);
   else graph.references.push(reviewed);
  }
 }
}
function buildRecentGraph(source,entry,known=[],codes=[]){
 if((entry.incorporated_codes||[]).length!==codes.length)throw Error("Required incorporated Code sources missing");
 const graph=buildFoundationGraph(source,known);const id=graph.document.canonical_id;const sections=new Map(source.sections.map(s=>[s.number,s]));
 Object.assign(graph.document,{short_title:entry.short_title,category:entry.category,chronology_key:source.published_at,original_provision_count:entry.article_count,extraction_profile:source.extraction_profile,...(source.coverage_note?{coverage_note:source.coverage_note,text_coverage:source.text_coverage}:{}),...(source.source_edition_note?{source_edition_note:source.source_edition_note}:{}),pdf_only_pages:source.pdf_only_pages||[],reviewed_table_pages:source.reviewed_table_pages||[],recovered_font_pages:source.recovered_font_pages||[],visible_text_corrections:source.visible_text_corrections||[]});
 for(const unit of graph.units){
  const section=sections.get(unit.article_number);
  if(!unit.parent_id){
   unit.original_label=section.original_label;
   unit.source_pages=section.source_pages;
  }else{
   const leadingWhitespace=section.text.slice(unit.start_offset,unit.end_offset).match(/^\s*/u)[0].length;
   const markerOffset=unit.start_offset+leadingWhitespace;
   unit.source_page=pageAt(section,markerOffset);
   unit.source_pages=section.page_spans.filter(span=>span.start<unit.end_offset&&span.end>markerOffset).map(span=>span.page);
  }
 }
 for(const section of source.sections){
  const articleId=id+':article:'+section.number;
  for(const r of parseExplicitOwnReferences(section.text,id,section.number)){
   const child=graph.units.find(u=>u.parent_id===articleId&&r.start>=u.start_offset&&r.start<u.end_offset);
   graph.references.push({...r,from_document_id:id,from_unit_id:child?.id||articleId,source_page:pageAt(section,r.start),evidence_source_url:source.source_url});
  }
 }
 addReviewedCitations(graph,sections,entry.reviewed_citations||[]);
 for(const r of graph.references){const unit=graph.units.find(u=>u.id===r.from_unit_id),s=sections.get(unit.article_number);if(Number.isInteger(r.start))r.source_page=pageAt(s,r.start);r.evidence_source_url=source.source_url;}
 graph.units.push({id:id+':body:closing',document_id:id,parent_id:null,unit_type:'body',navigation_number:'closing',label:'Δημοσίευση και υπογραφές',original_label:'Δημοσίευση και υπογραφές',article_number:null,paragraph_number:null,title:null,text:source.closing.text,position:graph.units.length+1,source_page:source.closing.source_page,source_pages:source.closing.source_pages});
 return codes.length?appendIncorporatedCodes(graph,codes,known,parseExplicitOwnReferences):graph;
}
function prepareRecent(directory,entries=manifest.entries,known=[]){
 const knownDocs=[...known,...entries.map(e=>({canonical_id:'law:'+e.number+':'+e.year}))];
 return entries.map(entry=>{
  if(!/^\d+$/.test(entry.number)||!/^\d{4}$/.test(entry.year)||!Number.isInteger(entry.article_count))throw Error('Invalid recent-law manifest identity');
  const name=`law-${entry.number}-${entry.year}`,source=JSON.parse(fs.readFileSync(path.join(directory,name+'.json'),'utf8')),pdf=path.join(directory,name+'.pdf'),bytes=fs.readFileSync(pdf);
  if(source.number!==entry.number||source.year!==entry.year||source.published_at!==entry.published_at||source.fek_number!==entry.fek_number||source.source_url!==`https://api.et.gr/apiLAW/1/${entry.year}/${entry.number}/pdf`||source.pdf_filename!==name+'.pdf')throw Error('Recent source identity mismatch');
  if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-'))||crypto.createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('Recent source PDF checksum mismatch');
  if(entry.pdf_sha256 && source.sha256!==entry.pdf_sha256)throw Error('Reviewed manifest PDF checksum changed');
  if(entry.pdf_only_pages && (JSON.stringify(source.pdf_only_pages)!==JSON.stringify(entry.pdf_only_pages)||entry.pdf_only_pages.some(page=>!Number.isInteger(page)||page<1||page>source.page_count)))throw Error('Recent PDF-only coverage mismatch');
  if(source.sections.length!==entry.article_count||source.sections.some((s,i)=>s.number!==String(i+1)||!s.text.trim()||!Number.isInteger(s.source_page)||s.source_page<1||s.source_page>source.page_count||!s.page_spans?.length||s.page_spans.some(p=>p.start<0||p.end>s.text.length||p.start>=p.end||p.page<1||p.page>source.page_count)))throw Error('Incomplete recent article sequence or source ranges');
  if(!source.closing?.text.trim()||source.closing.source_page<1||source.closing.source_page>source.page_count)throw Error('Recent publication closing missing');
  const codes=loadIncorporatedCodes(directory,source,entry),graph=buildRecentGraph(source,entry,knownDocs,codes);
  if(entry.topics.some(n=>!graph.units.some(u=>!u.parent_id&&(u.navigation_number||u.article_number)===n)))throw Error('Missing recent-law guide target');
  return {entry,source,pdf,codes,graph};
 });
}
function selectRecentEntries(entries,selection){
 if(selection===undefined)return entries;
 const numbers=selection.split(',');
 if(numbers.some(n=>!/^\d+$/.test(n))||new Set(numbers).size!==numbers.length)throw Error('Invalid recent-law selection');
 const selected=entries.filter(e=>numbers.includes(e.number));
 if(selected.length!==numbers.length)throw Error('Unknown law in recent-law selection');
 return selected;
}
function prepareCurrentConstitution(directory) {
 const source = require('../config/current-constitution.json');
 const pdf = path.join(directory, source.pdf_filename);
 const bytes = fs.readFileSync(pdf);
 if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) || crypto.createHash('sha256').update(bytes).digest('hex') !== source.sha256) {
  throw Error('The Constitution PDF does not match the verified edition');
 }
 const text = source.sections.map(section => section.label + '\n' + section.text).join('\n\n');
 return { source, pdf, graph: buildFoundationGraph({ ...source, text }) };
}
async function main(){
 const { values, positionals } = require('node:util').parseArgs({
  options: { only: {type:'string',multiple:true}, year: {type:'string',multiple:true}, 'current-constitution': {type:'boolean'} },
  allowPositionals: true,
 });
 if(positionals.length>1 || values.only?.length>1 || values.year?.length>1)throw Error('Repeated recent-law option');
 const year=values.year?.[0]||'2026';
 const batch=year==='2026'?manifest:year==='2025'?require('../config/recent-laws-2025.json'):null;
 if(!batch)throw Error('Unknown recent-law publication year');
 const entries=selectRecentEntries(batch.entries,values.only?.[0]);
 const directory=path.resolve(positionals[0]||path.join(__dirname,'../output/laws-'+year));
 const validated=prepareRecent(directory,entries);
 const constitution = values['current-constitution'] ? prepareCurrentConstitution(directory) : null;
 const status=await fetch('http://127.0.0.1:'+(process.env.INTERNAL_API_PORT||3001)+'/api/laws/status').then(r=>r.json()),settings=graphSettings();
 if(status.importing||path.resolve(status.dataDirectory)!==settings.dataDirectory)throw Error('App is busy or uses another data directory');
 const store=new LawStore(settings),jobId='recent-'+crypto.randomUUID();
 try{
  await store.ready;console.error('Preparing recent-law batch');const before=await store.stats(),known=await store.knownDocuments();
  const existingConstitution = constitution && await store.get(constitution.graph.document.canonical_id);
  if (constitution) known.push(constitution.graph.document);
  const prepared=prepareRecent(directory,entries,known);
  if (constitution && existingConstitution?.document.text_kind !== 'source_text') prepared.push(constitution);
  const backup=path.join(settings.dataDirectory,'backups','greek-laws-before-recent-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');console.error('Saving complete graph backup');await store.backup(backup);console.error('Graph backup saved');
  await store.startJob(jobId,{source:'national_printing_office',collection:batch.collection,pageSize:prepared.length});
  const saved=await store.saveGraphs(prepared.map(p=>p.graph),'source_text'),files=path.join(settings.dataDirectory,'files');fs.mkdirSync(files,{recursive:true});
  for(const p of prepared){const d=await store.get(p.graph.document.canonical_id),a=d.attachments.find(a=>a.url===p.source.source_url),name=crypto.createHash('sha256').update(p.source.source_url).digest('hex')+'.pdf';fs.copyFileSync(p.pdf,path.join(files,name));await store.markDownloaded(a.id,name);}
  const after=await store.stats();await store.finishJob(jobId,{...saved,before,after,backup});console.log(JSON.stringify({saved,before,after,backup,records:validated.length}));
 }catch(e){await store.finishJob(jobId,null,e.message).catch(()=>{});throw e;}finally{await store.close();}
}
module.exports={prepareRecent,buildRecentGraph,parseExplicitOwnReferences,selectRecentEntries};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
