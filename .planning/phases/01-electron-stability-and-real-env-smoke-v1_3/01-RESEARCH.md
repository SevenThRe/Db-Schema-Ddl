# Phase 1: Electron Stability and Real-Env Smoke - Research

**Date:** 2026-03-18
**Status:** Complete
**Scope:** Electron startup/shutdown hardening, persistent diagnostics, real-environment smoke evidence, targeted release guards

## Research Summary

Phase 1 should stay deliberately boring and operational. The right approach is not to add another framework layer; it is to harden the seams that already exist:

- Electron main process should become the single fatal-path error broker
- persistent local logging should use a simple synchronous file appender in Electron main, not a new logging stack
- native-module and migration compatibility should be checked with narrow preflight guards
- real-environment confidence should start with a documented smoke harness plus a few deterministic scripted checks, not a full Electron E2E lab

For this repo, the standard stack is:

- existing Electron main/preload boundary
- existing `better-sqlite3` + Drizzle local persistence
- existing PowerShell + npm script orchestration on Windows
- existing Node `node:test` whitebox/behavior test approach
- a new structured smoke artifact format built from JSON/Markdown outputs, not UI-only notes

This combination fits the product's current reality:

- the app is Windows-first in packaging and native-module handling
- the recent failures came from runtime seams, not missing product features
- the repo already has enough infrastructure to harden startup, shutdown, migration compatibility, and extension delivery without introducing a big new dependency surface

## Standard Stack

### Electron runtime hardening

- Keep Electron main as the single privileged runtime coordinator.
- Register `uncaughtException` and `unhandledRejection` handlers in Electron main.
- Route startup/shutdown fatal-path reporting through one shared helper.
- Prefer suppressing raw modal error spam during shutdown while still writing diagnostics to disk.

Why:

- Electron main is already orchestrating server bootstrap, BrowserWindow lifecycle, IPC, updater setup, and shutdown cleanup.
- The observed failures happened in startup/quit paths, which are exactly where a single broker is needed.

### Persistent logging

- Use a deterministic local log file in Electron `userData/logs`.
- Keep logging implementation simple: synchronous append from Electron main.
- Log startup, shutdown, fatal exceptions, extension install/catalog failures, migration failures, and smoke checkpoints.
- Fall back to the OS temp directory only when `userData` is unavailable.

Why:

- Sync append is acceptable here because these are low-volume operational events and reliability matters more than throughput.
- A simple file appender is easier to trust than introducing `winston`, `pino`, or `electron-log` mid-milestone.

### Release/preflight guards

- Use existing npm/build scripts plus focused preflight checks.
- Guard these seams explicitly:
  - Electron native module availability (`better-sqlite3`)
  - SQLite compatibility columns/migrations
  - extension catalog/release fallback behavior
  - startup/shutdown fatal-path expectations

Why:

- The failures were concentrated in a few desktop-specific seams.
- Narrow checks in build/start flows will catch more real regressions than broad but shallow automation.

### Real-environment smoke

- Start with a repeatable Windows-first smoke checklist plus small scripted helpers.
- Use the app's existing routes and DB-management flows instead of inventing special test-only pathways.
- Emit structured smoke evidence in JSON/Markdown so it can be reviewed by humans and reused later by MCP agents.

Why:

- The product is already beyond pure unit-test coverage needs, but it is not yet worth building a heavyweight Electron UI automation lab for this milestone.
- A checklist plus machine-readable evidence is the fastest useful step.

### Test tooling

- Continue using `node:test` for deterministic whitebox/behavior coverage.
- Add focused tests around:
  - error-message normalization
  - startup/shutdown helper logic
  - migration/preflight checks
  - log formatting and smoke artifact serialization
- Keep real Electron + real MySQL verification as a smoke workflow, not as the only automated test type.

Why:

- This repo already uses `node --test --import tsx`.
- Reusing the same testing style keeps the phase smaller and easier to review.

## Architecture Patterns

### 1. Single fatal-path reporter in Electron main

Recommended pattern:

- Create one helper that:
  - normalizes unknown errors
  - writes a persistent log line immediately
  - decides whether a user-facing dialog should appear
  - suppresses duplicate dialogs during shutdown
- Use that helper from:
  - startup failures
  - shutdown cleanup failures
  - uncaught exceptions
  - unhandled promise rejections
  - extension delivery failures when they cross the Electron boundary

Why:

- The current code already has the right center of gravity in `electron/main.ts`; it just needs to become consistent and reusable.

### 2. User-facing error translation at the boundary

Recommended pattern:

- Translate transport/runtime errors at the last boundary before they reach the UI.
- Renderer should receive product-language messages, not IPC wrapper text.
- Keep technical detail in logs, not toast text.

Why:

- The recent `Error invoking remote method...` case is exactly what happens when IPC wrapper text leaks through.
- Error translation belongs at the boundary, not scattered across random UI call sites.

### 3. Startup and shutdown as explicit lifecycle states

Recommended pattern:

- Treat startup and shutdown as first-class operational states.
- Emit log checkpoints for:
  - server bootstrap start
  - database init/migration start and completion
  - BrowserWindow creation
  - shutdown requested
  - cleanup start
  - cleanup complete
  - forced timeout fallback

Why:

