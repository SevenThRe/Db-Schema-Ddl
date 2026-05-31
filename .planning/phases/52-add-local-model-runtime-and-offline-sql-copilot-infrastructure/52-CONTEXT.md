# Phase 52: Add Local Model Runtime And Offline SQL Copilot Infrastructure - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning and execution

<domain>
## Phase Boundary

Phase 52 is the runtime-foundation step for local AI assistance inside DB Workbench. The target is not “generated SQL” yet. The target is a truthful, operator-visible local model substrate that can be configured, discovered, warmed, and probed without pretending model output is deterministic engine behavior.

This phase delivers:
- shared settings and host contracts for a local SQL-copilot runtime
- desktop runtime discovery and probe execution for supported local providers
- grounded prompt packaging that reuses schema snapshot, SQL semantic context, and safe SQL memory summaries
- a reachable workbench UI for provider configuration, availability inspection, prompt preview, warmup, and grounded probe output

Out of scope in this phase:
- natural-language-to-SQL generation
- inline generated completion acceptance flows
- execution of model-authored SQL
- remote hosted providers or opaque cloud routing

</domain>

<decisions>
## Implementation Decisions

### Local-Only Provider Scope
- Support should start with `Ollama` and `llama.cpp CLI`, because both can run fully on-device and cover the immediate “offline/local-only” requirement.
- Provider discovery, warmup state, latency, and recent failure state should live in the Tauri runtime so the workbench can query them like any other desktop capability.

### Grounded Prompt Packaging
- Prompt construction should live in a dedicated client module instead of being embedded directly in the dialog or editor.
- The prompt must be grounded by:
  - current connection and driver
  - active schema and selected relation
  - schema snapshot with columns and foreign-key shape
  - Phase 49 semantic context for current statement or clause context
  - Phase 51 SQL memory patterns and safe value-shape summaries
- Raw result rows and unsafe literal values must not be fed into the local model prompt.

### Operator Visibility
- Runtime state must stay explicit: provider, availability, warmup, model id, last latency, last error, and privacy mode should all be visible in the workbench.
- Probe output must be labeled as advisory model output, never as executed SQL or planner evidence.

### Phase Discipline
- Generated SQL authoring remains Phase 53 work. Phase 52 may preview a prompt package and run a grounded probe, but it should not claim NL-to-SQL or generative completion is shipped.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning anchors
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `AGENTS.md`

### Shared contracts and desktop bridge
- `shared/config.ts`
- `shared/schema.ts`
- `client/src/extensions/host-api.ts`
- `client/src/extensions/host-api-runtime.ts`
- `client/src/extensions/runtime/host-dispatch.ts`
- `client/src/lib/desktop-bridge.ts`

### Workbench grounding and UI surfaces
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `client/src/components/extensions/db-workbench/sql-semantic-context.ts`
- `client/src/components/extensions/db-workbench/sql-memory.ts`
- `client/src/components/extensions/db-workbench/workbench-session.ts`

### Desktop runtime
- `src-tauri/src/db_connector/mod.rs`
- `src-tauri/src/db_connector/commands.rs`
- `src-tauri/src/db_connector/sql_copilot.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/models.rs`

### Regression anchors
- `test/client/db-workbench-sql-semantic-context-phase49.test.ts`
- `test/client/db-workbench-sql-semantics-phase50.test.ts`
- `test/client/db-workbench-sql-memory-phase51.test.ts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sql-semantic-context.ts`
  - already exports shared clause and statement analysis that can be reused for prompt grounding
- `sql-memory.ts`
  - already stores safe value-shape hints instead of raw values, making it appropriate grounding input
- `WorkbenchLayout.tsx`
  - already owns session-aware SQL toolbar surfaces and is the right place to expose a copilot runtime dialog
- `desktop-bridge.ts` + host runtime wiring
  - already provide a typed path for new desktop DB commands without inventing a second transport

### Known Gaps Before This Phase
- no local-model runtime contract existed in shared settings or host APIs
- no Tauri command surface existed for “discover current provider state” or “run a grounded local probe”
- no workbench UI existed for provider configuration, prompt preview, or runtime state inspection
- SQL memory and semantic context existed independently, but nothing packaged them into one grounded prompt

### Integration Points
- shared settings and runtime types:
  - `shared/config.ts`
  - `shared/schema.ts`
  - `src-tauri/src/models.rs`
  - `src-tauri/src/db_connector/mod.rs`
- desktop command flow:
  - `client/src/lib/desktop-bridge.ts`
  - `client/src/extensions/host-api.ts`
  - `client/src/extensions/host-api-runtime.ts`
  - `client/src/extensions/runtime/db-connector-extension-app.tsx`
  - `client/src/extensions/runtime/host-dispatch.ts`
  - `src-tauri/src/db_connector/commands.rs`
  - `src-tauri/src/lib.rs`
- workbench operator surface:
  - `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
  - `client/src/components/extensions/db-workbench/SqlCopilotDialog.tsx`
  - `client/src/components/extensions/db-workbench/sql-copilot-grounding.ts`

</code_context>

<specifics>
## Specific Ideas

- Add a `SqlCopilotRuntimeRegistry` in Tauri to preserve last warmup, latency, and failure state per provider/model.
- Discover `Ollama` by probing `/api/tags`; discover `llama.cpp CLI` by configured path or PATH lookup plus `--version`.
- Build a prompt package that combines:
  - connection context
  - driver rules
  - schema grounding
  - safe query memory
  - safe value-shape grounding
  - current SQL draft
  - optional operator request
- Expose all of that from a dense workbench dialog with save, warmup, and grounded probe actions.

</specifics>

<deferred>
## Deferred Ideas

- NL-to-SQL generation and inline generated completion belong to Phase 53
- packaged local-model downloads or bundle management can wait until generated assistance proves valuable
- provider-specific deep prompt tuning and evaluation harnesses can expand after the first generated SQL milestone lands

</deferred>

---

*Phase: 52-add-local-model-runtime-and-offline-sql-copilot-infrastructure*
*Context gathered: 2026-04-18*
