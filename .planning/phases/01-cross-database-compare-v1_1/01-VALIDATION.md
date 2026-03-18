---
phase: 01-cross-database-compare-v1_1
slug: cross-database-compare-v1_1
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-18
updated: 2026-03-18
---

# Phase 1 - Validation Strategy

> Per-phase validation contract for `DB vs DB` compare, directional preview, and graph-linked review.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node test + tsx |
| **Config file** | none - existing package scripts |
| **Quick run command** | `npm run check` |
| **Focused commands** | `node --test --import tsx test/server/db-db-phase1.test.ts`, `node --test --import tsx test/client/db-vs-db-ui-phase1.test.tsx` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task batch:** Run `npm run check`
- **After backend/contract wave:** Run focused server tests
- **After UI wave:** Run focused client tests
- **Before phase close:** Run `npm test`

---

## Validation Architecture

Phase 1 needs validation in four layers:

1. **Contract validation**
   - `live vs live` compare contracts must be enabled only for compare/graph paths
   - apply schemas must remain blocked for live-to-live execution
2. **Canonical compare validation**
   - source/target compare must reuse existing canonical compare logic rather than branching into a second engine
3. **Directional preview validation**
   - preview output must remain source/target-oriented and consistent with the compare tree
4. **UI workflow validation**
   - `DB 管理` must gain a dedicated `db-vs-db` view
   - source/target swap, whole-db compare, result filtering, and graph linkage must remain coherent

---

## Wave 0 Test Targets

| Area | Expected coverage |
|------|-------------------|
| Shared contracts | `live vs live` compare allowed for compare/graph and still blocked for apply |
| Backend compare | compare result and directional preview come from one canonical pipeline |
| UI shell | dedicated `db-vs-db` main view exists and preserves source/target context |
| Settings | rename policy thresholds remain low-complexity and object-type based |

---

## Exit Conditions

- [x] `npm run check`
- [x] Focused server compare tests green
- [x] Focused client workflow tests green
- [x] `npm test`
- [x] No apply path accidentally permits `live -> live`
