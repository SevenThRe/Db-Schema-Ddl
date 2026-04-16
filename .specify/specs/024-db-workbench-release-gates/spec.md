# Spec: DB Workbench Release Gates

## Problem

DB Workbench already has memory guardrails, stale-response handling, session persistence, job audit, and desktop smoke hooks. But these reliability features are still easy to treat as implementation details instead of product release gates. That keeps the product vulnerable to regressions whenever new workbench features land.

## Goal

Turn the current reliability foundations into explicit release gates for primary DB Workbench surfaces.

## Requirements

### R1. Primary Surfaces Must Map To Explicit Verification Gates

The team must be able to state which checks, targeted tests, and smoke flows are required before primary workbench surfaces ship.

### R2. Reliability Behavior Must Be Framed As Product Quality

Memory bounds, stale-response protection, cancellation correctness, recoverability, and audit visibility must be treated as product-level guarantees.

### R3. Preview Surfaces Must Have Promotion Criteria

Preview capabilities must define what additional verification or hardening is required before they can become primary product surfaces.

### R4. Release Documentation Must Follow Capability Truth

Release notes and smoke guidance must reflect primary vs preview vs secondary status instead of collapsing them into one feature list.

## Acceptance Criteria

1. A concrete release-gate matrix exists for primary workbench surfaces.
2. Preview promotion criteria are documented for advanced workbench flows.
3. Reliability behavior is tied to real verification paths.
4. `npm run check` and `cargo check` pass.
