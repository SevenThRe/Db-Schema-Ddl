# Testing Patterns

**Analysis Date:** 2026-03-24

## Test Framework

**Runner:**
- Node.js built-in test runner (`node:test`) — no external test framework (no Jest, Vitest, Mocha)
- Config: no separate config file; tests are invoked directly via `node --test`
- TypeScript stripping: `--experimental-strip-types` flag used to run `.ts` / `.tsx` files directly

**Assertion Library:**
- `node:assert/strict` — all assertions use the strict module

**Run Commands:**
```bash
# Run all behavior tests (server + shared logic)
node --test --experimental-strip-types test/behavior.test.ts

# Run whitebox / internal tests
node --test --experimental-strip-types test/whitebox.test.ts

# Run slow tests (property-based, stress)
node --test --experimental-strip-types test/slow.test.ts

# Run extension boundary tests directly
node --test --experimental-strip-types test/client/extension-boundaries.test.ts

# Run Rust tests
cd src-tauri && cargo test
```

**No npm test script exists** — there is no `"test"` entry in `package.json` scripts.

## Test File Organization

**Location:**
- Tests are separate from source — all live in `test/` directory tree
- Source layout is mirrored: `test/server/`, `test/client/`, `test/shared/`, `test/electron/`

**Top-level aggregator files:**
- `test/behavior.test.ts` — imports server + shared behavior tests
- `test/whitebox.test.ts` — imports server internals + electron + some client UI tests
- `test/slow.test.ts` — imports property-based / stress tests (e.g., `test/shared/physical-name.slow.test.ts`)

**Naming:**
- Feature tests: `{feature}.test.ts` — `ddl-regression.test.ts`, `physical-name.test.ts`
- Phase acceptance: `{area}-phase{N}.test.ts` — `ddl-import-phase3.test.ts`, `db-diff-phase4.test.ts`
- UI structure tests: `{feature}-ui.test.tsx` — `table-preview-ui.test.tsx`, `extension-management-ui.test.tsx`

## Test Structure

**Standard node:test structure (server/shared tests):**
```typescript
import test from "node:test";
import assert from "node:assert/strict";

test("descriptive scenario name in present tense", () => {
  const result = functionUnderTest(input);
  assert.equal(result.field, expectedValue);
});
```

**Grouped structure (extension-boundaries.test.ts):**
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("component: scenario group description", () => {
  it("specific behavior stated in Japanese", () => {
    assert.equal(actual, expected);
  });
});
```

**UI structure tests (client/*.test.tsx):**
```typescript
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("feature is wired correctly in the component", async () => {
  const source = await read("client/src/components/SomeComponent.tsx");
  assert.match(source, /expectedPatternOrString/);
});
```

## Mocking

**Framework:** None — no mock library (no `sinon`, `jest.fn()`, `vi.mock()`)

**Patterns:**
- Extension tests use hand-crafted factory functions: `makeExt(id, enabled, contributes, capabilities)` in `test/client/extension-boundaries.test.ts`
- Host API runtime tests use inline callback injection: `createHostApi(toastFn, grantedCapabilities)` where `toastFn` is a local array-pushing closure
- UI structure tests do not mock the DOM — they read source files as strings and assert on code patterns using `assert.match(source, /regex/)`

**What to mock:**
- External API calls: inject through function parameters or constructor arguments
- Toast/notification callbacks: pass inline closures

**What NOT to mock:**
- Pure utility functions (`normalizePhysicalName`, `applyNameFixPlan`) — test directly
- Zod schema validation — test directly
- Rust DDL generation — use `cargo test` with inline `#[cfg(test)]` modules

## Fixtures and Factories

**Rust test factories** (in `src-tauri/src/ddl.rs` `#[cfg(test)] mod tests`):
```rust
fn sample_table() -> TableInfo {
  TableInfo {
    logical_table_name: "社員".into(),
    physical_table_name: "employee".into(),
    columns: vec![ /* minimal valid columns */ ],
    // ... all optional fields set to None
  }
}
```

**TypeScript test fixtures:**
- Inline object literals — no shared fixture files detected for server/shared tests
- `test/server/db-phase5-fixtures.ts` exists as a shared fixture module for DB phase tests

**Excel test files:**
- `attached_assets/` directory contains real `.xlsx` files used by server-side integration tests
- Not committed as test fixtures — used via filesystem reads in integration tests

