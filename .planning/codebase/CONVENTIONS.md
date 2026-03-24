# Coding Conventions

**Analysis Date:** 2026-03-24

## Naming Patterns

**Files:**
- React components: PascalCase `.tsx` — `DdlGenerator.tsx`, `TablePreview.tsx`, `SheetSelector.tsx`
- Hooks: `use-` prefix kebab-case `.ts` — `use-ddl.ts`, `use-toast.ts`
- Utilities: kebab-case `.ts` — `physical-name-utils.ts`, `desktop-bridge.ts`, `api-error.ts`
- Shared modules: kebab-case `.ts` — `physical-name.ts`, `schema.ts`, `config.ts`
- Rust source files: snake_case `.rs` — `ddl.rs`, `ddl_import.rs`, `name_fix_apply.rs`
- i18n locale files: language code `.json` — `ja.json`, `zh.json`
- Test files: `*.test.ts` / `*.test.tsx` placed under `test/` subdirectories mirroring source layout

**Functions (TypeScript):**
- Exported utilities: `camelCase` verb-noun — `normalizePhysicalName`, `applyNameFixPlan`, `validateTablePhysicalNames`
- React hooks: `use` prefix — `useGenerateDdl`, `useTableInfo`, `useSettings`
- Internal helpers: `camelCase` — `shortHash`, `clampWithSuffix`, `resolveDuplicate`
- Predicate functions: `is`/`has` prefix — `isValidPhysicalName`, `hasInvisibleCharacters`

**Functions (Rust):**
- All functions: `snake_case` — `render_mysql_table`, `map_data_type_oracle`, `escape_sql`
- Private helpers: plain `snake_case` — `ddl_error`, `count_to_i64`, `effective_author_name`
- Public API functions: `pub fn snake_case` — `generate_ddl_response`, `export_zip_for_tables`

**Variables:**
- TypeScript: `camelCase` — `tableNamesChanged`, `perTableColumnNames`, `resolvedTableName`
- Rust: `snake_case` — `zip_entries`, `tolerant_errors`, `effective_settings`

**Types / Interfaces:**
- TypeScript interfaces: PascalCase — `PhysicalNameTable`, `ColumnNameIssue`, `NameFixPlanResult`
- TypeScript type aliases: PascalCase — `NameFixConflictStrategy`, `ReservedWordStrategy`, `NameFixConflictType`
- Rust structs: PascalCase — `TableInfo`, `ColumnInfo`, `DdlSettings`

**Constants:**
- TypeScript: `SCREAMING_SNAKE_CASE` — `PHYSICAL_NAME_PATTERN`, `DEFAULT_TABLE_FALLBACK`, `DEFAULT_RESERVED_PREFIX`
- Rust: `SCREAMING_SNAKE_CASE` — `MYSQL_AUTO_INCREMENT_CODE`, `FALLBACK_AUTHOR`, `ZIP_MIME_TYPE`, `NO_TABLES_SELECTED_MESSAGE`

## Code Style

**Formatting (TypeScript):**
- No explicit Prettier or ESLint config detected at project root
- Consistent 2-space indentation throughout
- Trailing commas in multi-line arrays and objects
- Double-quoted strings in TypeScript

**Formatting (Rust):**
- Standard `rustfmt` formatting assumed (Cargo project)
- Consistent 2-space indentation inside match arms and function bodies
- Single-quoted character literals for character matches — `'('`, `'_'`

## Import Organization

**Observed order in `client/src/components/DdlGenerator.tsx`:**
1. React hooks from `react`
2. Internal feature hooks from `@/hooks/`
3. Type imports from `@shared/schema`
4. UI primitives from `@/components/ui/`
5. Utilities from `@/lib/`
6. Feature-specific sub-components from `@/components/{feature}/`
7. Icon libraries (`lucide-react`)
8. i18n (`react-i18next`)
9. Context hooks (`@/status-bar/context`)

**Path Aliases:**
- `@/` maps to `client/src/` — use for all intra-client imports
- `@shared/` maps to `shared/` — use for shared types, schemas, and utilities

