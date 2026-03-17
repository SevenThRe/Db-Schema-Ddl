# DB Management Extension Platform

## What This Is

This project adds an official downloadable extension system to DBSchemaExcel2DDL and uses it to deliver a DB management extension. The base application remains focused on Excel-to-DDL and historical schema diff, while the extension adds target-DB connectivity, file-vs-DB comparison, deploy preview/apply flows, and visual schema inspection for users who need it.

The target audience is existing users of the desktop application who want to manage real database environments without forcing every installer to ship the extra runtime weight and operational complexity.

## Core Value

Users can optionally turn the desktop app into a schema management workstation by downloading one official extension on demand, without bloating the base product for everyone else.

## Requirements

### Validated

- Existing users can upload Excel definition files and parse multiple table definitions from a workbook - existing
- Existing users can generate MySQL and Oracle DDL from structured table definitions - existing
- Existing users can compare current files with historical versions and export ALTER previews - existing
- Existing users can run the product as an Electron desktop application with GitHub-based application updates - existing

### Active

- [ ] Build an extension host inside the existing desktop app
- [ ] Deliver DB management as an official GitHub-downloaded extension instead of bundling it into the base installer
- [ ] Support extension install, verify, enable, disable, upgrade, and uninstall flows
- [ ] Support DB connection management and schema introspection inside the extension
- [ ] Support file-vs-DB and baseline-vs-DB diff with SQL preview and controlled apply flow
- [ ] Support visual schema inspection that highlights differences without turning the product into a full database IDE

### Out of Scope

- Third-party extension marketplace - keep trust and support scope narrow during v1
- General-purpose data browsing and SQL editor features - not core to schema management value
- Full DBeaver replacement - too broad and would erode focus
- Unrestricted destructive migrations by default - too risky for initial release

## Context

- The repository is a brownfield TypeScript codebase with clear client/server/shared/Electron boundaries and a typed route contract.
- The desktop runtime already uses local writable storage and GitHub-based update infrastructure, which makes it a strong foundation for downloadable extension delivery.
- Existing schema diff capabilities solve file-to-file comparison, but the current domain model is still centered on Excel parsing rather than canonical live-database representation.
- The user wants DB management to be optional so the normal installer stays lightweight while advanced users can unlock the feature later.

## Constraints

- **Compatibility**: The extension must preserve current base-app behavior when not installed - the normal installer cannot regress
- **Distribution**: The extension must be downloadable from GitHub - this matches the current release channel and avoids introducing a second distribution system
- **Security**: Only official, verified extensions should be installable in v1 - trust must be explicit before local code loading is allowed
- **Scope**: The project must stay focused on schema management, diff, deploy preview/apply, and visualization - otherwise it risks turning into a full database client
- **Brownfield**: The work must fit the existing typed route and shared-schema patterns - large architecture bypasses would create maintenance debt

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build DB management as an extension, not a base-app feature | Keeps the default installer lightweight and aligns with user intent | -- Pending |
| Add an extension host to the existing app before building the DB extension | A stable host boundary reduces one-off hacks and supports future growth | -- Pending |
| Keep v1 official-only for downloaded extensions | Simplifies trust, support, and checksum verification | -- Pending |
| Treat canonical schema normalization as an early foundation task | File-vs-DB diff will be brittle if it stays Excel-first | -- Pending |
| Keep destructive deploy actions gated by default | Schema execution risk is too high for a permissive first release | -- Pending |

---
*Last updated: 2026-03-17 after initialization*

