'use strict';
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {LawStore} = require('../src/localLaw/store');
const {graphSettings} = require('../src/localLaw/runtime');
const {buildFoundationGraph} = require('./import-basic-laws');
const {prepareCollection} = require('./import-collection-laws');
function prepareBatch(directory) {
  const originals = [[4619,2019],[4855,2021],[5090,2024]].map(([number,year]) => {
    const source = JSON.parse(fs.readFileSync(path.join(directory, `law-${number}-${year}.json`),'utf8'));
    const pdf = path.join(directory, `law-${number}-${year}.pdf`);
    const bytes = fs.readFileSync(pdf);
    if (source.number !== String(number) || source.year !== String(year) || source.source_url !== `https://api.et.gr/apiLAW/1/${year}/${number}/pdf`) throw Error('Source identity mismatch');
    if (!bytes.subarray(0,5).equals(Buffer.from('%PDF-')) || crypto.createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw Error('Source checksum mismatch');
    return {source,pdf,graph:buildFoundationGraph(source)};
  });
  return [...originals,...prepareCollection(directory)].sort((a,b)=>Number(a.source.year)-Number(b.source.year) || Number(a.source.number)-Number(b.source.number));
}
async function main() {
  const directory=path.resolve(process.argv[2] || path.join(__dirname,'../output/legal-foundations'));
  const prepared=prepareBatch(directory); // Verify the complete batch before any database write.
  const settings=graphSettings();
  const status=await fetch(`http://127.0.0.1:${process.env.INTERNAL_API_PORT || 3001}/api/laws/status`).then(r=>r.json());
  if (status.importing || path.resolve(status.dataDirectory)!==settings.dataDirectory) throw Error('The local app is busy or uses another data folder');
  const store=new LawStore(settings);
  const jobId='foundation-batch-'+crypto.randomUUID();
  try {
    await store.ready;
    const before=await store.stats();
    const backup=path.join(settings.dataDirectory,'backups','greek-laws-before-foundations-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
    await store.backup(backup);
    // Stage hash-named PDFs first, so a successful graph transaction has local source files.
    const files=path.join(settings.dataDirectory,'files'); fs.mkdirSync(files,{recursive:true});
    for(const item of prepared) {
      item.localFile=crypto.createHash('sha256').update(item.source.source_url).digest('hex')+'.pdf';
      fs.copyFileSync(item.pdf,path.join(files,item.localFile));
    }
    await store.startJob(jobId,{source:'national_printing_office',collection:'foundation_batch',pageSize:prepared.length});
    const saved=await store.saveGraphs(prepared.map(item=>item.graph),'source_text');
    for(const item of prepared) {
      const doc=await store.get(item.graph.document.canonical_id);
      const attachment=doc.attachments.find(a=>a.url===item.source.source_url);
      if(!attachment) throw Error('Source attachment missing');
      await store.markDownloaded(attachment.id,item.localFile);
      console.log(`${doc.document.canonical_id}: ${doc.units.filter(u=>!u.parent_id).length} articles, ${doc.units.filter(u=>u.parent_id).length} numbered paragraphs`);
    }
    const after=await store.stats();
    await store.finishJob(jobId,{...saved,before,after,backup});
    console.log(JSON.stringify({saved,before,after,backup}));
  }catch(error){await store.finishJob(jobId,null,error.message).catch(()=>{});throw error;}
  finally{await store.close();}
}
module.exports={prepareBatch};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});