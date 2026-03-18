# Phase 3: Reverse Import Expansion - Research

**Researched:** 2026-03-18
**Domain:** SQL bundle reverse import, Oracle first-cut DDL import, and convergence into the existing canonical review/workbook-export flow
**Confidence:** MEDIUM-HIGH

## Research Summary

Phase 3 should be implemented as an **extension of the current DDL import pipeline**, not as a second reverse-authoring subsystem.

The repo already has the right foundation:

- a working parser adapter boundary for MySQL in [server/lib/ddl-import/parser-adapter.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/server/lib/ddl-import/parser-adapter.ts)
- normalization into a stable review catalog in [server/lib/ddl-import/normalize.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/server/lib/ddl-import/normalize.ts)
- explicit issue classification in [server/lib/ddl-import/issues.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/server/lib/ddl-import/issues.ts)
- official-template workbook export plus parser-backed round-trip in [server/lib/ddl-import/export-service.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/server/lib/ddl-import/export-service.ts)
- a shared three-column review UI in [client/src/components/ddl-import/DdlImportWorkspace.tsx](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/client/src/components/ddl-import/DdlImportWorkspace.tsx)

The most important discovery is that the project already depends on `@dbml/core`, and its local README plus type definitions show:

- `Parser.parseMySQLToJSONv2(...)` is already the current MySQL import engine
- `Parser.parseOracleToJSON(...)` exists in the installed package types
- the bundled README documents support matrices for MySQL and Oracle `CREATE TABLE`, keys, defaults, comments, indexes, and known weak spots such as `ALTER TABLE`, table options, generated columns, and partial/advanced index features

**Primary recommendation:** keep `@dbml/core` as the single SQL parser family for Phase 3, but split the repo adapter into explicit source-mode adapters:

- MySQL single-source / bundle adapter
- Oracle subset adapter

Both adapters should normalize into one shared reverse-import catalog and one shared issue taxonomy. Bundle handling should remain conservative: accept structure-oriented statement sets, block or warn on unsupported statements, and never try to “repair” arbitrary SQL into workbook-safe structure.

## Standard Stack

### Core Libraries and Modules

| Library / Module | Current Version / Source | Purpose | Recommendation |
|---|---|---|---|
| `@dbml/core` | `^6.4.0` in `package.json`, local README and `types/parse/Parser.d.ts` | Primary SQL parser for MySQL today; installed package also exposes Oracle parser entry points | Keep as the parser engine for both MySQL bundles and first-cut Oracle subset, behind local adapters |
| `xlsx` | `^0.18.5` | Workbook generation and seed-template cloning | Keep as the workbook IO layer |
| `zod` | `^3.24.2` | Stable request/response and canonical artifact schemas | Extend existing DDL import contracts instead of inventing source-specific payloads |
| Existing DDL import/export pipeline | local repo | preview, issue classification, export, round-trip validation, file registration | Reuse directly; Phase 3 should plug into this chain |
| Existing React Query + shadcn/Radix UI stack | local repo | input, review, export controls | Reuse in the same three-column workspace |

### Evidence from Local Installed Parser

From `node_modules/@dbml/core/README.md`:

- MySQL and Oracle both show support for:
  - basic `CREATE TABLE`
  - parameterized types
  - `PRIMARY KEY`
  - `FOREIGN KEY`
  - `UNIQUE`
  - `DEFAULT`
  - comments
- The same README explicitly marks weak or unsupported areas such as:
  - `CREATE TABLE AS SELECT`
  - `ALTER TABLE` operations
  - some table options and advanced column properties
  - generated/computed columns as partial
  - partial/advanced index features as partial or unsupported

From `node_modules/@dbml/core/types/parse/Parser.d.ts`:

- `parseMySQLToJSONv2`
- `parseOracleToJSON`

That makes `@dbml/core` the safest available parser family for this phase because it already powers shipped MySQL import and has an installed, documented Oracle path.

## Architecture Patterns

### 1. Extend the current staged import pipeline instead of building a separate reverse-import subsystem

Recommended pipeline:

1. select source mode:
   - pasted SQL
   - uploaded `.sql` / `.ddl`
   - uploaded SQL bundle
2. classify intended dialect / source mode
3. parse through a source-specific adapter
4. normalize into one stable reverse-import catalog
5. classify unsupported / lossy / informational issues
6. review in the existing three-column workspace
7. export through the official template families only
8. validate exported workbook through the existing Excel parser
9. register the workbook into the normal file flow only after validation passes

