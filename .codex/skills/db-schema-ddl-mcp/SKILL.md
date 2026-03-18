---
name: db-schema-ddl-mcp
description: Use this project-specific skill when working with the Db-Schema-Ddl repository and the local `ddl-generator` MCP server, especially for validating Japanese Excel database definition files, listing workbook sheets, generating MySQL or Oracle DDL, exploring remarks/comment references, or deciding the correct MCP tool order for this project.
---

# DB Schema DDL MCP

Use the local `ddl-generator` MCP server configured by this repository.

## Follow this tool order

1. Call `inspect_excel_file` when the workbook path is new, user-provided, or uncertain.
2. Read the `sheets` returned by `inspect_excel_file` before choosing a target sheet.
3. Call `parse_excel_to_ddl` only after the target sheet is known.
4. Call `query_comment_references` for remarks, code master, or structured comment-reference exploration.

## Use these project rules

- Prefer project-relative paths under `attached_assets/` or `uploads/`.
- Treat workbook sheet names as authoritative; do not rename or translate them before lookup.
- Pass `startRow`, `endRow`, `startCol`, and `endCol` together when using region mode.
- Leave `referenceExtraction` unset unless the user explicitly asks for custom regex extraction.
- Leave `pkMarkers` unset unless the workbook uses something other than the default circle marker.

## Retry rules

- When `parse_excel_to_ddl` fails with DDL validation errors, retry once with `nameNormalization = "snake_case"` before recommending source Excel edits.
- When the user wants comment lookup across the workbook, prefer omitting `sheetName` in `query_comment_references`.
- When the user only needs a specific sheet, scope to that sheet to keep payloads smaller.

## Reporting rules

- Summarize which MCP tool or tools were used.
- Include the metadata that affects trust in the result: `sheetName`, `dialect`, `tableCount`, `parsedByRegion`, normalization changes when present, and `sheetCount` when the task starts with workbook inspection.
- Avoid dumping full `tables` arrays or full DDL unless the user explicitly asks for them.
- Quote `commentRaw` only when it is needed to explain a match or ambiguity.

## Scope

- Keep usage read-only. This MCP server inspects workbooks and generates output, but it does not modify the source Excel files.
- Respect the server's allowed-directory rules before suggesting paths outside the repository.
