'use strict';
(function(root){
 const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const readable = value => escape(value).replace(/\n/g,' ');
 function quotedParagraphRanges(unit, data) {
  const ranges=[];
  for(const quote of unit.text.matchAll(/«\s*Άρθρο\s+(\d+[A-Za-zΑ-Ωα-ω]?)(?:[^«»]|«[^«»]*»)*»/gu)) {
   const paragraphs=[...quote[0].matchAll(/(?:^|\n)[ \t]*(\d+)\.[ \t]+/gu)];
   if(!paragraphs.length||paragraphs.some((p,i)=>Number(p[1])!==i+1))continue;
   const article=quote[1], documentId=data.document.canonical_id;
   for(const paragraph of paragraphs) {
    const number=paragraph[1], marker=paragraph.index+paragraph[0].indexOf(number);
    const anchor='quoted-'+unit.id+'-'+article+'-'+number;
    ranges.push({start:quote.index+marker,end:quote.index+marker+number.length+1,anchor});
   }
   const introduction=unit.text.slice(0,quote.index);
   for(const mention of introduction.matchAll(/(?:προστίθεται\s+|πρ[oο]σθήκη\s+)άρθρ(?:ο|ου)\s+(\d+[A-Za-zΑ-Ωα-ω]?)/giu)) {
    if(mention[1].toLowerCase()!==article.toLowerCase())continue;
    const label=mention[0].match(/άρθρ(?:ο|ου)\s+.*/iu)[0], start=mention.index+mention[0].lastIndexOf(label);
    ranges.push({start,end:start+label.length,ref:{document_canonical_id:documentId,outer_article:unit.navigation_number||unit.article_number,quote_article:article,quote_paragraph:paragraphs[0][1],quote_title:true}});
   }
   for(const mention of quote[0].matchAll(/(?:παρ\.?|παραγράφ(?:ου|ος))\s+(\d+)/giu)) {
    if(/^\s+(?:του|των)\s+άρθρ/iu.test(quote[0].slice(mention.index+mention[0].length)))continue;
    if(!paragraphs.some(p=>p[1]===mention[1]))continue;
    ranges.push({start:quote.index+mention.index,end:quote.index+mention.index+mention[0].length,ref:{document_canonical_id:documentId,outer_article:unit.navigation_number||unit.article_number,quote_article:article,quote_paragraph:mention[1]}});
   }
  }
  return ranges;
 }
 function citationRanges(unit, data) {
  const children=data.units.filter(u=>u.parent_id===unit.id), accepted=new Set([unit.id,...children.map(u=>u.id)]), ranges=[];
  for(const ref of data.references.filter(r=>accepted.has(r.from_unit_id)&&r.raw_text)) {
   const source=data.units.find(u=>u.id===ref.from_unit_id)||unit;
   const sourceOffset=source===unit?0:unit.text.indexOf(source.text,Math.max(0,source.start_offset||0));
   let start=ref.start,end=ref.end;
   if(Number.isInteger(start)&&Number.isInteger(end)&&unit.text.slice(start,end)===ref.raw_text) ranges.push({start,end,ref});
   else if(sourceOffset>=0&&Number.isInteger(start)&&Number.isInteger(end)&&source.text.slice(start,end)===ref.raw_text) ranges.push({start:sourceOffset+start,end:sourceOffset+end,ref});
   else if(sourceOffset>=0){
    const pattern=ref.raw_text.trim().split(/\s+/u).map(p=>p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+');
    for(const m of source.text.matchAll(new RegExp(pattern,'gu'))) ranges.push({start:sourceOffset+m.index,end:sourceOffset+m.index+m[0].length,ref});
   }
  }
  return [...ranges,...quotedParagraphRanges(unit,data)];
 }
 function referenceUrl(ref) {
  const params=new URLSearchParams({law:ref.document_canonical_id});
  if(ref.quote_article){params.set('article',ref.outer_article);params.set('quote',ref.quote_article);params.set('quoteParagraph',ref.quote_paragraph);return '#'+params.toString();}
  const id=ref.target_canonical_id;
  if(id&&id!==ref.document_canonical_id) {
   const target=id.match(/:article:([^:]+)(?::paragraph:([^:]+))?$/u);
   const primary=id.match(/:paragraph:([^:]+)$/u);
   const body=id.match(/:body:([^:]+)(?::paragraph:([^:]+))?$/u);
   if(target){const scope=id.match(/:code:([^:]+):article:/u);params.set('article',scope?'code-'+target[1]:target[1]);if(target[2])params.set('paragraph',target[2]);}
   else if(body){params.set('article',body[1]);if(body[2])params.set('paragraph',body[2]);}
   else if(primary)params.set('provision',primary[1]);
   else params.set('unit',id);
  }
  return '#'+params.toString();
 }
 function referenceLink(ref,label) {
  if(ref.quote_article)return '<a class="inline-reference" href="'+escape(referenceUrl(ref))+'" data-inline-doc="'+escape(ref.document_canonical_id)+'" data-inline-article="'+escape(ref.outer_article)+'" data-quote="'+escape(ref.quote_article)+'" data-quote-paragraph="'+escape(ref.quote_paragraph)+'" title="'+(ref.quote_title?'Στο παρατιθέμενο άρθρο':'Στην παράγραφο του παρατιθέμενου κειμένου')+'">'+readable(label)+'</a>';
  if(!ref.document_canonical_id)return readable(label);
  const unit=ref.target_canonical_id&&ref.target_canonical_id!==ref.document_canonical_id;
  const exact=unit?ref.target_resolved:ref.resolved;
  return '<a class="inline-reference'+(exact?'':' unavailable-reference')+'" href="'+escape(referenceUrl(ref))+'" data-inline-doc="'+escape(ref.document_canonical_id)+'"'+(unit?' data-inline-unit="'+escape(ref.target_canonical_id)+'"':'')+' title="'+(exact?'Άνοιγμα στη βιβλιοθήκη':'Η ακριβής παραπομπή δεν έχει εισαχθεί ακόμη στη βιβλιοθήκη')+'">'+readable(label)+'</a>';
 }
 function orderedReferences(refs,label) {
  if(!refs.length||!refs.every(r=>r.document_canonical_id===refs[0].document_canonical_id))return refs;
  const expanded=label.replace(/(\d+)\s*[–-]\s*(\d+)/gu,(raw,a,b)=>Number(b)>=Number(a)&&Number(b)-Number(a)<=100?Array.from({length:Number(b)-Number(a)+1},(_,i)=>String(Number(a)+i)).join(' '):raw);
  const numbers=[...expanded.matchAll(/\d+[A-Za-zΑ-Ωα-ω]?/gu)].map(m=>m[0].toLowerCase());
  const rank=r=>{const number=String(r.article||r.paragraph||'').toLowerCase();const exact=numbers.indexOf(number);const i=exact<0?numbers.indexOf(number.split('.').at(-1)):exact;return i<0?Infinity:i;};
  return [...refs].sort((a,b)=>rank(a)-rank(b));
 }
 function renderCitationText(text,ranges,offset=0,preserveLineBreaks=false) {
  const display = value => preserveLineBreaks ? escape(value) : readable(value);
  const groups=new Map();
  for(const range of ranges.filter(r=>r.start>=offset&&r.end<=offset+text.length)) {
   const key=range.start+':'+range.end;if(!groups.has(key))groups.set(key,{...range,refs:[]});
   const group=groups.get(key);if(range.anchor){group.anchor=range.anchor;continue;}if(!group.refs.some(r=>r.target_canonical_id===range.ref.target_canonical_id&&r.quote_paragraph===range.ref.quote_paragraph))group.refs.push(range.ref);
  }
  let html='',cursor=0;
  for(const g of [...groups.values()].sort((a,b)=>a.start-b.start||b.end-a.end)) {
   const start=g.start-offset,end=g.end-offset;if(start<cursor)continue;
   html+=display(text.slice(cursor,start));const label=text.slice(start,end);
   if(g.anchor){html+='<span class="quoted-paragraph-anchor" id="'+escape(g.anchor)+'">'+display(label)+'</span>';cursor=end;continue;}
   html+=g.refs.length===1?referenceLink(g.refs[0],label):display(label)+' <span class="inline-reference-options">['+orderedReferences(g.refs,label).map(r=>referenceLink(r,r.article||r.paragraph||'πηγή')).join(', ')+']</span>';
   cursor=end;
  }
  return html+display(text.slice(cursor));
 }
 function formatPageRanges(pages) {
  const sorted=[...new Set(pages.filter(n=>Number.isInteger(n)&&n>0))].sort((a,b)=>a-b),ranges=[];
  for(let i=0;i<sorted.length;i++) {
   const start=sorted[i];let end=start;
   while(i+1<sorted.length&&sorted[i+1]===end+1)end=sorted[++i];
   ranges.push(start===end?String(start):start+'–'+end);
  }
  return ranges.join(', ');
 }
 const api={citationRanges,renderCitationText,referenceUrl,referenceLink,formatPageRanges};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.LawCitationText=api;
})(typeof globalThis==='object'?globalThis:this);
