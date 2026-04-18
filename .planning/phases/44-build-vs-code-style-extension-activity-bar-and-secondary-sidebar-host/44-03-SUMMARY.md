---
phase: 44-build-vs-code-style-extension-activity-bar-and-secondary-sidebar-host
plan: 03
subsystem: extension-shell-regression-guard
tags: [test, extensions, shell, db-workbench]
requires:
  - phase: 44-01
    provides: Extension shell chrome and route persistence
  - phase: 44-02
    provides: DB connector shell ids and host-managed sidebar mode
provides:
  - Static regression guard for the new extension shell layout
  - Assertions for DB connector shell ids and host-managed sidebar mode
affects: [shell-regressions, future-phase-refactors]
tech-stack:
  added: []
  patterns: [source-level shell regression tests]
key-files:
  created:
    - test/client/extension-shell-phase44.test.ts
  modified: []
key-decisions:
  - "Source-level assertions are enough here because the phase changes shell contracts and layout wiring more than one isolated interaction."
patterns-established:
  - "Extension shell milestones get focused static guards for routing and contribution ids."
requirements-completed: []
duration: 4min
completed: 2026-04-17T11:01:16+08:00
---

# Phase 44 Plan 03 Summary

The new extension shell layout is now pinned by a focused regression test.

## Accomplishments

- Added [extension-shell-phase44.test.ts](/E:/work/Db-Schema-Ddl/test/client/extension-shell-phase44.test.ts) to assert `ExtensionActivityBar`, `ExtensionSecondarySidebar`, DB connector shell ids, and `sidebarMode`.
- Locked out a regression path where the core [Sidebar.tsx](/E:/work/Db-Schema-Ddl/client/src/components/Sidebar.tsx) could silently reintroduce `extNavItems` footer navigation.

## Verification

- NODE_OPTIONS=--import=tsx node --test --experimental-strip-types test/client/extension-shell-phase44.test.ts: passed

## Self-Check: PASS