## Rust Test Coverage

**Location:** `#[cfg(test)] mod tests` block at the bottom of each Rust source file

**Files with inline tests:**
- `src-tauri/src/ddl.rs` — 10 tests covering MySQL DDL generation, Oracle DDL generation, ZIP export, table selection by reference, and override behavior
- Test names use descriptive `snake_case`: `generates_mysql_ddl_with_auto_increment`, `exports_zip_payload_for_oracle`
- Phase acceptance tests are prefixed with a comment: `// Phase-1 検収テスト: ...`

**No dedicated `_test.rs` files found** — all Rust tests are inline within their source modules.

## Test Types

**Unit Tests (TypeScript):**
- `test/shared/physical-name.test.ts` — tests `normalizePhysicalName`, `validateTablePhysicalNames`, `applyNameFixPlan` in isolation
- `test/server/ddl-regression.test.ts` — tests `generateDDL` output stability
- Pure function tests with no I/O or mocking

**Integration Tests (TypeScript server):**
- `test/server/excel-executor.test.ts`, `test/server/excel-edge-cases.test.ts` — test Excel parser against real files
- `test/server/ddl-import-phase3.test.ts`, `test/server/db-diff-phase4.test.ts` — test multi-phase feature pipelines
- `test/server/db-connection-service.test.ts` — tests DB connection handling

**UI Structure Tests (TypeScript client):**
- Located in `test/client/` — do NOT use a DOM renderer (no jsdom, no React Testing Library)
- Assert on source code text: verify component wires up specific hooks, renders specific strings, and imports specific sub-components
- Used to enforce structural contracts between phases (e.g., "DDL Import workspace ships a three-column layout")
- Examples: `test/client/table-preview-ui.test.tsx`, `test/client/extension-management-ui.test.tsx`, `test/client/ddl-import-phase3-ui.test.tsx`

**Logic Tests (TypeScript client):**
- `test/client/extension-boundaries.test.ts` — directly imports and tests `contribution-resolver.ts` and `panel-registry.ts` using relative paths (no `@/` alias)
- Uses `describe`/`it` grouping with Japanese test names

**Slow / Property Tests:**
- `test/shared/physical-name.slow.test.ts` — property-based or stress tests for name normalization

**Rust Unit Tests:**
- Inline `#[cfg(test)]` modules in `src-tauri/src/ddl.rs`
- Run with `cargo test` from `src-tauri/`

## Coverage

**Requirements:** None enforced — no coverage threshold configuration found

**View coverage:**
```bash
# TypeScript — not configured, no coverage tooling detected
# Rust
cd src-tauri && cargo test  # no --coverage flag configured
```

## Common Patterns

**Async test pattern (server integration):**
```typescript
test("scenario description", async () => {
  const source = await read("client/src/components/Foo.tsx");
  assert.match(source, /ExpectedPattern/);
});
```

**Error assertion pattern:**
```typescript
// Node assert — check error type
const result = select_tables_by_reference(&tables, &[], &[]);
assert!(result.is_err(), "empty index list must return an error");

// TypeScript
const result = functionThatShouldThrow();
assert.throws(() => result, /expected message/);
```

**Source-file assertion pattern (UI structure tests):**
```typescript
// Verify component contains specific i18n keys or hook calls
assert.match(source, /usePreviewDdlImport/);
assert.match(source, /版本/);  // Chinese i18n key
assert.match(source, /<ExtensionInstallDialog/);
```

## Known Gaps

**No test runner script in package.json:**
- `npm test` does not work — tests must be invoked manually with `node --test`
- No CI configuration file detected that would run tests automatically

**No React component rendering tests:**
- UI tests assert on source code text only — no actual React rendering, no user interaction simulation, no accessibility checks

**No end-to-end tests:**
- No Playwright, Cypress, or Tauri driver tests found

**No TypeScript coverage tooling:**
- No `c8`, `nyc`, or equivalent configured for TypeScript test runs

**Electron/Tauri layer partially covered:**
- `test/electron/db-credential-vault.test.ts` and `test/electron/extensions-delivery.test.ts` exist but coverage of Tauri commands (`src-tauri/src/commands.rs`) is limited to Rust inline tests

---

*Testing analysis: 2026-03-24*
