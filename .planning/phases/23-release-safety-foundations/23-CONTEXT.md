# Phase 23: Release Safety Foundations - Context

**Gathered:** 2026-04-11
**Mode:** Smart Discuss (autonomous defaults, non-interactive)
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the remaining release-blocking trust gaps in saved connection handling and runtime safety:
- saved DB credentials must stop living in plaintext application storage
- existing installs must migrate safely without silently losing access or continuing to expose plaintext secrets
- read-only, destructive-action, cancel, and export semantics must be enforced in Rust runtime paths instead of relying on frontend intent alone
- operator-facing labels such as current page, loaded rows, stop on error, and cancel must match the behavior that actually runs

Out of scope in this phase:
- canonical legacy-vs-primary workbench surface cleanup (Phase 24)
- deeper explorer object coverage and definition surfaces (Phase 25)
- live packaged release evidence and ship gate reporting (Phase 26)

</domain>

<decisions>
## Implementation Decisions

### Credential Storage Boundary
- Saved connection secrets move to OS-backed secure storage keyed by connection id; SQLite keeps only non-secret connection metadata.
- Legacy plaintext `db_connections.config_json.password` values auto-migrate during normal connection reads/saves so upgrades do not require manual export/import.
- Returned saved-connection payloads never include the stored password; the UI tracks secure-secret presence through explicit metadata instead of redisplaying secrets.

### Secret Editing Semantics
- Editing an existing saved connection with an untouched blank password field preserves the stored secret.
- Clearing the password intentionally must be explicit in the save payload so blank-password databases remain representable without ambiguity.
- Connection save/delete must invalidate any cached runtime pool for that connection so credential, readonly, and schema changes take effect immediately.

### Runtime Safety Contract
- Rust remains the source of truth for readonly and destructive-action enforcement across execute, full-result export, grid edit, and data sync paths.
- Export re-execution only runs for pageable read queries; inline current-page and loaded-rows export must serialize the exact rows already visible or loaded in the UI.
- Query/export cancellation uses one shared runtime token lookup path so the visible cancel control always targets the active operation.

### Operator Messaging
- The workbench exposes three distinct export scopes: current page, loaded rows, and full result, and each maps 1:1 to runtime payload fields.
- Stop-on-error remains a frontend switch, but it must stay wired directly to the runtime `continueOnError` flag with no hidden local shadow state.
- Saved-connection editing must explain when a password is already stored securely and what leaving the field blank will do.

### the agent's Discretion
- Storage-side helper refactors are allowed if they isolate migration and secret-store logic without changing the public workbench route structure.
- Additional targeted regression tests are encouraged when they lock runtime truthfulness without requiring live DB fixtures.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-tauri/src/storage.rs`
  - already owns the `db_connections` SQLite table and is the natural place to migrate legacy plaintext rows.
- `src-tauri/src/db_connector/query.rs`
  - already enforces readonly and dangerous SQL gates for normal execution and now contains the shared export cancellation/paging helpers from recent worktree changes.
- `src-tauri/src/db_connector/grid_edit.rs`
  - already blocks readonly edit commits and uses a prepare/commit plan hash workflow that can remain the edit-side safety primitive.
- `src-tauri/src/db_connector/data_apply.rs`
  - already blocks readonly sync targets and carries blocker reporting for apply preview/execute.
- `client/src/components/extensions/DbConnectorWorkspace.tsx`
  - owns the saved-connection form and is the correct place to express secure-password preservation or explicit clearing behavior.
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
  - already routes stop-on-error, cancel, export scopes, and sync confirmation behavior through one workbench shell.

### Current Runtime Gap
- `src-tauri/src/storage.rs` still serializes the full `DbConnectionConfig`, including `password`, straight into SQLite `config_json`.
- `src-tauri/src/db_connector/commands.rs` currently returns saved connections as stored records and does not yet separate public connection metadata from secret hydration.
- `src-tauri/src/db_connector/query.rs` caches pools by connection id only, so saved-connection changes can reuse stale pools unless invalidated.
- `client/src/components/extensions/DbConnectorWorkspace.tsx` currently treats the password field as a plain round-tripped value, which conflicts with secure storage and migration goals.

### Integration Points
- Shared contract:
  - `shared/schema.ts`
- Desktop bridge and host API:
  - `client/src/lib/desktop-bridge.ts`
  - `client/src/extensions/host-api.ts`
  - `client/src/extensions/host-api-runtime.ts`
- Connection CRUD and runtime entrypoints:
  - `src-tauri/src/db_connector/mod.rs`
  - `src-tauri/src/db_connector/commands.rs`
  - `src-tauri/src/db_connector/query.rs`
  - `src-tauri/src/db_connector/introspect.rs`
  - `src-tauri/src/storage.rs`
- Relevant UI/runtime regression surfaces:
  - `client/src/components/extensions/db-workbench/ResultExportMenu.tsx`
  - `client/src/components/extensions/db-workbench/ResultGridPane.tsx`
  - `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
  - `test/client/db-connection-config.test.ts`

</code_context>

<specifics>
## Specific Ideas

- Model saved-connection responses with `hasStoredPassword` metadata so editing can preserve secure secrets without repopulating the password input.
- Add an explicit "clear stored password" path rather than guessing whether a blank password means preserve or erase.
- Keep migration local-first and automatic: a legacy plaintext password should move into secure storage the first time the connection record is read successfully, and the persisted JSON should be rewritten without the password.
- Add regression coverage for:
  - redacted saved-connection payloads
  - migration helper behavior
  - export scope semantics (`current_page` vs `loaded_rows` vs `full_result`)
  - stale-pool invalidation after connection save/delete

</specifics>

<deferred>
## Deferred Ideas

- Editing connection environment/read-only/color-tag metadata from the canonical workbench shell belongs with the broader flow cleanup in Phase 24.
- Broader secret rotation UX, connection profiles, or team/shared credential features are outside this release-safety pass.

</deferred>

---

*Phase: 23-release-safety-foundations*
*Context gathered: 2026-04-11*
