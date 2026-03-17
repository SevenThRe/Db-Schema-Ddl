# Codebase Stack

## Summary

This repository is a TypeScript monorepo-style desktop/web application for turning Japanese Excel database definition files into SQL DDL. It already ships as an Electron desktop app and also supports a web-style server/runtime layout.

## Runtime Stack

- Frontend: React 18, TypeScript, Vite, Wouter, TanStack React Query
- UI: Tailwind CSS, shadcn/ui, Radix UI, Lucide icons
- Backend: Express 5 on Node.js, bundled with esbuild
- Desktop shell: Electron 34 with preload bridge and electron-updater
- Persistence: SQLite in Electron mode via better-sqlite3, PostgreSQL in web mode via pg + Drizzle ORM
- Parsing: xlsx (SheetJS) plus custom Excel parsing pipeline
- Shared contract: Zod schemas and a typed route map in `shared/`

## Build and Packaging

- `npm run dev`: tsx-driven server development flow
- `npm run build`: builds client, server, worker, Electron main/preload
- `npm run build:electron`: production Electron packaging path
- `electron-builder` publishes releases to GitHub

## Important Technical Characteristics

- Shared API contract pattern: request and response schemas live in `shared/routes.ts`
- Shared domain schema pattern: cross-layer data models live in `shared/schema.ts`
- Bundled desktop server: Electron boots the Express server locally, then loads it in a BrowserWindow
- Optional storage backend: desktop uses SQLite, web can use PostgreSQL
- Existing schema diff pipeline: file-to-file diff, rename confirmation, ALTER preview/export

## Why It Matters For The New Extension Project

The stack is already favorable for a downloadable extension model because:

- Electron already manages GitHub-based distribution
- The app already has a local writable `userData` area for runtime data
- React + route contract patterns make it practical to mount a generic extension host
- Desktop SQLite storage is a good fit for extension install state and DB connection metadata

