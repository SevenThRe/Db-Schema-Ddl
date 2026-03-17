# Requirements: DB Management Extension Platform

**Defined:** 2026-03-17
**Core Value:** Users can optionally turn the desktop app into a schema management workstation by downloading one official extension on demand, without bloating the base product for everyone else.

## v1 Requirements

### Extension Host

- [ ] **HOST-01**: User can see whether the DB management extension is installed, not installed, disabled, or incompatible
- [ ] **HOST-02**: User can click a DB-management entry point and be prompted to download the extension when it is not installed
- [ ] **HOST-03**: Core app can load only enabled, compatible, verified official extensions at startup
- [ ] **HOST-04**: Core app remains fully usable for existing Excel/DDl workflows when the extension is absent

### Distribution and Lifecycle

- [ ] **DIST-01**: User can view extension version, size, compatibility, and release summary before download
- [ ] **DIST-02**: User can download the extension from the official GitHub release channel from inside the app
- [ ] **DIST-03**: App verifies checksum and compatibility before installing the extension
- [ ] **DIST-04**: User can enable, disable, upgrade, and uninstall the extension without reinstalling the base app

### DB Connectivity

- [ ] **DBCO-01**: User can create, edit, delete, and test a target database connection
- [ ] **DBCO-02**: App stores DB credentials locally in a protected form rather than exposing them in plain text
- [ ] **DBCO-03**: Extension can introspect tables, columns, primary keys, foreign keys, indexes, and comments from a target schema

### Schema Comparison

- [ ] **DIFF-01**: User can compare the currently selected file or sheet with a target DB schema
- [ ] **DIFF-02**: User can compare the last deployed baseline snapshot with the live target DB schema
- [ ] **DIFF-03**: User can review and confirm rename suggestions before SQL generation when the comparison is ambiguous

### Deploy and History

- [ ] **DEPL-01**: User can preview CREATE and ALTER SQL derived from file-vs-DB differences before execution
- [ ] **DEPL-02**: User can run a dry-run deployment to see the planned changes and risk summary without applying them
- [ ] **DEPL-03**: User can apply approved non-destructive schema changes to the target DB and see per-object execution results
- [ ] **DEPL-04**: App records deployment jobs and baseline snapshots per target connection and schema

### Visualization

- [ ] **VIZ-01**: User can inspect DB-oriented diff results in a filterable tree view aligned with current diff workflows
- [ ] **VIZ-02**: User can open an ER-style schema diagram that highlights changed tables and relationships

## v2 Requirements

### Distribution

- **DIST-05**: User can install multiple official extensions from the same extension host
- **DIST-06**: App can stage rollback to the previous extension version after a failed update

### DB Coverage

- **DBCO-04**: Extension supports advanced Oracle-specific packaging and driver requirements with guided setup
- **DBCO-05**: Extension supports additional object types such as views, triggers, and stored procedures

### Operations

- **DEPL-05**: User can opt into explicitly destructive schema changes with extra safeguards and approvals
- **DEPL-06**: User can export deployment reports suitable for audit and handoff

## Out of Scope

| Feature | Reason |
|---------|--------|
| Third-party plugin marketplace | Too much trust and support surface for initial release |
| General SQL editor and result grid | Not required for the core schema-management value |
| Data migration and ETL tooling | Separate problem space from schema deployment |
| Automatic destructive migration execution by default | Too risky for the first supported release |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HOST-01 | Phase 1 | Pending |
| HOST-02 | Phase 1 | Pending |
| HOST-03 | Phase 1 | Pending |
| HOST-04 | Phase 1 | Pending |
| DIST-01 | Phase 2 | Pending |
| DIST-02 | Phase 2 | Pending |
| DIST-03 | Phase 2 | Pending |
| DIST-04 | Phase 2 | Pending |
| DBCO-01 | Phase 3 | Pending |
| DBCO-02 | Phase 3 | Pending |
| DBCO-03 | Phase 3 | Pending |
| DIFF-01 | Phase 4 | Pending |
| DIFF-02 | Phase 4 | Pending |
| DIFF-03 | Phase 4 | Pending |
| DEPL-01 | Phase 4 | Pending |
| DEPL-02 | Phase 4 | Pending |
| DEPL-03 | Phase 5 | Pending |
| DEPL-04 | Phase 5 | Pending |
| VIZ-01 | Phase 5 | Pending |
| VIZ-02 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 after initial definition*

