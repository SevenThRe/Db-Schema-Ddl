---
phase: 26-release-candidate-verification
plan: 02
subsystem: tauri-native-release-verification
tags: [db-workbench, tauri, smoke, live-verification, ship-gate]
requires: [01]
provides:
  - Shared release-verification contracts for smoke, live DB proof, and ship gate artifacts
  - Tauri-native smoke checkpoint wiring in the packaged app
  - Current preflight, packaged smoke, live-verification, and ship-gate scripts
affects: [client, shared, tauri, scripts, docs, test]
tech-stack:
  added: [shared/release-verification.ts, client/src/lib/release-verification.ts]
  patterns: [checkpoint-driven release evidence, fail-closed ship gate, artifact-first verification]
key-files:
  created:
    - shared/release-verification.ts
    - client/src/lib/release-verification.ts
    - script/workbench-live-verification.ts
    - script/release-ship-gate.ts
    - test/server/release-verification-phase26.test.ts
    - docs/release-candidate-verification.md
  modified:
    - package.json
    - shared/schema.ts
    - shared/desktop-runtime.ts
    - client/src/pages/Dashboard.tsx
    - client/src/components/extensions/DbConnectorWorkspace.tsx
    - src-tauri/src/commands.rs
    - src-tauri/src/lib.rs
    - script/desktop-preflight.ts
    - script/desktop-smoke.ts
    - script/desktop-packaged-smoke.ts
    - script/desktop-packaged-smoke-installer.ps1
    - docs/desktop-smoke.md
    - docs/desktop-packaged-smoke.md
completed: 2026-04-12T14:50:00+08:00
---

# Phase 26 Plan 02 Summary

Release verification is now wired to the real Tauri product instead of stale Electron assumptions.

## Accomplishments

- Added `shared/release-verification.ts` and re-exported it through `shared/schema.ts` so smoke, live-driver proof, and ship-gate artifacts share one typed contract.
- Added a Tauri-side `core_smoke_checkpoint` command plus setup/page-load checkpoint emission, and exposed release-verification flags to the frontend window.
- Wired `Dashboard` and `DbConnectorWorkspace` to emit real smoke checkpoints for dashboard readiness, DB workbench surface entry, and remembered-connection recovery classification.
- Replaced the old Electron preflight/smoke scripts with current Tauri-native scripts and package commands.
- Produced a passing packaged smoke artifact from the real release executable:
  - `artifacts/release-verification/tauri-packaged-smoke-2026-04-12T06-30-19-330Z.json`
- Produced a fail-closed ship-gate artifact that blocks release while live MySQL/PostgreSQL evidence is still missing:
  - `artifacts/release-verification/ship-gate-2026-04-12T06-32-35-571Z.json`

## Verification

- `npm run check`: **passed**
- `$env:NODE_OPTIONS='--import=tsx'; node --test --experimental-strip-types test/server/release-verification-phase26.test.ts`: **passed**
- `cargo check --manifest-path src-tauri/Cargo.toml -j 1`: **passed**
- `npm run verify:desktop:preflight`: **passed**
- `npm run tauri:build`: **passed**
- `npm run verify:desktop:smoke:packaged`: **passed**
- `npm run verify:desktop:ship-gate`: **blocked as expected** because no live MySQL/PostgreSQL artifacts exist yet

## Self-Check: PASS WITH EXTERNAL EVIDENCE BLOCKER
