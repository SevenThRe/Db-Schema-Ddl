# Technology Stack

**Analysis Date:** 2026-03-24

## Languages

**Primary:**
- TypeScript 5.6.3 — All frontend code under `client/src/` and shared types under `shared/`
- Rust (edition 2021, minimum 1.77.2) — All native backend code under `src-tauri/src/`

**Secondary:**
- CSS (Tailwind) — Styling via `client/src/index.css` and utility classes throughout `client/src/components/`

## Runtime

**Environment:**
- Desktop application — runs as a Tauri v2 native process; no Node.js server or Express in production
- WebView (WebView2 on Windows) — hosts the React frontend inside the native window

**Package Manager:**
- npm — frontend dependencies
- Cargo — Rust crate dependencies
- Lockfiles: `package-lock.json` and `src-tauri/Cargo.lock` both present

## Frameworks

**Core Frontend:**
- React 18.3.1 — UI rendering (`client/src/`)
- Vite 7.3.0 — Dev server and production bundler; config in `vite.config.ts`

**Desktop Shell:**
- Tauri 2.10.3 — Native desktop wrapper, IPC host, filesystem access, dialog, auto-updater
  - Config: `src-tauri/tauri.conf.json`
  - Application entry: `src-tauri/src/lib.rs`
  - Build identifier: `com.seventhre.db-schema-ddl`
  - Bundle target: NSIS installer (Windows)

**Routing:**
- wouter 3.3.5 — Lightweight client-side routing inside the WebView

**Server State:**
- @tanstack/react-query 5.60.5 — All async data fetching and cache management (no separate HTTP server; queries dispatch Tauri IPC commands)

**UI Component Library:**
- Radix UI (full suite, ~25 packages) — Headless accessible primitives
- shadcn/ui conventions — Components assembled from Radix + Tailwind in `client/src/components/ui/`
- lucide-react 0.453.0 — Icon set
- react-icons 5.4.0 — Additional icons
- tailwindcss 3.4.17 — Utility-first CSS
- framer-motion 11.18.2 — Animation

**Forms:**
- react-hook-form 7.55.0 with @hookform/resolvers 3.10.0
- zod 3.24.2 — Schema validation for forms and shared type contracts

**Visualization:**
- @xyflow/react 12.8.4 — Node graph / ER diagram rendering
- recharts 2.15.2 — Chart components
- elkjs 0.10.0 — Graph layout algorithm (used alongside xyflow)
- @monaco-editor/react 4.7.0 / monaco-editor 0.55.1 — In-app code editor for DDL display and editing

**Layout:**
- react-resizable-panels 2.1.7 — Split-pane dashboard layout (`client/src/pages/Dashboard.tsx`)
- react-window 2.2.6 — Virtualized list rendering for large datasets

**Internationalization:**
- i18next 25.8.6 + react-i18next 16.5.4
- i18next-browser-languagedetector 8.2.1
- Locale files: `client/src/i18n/locales/ja.json`, `client/src/i18n/locales/zh.json`

**Theming:**
- next-themes 0.4.6 — Dark/light mode; toggle in `client/src/components/theme-toggle.tsx`

**Diffing:**
- diff 8.0.3 — Text diff computation for schema diff display

**Date:**
- date-fns 3.6.0

## Key Rust Dependencies

**Tauri Core + Plugins:**
- tauri 2.10.3 — Desktop shell and IPC runtime
- tauri-build 2.5.6 — Build-time code generation
- tauri-plugin-dialog 2 — Native file open/save dialogs
- tauri-plugin-opener 2 — Open URLs/files in the OS default application
- tauri-plugin-updater 2 — GitHub Releases auto-updater
- tauri-plugin-log 2 — Structured logging (active in debug builds only)

**Local Database / Storage:**
- rusqlite 0.31 (bundled feature) — Embedded SQLite for all local application state
  - Database file: `{app_data_dir}/db-schema-ddl.sqlite3`
  - Implementation: `src-tauri/src/storage.rs`

