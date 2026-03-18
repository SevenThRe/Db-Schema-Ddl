# Phase 2: Template and Round-Trip Authoring - Research

**Researched:** 2026-03-18
**Domain:** first-party `.xlsx` templates, template-led workbook creation, and parser-backed round-trip trust
**Confidence:** HIGH

## Research Summary

Phase 2 should be built as a **seed-workbook template system**, not as a brand-new workbook authoring engine.

The repo already has the right ingredients:

- a parser that supports two workbook layout families and acts as the compatibility authority
- a normal file lifecycle through `uploaded_files`
- existing workbook-writing experience in `server/lib/excel-writeback.ts`
- a sidebar-first file workflow that can absorb a lightweight `从模板创建` action cleanly

The safest architecture is:

1. keep **two official seed workbooks**, one for each parser-supported layout family
2. create a new workbook by cloning a seed and blanking it into a valid first-party template
3. immediately reopen that workbook through the existing parser
4. block success if the parser does not recognize it as expected
5. register the created workbook through the normal file list so the user keeps working without re-import

**Primary recommendation:** use checked-in parser-proven `.xlsx` seed files plus a server-side template creation service, validate every generated workbook with the existing parser, and treat round-trip validation as a blocking trust gate for built-in templates.

## Standard Stack

### Core

| Library / Module | Current Version / Source | Purpose | Recommendation |
|---|---|---|---|
| `xlsx` | `0.18.5` in `package.json` | workbook read/write, worksheet utilities | Keep using it as the main workbook IO layer |
| `fs/promises` | Node built-in | seed copy, temp output, file persistence | Use for seed cloning and output storage |
| `zod` | `3.x` | template contracts and round-trip result typing | Extend current shared schemas rather than ad hoc payloads |
| `@tanstack/react-query` | `5.x` | create-template mutation and file-list invalidation | Reuse existing file-list cache invalidation patterns |
| existing UI stack (`@radix-ui/*`, shadcn patterns) | current repo | dropdown/menu + chooser dialog | Reuse for upload action menu and template chooser |

### Existing Internal Stack to Reuse

- `server/lib/excel.ts`
- `server/routes/files-routes.ts`
- `server/storage.ts`
- `server/lib/excel-writeback.ts`
- `client/src/components/Sidebar.tsx`
- `client/src/pages/Dashboard.tsx`
- `client/src/hooks/use-ddl.ts`
- `shared/schema.ts`
- `shared/routes.ts`

### External Documentation Signals