Why:

- this matches the shipped MySQL-first workflow
- it avoids a second review/export subsystem
- it keeps every source mode on one canonical trust gate

### 2. Split parser adapters by source family, but converge immediately after parsing

Recommended adapter seam:

- `parseMysqlSqlBundleToRawDatabase(sqlText)`
- `parseOracleSubsetToRawDatabase(sqlText)`
- shared `normalizeImportedDdl(...)`-style projection into one internal catalog

Important constraint:

- parser-library-specific raw shapes must stay inside adapters
- downstream code should only see one normalized review artifact

Why:

- MySQL bundle handling and Oracle subset handling will differ at parse/gating time
- the rest of the product should not care where the catalog came from

### 3. Treat SQL bundles as “structure-oriented import batches,” not arbitrary SQL programs

Recommended interpretation of bundle mode:

- The product accepts a bundle when it is primarily a set of structural schema statements that can feed workbook review.
- Supported bundle content can include:
  - `CREATE TABLE`
  - related `COMMENT`
  - related `CREATE INDEX` / inline index forms the parser can map
  - related PK/FK/UNIQUE declarations
- Unsupported top-level statements should not trigger “best effort execution-style recovery.”
- Instead:
  - classify them explicitly
  - block export when they make the schema view untrustworthy
  - keep the product honest about unsupported migration script shapes

Why:

- the milestone explicitly rejects becoming a general SQL runner
- bundle mode should widen reverse import safely, not silently guess

### 4. Keep the canonical review model richer than workbook rows

Phase 3 should continue to normalize into the richer DDL-import catalog, not directly into workbook rows or legacy `TableInfo`.

The review model should preserve:

- dialect
- source mode
- table / column / index / FK / comment semantics
- issue arrays with stable entity keys
- optional statement-level metadata
- lossy / unsupported provenance

Why:

- workbook export is downstream of review, not the review model itself
- AI/MCP expansion needs a stable, machine-usable artifact

### 5. Use one issue taxonomy across MySQL, bundle, and Oracle paths

Recommended categories:

- `blocking`
  - parser failure
  - parser-unsupported statement families
  - workbook-inexpressible constructs
- `confirm`
  - reviewable but lossy mappings
- `info`
  - intentionally dropped metadata or dialect details

Why:

- the repo already established this trust model
- adding a second severity system would make review and MCP automation harder

### 6. Oracle support should be allowlist-first, not “parse whatever works”

Recommended Oracle strategy:

- only claim support for the documented first-cut subset
- let the adapter and issue classifier aggressively surface unsupported features
- do not widen scope because the parser happens to accept some syntax

This is especially important for:

- identity variants
- storage/tablespace clauses
- partitioning
- advanced indexes
- trigger/sequence semantics
- non-table objects

Why:

- parser acceptance is not the same as workbook-safe support
- a documented subset is more trustworthy than accidental partial coverage

## Don't Hand-Roll

- Do not build a custom SQL parser for MySQL or Oracle DDL.
- Do not replace `@dbml/core` with regex or comma-splitting logic.
- Do not hand-split SQL bundles with naive semicolon parsing that ignores strings/comments.
- Do not create a separate Oracle-only review data model.
- Do not map new source modes directly into workbook rows before canonical review.
- Do not silently discard unsupported statements from bundles and still present the result as faithful.
- Do not treat parser acceptance as proof of workbook expressibility.
- Do not bypass parser-backed workbook round-trip validation.

## Common Pitfalls

### 1. Confusing “bundle import” with “generic SQL support”

Many SQL bundles mix:

- DDL
- DML
- migration bookkeeping
- vendor-specific session commands

If the implementation tries to support all of that, Phase 3 will balloon immediately.

Recommendation:

- define bundle mode around structure-oriented import only
- classify the rest explicitly as unsupported or blocking

### 2. Letting unsupported statements poison the whole import path silently

For bundle mode, the real failure mode is not “parser throws.”
It is “unsupported statements get ignored, but the user assumes the imported workbook is faithful.”

Recommendation:

- surface unsupported statement families at review time
- block export when fidelity cannot be trusted

### 3. Reusing the MySQL adapter too literally for Oracle

The current normalization path is MySQL-shaped:

