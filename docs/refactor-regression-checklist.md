# Refactor Regression Checklist

## Goal
Keep behavior stable while reducing maintenance cost from oversized modules.

## Baseline critical flows

### Name-fix workflow
1. `POST /api/name-fix/preview`
   - Request sample:
     - `fileIds`: `[1]`
     - `scope`: `"current_sheet"` or `"all_sheets"`
     - `currentSheetName`: `"Sheet1"`
     - strategy fields: `conflictStrategy`, `reservedWordStrategy`, `lengthOverflowStrategy`, `maxIdentifierLength`
   - Expected:
     - `planId`, `planHash`, `summary`, `files[]`
2. `POST /api/name-fix/apply`
   - Request sample:
     - `planId`: from preview
     - `mode`: `"copy"` or `"replace_download"` or `"overwrite"` (electron only)
   - Expected:
     - `jobId`, `status`, `summary`, `files[]`
3. `POST /api/name-fix/rollback`
   - Request sample:
     - `jobId`: from apply
   - Expected:
     - `success`, `restoredPath`, `message`

### DDL workflow
1. `POST /api/ddl/generate`
   - Expected: `{ ddl, warnings }`
2. `POST /api/ddl/generate-by-reference`
   - Expected: `{ ddl, warnings }`
3. `POST /api/ddl/export-zip`
   - Expected: zip stream + tolerant export headers
4. `POST /api/ddl/export-zip-by-reference`
   - Expected: zip stream + tolerant export headers

## Required gates (run for each refactor PR)
1. `npm run check`
2. `npm test`
3. `npm run check:i18n`

## Refactor risk points
1. Long table and file name rendering remains readable and stable.
2. `replace_download` mode still returns valid download token and file link.
3. Multi-file apply job status and success-failure aggregation remain stable.
4. Path and token logs keep masking and do not leak sensitive details.
5. API status code and error payload shape remain unchanged.

