"""Extract two foundation sources, requiring every original article in sequence."""
from pathlib import Path
from bisect import bisect_right
import hashlib, json, re, sys
from pypdf import PdfReader
ROOT = Path(__file__).resolve().parent.parent
SOURCES = [(3500, 2006, '2006-10-24', '232', 28, 'Για την αντιμετώπιση της ενδοοικογενειακής βίας και άλλες διατάξεις.'),
           (4620, 2019, '2019-06-11', '96', 592, 'Κύρωση του Κώδικα Ποινικής Δικονομίας.')]
def clean(text):
    text = text.replace('\xa0',' ').replace('\r','')
    text = re.sub(r'(?<=[Α-Ωα-ωάέήίόύώϊϋΐΰ])[-−\u00ad]\s*\n\s*(?=[α-ωάέήίόύώϊϋΐΰ])', '', text)
    text = re.sub(r'(?m)^[ \t]*Το παρόν ΦΕΚ επανεκτυπώθηκε λόγω λάθους[ \t]*\n?', '', text)
    text = re.sub(r'(?m)^ΕΦΗΜΕΡΙ[∆Δ]Α\nΤΗΣ ΚΥΒΕΡΝΗΣΕΩΣΤΗΣ ΕΛΛΗΝΙΚΗΣ [∆Δ]ΗΜΟΚΡΑΤΙΑΣ\nE11 Ιουνίου 2019 ΤΕΥΧΟΣ ΠΡΩΤΟ Αρ\. Φύλλου 96[ \t]*$', '', text)
    return re.sub(r'[ \t]+\n','\n',text).strip()
def extract(directory, number, year, published, fek, count, title):
    pdf = directory / f'law-{number}-{year}.pdf'
    reader = PdfReader(pdf); pages=[]; titles={}; bold=[]; groups=[]
    for page in reader.pages:
        parts=[]
        def collect(text, cm, tm, font, size):
            if 55 <= tm[5] < 760:
                parts.append(text)
                if font and re.search('bold', str(font.get('/BaseFont','')), re.I): bold.append(text)
                elif text.strip() and bold: groups.append(clean(''.join(bold))); bold.clear()
        page.extract_text(visitor_text=collect); pages.append(clean(''.join(parts)))
    if bold: groups.append(clean(''.join(bold)))
    full='\n\n'.join(pages); starts=[]; offset=0
    for page in pages: starts.append(offset); offset+=len(page)+2
    if str(number) not in full[:500] or title.split()[0] not in full[:500]: raise ValueError('Source identity not found')
    if number == 4620:
        # Article 258 is printed as "Άρθρο. - 258" in the original; retain its raw heading.
        pattern = re.compile(r'(?m)^[ \t]*Άρθρο[ \t]+(\d+)\.[ \t]*[-−–][ \t]*([^\n]*)|^[ \t]*Άρθρο\.[ \t]*[-−–][ \t]*(258)[ \t]+([^\n]*)')
        end = full.index('Άρθρο Δεύτερο', full.index('Άρθρο 592.'))
        heading_number = lambda m: m[1] or m[3]
        for group in groups:
            for m in pattern.finditer(group):
                candidate = group[m.end(1) if m[1] else m.end(3):].lstrip('. -−–').strip()
                if candidate: titles[heading_number(m)] = candidate
    else:
        pattern = re.compile(r'(?m)^[ \t]*Άρθρο[ \t]+(\d+)[ \t]*$')
        end = full.index('Παραγγέλλομε', full.index('Άρθρο 28'))
        heading_number = lambda m: m[1]
    matches = list(pattern.finditer(full[:end])); labels=[int(heading_number(m)) for m in matches]
    if labels != list(range(1,count+1)): raise ValueError(f'Unexpected article sequence: {labels}')
    sections=[]
    for index,m in enumerate(matches):
        section_end=matches[index+1].start() if index+1<len(matches) else end
        n=heading_number(m)
        if number==4620:
            body_start=m.start(2) if m[1] else m.start(4)
            body=full[body_start:section_end].strip()
            article_title=titles.get(n, body.splitlines()[0].strip())
            if article_title and not body.startswith(article_title): article_title=body.splitlines()[0].strip()
        else:
            body=full[m.end():section_end].strip(); article_title=body.splitlines()[0].strip()
        if not body: raise ValueError(f'Empty article {n}')
        if re.search(r'Το παρόν ΦΕΚ επανεκτυπώθηκε|ΕΦΗΜΕΡΙ[∆Δ]Α|ΤΕΥΧΟΣ ΠΡΩΤΟ Αρ[.]', body): raise ValueError(f'Publishing furniture inside article {n}')
        sections.append(dict(number=n,label='Άρθρο '+n,title=article_title,text=body,source_page=bisect_right(starts,m.start()),raw_heading=m[0]))
    result=dict(number=str(number),year=str(year),title=title,published_at=published,fek_number=fek,
                source_url=f'https://api.et.gr/apiLAW/1/{year}/{number}/pdf',sha256=hashlib.sha256(pdf.read_bytes()).hexdigest(),
                pdf_filename=pdf.name,page_count=len(pages),text=full[:full.index('Παραγγέλλομε',end-1) if number==4620 else end].strip(),sections=sections,
                extraction_profile='foundations-v3-complete-sequence',paragraph_indexing='conservative_top_level',
                publication_notes=['Το παρόν ΦΕΚ επανεκτυπώθηκε λόγω λάθους'] if number == 3500 else [])
    (directory/f'law-{number}-{year}.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
    print(f'{number}/{year}: {len(sections)} articles, {len(pages)} pages')
if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    directory=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'output/legal-foundations'
    for source in SOURCES: extract(directory,*source)