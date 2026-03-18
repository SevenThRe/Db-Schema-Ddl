# Schema Provenance and Reverse Expansion

## What This Is

This milestone follows the delivered bidirectional workflow in `v1.1` and pushes the product into schema provenance and richer reverse-authoring. The goal is to help users compare historical DB states, turn live DB structure back into parser-compatible Excel workbooks, and expand reverse import beyond the current MySQL-first pasted-DDL flow.

The target audience is existing DBSchemaExcel2DDL desktop users who already:

- compare live DBs directly
- create trusted workbook templates
- convert supported MySQL DDL into parser-compatible `.xlsx`

and now want stronger history/reporting plus more direct reverse-documentation paths.

## Core Value

Users can move across schema time and source-of-truth boundaries:

- `snapshot -> snapshot` for historical DB provenance
- `live DB -> canonical schema -> XLSX` for direct reverse documentation
- `Oracle/MySQL SQL bundles -> canonical schema -> XLSX` for broader reverse import coverage

without dropping the app's existing parser-trust and DB-oriented review model.

## Requirements

### Validated

- Existing users can upload Excel definition files and parse multiple table definitions from a workbook
- Existing users can generate MySQL and Oracle DDL from structured table definitions
- Existing users can install the official DB management extension, compare file vs DB, preview SQL, run safe apply, inspect history, and visualize schema graphs
- Existing users can compare two live DB targets directly inside `DB 管理`
- Existing users can create first-party parser-compatible templates and convert supported MySQL DDL into `.xlsx`

### Active

- [ ] Support `snapshot <=> snapshot` and `live DB <=> snapshot` compare across saved DB histories
- [ ] Support exporting DB compare/snapshot reports for review and handoff
- [ ] Support direct `live DB -> XLSX` export through the official workbook template family
- [ ] Preserve the current round-trip validation and lossy-warning trust model for DB-originated workbook exports
- [ ] Expand reverse import beyond pasted single statements into SQL bundle/file flows
- [ ] Add first-cut Oracle DDL import with a documented supported subset

### Out of Scope

- Automatic cross-environment DB apply or sync
- Arbitrary SQL parser coverage for every dialect feature
- Custom user-defined workbook families outside the supported parser-backed templates
- Turning the product into a general-purpose SQL IDE

## Context

- `v1.0` is complete and audited at `.planning/v1.0-v1.0-MILESTONE-AUDIT.md`
- `v1.1` is complete and audited at `.planning/v1.1-v1.1-MILESTONE-AUDIT.md`
- The app already has canonical DB snapshots, graph/diff infrastructure, built-in workbook templates, and MySQL-first DDL reverse authoring
- The next value jump is better historical comparison plus more direct reverse-documentation from live DBs and broader SQL inputs

## Constraints

- **Compatibility**: Shipped `v1.0` and `v1.1` flows must remain stable while this milestone expands history and reverse authoring
- **Trust**: Any DB- or SQL-originated workbook export must still pass parser-backed round-trip validation before it is trusted
- **Scope**: Cross-environment apply remains out of scope; this milestone is still compare/export oriented
- **Dialect strategy**: Oracle reverse import should be introduced only as a documented first-cut subset, not as full parity
- **Reviewability**: New reverse-authoring inputs must keep explicit lossy and unsupported reporting

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Start `v1.2` with snapshot/history compare | Builds directly on shipped snapshot infrastructure and fulfills a deferred compare requirement | Accepted |
| Put `live DB -> XLSX` before Oracle import | Highest user value with the least new parser risk because it reuses canonical DB schema and official templates | Accepted |
| Expand SQL reverse import last | Bundle import and Oracle parsing widen risk and should follow once provenance/export seams are stable | Accepted |
| Keep trust gates mandatory | Reverse-documentation remains useful only if generated workbooks still reopen cleanly | Accepted |

---
*Last updated: 2026-03-18 after opening v1.2*
