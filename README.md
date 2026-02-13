# Database DDL Generator

A full-stack web application that parses Japanese Excel-based database definition documents (データベース定義書) and generates SQL DDL statements for MySQL or Oracle.

## Features

- 📁 Upload Excel files containing database definitions
- 📊 Browse and select sheets from uploaded files
- 🔍 Preview parsed table structures (columns, types, constraints)
- 🛠️ Generate DDL statements for MySQL or Oracle
- 📋 Copy generated DDL to clipboard
- 🎯 Support for multiple tables per sheet

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
```

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