**External Database Connectivity:**
- sqlx 0.8 (runtime-tokio, mysql, postgres, macros features) — Async driver for user-configured MySQL and PostgreSQL connections
  - Implementation: `src-tauri/src/db_connector.rs`

**Excel Processing:**
- calamine 0.26 — Read `.xlsx`/`.xls` files
  - Implementation: `src-tauri/src/excel.rs`
- rust_xlsxwriter 0.79 — Write `.xlsx` workbook files
  - Implementation: `src-tauri/src/workbook_templates.rs`

**SQL Parsing:**
- sqlparser 0.53 — Parse SQL DDL statements for import/diff features
  - Implementation: `src-tauri/src/ddl_import.rs`

**Serialization:**
- serde 1.0 (derive) + serde_json 1.0 — All Tauri command request/response payloads

**Async Runtime:**
- tokio 1 (fs, io-util, sync, process, time, macros) — Async task execution and extension process management

**HTTP Client:**
- reqwest 0.12 (json, stream) — GitHub API calls and extension ZIP downloads

**Compression:**
- zip 2.4 (deflate) — DDL ZIP export and extension package install/unpack

**Cryptography:**
- sha2 0.10 — SHA-256 checksums for extension package integrity verification
- base64 0.22 — Binary payload encoding over Tauri IPC

**Utilities:**
- regex 1 — Pattern matching in DDL import processing
- chrono 0.4 (clock) — Timestamp handling
- thiserror 1 — Typed error enum derivation
- sysinfo 0.33 — Process memory metrics for `core_get_process_metrics` command
- urlencoding 2 — URL encode/decode utilities
- futures-util 0.3 — Async stream utilities for streaming download progress

## Build / Dev Tooling

**TypeScript:**
- `tsconfig.json` — strict mode compilation; path aliases `@/` → `client/src/`, `@shared/` → `shared/`
- Path aliases mirrored in `vite.config.ts` under `resolve.alias`

**CSS Build:**
- @tailwindcss/vite 4.1.18 + postcss 8.4.47 + autoprefixer 10.4.20
- @tailwindcss/typography 0.5.15

**Tauri CLI:**
- @tauri-apps/cli 2.10.1 — `npm run tauri:dev` / `npm run tauri:build`

**Vite Plugins:**
- @vitejs/plugin-react 4.7.0 — React fast refresh

**Dev Scripts:**
- `tsx` 4.20.5 — Run TypeScript utility scripts directly (e.g., `script/inspect_excel.ts`)
- `script/check-i18n-keys.mjs` — i18n key completeness check (`npm run check:i18n`)
- `esbuild 0.25.0` — Declared in devDependencies; used within the build pipeline

**Type Definitions:**
- @types/node 20.19.27, @types/react 18.3.11, @types/react-dom 18.3.1, @types/react-window 1.8.8, @types/diff 7.0.2

## Configuration

**Environment:**
- No `.env` files required for desktop runtime
- All runtime paths derived from Tauri `app_data_dir()`
- SQLite path: `{app_data_dir}/db-schema-ddl.sqlite3`
- Uploads directory: `{app_data_dir}/uploads/`

**Build Config Files:**
- `src-tauri/tauri.conf.json` — Window dimensions, bundle target, updater endpoints, CSP
- `vite.config.ts` — Frontend build output, dev server port (5000 on 127.0.0.1), path aliases
- `tsconfig.json` — TypeScript compiler options and path resolution

## Platform Requirements

**Development:**
- Node.js (for npm/Vite)
- Rust toolchain >= 1.77.2
- WebView2 runtime (Windows) or equivalent for the target OS

**Production:**
- Primary target: Windows (NSIS installer)
- Frontend assets output: `dist/public/` (served by Tauri WebView directly)
- No external server process; all logic runs in the Rust binary

---

*Stack analysis: 2026-03-24*
