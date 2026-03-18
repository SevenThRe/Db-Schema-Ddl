import type {
  DbColumn,
  DbForeignKey,
  DbIndex,
  DbPrimaryKey,
  DbSchemaCatalog,
  DbTable,
} from "@shared/schema";
import type {
  MySqlIntrospectionPayload,
  MySqlKeyColumnUsageRow,
  MySqlReferentialConstraintRow,
  MySqlStatisticsRow,
  MySqlTableConstraintRow,
} from "./mysql-introspection";

function tableConstraintKey(tableName: string, constraintName: string): string {
  return `${tableName}::${constraintName}`;
}

function toDbColumn(row: MySqlIntrospectionPayload["columns"][number]): DbColumn {
  return {
    name: row.columnName,
    ordinalPosition: row.ordinalPosition,
    dataType: row.dataType,
    columnType: row.columnType,
    nullable: row.isNullable === "YES",
    defaultValue: row.columnDefault,
    autoIncrement: String(row.extra ?? "").toLowerCase().includes("auto_increment"),
    comment: row.columnComment ?? undefined,
    characterMaxLength: row.characterMaximumLength ?? undefined,
    numericPrecision: row.numericPrecision ?? undefined,
    numericScale: row.numericScale ?? undefined,
  };
}

function buildPrimaryKey(
  tableName: string,
  tableConstraints: MySqlTableConstraintRow[],
  keyColumnUsage: MySqlKeyColumnUsageRow[],
): DbPrimaryKey | undefined {
  const primaryConstraint = tableConstraints.find(
    (constraint) => constraint.tableName === tableName && constraint.constraintType === "PRIMARY KEY",
  );
  if (!primaryConstraint) {
    return undefined;
  }

  const columns = keyColumnUsage
    .filter(
      (column) =>
        column.tableName === tableName &&
        column.constraintName === primaryConstraint.constraintName,
    )
    .sort((left, right) => left.ordinalPosition - right.ordinalPosition)
    .map((column) => column.columnName);

  if (columns.length === 0) {
    return undefined;
  }

  return {
    name: primaryConstraint.constraintName,
    columns,
  };
}

function buildForeignKeys(
  tableName: string,
  keyColumnUsage: MySqlKeyColumnUsageRow[],
  referentialConstraints: MySqlReferentialConstraintRow[],
): DbForeignKey[] {
  const grouped = new Map<string, MySqlKeyColumnUsageRow[]>();
  keyColumnUsage
    .filter((column) => column.tableName === tableName && column.referencedTableName)
    .forEach((column) => {
      const key = tableConstraintKey(column.tableName, column.constraintName);
      const list = grouped.get(key) ?? [];
      list.push(column);
      grouped.set(key, list);
    });

  return Array.from(grouped.entries())
    .map(([groupKey, columns]) => {
      const ref = referentialConstraints.find(
        (constraint) => tableConstraintKey(constraint.tableName, constraint.constraintName) === groupKey,
      );
      const sorted = columns.sort((left, right) => left.ordinalPosition - right.ordinalPosition);
      return {
        name: sorted[0].constraintName,
        referencedTableSchema: sorted[0].referencedTableSchema ?? undefined,
        referencedTableName: sorted[0].referencedTableName ?? "",
        updateRule: ref?.updateRule ?? undefined,
        deleteRule: ref?.deleteRule ?? undefined,
        columnMappings: sorted.map((column) => ({
          columnName: column.columnName,
          referencedColumnName: column.referencedColumnName ?? "",
        })),
      } satisfies DbForeignKey;
    })
    .filter((foreignKey) => foreignKey.referencedTableName && foreignKey.columnMappings.length > 0);
}

function buildIndexes(tableName: string, statistics: MySqlStatisticsRow[]): DbIndex[] {
  const grouped = new Map<string, MySqlStatisticsRow[]>();
  statistics
    .filter((row) => row.tableName === tableName)
    .forEach((row) => {
      const list = grouped.get(row.indexName) ?? [];
      list.push(row);
      grouped.set(row.indexName, list);
    });

  return Array.from(grouped.entries())
    .map(([indexName, rows]) => {
      const sorted = rows.sort((left, right) => left.seqInIndex - right.seqInIndex);
      return {
        name: indexName,
        unique: sorted[0].nonUnique === 0,
        primary: indexName === "PRIMARY",
        indexType: sorted[0].indexType ?? undefined,
        columns: sorted.map((row) => ({
          columnName: row.columnName,
          seqInIndex: row.seqInIndex,
          direction: row.collation ?? undefined,
          subPart: row.subPart ?? undefined,
        })),
      } satisfies DbIndex;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function normalizeMySqlSchema(
  payload: MySqlIntrospectionPayload,
): DbSchemaCatalog {
  const tables: DbTable[] = payload.tables.map((tableRow) => {
    const columns = payload.columns
      .filter((column) => column.tableName === tableRow.tableName)
      .sort((left, right) => left.ordinalPosition - right.ordinalPosition)
      .map(toDbColumn);

    return {
      name: tableRow.tableName,
      engine: tableRow.engine ?? undefined,
      comment: tableRow.tableComment ?? undefined,
      columns,
      primaryKey: buildPrimaryKey(tableRow.tableName, payload.tableConstraints, payload.keyColumnUsage),
      foreignKeys: buildForeignKeys(
        tableRow.tableName,
        payload.keyColumnUsage,
        payload.referentialConstraints,
      ),
      indexes: buildIndexes(tableRow.tableName, payload.statistics),
    };
  });

  return {
    dialect: "mysql",
    databaseName: payload.databaseName,
    tables: tables.sort((left, right) => left.name.localeCompare(right.name)),
    capturedAt: payload.capturedAt,
  };
}
