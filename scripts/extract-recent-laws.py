"""Extract explicitly reviewed recent-law batches from official Gazette PDFs.

Preserve native article numbers, source-page ranges and quotation text. A complete
consecutive article sequence is mandatory; the known Latin-o heading is accepted
without changing its printed label. The original PDF checksum is the authority.
"""
from argparse import ArgumentParser
from pathlib import Path
from bisect import bisect_right
import hashlib,json,re,sys
from pypdf import PdfReader
ROOT=Path(__file__).resolve().parent.parent
HEADING=re.compile(r'(?m)^[ \t]*Άρθρ[οo][ \t]+(\d+)[ \t]*$')
ORDINAL_NUMBERS={word:str(i+1) for i,word in enumerate(['πρώτο','δεύτερο','τρίτο','τέταρτο','πέμπτο','έκτο','έβδομο','όγδοο','ένατο','δέκατο','ενδέκατο','δωδέκατο','δέκατο τρίτο','δέκατο τέταρτο','δέκατο πέμπτο','δέκατο έκτο','δέκατο έβδομο','δέκατο όγδοο','δέκατο ένατο','εικοστό','εικοστό πρώτο','εικοστό δεύτερο'])}
ORDINAL_NUMBERS['μόνο']='1'
ORDINAL_HEADING=re.compile(r'(?m)^[ \t]*Άρθρο[ \t]+('+ '|'.join(re.escape(word).replace(r'\ ',r'[ \t]+') for word in sorted(ORDINAL_NUMBERS,key=len,reverse=True))+r')[ \t]*$',re.I)
GREEK='Α-Ωα-ωάέήίόύώϊϋΐΰ'
def clean(text):
 text=text.replace('\xa0',' ').replace('\r','').replace('µ','μ')
 text=re.sub(r'(?<=['+GREEK+r'])[-\u00ad]\s*\n\s*(?=[α-ωάέήίόύώϊϋΐΰ])','',text)
 return re.sub(r'[ \t]+\n','\n',text).strip()
def apply_table_repair(text,repair):
 if repair.get('remove_prefix'):
  prefix=repair['remove_prefix']
  if not re.match(re.escape(prefix)+r'\s',text):raise ValueError('Reviewed draft page counter changed')
  text=text[len(prefix):].lstrip()
 if repair.get('rotation_anchor'):
  anchor=repair['rotation_anchor']
  if text.count(anchor)!=1 or text.startswith(anchor):raise ValueError('Reviewed page order boundary changed')
  start=text.index(anchor)
  text=text[start:].rstrip()+'\n'+text[:start].rstrip()
 for line in repair.get('omit_lines',[]):
  lines=text.split('\n')
  if lines.count(line)!=1:raise ValueError('Reviewed extraneous line changed')
  lines.remove(line)
  text='\n'.join(lines)
 if repair.get('start_anchor'):
  anchor=repair['start_anchor']
  if text.count(anchor)!=1:raise ValueError('Reviewed page start anchor changed')
  text=text[text.index(anchor):]
 if repair.get('end_anchor'):
  anchor=repair['end_anchor']
  if text.count(anchor)!=1:raise ValueError('Reviewed page end anchor changed')
  text=text[:text.index(anchor)+len(anchor)]
 for insertion in repair.get('insertions',[]):
  marker,table=insertion['before'],insertion['text'].strip()
  if not table:raise ValueError('Empty reviewed table')
  if marker=='START':text=table+'\n\n'+text
  elif marker=='END':text=text+'\n\n'+table
  else:
   if text.count(marker)!=1:raise ValueError(f'Ambiguous reviewed table anchor: {marker}')
   text=text.replace(marker,'\n\n'+table+'\n\n'+marker,1)
 return text

def reviewed_region_index(x,y,regions):
 matches=[i for i,r in enumerate(regions) if r['bbox'][0]<=x<=r['bbox'][2] and r['bbox'][1]<=y<=r['bbox'][3]]
 if len(matches)>1:raise ValueError('Overlapping reviewed source regions')
 return matches[0] if matches else None

def validate_reviewed_regions(parts,regions):
 for text,region in zip(parts,regions):
  if hashlib.sha256(''.join(text).encode('utf8')).hexdigest()!=region['text_sha256']:
   raise ValueError('Reviewed source region text changed')

def apply_heading_repair(body,repair):
 title=repair['title']
 if title is None:
  if not body.startswith(repair['extracted_title']+'\n') and body!=repair['extracted_title']:
   raise ValueError('Reviewed untitled article source changed')
  return None
 if not title.startswith(repair['extracted_title']) or not body.startswith(title+'\n'):
  raise ValueError('Reviewed heading source changed')
 return title

