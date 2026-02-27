# Performance Benchmarks

Last updated: **2026-02-27**

This document keeps repeatable benchmark commands and the latest sample results.
The goal is to make performance reporting easy for future release docs.

## 1) Environment

- OS: Windows
- CPU: Intel(R) Core(TM) i9-14900
- RAM: 31.7 GB
- Node.js: v22.19.0
- npm: 11.6.2

> Notes:
> - Numbers are machine-dependent.
> - Compare trends (before/after, cold/warm, concurrency shape), not only absolute values.

## 2) Benchmark Scripts (kept in repo)

- Excel parse benchmark: `script/benchmark-excel-parse.ts`
- DDL benchmark: `script/benchmark-ddl.ts`

NPM scripts:

```bash
npm run bench:excel -- --concurrency 1,3,5
npm run bench:ddl -- --rounds 300 --scales 100,500,1000
npm run bench:all
```

## 3) Excel Parse Benchmark

Command:

```bash
npm run bench:excel -- --concurrency 1,3,5
```

Sample file:

- Size: 4,345,304 bytes (~4.3 MB)
- Sheet count: 143

Latest result snapshot:

- Cold run wall time: **676.8 ms**
- Warm prime wall time: **149.4 ms**
- Warm cache hit wall time: **0.02 ms**
- Parse mode: **fast** (no sheet fallback)
- XLSX read stage (cold stats): **211.1 ms**

Concurrency:

- 1 concurrent request: wall **133.4 ms**
- 3 concurrent requests: wall **261.9 ms**
- 5 concurrent requests: wall **368.0 ms**

Interpretation:

- Main bottleneck from repeated workbook reads was removed.
- Warm cache is effectively instantaneous for repeated same-key requests.
- 3-5 concurrency stays sub-linear, no explosive latency growth in this sample.

## 4) DDL Generation Benchmark

Command:

```bash
npm run bench:ddl -- --rounds 300 --scales 100,500,1000
```

Latest result snapshot:

- Valid unique tables discovered from sample workbook: **138**
- Benchmark table set used: **120**
- Single-run MySQL DDL generation: **3.638 ms**
- Single-run Oracle DDL generation: **2.869 ms**
- Average MySQL generation over 300 rounds: **2.374 ms**

Synthetic scale test (30 columns/table):

- 100 tables: string build **4.102 ms**, stream write **4.410 ms**
- 500 tables: string build **20.674 ms**, stream write **19.901 ms**
- 1000 tables: string build **49.543 ms**, stream write **40.474 ms**

Interpretation:

- For small outputs, string build and stream are close.
- For large outputs, streaming tends to reduce memory pressure and can improve write time.
- Use stream response for huge outputs to avoid building one giant string in memory.

## 5) Streaming DDL Endpoint Usage

`POST /api/generate-ddl` supports streaming mode with query flag:

- `?stream=1` or `?stream=true`

Behavior:

- Streaming mode response: `text/plain; charset=utf-8` (chunked)
- Default mode response: JSON `{ "ddl": "..." }` (backward compatible)

Example:

```bash
curl -X POST "http://localhost:5000/api/generate-ddl?stream=1" \
  -H "Content-Type: application/json" \
  -d @request.json > output.sql
```

## 6) Suggested Reporting Template

When publishing release notes or docs, include:

1. Git commit hash
2. Benchmark commands
3. File characteristics (size/sheets/tables)
4. Cold + warm + concurrency results
5. Stream vs non-stream DDL result
6. Any config values changed (worker pool, cache TTL, cache entries)
