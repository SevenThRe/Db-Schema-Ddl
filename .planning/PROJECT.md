# Bidirectional Schema Workflow Platform

## What This Is

This milestone extends the shipped DB management extension beyond `file vs DB` and safe apply into bidirectional schema workflows. The product should help users compare real database environments directly, start new schema workbooks from first-party templates, and eventually convert supported DDL back into parser-compatible Excel definition files.

The target audience is existing DBSchemaExcel2DDL desktop users who already manage real schemas and now want to:

- compare two DB environments without exporting intermediate files
- standardize authoring around supported Excel templates
- move from DDL back into maintained `.xlsx` schema documents

## Core Value

Users can move in both directions across their schema workflow:

- `DB -> DB` for direct environment comparison
- `Template -> XLSX -> Parser` for trustworthy authoring
- `DDL -> canonical schema -> XLSX` for reverse documentation

without losing the app's existing strengths in typed schema handling and DB-oriented review.

## Requirements

### Validated

- Existing users can upload Excel definition files and parse multiple table definitions from a workbook
- Existing users can generate MySQL and Oracle DDL from structured table definitions
- Existing users can compare current files with historical versions and export ALTER previews
- Existing users can install the official DB management extension, connect to MySQL, compare file vs DB, preview SQL, run safe apply, inspect history, and visualize schema graphs

### Active

- [ ] Support direct `DB vs DB` comparison inside `DB 管理`
- [ ] Support directional `source DB -> target DB` preview without enabling cross-environment apply
- [ ] Provide built-in `.xlsx` templates for supported authoring styles
- [ ] Validate that generated or templated workbooks reopen cleanly through the parser
- [ ] Support `MySQL DDL -> canonical schema -> XLSX` as a supported reverse-authoring path
- [ ] Surface unsupported or lossy DDL constructs before export so users know where manual cleanup is needed

### Out of Scope

- Automatic `DB -> DB` synchronization or apply
- General SQL editor and arbitrary SQL parsing
- First-cut Oracle DDL import
- User-defined Excel layouts outside the supported template family
- Expanding to a general-purpose DB IDE

## Context

- `v1.0` is complete and audited at `.planning/v1.0-v1.0-MILESTONE-AUDIT.md`
- The app already has a canonical schema seam, DB history, diff, safe-apply, and graph infrastructure
- The next value jump is not “more DB apply,” but “stronger compare plus reverse authoring”
- The user explicitly wants template-led authoring before `DDL -> XLSX`

## Constraints

- **Compatibility**: Existing `v1.0` DB-management flows must remain stable while `v1.1` extends them
- **Scope**: `DB vs DB` remains compare-and-preview only in this milestone
- **Authoring**: Generated XLSX must stay inside the parser-supported family, not invent arbitrary layouts
- **Dialect strategy**: Reverse-authoring starts MySQL-first; Oracle import is deferred
- **Trust**: Template and export outputs should be validated by re-import, not assumed correct

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Start `v1.1` with `DB vs DB` compare | Fastest extension of shipped DB-management seams and highest immediate operational value | Accepted |
| Put template/round-trip work before `DDL -> XLSX` | Matches user priority and reduces reverse-authoring risk | Accepted |
| Keep `DDL -> XLSX` MySQL-first | Current runtime and canonical seams are MySQL-led; Oracle import would broaden parser risk too early | Accepted |
| Keep `DB vs DB` preview-only | Cross-environment apply is too risky to bundle into this milestone | Accepted |

---
*Last updated: 2026-03-18 after opening v1.1*
