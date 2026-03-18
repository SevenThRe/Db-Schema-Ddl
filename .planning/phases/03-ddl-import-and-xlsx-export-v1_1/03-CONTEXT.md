# Phase 3: DDL Import and XLSX Export - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds `MySQL DDL -> canonical schema -> XLSX` reverse authoring.

It covers:

- accepting supported MySQL DDL as input
- parsing that DDL into the product's canonical schema review model
- surfacing unsupported or lossy constructs before export
- exporting parser-compatible `.xlsx` workbooks using the official template family
- letting users export all parsed tables or a selected subset

It does **not** cover:

- Oracle DDL import
- direct `DB -> XLSX` export from live selected tables
- arbitrary SQL parsing outside the supported MySQL subset
- cross-environment apply or new DB compare features

</domain>

<decisions>
## Implementation Decisions

### DDL Input Modes
- Phase 3 should support two DDL input paths:
  - paste MySQL DDL text directly
  - upload a `.sql` or `.ddl` file
- The primary first-class entry should be `paste SQL`.
- File upload is a secondary convenience entry, not the primary mental model.
- After parsing, users should be able to export either:
  - all parsed tables
  - a selected subset of parsed tables

### Out-of-Scope Adjacent Input
- If users later want to generate XLSX directly from selected live DB tables, that is a legitimate future capability.
- That direct `DB -> XLSX` path is **not** part of this phase and should be deferred rather than folded into Phase 3.

### Supported MySQL Subset
- The first cut should target the common, operationally useful MySQL `CREATE TABLE` subset, not an ultra-minimal parser.
- Supported constructs should include:
  - table and column names
  - data type and size
  - `NULL / NOT NULL`
  - `DEFAULT`
  - `AUTO_INCREMENT`
  - `PRIMARY KEY`
  - `UNIQUE`
  - normal `INDEX`
  - `COMMENT`
  - `FOREIGN KEY`
- The parser should remain MySQL-first and explicitly avoid pretending to support broader SQL dialects.

### Unsupported / Lossy Handling
- Unsupported or lossy constructs must be surfaced explicitly.
- The app must not silently discard unsupported semantics and present a “clean” export as if fidelity were perfect.
- Examples that should remain explicit unsupported/lossy cases for the first cut include:
  - generated columns
  - check constraints
  - partitioning
  - triggers, procedures, and views
  - complex expression defaults
  - broader non-essential table-option variants beyond the supported subset

### Export Template Selection
- Export should support both official workbook template families introduced in Phase 2.
- On first export, the user should explicitly choose:
  - `单表 Sheet`
  - `多表 Sheet`
- After that, the product should remember the user's last export template choice and reuse it by default until changed.

### Review Workspace Structure
- Phase 3 should not be a blind “paste and immediately export” flow.
- The main reverse-authoring workspace should be a three-column review flow:
  - left: original DDL text or uploaded-file content
  - center: canonical parsed table review
  - right: warnings/lossy report, export settings, and export action
- This structure exists to make fidelity and loss visible before export.

### Export Blocking Policy
- If the parse result includes unsupported or lossy items, export handling should be selective rather than all-or-nothing.
- The correct first-cut policy is:
  - block export for constructs that cannot be safely represented in the target XLSX contract
  - allow export for manageable lossy cases only after clear user confirmation
- The product should not:
  - block every imperfect case automatically
  - or allow every lossy case to export silently

### Claude's Discretion
- Planner and researcher can decide the exact shape of the canonical review grid as long as the three-column source/review/warnings structure remains clear.
- Planner and researcher can decide whether DDL upload is a tab, segmented control, or secondary action as long as pasted SQL remains the primary path.
- Planner and researcher can decide the exact unsupported/lossy taxonomy and wording as long as blocking vs confirmable cases stay distinct and visible.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/lib/ddl.ts`
  Current forward-generation logic already defines how the app represents MySQL/Oracle table structure and naming during DDL generation.
- `server/routes/ddl-routes.ts`
  Existing DDL route family and request validation patterns can be extended or mirrored for reverse-authoring flows.
- `client/src/components/DdlGenerator.tsx`
  Existing DDL-facing workspace already contains SQL-oriented viewing, selection, and warning presentation patterns that can inform the reverse-authoring UI.
- `server/lib/workbook-templates.ts`
  Phase 2 already established official parser-compatible workbook templates and a trust model around them.
- `server/lib/excel.ts`
  Existing parser remains the compatibility authority for exported workbooks and can be used for round-trip confidence checks.
- `server/lib/excel-writeback.ts`
  The codebase already has workbook-writing experience and style-preserving cell patch workflows for `.xlsx`.

### Established Patterns
- Shared Zod contracts in `shared/schema.ts` and `shared/routes.ts` remain the required source of truth.
- The product already prefers explicit blockers and warnings over silent risky behavior.
- Template-backed workbook generation is now an established product pattern from Phase 2.
- File-driven workflows remain the dominant UX pattern; exported workbooks should fit that model cleanly.

### Integration Points
- Add a reverse-authoring input surface that can accept pasted SQL or uploaded DDL files.
- Build a canonical review stage before export rather than exporting directly from raw SQL text.
- Reuse Phase 2 template infrastructure for choosing and producing the final workbook shape.
- Reuse parser round-trip checks or equivalent compatibility validation after export.
- Keep export subset selection attached to parsed tables rather than raw text ranges.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly wants both pasted DDL and uploaded SQL file support.
- The user also wants to be able to export only selected parsed tables rather than forcing a full-export every time.
- The preferred user-facing result is not a tiny warning list; it is a structured review flow where source SQL, parsed schema, and export warnings/settings are all visible together.
- The user accepted a selective blocking policy:
  - truly inexpressible/lossy cases should block
  - manageable lossy cases can proceed with confirmation

</specifics>

<deferred>
## Deferred Ideas

- Direct `DB -> XLSX` export from selected live DB tables is explicitly deferred to a future phase.
- Oracle DDL import remains deferred under `DDLX-04`.
- General SQL parser ambitions beyond the supported MySQL subset remain out of scope.
- Broader reverse-authoring from arbitrary SQL bundles or schema dumps remains future work.

</deferred>

---

*Phase: 03-ddl-import-and-xlsx-export-v1_1*
*Context gathered: 2026-03-18*
