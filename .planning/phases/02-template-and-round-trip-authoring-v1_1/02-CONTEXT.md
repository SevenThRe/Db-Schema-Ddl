# Phase 2: Template and Round-Trip Authoring - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds first-party workbook templates and trustable round-trip validation for template-led authoring.

It covers:

- shipping built-in `.xlsx` templates that match the product's supported parser layouts
- letting users create a new schema-definition workbook from those templates
- validating generated templates by reopening them through the existing parser
- making the created workbook immediately usable inside the normal file-driven workflow

It does **not** cover:

- `DDL -> XLSX`
- free-form workbook export from canonical schema
- custom user-defined workbook formats
- changing the parser to support additional layout families beyond the two already supported

</domain>

<decisions>
## Implementation Decisions

### Template Source of Truth
- The templates must not invent a new workbook format.
- Official templates should be extracted from existing `.xlsx` workbooks that are already known to parse correctly with the current parser.
- The first cut should produce templates that are **blank but valid**, not sample-filled teaching files.
- The two parser-supported layout families should each get their own official template.

### Template Variants
- The product currently supports two workbook layout families through existing parser logic.
- Phase 2 should expose those as two official template variants.
- These variants should remain explicit rather than trying to merge them into a single shape-switching workbook.

### Entry Point
- Template creation should live alongside the existing upload flow, not as a separate module.
- The upload button should become a lightweight action menu.
- The first-cut menu should include at least:
  - `上传 Excel`
  - `从模板创建`
- Selecting `从模板创建` should open a small chooser panel where the user picks the template variant.

### Template Selection UX
- The menu should not expose both variants as top-level actions.
- The first click opens a small chooser panel rather than forcing the choice directly in the dropdown.
- This keeps room for short template descriptions and future expansion without bloating the sidebar.

### Round-Trip Validation
- Template creation must run automatic round-trip validation immediately after generation.
- The validation path is:
  - create workbook
  - reopen through the existing parser
  - verify the workbook can be recognized as the intended supported layout
- For first-party built-in templates, round-trip validation failure is a blocker, not a warning.
- A broken official template should never be handed to the user as if it were trustworthy.

### Template Output Ownership
- The result should be a real `.xlsx` workbook, not an in-memory-only draft.
- Users should not need to download a file manually and re-upload it to continue working.
- After creation succeeds, the workbook should be automatically registered into the existing file list and selected as the active file.
- The user should land directly back in the normal file-driven workspace with the new workbook available.

### Claude's Discretion
- Planner and researcher can decide the exact chooser-panel layout and copy, as long as the action menu + chooser flow remains lightweight.
- Planner and researcher can decide whether template extraction is implemented via checked-in seed workbooks, generated workbook builders, or a hybrid, as long as the parser-compatible workbook skeleton comes from proven existing layouts.
- Planner and researcher can decide the exact round-trip assertions, as long as failure is treated as blocking for built-in templates.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/lib/excel.ts`
  The current parser already supports two workbook layout families and is the round-trip source of truth.
- `server/routes/files-routes.ts`
  Existing upload/list/select workflow already defines how `.xlsx` files enter the product and appear in the file list.
- `client/src/components/Sidebar.tsx`
  Current upload-first file workflow lives here; this is the natural place to extend with a template creation menu.
- `client/src/pages/Dashboard.tsx`
  Current file selection and auto-selection flow can be reused so newly created workbooks become active immediately.
- `server/lib/excel-writeback.ts`
  There is already workbook-writing logic and style-preserving `.xlsx` handling experience in the codebase; Phase 2 does not need to treat workbook output as a brand-new problem.
- `shared/routes.ts`
  Centralized typed API contract is already the established place to add template creation and round-trip validation routes.

### Established Patterns
- The app is file-driven: uploaded or generated workbooks should appear in the same left-side file list.
- The parser is the compatibility authority; success means "the existing parser reopens it cleanly."
- Shared schemas and typed routes should remain the source of truth for client/server coordination.
- Conservative trust signaling is already an established product pattern in DB compare/apply flows and should carry over here.

### Integration Points
- Extend the sidebar upload control into a small action menu.
- Add a template chooser flow that stays close to file creation, not DB management.
- Add server-side workbook creation plus immediate parser-based validation.
- Persist the generated workbook through the same uploaded-files mechanism or a deliberately equivalent file-registration path.
- Reuse dashboard file-selection behavior so the created workbook becomes the active working file.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly wants official templates to be derived from already-supported real workbooks rather than a fresh invented format.
- The preferred templates are blank but structurally valid.
- The user wants the product to feel seamless: create from template, then continue working immediately without a manual download/re-import loop.
- The user prefers the template choice to happen in a small follow-up panel, not as multiple top-level menu entries.

</specifics>

<deferred>
## Deferred Ideas

- Full `DDL -> XLSX` export remains Phase 3.
- Free-form workbook generation from canonical schema remains out of scope for this phase.
- Template packs beyond the two parser-backed official variants are out of scope for this phase.
- Teaching/demo workbooks with rich sample content can be considered later but are not part of the first blank-and-valid template cut.

</deferred>

---

*Phase: 02-template-and-round-trip-authoring-v1_1*
*Context gathered: 2026-03-18*
