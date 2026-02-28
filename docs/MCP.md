# MCP Integration Guide

This project exposes an MCP server at `mcp/index.ts` for Excel-to-DDL operations and comment/reference exploration.

## Start MCP server

```bash
npm run mcp
```

Debug mode:

```bash
npm run mcp:debug
```

## MCP client configuration (Codex + Claude Code, Windows)

Use `cmd /c npx -y ...` on Windows for stable stdio startup.

- `cmd` helps resolve `.cmd` executables reliably.
- `-y` avoids interactive npm prompts.
- MCP protocol messages must stay on `stdout` only (this project logs to `stderr`).

### 1) Codex configuration

Edit:

- `C:/Users/<you>/.codex/config.toml`

Add:

```toml
[mcp_servers.ddl-generator]
type = "stdio"
command = "cmd"
args = ["/c", "npx", "-y", "tsx", "C:/Users/<you>/Downloads/Db-Schema-Ddl/mcp/index.ts"]
startup_timeout_sec = 20
tool_timeout_sec = 60
```

Then restart Codex (or start a new session) so the MCP registry is reloaded.

### 2) Claude Code configuration

Edit:

- `C:/Users/<you>/.claude.json`

Add this entry under top-level `mcpServers`:

```json
{
  "mcpServers": {
    "ddl-generator": {
      "type": "stdio",
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "tsx",
        "C:/Users/<you>/Downloads/Db-Schema-Ddl/mcp/index.ts"
      ],
      "startup_timeout_sec": 20,
      "tool_timeout_sec": 60
    }
  }
}
```

If your `.claude.json` already contains `mcpServers`, merge only the `ddl-generator` object into it.
After editing, restart Claude Code so it reconnects MCP servers with the new config.

### 3) Quick local smoke test

```bash
npm run mcp
```

Expected behavior: process stays running and waits for MCP stdio requests.

## Available tools

### 1) `list_excel_sheets`

Return sheet names from an Excel file.

**Input**

```json
{
  "filePath": "attached_assets/sample.xlsx"
}
```

### 2) `parse_excel_to_ddl`

Parse a sheet and generate DDL.  
Optional region fields can limit parsing scope.

`nameNormalization` controls physical name cleanup:

- `"none"` (default): keep parsed names as-is.
- `"snake_case"`: normalize invalid table/column physical names to snake_case.

**Input**

```json
{
  "filePath": "attached_assets/sample.xlsx",
  "sheetName": "テーブル定義",
  "dialect": "mysql",
  "nameNormalization": "none"
}
```

Normalization example:

```json
{
  "filePath": "attached_assets/sample.xlsx",
  "sheetName": "テーブル定義-社会",
  "dialect": "mysql",
  "nameNormalization": "snake_case"
}
```

Region mode example:

```json
{
  "filePath": "attached_assets/sample.xlsx",
  "sheetName": "テーブル定義",
  "startRow": 20,
  "endRow": 120,
  "startCol": 0,
  "endCol": 14,
  "dialect": "oracle"
}
```

Reference extraction example (preserve raw comments + custom rules):

```json
{
  "filePath": "attached_assets/sample.xlsx",
  "sheetName": "テーブル定義",
  "dialect": "mysql",
  "referenceExtraction": {
    "enabled": true,
    "rules": [
      {
        "source": "code_master",
        "pattern": "\\\\u30b3\\\\u30fc\\\\u30c9\\\\u30de\\\\u30b9\\\\u30bf(?:\\\\s*[.\\\\uFF0E:\\\\uFF1A]\\\\s*|\\\\s+)([A-Za-z][A-Za-z0-9_-]{1,})(?:\\\\s*[\\\\(\\\\uFF08]([^\\\\)\\\\uFF09]+)[\\\\)\\\\uFF09])?",
        "flags": "g",
        "codeIdGroup": 1,
        "optionsGroup": 2
      }
    ]
  }
}
```

### 3) `query_comment_references`

Explore comment/remark details for AI usage.  
Supports one-sheet or full-workbook scan and keeps raw comment text.  
Filter semantics are configurable via `sourceMatchMode` (`exact` | `contains`) and `codeIdMatchMode` (`contains` | `exact` | `starts_with`).

**Input**

```json
{
  "filePath": "attached_assets/sample.xlsx",
  "query": "SQS0068",
  "includeColumnsWithoutReferences": true,
  "maxResults": 200,
  "offset": 0
}
```

Single sheet example:

```json
{
  "filePath": "attached_assets/sample.xlsx",
  "sheetName": "テーブル定義-社会",
  "source": "code_master",
  "sourceMatchMode": "exact",
  "codeId": "SQS",
  "codeIdMatchMode": "starts_with"
}
```

Exact `codeId` match example:

```json
{
  "filePath": "attached_assets/sample.xlsx",
  "source": "code_master",
  "codeId": "SQS0068",
  "codeIdMatchMode": "exact"
}
```

### 4) `validate_excel_file`

Validate file existence/extension/size and return sheet summary.

**Input**

```json
{
  "filePath": "attached_assets/sample.xlsx"
}
```

### 5) `get_file_metadata`

Return metadata such as size and timestamps.

**Input**

```json
{
  "filePath": "attached_assets/sample.xlsx"
}
```

## Validation & safety

- Input arguments are validated with `zod`.
- Region parsing requires all region parameters together.
- Reference extraction rule safety:
  - `pattern` max length: `1000`
  - allowed regex flags: `g`, `i`, `m`, `s`, `u` (unique chars only)
- Excel files are restricted to:
  - extension: `.xlsx` / `.xls`
  - max size: `10 MB`

## Response format

All tools return structured JSON text:

```json
{
  "success": true,
  "data": {},
  "metadata": {
    "tool": "parse_excel_to_ddl",
    "processedAt": "2026-02-24T00:00:00.000Z",
    "durationMs": 123,
    "nameNormalization": "snake_case",
    "tableNamesChanged": 1,
    "columnNamesChanged": 0
  }
}
```

For `parse_excel_to_ddl`, the `data` payload also includes:

- `tables`: parsed (and optionally normalized) table definitions
- `ddl`: generated SQL text
- `normalization`: `{ mode, tableNamesChanged, columnNamesChanged }`

For `query_comment_references`, the `data` payload includes:

- `rows`: matched rows with `sheetName`, table/column names, `comment`, `commentRaw`, `codeReferences`, and `matchedReferences`
- `matchedRowCount` / `returnedRowCount` / `truncated`: query-result counters
- `filters`: normalized filter options used for this query (`query`, `source`, `sourceMatchMode`, `codeId`, `codeIdMatchMode`, `includeColumnsWithoutReferences`, `maxResults`, `offset`)

Notes:

- Raw comment text is preserved on each column as `commentRaw`.
- Structured extraction is additive; free-text remarks remain available even when no pattern matches.
