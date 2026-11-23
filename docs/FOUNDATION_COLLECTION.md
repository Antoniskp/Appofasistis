# Basic criminal-law collection

The local library contains the original Gazette publications of:

| Law | Publication | Source |
| --- | --- | --- |
| 4619/2019, Criminal Code | Gazette A 95, 11 June 2019 | https://api.et.gr/apiLAW/1/2019/4619/pdf |
| 4855/2021, amendments | Gazette A 215, 12 November 2021 | https://api.et.gr/apiLAW/1/2021/4855/pdf |
| 5090/2024, amendments | Gazette A 30, 23 February 2024 | https://api.et.gr/apiLAW/1/2024/5090/pdf |

The source PDFs are saved in the app's `data/files/` folder, with hashes checked before import.
The full extracted publication text is preserved. Standalone article headings and grouped headings
are indexed separately; a grouped heading such as “Άρθρα 3–4” remains one source group.
These are dated original publications, **not a consolidation of the law currently in force**.

Ten starter shortcuts point to original Criminal Code articles 299, 302, 308, 330, 333, 336,
372, 378, 380, and 386. The display includes publication dates and source-page numbers.
Aliases and personal summaries make simple searches such as “μην κλέβεις” and “dont kill” useful.

Two amendment links were checked against complete Gazette pages:

- 4855/2021 article 63 → Criminal Code article 299(1), PDF page 28.
- 5090/2024 article 58 → Criminal Code article 372(1), PDF page 21.

These links do not establish that no later amendments exist. Automatic relationship classifications
remain unreviewed. The text is not presented as current consolidated legislation.

## Reproducing the import

`scripts/extract-foundation-laws.py` reads the three source PDFs and writes structured JSON beside them.
It requires `pypdf`; the Codex artifact Python includes it. It removes running page headers, rejoins
line-ending Greek word hyphenation, and matches standalone headings to avoid indexing contents entries
and quoted replacement headings as additional outer-law articles.

With Appofasistis running, use the script from the installed app folder:

```powershell
node scripts/import-basic-laws.js C:/path/to/prepared-pdfs-and-json
```

The importer checks PDF hashes, constructs unique article/paragraph identities, imports all three
graphs transactionally, saves original PDFs, and adds starter notes only when notes do not yet exist.
Subsequent runs preserve existing personal annotations.

## Everyday-law additions

The library also includes five original Gazette publications, with 454 articles in total:

| Law | Topic | Original Gazette |
| --- | --- | --- |
| 4624/2019 | Personal data and national GDPR implementation | A 137, 29 August 2019 |
| 4727/2020 | Digital government and electronic communications | A 184, 23 September 2020 |
| 4936/2022 | National climate framework | A 105, 27 May 2022 |
| 4967/2022 | Digital content, services, and sales of goods | A 171, 9 September 2022 |
| 5089/2024 | Equality in civil marriage | A 27, 16 February 2024 |

Original PDFs are obtained from `https://api.et.gr/apiLAW/1/{year}/{number}/pdf`.
Download them to `output/legal-foundations/law-{number}-{year}.pdf`, then run:

```powershell
python scripts/extract-collection-laws.py
npm run laws:import-collection
```

The extractor requires `pypdf`. It checks the complete ordered article sequence for each law,
ignores contents entries, retains source-page locations, and records the PDF's SHA-256 hash.
The importer verifies every source's identity, article sequence, page range, and PDF checksum
before writing the batch. Repeating the import updates the same five document identities and
preserves personal annotations. Prepared source JSON and PDFs are in `output/legal-foundations/`.

`config/law-collection.json` supplies topic filters, short display titles, and reading guides.
Guides are orientation aids to the original publications and stay separate from personal notes.
The browser opens the introductory guide and law finder by default. Readers can choose one article, move to its neighbours,
or explicitly show all articles. The full official title and original PDF remain accessible.
These additions are dated publications, not current consolidated legislation.


## Further foundations and paragraph links

Two additional original Gazette sources were added:

| Law | Source publication | Articles | Indexed numbered paragraphs |
| --- | --- | ---: | ---: |
| 3500/2006, domestic violence | [A 232, 24 October 2006](https://api.et.gr/apiLAW/1/2006/3500/pdf) | 28 | 49 |
| 4620/2019, Criminal Procedure Code | [A 96, 11 June 2019](https://api.et.gr/apiLAW/1/2019/4620/pdf) | 592 | 1,059 |

These are the dated source publications. The 3500/2006 PDF is the official reprint;
its reprint notice is retained as publication metadata, outside legal paragraphs.
The 4620/2019 source has a printed irregular heading for article 258; its raw heading
and source-page location are preserved, and its identity remains `law:4620:2019:article:258`.
All 592 Code articles are checked in exact sequence. The ratifying law's First and
Second articles remain in source text and are separate from the Code's numbered articles.
Later corrections and amendments are not merged into these publications.

Run `python scripts/extract-more-foundations.py` after obtaining the two official PDFs.
To import or refresh all ten prepared originals, run:

```powershell
npm run laws:import-foundations
```

The batch validates every source identity and PDF hash, saves a graph backup under
`data/backups/`, and uses one graph transaction for the document and unit updates.
Existing annotations are preserved. The ten publications currently contain 1,812
article/group units and 3,305 confidently indexed numbered paragraphs. Four other
documents contain imported metadata, giving 14 documents and 5,121 active units before the historical archive batch.
Reimporting the batch has been checked to keep document, unit and reference counts unchanged.

Paragraph indexing accepts consecutive top-level numbering and ignores numbered
replacement text inside guillemets. Ambiguous sequences remain within the article
text, without a guessed paragraph identity. Citation context must be attached to the
specific cited law; nearby article numbers are not borrowed from another citation.

### Import order and target availability

Chronological import order is useful for organising a collection, but it is not a
technical prerequisite for linking. A detected reference creates a stable target
identity immediately, such as `law:3500:2006:article:6:paragraph:1`. When that exact
unit is imported later, the same identity becomes active. The source document does
not need to be imported again just to connect it. The 34 existing references to
3500/2006 now reach an imported law; references identifying an available provision
can open it directly.

The app distinguishes a missing law from an imported law whose requested article
or paragraph is not yet indexed. It jumps only to available units and labels the
remaining targets explicitly. Refreshing a target can make a removed unit inactive
without destroying its citation identity or historical source versions. Numbered
paragraphs have selectable, highlighted links that survive a reload, for example:
`/#law=law%3A3500%3A2006&article=6&paragraph=1`.

Code names and abbreviations in older laws are not automatically redirected to newer
codes. For example, a reference to a Criminal Code in a 2006 publication cannot be
assumed to target the Code enacted in 2019. Such identities need explicit evidence.
Relationship types remain unreviewed; availability of a citation is not a finding
that a provision is current or that all its amendments have been imported.

The originals of 2251/1994 (consumer protection) and 2690/1999 (administrative procedure)
were downloaded for the next older-law pass. These PDFs are image scans and have not
been imported as verified article text. They need OCR and source-page review first.
The existing placeholders for them remain available for later resolution.

Verification: `NEO4J_TESTS=true npm test` covers later imports, missing paragraphs,
refreshes and preserved notes. `node output/check-foundation-links.cjs` verifies actual
citation clicks, paragraph URLs, PDF hashes and desktop/mobile reading layouts.


The chronological historical collection is documented separately in [HISTORICAL_ORIGINS.md](HISTORICAL_ORIGINS.md).
