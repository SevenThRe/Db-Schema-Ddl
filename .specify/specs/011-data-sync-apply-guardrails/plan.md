# Plan: Trusted Data Sync Apply Guardrails

## Summary

This wave makes Data Sync apply safe by contract rather than merely safe by UI convention. The main change is to extend the execute request with explicit confirmation inputs and have the Rust backend enforce them before any transaction begins.

## Scope

- Extend the shared Data Sync apply execute request with:
  - delete warning threshold
  - explicit unsafe-delete confirmation
  - target database confirmation text
- Mirror those fields in Rust request types and execution planning.
- Add backend guardrails for:
  - unsafe delete threshold breach without confirmation
  - prod target confirmation mismatch
- Update the workbench sync pane to collect and show these confirmations explicitly.

## Likely Touchpoints

- `shared/schema.ts`
- `src-tauri/src/db_connector/mod.rs`
- `src-tauri/src/db_connector/data_apply.rs`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`

## Risks

- Preview and execute conditions can drift if they use different thresholds or blocker semantics; use shared request fields and one guard builder path.
- Guardrails should block before transaction start, not after partial execution.
- The UI must remain dense and operator-oriented; confirmation UX should stay inline in the sync pane rather than introducing a new modal unless needed.

## Verification

- `npm run check`
- `cargo check`
- Manual desktop check:
  - unsafe delete warning requires explicit confirmation before execute
  - prod target requires typed database confirmation
  - backend rejects malformed execute calls even if the frontend were bypassed