**Re-export barrel pattern:**
- `client/src/lib/physical-name-utils.ts` is a pure re-export barrel that re-exports all symbols and types from `@shared/physical-name`
- Components import from `@/lib/physical-name-utils`, never directly from `@shared/physical-name`

## TypeScript Usage Patterns

**Zod schemas in `shared/schema.ts`:**
- Every shared data contract has a paired Zod schema and a TypeScript type
- Schema naming convention: `{entityName}Schema` — `uploadedFileRecordSchema`, `ddlSettingsSchema`
- Type naming: plain PascalCase (manually declared or inferred) — `UploadedFile`, `DdlSettings`
- Use `.default()` on optional settings fields to ensure safe deserialization
- Use `z.enum([...])` for discriminated string unions — e.g., `workbookTemplateVariantIdSchema`

**Generics for structural polymorphism (`shared/physical-name.ts`):**
- Utilities use bounded generics: `<TTable extends PhysicalNameTable>`, `<TTable extends PhysicalNameTable<TColumn>>`
- This allows name-fix functions to preserve caller-specific column/table types through transformation

**Defensive optional typing:**
- All Rust-derived fields in column/table interfaces are `Optional<T>` — never assume a parser field is present
- Use `?.` optional chaining and `?? fallback` consistently throughout component and utility code

**`as const` for literal type arrays:**
- Use `as const` to derive literal union types from data arrays
- Example: `DATA_TYPE_SELECTION_OPTIONS = [...] as const` in `client/src/components/DdlGenerator.tsx`

## React Component Patterns

**Props interface naming:**
```typescript
// Props interface declared immediately before the component function
interface DdlGeneratorProps {
  fileId: number | null;
  sheetName: string | null;
  overrideTables?: TableInfo[] | null;
  // Callback props use `on` prefix
  onSelectedTableNamesChange?: (next: Set<string>) => void;
  onOpenImportWorkspace?: () => void;
}
```

**TanStack Query usage:**
- All server state is fetched through custom hooks in `client/src/hooks/use-ddl.ts`
- Never call API functions directly from components — always go through a `use*` hook
- Mutation destructuring pattern: `const { mutate: generateDdl } = useGenerateDdl()`
- Hooks return TanStack Query result objects directly; no intermediate wrapper

**State management:**
- Server state: TanStack Query cache only
- UI state: `useState` local to the owning component
- Cross-component shared state: React context (`ExtensionHostContext`, `StatusBarContext`)
- No Redux, Zustand, or other global store library

**Hook composition:**
- Feature hooks in `use-ddl.ts` compose multiple `useQuery` / `useMutation` calls
- All hooks for a feature domain are grouped in one file

## Rust Code Style and Patterns

**Error propagation:**
- Functions return `Result<T, String>` — not `anyhow::Error` or custom error enums
- Error messages are built with `format!("{CONSTANT_MESSAGE}: {detail}")`
- Shared error-building helper: `fn ddl_error(action: &str, error: impl Display) -> String`

**Constants over magic strings:**
- All string literals with semantic meaning are module-level `const` — see `src-tauri/src/ddl.rs` lines 15–33
- Error message constants end in `_MESSAGE`, code constants end in `_CODE`, fallback constants start with `FALLBACK_`

**Struct design:**
- All public structs derive `#[derive(Debug, Clone, Serialize, Deserialize)]`
- JSON serialization uses `#[serde(rename_all = "camelCase")]` on all structs to match TypeScript conventions
- Optional fields use `#[serde(skip_serializing_if = "Option::is_none")]` to keep JSON payloads lean — see `src-tauri/src/models.rs`

**Match exhaustiveness:**
- Always include a `_ =>` wildcard arm on string dialect matches with a meaningful error
- Pattern: `"mysql" | "oracle"` handled explicitly; `other => Err(format!("{UNSUPPORTED_DIALECT_MESSAGE}: {other}"))`

