---
phase: 01-electron-stability-and-real-env-smoke-v1_3
milestone: v1.3
updated: 2026-03-18
status: discussed
---

# Phase 1 Context

## Phase

**Phase 1: Electron Stability and Real-Env Smoke**

Goal: Stabilize the desktop runtime so startup, shutdown, native modules, extension delivery, and real-environment DB flows behave predictably before more product breadth is added.

Requirements in scope:
- STAB-01
- STAB-02
- STAB-03
- STAB-04

## Fixed Boundary

This phase clarifies **how** the next milestone should harden the shipped desktop app.

It does **not** add:
- new schema modeling features
- new compare modes
- broader SQL or Oracle feature coverage
- new DB apply capabilities

Those can follow after runtime and delivery confidence improve.

## Reused Product Context

Existing reusable assets already in the codebase:

- Electron startup and shutdown flow already lives in:
  - `electron/main.ts`
  - `electron/preload.ts`
  - `script/build.ts`
  - `package.json`
- Extension delivery and lifecycle already exist in:
  - `electron/extensions.ts`
  - `electron/github-release.ts`
  - `client/src/components/extensions/ExtensionInstallDialog.tsx`
  - `client/src/components/settings/ExtensionManagementSection.tsx`
- SQLite initialization and compatibility migrations already exist in:
  - `server/init-db.ts`
  - `server/constants/db-init.ts`
  - `server/db.ts`
- Live DB flows already exist and should become part of the smoke path:
  - `server/lib/extensions/db-management/*`
  - `client/src/components/db-management/*`

Important current limitation:
- the shipped app has feature coverage, but desktop runtime confidence is still below product maturity because startup/quit faults, native module friction, and missing real-environment smoke evidence can still leak through to users.

## Locked Decisions

### 1. Prioritize runtime stability over new feature breadth

- This phase focuses first on Electron startup, shutdown, native module loading, migration compatibility, and extension delivery behavior.
- It should not spend early effort polishing peripheral UI details ahead of runtime correctness.

Rationale:
- recent failures came from runtime seams rather than feature absence
- shipping more breadth before hardening these seams would increase support cost

### 2. Keep a dual-layer error model

- User-visible errors must be translated into calm, actionable product messages.
- Detailed technical diagnostics must still be written to local logs for debugging.
- Raw internal stack traces should not be surfaced directly to end users by default.

Rationale:
- users need clarity, not transport-layer or IPC exception text
- developers still need enough detail to diagnose failures after the fact

### 3. Make logging reliable during shutdown and fatal paths

- Electron main-process fatal errors, unhandled rejections, startup failures, extension-delivery failures, and shutdown-path faults should be written immediately to persistent local logs.
- Logging must not depend on the renderer still being alive.
- Shutdown-path logging is part of the phase scope because the user specifically observed errors during app exit.

Rationale:
- if errors only appear in modal dialogs or transient consoles, bug diagnosis becomes unreliable
- exit-time failures are otherwise easy to lose

### 4. Add a real-environment smoke seam

- This phase should define and implement a minimal but repeatable smoke path that exercises:
  - application startup
  - application shutdown
  - SQLite initialization / migrations
  - extension catalog/install entry behavior
  - DB 管理 entry behavior
  - at least one real MySQL connection and schema-read path
- The first version may combine manual checklist evidence with lightweight automation.
- Full end-to-end automation is not required on day one.

Rationale:
- current tests prove a lot, but they do not yet replace one full desktop + real-environment confidence pass

### 5. Add release guards for fragile seams

- The phase should add guardrails around the most failure-prone packaging/runtime seams:
  - Electron-native module availability
  - SQLite compatibility columns/migrations
  - extension catalog availability/fallback handling
  - startup/shutdown fatal-path behavior
- The priority is targeted release protection, not a giant generalized CI system.

Rationale:
- the recent issues were concentrated in a few desktop-specific seams
- catching those earlier is more valuable than broad but shallow automation

### 6. Preserve AI/MCP-friendly diagnostics

- Error and smoke artifacts should remain structured enough for future MCP / automation use.
- Stable identifiers and machine-usable fields are preferred over ad-hoc text blobs wherever practical.
- Human summaries can be derived from those artifacts, but the underlying diagnostic model should stay reusable.

Rationale:
- the product is being shaped for future AI-assisted operations
- diagnostics and smoke evidence should not become dead-end UI-only structures

## Proposed Phase Shape

The accepted direction for this phase is:

- runtime hardening first
- persistent logging second
- repeatable real-environment smoke third
- targeted release guards fourth

This means the phase should likely produce:

- a hardened Electron main-process error/reporting layer
- friendlier extension and startup/shutdown failure messaging
- a stable local log location and conventions
- a documented smoke checklist plus any small automation seam needed to support it
- narrow but valuable release-time checks for native modules, migrations, and extension delivery

## Open Implementation Guidance For Research/Planning

Downstream research and planning should investigate:

- the cleanest persistent log location and rotation strategy for Electron development vs packaged runs
- whether any renderer-originated close-time faults need explicit shutdown suppression or special handling
- the minimum practical real-MySQL smoke harness for this repo
- which release guards belong in build/start scripts versus runtime startup checks
- how to capture smoke evidence in a way that remains useful to future MCP agents

## Deferred Ideas Not In This Phase

These were explicitly kept out of Phase 1:

- new compare/export/import features
- DB-to-DB sync/apply expansion
- Oracle parity work
- broad UI redesign work unrelated to runtime stability
