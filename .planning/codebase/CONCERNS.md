# Codebase Concerns

**Analysis Date:** 2026-03-24

---

## In-Progress Work (Uncommitted)

**Large uncommitted surface area — 34 modified files + 3 untracked:**
- Nearly every core Rust module and most frontend components are modified but not committed.
- Files: `src-tauri/src/commands.rs`, `ddl.rs`, `ddl_import_export.rs`, `excel.rs`, `lib.rs`, `models.rs`, `schema_diff.rs`, `workbook_templates.rs`, `client/src/App.tsx`, `DdlGenerator.tsx`, `SchemaDiffPanel.tsx`, `SheetSelector.tsx`, `Sidebar.tsx`, `TablePreview.tsx`, `UpdateNotifier.tsx`, `client/src/components/ddl-import/DdlImportWorkspace.tsx`, `client/src/components/extensions/DdlToExcelWorkspace.tsx`, `EnumGenWorkspace.tsx`, `shared/config.ts`, `physical-name.ts`, `schema.ts`
- New untracked: `client/src/components/StatusBar.tsx`, `client/src/status-bar/` directory, `docs/db-workbench-extension-design.md`
- Impact: No commit baseline exists for this large feature increment. If something is broken, rollback scope is unclear.
- Fix approach: Stage and commit all working Phase-2 work as a discrete checkpoint before starting new DB-workbench work.

---

## Security Concerns

