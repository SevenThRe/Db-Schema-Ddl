---
phase: 03-ddl-import-and-xlsx-export-v1_1
plan: 02
subsystem: mysql-ddl-parser-normalization
tags: [ddl-import, parser, normalization, issue-classification]
requires: [03-01]
provides:
  - MySQL DDL parser adapter
  - Canonical normalization for supported CREATE TABLE structures
  - Explicit blocking vs confirmable issue classification
affects: [server, shared, test]
tech-stack:
  added: []
  patterns: [adapter layer, canonical normalization, explicit lossy classification]
key-files:
  created:
    - server/lib/ddl-import/parser-adapter.ts
    - server/lib/ddl-import/normalize.ts
    - server/lib/ddl-import/issues.ts
  modified:
    - server/routes/ddl-routes.ts
    - test/server/ddl-import-phase3.test.ts
completed: 2026-03-18T14:20:00+09:00
---

# Phase 3 Plan 02 Summary

The backend now parses supported MySQL DDL into a richer canonical catalog and classifies fidelity risks before export.

## Accomplishments

- Added a MySQL-first parser adapter around `@dbml/core` so Phase 3 does not depend on brittle regex or comma-splitting logic.
- Normalized parsed DDL into the app's review catalog shape with tables, columns, PK/unique/index/FK metadata, ready for UI review and workbook export.
- Classified parse failures and workbook-lossy constructs into explicit `blocking`, `confirm`, and `info` issues so export decisions stay visible and deliberate.

## Verification

- `node --test --import tsx test/server/ddl-import-phase3.test.ts`: **passed**
- `npm run check`: **passed**

## Self-Check: PASS
