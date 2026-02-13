# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DDL Generator — a full-stack TypeScript web application that parses Japanese Excel-based database definition documents (データベース定義書) and generates SQL DDL statements for MySQL or Oracle. The application handles multi-table Excel sheets by using a generator pattern to scan for specific Japanese labels (論理テーブル名, 物理テーブル名) that mark table boundaries.

## Development Commands

```bash
# Development server with HMR
npm run dev

# Production build (client + server bundle)
npm run build

# Run production server
npm start

# Type checking only
npm run check

# Database schema sync
npm run db:push
```

## Architecture Patterns

### Excel Parsing Algorithm (server/lib/excel.ts)

The core parsing logic uses a **generator pattern** (`findTablesInSheet`) to handle Excel sheets containing multiple table definitions:

1. **Table Boundary Detection**: Scans for `論理テーブル名` labels to identify where each table definition starts
2. **Header Row Discovery**: Searches forward from each table start to find the column header row (must contain: `No`, `論理名`, `物理名`, `データ型`)
3. **Column Mapping**: Builds a dynamic column index map from the header row to handle varying Excel layouts
4. **Next Table Detection**: Finds the next `論理テーブル名` to determine current table boundary
5. **Column Parsing**: Extracts rows between header and boundary, stopping at first empty `物理名` cell

When modifying parsing logic, understand that:
- Tables can appear at arbitrary row positions within a sheet
- Column headers may be in different column positions across sheets
- `getCellValue` searches right-then-down from labels to handle both horizontal and vertical layouts
- The `findCellRow` function performs a 2D scan, not just row iteration

### Type-Safe API Contract (shared/routes.ts)

The `shared/routes.ts` file defines a **centralized API contract** using Zod schemas that is consumed by BOTH client and server:
- Server uses it to validate requests/responses
- Client uses it for type inference and URL building via `buildUrl` helper
- Changes to API shape require updating only this single source of truth
- All endpoints, methods, and response schemas are statically typed

### Path Aliases

```
@/       → client/src/
@shared/ → shared/
```

These are configured in:
- TypeScript: `tsconfig.json` (paths)
- Vite: `vite.config.ts` (resolve.alias)

Always use these aliases for imports across the frontend and shared code.

### DDL Generation Dual-Dialect Pattern (server/lib/ddl.ts)

The `generateDDL` function supports both MySQL and Oracle through:
- **Separate generators**: `generateMySQL()` and `generateOracle()` with distinct formatting rules
- **Type mapping functions**: `mapDataTypeMySQL()` and `mapDataTypeOracle()` that convert generic data types (varchar, int, datetime, etc.) to dialect-specific types
- **Comment handling**: MySQL uses inline `COMMENT` clauses; Oracle uses separate `COMMENT ON` statements
- **PK constraints**: MySQL uses unnamed `PRIMARY KEY`; Oracle uses named constraints (e.g., `pk_tablename`)

When adding dialect support or modifying DDL output, these functions must stay in sync with expected Excel data type values.

### Storage Abstraction (server/storage.ts)

While currently implemented with PostgreSQL (`DatabaseStorage`), the `IStorage` interface allows swapping storage backends. The uploaded files are stored on disk (`uploads/` directory), while metadata is in the database.

## Frontend Architecture

### Component Hierarchy

```
App.tsx
└── Dashboard Layout (react-resizable-panels)
    ├── Sidebar (file list + upload)
    ├── SheetSelector (sheet list from selected file)
    ├── TablePreview (parsed column grid)
    └── DdlGenerator (dialect selector + DDL output)
```

Each panel component:
- Uses TanStack Query for server state (`useQuery`, `useMutation`)
- Derives its data from URL params or parent selection state
- Fetches independently (no prop drilling)

### State Management Strategy

- **Server State**: TanStack React Query (files list, sheet names, table data)
- **UI State**: React local state (selected file, selected sheet, selected dialect)
- **No global state library**: Data flows via React Query cache and URL parameters

## Debugging Tools

### Excel Inspection Script

```bash
tsx script/inspect_excel.ts
```

This script is configured to inspect a specific Excel file and sheet. When debugging Excel parsing issues:
1. Update the `filePath` and `sheetName` variables in the script
2. Run it to see the raw 2D array structure that the parser receives
3. Compare against the expected header positions and table boundaries

## Database Schema

**`uploaded_files` table**:
- `id` (serial, PK)
- `file_path` (text) — disk path to uploaded file
- `original_name` (text) — original filename from upload
- `uploaded_at` (timestamp)

Drizzle ORM is used for schema definition and migrations. To modify schema:
1. Edit `shared/schema.ts`
2. Run `npm run db:push` to sync with database

## Important Development Considerations

### Excel Parsing Edge Cases

- **Empty rows**: Parser stops at first row with empty `物理名`, so ensure test files don't have gaps
- **Column order**: Header detection requires exact matches for `No`, `論理名`, `物理名`, `データ型` but they can be in any column position
- **Multiple tables per sheet**: The generator pattern yields all tables sequentially; API returns an array
- **PK detection**: Uses exact match `'〇'` (Japanese circle character) in the `PK` column

### DDL Generation Constraints

- **SQL injection protection**: `escapeSql()` escapes single quotes in comments by doubling them (`'` → `''`)
- **Size parameter**: Passed as string (e.g., `"10,2"` for DECIMAL), not parsed or validated
- **Default fallbacks**: Missing data types default to `VARCHAR(255)` (MySQL) or `VARCHAR2(255)` (Oracle)

### Production Build

Production build creates:
- `dist/public/` — Static frontend assets (Vite build)
- `dist/index.cjs` — Bundled server (esbuild with CommonJS output)

The server serves static files from `dist/public/` in production mode, and uses Vite middleware in development.

## File Organization

- `client/` — React frontend
- `server/` — Express backend
- `shared/` — Types, schemas, and API contracts shared between client and server
- `script/` — Development utility scripts
- `uploads/` — Uploaded Excel files (not in git)
- `attached_assets/` — Test Excel files for development
