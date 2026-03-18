---
phase: 01-snapshot-compare-and-reports-v1_2
slug: snapshot-compare-and-reports-v1_2
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-18
updated: 2026-03-18
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for snapshot compare, live-vs-snapshot freshness control, and report export.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node test + tsx |
| **Config file** | none — existing package scripts |
| **Quick run command** | `npm run check` |
| **Focused commands** | `node --test --import tsx test/server/db-snapshot-phase1.test.ts`, `node --test --import tsx test/client/db-snapshot-phase1-ui.test.tsx` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~150 seconds |

---

## Sampling Rate

- **After every task batch:** Run `npm run check`
- **After contract/backend waves:** Run focused server tests
- **After UI waves:** Run focused client tests
- **Before phase close:** Run `npm test`

---

## Validation Architecture

Phase 1 needs validation in four layers:

1. **Contract validation**
   - snapshot-compare artifacts and report payloads remain schema-backed and stable
   - task-friendly JSON stays machine-usable and not UI-fragment shaped
2. **Source resolution validation**
   - arbitrary snapshot pairs are supported
   - `live` freshness mode is explicit and preserved in compare context
   - cross-connection snapshot compare works without mutating single-connection timeline flows
3. **Report projection validation**
   - Markdown and JSON exports derive from the same compare artifact
   - report output retains source/target/version context and summary/detail integrity
4. **UI workflow validation**
   - `Snapshot Compare` is a new main view
   - `History` remains a timeline/details surface
   - source selection, compare execution, and report export remain coherent

---

## Wave 0 Test Targets

| Area | Expected coverage |
|------|-------------------|
| Shared contracts | compare artifact + report export schemas are stable and MCP-friendly |
| Backend compare | snapshot-vs-snapshot and live-vs-snapshot resolve through one compare artifact pipeline |
| Report export | Markdown and JSON are projections of the same artifact |
| UI shell | new `snapshot-compare` main view exists without collapsing `history` into a second compare workspace |

---

## Exit Conditions

- [x] `npm run check`
- [x] Focused server snapshot/report tests green
- [x] Focused client snapshot-compare workflow tests green
- [x] `npm test`
- [x] No route or schema regression breaks existing single-connection history browsing

