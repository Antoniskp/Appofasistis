# Local graph architecture

The browser interface, Node.js application, Neo4j Community database, and PDF files all run on the user’s PC.
Appofa is an optional worker connection; it is not needed for library access.

## Primary storage

`src/localLaw/store.js` is the Neo4j adapter. SQLite is no longer used by the law app.
`src/localLaw/runtime.js` starts the portable local instance and provisions generated credentials.
The setup script verifies official distribution checksums and keeps Java/Neo4j inside `.runtime/`.
All listeners bind to loopback and remote Neo4j URIs are rejected.

Every entity has a unique `(namespace, id)`. The main collection is `laws`; integration tests use
independent `test-<uuid>` namespaces. Canonical legal IDs remain stable when placeholders are imported.

Nodes: LegalDocument, LegalUnit, Source, Annotation, Revision, LegalReference, ImportJob, TextVersion.
Relationships: HAS_UNIT, CONTAINS, CITES, HAS_REFERENCE, TARGETS, FROM_UNIT, HAS_SOURCE,
HAS_ANNOTATION, HAS_REVISION, HAS_TEXT_VERSION, plus inferred AMENDS/REPEALS/REPLACES/APPLIES.

Imported text updates create immutable content-addressed TextVersion snapshots. Personal notes have
separate revisions and transactional conflict detection. A metadata refresh cannot replace source text.

Inferred relations retain confidence, source reference IDs, and review status. They must not be used to
claim that a provision is in force or repealed without source verification. Effective-date consolidation
and a legal-validity timeline are not implemented yet.

## Exports

Graph exports contain all application nodes, properties, and relationships in a read-transaction snapshot.
Restore validates labels and relationship types and requires an empty target collection. PDFs are copied
separately. This export supports the app's graph model; it is not a Neo4j server/system-user dump.

## Lifecycle

The app starts the portable server if no Bolt listener exists. Existing configured local instances are
reused, and their credentials are not changed. On Ctrl+C the app closes its driver and stops only a server
it started itself. Windows process-tree termination relies on Neo4j transaction-log recovery at next start.
No Windows service or machine-wide Java installation is created.
