"""Extract the official Gazette PDFs for the first local criminal-law collection.

Requires pypdf. Run with the bundled artifact Python if it is not installed globally.
The original PDF remains the authoritative source; extracted text is a dated publication.
"""
from pathlib import Path
import hashlib
import json
import re
import sys
from bisect import bisect_right
from pypdf import PdfReader

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('output/legal-foundations')
SOURCES = [
    (4619, 2019, '2019-06-11', '95', 'Κύρωση του Ποινικού Κώδικα'),
    (4855, 2021, '2021-11-12', '215', 'Τροποποιήσεις του Ποινικού Κώδικα, του Κώδικα Ποινικής Δικονομίας και άλλες επείγουσες διατάξεις'),
    (5090, 2024, '2024-02-23', '30', 'Παρεμβάσεις στον Ποινικό Κώδικα και τον Κώδικα Ποινικής Δικονομίας - Πρόληψη και καταπολέμηση της ενδοοικογενειακής βίας'),
]
HEADING = re.compile(r'(?m)^(Άρθρο|Άρθρα)[ \t]+(\d+(?:[ \t]*[Α-ΩA-Z])?(?:[ \t]*[-–][ \t]*\d+(?:[ \t]*[Α-ΩA-Z])?)?)[ \t]*$')


def clean_text(text):
    text = text.replace('\xa0', ' ').replace('\r', '')
    # Rejoin Greek words divided at a printed line ending. Keep numeric ranges intact.
    text = re.sub(r'(?<=[Α-Ωα-ωάέήίόύώϊϋΐΰ])[-\u00ad]\s*\n\s*(?=[α-ωάέήίόύώϊϋΐΰ])', '', text)
    return re.sub(r'[ \t]+\n', '\n', text).strip()


def extract(number, year, published, issue_number, title):
    filename = ROOT / f'law-{number}-{year}.pdf'
    reader = PdfReader(filename)
    pages = []
    for index, page in enumerate(reader.pages):
        parts = []
        def collect(text, cm, tm, font, size):
            # The three Gazette layouts share this body area; drop running heads/page numbers.
            if 55 <= tm[5] < 760:
                parts.append(text)
        page.extract_text(visitor_text=collect)
        pages.append(clean_text(''.join(parts)))
    text = '\n\n'.join(pages)
    page_starts = []
    offset = 0
    for page in pages:
        page_starts.append(offset)
        offset += len(page) + 2
    headings = list(HEADING.finditer(text))
    sections = []
    seen = set()
    for index, match in enumerate(headings):
        label = re.sub(r'\s+', '', match[2]).replace('–', '-')
        if label in seen:
            raise ValueError(f'Duplicate source article {number}/{year}: {label}')
        seen.add(label)
        end = headings[index + 1].start() if index + 1 < len(headings) else len(text)
        body = text[match.end():end].strip()
        lines = body.splitlines()
        article_title = lines[0].strip() if lines else ''
        if len(article_title) > 140 or re.match(r'^(?:\d+[.)]|Όποιος\b|Όποια\b|Όποιο\b|Με\b|Ο\b|Η\b|Αν\b|Από\b|Για\b|Τα\b|Το\b|Σε\b)', article_title):
            article_title = None
        # Keep the full body, including multiline titles, in the source text.
        sections.append({'number': label, 'label': match[1] + ' ' + label,
                         'title': article_title, 'text': body,
                         'source_page': bisect_right(page_starts, match.start())})
    if number == 4619:
        for label, word in [('299', 'Ανθρωποκτονία με δόλο'), ('372', 'Κλοπή'), ('308', 'Σωματική βλάβη'), ('380', 'Ληστεία'), ('386', 'Απάτη')]:
            section = next((s for s in sections if s['number'] == label), None)
            if not section or word not in section['text']:
                raise ValueError(f'Could not verify basic offence {label} in the original Code')
    expected = {4619: 390, 4855: 203, 5090: 138}[number]
    if len(sections) < expected:
        raise ValueError(f'Too few articles extracted for {number}/{year}: {len(sections)}')
    result = {'number': str(number), 'year': str(year), 'title': title,
              'published_at': published, 'fek_number': issue_number,
              'source_url': f'https://api.et.gr/apiLAW/1/{year}/{number}/pdf',
              'sha256': hashlib.sha256(filename.read_bytes()).hexdigest(),
              'pdf_filename': filename.name, 'page_count': len(reader.pages),
              'text': text, 'sections': sections}
    output = ROOT / f'law-{number}-{year}.json'
    output.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    print(json.dumps({'law': f'{number}/{year}', 'sections': len(sections), 'pages': len(reader.pages)}, ensure_ascii=False))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    for source in SOURCES:
        extract(*source)
