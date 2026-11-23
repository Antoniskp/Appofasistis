'use strict';
require('dotenv').config();
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {buildHistoricalGraph}=require('../src/legal/historical');
const {LawStore}=require('../src/localLaw/store');
const {graphSettings}=require('../src/localLaw/runtime');
const manifest=require('../config/historical-collection.json');
const historicalArchiveHosts=new Set(['api.et.gr','www.hellenicparliament.gr','library.parliament.gr']);
function prepareHistory(directory, entries = manifest.entries) {
 return entries.map(entry=>{
  const pdf=path.join(directory,entry.pdf_filename);
  if(path.basename(entry.pdf_filename)!==entry.pdf_filename)throw Error('Unexpected archive filename');
  const bytes=fs.readFileSync(pdf);
  if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-'))||crypto.createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Historical PDF checksum mismatch: '+entry.id);
  const url=new URL(entry.source_url);
  if(url.protocol!=='https:'||!historicalArchiveHosts.has(url.hostname))throw Error('Unexpected historical publisher');
  return {entry,pdf,graph:buildHistoricalGraph(entry),localFile:crypto.createHash('sha256').update(entry.source_url).digest('hex')+'.pdf'};
 }).sort((a,b)=>a.entry.chronology_key.localeCompare(b.entry.chronology_key)||a.entry.id.localeCompare(b.entry.id));
}
async function main(){
 const {values,positionals}=require('node:util').parseArgs({
  options:{only:{type:'string',multiple:true}},
  allowPositionals:true,
 });
 if(positionals.length>1)throw Error('Expected one historical PDF directory');
 const requested=values.only?.flatMap(value=>value.split(','));
 const entries=requested?manifest.entries.filter(entry=>requested.includes(entry.id)):manifest.entries;
 if(requested&&entries.length!==requested.length)throw Error('Unknown or repeated historical document identity');
 const prepared=prepareHistory(path.resolve(positionals[0]||path.join(__dirname,'../output/historical-laws')),entries);
 const settings=graphSettings();
 const response=await fetch(`http://127.0.0.1:${process.env.INTERNAL_API_PORT||3001}/api/laws/status`);
 if(!response.ok)throw Error('Start the local app first');const status=await response.json();
 if(status.importing||path.resolve(status.dataDirectory)!==settings.dataDirectory)throw Error('The local app is busy or uses another data directory');
 const store=new LawStore(settings);const jobId='historical-'+crypto.randomUUID();
 try{
  await store.ready;const before=await store.stats();
  const backup=path.join(settings.dataDirectory,'backups','greek-laws-before-history-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');await store.backup(backup);
  const files=path.join(settings.dataDirectory,'files');fs.mkdirSync(files,{recursive:true});
  for(const item of prepared)fs.copyFileSync(item.pdf,path.join(files,item.localFile));
  await store.startJob(jobId,{source:'official_historical_archives',collection:'historical_origins',pageSize:prepared.length});
  const saved=await store.saveGraphs(prepared.map(item=>({...item.graph,text_kind:item.entry.text_kind})),'source_text');
  for(const item of prepared){const doc=await store.get(item.entry.id);const a=doc.attachments.find(a=>a.url===item.entry.source_url);await store.markDownloaded(a.id,item.localFile);}
  // Backfill sortable dates without changing older texts, links or personal notes.
  const docs=await store.knownDocuments();
  const dates=docs.map(d=>({id:d.canonical_id,key:String(d.chronology_key||d.published_at||d.law_year||d.document_year||'9999')}));
  await store.write(tx=>tx.run('UNWIND $dates AS item MATCH (d:LegalDocument {namespace:$ns,id:item.id}) SET d.chronology_key=item.key',{dates}));
  const after=await store.stats();await store.finishJob(jobId,{...saved,before,after,backup});
  console.log(JSON.stringify({saved,before,after,backup}));
 }catch(error){await store.finishJob(jobId,null,error.message).catch(()=>{});throw error;}finally{await store.close();}
}
module.exports={prepareHistory};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
