# DB Workbench Operator-Grade Plan

Date: 2026-04-18

## Current reality

The DB workbench is already a real product surface, not a stub. Querying, explain, inspection, grid edit, data sync, job history, and SQL Copilot all have visible frontend wiring plus Tauri commands. The gap is no longer "build a DB workbench from scratch". The gap is to finish the operator-grade edges so the product feels coherent, safe, and primary.

## Defects and gaps

1. Data Sync currently allows an ambiguous `source == target` posture.
   This weakens source/target role clarity and should be blocked in both UI and backend.

2. Legacy and main workbench paths still split the mental model.
   The primary route is clear in code, but migration cleanup is incomplete.

3. Several labels/comments still reflect migration-era language.
   That makes the product look less complete than the runtime actually is.

4. Verification coverage is broad but should stay tied to the main operator journey.
   Safety gates need to keep tracking the real daily-driver path, not only isolated features.

## Repair plan

### Now

- block same-connection Data Sync comparisons and apply chains
- default Data Sync target to a different saved connection when one exists
- add regression tests for those guards

### Next

- review all workbench labels that still say `preview` or `planned` where the workflow is already live
- make the primary route even more explicit in the shell and secondary entry points
- expand release-gate verification around one end-to-end operator path:
  connection -> inspect -> query -> edit/apply -> audit

### Later

- retire duplicated legacy surfaces once parity is proven
- decide which advanced workflows remain bounded by safety constraints and which should graduate into first-class tools
