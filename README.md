# Database DDL Generator

A full-stack web application that parses Japanese Excel-based database definition documents (データベース定義書) and generates SQL DDL statements for MySQL or Oracle.

## Capability Overview

This project is no longer just "upload + generate DDL". It currently includes:

### Workspace and Input

- Upload Excel files by button or drag-and-drop
- Versioned file list (same filename can keep multiple revisions)
- Auto-restore last selected file and sheet
- Sheet search and jump (`Ctrl/Cmd + P`)
- Auto / Spreadsheet / Diff view modes in the center panel

### Parsing and Generation

- Parse multiple tables per sheet by Japanese labels (e.g. `論理テーブル名`, `物理テーブル名`)
- Generate MySQL or Oracle DDL
- Single output or per-table ZIP export
- SQL preview with syntax highlighting and copy action
- Region-based parsing from spreadsheet selection

### Guardrails and Repair

- Missing data type guard dialog with manual fill and size validation
- Name Fix quick gate before generation
- Full Name Fix workflow (preview/apply/rollback/job tracking/download)
- Export summary (selected/succeeded/skipped tables)

### Schema Diff and Incremental Delivery

- Diff current file vs historical version
- Rename confirmation workflow to reduce false positives
- ALTER preview and export
- Output control: single/multi-table, single file/ZIP, split by sheet

### Settings and Runtime Governance

- DDL, MySQL, export, parser, and Name Fix defaults
- Developer runtime guard settings (rate limit, queue, prewarm, concurrency)
- Electron integration (open external docs, update check, desktop update flow)

### API and Automation

- Typed API contract in `shared/routes.ts`
- File/sheet/table/search endpoints
- DDL generate/export endpoints
- Name Fix endpoints
- Schema Diff endpoints
- MCP server (`npm run mcp`) for agent automation

## Tech Stack

**Frontend:**
- React 18 + TypeScript
- Vite
- TanStack React Query
- shadcn/ui components
- Tailwind CSS

**Backend:**
- Node.js + Express
- TypeScript
- xlsx (SheetJS) for Excel parsing
- Drizzle ORM + PostgreSQL

## Prerequisites

- Node.js 18+
- PostgreSQL (optional - can run with in-memory storage for development)

## Quick Start

### Download (Windows)

- Releases page: [GitHub Releases](https://github.com/SevenThRe/Db-Schema-Ddl/releases)
- Latest installer (constant URL): [![Download Latest](https://img.shields.io/badge/Download-Latest-2ea44f?logo=github)](https://github.com/SevenThRe/Db-Schema-Ddl/releases/latest/download/DBSchemaExcel2DDL-Setup-latest.exe)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:5000`

3. **Build for production:**
   ```bash
   npm run build
   npm start
   ```

## Database Setup (Optional)

If you want to use PostgreSQL instead of in-memory storage:

1. Create a PostgreSQL database
2. Set the `DATABASE_URL` environment variable:
   ```bash
   export DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
   ```
3. Push the schema to your database:
   ```bash
   npm run db:push
   ```

## Excel File Format

The application expects Excel files with the following Japanese labels:

- **論理テーブル名** - Logical table name
- **物理テーブル名** - Physical table name
- **Column headers:**
  - `No` - Column number
  - `論理名` - Logical column name
  - `物理名` - Physical column name
  - `データ型` - Data type
  - `Size` - Size/Length
  - `Not Null` - NOT NULL constraint
  - `PK` - Primary key (marked with `〇`)
  - `備考` - Comments/Remarks

See `attached_assets/README.md` for detailed format requirements and examples.

## Scripts

```bash
npm run dev      # Start development server with HMR
npm run build    # Build for production
npm start        # Run production server
npm run check    # Type check
npm run db:push  # Sync database schema
npm run docs:dev   # Start Docusaurus docs site
npm run docs:build # Build Docusaurus docs site
npm run docs:serve # Serve docs build locally
```

## Documentation

- Source: `docs-site/`
- Local preview: `npm run docs:dev`
- Production (GitHub Pages): `https://seventhre.github.io/Db-Schema-Ddl/`
- Main entry: `docs-site/docs/manual-architecture.md`
- Full capability index: `docs-site/docs/component-capability-index.md`
- Schema Diff guide: `docs-site/docs/schema-diff-workflow.md`

## Project Structure

```
├── client/          # React frontend
├── server/          # Express backend
│   ├── lib/
│   │   ├── excel.ts # Excel parsing logic
│   │   └── ddl.ts   # DDL generation logic
│   └── routes.ts    # API endpoints
├── shared/          # Shared types and schemas
├── script/          # Build and utility scripts
└── attached_assets/ # Place your test Excel files here (git-ignored)
```

## License

MIT
