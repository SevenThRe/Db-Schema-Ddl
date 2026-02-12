# replit.md

## Overview

This is a **Database Definition Document (DDL) Generator** — a full-stack web application that parses Japanese Excel-based database definition documents (データベース定義書) and generates SQL DDL statements (CREATE TABLE) for MySQL or Oracle. Users upload Excel files, browse sheets, preview parsed table structures (columns, types, primary keys, nullability), and generate DDL output they can copy.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

- **Framework:** React 18 with TypeScript, bundled by Vite
- **Routing:** Wouter (lightweight client-side router) — single main route (`/` → Dashboard)
- **State/Data Fetching:** TanStack React Query for server state management
- **UI Components:** shadcn/ui (new-york style) built on Radix UI primitives with Tailwind CSS
- **Animations:** Framer Motion for layout transitions
- **Layout:** Dashboard pattern with a fixed sidebar (file list + upload), a sheet selector panel, a table preview panel, and a DDL generator panel — all using resizable panels (`react-resizable-panels`)
- **Path Aliases:** `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend

- **Runtime:** Node.js with Express
- **Language:** TypeScript, executed via `tsx` in development
- **API Pattern:** RESTful JSON API under `/api/` prefix
- **File Upload:** Multer middleware, files stored in `uploads/` directory on disk (10MB limit)
- **Excel Parsing:** `xlsx` (SheetJS) library to read uploaded `.xlsx` files and extract table definitions by searching for Japanese labels (論理テーブル名, 物理テーブル名, etc.)
- **DDL Generation:** Custom server-side logic (`server/lib/ddl.ts`) that converts parsed table info into MySQL or Oracle CREATE TABLE statements
- **Dev Server:** Vite dev server integrated as Express middleware with HMR via `server/vite.ts`
- **Production:** Client built to `dist/public/`, server bundled with esbuild to `dist/index.cjs`

### Shared Code (`shared/`)

- **`schema.ts`** — Drizzle ORM table definitions (PostgreSQL) and Zod schemas for non-DB types (ColumnInfo, TableInfo, GenerateDdlRequest)
- **`routes.ts`** — API route contract definitions with paths, methods, and Zod response schemas; used by both client and server for type safety

### Database

- **ORM:** Drizzle ORM with PostgreSQL dialect
- **Connection:** `pg` Pool via `DATABASE_URL` environment variable
- **Schema:** Single table `uploaded_files` (id, file_path, original_name, uploaded_at)
- **Migrations:** Drizzle Kit with `drizzle-kit push` command (`db:push` script)
- **Storage Layer:** `DatabaseStorage` class in `server/storage.ts` implementing `IStorage` interface

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/files` | List all uploaded files |
| POST | `/api/files` | Upload an Excel file (multipart/form-data) |
| GET | `/api/files/:id/sheets` | Get sheet names from an uploaded file |
| GET | `/api/files/:id/sheets/:sheetName` | Parse and return table definitions from a sheet |
| POST | `/api/generate-ddl` | Generate DDL SQL from table definitions |

### Build System

- **Development:** `npm run dev` — runs tsx with Vite middleware for HMR
- **Production Build:** `npm run build` — Vite builds client, esbuild bundles server
- **Type Checking:** `npm run check` — TypeScript compiler with `noEmit`
- **Database Sync:** `npm run db:push` — pushes schema to database

## External Dependencies

- **PostgreSQL** — Primary database, connected via `DATABASE_URL` environment variable
- **Google Fonts** — Inter, JetBrains Mono, DM Sans, Fira Code, Geist Mono, Architects Daughter loaded via CDN
- **No external APIs** — All Excel parsing and DDL generation is done server-side without external service calls
- **Key npm packages:**
  - `xlsx` (SheetJS) — Excel file parsing
  - `drizzle-orm` + `drizzle-kit` — Database ORM and migrations
  - `multer` — File upload handling
  - `zod` + `drizzle-zod` — Runtime validation and schema generation
  - `framer-motion` — Client-side animations
  - `react-resizable-panels` — Resizable dashboard layout
  - `wouter` — Client-side routing
  - `@tanstack/react-query` — Server state management