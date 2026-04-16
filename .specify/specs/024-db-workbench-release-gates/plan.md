# Plan: DB Workbench Release Gates

## Summary

This wave operationalizes the 020 runtime-reliability contract. It should connect primary product surfaces to concrete checks, tests, and smoke expectations so release quality is auditable.

## Likely Touchpoints

- `.specify/specs/020-db-workbench-productization/contracts/runtime-reliability-gates.md`
- desktop smoke docs and scripts
- release verification docs
- targeted test documentation or manifests

## Risks

- Release-gate docs can become stale if they are not tied to real runtime flows.
- Overly broad gates could slow delivery without increasing quality.

## Verification

- `npm run check`
- `cargo check`
- validate documented gates against existing runtime smoke/test assets
- confirm preview promotion criteria remain honest for advanced surfaces
