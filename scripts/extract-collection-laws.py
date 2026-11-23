"""Extract the five additions from original Gazette PDFs, checking every article number.

Usage: python scripts/extract-collection-laws.py [output/legal-foundations]
Requires pypdf. PDFs must first be downloaded from the official api.et.gr API.
"""
from pathlib import Path
from bisect import bisect_right
import hashlib
import json
import re
import sys
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
HEADING = re.compile(r'(?m)^[ \t]*Άρθρο[ \t]+(\d+)[ \t]*$')


def clean(text):
    text = text.replace('\xa0', ' ').replace('\r', '')
    text = re.sub(r'(?<=[Α-Ωα-ωάέήίόύώϊϋΐΰ])[-\u00ad]\s*\n\s*(?=[α-ωάέήίόύώϊϋΐΰ])', '', text)
    return re.sub(r'[ \t]+\n', '\n', text).strip()


def extract(directory, entry):
    number, year = entry['number'], entry['year']
    pdf = directory / f'law-{number}-{year}.pdf'
    reader = PdfReader(pdf)
    pages = []
    bold_groups = []
    bold_parts = []
    for page in reader.pages:
        parts = []
        def collect(text, cm, tm, font, size):
            if 55 <= tm[5] < 760:
                parts.append(text)
                if font and re.search(r'bold', str(font.get('/BaseFont', '')), re.I):
                    bold_parts.append(text)
                elif text.strip() and bold_parts:
                    bold_groups.append(clean(''.join(bold_parts)))
                    bold_parts.clear()
        page.extract_text(visitor_text=collect)
        pages.append(clean(''.join(parts)))
    if bold_parts:
        bold_groups.append(clean(''.join(bold_parts)))
    titles = {}
    for group in bold_groups:
        for match in HEADING.finditer(group):
            candidate = group[match.end():].strip()
            if candidate and len(candidate) < 1000:
                titles[match[1]] = candidate
    text = '\n\n'.join(pages)
    starts, offset = [], 0
    for page in pages:
        starts.append(offset)
        offset += len(page) + 2
    matches = list(HEADING.finditer(text))
    # Some tables of contents end with a standalone final article heading.
    first = next(i for i, match in enumerate(matches) if match[1] == '1')
    matches = matches[first:]
    labels = [int(match[1]) for match in matches]
    if labels != list(range(1, entry['article_count'] + 1)):
        raise ValueError(f'Unexpected article sequence for {number}/{year}: {labels}')
    sections = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = text[match.end():end].strip()
        if not body:
            raise ValueError(f'Empty article {number}/{year}/{match[1]}')
        # Gazette titles are bold and often span several printed lines.
        # Keep exact source newlines here so the browser can remove the full title from the body.
        title = titles.get(match[1], body.splitlines()[0].strip())
        if not body.startswith(title):
            title = body.splitlines()[0].strip()
        sections.append({'number': match[1], 'label': 'Άρθρο ' + match[1],
                         'title': title, 'text': body,
                         'source_page': bisect_right(starts, match.start())})
    title_match = re.search(r'ΑΡΙΘΜ\.\s*' + str(number) + r'\s*\n(.*?)\n\s*(?:Ο|Η)\s+ΠΡΟΕΔΡΟΣ', clean(reader.pages[0].extract_text()), re.S)
    if not title_match:
        raise ValueError(f'Official title missing for {number}/{year}')
    title = ' '.join(title_match[1].split())
    result = {'number': str(number), 'year': str(year), 'title': title,
              'published_at': entry['published_at'], 'fek_number': entry['fek_number'],
              'source_url': f'https://api.et.gr/apiLAW/1/{year}/{number}/pdf',
              'sha256': hashlib.sha256(pdf.read_bytes()).hexdigest(),
              'pdf_filename': pdf.name, 'page_count': len(pages), 'text': text, 'sections': sections}
    (directory / f'law-{number}-{year}.json').write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    print(f'{number}/{year}: {len(sections)} articles, {len(pages)} PDF pages')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    directory = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'output/legal-foundations'
    collection = json.loads((ROOT / 'config/law-collection.json').read_text(encoding='utf-8'))
    for entry in collection.values():
        if 'article_count' in entry and entry.get('extraction_profile', 'collection') == 'collection':
            extract(directory, entry)
