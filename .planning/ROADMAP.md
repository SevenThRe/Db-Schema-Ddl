# Roadmap: Desktop Stability and Real-Env Smoke

**Created:** 2026-03-18
**Granularity:** Coarse
**Coverage:** 4 / 4 v1.3 requirements mapped

## Summary

This roadmap treats `v1.3` as a stabilization milestone. Instead of growing feature breadth, it hardens the Electron desktop runtime, improves persistent diagnostics, adds targeted guards around the most fragile desktop seams, and formalizes a repeatable real-environment smoke path.

## Phase Overview

| # | Phase | Goal | Requirements | Success Criteria | Status |
|---|-------|------|--------------|------------------|--------|
| 1 | Electron Stability and Real-Env Smoke | Make startup, shutdown, diagnostics, release guards, and a real-environment smoke path reliable | STAB-01, STAB-02, STAB-03, STAB-04 | 4 | Complete |

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
- No later `v1.3` phase should be opened until Phase 1 restores operational confidence

## Notes

- Keep this milestone operational, not feature-broadening
- Keep user-facing errors translated and calm
- Preserve structured logs and smoke artifacts for future MCP/automation use
- Prefer narrow release guards over broad infrastructure changes

---
*Last updated: 2026-03-18 after completing v1.3 / Phase 1*