- SheetJS Community Edition documents `read`, `readFile`, worksheet helpers like `aoa_to_sheet`, and workbook export helpers like `writeFile`, confirming the current `xlsx` stack is the right foundation for Phase 2. [SheetJS Docs](https://docs.sheetjs.com/docs/api/parse-options/) [SheetJS Demo](https://docs.sheetjs.com/docs/demos/data/redis/)
- SheetJS Community Edition documentation also states that CE focuses on data extraction and that richer styling support is part of Pro-oriented capabilities, which is a strong signal not to hand-build styled templates from scratch when style/layout fidelity matters. [SheetJS Docs](https://docs.sheetjs.com/docs/api/parse-options/)

## Architecture Patterns

### 1. Treat parser-compatible seed workbooks as the source of truth

Do not invent a third workbook layout or rebuild a “clean room” template from arrays alone.

Recommended pattern:

- check in two official seed `.xlsx` workbooks
- each seed already matches one parser-supported layout family
- clone the seed at creation time
- blank mutable content fields while preserving workbook structure and expected headers

Why:

- the parser in `server/lib/excel.ts` is already strict about labels, boundaries, and supported layout families
- using parser-proven seed files sharply reduces structural drift risk
- this sets up Phase 3 `DDL -> XLSX` to reuse the same workbook skeletons instead of inventing a second export format

### 2. Make the parser the postcondition, not just the future consumer

Round-trip validation should not be “nice to have”.

Recommended pattern:

- create workbook
- reopen it through the existing parser using the same parse path the app uses later
- assert:
  - workbook opens
  - intended sheets exist
  - intended parser layout is recognized
  - the result is structurally empty-but-valid, not malformed or ambiguous

If this fails, the create action must fail.

Why:

- Phase 2's product promise is “official templates are trustworthy”
- the app already has a concrete compatibility oracle: the parser itself

### 3. Register created workbooks through the normal uploaded-file lifecycle

Do not create a second concept like “template drafts” or “internal workbooks”.

Recommended pattern:

- the create-template endpoint persists a real `.xlsx`
- the result is inserted into the same `uploaded_files` flow or a deliberately equivalent persistence path
- the returned payload includes the new file id and metadata
- frontend invalidates `[api.files.list.path]` and auto-selects the new file

Why:

- the repo is strongly file-driven today
- `Dashboard.tsx` already knows how to auto-select files and remember last selection
- `use-ddl.ts` already has proven query invalidation patterns for file changes

### 4. Put template creation in the existing upload affordance

Do not create a separate “template module” or force users into Settings/DB 管理 for file creation.

Recommended pattern:

- convert the upload affordance into an action menu
- keep `上传 Excel`
- add `从模板创建`
- open a small chooser dialog that explains the two official variants

Why:

- this matches the existing mental model: “I am bringing a workbook into the system”
- the user explicitly asked for the template selection to happen after the first click, not as multiple top-level buttons

### 5. Use template-specific validation metadata, not generic toast-only success

The create-template response should carry structured validation state, not just `success: true`.

Recommended response shape:

- template variant id
- generated file metadata
- round-trip verdict
- validation summary
- mismatch list when blocked

Why:

- planner/executor will need a stable trust/failure model
- UI should be able to distinguish “created and trusted” from “creation blocked due to validation mismatch”

## Don't Hand-Roll

- Do not hand-roll OOXML / ZIP / XML workbook generation for templates.
- Do not invent a new workbook format that the parser does not already understand.
- Do not rebuild styled templates from `aoa_to_sheet` alone if workbook fidelity matters.
- Do not create a separate “template draft” inventory outside `uploaded_files`.
- Do not treat built-in template round-trip mismatch as a warning-only event.
- Do not fold Phase 3 `DDL -> XLSX` concerns into Phase 2.

## Common Pitfalls

### 1. Rebuilding templates from plain arrays and silently losing workbook intent

SheetJS CE is excellent for read/write and worksheet utilities, but the official docs emphasize CE's data-first focus and limited styling fidelity compared with Pro features. If Phase 2 tries to fully synthesize a styled/positioned workbook from scratch, subtle layout or metadata drift is likely.

Recommendation:

- prefer seed workbook cloning
- blank only the mutable authoring cells
- avoid “generate entire template from arrays” as the first cut

### 2. Validating only file existence, not parser semantics

A workbook can be a perfectly valid `.xlsx` yet still be semantically useless to this product if the parser no longer recognizes the layout.

Recommendation:

- validation must re-enter the existing parser
- success means “the parser recognizes the workbook as the intended supported layout”

### 3. Creating a template but not inserting it into the real file flow

If the result only downloads to disk, users are forced into an awkward re-import loop and the feature stops feeling native.

Recommendation:

- persist the file
- register it
- return its file id
- auto-select it in the dashboard

### 4. Hiding the variant choice in top-level sidebar clutter

The user already chose a two-step flow:

- upload menu
- then chooser dialog

If the sidebar directly grows multiple template buttons, the file area will become noisy quickly.

Recommendation:

- keep one entry point: `从模板创建`
- place the two variants in a small chooser dialog with short descriptions

### 5. Letting future `DDL -> XLSX` leak into template architecture too early

Phase 3 will need canonical-schema-to-workbook mapping, but Phase 2 does not need that yet.

Recommendation:

- design seed workbook storage and template metadata so Phase 3 can reuse them
- do not pull canonical export logic into Phase 2 execution

## Code Examples

### Example 1: Seed-based template creation flow

```typescript
async function createWorkbookFromTemplate(variant: "multi_sheet" | "single_sheet") {
  const seedPath = resolveSeedWorkbookPath(variant);
  const workbookBuffer = await fs.readFile(seedPath);
  const workbook = XLSX.read(workbookBuffer, { type: "buffer" });

  blankTemplateAuthoringCells(workbook, variant);

  const outputBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const outputPath = await writeGeneratedWorkbook(outputBuffer, variant);

  const parseResult = parseWorkbookBundle(outputPath);
  assertTemplateRoundTrip(parseResult, variant);

  return registerGeneratedWorkbook(outputPath);
}
```

### Example 2: Blocking trust gate

```typescript
type TemplateCreateResult =
  | {
      status: "created";
      file: UploadedFile;
      validation: { ok: true; variant: TemplateVariantId };
    }
  | {
      status: "blocked";
      validation: {
        ok: false;
        variant: TemplateVariantId;
        mismatches: string[];
      };
    };
```

### Example 3: Sidebar action menu + chooser separation

```typescript
type FileCreationAction = "upload" | "template";

// Sidebar upload button opens:
// - 上传 Excel
// - 从模板创建
//
// Choosing `template` opens a dialog with:
// - 多表/Sheet 模板
// - 单表/Sheet 模板
```

### Example 4: Auto-activation in the normal file workflow

```typescript
const createTemplate = useCreateTemplateWorkbook();

createTemplate.mutate(
  { variant: "multi_sheet" },
  {
    onSuccess: (result) => {
      if (result.status !== "created") return;
      void queryClient.invalidateQueries({ queryKey: [api.files.list.path] });
      setSelectedFileId(result.file.id);
    },
  },
);
```

## Prescriptive Implementation Guidance

### Use

- current `xlsx` dependency for workbook IO
- parser-proven seed workbooks as the official template skeletons
- existing file registration and query invalidation patterns
- existing sidebar location for file creation actions
- parser-backed blocking validation for built-in templates

### Avoid

- generating workbook ZIP/XML structures directly
- introducing a template storage model outside the current file model
- treating round-trip validation as best-effort
- adding more than the two parser-backed variants in this phase
- letting Phase 2 drift into full `DDL -> XLSX`

## Confidence and Unknowns

### High Confidence

- Seed workbook cloning is the right first-cut architecture for this phase.
- Built-in template creation should be blocked by parser round-trip failure.
- The result should join the normal file list immediately instead of downloading first.
- Sidebar upload menu + chooser dialog is the right UX boundary.

### Medium Confidence

- The cleanest seed storage location is likely a checked-in asset directory included in the app bundle, but execution should confirm whether `attached_assets/` or a dedicated template asset directory is the least confusing choice.
- `server/lib/excel-writeback.ts` may offer reusable file-write mechanics, but the execution plan should verify whether a smaller dedicated template-writer service is cleaner than extending writeback utilities directly.

### Needs Planning Attention

- Decide how to represent “blank but valid” for each seed workbook so future Phase 3 population logic can reuse the same blanks safely.
- Decide the minimum round-trip assertion set per variant:
  - recognized sheet count
  - recognized table count
  - expected layout classification
  - no parser fallback into ambiguous or empty-invalid state

---

*Phase: 02-template-and-round-trip-authoring-v1_1*
*Research complete: 2026-03-18*
