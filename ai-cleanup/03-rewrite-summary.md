# AI Cleanup Rewrite Summary

## Targets

- `server/lib/ddl.ts`
- `shared/routes.ts`

## Applied Refactor

### `server/lib/ddl.ts`

- Extracted `renderTableDdl` to centralize the dialect-specific renderer selection.
- Extracted `buildCommentHeaderLines` to remove duplicated MySQL/Oracle comment-header generation.
- Kept MySQL and Oracle body generation separate so the change stays reviewable and behavior-safe.

### `shared/routes.ts`

- Simplified `buildUrl` from `forEach`-style mutation into a straight `for...of` loop.
- Added the early return for missing params to keep the helper more direct.

## Behavior Guardrails

- Output SQL format is preserved.
- Existing header template substitution still uses `substituteTemplateVariables(...)`.
- Public API contracts and helper signatures remain unchanged.
- No unrelated files were reformatted or touched in this cleanup batch.
