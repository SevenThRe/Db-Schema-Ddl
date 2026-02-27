# V1 Acceptance Checklist

Last updated: **2026-02-27**

## Scope Lock

V1 focuses on:

- upload Excel
- select sheet / select region
- parse tables
- generate DDL
- core performance and stability

V2 items (editing cells, advanced diff UI) are intentionally out of scope.

## Checklist

### A. Region-selection experience (Spreadsheet mode)

- [x] Drag selection no longer causes full-grid re-render on every mouse move
- [x] Selection overlay rendering decoupled from per-cell style updates
- [x] Row virtualization enabled (visible rows + overscan)
- [x] No TypeScript errors (`npm run check`)

### B. Parse pipeline performance

- [x] Single workbook read + bundle parsing path enabled
- [x] Cache hit path verified
- [x] Upload prewarm enabled with bounded queue/concurrency
- [x] Fallback kept automatic (no manual env toggle required)

### C. DDL generation

- [x] Normal JSON response remains backward-compatible
- [x] Streaming response (`?stream=1`) enabled for large outputs
- [x] Validation supports `json` column type
- [x] Spreadsheet region fallback table naming avoids `unnamed_table`

### D. DoS/stability safeguards

- [x] Executor queue max length guard
- [x] Parser busy response for overload scenario
- [x] Cache size budget (per-entry + total budget)
- [x] Upload rate limit window added
- [x] Prewarm queue/concurrency limits added

### E. File list usability (same filename versions)

- [x] Same-name files sorted by upload time (newest first in sidebar)
- [x] Version badge for same-name files (`v1`, `v2`, ...)
- [x] Timestamp shown to second precision
- [x] Short hash shown for easy differentiation (`#xxxxxxxx`)

## Verification Commands

```bash
npm run check
npm run bench:excel -- --concurrency 1,3,5
npm run bench:ddl -- --rounds 300 --scales 100,500,1000
```

## Notes for next release cycle

- Keep all benchmark scripts and outputs for release docs.
- For V2 diff panel, introduce a formal version model:
  - group key (same originalName or logical file key)
  - monotonically increasing version number
  - optional baseline linkage for diff comparisons.
