import type { DbColumnSchema, DbDriver, DbTableSchema } from "@shared/schema";

// ──────────────────────────────────────────────
// Visual table designer model + DDL generation
//
// Pure, driver-aware logic that powers a Navicat-style table designer:
// - edit a structured TableDraft (columns / primary key / comments)
// - generate CREATE TABLE for a brand-new table
// - diff an introspected DbTableSchema against an edited draft to produce the
//   minimal ALTER TABLE statements (add / drop / rename / modify column, PK and
//   comment changes)
//
// Scope (this increment): columns, primary key, table + column comments, for
// MySQL and PostgreSQL. Index / foreign-key editing is a separate follow-up and
// is intentionally NOT diffed here so the generated DDL never silently drops
// constraints it does not understand.
// ──────────────────────────────────────────────

export interface TableDraftColumn {
  /** Stable id for UI row tracking; never emitted into DDL. */
  id: string;
  /** Name of this column in the source schema, if it already exists. */
  originalName?: string;
  name: string;
  /** Raw type expression as the operator typed it, e.g. "varchar(255)", "int". */
  dataType: string;
  nullable: boolean;
  primaryKey: boolean;
  /** Raw default expression/literal (already in SQL form), or undefined. */
  defaultValue?: string;
  comment?: string;
  autoIncrement?: boolean;
}

export interface TableDraftIndex {
  id: string;
  originalName?: string;
  name: string;
  columns: string[];
  unique: boolean;
}

export interface TableDraftForeignKey {
  id: string;
  originalName?: string;
  name: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
}

export interface TableDraft {
  name: string;
  comment?: string;
  columns: TableDraftColumn[];
  indexes?: TableDraftIndex[];
  foreignKeys?: TableDraftForeignKey[];
}

export interface TableDesignChange {
  /** Coarse category, useful for UI summaries and safety gating. */
  kind:
    | "create-table"
    | "add-column"
    | "drop-column"
    | "rename-column"
    | "modify-column"
    | "primary-key"
    | "index"
    | "foreign-key"
    | "comment";
  sql: string;
}

let draftColumnCounter = 0;

/** Deterministic-enough local id for draft rows (UI only, never persisted). */
function nextDraftColumnId(): string {
  draftColumnCounter += 1;
  return `col-${draftColumnCounter}`;
}

export function emptyTableDraft(): TableDraft {
  return { name: "", columns: [] };
}

export function emptyTableDraftColumn(): TableDraftColumn {
  return {
    id: nextDraftColumnId(),
    name: "",
    dataType: "varchar(255)",
    nullable: true,
    primaryKey: false,
  };
}

/** Build an editable draft from an introspected table so the designer opens populated. */
export function tableDraftFromSchema(schema: DbTableSchema): TableDraft {
  return {
    name: schema.name,
    comment: schema.comment,
    columns: schema.columns.map((column) => ({
      id: nextDraftColumnId(),
      originalName: column.name,
      name: column.name,
      dataType: column.dataType,
      nullable: column.nullable,
      primaryKey: column.primaryKey,
      defaultValue: column.defaultValue,
      comment: column.comment,
    })),
    // The primary-key index is represented by the columns' primaryKey flags and
    // handled separately, so it is excluded from the editable index list.
    indexes: (schema.indexes ?? [])
      .filter((index) => !index.primary)
      .map((index) => ({
        id: nextDraftColumnId(),
        originalName: index.name,
        name: index.name,
        columns: [...index.columns],
        unique: index.unique,
      })),
    foreignKeys: (schema.foreignKeys ?? []).map((fk) => ({
      id: nextDraftColumnId(),
      originalName: fk.name,
      name: fk.name,
      columns: [...fk.columns],
      referencedTable: fk.referencedTable,
      referencedColumns: [...fk.referencedColumns],
    })),
  };
}

// ── identifier / literal helpers ───────────────

