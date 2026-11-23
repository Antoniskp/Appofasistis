# Gazette index and annual progress

Open `http://localhost:3001/#gazettes`, choose **Ευρετήριο ΦΕΚ** in the sidebar,
or use the homepage's **Ευρετήριο & πρόοδος** card.

The index has year/series cards, issue search, topic and PDF filters, missing
issue numbers, official PDF links, links to imported acts, and a numbering guide.
It distinguishes a law number, a Gazette year/series/issue identity, and a
provision number within an act.

## What the counters mean

- A Gazette is counted once per normalized series, issue number, and publication
  year. Several acts and a standalone Gazette record may share one issue.
- **Saved PDF** requires a Gazette source attachment whose file actually exists
  in `data/files/`. Metadata and committee reports do not count as saved Gazettes.
- **With act text** means at least one imported act in that issue has active
  source-text units. It does not certify that the entire issue was transcribed.
- The official inventory total covers only the year/series combinations listed
  on the page. It is not the number of all Greek Gazettes.
- Year/series PDF completion requires all issues from an explicit, verified
  inventory. A maximum observed issue number is never used to infer a total.
  Unverified groups have an unknown denominator. Current-year snapshots cannot
  be marked as completed years.
- Category filters concern imported acts. Missing issues have no assigned topic,
  so a topic filter cannot be used to infer whole-year completion. The annual
  progress panel always retains the whole year/series denominator.

The endpoint `GET /api/laws/gazettes` reads imported documents, active unit counts,
and sources from Neo4j. Citation placeholders are excluded. The visible index
refreshes with the existing status polling; PDF availability is checked again
while the index is open. No additional database schema or import is required.

## Official inventories

`config/gazette-catalogue.json` stores explicit issue numbers and verification
dates. On 17 November 2026 the official National Printing House catalogue returned:

| Year | Series | Issues |
| --- | --- | ---: |
| 1833 | Α | 42 |
| 2006 | Α | 284 |
| 2019 | Α | 218 |
| 2020 | Α | 265 |
| 2021 | Α | 257 |
| 2022 | Α | 245 |
| 2024 | Α | 212 |
| 2026 | Α | 189 (open year; snapshot) |

Total: 1,712 distinct issues in these eight inventories. The 1833 Α series is
the present archive classification, not a claim that modern series divisions
were already in use in 1833.

To verify or extend the inventories, use the official search at
<https://search.et.gr/el/simple-search/> with the exact year and series. Its public
search interface currently calls `POST https://searchetv99.azurewebsites.net/api/simplesearch`
with JSON such as:

```json
{"selectYear":["1833"],"selectIssue":["1"],"documentNumber":"","searchText":"","datePublished":"","dateReleased":""}
```

The response's `data` is a JSON-encoded array. Verify successful status, all
series IDs, distinct positive issue numbers, and absence of result truncation
before updating the inventory. Store the explicit numbers, series code, source
link, and verification date. Set `openYear: true` for a year still in progress;
reverify after it closes before removing that flag. Restart the local server
after changing configuration. Browsing the app itself makes no external calls
to refresh these source snapshots.

## Validation

`test/gazetteIndex.test.js` checks deduplication, exact inventories with gaps,
metadata/source exclusions, unexpected issues, series normalization, and open
years. The HTTP integration test covers the endpoint against Neo4j. The local
browser check is `node output/check-gazette-index.cjs`; it exercises progress,
filters, pagination, reader links, entry points, and responsive layouts.
