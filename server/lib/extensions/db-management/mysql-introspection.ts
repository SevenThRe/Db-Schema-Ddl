import type { DbConnectionRecord } from "@shared/schema";
import type { RowDataPacket } from "mysql2/promise";
import { getDbConnectionRecordOrThrow, withMySqlConnection } from "./connection-service";

export interface MySqlTableRow extends RowDataPacket {
  tableName: string;
  tableType: string;
  engine: string | null;
  tableComment: string | null;
}

export interface MySqlColumnRow extends RowDataPacket {
  tableName: string;
  columnName: string;
  ordinalPosition: number;
  dataType: string;
  columnType: string;
  isNullable: "YES" | "NO";
  columnDefault: string | null;
  extra: string | null;
  columnComment: string | null;
  characterMaximumLength: number | null;
  numericPrecision: number | null;
  numericScale: number | null;
}

export interface MySqlTableConstraintRow extends RowDataPacket {
  tableName: string;
  constraintName: string;
  constraintType: string;
}

export interface MySqlKeyColumnUsageRow extends RowDataPacket {
  tableName: string;
  constraintName: string;
  columnName: string;
  ordinalPosition: number;
  positionInUniqueConstraint: number | null;
  referencedTableSchema: string | null;
  referencedTableName: string | null;
  referencedColumnName: string | null;
}

export interface MySqlReferentialConstraintRow extends RowDataPacket {
  constraintName: string;
  tableName: string;
  referencedTableName: string | null;
  updateRule: string | null;
  deleteRule: string | null;
}

export interface MySqlStatisticsRow extends RowDataPacket {
  tableName: string;
  indexName: string;
  nonUnique: number;
  seqInIndex: number;
  columnName: string;
  collation: "A" | "D" | null;
  subPart: number | null;
  indexType: string | null;
}

export interface MySqlIntrospectionPayload {
  connection: DbConnectionRecord;
  databaseName: string;
  tables: MySqlTableRow[];
  columns: MySqlColumnRow[];
  tableConstraints: MySqlTableConstraintRow[];
  keyColumnUsage: MySqlKeyColumnUsageRow[];
  referentialConstraints: MySqlReferentialConstraintRow[];
  statistics: MySqlStatisticsRow[];
  capturedAt: string;
}

export async function introspectMySqlDatabase(
  connectionId: number,
  databaseName: string,
): Promise<MySqlIntrospectionPayload> {
  const connection = await getDbConnectionRecordOrThrow(connectionId);
  return introspectMySqlDatabaseForConnection(connection, databaseName);
}

export async function introspectMySqlDatabaseForConnection(
  connection: DbConnectionRecord,
  databaseName: string,
): Promise<MySqlIntrospectionPayload> {
  return withMySqlConnection(connection, databaseName, async (client) => {
    const [tables] = await client.query<MySqlTableRow[]>(
      `SELECT TABLE_NAME AS tableName,
              TABLE_TYPE AS tableType,
              ENGINE AS engine,
              TABLE_COMMENT AS tableComment
         FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME`,
      [databaseName],
    );

    const [columns] = await client.query<MySqlColumnRow[]>(
      `SELECT TABLE_NAME AS tableName,
              COLUMN_NAME AS columnName,
              ORDINAL_POSITION AS ordinalPosition,
              DATA_TYPE AS dataType,
              COLUMN_TYPE AS columnType,
              IS_NULLABLE AS isNullable,
              COLUMN_DEFAULT AS columnDefault,
              EXTRA AS extra,
              COLUMN_COMMENT AS columnComment,
              CHARACTER_MAXIMUM_LENGTH AS characterMaximumLength,
              NUMERIC_PRECISION AS numericPrecision,
              NUMERIC_SCALE AS numericScale
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [databaseName],
    );

    const [tableConstraints] = await client.query<MySqlTableConstraintRow[]>(
      `SELECT TABLE_NAME AS tableName,
              CONSTRAINT_NAME AS constraintName,
              CONSTRAINT_TYPE AS constraintType
         FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME, CONSTRAINT_NAME`,
      [databaseName],
    );

    const [keyColumnUsage] = await client.query<MySqlKeyColumnUsageRow[]>(
      `SELECT TABLE_NAME AS tableName,
              CONSTRAINT_NAME AS constraintName,
              COLUMN_NAME AS columnName,
              ORDINAL_POSITION AS ordinalPosition,
              POSITION_IN_UNIQUE_CONSTRAINT AS positionInUniqueConstraint,
              REFERENCED_TABLE_SCHEMA AS referencedTableSchema,
              REFERENCED_TABLE_NAME AS referencedTableName,
              REFERENCED_COLUMN_NAME AS referencedColumnName
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`,
      [databaseName],
    );

    const [referentialConstraints] = await client.query<MySqlReferentialConstraintRow[]>(
      `SELECT CONSTRAINT_NAME AS constraintName,
              TABLE_NAME AS tableName,
              REFERENCED_TABLE_NAME AS referencedTableName,
              UPDATE_RULE AS updateRule,
              DELETE_RULE AS deleteRule
         FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = ?
        ORDER BY TABLE_NAME, CONSTRAINT_NAME`,
      [databaseName],
    );

    const [statistics] = await client.query<MySqlStatisticsRow[]>(
      `SELECT TABLE_NAME AS tableName,
              INDEX_NAME AS indexName,
              NON_UNIQUE AS nonUnique,
              SEQ_IN_INDEX AS seqInIndex,
              COLUMN_NAME AS columnName,
              COLLATION AS collation,
              SUB_PART AS subPart,
              INDEX_TYPE AS indexType
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
      [databaseName],
    );

    return {
      connection,
      databaseName,
      tables,
      columns,
      tableConstraints,
      keyColumnUsage,
      referentialConstraints,
      statistics,
      capturedAt: new Date().toISOString(),
    };
  });
}