- Without lifecycle checkpoints, exit-time and bootstrap-time bug reports are hard to reconstruct.
- These checkpoints also make future smoke automation and MCP diagnostics much easier.

### 4. Structured smoke artifacts, not prose-only notes

Recommended pattern:

- Each smoke run should produce:
  - a short human summary (Markdown)
  - a machine-readable record (JSON)
- JSON should include stable fields such as:
  - app version
  - build flavor
  - timestamp
  - environment
  - steps
  - pass/fail state
  - captured log path
  - notable warnings/errors

Why:

- This phase already has an AI/MCP-friendly requirement.
- Structured smoke evidence will be reusable later for automation and support workflows.

### 5. Windows-first native-module handling

Recommended pattern:

- Keep native modules external in Electron bundling.
- Rebuild native dependencies explicitly for Electron ABI where needed.
- Add a narrow startup/preflight check that can fail fast with a clear message when the expected binding is unavailable.

Why:

- The recent `better-sqlite3` failure was caused by exactly this seam.
- This repo already has Windows-focused rebuild scripts and packaging assumptions.

## Don't Hand-Roll

- Do not introduce a heavyweight new logging library just to log Electron operational events.
- Do not build a full custom Electron E2E framework for this phase.
- Do not expose raw IPC/runtime exception text directly to the renderer.
- Do not rely on renderer-only logging for startup/shutdown failures.
- Do not broaden this phase into feature work unrelated to runtime hardening.
- Do not add wide generic CI machinery before the narrow desktop risks are guarded.

## Common Pitfalls

### 1. Logging only after the renderer is alive

Risk:

- Startup and shutdown failures can happen before or after the renderer is usable.

Recommendation:

- Log from Electron main immediately, with filesystem writes that do not depend on renderer health.

### 2. Treating shutdown noise as harmless

Risk:

- Multiple raw JS dialogs on close destroy confidence and often hide the real root cause.

Recommendation:

- Suppress duplicate user dialogs during shutdown, but still capture every failure in persistent logs.

### 3. Using broad smoke goals without a minimal success definition

Risk:

- “Run a smoke test” becomes vague and inconsistent across sessions.

Recommendation:

- Define a fixed first-pass smoke path with explicit steps and expected outcomes before adding more coverage.

### 4. Over-automating too early

Risk:

- Building a big automation harness now will burn time before the most failure-prone seams are even stable.

Recommendation:

- Start with a small scripted preflight plus a real-environment checklist. Expand only after the runtime path is calm.

### 5. Letting release guards sprawl

Risk:

- A giant preflight becomes noisy and gets ignored.

Recommendation:

- Guard only the specific seams already known to be fragile in this codebase.

## Code Examples

### Example: shared Electron fatal-path reporter

```ts
function reportMainProcessError(
  context: string,
  err: unknown,
  options?: { showDialog?: boolean; shuttingDown?: boolean },
) {
  const errorText = stringifyError(err);
  writeBootstrapLog(`${context}: ${errorText}`);
  console.error(`[electron] ${context}:`, err);

  if (options?.showDialog && !options?.shuttingDown) {
    dialog.showErrorBox("Application error", errorText);
  }
}
```

### Example: structured smoke artifact

```ts
interface SmokeStepResult {
  id: string;
  title: string;
  status: "passed" | "failed" | "warning";
  detail?: string;
}

interface SmokeRunArtifact {
  appVersion: string;
  timestamp: string;
  environment: "dev-electron" | "packaged-electron";
  logPath: string;
  steps: SmokeStepResult[];
}
```

### Example: native preflight expectation

```ts
function assertElectronNativeBindingReady() {
  try {
    require("better-sqlite3");
  } catch (error) {
    throw new Error(
      "SQLite native module is unavailable for the current Electron runtime. Please rebuild native dependencies.",
    );
  }
}
```

## Recommended Plan Shape

Phase 1 should likely plan into 4 chunks:

1. Shared operational contracts
   - stable log/smoke artifact schema
   - user-facing error categories
   - Wave 0 tests for serialization and message mapping
2. Electron runtime hardening
   - startup/shutdown error broker
   - persistent log location and checkpoint logging
   - shutdown suppression behavior
3. Release/preflight guards
   - native-module checks
   - migration/compatibility guards
   - extension catalog fallback checks
4. Real-environment smoke seam
   - minimal smoke checklist
   - small scriptable evidence capture
   - optional UI surfaces or dev-only utilities only if needed

## Validation Architecture

- Validate narrow helper behavior with `node:test`
- Validate build compatibility with `npm run check` and `npm run build`
- Validate smoke artifact shape with deterministic tests
- Validate one real smoke pass manually or semi-manually and record the artifact path
- Treat “app starts and app exits without raw JS dialogs” as an explicit acceptance criterion, not an implied one

## Confidence

- Electron main-process hardening approach: High
- Simple persistent file logging: High
- Narrow release/preflight guards: High
- Minimal real-environment smoke harness: Medium-High
- Full automation of desktop runtime this phase: Low value / intentionally deferred

## Research Complete

The standard stack for this phase is already present in the repo. The best implementation path is to harden the existing Electron/runtime seams, add deterministic persistent diagnostics, and formalize a small real-environment smoke workflow instead of expanding product breadth or introducing heavy new infrastructure.
