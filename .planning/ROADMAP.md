# Roadmap: Desktop Stability and Real-Env Smoke

**Created:** 2026-03-18
**Granularity:** Coarse
**Coverage:** 6 / 6 v1.3 requirements mapped

## Summary

This roadmap treats `v1.3` as a stabilization milestone. Instead of growing feature breadth, it hardens the Electron desktop runtime, improves persistent diagnostics, adds targeted guards around the most fragile desktop seams, formalizes a repeatable real-environment smoke path, and extends that confidence to packaged Windows deliverables.

## Phase Overview

| # | Phase | Goal | Requirements | Success Criteria | Status |
|---|-------|------|--------------|------------------|--------|
| 1 | Electron Stability and Real-Env Smoke | Make startup, shutdown, diagnostics, release guards, and a real-environment smoke path reliable | STAB-01, STAB-02, STAB-03, STAB-04 | 4 | Complete |
| 2 | Packaged Build Smoke | Prove `win-unpacked` and installer builds survive packaged startup, shutdown, migration, extension entry, and DB-management access with structured evidence | STAB-05, STAB-06 | 4 | In Progress |

## Phase Details

### Phase 1: Electron Stability and Real-Env Smoke

Goal: Stabilize the desktop runtime so startup, shutdown, native modules, extension delivery, and real-environment DB flows behave predictably before more product breadth is added.

Requirements:
- STAB-01
- STAB-02
- STAB-03
- STAB-04

Success criteria:
1. Startup and shutdown errors no longer leak raw JS dialog spam to users in normal failure paths.
2. Fatal-path desktop failures write persistent local diagnostics that survive startup and shutdown issues.
3. Native-module, migration, and extension-catalog seams fail early and clearly through targeted guards.
4. A repeatable smoke path exists for app startup, shutdown, SQLite init/migration, extension entry, and one real MySQL DB-management flow.

## Phase Dependencies

- Phase 1 stands on the shipped Electron, SQLite, extension-delivery, and DB-management infrastructure from `v1.0` through `v1.2`
- Phase 2 depends on Phase 1's runtime hardening, logging, and smoke artifact seam

### Phase 2: Packaged Build Smoke

Goal: Extend desktop confidence from development Electron runs to packaged Windows deliverables, with repeatable evidence and explicit release-blocker policy.

Requirements:
- STAB-05
- STAB-06

Success criteria:
1. `win-unpacked` packaged builds can start, open the main window, initialize SQLite/migrations, enter `DB 管理`, and close cleanly.
2. NSIS installer builds have at least one verified install -> first run -> close path with structured evidence.
3. Packaged smoke evidence includes Markdown + JSON artifacts and also captures screenshots/log excerpts for human review.
4. Release-blocker policy is explicit for packaged failures such as startup failure, native-module load failure, migration failure, raw shutdown error dialogs, and broken extension entry.

Current execution status:
- Plan `02-01` extended the smoke artifact model for packaged evidence.
- Plan `02-02` added the `win-unpacked` runner, checkpoint-based readiness seam, screenshot/log capture, and packaged ABI guardrails.
- Installer-path proof and broader packaged release review remain for later Phase 2 plans.

## Notes

- Keep this milestone operational, not feature-broadening
- Keep user-facing errors translated and calm
- Preserve structured logs and smoke artifacts for future MCP/automation use
- Prefer narrow release guards over broad infrastructure changes
- Packaged smoke should prioritize `win-unpacked` iteration speed while still covering the installer path
- Real MySQL access is useful but should remain optional during packaged smoke unless a packaging-specific DB regression demands it

---
*Last updated: 2026-03-18 after executing v1.3 / Phase 2 Plan 02*