- `AUTO_INCREMENT`
- inline comments
- MySQL-specific index semantics

Oracle first-cut support should share the normalized catalog, but not reuse MySQL assumptions blindly.

Recommendation:

- create an Oracle adapter that projects Oracle raw output into the same catalog deliberately
- keep dialect-specific loss rules explicit

### 4. Losing statement provenance too early

Bundle and Oracle paths will be much harder to debug if the normalized artifact cannot point back to where an issue came from.

Recommendation:

- preserve statement-level provenance where feasible
- at minimum keep stable entity keys and source-mode metadata
- prefer line/statement references if the parser or preprocessor can provide them

### 5. Claiming support for Oracle features that only parse partially

`@dbml/core` documents a lot of Oracle coverage, but it also marks many areas as partial.

Recommendation:

- turn partial/advanced Oracle areas into explicit lossy or blocking issues
- keep the public supported subset narrow and documented

### 6. Forking the UI by input mode

If bundle import and Oracle import each get their own review screen, future maintenance and MCP behavior will fragment quickly.

Recommendation:

- keep one three-column review shell
- vary only the source-mode controls and issue presentation

## Code Examples

### Example 1: Source-specific parser adapters converging into one artifact

```typescript
type ReverseImportSourceMode =
  | "mysql-paste"
  | "mysql-file"
  | "mysql-bundle"
  | "oracle-file"
  | "oracle-paste";

interface ReverseImportArtifact {
  sourceMode: ReverseImportSourceMode;
  dialect: "mysql" | "oracle";
  catalog: DdlImportCatalog;
  issues: DdlImportIssue[];
}

async function parseReverseImportSource(input: SourceInput): Promise<ReverseImportArtifact> {
  if (input.dialect === "oracle") {
    const raw = Parser.parseOracleToJSON(input.sqlText);
    return normalizeOracleImport(raw, input);
  }

  const raw = Parser.parseMySQLToJSONv2(input.sqlText);
  return normalizeMysqlImport(raw, input);
}
```

### Example 2: Conservative bundle gating

```typescript
function classifyBundle(sqlText: string): DdlImportIssue[] {
  const issues: DdlImportIssue[] = [];

  if (/\balter\s+table\b/i.test(sqlText)) {
    issues.push({
      severity: "blocking",
      kind: "parser_unsupported",
      entityKey: "source:alter-table",
      message: "ALTER TABLE is outside the supported reverse-import bundle subset.",
    });
  }

  if (/\binsert\b|\bupdate\b|\bdelete\b/i.test(sqlText)) {
    issues.push({
      severity: "confirm",
      kind: "info",
      entityKey: "source:dml",
      message: "DML statements are ignored by reverse-import review and are not represented in workbook export.",
    });
  }

  return issues;
}
```

### Example 3: Oracle subset allowlist

```typescript
function classifyOracleFeature(feature: OracleFeature): DdlImportIssue | null {
  if (feature.kind === "virtual_column") {
    return {
      severity: "blocking",
      kind: "workbook_inexpressible",
      entityKey: feature.entityKey,
      message: "Oracle virtual columns are outside the first-cut supported subset.",
    };
  }

  if (feature.kind === "tablespace_option") {
    return {
      severity: "info",
      kind: "info",
      entityKey: feature.entityKey,
      message: "Tablespace/storage attributes are not preserved in workbook export.",
    };
  }

  return null;
}
```

### Example 4: One review/export route family

```typescript
type ReverseImportPreviewRequest = {
  sourceMode: ReverseImportSourceMode;
  sqlText: string;
  fileName?: string;
};

type ReverseImportPreviewResponse = {
  artifact: ReverseImportArtifact;
  selectableTableNames: string[];
  rememberedTemplateId?: WorkbookTemplateVariantId;
};
```

## Prescriptive Implementation Guidance

### Use

- `@dbml/core` as the only parser family for Phase 3
- local parser adapters to isolate MySQL-bundle and Oracle-subset quirks
- the existing DDL import normalization, issue, export, and round-trip pipeline
- one stable reverse-import artifact with source-mode and dialect metadata
- the existing DDL import workspace as the single review surface

### Avoid

- broadening Phase 3 into arbitrary SQL support
- claiming Oracle parity beyond the documented subset
- parsing bundles with custom string-splitting logic
- duplicating issue taxonomy or export workflows by source mode
- registering exported workbooks before parser-backed validation succeeds