export function quoteIdentifier(name: string, driver: DbDriver): string {
  const trimmed = name.trim();
  if (driver === "mysql") {
    return "`" + trimmed.replace(/`/g, "``") + "`";
  }
  return '"' + trimmed.replace(/"/g, '""') + '"';
}

export function escapeSqlStringLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function qualifiedTableName(
  table: string,
  driver: DbDriver,
  schemaName?: string,
): string {
  const quotedTable = quoteIdentifier(table, driver);
  const trimmedSchema = schemaName?.trim();
  return trimmedSchema
    ? `${quoteIdentifier(trimmedSchema, driver)}.${quotedTable}`
    : quotedTable;
}

function primaryKeyColumns(columns: TableDraftColumn[]): TableDraftColumn[] {
  return columns.filter((column) => column.primaryKey);
}

// ── column definition fragments ────────────────

/**
 * Inline column definition used inside CREATE TABLE and (MySQL) ADD/MODIFY.
 * MySQL carries the comment inline; PostgreSQL emits comments separately, so
 * pass includeComment=false for PostgreSQL.
 */
function columnDefinitionSql(
  column: TableDraftColumn,
  driver: DbDriver,
  includeComment: boolean,
): string {
  const parts: string[] = [
    quoteIdentifier(column.name, driver),
    column.dataType.trim(),
  ];

  if (!column.nullable) {
    parts.push("NOT NULL");
  }

  if (column.defaultValue !== undefined && column.defaultValue.trim() !== "") {
    parts.push(`DEFAULT ${column.defaultValue.trim()}`);
  }

  if (column.autoIncrement && driver === "mysql") {
    parts.push("AUTO_INCREMENT");
  }

  if (includeComment && driver === "mysql" && column.comment?.trim()) {
    parts.push(`COMMENT '${escapeSqlStringLiteral(column.comment.trim())}'`);
  }

  return parts.join(" ");
}

function createIndexSql(
  index: TableDraftIndex,
  table: string,
  driver: DbDriver,
): string {
  const columns = index.columns
    .map((column) => quoteIdentifier(column, driver))
    .join(", ");
  const unique = index.unique ? "UNIQUE " : "";
  return `CREATE ${unique}INDEX ${quoteIdentifier(index.name, driver)} ON ${table} (${columns});`;
}

function dropIndexSql(
  name: string,
  table: string,
  driver: DbDriver,
  schemaName?: string,
): string {
  if (driver === "mysql") {
    return `ALTER TABLE ${table} DROP INDEX ${quoteIdentifier(name, driver)};`;
  }
  // PostgreSQL indexes are schema-scoped objects, not table-scoped.
  const qualified = schemaName?.trim()
    ? `${quoteIdentifier(schemaName.trim(), driver)}.${quoteIdentifier(name, driver)}`
    : quoteIdentifier(name, driver);
  return `DROP INDEX ${qualified};`;
}

function addForeignKeySql(
  fk: TableDraftForeignKey,
  table: string,
  driver: DbDriver,
): string {
  const columns = fk.columns.map((column) => quoteIdentifier(column, driver)).join(", ");
  const referencedColumns = fk.referencedColumns
    .map((column) => quoteIdentifier(column, driver))
    .join(", ");
  const referencedTable = quoteIdentifier(fk.referencedTable, driver);
  return `ALTER TABLE ${table} ADD CONSTRAINT ${quoteIdentifier(fk.name, driver)} FOREIGN KEY (${columns}) REFERENCES ${referencedTable} (${referencedColumns});`;
}

function dropForeignKeySql(name: string, table: string, driver: DbDriver): string {
  return driver === "mysql"
    ? `ALTER TABLE ${table} DROP FOREIGN KEY ${quoteIdentifier(name, driver)};`
    : `ALTER TABLE ${table} DROP CONSTRAINT ${quoteIdentifier(name, driver)};`;
}

// ── CREATE TABLE ───────────────────────────────

export function buildCreateTableDdl(
  draft: TableDraft,
  driver: DbDriver,
  schemaName?: string,
): string {
  const table = qualifiedTableName(draft.name, driver, schemaName);
  const lines = draft.columns.map(
    (column) => `  ${columnDefinitionSql(column, driver, true)}`,
  );

  const pkColumns = primaryKeyColumns(draft.columns);
  if (pkColumns.length > 0) {
    const pkList = pkColumns
      .map((column) => quoteIdentifier(column.name, driver))
      .join(", ");
    lines.push(`  PRIMARY KEY (${pkList})`);
  }

  let createStmt = `CREATE TABLE ${table} (\n${lines.join(",\n")}\n)`;
  if (driver === "mysql" && draft.comment?.trim()) {
    createStmt += ` COMMENT='${escapeSqlStringLiteral(draft.comment.trim())}'`;
  }
  createStmt += ";";

  const statements = [createStmt];

  if (driver === "postgres") {
    if (draft.comment?.trim()) {
      statements.push(
        `COMMENT ON TABLE ${table} IS '${escapeSqlStringLiteral(draft.comment.trim())}';`,
      );
    }
    for (const column of draft.columns) {
      if (column.comment?.trim()) {
        statements.push(
          `COMMENT ON COLUMN ${table}.${quoteIdentifier(column.name, driver)} IS '${escapeSqlStringLiteral(column.comment.trim())}';`,
        );
      }
    }
  }

  for (const index of draft.indexes ?? []) {
    statements.push(createIndexSql(index, table, driver));
  }
  for (const fk of draft.foreignKeys ?? []) {
    statements.push(addForeignKeySql(fk, table, driver));
  }

  return statements.join("\n");
}

// ── ALTER diff ─────────────────────────────────

function columnComparable(column: DbColumnSchema): string {
  return JSON.stringify({
    dataType: column.dataType.trim().toLowerCase(),
    nullable: column.nullable,
    defaultValue: column.defaultValue?.trim() ?? null,
    comment: column.comment?.trim() ?? null,
  });
}

function draftColumnComparable(column: TableDraftColumn): string {
  return JSON.stringify({
    dataType: column.dataType.trim().toLowerCase(),
    nullable: column.nullable,
    defaultValue:
      column.defaultValue?.trim() ? column.defaultValue.trim() : null,
    comment: column.comment?.trim() ? column.comment.trim() : null,
  });
}

function postgresModifyStatements(
  table: string,
  original: DbColumnSchema,
  edited: TableDraftColumn,
): string[] {
  const col = quoteIdentifier(edited.name, "postgres");
  const out: string[] = [];

  if (original.dataType.trim().toLowerCase() !== edited.dataType.trim().toLowerCase()) {
    out.push(`ALTER TABLE ${table} ALTER COLUMN ${col} TYPE ${edited.dataType.trim()};`);
  }

  if (original.nullable !== edited.nullable) {
    out.push(
      edited.nullable
        ? `ALTER TABLE ${table} ALTER COLUMN ${col} DROP NOT NULL;`
        : `ALTER TABLE ${table} ALTER COLUMN ${col} SET NOT NULL;`,
    );
  }

  const originalDefault = original.defaultValue?.trim() ?? "";
  const editedDefault = edited.defaultValue?.trim() ?? "";
  if (originalDefault !== editedDefault) {
    out.push(
      editedDefault
        ? `ALTER TABLE ${table} ALTER COLUMN ${col} SET DEFAULT ${editedDefault};`
        : `ALTER TABLE ${table} ALTER COLUMN ${col} DROP DEFAULT;`,
    );
  }

  const originalComment = original.comment?.trim() ?? "";
  const editedComment = edited.comment?.trim() ?? "";
  if (originalComment !== editedComment) {
    out.push(
      editedComment
        ? `COMMENT ON COLUMN ${table}.${col} IS '${escapeSqlStringLiteral(editedComment)}';`
        : `COMMENT ON COLUMN ${table}.${col} IS NULL;`,
    );
  }

  return out;
}

/**
 * Diff an introspected table against an edited draft and produce the minimal
 * set of changes. Columns are matched by `originalName`; a column with no
 * `originalName` (or one whose `originalName` is absent from the source) is an
 * ADD, and any source column not referenced by some draft column is a DROP.
 */
export function diffTableDraft(
  original: DbTableSchema,
  edited: TableDraft,
  driver: DbDriver,
  schemaName?: string,
): TableDesignChange[] {
  const table = qualifiedTableName(original.name, driver, schemaName);
  const changes: TableDesignChange[] = [];

  const originalByName = new Map(original.columns.map((c) => [c.name, c]));
  const referencedOriginal = new Set<string>();

  for (const column of edited.columns) {
    const source =
      column.originalName !== undefined
        ? originalByName.get(column.originalName)
        : undefined;

    if (!source) {
      // New column.
      changes.push({
        kind: "add-column",
        sql: `ALTER TABLE ${table} ADD COLUMN ${columnDefinitionSql(column, driver, true)};`,
      });
      if (driver === "postgres" && column.comment?.trim()) {
        changes.push({
          kind: "comment",
          sql: `COMMENT ON COLUMN ${table}.${quoteIdentifier(column.name, driver)} IS '${escapeSqlStringLiteral(column.comment.trim())}';`,
        });
      }
      continue;
    }

    referencedOriginal.add(source.name);
    const renamed = source.name !== column.name;
    const redefined = columnComparable(source) !== draftColumnComparable(column);

    if (driver === "mysql") {
      // MySQL CHANGE/MODIFY restate the full definition; CHANGE also renames.
      if (renamed) {
        changes.push({
          kind: "rename-column",
          sql: `ALTER TABLE ${table} CHANGE COLUMN ${quoteIdentifier(source.name, driver)} ${columnDefinitionSql(column, driver, true)};`,
        });
      } else if (redefined) {
        changes.push({
          kind: "modify-column",
          sql: `ALTER TABLE ${table} MODIFY COLUMN ${columnDefinitionSql(column, driver, true)};`,
        });
      }
      continue;
    }

    // PostgreSQL: rename is its own statement, other edits are granular ALTERs.
    if (renamed) {
      changes.push({
        kind: "rename-column",
        sql: `ALTER TABLE ${table} RENAME COLUMN ${quoteIdentifier(source.name, driver)} TO ${quoteIdentifier(column.name, driver)};`,
      });
    }
    if (redefined) {
      for (const sql of postgresModifyStatements(table, source, column)) {
        changes.push({ kind: "modify-column", sql });
      }
    }
  }

  // Dropped columns: in the source but not referenced by any draft column.
  for (const source of original.columns) {
    if (!referencedOriginal.has(source.name)) {
      changes.push({
        kind: "drop-column",
        sql: `ALTER TABLE ${table} DROP COLUMN ${quoteIdentifier(source.name, driver)};`,
      });
    }
  }

  // Primary-key change (compare the ordered set of PK column names).
  const originalPk = original.columns
    .filter((c) => c.primaryKey)
    .map((c) => c.name);
  const editedPk = primaryKeyColumns(edited.columns).map((c) => c.name);
  if (JSON.stringify(originalPk) !== JSON.stringify(editedPk)) {
    if (originalPk.length > 0) {
      changes.push({
        kind: "primary-key",
        sql:
          driver === "mysql"
            ? `ALTER TABLE ${table} DROP PRIMARY KEY;`
            : `ALTER TABLE ${table} DROP CONSTRAINT ${quoteIdentifier(`${original.name}_pkey`, driver)};`,
      });
    }
    if (editedPk.length > 0) {
      const pkList = editedPk
        .map((name) => quoteIdentifier(name, driver))
        .join(", ");
      changes.push({
        kind: "primary-key",
        sql: `ALTER TABLE ${table} ADD PRIMARY KEY (${pkList});`,
      });
    }
  }

  // Table comment change.
  const originalTableComment = original.comment?.trim() ?? "";
  const editedTableComment = edited.comment?.trim() ?? "";
  if (originalTableComment !== editedTableComment) {
    changes.push({
      kind: "comment",
      sql:
        driver === "mysql"
          ? `ALTER TABLE ${table} COMMENT='${escapeSqlStringLiteral(editedTableComment)}';`
          : editedTableComment
            ? `COMMENT ON TABLE ${table} IS '${escapeSqlStringLiteral(editedTableComment)}';`
            : `COMMENT ON TABLE ${table} IS NULL;`,
    });
  }

  // Secondary indexes (the PK index is handled above). Match by originalName; a
  // changed index is dropped and recreated since most engines cannot alter one
  // in place.
  const originalIndexes = (original.indexes ?? []).filter((index) => !index.primary);
  const originalIndexByName = new Map(originalIndexes.map((index) => [index.name, index]));
  const referencedIndexes = new Set<string>();
  for (const index of edited.indexes ?? []) {
    const source =
      index.originalName !== undefined
        ? originalIndexByName.get(index.originalName)
        : undefined;
    if (!source) {
      changes.push({ kind: "index", sql: createIndexSql(index, table, driver) });
      continue;
    }
    referencedIndexes.add(source.name);
    const changed =
      source.name !== index.name ||
      source.unique !== index.unique ||
      JSON.stringify(source.columns) !== JSON.stringify(index.columns);
    if (changed) {
      changes.push({
        kind: "index",
        sql: dropIndexSql(source.name, table, driver, schemaName),
      });
      changes.push({ kind: "index", sql: createIndexSql(index, table, driver) });
    }
  }
  for (const source of originalIndexes) {
    if (!referencedIndexes.has(source.name)) {
      changes.push({
        kind: "index",
        sql: dropIndexSql(source.name, table, driver, schemaName),
      });
    }
  }

  // Foreign keys. Match by originalName; a changed FK is dropped and re-added.
  const originalFks = original.foreignKeys ?? [];
  const originalFkByName = new Map(originalFks.map((fk) => [fk.name, fk]));
  const referencedFks = new Set<string>();
  for (const fk of edited.foreignKeys ?? []) {
    const source =
      fk.originalName !== undefined ? originalFkByName.get(fk.originalName) : undefined;
    if (!source) {
      changes.push({ kind: "foreign-key", sql: addForeignKeySql(fk, table, driver) });
      continue;
    }
    referencedFks.add(source.name);
    const changed =
      source.name !== fk.name ||
      source.referencedTable !== fk.referencedTable ||
      JSON.stringify(source.columns) !== JSON.stringify(fk.columns) ||
      JSON.stringify(source.referencedColumns) !== JSON.stringify(fk.referencedColumns);
    if (changed) {
      changes.push({
        kind: "foreign-key",
        sql: dropForeignKeySql(source.name, table, driver),
      });
      changes.push({ kind: "foreign-key", sql: addForeignKeySql(fk, table, driver) });
    }
  }
  for (const source of originalFks) {
    if (!referencedFks.has(source.name)) {
      changes.push({
        kind: "foreign-key",
        sql: dropForeignKeySql(source.name, table, driver),
      });
    }
  }

  return changes;
}

/** Join a change list into a single executable script. */
export function tableDesignChangesToScript(changes: TableDesignChange[]): string {
  return changes.map((change) => change.sql).join("\n");
}
