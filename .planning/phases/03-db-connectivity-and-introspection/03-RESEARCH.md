# Phase 3: DB Connectivity and Introspection - Research

**Date:** 2026-03-17
**Status:** Complete
**Scope:** MySQL-only connectivity, protected local credential storage, database selection, canonical live-schema ingestion

## Research Summary

Phase 3 should stay MySQL-first and use the extension host's existing Electron boundary instead of inventing a second runtime path. The safest and lowest-friction stack for this repo is:

- `mysql2/promise` for connection and pool management
- Electron `safeStorage` in the main process for remembered-password encryption
- local SQLite persistence for saved connection metadata and captured live-schema snapshots
- MySQL `INFORMATION_SCHEMA` queries for schema and object introspection
- a new canonical live-schema model in `shared/schema.ts`, not reuse of `TableInfo`

This combination fits the current stack:

- the app already runs privileged work through Electron main/preload bridges
- local persistence already lives in SQLite through Drizzle and `better-sqlite3`
- current diff logic is file-oriented, so live DB data needs a normalizing layer before later phases can compare it to Excel-derived snapshots

## Standard Stack

### Connectivity

- Use [`mysql2/promise`](https://sidorares.github.io/node-mysql2/docs/documentation/promise-wrapper) as the MySQL client.
- Use a pool for normal extension operations, not one ad hoc connection per click.
- Use parameterized queries for all metadata reads.

Why:

- `mysql2` already provides both direct connections and pools, with Promise wrappers for `createConnection`, `createPool`, `query`, and `execute` ([Quickstart](https://sidorares.github.io/node-mysql2/docs), [Promise Wrappers](https://sidorares.github.io/node-mysql2/docs/documentation/promise-wrapper)).
- Pooling reduces repeated connect overhead and matches the "remember password, reconnect quickly" product goal.
- The repo already uses async TypeScript service patterns, so Promise-based DB access is the natural fit.

### Credential protection

- Encrypt remembered passwords in Electron main process using [`safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage).
- Store only encrypted bytes plus metadata in local SQLite.
- Decrypt only inside privileged code paths used for test/connect/introspect actions.

Why:

- Electron documents `safeStorage` as OS-backed local string encryption for disk storage, with Windows using DPAPI and Electron 34 supporting `isEncryptionAvailable`, `encryptString`, and `decryptString`.
- This repo already centralizes privileged flows in Electron main/preload and does not expose raw OS APIs to the renderer.
- On Windows, this is the best match for your current packaged target and avoids introducing an extra native secret-store dependency.

### Database selection

- Persist a saved server connection independently from the currently selected MySQL `database`.
- After authenticating, list databases from `INFORMATION_SCHEMA.SCHEMATA` and allow switching inside the `DB 管理` module.
- Cache the most recently selected database per saved connection for quick return.

Why:

- MySQL documents that schemas are databases and exposes them through `INFORMATION_SCHEMA.SCHEMATA`.
- The user explicitly wants server-level connect first and in-module database switching after connect.

### Introspection source of truth

- Use `INFORMATION_SCHEMA` as the primary introspection source.
- Read at least these tables:
  - `SCHEMATA`
  - `TABLES`
  - `COLUMNS`
  - `TABLE_CONSTRAINTS`
  - `KEY_COLUMN_USAGE`
  - `REFERENTIAL_CONSTRAINTS`
  - `STATISTICS`
- Limit reads to the selected database and base tables.

Why:

- Official MySQL docs define the exact columns needed for database names, table comments/types, column nullability/defaults/comments/auto-increment flags, constraint membership, FK targets, FK update/delete rules, and index uniqueness/order.
- This keeps the Phase 3 model aligned with later diff/deploy needs without prematurely introspecting views, procedures, or triggers.

### Persistence

- Add extension-owned SQLite tables for:
  - saved DB connections
  - selected-database preferences
  - live-schema snapshots
  - optional introspection cache metadata
- Keep these tables inside the existing app SQLite database, but namespace them clearly as extension data.

Why:

- The repo already initializes and migrates local SQLite centrally.
- Phase 4 and Phase 5 will need snapshots and baseline context anyway, so Phase 3 should establish the storage shape now.

## Architecture Patterns

### 1. Keep secrets in Electron privilege boundary

Recommended pattern:

- Renderer collects form input.
- Preload exposes a narrow typed API.
- Electron main performs `safeStorage` encryption and any direct secret handling.
- Server/storage layer only receives encrypted payloads and secret metadata unless a live connection action requires decrypted credentials.

Why this pattern fits:

- Electron security guidance emphasizes narrow preload exposure, validating IPC senders, and avoiding broad API exposure to renderers.
- Your current app already uses `contextIsolation: true`, `nodeIntegration: false`, and typed preload bridges in [electron/main.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/electron/main.ts) and [electron/preload.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/electron/preload.ts).

### 2. Separate "saved connection" from "active database session"

Recommended model:

- `SavedDbConnection`
  - host
  - port
  - username
  - ssl mode
  - encrypted password blob
  - optional last selected database
- `ActiveDbSelection`
  - connection id
  - selected database
  - last tested at / last introspected at

Why:

- It matches the user requirement to switch databases inside the module after connecting.
- It avoids creating duplicate saved connections per database on the same server.

### 3. Introduce a canonical live-schema model

Recommended approach:

- Do not extend `TableInfo` to represent live DB objects.
- Introduce a new canonical model such as:
  - `DbSchemaCatalog`
  - `DbTable`
  - `DbColumn`
  - `DbPrimaryKey`
  - `DbForeignKey`
  - `DbIndex`
  - `DbUniqueConstraint`

Why:

- `TableInfo` is optimized for Excel extraction and contains parsing/source-range concerns that do not belong to live DB introspection.
- The current diff engine in [server/lib/schema-diff.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/server/lib/schema-diff.ts) normalizes file-derived structures; Phase 3 should output a stable live-schema model that Phase 4 can adapt into diff input, rather than force live DB data into worksheet semantics.

### 4. Build introspection as a staged adapter

Recommended service split:

- `connection-service`
  - create/edit/delete/test saved connections
  - list accessible databases
- `credential-service`
  - encrypt/decrypt remembered secrets
- `mysql-introspection-service`
  - fetch raw metadata rows
  - normalize rows into canonical model
- `snapshot-service`
  - hash and persist canonical live-schema snapshots

Why:

- This repo already favors service-level separation instead of giant route files.
- It makes later Oracle or other dialect work a new adapter, not a rewrite.

## Don't Hand-Roll

- Do not hand-roll encryption. Use Electron `safeStorage`.
- Do not hand-roll a TCP/MySQL protocol client. Use `mysql2/promise`.
- Do not hand-roll table parsing from `SHOW CREATE TABLE` for v1. Use `INFORMATION_SCHEMA` first.
- Do not store remembered passwords in plain text or reversible JSON blobs in renderer state.
- Do not overload `TableInfo` with FK/index/comment structures it was never designed to represent.
- Do not make the renderer own live credentials or raw DB driver instances.

## Common Pitfalls

### 1. Binding one saved connection to one database too early

Risk:

- This conflicts with the user decision to switch databases from inside the module.
- It leads to duplicate connection rows and clumsy UX.

Recommendation:

- Treat database selection as module state linked to, but separate from, the saved connection.

### 2. Treating `COLUMN_KEY` as the full index/constraint truth

Risk:

- MySQL documents `COLUMN_KEY` as a summarized indicator with priority rules (`PRI`, `UNI`, `MUL`), not a full model of all constraints or composite indexes.

Recommendation:

- Use `TABLE_CONSTRAINTS`, `KEY_COLUMN_USAGE`, and `STATISTICS` together.

### 3. Failing to scope metadata queries to the selected database

Risk:

- `SCHEMATA` visibility depends on privileges, and wide metadata reads can surface unnecessary objects or hit performance issues.

Recommendation:

- Always parameterize on the selected schema/database and restrict table reads to `BASE TABLE`.

### 4. Exposing privileged Electron APIs too broadly

Risk:

- Electron warns against exposing raw IPC/Electron APIs to renderers and recommends validating IPC senders.

Recommendation:

- Keep preload APIs narrow and typed, and add only the minimal DB-management bridges needed for Phase 3.

### 5. Forgetting Windows-targeted assumptions

Risk:

- The current product ships Windows-only Electron installers, and your extension delivery path is already Windows-leaning.
- Planning Linux/macOS secret-store or driver edge cases into Phase 3 would bloat the slice.

Recommendation:

- Optimize Phase 3 for Windows packaging and MySQL server reachability first; keep later portability as extension points, not initial blockers.

## Code Examples

### Example: safeStorage-backed remembered password flow

```ts
// Electron main only
import { safeStorage } from "electron";

export function encryptPassword(plainText: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS-backed encryption unavailable");
  }

  return safeStorage.encryptString(plainText).toString("base64");
}

export function decryptPassword(cipherTextBase64: string): string {
  const bytes = Buffer.from(cipherTextBase64, "base64");
  return safeStorage.decryptString(bytes);
}
```

### Example: pooled MySQL metadata access

```ts
import mysql from "mysql2/promise";

export async function listDatabases(config: mysql.PoolOptions) {
  const pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 4,
    queueLimit: 0,
  });

  try {
    const [rows] = await pool.query(
      `SELECT SCHEMA_NAME
         FROM INFORMATION_SCHEMA.SCHEMATA
        ORDER BY SCHEMA_NAME`,
    );
    return rows;
  } finally {
    await pool.end();
  }
}
```

### Example: minimum metadata query set for selected database

```sql
SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_COMMENT
  FROM INFORMATION_SCHEMA.TABLES
 WHERE TABLE_SCHEMA = ?
   AND TABLE_TYPE = 'BASE TABLE';

SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, DATA_TYPE, COLUMN_TYPE,
       IS_NULLABLE, COLUMN_DEFAULT, EXTRA, COLUMN_COMMENT
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = ?
 ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
 WHERE TABLE_SCHEMA = ?;

SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, ORDINAL_POSITION,
       POSITION_IN_UNIQUE_CONSTRAINT, REFERENCED_TABLE_SCHEMA,
       REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
 WHERE TABLE_SCHEMA = ?;

SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME,
       UPDATE_RULE, DELETE_RULE
  FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA = ?;

SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME,
       COLLATION, SUB_PART
  FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = ?
 ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
```

## Recommended Plan Shape

Phase 3 should probably plan into 3 or 4 chunks:

1. Shared schema and persistence foundation
   - canonical live-schema contracts
   - saved connection tables
   - encrypted secret metadata
   - snapshot tables
2. Electron/server connection and credential services
   - safeStorage bridge
   - connection CRUD/test/list-databases APIs
3. MySQL introspection adapter
   - metadata queries
   - canonical normalization
   - snapshot persistence
4. Module UI inside `DB 管理`
   - saved connections
   - test connection
   - switch database
   - trigger introspection

## Validation Architecture

Phase 3 should be validated with a mixed strategy:

- `npm run check` after each task-level change to shared contracts, Electron bridge, and extension routes
- `npm test` after each wave
- new Wave 0 tests for:
  - credential encryption/decryption service behavior
  - saved connection/storage contract behavior
  - MySQL metadata normalization into canonical schema
  - DB 管理 connection-management UI states

Manual validation is still needed for:

- "remember password" UX clarity
- database switch discoverability inside the module
- failure messaging for bad credentials versus unreachable host

## Confidence

- Electron `safeStorage` choice: high
- `mysql2/promise` choice: high
- INFORMATION_SCHEMA-first introspection: high
- exact canonical model shape: medium-high
- whether snapshots should be persisted pre-diff versus on-demand: medium

## Sources

- Electron `safeStorage`: [electronjs.org/docs/latest/api/safe-storage](https://www.electronjs.org/docs/latest/api/safe-storage)
- Electron security guidance: [electronjs.org/docs/latest/tutorial/security](https://www.electronjs.org/docs/latest/tutorial/security)
- MySQL `SCHEMATA`: [dev.mysql.com/doc/refman/8.0/en/information-schema-schemata-table.html](https://dev.mysql.com/doc/refman/8.0/en/information-schema-schemata-table.html)
- MySQL `TABLES`: [dev.mysql.com/doc/refman/8.0/en/information-schema-tables-table.html](https://dev.mysql.com/doc/refman/8.0/en/information-schema-tables-table.html)
- MySQL `COLUMNS`: [dev.mysql.com/doc/refman/8.0/en/information-schema-columns-table.html](https://dev.mysql.com/doc/refman/8.0/en/information-schema-columns-table.html)
- MySQL `TABLE_CONSTRAINTS`: [dev.mysql.com/doc/refman/8.0/en/information-schema-table-constraints-table.html](https://dev.mysql.com/doc/refman/8.0/en/information-schema-table-constraints-table.html)
- MySQL `KEY_COLUMN_USAGE`: [dev.mysql.com/doc/refman/8.0/en/information-schema-key-column-usage-table.html](https://dev.mysql.com/doc/refman/8.0/en/information-schema-key-column-usage-table.html)
- MySQL `REFERENTIAL_CONSTRAINTS`: [dev.mysql.com/doc/refman/8.0/en/information-schema-referential-constraints-table.html](https://dev.mysql.com/doc/refman/8.0/en/information-schema-referential-constraints-table.html)
- MySQL `STATISTICS`: [dev.mysql.com/doc/refman/8.0/en/information-schema-statistics-table.html](https://dev.mysql.com/doc/refman/8.0/en/information-schema-statistics-table.html)
- MySQL2 quickstart: [sidorares.github.io/node-mysql2/docs](https://sidorares.github.io/node-mysql2/docs)
- MySQL2 Promise wrappers: [sidorares.github.io/node-mysql2/docs/documentation/promise-wrapper](https://sidorares.github.io/node-mysql2/docs/documentation/promise-wrapper)
