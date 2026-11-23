"""Extract the original Migration Code and the cited Greek EU directive articles."""

from pathlib import Path
import hashlib
import json
import re
import runpy
import sys

from pypdf import PdfReader


def extract(directory, source):
    pdf = directory / source["pdf_filename"]
    if hashlib.sha256(pdf.read_bytes()).hexdigest() != source["sha256"]:
        raise ValueError("The Greek directive PDF does not match the reviewed edition")
    reader = PdfReader(pdf)
    if len(reader.pages) != source["page_count"]:
        raise ValueError("Unexpected directive page count")

    lines = []
    for page_number, page in enumerate(reader.pages, 1):
        for line in page.extract_text().splitlines():
            line = line.strip()
            if line and not re.match(r"^(?:(?:\d+/\d+ )?ELI:|ΕΕ L της |EL ΕΕ L της )", line):
                lines.append((page_number, line))

    headings = {}
    for position, (_, line) in enumerate(lines):
        match = re.fullmatch(r"Άρθρο (\d+)", line)
        if match and 4 <= int(match[1]) <= 11:
            if match[1] in headings:
                raise ValueError("Ambiguous directive article heading")
            headings[match[1]] = position
    if list(headings) != [str(number) for number in range(4, 12)]:
        raise ValueError("Unexpected sequence of directive articles")

    sections = []
    for number in range(4, 11):
        start = headings[str(number)]
        stop = headings[str(number + 1)]
        article_lines = lines[start + 1:stop]
        title = article_lines[0][1]
        text = "\n".join(line for _, line in article_lines)
        if len(text) < 100 or re.search(r"^ΚΕΦΑΛΑΙΟ\b", text, re.M):
            raise ValueError(f"Check the boundaries of directive Article {number}")
        sections.append({
            "number": str(number), "label": f"Άρθρο {number}", "title": title, "text": text,
            "source_page": lines[start][0],
            "source_pages": sorted({page for page, _ in article_lines} | {lines[start][0]}),
        })
    return sections


def extract_migration_code(root, directory):
    extract_recent = runpy.run_path(str(root / "scripts/extract-recent-laws.py"))["extract"]
    extract_recent(directory, {
        "number": "5038", "year": "2023", "published_at": "2023-04-01",
        "fek_number": "81", "article_count": 179,
        "pdf_sha256": "826446ab38961ce1a697c9795609e51298ccfc6989db097af061eefc7037e0d3",
        "articles_before_structural_headings": [
            "4", "7", "25", "27", "52", "58", "60", "62", "65", "66", "67",
            "79", "82", "90", "93", "95", "100", "125", "133", "134", "137",
            "142", "160", "162", "163", "166", "167", "169", "173", "178",
        ],
    })
    filename = directory / "law-5038-2023.json"
    source = json.loads(filename.read_text(encoding="utf-8"))
    article = source["sections"][26]
    # The printed «Ε.5) lacks a closing guillemet. Keep it verbatim while
    # indexing the following paragraph marker, verified on the next page.
    marker = "«Ε.5)"
    if article["number"] != "27" or article["text"].count(marker) != 1:
        raise ValueError("The reviewed unmatched guillemet in Article 27 changed")
    text = article["text"]
    # Convert the Python character offset to the browser's UTF-16 offset.
    article["ignored_quote_offsets"] = [len(text[:text.index(marker)].encode("utf-16-le")) // 2]
    filename.write_text(json.dumps(source, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "output/citation-library"
    entries = json.loads((root / "config/citation-library.json").read_text(encoding="utf-8"))
    directive = next(item for item in entries if item.get("document_type") == "eu_directive")
    sections = extract(folder, directive)
    (folder / "directive-1233-2024.json").write_text(json.dumps(sections, ensure_ascii=False, indent=2), encoding="utf-8")
    extract_migration_code(root, folder)
