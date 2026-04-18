# DBTools

DBTools is a desktop-first schema workbench for Excel-driven schema definition, DDL round-tripping, schema diffing, and live database operations.

The repository is no longer just an `Excel -> DDL` converter. The current product spans:

- Excel definition parsing and DDL generation
- DDL import back into workbook templates
- schema diff and rename suggestion workflows
- name-fix workflows
- builtin tool workspaces
- DB Workbench for live introspection and SQL execution

## Stack

- Vite + React + TypeScript
- Tauri + Rust
- shared TypeScript contracts in `shared/schema.ts`

## Development

Install dependencies:

```bash
npm install
```

Run the web UI:

```bash
npm run dev
```

Run the desktop app:

```bash
npm run tauri:dev
```

Build outputs:

```bash
npm run build
npm run tauri:build
```

Verification:

```bash
npm run check
npm run check:i18n
```

Docs site:

```bash
npm run docs:dev
npm run docs:build
npm run docs:serve
```

## Releases And Docs

- Releases: [GitHub Releases](https://github.com/SevenThRe/Db-Schema-Ddl/releases)
- Latest installer: [DBTools-Setup-latest.exe](https://github.com/SevenThRe/Db-Schema-Ddl/releases/latest/download/DBTools-Setup-latest.exe)
- Docs site: [DBTools Manual](https://seventhre.github.io/Db-Schema-Ddl/)

## Repository Layout

- `client/` — React frontend
- `shared/` — shared contracts and schemas
- `src-tauri/` — desktop backend and builtin tool manifests
- `docs/` — focused product and verification docs
- `docs-site/` — published manual site
- `script/` — build and verification utilities
- `attached_assets/` — local workbook assets for testing

## Notes

- Runtime code is the source of truth when docs disagree.
- `shared/schema.ts` is the contract boundary between frontend and desktop backend.
- DB Workbench and file-based schema workflows coexist; treat both as first-class product surfaces.
