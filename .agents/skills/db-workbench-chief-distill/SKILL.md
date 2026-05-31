---
name: db-workbench-chief-distill
description: Distill operator-grade product, architecture, and release discipline from elite software teams, then apply that lens to this repository's desktop-first DB workbench. Use when auditing the current DB workbench, identifying defects or incomplete seams, setting a repair roadmap, or landing fixes without confusing docs with shipped runtime behavior.
---

# DB Workbench Chief Distill

Work from runtime truth, not aspiration.

## Core stance

- Treat the live code path as the contract.
- Prefer operator safety over feature count.
- Prefer one reachable daily-driver workflow over multiple half-finished surfaces.
- Preserve explicit source/target/context labels for every destructive or cross-system action.
- When docs and runtime disagree, trust runtime and record the mismatch as a defect.

## Distilled principles

Apply these principles as if reviewing a serious desktop database tool:

1. `Reachability before rhetoric`
   Confirm the feature is reachable from the current UI shell, not merely typed or scaffolded.

2. `Contracts stay synchronized`
   For DB workbench changes, verify `shared/schema.ts`, host API, desktop bridge, Rust request/response types, and invoke registration stay aligned.

3. `Operator intent must stay explicit`
   Source vs target, readonly vs writable, prod vs non-prod, and current schema context must always be visible and enforced.

4. `Safe-by-default beats clever-by-default`
   Block or warn on ambiguous or risky paths before execution. Do not rely on user memory.

5. `One surface should complete the job`
   A mature workbench minimizes context switching across disconnected legacy panes.

6. `Verification is part of the feature`
   A DB workflow is not "done" unless there is code-level wiring and regression coverage for the critical path.

## Review workflow

Follow this order:

1. Read these runtime entry points first:
   - `client/src/components/extensions/DbConnectorWorkspace.tsx`
   - `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
   - `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx`
   - `client/src/extensions/host-api.ts`
   - `client/src/lib/desktop-bridge.ts`
   - `shared/schema.ts`
   - `src-tauri/src/db_connector/commands.rs`
   - `src-tauri/src/lib.rs`

2. Score the current state across six axes:
   - surface reachability
   - operator safety
   - workflow completeness
   - contract cohesion
   - release readiness
   - legacy migration clarity

3. Write findings as:
   - defect
   - risk
   - intentional constraint
   Do not collapse those categories.

4. For each real defect, trace:
   - UI entry
   - host API call
   - desktop bridge invoke
   - Rust command
   - persisted or runtime side effects

5. Produce a repair plan in this shape:
   - `Now`: highest-risk safety or clarity fixes
   - `Next`: workflow completion work that unlocks daily use
   - `Later`: consolidation, polish, and migration cleanup

## Repository-specific rules

- Respect `AGENTS.md` source-of-truth order.
- Do not claim Data Sync, inspection, edit, or Copilot support unless the path is visibly wired.
- Preserve the coexistence of legacy and workbench paths unless the migration is intentionally completed.
- Prefer narrow, test-backed fixes over broad rewrites.

## Reference files

Read these when needed:

- `references/principles.md`
  Use for the detailed review rubric and what "operator-grade" means in this repo.

- `references/current-assessment.md`
  Use for the current assessment snapshot, known defects, and recommended repair sequence.

## Output format

When using this skill, produce:

1. `Current reality`
   State what is actually shipped and reachable.

2. `Defects and gaps`
   List the highest-signal issues with file references.

3. `Repair plan`
   Split into `Now`, `Next`, and `Later`.

4. `Immediate implementation`
   If a safe high-value fix fits the current turn, land it and verify it.
