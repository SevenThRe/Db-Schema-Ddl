---
phase: 02-packaged-build-smoke-v1_3
milestone: v1.3
updated: 2026-03-18
status: discussed
---

# Phase 2 Context

## Phase

**Phase 2: Packaged Build Smoke**

Goal: Extend desktop confidence from development Electron runs to packaged Windows deliverables so the real shipped app can start, initialize, surface extension state, enter `DB 管理`, and close cleanly with reviewable evidence.

Requirements in scope:
- STAB-05
- STAB-06

## Fixed Boundary

This phase clarifies **how** packaged Windows builds should be smoke-tested and gated.

It does **not** add:
- new schema compare/export/import features
- broader DB-management capabilities
- full packaged-build E2E automation infrastructure
- cross-platform packaging work beyond the current Windows-first delivery path

Those can follow after packaged confidence is restored.

## Reused Product Context

Existing reusable assets already in the codebase:

- Electron runtime hardening and checkpoint logging from Phase 1:
  - `electron/main.ts`
  - `shared/desktop-runtime.ts`
  - `script/desktop-preflight.ts`
- Existing Windows packaging configuration:
  - `package.json` (`electron-builder`, `win`, `nsis`, `dist-electron`)
- Structured smoke artifact seam:
  - `script/desktop-smoke.ts`
  - `docs/desktop-smoke.md`
  - `shared/schema.ts`
- Existing app flows that packaged smoke must reach:
  - extension entry / catalog flow
  - SQLite initialization and migrations
  - `DB 管理` module entry

Important current limitation:
- Phase 1 proved development-Electron confidence, but packaged Windows deliverables still lack a first-class smoke workflow and explicit release-blocker policy.

## Locked Decisions

### 1. Cover both `win-unpacked` and NSIS installer, with clear priority

- Phase 2 should cover both:
  - `win-unpacked`
  - `nsis installer`
- The primary repeated smoke path should use `win-unpacked` because it is faster to iterate.
- The installer path must still be covered at least through install -> first launch -> close, because it is the real delivery surface.

Rationale:
- `win-unpacked` is the fastest way to debug packaging/runtime issues
- the installer cannot be ignored because it is what users actually receive

### 2. Packaged smoke should cover real app entry paths, not just startup

- Packaged smoke must include at least:
  - app startup to interactive main window
  - SQLite initialization / migrations
  - extension entry and catalog behavior
  - entering `DB 管理`
  - clean app shutdown
- Real MySQL access is useful but not a hard blocker for every packaged smoke run unless a packaging-specific DB regression appears.

Rationale:
- packaged confidence should prove the app is actually usable, not merely that a window opens
- requiring a live DB on every packaged smoke run would make the workflow too heavy

### 3. Evidence should remain structured and reviewable

- Packaged smoke evidence should keep the existing dual-output model:
  - `Markdown` for humans
  - task-friendly `JSON` for MCP/automation
- Phase 2 should also add:
  - screenshots
  - key packaged-log excerpts
- The packaged smoke artifact should still derive from one stable underlying artifact model, not split into unrelated UI notes and machine data.

Rationale:
- packaged issues are often easiest to understand via screenshots and logs
- the project is AI/MCP-aware, so report artifacts should remain machine-consumable

### 4. Release blockers must be explicit

- The following should be treated as packaged-build release blockers:
  - app startup failure
  - main window never reaching interactive state
  - `better-sqlite3` or other native module load failure
  - SQLite migration/init failure
  - raw JS error spam on close
  - extension catalog failure showing raw transport/IPC text to the user
  - `DB 管理` main entry not opening
- The following may remain warnings if the primary packaged path is healthy:
  - no real MySQL check in a given smoke run
  - non-fatal visual rough edges
  - non-blocking warnings in logs

Rationale:
- packaged smoke needs a clear pass/fail policy or it becomes a vague checklist instead of a release gate

### 5. This phase is about a packaged smoke seam, not full automation infrastructure

- Phase 2 should prioritize a stable packaged-build smoke workflow and evidence model.
- If some automation scaffolding naturally falls out of that work, it is welcome.
- But the phase should not turn into a general-purpose Electron E2E lab or CI-platform expansion project.

Rationale:
- the highest value is proving shipped builds are stable
- building broad automation infrastructure too early would delay the actual confidence win

### 6. Preserve AI/MCP-friendly packaged evidence

- Packaged smoke outputs should continue using stable IDs and machine-usable fields.
- The artifact should be rich enough for future MCP flows to:
  - summarize failures
  - point to screenshots/log excerpts
  - classify blocker vs warning
  - reason about `win-unpacked` vs installer runs

Rationale:
- operational evidence is more valuable if it remains reusable by both people and automation

## Proposed Phase Shape

The accepted direction for this phase is:

- packaged smoke seam first
- evidence upgrade second
- release-blocker policy third
- lightweight packaged-run helpers fourth

This means the phase should likely produce:

- a packaged-smoke-specific workflow or helper seam for `win-unpacked` and installer runs
- artifact support for screenshots and key log excerpts
- explicit blocker/warning classification for packaged smoke results
- documentation that makes packaged release review repeatable

## Open Implementation Guidance For Research/Planning

Downstream research and planning should investigate:

- the cleanest way to launch and observe `win-unpacked` builds from scripts on Windows
- how to capture screenshots and package/runtime logs without introducing heavy new infrastructure
- whether installer smoke evidence should be manually attached, semi-automated, or both
- which packaged-build steps belong in preflight/build-time scripts versus smoke-time evidence collection
- how to represent packaged smoke runs in the artifact model without breaking the existing Phase 1 smoke seam

## Deferred Ideas Not In This Phase

These were explicitly kept out of Phase 2:

- full packaged Electron UI automation lab
- cross-platform installer coverage beyond current Windows delivery
- broader product feature work
- always-on real MySQL packaged smoke as a hard requirement
