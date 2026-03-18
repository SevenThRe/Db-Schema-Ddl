# Phase 3: DDL Import and XLSX Export - Research

**Researched:** 2026-03-18
**Domain:** MySQL DDL ingestion, canonical reverse-authoring review, and export into parser-compatible official Excel templates
**Confidence:** MEDIUM-HIGH

## Research Summary

Phase 3 should be built as a **staged reverse-authoring pipeline**, not as a direct `SQL text -> workbook cells` shortcut.

The repo already has the right export-side foundation:

- first-party official workbook templates from Phase 2
- a parser that remains the compatibility authority for exported `.xlsx`
- a file-driven lifecycle through `uploaded_files`
- existing SQL-oriented UI patterns in `client/src/components/DdlGenerator.tsx`
- an existing richer canonical schema model on the DB-management side than the legacy `TableInfo` shape

The main unresolved risk is the **DDL parser**. Based on current package signals:

- `node-sql-parser` markets itself as a simple generic SQL parser, but its public docs do not clearly commit to MySQL `CREATE TABLE` support
- `@dbml/core` publishes an explicit SQL parser support matrix for MySQL and claims support for the exact first-cut features this phase needs: `CREATE TABLE`, `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE KEY`, inline `INDEX`, `AUTO_INCREMENT`, and `COMMENT`

**Primary recommendation:** use `@dbml/core` as the MySQL DDL ingestion engine behind a thin adapter, normalize its output into an internal reverse-authoring catalog derived from the existing DB canonical model, then export through the Phase 2 official workbook templates and immediately re-validate the generated workbook with the existing Excel parser before registering it as a normal file.

## Standard Stack

### Core

| Library / Module | Current Version / Source | Purpose | Recommendation |
|---|---|---|---|
| `@dbml/core` | `6.4.0` from npm | MySQL DDL import/parser with published support matrix | Use as the primary parser adapter target for Phase 3 |
| `xlsx` | `0.18.5` in `package.json` | workbook read/write and seed-template cloning | Keep as the workbook IO layer |
| `zod` | `3.x` | typed request/review/export/warning contracts | Extend shared schemas, do not create ad hoc payloads |
| `@tanstack/react-query` | `5.x` | parse-preview/export mutations and file-list refresh | Reuse existing mutation patterns from file/template flows |
| existing UI stack (`@radix-ui/*`, shadcn patterns) | current repo | paste/upload input, review panes, export settings | Reuse for the three-column DDL import workspace |

### Existing Internal Stack to Reuse

- `server/routes/ddl-routes.ts`
- `client/src/components/DdlGenerator.tsx`
- `server/lib/workbook-templates.ts`
- `server/lib/excel.ts`
- `server/lib/excel-writeback.ts`
- `server/routes/files-routes.ts`
- `client/src/hooks/use-ddl.ts`
- `shared/schema.ts`
- `shared/routes.ts`
- `server/lib/extensions/db-management/schema-normalizer.ts`

### External Documentation Signals

- `@dbml/core` publishes a SQL parser feature matrix for MySQL import that explicitly covers the first-cut Phase 3 feature set: `CREATE TABLE`, `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE KEY`, inline `INDEX`, `AUTO_INCREMENT`, and table/column `COMMENT`. It also clearly labels partial or unsupported areas such as `CREATE TABLE AS SELECT`, some table options, generated columns, and partial indexes. That makes it a much safer first parser choice than a generic SQL parser with unclear DDL guarantees.
- `xlsx` is already the repo's workbook read/write foundation and remains the right choice for seed-template cloning plus export output.

## Architecture Patterns

### 1. Build a staged import pipeline, not a one-shot SQL-to-Excel transform

Recommended pipeline:

1. accept pasted SQL text or uploaded `.sql` / `.ddl`
2. parse MySQL DDL through a dedicated parser adapter
3. normalize parser output into a reverse-authoring catalog
4. classify unsupported and lossy semantics
5. let the user review source, normalized schema, and warnings side-by-side
6. export selected tables into one official workbook template family
7. immediately reopen the generated workbook through the existing Excel parser
8. block registration if the exported workbook fails parser-backed validation
9. register the workbook through the normal file list

Why:

- parser risk and workbook risk are different and should be isolated
- the user explicitly wants review and explicit loss visibility before export
- the product already has a trusted parser and a trusted file lifecycle

### 2. Hide the parser behind a local adapter boundary

Do not spread third-party parser output types across the codebase.

