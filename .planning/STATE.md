# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-17)

**Core value:** Users can optionally turn the desktop app into a schema management workstation by downloading one official extension on demand, without bloating the base product for everyone else.
**Current focus:** Phase 1 - Extension Host Foundation

## Current Status

- Project initialized as a brownfield extension effort inside the existing DBSchemaExcel2DDL repository
- Codebase map created under `.planning/codebase/`
- Configuration initialized for coarse-grained, parallel, YOLO-style planning with commit tracking enabled
- Requirements and roadmap drafted for the extension host plus DB management extension delivery

## Important Assumptions

- The DB management capability will be delivered as an official first-party extension
- GitHub remains the sole trusted distribution source in v1
- The base application must remain fully functional with no extension installed
- Initial scope focuses on schema management rather than full database-client capabilities

## Next Command

- `$gsd-discuss-phase 1`

## Open Questions To Resolve During Phase 1

- What exact extension manifest and host API contract should the app support?
- Will frontend extension UI load through a routed outlet, iframe-like shell, or another local microfrontend pattern?
- How will server-side extension route registration work in the bundled desktop runtime?
- What checksum/signature policy is required before enabling downloaded code?

---
*Last updated: 2026-03-17 after project initialization*
