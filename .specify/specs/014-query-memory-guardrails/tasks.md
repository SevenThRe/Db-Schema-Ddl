# Tasks: Query Memory Guardrails

- [x] Add the 014 query memory guardrails spec, plan, and tasks.
- [x] Bound unsupported result queries so Rust stops collecting after `limit + 1` rows.
- [x] Extend query batch metadata for retained-row window tracking.
- [x] Cap retained pageable rows in the workbench and protect pending edited rows where possible.
- [x] Surface retained-window state in the result grid and warn when trimming starts.
- [x] Re-run TypeScript and Rust static checks.