def decode_mapped_font_text(text,mapping):
 result=[]
 for char in text:
  if str(ord(char)) in mapping:result.append(mapping[str(ord(char))])
  elif char in '\n\r\t ':result.append(char)
  else:raise ValueError(f'Unmapped embedded font glyph: {ord(char)}')
 return ''.join(result)

def geometry_page_text(page,top,bottom,ceiling):
 cropped=page.crop((0,top,page.width,page.height-bottom))
 native=clean(cropped.extract_text(x_tolerance=3,y_tolerance=3) or '')
 lines=cropped.extract_text_lines(x_tolerance=3,y_tolerance=3);titles={}
 for index,line in enumerate(lines):
  heading=HEADING.fullmatch(line['text'].strip())
  if not heading or int(heading[1])>ceiling:continue
  parts=[]
  for following in lines[index+1:]:
   chars=[c for c in following['chars'] if c['text'].strip()]
   if HEADING.fullmatch(following['text'].strip()) or not chars or not all('bold' in c.get('fontname','').lower() for c in chars):break
   parts.append(following['text'])
  title=clean('\n'.join(parts))
  if not title:raise ValueError('Geometry heading has no verified bold title')
  titles[heading[1]]=title
 return native,titles

def select_ordinal_page(native,page_number,profile):
 if page_number not in profile['native_pages']:return ''
 if 'native_page_rules' in profile:
  rule=profile['native_page_rules'].get(str(page_number))
  if rule is None:raise ValueError('Missing reviewed native page rule')
  prefix='';suffix=''
  if rule.get('start_anchor'):
   anchor=rule['start_anchor']
   if native.count(anchor)!=1:raise ValueError('Reviewed native start anchor changed')
   start=native.index(anchor);prefix=native[:start];native=native[start:]
  if rule.get('end_anchor'):
   anchor=rule['end_anchor']
   if native.count(anchor)!=1:raise ValueError('Reviewed native end anchor changed')
   end=native.index(anchor)+len(anchor);suffix=native[end:];native=native[:end]
  if hashlib.sha256(prefix.encode()).hexdigest()!=rule['removed_prefix_sha256'] or hashlib.sha256(suffix.encode()).hexdigest()!=rule['removed_suffix_sha256']:raise ValueError('Reviewed native exclusion changed')
  if hashlib.sha256(native.encode()).hexdigest()!=rule['text_sha256']:raise ValueError('Reviewed native page text changed')
  return apply_table_repair(native,{'omit_lines':rule.get('omit_lines',[])})
 intro_pages=profile.get('intro_pages',[1])
 if page_number in intro_pages:
  roots=list(ORDINAL_HEADING.finditer(native));start=0
  if page_number==intro_pages[0]:
   if len(roots)!=1 or heading_number(roots[0],True)!='1':raise ValueError('Ambiguous ordinal first article')
   start=roots[0].end()
  elif roots:raise ValueError('Unexpected ordinal heading in ratification continuation')
  if page_number==intro_pages[-1]:
   anchor=profile['first_article_end_anchor'];tail=native[start:]
   if tail.count(anchor)!=1:raise ValueError('Ordinal ratification boundary changed')
   native=native[:start+tail.index(anchor)+len(anchor)].rstrip()
  expected=profile.get('intro_page_text_sha256',{}).get(str(page_number),profile.get('first_page_text_sha256'))
  if not expected or hashlib.sha256(native.encode()).hexdigest()!=expected:raise ValueError('Ordinal first-page text changed')
 elif page_number==profile.get('closing_page') and page_number!=profile['primary_headings'][-1]['page']:
  if not re.match(r'^Παραγγέλ{1,2}(?:ομε|ουμε)\s',native):raise ValueError('Ordinal separate closing changed')
  if hashlib.sha256(native.encode()).hexdigest()!=profile['closing_page_text_sha256']:raise ValueError('Ordinal closing-page text changed')
 else:
  anchor=profile.get('final_article_anchor')
  if anchor:
   if native.count(anchor)!=1:raise ValueError('Ordinal final-page anchor changed')
   start=native.index(anchor)
  else:
   roots=list(ORDINAL_HEADING.finditer(native))
   if not roots or roots[0][1]!='δεύτερο':raise ValueError('Ordinal final-page root changed')
   start=roots[0].start()
  prefix=native[:start]
  if hashlib.sha256(prefix.encode()).hexdigest()!=profile['last_page_prefix_sha256']:raise ValueError('Ordinal final-page prefix changed')
  native=native[start:]
 return native