Recommended shape:

- `server/lib/ddl-import/parser-adapter.ts`
- one entry point such as `parseMysqlDdlToReverseCatalog(sqlText)`
- all parser-library-specific quirks stay inside the adapter
- downstream code consumes only internal normalized types

Why:

- `@dbml/core` is the best current fit, but it still introduces an external AST/model surface
- if parser API friction or fidelity gaps appear, swapping to a constrained in-repo parser later becomes feasible
- lossy classification becomes easier when it works on one stable internal shape

### 3. Normalize into the richer DB-style canonical model first, not directly into `TableInfo`

`TableInfo` is Excel-authoring oriented. It is not a good primary review model for reverse authoring because it does not naturally represent:

- foreign keys
- indexes and uniqueness
- parser-level unsupported/lossy metadata
- DDL-origin provenance

Recommended pattern:

- normalize imported DDL into a catalog structurally close to `dbSchemaCatalogSchema`
- keep explicit issue arrays for:
  - blocking unsupported items
  - confirmable lossy items
  - informational drops
- only map to workbook-facing row/cell payloads at export time

Why:

- Phase 3 needs a faithful review surface before it needs workbook rows
- the DB-management canonical model already matches DDL semantics far better than the legacy Excel table model

### 4. Reuse the official Phase 2 workbook templates as the only export targets

Do not invent a third workbook layout for reverse authoring.

Recommended pattern:

- export only to the two official template families from Phase 2
- first export asks the user to choose:
  - `单表 Sheet`
  - `多表 Sheet`
- remember the last choice for subsequent exports
- use seed-template cloning plus deterministic population rules

Why:

- the parser already recognizes these layouts
- Phase 2 already established them as first-party trustworthy outputs
- this keeps `DDL -> XLSX` and `template-led authoring` on the same workbook contract

### 5. Make parser-backed round-trip validation a blocking postcondition

The exported workbook is only acceptable if the existing Excel parser can read it as intended.

Recommended validation:

- generated workbook opens
- expected sheet family is recognized
- selected tables are present in parser output
- required structural labels still exist

If validation fails:

- do not register the file
- surface a blocking export failure with parser mismatch details

Why:

- Phase 3 is promising a reversible bridge into the product's main Excel workflow
- parser-backed validation is the only trustworthy acceptance gate already present in the repo

### 6. Reuse the existing SQL-facing UI patterns instead of inventing a new editor shell

The left column should feel like an evolution of the current DDL viewer, not a brand-new subsystem.

Recommended UI split:

- left: pasted SQL or uploaded-file content with syntax highlighting and source mode controls
- center: normalized review of parsed tables, columns, PK/FK/index/comment metadata
- right: export settings, template choice, selected tables, warnings, and blocker list

Why:

- `DdlGenerator.tsx` already has SQL tokenization/highlighting patterns worth reusing
- the user explicitly asked for a visible review flow, not a blind converter

## Don't Hand-Roll

- Do not use `node-sql-parser` as the primary DDL ingestion path for Phase 3.
- Do not parse MySQL `CREATE TABLE` by regex-splitting on commas or parentheses.
- Do not map raw SQL directly into `TableInfo` and hope metadata survives.
- Do not write workbook XML/ZIP structures by hand.
- Do not bypass parser-backed validation for exported workbooks.
- Do not silently drop unsupported semantics and present the export as faithful.
- Do not fold direct `live DB -> XLSX` export into this phase.

## Common Pitfalls

### 1. Treating parser support and workbook expressibility as the same thing

Even if the DDL parser understands a construct, the target Excel contract may not be able to represent it cleanly.

Examples:

- generated columns
- check constraints
- unusual table options
- expression-heavy defaults
- specialized index flavors

Recommendation:

- keep separate classifications:
  - parser unsupported
  - parsed but workbook-inexpressible
  - parsed but workbook-lossy

### 2. Breaking column parsing with naive comma splitting

MySQL DDL routinely contains commas inside:

- `DECIMAL(10,2)`
- composite keys
- composite indexes
- multi-column foreign keys
- comments or default expressions

Recommendation:

- never implement Phase 3 with manual top-level comma splitting as the primary parser
- rely on the parser adapter for statement structure

### 3. Losing naming fidelity and quoting semantics too early

Quoted identifiers, explicit constraint names, and source order all matter for trustworthy review.

Recommendation:

