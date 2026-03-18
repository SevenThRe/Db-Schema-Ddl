# AI Cleanup Scan

## Scope

- Target scope: current dirty worktree, limited to safe cleanup candidates inside:
  - `server/lib/ddl.ts`
  - `shared/routes.ts`
- Intent: reduce duplication and simplify control flow without changing behavior.

## Findings

### 1. DDL rendering duplicated dialect dispatch

- Evidence:
  - `renderDDLChunks` in `server/lib/ddl.ts:235`
  - `streamDDL` in `server/lib/ddl.ts:247`
- Why it matters:
  - Both code paths repeated the same "pick MySQL vs Oracle renderer" branch.
  - That duplication increases drift risk when one rendering path changes later.
- Priority: `P2`

### 2. Comment header generation duplicated across MySQL and Oracle output

- Evidence:
  - MySQL header block in `server/lib/ddl.ts:294`
  - Oracle header block in `server/lib/ddl.ts:354`
- Why it matters:
  - Both functions rebuilt the same default/custom header with nearly identical logic.
  - The duplication adds maintenance cost in a correctness-sensitive generation path.
- Priority: `P2`

### 3. Small utility in route contract used a more indirect replacement loop than necessary

- Evidence:
  - `buildUrl` in `shared/routes.ts:333`
- Why it matters:
  - The previous `forEach` + nested condition was not incorrect, but it added closure noise for a tiny helper.
  - This is a low-risk cleanup target suitable for the same batch.
- Priority: `P3`

## Selected Rewrite Targets

- Primary: `server/lib/ddl.ts`
- Secondary: `shared/routes.ts`
