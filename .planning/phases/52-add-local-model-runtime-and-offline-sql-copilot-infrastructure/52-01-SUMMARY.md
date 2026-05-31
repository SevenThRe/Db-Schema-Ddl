---
phase: 52-add-local-model-runtime-and-offline-sql-copilot-infrastructure
plan: 01
subsystem: sql-copilot-runtime
tags: [db-workbench, local-ai, ollama, llama-cpp, prompt-grounding]
completed: 2026-04-18T23:55:00+08:00
---

# Phase 52 Plan 01 Summary

Phase 52 added the missing runtime foundation for local SQL assistance and made it reachable from the main workbench UI.

## Accomplishments

- Extended [shared/config.ts](/E:/work/Db-Schema-Ddl/shared/config.ts), [shared/schema.ts](/E:/work/Db-Schema-Ddl/shared/schema.ts), [src-tauri/src/models.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/models.rs), and [src-tauri/src/db_connector/mod.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/db_connector/mod.rs) with SQL-copilot settings, runtime-state contracts, grounded prompt-package types, and probe response shapes.
- Wired local runtime status and probe operations through [host-api.ts](/E:/work/Db-Schema-Ddl/client/src/extensions/host-api.ts), [host-api-runtime.ts](/E:/work/Db-Schema-Ddl/client/src/extensions/host-api-runtime.ts), [host-context.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/host-context.tsx), [db-connector-extension-app.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/runtime/db-connector-extension-app.tsx), [host-dispatch.ts](/E:/work/Db-Schema-Ddl/client/src/extensions/runtime/host-dispatch.ts), and [desktop-bridge.ts](/E:/work/Db-Schema-Ddl/client/src/lib/desktop-bridge.ts).
- Added [sql_copilot.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/db_connector/sql_copilot.rs) and completed [commands.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/db_connector/commands.rs) plus [lib.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/lib.rs) so Tauri now discovers `Ollama` and `llama.cpp CLI`, tracks warmup or failure telemetry, and runs grounded local probes through registered commands.
- Added [sql-copilot-grounding.ts](/E:/work/Db-Schema-Ddl/client/src/components/extensions/db-workbench/sql-copilot-grounding.ts) so prompt orchestration now reuses Phase 49 semantic context, current schema snapshot, selected relation focus, driver rules, and Phase 51 safe SQL memory instead of ungrounded freeform prompts.
- Added [SqlCopilotDialog.tsx](/E:/work/Db-Schema-Ddl/client/src/components/extensions/db-workbench/SqlCopilotDialog.tsx) and updated [WorkbenchLayout.tsx](/E:/work/Db-Schema-Ddl/client/src/components/extensions/db-workbench/WorkbenchLayout.tsx) so operators can configure local runtimes, inspect privacy posture and availability, preview grounded prompts, warm the runtime, and run advisory probes from the main workbench toolbar.
- Updated [Settings.tsx](/E:/work/Db-Schema-Ddl/client/src/pages/Settings.tsx) to initialize from the new shared settings default shape so the repo remains type-correct after the SQL-copilot settings expansion.
- Added [db-workbench-sql-copilot-grounding-phase52.test.ts](/E:/work/Db-Schema-Ddl/test/client/db-workbench-sql-copilot-grounding-phase52.test.ts) to cover grounded prompt packaging, provider selection, limit handling, and safe removal of raw-value-like hints.

## Verification

- `node --import=tsx --test test/client/db-workbench-sql-copilot-grounding-phase52.test.ts test/client/db-workbench-sql-memory-phase51.test.ts test/client/db-workbench-sql-semantic-context-phase49.test.ts test/client/db-workbench-sql-semantics-phase50.test.ts`
- `npm run check`
- `cargo check --manifest-path src-tauri/Cargo.toml -j 1`
- `cargo test --manifest-path src-tauri/Cargo.toml sql_copilot -- --nocapture`

## Self-Check

PASS
