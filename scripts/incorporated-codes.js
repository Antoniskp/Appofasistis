'use strict';
const fs = require('node:fs');
const {isDeepStrictEqual}=require('node:util');
const path = require('node:path');
const profiles = require('../config/incorporated-codes.json');
const { splitNumberedParagraphs } = require('../src/legal/paragraphs');
const { parseCodeReferences } = require('../src/legal/codeReferences');
const { parseGreekLegalCitations, resolveGreekLegalReferences } = require('../src/legal/citations');

function loadIncorporatedCodes(directory, source, entry) {
  return (entry.incorporated_codes || []).map(key => {
    const profile = profiles[key];
    if (!profile || profile.document_id !== `law:${source.number}:${source.year}` || profile.sha256 !== source.sha256 || profile.source_url !== source.source_url) throw Error('Incorporated Code source identity mismatch');
    const code = JSON.parse(fs.readFileSync(path.join(directory, profile.filename), 'utf8'));
    if (code.scope_key !== key || Object.entries(profile).some(([k,v]) => !isDeepStrictEqual(code[k],v))) throw Error('Incorporated Code profile mismatch');
    const expectedCoverage = profile.text_coverage || 'ratifying_law_with_partial_incorporated_code';
    const expectedPdfOnlyPages = profile.pdf_only_pages || Array.from({length:source.page_count-profile.boundary_page},(_,i)=>profile.boundary_page+i);
    if (!code.coverage_note || code.text_coverage !== expectedCoverage || !isDeepStrictEqual(code.pdf_only_pages, expectedPdfOnlyPages) || code.pdf_only_pages.some(page => !Number.isInteger(page) || page < 1 || page > source.page_count)) throw Error('Incorporated Code coverage mismatch');
    if (!Array.isArray(code.sections) || code.sections.length !== profile.last_article-profile.first_article+1 || code.sections.some((s,i) => s.number !== String(profile.first_article+i) || profile.reviewed_titles?.[s.number] && (s.title !== profile.reviewed_titles[s.number].title || s.source_page !== profile.reviewed_titles[s.number].source_page) || !s.title || !s.text.startsWith(s.title+'\n') || /[\x00-\x08\x0b-\x1f\x7f]/u.test(s.text) || !s.page_spans?.length || s.source_page !== s.page_spans[0].page || JSON.stringify(s.source_pages) !== JSON.stringify(s.page_spans.map(p=>p.page)) || s.page_spans.some((p,j) => !Number.isInteger(p.page) || p.page < profile.first_page || p.page > profile.boundary_page || p.start < 0 || p.end > s.text.length || p.start >= p.end || j && (p.page <= s.page_spans[j-1].page || p.start < s.page_spans[j-1].end)) )) throw Error('Incomplete incorporated Code sequence or source ranges');
    if (!source.sections.some(s=>profile.incorporated_in_unit_id===profile.document_id+':article:'+s.number)) throw Error('Incorporating law article missing');
    return code;
  });
}
function appendIncorporatedCodes(graph, codes, known, explicitOwnReferences) {
  for (const code of codes) {
    const id=graph.document.canonical_id, prefix=id+':code:'+code.scope_key;
    for (const section of code.sections) {
      const articleId=prefix+':article:'+section.number;
      const pageAt=offset=>section.page_spans.find(p=>offset>=p.start&&offset<p.end)?.page||section.source_page;
      const scope={scope_key:code.scope_key,scope_title:code.scope_title,scope:'incorporated_code',incorporated_in_unit_id:code.incorporated_in_unit_id};
      graph.units.push({...scope,id:articleId,document_id:id,parent_id:null,unit_type:'article',article_number:section.number,paragraph_number:null,navigation_number:'code-'+section.number,label:section.label,original_label:section.original_label,title:section.title,text:section.text,source_page:section.source_page,source_pages:section.source_pages});
      const children=splitNumberedParagraphs(section.text).map(p=>({...scope,id:articleId+':paragraph:'+p.number,document_id:id,parent_id:articleId,unit_type:'paragraph',label:'παρ. '+p.number,article_number:section.number,paragraph_number:p.number,title:null,text:p.text,start_offset:p.start,end_offset:p.end,source_page:pageAt(p.start+section.text.slice(p.start,p.end).search(/\S/u)),source_pages:section.page_spans.filter(s=>s.start<p.start+section.text.slice(p.start,p.end).trimEnd().length&&s.end>p.start+section.text.slice(p.start,p.end).search(/\S/u)).map(s=>s.page)}));
      graph.units.push(...children);
      const own=explicitOwnReferences(section.text,id,section.number).map(r=>({...r,target_canonical_id:r.target_canonical_id.replace(id+':article:',prefix+':article:'),evidence_basis:'explicit_incorporated_code_reference'}));
      for (const r of resolveGreekLegalReferences([...parseGreekLegalCitations(section.text),...parseCodeReferences(section.text,id,{scope:code.scope_key}),...own],known)) {
        const child=children.find(p=>r.start>=p.start_offset&&r.start<p.end_offset);
        graph.references.push({...r,from_document_id:id,from_unit_id:child?.id||articleId,source_page:pageAt(r.start),evidence_source_url:code.source_url});
      }
    }
    Object.assign(graph.document,{incorporated_code_article_count:code.sections.length,incorporated_code_total_articles:code.total_articles,incorporated_code_scope:code.scope_key,incorporated_code_title:code.scope_title,coverage_note:code.coverage_note,text_coverage:code.text_coverage,pdf_only_pages:code.pdf_only_pages});
  }
  // Keep each paragraph next to its own article; preserve the original source order.
  const withinPage = unit => unit.scope_key
    ? Number(unit.incorporated_in_unit_id.split(':').at(-1)) + 0.5
    : Number(unit.article_number);
  const roots=graph.units.filter(u=>!u.parent_id).sort((a,b)=>a.source_page-b.source_page || withinPage(a)-withinPage(b) || Number(a.article_number)-Number(b.article_number));
  graph.units=roots.flatMap(root=>[root,...graph.units.filter(u=>u.parent_id===root.id)]);
  graph.units.forEach((u,i)=>u.position=i+1);
  if(new Set(graph.units.map(u=>u.id)).size!==graph.units.length)throw Error('Duplicate scoped legal units');
  return graph;
}
module.exports={loadIncorporatedCodes,appendIncorporatedCodes};