- preserve source names and explicit constraint names in the normalized catalog
- keep line/range metadata if the parser can provide it
- derive warnings from preserved source nodes rather than post-hoc guesses

### 4. Letting lossy exports proceed without an explicit paper trail

The user specifically asked to see what is lost or risky before export.

Recommendation:

- attach issues to the exact table/column/constraint they affect
- distinguish:
  - blocking issues
  - confirm-required issues
  - informational notices

### 5. Registering an exported workbook before round-trip validation finishes

If file registration happens first, users can end up with a workbook in the file list that the product itself cannot parse correctly.

Recommendation:

- export to a temporary path
- validate through the existing parser
- only then write/register the final file metadata

### 6. Designing the phase around broad SQL support instead of the chosen MySQL subset

Phase 3 is intentionally MySQL-first. If planning expands into `ALTER TABLE`, Oracle import, or arbitrary schema dumps, complexity will spike quickly.

Recommendation:

- keep the parser adapter and review taxonomy scoped to:
  - MySQL
  - `CREATE TABLE`
  - related PK/FK/UNIQUE/INDEX/comment/default/auto-increment semantics

## Code Examples

### Example 1: Parser adapter boundary

```typescript
export interface DdlImportIssue {
  severity: "blocking" | "confirm";
  kind: "parser_unsupported" | "workbook_lossy" | "workbook_inexpressible";
  entityKey: string;
  message: string;
}

export interface ReverseAuthoringCatalog {
  dialect: "mysql";
  tables: DbTable[];
  issues: DdlImportIssue[];
  sourceSql: string;
}

export async function parseMysqlDdlToReverseCatalog(sqlText: string): Promise<ReverseAuthoringCatalog> {
  const parsed = await parseThroughDbmlAdapter(sqlText);
  return normalizeImportedSchema(parsed);
}
```

### Example 2: Export pipeline with validation gate

```typescript
async function exportImportedDdlToWorkbook(input: {
  catalog: ReverseAuthoringCatalog;
  selectedTableNames: string[];
  templateId: WorkbookTemplateVariantId;
}) {
  assertNoBlockingIssues(input.catalog.issues);

  const workbookBuffer = await renderWorkbookFromOfficialTemplate({
    catalog: input.catalog,
    selectedTableNames: input.selectedTableNames,
    templateId: input.templateId,
  });

  const validation = await validateGeneratedWorkbookWithExcelParser(workbookBuffer, input.templateId);
  if (!validation.recognized) {
    throw new Error("Generated workbook failed parser-backed validation");
  }

  return registerGeneratedWorkbookBuffer(workbookBuffer);
}
```

### Example 3: Three-column review contract

```typescript
type DdlImportPreviewResponse = {
  source: {
    mode: "paste" | "upload";
    sqlText: string;
    fileName?: string;
  };
  catalog: ReverseAuthoringCatalog;
  exportOptions: {
    templateId?: WorkbookTemplateVariantId;
    rememberedTemplateId?: WorkbookTemplateVariantId;
    selectableTableNames: string[];
  };
};
```

### Example 4: Loss classification before export

```typescript
function classifyImportedConstruct(feature: ImportedFeature): DdlImportIssue | null {
  if (feature.kind === "generated_column") {
    return {
      severity: "blocking",
      kind: "workbook_inexpressible",
      entityKey: feature.entityKey,
      message: "Generated columns cannot be represented safely in the official workbook contract.",
    };
  }

  if (feature.kind === "table_option" && feature.optionName === "ENGINE") {
    return null;
  }

  if (feature.kind === "fulltext_index") {
    return {
      severity: "confirm",
      kind: "workbook_lossy",
      entityKey: feature.entityKey,
      message: "FULLTEXT index metadata will not round-trip faithfully through the workbook format.",
    };
  }

  return null;
}
```

## Prescriptive Implementation Guidance

### Use

- `@dbml/core` as the primary MySQL DDL parser behind a local adapter
- `dbSchemaCatalog`-like normalized structures as the semantic review model
- Phase 2 official workbook templates as the only export targets
- existing `xlsx` infrastructure for workbook cloning/output
- the existing Excel parser as the final export validation gate
- `DdlGenerator.tsx` SQL viewing patterns for the left column of the new workspace

### Avoid

- building Phase 3 around generic SQL parsing packages with unclear DDL guarantees
- broadening support to Oracle or `ALTER TABLE` in this phase
- leaking third-party parser AST shapes into shared contracts
- exporting before issue classification and parser-backed workbook validation

