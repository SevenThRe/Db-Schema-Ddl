---
milestone: v1.6
milestone_name: Reliability & Validation Hardening
created: "2026-04-11"
granularity: coarse
total_phases: 2
total_requirements: 3
---

# Roadmap

## Milestones

- ✅ **v1.5 应用级 DB 工作台** — shipped 2026-04-08 ([archive](./milestones/v1.5-ROADMAP.md))
- 🚧 **v1.6 Reliability & Validation Hardening** — active

## Milestone Goal

Close post-`v1.5` audit debt by proving live-environment resilience for runtime operations and restoring Nyquist validation compliance across shipped phases.

---

## Phases

- [ ] **Phase 06: Live Runtime Resilience Validation** - Run live-environment stress scenarios for large results/cancel/export under unstable network conditions and publish reproducible evidence
- [ ] **Phase 07: Nyquist Validation Backfill** - Add missing validation artifacts for archived `v1.5` phases and align workflow compliance gates

---

## Phase Details

### Phase 06: Live Runtime Resilience Validation
**Goal**: Convert residual phase-15 runtime risk into evidence-backed confidence using live DB scenarios beyond unit/contract coverage
**Depends on**: Archived v1.5 runtime/edit/sync baseline and phase verification reports
**Requirements**: REL-01, REL-02
**Success Criteria** (what must be TRUE):
  1. Large-result first-page, load-more, cancel, and export flows are exercised against live DB targets with unstable network simulations and operator-visible pass/fail evidence
  2. Regression suite and runbook capture recovery behavior for interruption scenarios without runtime state leakage
  3. New evidence artifacts are linked from planning docs so milestone audits no longer report this runtime debt item
**Plans**: TBD
**UI hint**: yes

### Phase 07: Nyquist Validation Backfill
**Goal**: Eliminate missing Nyquist compliance artifacts for archived v1.5 phases and make validation status explicit in planning governance
**Depends on**: Phase 06 evidence publication complete
**Requirements**: GOV-01
**Success Criteria** (what must be TRUE):
  1. Archived phases `15-18` each have a corresponding `*-VALIDATION.md` artifact with explicit compliance status
  2. Milestone audit no longer reports "Nyquist validation files missing" for v1.5 archived scope
  3. Validation expectations are documented for future milestone closeout
**Plans**: TBD
**UI hint**: no

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 06. Live Runtime Resilience Validation | 0/0 | Not started | - |
| 07. Nyquist Validation Backfill | 0/0 | Not started | - |

---

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| REL-01 | Phase 06 | Pending |
| REL-02 | Phase 06 | Pending |
| GOV-01 | Phase 07 | Pending |

**Total: 3/3 requirements mapped (100% coverage)**

---

## Key Constraints

- Keep the shipped `v1.5` behavior unchanged while adding validation evidence and governance artifacts
- Runtime resilience proof must include reproducible commands, logs, and expected outcomes rather than narrative-only claims
- Nyquist backfill must operate on archived phase artifacts without destructive history edits

---

*Last updated: 2026-04-11 after generating gap-closure phases from v1.5 milestone audit*
