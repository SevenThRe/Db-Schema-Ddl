# Roadmap: DB Management Extension Platform

**Created:** 2026-03-17
**Granularity:** Coarse
**Coverage:** 20 / 20 v1 requirements mapped

## Summary

This roadmap treats the work as a brownfield expansion of the existing Electron application. The build order starts with the extension host so that the DB management capability can ship as an optional downloadable module rather than as a one-off hardcoded feature.

## Phase Overview

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Extension Host Foundation | Add a stable host model for optional extensions without disturbing base workflows | HOST-01, HOST-02, HOST-03, HOST-04 | 4 |
| 2 | GitHub Delivery and Lifecycle | Let users discover, download, verify, install, enable, disable, upgrade, and uninstall the official DB extension | DIST-01, DIST-02, DIST-03, DIST-04 | 4 |
| 3 | DB Connectivity and Introspection | Add extension-side connection management and canonical live-schema ingestion | DBCO-01, DBCO-02, DBCO-03 | 4 |
| 4 | File-vs-DB Diff and Deploy Preview | Compare file/baseline schemas to live DBs and generate controlled SQL previews | DIFF-01, DIFF-02, DIFF-03, DEPL-01, DEPL-02 | 5 |
| 5 | Apply, History, and Visualization | Execute approved non-destructive changes, persist history, and visualize DB differences | DEPL-03, DEPL-04, VIZ-01, VIZ-02 | 5 |

## Phase Details

### Phase 1: Extension Host Foundation

Goal: Establish extension metadata, install state, load boundaries, and UI entry points so the base app can recognize but not require the DB management extension.

Requirements:
- HOST-01
- HOST-02
- HOST-03
- HOST-04

Success criteria:
1. The base app can track installed extension metadata and compatibility state in local persistence.
2. Clicking a DB-management entry point shows an install prompt when the extension is absent instead of dead-ending.
3. Startup only loads enabled and verified extensions and does not break when none are present.
4. Existing Excel parsing, DDL generation, and historical diff flows behave exactly as before with no extension installed.

### Phase 2: GitHub Delivery and Lifecycle

Goal: Deliver the DB management capability through an official GitHub-hosted extension package with verification and lifecycle controls.

Requirements:
- DIST-01
- DIST-02
- DIST-03
- DIST-04

Success criteria:
1. The app can fetch an official extension catalog entry that includes version, size, compatibility, and release summary.
2. Users can download the extension from the GitHub release channel through the desktop UI.
3. Installation enforces checksum and app-version compatibility before activation.
4. Users can enable, disable, upgrade, and uninstall the extension without reinstalling the base application.

### Phase 3: DB Connectivity and Introspection

Goal: Provide the extension with stable DB connection management and canonical schema ingestion.

Requirements:
- DBCO-01
- DBCO-02
- DBCO-03

Success criteria:
1. Users can create, edit, delete, and test DB connections from the installed extension UI.
2. Sensitive connection material is stored locally in protected form and is not exposed in routine UI or logs.
3. The extension can introspect target schemas and normalize tables, columns, PKs, FKs, indexes, and comments into a canonical model.
4. The extension stores enough snapshot data to support later diff and deployment phases.

### Phase 4: File-vs-DB Diff and Deploy Preview

Goal: Extend the existing diff experience to compare structured file definitions and baseline snapshots against live DB schemas, then preview SQL safely.

Requirements:
- DIFF-01
- DIFF-02
- DIFF-03
- DEPL-01
- DEPL-02

Success criteria:
1. Users can compare the selected file or sheet with a target DB schema and inspect added, removed, modified, and renamed candidates.
2. Users can compare live DB state with the last deployed baseline snapshot for drift detection.
3. Ambiguous rename candidates require review before SQL generation proceeds.
4. The extension can generate CREATE and ALTER SQL previews from file-vs-DB differences.
5. Users can perform a dry-run deployment that summarizes intended changes and surfaced risks without applying them.

### Phase 5: Apply, History, and Visualization

Goal: Turn preview into controlled execution and give users persistent operational visibility into DB change state.

Requirements:
- DEPL-03
- DEPL-04
- VIZ-01
- VIZ-02

Success criteria:
1. Users can apply approved non-destructive schema changes and inspect per-object results.
2. Every deployment job persists execution history, source version context, and target-schema baseline metadata.
3. DB-oriented diff results are explorable in a filterable tree view aligned with the current schema diff mental model.
4. Users can open an ER-style view that highlights changed tables and relationships.
5. Failures during apply leave enough structured history for debugging and safe retry planning.

## Phase Dependencies

- Phase 2 depends on Phase 1
- Phase 3 depends on Phase 1 and benefits from Phase 2 packaging decisions
- Phase 4 depends on Phase 3
- Phase 5 depends on Phase 4

## Notes

- Canonical schema normalization is a foundational concern and should start inside Phase 1/3 design, not be deferred to the end.
- Oracle-specific driver and packaging complexity is intentionally not the gating path for initial host delivery; keep platform constraints explicit during implementation.

---
*Last updated: 2026-03-17 after roadmap creation*