def verified_ordinal_title(body,profile,number):
 titles=profile.get('primary_titles',{})
 if number in titles and titles[number] is None:return None
 title=titles.get(number)
 if title is None:return body.splitlines()[0].strip()
 if not body.startswith(title+'\n'):raise ValueError('Reviewed ordinal heading title changed')
 return title

def heading_number(match,ordinal):
 return ORDINAL_NUMBERS[' '.join(match[1].casefold().split())] if ordinal else match[1]

def extract(directory,entry):
 n,y=entry['number'],entry['year'];pdf=directory/f'law-{n}-{y}.pdf';raw=pdf.read_bytes()
 if not raw.startswith(b'%PDF-'):raise ValueError('Not an official PDF')
 if entry.get('pdf_sha256') and hashlib.sha256(raw).hexdigest()!=entry['pdf_sha256']:raise ValueError('Reviewed manifest PDF checksum changed')
 spacing_replacements=entry.get('reviewed_spacing_replacements',{})
 if spacing_replacements and (not entry.get('pdf_sha256') or any(
  not before or before.replace(' ','')!=after.replace(' ','') for before,after in spacing_replacements.items()
 )):raise ValueError('Invalid reviewed spacing correction')
 def repair_spacing(text):
  for before,after in spacing_replacements.items():text=text.replace(before,after)
  return text
 repairs={};repair_file=ROOT/'config/recent-law-table-repairs.json'
 if repair_file.exists():
  specification=json.loads(repair_file.read_text(encoding='utf8'))
  if (n,y)==(specification['number'],specification['year']):
   if hashlib.sha256(raw).hexdigest()!=specification['pdf_sha256']:raise ValueError('Reviewed table PDF checksum changed')
   repairs={p['page']:p for p in specification['pages']}
 page_repairs=ROOT/'config/recent-law-page-repairs.json'
 if page_repairs.exists():
  for specification in json.loads(page_repairs.read_text(encoding='utf8'))['entries']:
   if (n,y)==(specification['number'],specification['year']):
    if hashlib.sha256(raw).hexdigest()!=specification['pdf_sha256']:raise ValueError('Reviewed page PDF checksum changed')
    reviewed=[*specification.get('pages',[]),*(dict(page=p,native_fonts=[]) for p in specification.get('exclude_pages',[]))]
    page_numbers={p['page'] for p in reviewed}
    if len(page_numbers)!=len(reviewed) or page_numbers.intersection(repairs):raise ValueError('Overlapping reviewed page repairs')
    repairs.update({p['page']:p for p in reviewed})
 font_mappings={};mapped_pages=[];visible_corrections=[];corrected=set();font_file=ROOT/'config/recent-law-font-mappings.json'
 if font_file.exists():
  font_spec=json.loads(font_file.read_text(encoding='utf8'))
  if (n,y)==(font_spec['number'],font_spec['year']):
   if hashlib.sha256(raw).hexdigest()!=font_spec['pdf_sha256']:raise ValueError('Mapped-font PDF checksum changed')
   font_mappings=font_spec['fonts'];mapped_pages=font_spec['pages'];visible_corrections=font_spec.get('visible_text_corrections',[])
 heading_repairs={};heading_file=ROOT/'config/recent-law-heading-repairs.json'
 if heading_file.exists():
  for specification in json.loads(heading_file.read_text(encoding='utf8'))['entries']:
   if (n,y)==(specification['number'],specification['year']):
    if hashlib.sha256(raw).hexdigest()!=specification['pdf_sha256']:raise ValueError('Reviewed heading PDF checksum changed')
    heading_repairs={h['article']:h for h in specification['headings']}
 if any(h not in [str(i) for i in range(1,entry['article_count']+1)] for h in heading_repairs):raise ValueError('Unknown reviewed heading article')
 layout=None;geometry_document=None;geometry_titles={};layout_file=ROOT/'config/recent-law-layout-profiles.json'
 if layout_file.exists():
  for specification in json.loads(layout_file.read_text(encoding='utf8'))['entries']:
   if (n,y)==(specification['number'],specification['year']):
    if hashlib.sha256(raw).hexdigest()!=specification['pdf_sha256']:raise ValueError('Reviewed layout PDF checksum changed')
    if specification['primary_heading_ceiling']!=entry['article_count']:raise ValueError('Reviewed layout article count changed')
    layout=specification
    import pdfplumber
    geometry_document=pdfplumber.open(pdf)
 ordinal=None;ordinal_file=ROOT/'config/recent-law-ordinal-profiles.json'
 if ordinal_file.exists():
  for specification in json.loads(ordinal_file.read_text(encoding='utf8'))['entries']:
   if (n,y)==(specification['number'],specification['year']):
    if hashlib.sha256(raw).hexdigest()!=specification['pdf_sha256']:raise ValueError('Reviewed ordinal PDF checksum changed')
    if len(specification['primary_headings'])!=entry['article_count']:raise ValueError('Reviewed ordinal article count changed')
    ordinal=specification
 if ordinal and layout:raise ValueError('Overlapping ordinal and geometry profiles')
 ordinal_regions=ordinal.get('geometry_regions',{}) if ordinal else {}
 if ordinal_regions:
  import pdfplumber
  geometry_document=pdfplumber.open(pdf)
 heading_pattern=ORDINAL_HEADING if ordinal else HEADING
 reader=PdfReader(pdf);pages=[];bold_groups=[];bold_parts=[]
 for page_number,page in enumerate(reader.pages,1):
  if ordinal and not font_mappings and page_number not in repairs and page_number not in ordinal['native_pages']:
   pages.append('')
   continue
  parts=[];repair=repairs.get(page_number);last_mapped=None
  if repair == {'page':page_number,'native_fonts':[]}:
   pages.append('')
   continue
  regions=repair.get('excluded_regions',[]) if repair else [];excluded_parts=[[] for _ in regions]
  def visit(t,cm,tm,font,size):
   nonlocal last_mapped
   font_name=str(font.get('/BaseFont')) if font else ''
   if 55<=tm[5]<760 and regions:
    region=reviewed_region_index(tm[4],tm[5],regions)
    if region is not None:excluded_parts[region].append(t);return
   if 55<=tm[5]<760 and font_name in font_mappings:
    if page_number not in mapped_pages:raise ValueError('Mapped font on an unreviewed page')
    t=decode_mapped_font_text(t,font_mappings[font_name]['glyphs'])
    for index,correction in enumerate(visible_corrections):
     if t.strip() and page_number==correction['page'] and font_name==correction['font'] and abs(tm[4]-correction['x'])<0.01 and abs(tm[5]-correction['y'])<0.01:
      if ' '.join(t.split())!=correction['encoded_text'] or index in corrected:raise ValueError('Visible-text correction source mismatch')
      t=correction['displayed_text']+' ';corrected.add(index)
    if t.strip():
     if last_mapped and parts and not parts[-1].endswith('\n'):
      previous_x,previous_y=last_mapped
      if re.match(r'^\d{1,2}[α-ω]?\.\s',t.lstrip()):parts.append('\n\n')
      elif tm[5]>previous_y+1 or abs(tm[5]-previous_y)<1 and tm[4]>previous_x+40:parts.append(' | ')
      elif abs(tm[5]-previous_y)>1:parts.append('\n')
     last_mapped=(tm[4],tm[5])
   elif t.strip():last_mapped=None
   if 55<=tm[5]<760 and (not repair or font and str(font.get('/BaseFont')) in repair['native_fonts']):
    if repair and t.strip() and parts and not parts[-1].endswith(('\n',' ')) and t.startswith(('Άρθρο ','ΚΕΦΑΛΑΙΟ ')):parts.append('\n')
    parts.append(t)
    if font and re.search('bold',str(font.get('/BaseFont','')),re.I):bold_parts.append(t)
    elif t.strip() and bold_parts:bold_groups.append(clean(''.join(bold_parts)));bold_parts.clear()
  page.extract_text(visitor_text=visit);validate_reviewed_regions(excluded_parts,regions);native=clean(''.join(parts))
  if font_mappings:
   for boundary in font_spec.get('reviewed_line_breaks',[]):
    if page_number==boundary['page']:
     if native.count(boundary['before'])!=1:raise ValueError('Reviewed line boundary source mismatch')
     native=native.replace(boundary['before'],'\n\n'+boundary['before'],1)
  if layout and page_number in layout['geometry_pages']:
   top=layout.get('page_crop_tops',{}).get(str(page_number),layout['crop_top'])
   native,page_titles=geometry_page_text(geometry_document.pages[page_number-1],top,layout['crop_bottom'],layout['primary_heading_ceiling'])
   geometry_titles.update(page_titles)
  if str(page_number) in ordinal_regions:
   physical_page=geometry_document.pages[page_number-1]
   native=clean('\n'.join(
    physical_page.crop(tuple(box)).extract_text(x_tolerance=2,y_tolerance=3) or ''
    for box in ordinal_regions[str(page_number)]
   ))
  if ordinal:native=select_ordinal_page(native,page_number,ordinal)
  pages.append(repair_spacing(apply_table_repair(native,repair) if repair else native))
 if bold_parts:bold_groups.append(clean(''.join(bold_parts)))
 if len(corrected)!=len(visible_corrections):raise ValueError('Missing visible-text correction source')
 separators=['\n\n']*len(pages)
 for i in range(len(pages)-1):
  if re.search(r'['+GREEK+r'][-\u00ad]$',pages[i]) and re.match(r'[α-ωάέήίόύώϊϋΐΰ]',pages[i+1]):pages[i]=pages[i][:-1];separators[i]=''
 starts=[];offset=0;parts=[]
 for i,page in enumerate(pages):starts.append(offset);parts.append(page);offset+=len(page);parts.append(separators[i] if i<len(pages)-1 else '');offset+=len(separators[i]) if i<len(pages)-1 else 0
 text=''.join(parts);matches=list(heading_pattern.finditer(text))
 if layout:matches=[h for h in matches if int(h[1])<=layout['primary_heading_ceiling']]
 first=next(i for i,h in enumerate(matches) if heading_number(h,ordinal)=='1');matches=matches[first:]
 if geometry_document:geometry_document.close()

 labels=[int(heading_number(h,ordinal)) for h in matches]
 if labels!=list(range(1,entry['article_count']+1)):raise ValueError(f'Incomplete or ambiguous articles for {n}: {labels}')
 if ordinal:
  observed=[dict(number=heading_number(h,ordinal),label=h[0].strip(),page=bisect_right(starts,h.start())) for h in matches]
  if observed!=ordinal['primary_headings']:raise ValueError('Reviewed ordinal heading pages changed')
 first_raw=repair_spacing(clean(reader.pages[0].extract_text()))
 if not re.search(r'ΑΡΙΘΜ\.?\s*'+n+r'\b',first_raw):raise ValueError('Printed law number mismatch')
 if not re.search(r'Αρ\.\s*Φύλλου\s*'+entry['fek_number']+r'\b',first_raw):raise ValueError('Printed Gazette issue mismatch')
 months={'01':'Ιανουαρίου','02':'Φεβρουαρίου','03':'Μαρτίου','04':'Απριλίου','05':'Μαΐου','06':'Ιουνίου','07':'Ιουλίου','08':'Αυγούστου','09':'Σεπτεμβρίου','10':'Οκτωβρίου','11':'Νοεμβρίου','12':'Δεκεμβρίου'}
 yy,mm,dd=entry['published_at'].split('-')
 if not re.search(r'\b'+str(int(dd))+r'\s+'+months[mm]+r'\s+'+yy+r'\b',first_raw):raise ValueError('Printed Gazette date mismatch')
 title_match=re.search(r'ΑΡΙΘΜ\.?\s*'+n+r'\s*(.*?)\n\s*[ΟOΗ] ΠΡΟΕΔΡΟΣ',first_raw,re.S)
 if not title_match:raise ValueError('Official law title missing')
 titles={}
 for group in map(repair_spacing,bold_groups):
  for h in heading_pattern.finditer(group):
   candidate=group[h.end():].strip()
   if candidate and len(candidate)<1200:titles[heading_number(h,ordinal)]=candidate
 titles.update(geometry_titles)
 sections=[];closing=None;fallback=[]
 for index,h in enumerate(matches):
  number=heading_number(h,ordinal)
  end=matches[index+1].start() if index+1<len(matches) else len(text);segment=text[h.end():end];leading=len(segment)-len(segment.lstrip());body_start=h.end()+leading;body=segment.strip()
  if number in entry.get('articles_before_structural_headings', ()):
   boundary=re.search(r'(?m)^(?:ΚΕΦ[ΑA]Λ[ΑA]ΙΟ|ΜΕΡΟΣ|ΤΜΗΜΑ)[ \t]+[Α-ΩA-Z]+[ \t]*[’΄]',body)
   if not boundary:raise ValueError(f'Reviewed structural heading missing after Article {number}')
   body=body[:boundary.start()].rstrip()
  if index==len(matches)-1:
   c=re.search(r'(?m)(?:^Παραγγέλ{1,2}(?:ομε|ουμε)\s|(?<=\.)Παραγγέλ{1,2}(?:ομε|ουμε)\sτη δημοσίευση του παρόντος)',body)
   if not c:raise ValueError(f'Closing publication order missing: {n}')
   closing_start=body_start+c.start();closing_text=re.split(r'(?m)^Καποδιστρίου |^Το Εθνικό Τυπογραφείο αποτελεί',body[c.start():],maxsplit=1)[0].strip()
   closing_end=closing_start+len(closing_text)-1;closing=dict(text=closing_text,source_page=bisect_right(starts,closing_start),source_pages=list(range(bisect_right(starts,closing_start),bisect_right(starts,closing_end)+1)));body=body[:c.start()].rstrip()
  title=verified_ordinal_title(body,ordinal,number) if ordinal else titles.get(number,body.splitlines()[0].strip())
  if title and not body.startswith(title):title=body.splitlines()[0].strip();fallback.append(number)
  if number in heading_repairs:
   repair=heading_repairs[number]
   if title!=repair['extracted_title']:raise ValueError('Reviewed extracted heading changed')
   title=apply_heading_repair(body,repair)
  spans=[];body_end=body_start+len(body)
  for p,start in enumerate(starts):
   finish=start+len(pages[p])
   if finish>start and start<body_end and finish>body_start:spans.append(dict(page=p+1,start=max(0,start-body_start),end=min(len(body),finish-body_start)))
  if not body or not spans:raise ValueError('Empty or unlocated article')
  sections.append(dict(number=number,label=h[0].strip() if ordinal else 'Άρθρο '+number,original_label=h[0].strip(),title=title,text=body,source_page=spans[0]['page'],source_pages=[s['page'] for s in spans],page_spans=spans))
 source=dict(number=n,year=y,title=' '.join(title_match[1].split()),published_at=entry['published_at'],fek_number=entry['fek_number'],source_url=f'https://api.et.gr/apiLAW/1/{y}/{n}/pdf',sha256=hashlib.sha256(raw).hexdigest(),pdf_filename=pdf.name,page_count=len(pages),text=text,sections=sections,closing=closing,publication_notes=[f'Αρχική δημοσίευση του {y}· δεν αποτελεί ενοποιημένο κείμενο μεταγενέστερων τροποποιήσεων.'],extraction_profile='recent_gazette_ordinal_v1' if ordinal else ('recent_gazette_geometry_v1' if layout else 'recent_gazette_v1'),title_fallbacks=fallback,reviewed_table_pages=sorted(repairs),recovered_font_pages=mapped_pages,visible_text_corrections=visible_corrections,pdf_only_pages=sorted(set([i+1 for i,p in enumerate(pages) if not p.strip()]+(layout.get('pdf_only_supplement_pages',[]) if layout else [])+(ordinal['pdf_only_pages'] if ordinal else []))))
 if ordinal and ordinal.get('source_edition_note'):source['source_edition_note']=ordinal['source_edition_note'];source['publication_notes'].append(ordinal['source_edition_note'])
 if ordinal:source['coverage_note']=ordinal['coverage_note'];source['text_coverage']=ordinal.get('text_coverage','ratifying_articles_with_pdf_only_agreement');source['pdf_only_pages']=ordinal['pdf_only_pages']
 if 'pdf_only_pages' in entry:
  source['pdf_only_pages']=entry['pdf_only_pages']
  source['reviewed_table_pages']=[page for page in source['reviewed_table_pages'] if page not in source['pdf_only_pages']]
 if entry.get('coverage_note'):
  source['coverage_note']=entry['coverage_note']
  source['text_coverage']='articles_with_pdf_only_supplements'
 (directory/f'law-{n}-{y}.json').write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print(json.dumps(dict(law=n,articles=len(sections),pages=len(pages),title_fallbacks=fallback,closing_page=closing['source_page']),ensure_ascii=False),flush=True)
if __name__=='__main__':
 sys.stdout.reconfigure(encoding='utf8')
 parser=ArgumentParser(description=__doc__)
 parser.add_argument('directory',type=Path,nargs='?')
 parser.add_argument('--year',choices=('2025','2026'),default='2026')
 args=parser.parse_args()
 manifest_name='recent-laws.json' if args.year=='2026' else f'recent-laws-{args.year}.json'
 directory=args.directory or ROOT/f'output/laws-{args.year}'
 manifest=json.loads((ROOT/'config'/manifest_name).read_text(encoding='utf8'))
 for entry in manifest['entries']:extract(directory,entry)