**Inline test modules:**
- Tests live in `#[cfg(test)] mod tests` at the bottom of the same source file
- Test helper factories (e.g., `fn sample_table() -> TableInfo`) are defined inside the test module
- Test function names use descriptive `snake_case` scenarios — `generates_mysql_ddl_with_auto_increment`
- Phase acceptance tests are annotated with a Japanese comment: `// Phase-1 検収テスト: ...`

## i18n Pattern

**Locale files:**
- `client/src/i18n/locales/ja.json` — Japanese
- `client/src/i18n/locales/zh.json` — Simplified Chinese

**Structure:**
- Two-level namespace hierarchy: `{ "namespace": { "key": "value" } }`
- Top-level namespaces: `app`, `sidebar`, `sheet`, `table`, `ddl`, `settings`, `namefix`, `diff`, `status`, `ddlImport`
- Interpolation syntax: `{{variable}}` — e.g., `"tablesFound": "シート内に {{count}} 個のテーブルが見つかりました"`

**Usage in components:**
```typescript
import { useTranslation } from "react-i18next";
const { t } = useTranslation();
// Simple key: t("table.logicalName")
// Interpolated: t("ddl.generatedSuccess", { count, dialect })
```

**Key integrity:**
- `npm run check:i18n` runs `script/check-i18n-keys.mjs` to verify key parity between locales
- Run this script after adding or removing any i18n key

## Extension API Conventions

**Extension manifest structure** (defined in `shared/extension-schema.ts`):
- `kind`: `"builtin"` or `"external"`
- `capabilities`: string array — e.g., `["db.connect", "db.schema.read"]`
- `contributes`: object with arrays `navigation`, `workspacePanels`, `settingsSections`, `contextActions`

**HostApi pattern** (`client/src/extensions/host-api.ts`):
- `HostApi` interface groups capabilities into sub-namespaces: `notifications`, `connections`, `statusBar`
- Extensions receive a scoped `HostApi` created by `createHostApi(toastFn, grantedCapabilities)` in `client/src/extensions/host-api-runtime.ts`
- Capability enforcement is fail-closed: any method call without the required capability rejects with `"Capability not granted: {cap}"`
- `notifications.show()` requires no capability and always passes

**Contribution resolver pattern** (`client/src/extensions/contribution-resolver.ts`):
- Four resolver functions: `resolveNavigation`, `resolveWorkspacePanels`, `resolveSettingsSections`, `resolveContextActions`
- Disabled extensions (`enabled: false`) are invisible — their contributions never appear in resolver output
- Each resolved contribution item carries `extensionId` for tracing

**useHostApiFor hook:**
- Use `useHostApiFor(extensionId)` inside extension workspace components to get a scoped `HostApi`
- Never call `createHostApi` directly from component code

**Panel registry** (`client/src/extensions/panel-registry.ts`):
- `registerPanel(key, Component)` — called at module initialization for builtin extensions
- `getPanel(key)` — returns `undefined` for unknown keys (safe, never throws)
- Panel keys follow pattern: `"{extensionId}/{panelId}"`

## Physical Name Utilities Pattern

**Canonical source:** `shared/physical-name.ts`

**Client re-export barrel:** `client/src/lib/physical-name-utils.ts` — re-exports only, no logic

**Core validation regex:**
```typescript
PHYSICAL_NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/
```

**Normalization pipeline** applied in order by `normalizePhysicalName`:
1. CamelCase boundary → insert underscore (`UserName` → `user_name`)
2. Strip all non-alphanumeric, non-underscore characters
3. Lowercase
4. Collapse multiple consecutive underscores
5. Trim leading/trailing underscores
6. Prefix `t_` if result starts with a digit

**Fix plan pattern:**
- Call `applyNameFixPlan(tables, options)` to get a `NameFixPlanResult`
- Result includes `fixedTables`, `tableNamesChanged`, `columnNamesChanged`, `conflicts`, `blockingConflicts`, `decisionTrace`
- Strategies are configurable via `NameFixPlanOptions` — defaults are `suffix_increment`, `prefix`, `truncate_hash`
- Non-blocking conflicts are auto-resolved; blocking conflicts require user action when strategy is `"abort"`

---

*Convention analysis: 2026-03-24*