**Unrestricted file path write via `core_write_binary_file`:**
- Risk: The `core_write_binary_file` command in `src-tauri/src/commands.rs` (line 188) accepts an arbitrary `path: String` from the frontend and writes bytes to it with no path validation. A malicious or buggy call can write files anywhere on the filesystem with the user's privileges.
- Files: `src-tauri/src/commands.rs` (line 188–202), `client/src/lib/desktop-bridge.ts` (line 176)
- Current mitigation: The write path is obtained via Tauri's `dialog.save()` picker, which requires user interaction. However, the command itself has no server-side path scope guard.
- Recommendation: Validate that the resolved path is within an allowed directory (e.g., user's home, app data dir) before writing. Reject paths outside approved roots.

**DB connection credentials stored in plain SQLite:**
- Risk: `DbConnectionConfig` objects (MySQL/PostgreSQL passwords) are persisted via Tauri commands `db_conn_save`/`db_conn_list` in the SQLite database. No encryption at rest is evident.
- Files: `client/src/lib/desktop-bridge.ts` (lines 376–391), `src-tauri/src/db_connector/`
- Impact: If the app data directory is accessed by another process or copied, credentials are exposed.
- Recommendation: Use the OS keychain (via `tauri-plugin-stronghold` or platform keychain APIs) for connection passwords.

**SQL text passed directly to DDL parser without size limit:**
- Risk: `DdlImportWorkspace.tsx` allows users to paste arbitrarily large SQL into a `<Textarea>` and submit it to `ddl_import_preview`. There is no client-side size check before invoking the Tauri command.
- Files: `client/src/components/ddl-import/DdlImportWorkspace.tsx` (lines 197–251), `src-tauri/src/commands.rs` (lines 413–418)
- Impact: A very large SQL paste could cause the Rust parser to consume excessive memory and block the main thread.
- Recommendation: Add a client-side character limit check (e.g., 5MB) before calling the Tauri command.

---

## Technical Debt

**Electron leftover references in production Tauri codebase:**
- Issue: `shared/config.ts` (line 35) and `shared/schema.ts` (line 113) contain `allowOverwriteInElectron: true` — a setting that references Electron, which is not the current runtime. This is dead configuration that adds confusion.
- Files: `shared/config.ts` (lines 35, 78), `shared/schema.ts` (line 113)
- Impact: Low runtime risk, but misleads developers about the runtime environment. The setting name implies Electron is a supported target when the project is Tauri-only.
- Fix approach: Rename to `allowOverwriteOnDesktop` or simply remove the distinction, since Tauri is the only desktop runtime.

**AGENTS.md is a stale copy describing the old Express/PostgreSQL stack:**
- Issue: `AGENTS.md` at the project root duplicates content from before the Tauri rewrite. It still describes `server/lib/excel.ts`, `server/lib/ddl.ts`, Express backend, Drizzle ORM, PostgreSQL, and `shared/routes.ts` — all of which no longer exist in the current Tauri architecture.
- Files: `AGENTS.md`
- Impact: Other agents or developers reading AGENTS.md will have an incorrect picture of the stack (Express server, PostgreSQL, Drizzle ORM vs. Tauri, SQLite, Rust).
- Fix approach: Update AGENTS.md to reflect the Tauri architecture, or mark it as superseded by CLAUDE.md.

**`plan_id` generation is weak in `name_fix_preview`:**
- Issue: In `commands.rs` (lines 472–475), the name-fix plan ID is generated as `plan-{file_id}-{sheet_name.len()}-{timestamp_ms}`. Using `sheet_name.len()` (character count) instead of the name itself means two different sheets with the same character count can collide in a same-millisecond scenario.
- Files: `src-tauri/src/commands.rs` (lines 472–475)
- Impact: Low likelihood, but could cause a name-fix plan to silently overwrite another. A UUID or hash of file_id + sheet_name + timestamp would be safer.

**Round-trip validation writes temp file with no panic-safe cleanup:**
- Issue: `ddl_import_export.rs` (lines 276–331) writes a temp file to `std::env::temp_dir()` using a nanosecond timestamp, then deletes it after validation. If the process panics between write and delete, the temp file is orphaned.
- Files: `src-tauri/src/ddl_import_export.rs` (lines 276–331)
- Impact: Temp file accumulation on repeated panics.
- Fix approach: Use a RAII guard or `scopeguard` crate to ensure cleanup on drop.

---

## Known Incomplete Features / TODOs

**Extension install progress events not implemented (Phase 3):**
- Issue: `src-tauri/src/extensions/commands.rs` (line 118) contains an explicit `TODO: Phase 3` comment indicating that progress notifications via Tauri events during extension installation (`ext_install`) are not yet implemented. The install call currently blocks silently.
- Files: `src-tauri/src/extensions/commands.rs` (lines 117–126)
- Impact: Users installing an extension see no progress indicator. For large extension downloads, the UI appears frozen.
- Fix approach: Emit Tauri window events (e.g., `ext://install-progress`) with download bytes and percentage during the `lifecycle::install` call.

**ALTER SQL output marks unconfirmed renames as `-- TODO(confirm rename)` in generated user-facing SQL:**
- Issue: In `schema_diff.rs` (lines 1776–1779 and 1925–1928), when `include_unconfirmed=true` is passed, the generated ALTER SQL contains `-- TODO(confirm rename): old -> new` as a comment. This developer-internal marker escapes into user-facing exported SQL if the user exports before confirming all rename decisions.
- Files: `src-tauri/src/schema_diff.rs` (lines 1776–1779, 1925–1928)
- Impact: Exported ALTER scripts contain developer-internal TODO markers, which is confusing and unprofessional for end users.
- Fix approach: Replace with a more explicit warning prefix (e.g., `-- UNCONFIRMED RENAME:`) or gate these lines behind a separate flag.

**DB Workbench extension is design-only, no implementation:**
- Issue: `docs/db-workbench-extension-design.md` (untracked) describes a planned "DB Workbench" builtin extension that upgrades the existing `db-connector` extension. No implementation work is committed. The design doc is written in Chinese and targets a future phase.
- Files: `docs/db-workbench-extension-design.md`
- Impact: The feature is currently 0% implemented. The existing `db-connector` extension and the planned workbench are overlapping in purpose, creating potential duplication if both proceed independently.

---

## Internationalization (i18n) Inconsistency

**`DdlImportWorkspace.tsx` contains ~30 hardcoded Chinese strings bypassing i18n:**
- Issue: Approximately 30 user-facing strings in `client/src/components/ddl-import/DdlImportWorkspace.tsx` are hardcoded in Simplified Chinese, not using the `t()` translation function. This includes button labels, section headers, error messages, toast descriptions, and status text.
- Files: `client/src/components/ddl-import/DdlImportWorkspace.tsx` (lines 54–88 `SOURCE_OPTIONS` labels/descriptions, lines 202, 274, 292, 301, 343, 350, 362, 400, 429, 465, 556–557, 610, 646, 656, 674, 679)
- Impact: The DDL Import workspace is not translatable. Japanese and English users see Chinese UI text.
- Fix approach: Extract all strings into `client/src/i18n/locales/zh.json` and `client/src/i18n/locales/ja.json`, then replace with `t()` calls.

**`EnumGenWorkspace.tsx` also has hardcoded Chinese strings:**
- Issue: `client/src/components/extensions/EnumGenWorkspace.tsx` similarly hardcodes Chinese strings in its UI (e.g., "工作表", "目标语言", "下载生成代码", "解析失败", "该工作表中未检测到枚举类").
- Files: `client/src/components/extensions/EnumGenWorkspace.tsx` (lines 133–135, 142–165, 169–195, 224, 233, 247–249, 259, 311)
- Impact: Same as above — non-translatable UI in a feature that is otherwise i18n-ready.

---

## Performance Bottlenecks

**`core_get_process_metrics` calls `System::new_all()` + `refresh_all()` on every invocation:**
- Problem: `commands.rs` (lines 171–185) instantiates a new `sysinfo::System` and calls `refresh_all()` (which scans all system processes) on each call. This command is invoked by the StatusBar memory module on a polling interval.
- Files: `src-tauri/src/commands.rs` (lines 171–185), `client/src/components/StatusBar.tsx`
- Cause: No shared `System` instance is cached in Tauri managed state.
- Impact: `refresh_all()` can take 50–200ms on some systems. Repeated polling creates recurring UI jank.
- Improvement path: Cache a `System` instance in Tauri's managed state and call `refresh_process(pid)` instead of `refresh_all()` on each poll.

**Large Excel files are re-parsed from disk on every command invocation:**
- Problem: Commands `files_get_sheets`, `files_get_table_info`, and `ddl_generate_by_reference` all call `excel::list_table_info` or `excel::list_sheet_summaries` on each invocation, re-reading and re-parsing the Excel file every time.
- Files: `src-tauri/src/commands.rs` (lines 260–285, 326–348)
- Cause: No in-memory parse cache keyed by file hash or file path.
- Impact: For large files (approaching the 50MB limit), repeated operations (e.g., switching dialects in DDL generator, schema diff on same file) cause perceptible latency.
- Improvement path: Implement an LRU cache keyed by file SHA-256 hash (already computed at import) to hold parsed `Vec<TableInfo>` per sheet.

---

## Fragile Areas

**Schema diff `MAX_BASELINE_CANDIDATES = 24` cap with no user visibility:**
- Files: `src-tauri/src/schema_diff.rs` (line 15)
- Why fragile: With more than 24 uploaded files, some valid baseline candidates are silently excluded from the auto-select algorithm. The frontend `SchemaDiffPanel.tsx` does not warn the user that candidates were capped.
- Safe modification: Return the candidate count and cap status in `DiffPreviewResponse` and surface a warning in `SchemaDiffPanel.tsx`.
- Test coverage: No tests for baseline auto-selection behavior.

**`to_sheet_name` deduplication uses O(n²) `Vec::contains` scan:**
- Files: `src-tauri/src/ddl_import_export.rs` (lines 79–106)
- Why fragile: The `used` names list is a `Vec<String>` checked with `used.contains(&candidate)` inside a while loop, making deduplication O(n²) in the number of tables.
- Safe modification: Replace `Vec<String>` with `HashSet<String>` for O(1) lookup.
- Test coverage: `sheet_name_deduplicates_with_suffix` test exists but only covers the 2-item case.

**`StatusBar` cleanup timer and memory polling are decoupled with no shared frequency contract:**
- Files: `client/src/status-bar/context.tsx` (line 28)
- Why fragile: The 1-second cleanup interval in `StatusBarProvider` is independent of any memory polling interval. If memory polling is introduced at a different rate, expired "progress" entries may linger or flicker depending on timing.
- Safe modification: Define a shared `STATUS_BAR_TICK_MS` constant and use it in both the cleanup timer and any polling consumers.

---

## Missing Critical Features

**No file size validation client-side before base64 encoding for upload:**
- Problem: `client/src/lib/desktop-bridge.ts` (lines 189–198) reads the entire Excel file into a `Uint8Array` and converts it to base64 before sending to Tauri via IPC. For a 50MB file this temporarily allocates ~67MB of base64 string in the WebView heap.
- Files: `client/src/lib/desktop-bridge.ts` (lines 189–198)
- Blocks: Memory-constrained systems may crash the WebView for near-limit file sizes.
- Fix approach: Validate `file.size` client-side before reading. Consider using Tauri's native file path passing (invoke with path only) instead of full base64 transfer.

**`fileCleanupWarning` returned by `files_remove` is silently discarded by the frontend:**
- Problem: `commands.rs` (lines 247–257) returns a `file_cleanup_warning` field in `DeleteFileResponse` when disk cleanup fails after a database record deletion. The frontend does not display this warning to the user.
- Files: `src-tauri/src/commands.rs` (lines 247–257), consuming component in `client/src/components/Sidebar.tsx`
- Blocks: Silent disk accumulation when file removal partially fails.
- Fix approach: Surface `fileCleanupWarning` as a status bar warning or toast when non-null.

---

## Build / Deployment Concerns

**Update check URLs are hardcoded to a specific public GitHub repo:**
- Issue: `src-tauri/src/commands.rs` (lines 28–29) hardcodes `RELEASES_LATEST_URL` and `RELEASES_PAGE_URL` pointing to `github.com/SevenThRe/Db-Schema-Ddl`. Enterprise deployments or forks would need source changes to redirect update checks.
- Files: `src-tauri/src/commands.rs` (lines 28–29)
- Fix approach: Move the release base URL to `tauri.conf.json` plugin configuration so it can be overridden without source changes.

**Minimum Rust version pinned at 1.77.2 with no CI enforcement:**
- Issue: `src-tauri/Cargo.toml` (line 9) specifies `rust-version = "1.77.2"` but no CI pipeline validates builds against this version floor.
- Files: `src-tauri/Cargo.toml` (line 9)
- Impact: A developer on a newer Rust version may introduce syntax or API usage that silently fails on 1.77.2.

**No cross-platform CI matrix:**
- Issue: No CI configuration is present in the repository (no `.github/workflows/`, no `Makefile`). The Tauri app targets Windows, macOS, and Linux, but build correctness across all three platforms is unverified.
- Impact: Platform-specific bugs in file path handling (e.g., `buildDefaultSavePath` in `client/src/lib/desktop-bridge.ts` uses `\\` vs `/` heuristics at line 114), Excel parsing, or SQLite bundling may go undetected until a user reports them.
- Fix approach: Add a GitHub Actions matrix workflow building and running Rust unit tests on `ubuntu-latest`, `macos-latest`, and `windows-latest`.

---

## Test Coverage Gaps

**No frontend component tests:**
- What's not tested: All React components in `client/src/components/` have no test files anywhere in the repository.
- Files: `client/src/components/DdlGenerator.tsx`, `SchemaDiffPanel.tsx`, `SheetSelector.tsx`, `StatusBar.tsx`, `ddl-import/DdlImportWorkspace.tsx`, `extensions/EnumGenWorkspace.tsx`, etc.
- Risk: UI regressions in DDL generation, schema diff, and import workflows go undetected.
- Priority: High

**No integration tests for the Tauri command layer:**
- What's not tested: Tauri commands in `src-tauri/src/commands.rs` are not covered by integration tests exercising the full command→storage→response path.
- Files: `src-tauri/src/commands.rs`
- Risk: Breaking changes to command signatures or storage logic are not caught until manual testing.
- Priority: High

**`schema_diff.rs` has no unit tests despite 1900+ lines of algorithmic complexity:**
- What's not tested: Similarity scoring, baseline auto-selection, rename suggestion, and ALTER SQL generation in `src-tauri/src/schema_diff.rs` have zero test coverage.
- Files: `src-tauri/src/schema_diff.rs`
- Risk: Threshold tuning changes (e.g., `table_match_strong = 0.80`, `column_rename_candidate = 0.65`) may silently degrade diff accuracy with no test signal.
- Priority: High

**`name_fix` modules lack conflict scenario tests:**
- What's not tested: Physical name fix conflict resolution strategies (`suffix_increment`, `prefix`, `truncate_hash`) and identifier length truncation edge cases are not covered by automated tests.
- Files: `src-tauri/src/name_fix.rs`, `src-tauri/src/name_fix_apply.rs`
- Risk: Edge cases with identifiers already at max 64 chars may generate invalid SQL identifiers silently.
- Priority: Medium

---

*Concerns audit: 2026-03-24*
