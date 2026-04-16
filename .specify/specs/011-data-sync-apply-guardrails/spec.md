# Spec: Trusted Data Sync Apply Guardrails

## Problem

The DB Workbench now exposes real Data Sync apply execution, but the trust boundary is still too soft. Some execution guardrails are enforced only in the frontend, and warning-level delete thresholds are not carried into the backend execute path. That leaves operator safety dependent on UI behavior rather than the server-side execution contract.

## Goal

Make Data Sync apply a trustworthy operator workflow by enforcing the key execution guardrails at the backend contract boundary and reflecting those same conditions clearly in the workbench UI.

## Requirements

### R1. Backend-Enforced Unsafe Delete Confirmation

If selected delete actions exceed the configured unsafe delete threshold, execute must be blocked unless the operator explicitly confirms that threshold breach in the execute request.

### R2. Backend-Enforced Prod Confirmation

If the target connection is marked as `prod`, execute must require a positive operator confirmation tied to the target database identity, not just a frontend-only disabled button.

### R3. Frontend Confirmation UX

The workbench must surface the exact confirmation conditions for unsafe deletes and prod targets, and only enable execute when the operator has satisfied them.

### R4. No Silent Execution Semantics Drift

The preview and execute contracts must stay aligned so that a preview warning cannot silently disappear at execute time.

## Acceptance Criteria

1. The shared contract, bridge, and Rust execute request all include the fields required to enforce delete-threshold and prod-target confirmations.
2. Backend execute rejects unsafe delete threshold breaches unless the request explicitly confirms them.
3. Backend execute rejects prod-target apply requests when the target database confirmation text does not match.
4. The workbench UI clearly shows and collects the confirmations needed for execute.
5. `npm run check` and `cargo check` continue to pass.
