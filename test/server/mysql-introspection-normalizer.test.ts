import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMySqlSchema } from "../../server/lib/extensions/db-management/schema-normalizer";
import type {
  MySqlColumnRow,
  MySqlIntrospectionPayload,
  MySqlKeyColumnUsageRow,
  MySqlReferentialConstraintRow,
  MySqlStatisticsRow,
  MySqlTableConstraintRow,
  MySqlTableRow,
} from "../../server/lib/extensions/db-management/mysql-introspection";
import type { DbConnectionRecord } from "../../shared/schema";

function createConnectionRecord(): DbConnectionRecord {
  return {
    id: 1,
    name: "Local MySQL",
    dialect: "mysql",
    host: "127.0.0.1",
    port: 3306,
    username: "root",
    passwordStored: true,
    passwordStorage: "safeStorage",
    encryptedPassword: "cipher",
    sslMode: "preferred",
    lastSelectedDatabase: "app_db",
    lastTestStatus: "ok",
    lastTestMessage: "Connected",
    lastTestedAt: "2026-03-17T00:00:00.000Z",
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:00:00.000Z",
  };
}

function createPayload(): MySqlIntrospectionPayload {
  const tables: MySqlTableRow[] = [
    {
      tableName: "posts",
      tableType: "BASE TABLE",
      engine: "InnoDB",
      tableComment: "Blog posts",
    } as MySqlTableRow,
    {
      tableName: "users",
      tableType: "BASE TABLE",
      engine: "InnoDB",
      tableComment: "App users",
    } as MySqlTableRow,
  ];

  const columns: MySqlColumnRow[] = [
    {
      tableName: "posts",
      columnName: "id",
      ordinalPosition: 1,
      dataType: "bigint",
      columnType: "bigint unsigned",
      isNullable: "NO",
      columnDefault: null,
      extra: "auto_increment",
      columnComment: "Post ID",
      characterMaximumLength: null,
      numericPrecision: 20,
      numericScale: 0,
    } as MySqlColumnRow,
    {
      tableName: "posts",
      columnName: "author_id",
      ordinalPosition: 2,
      dataType: "bigint",
      columnType: "bigint unsigned",
      isNullable: "NO",
      columnDefault: null,
      extra: "",
      columnComment: "Author",
      characterMaximumLength: null,
      numericPrecision: 20,
      numericScale: 0,
    } as MySqlColumnRow,
    {
      tableName: "posts",
      columnName: "title",
      ordinalPosition: 3,
      dataType: "varchar",
      columnType: "varchar(255)",
      isNullable: "NO",
      columnDefault: null,
      extra: "",
      columnComment: "Title",
      characterMaximumLength: 255,
      numericPrecision: null,
      numericScale: null,
    } as MySqlColumnRow,
    {
      tableName: "users",
      columnName: "id",
      ordinalPosition: 1,
      dataType: "bigint",
      columnType: "bigint unsigned",
      isNullable: "NO",
      columnDefault: null,
      extra: "auto_increment",
      columnComment: "User ID",
      characterMaximumLength: null,
      numericPrecision: 20,
      numericScale: 0,
    } as MySqlColumnRow,
    {
      tableName: "users",
      columnName: "email",
      ordinalPosition: 2,
      dataType: "varchar",
      columnType: "varchar(255)",
      isNullable: "NO",
      columnDefault: null,
      extra: "",
      columnComment: "Email",
      characterMaximumLength: 255,
      numericPrecision: null,
      numericScale: null,
    } as MySqlColumnRow,
  ];

  const tableConstraints: MySqlTableConstraintRow[] = [
    {
      tableName: "posts",
      constraintName: "PRIMARY",
      constraintType: "PRIMARY KEY",
    } as MySqlTableConstraintRow,
    {
      tableName: "posts",
      constraintName: "fk_posts_users",
      constraintType: "FOREIGN KEY",
    } as MySqlTableConstraintRow,
    {
      tableName: "users",
      constraintName: "PRIMARY",
      constraintType: "PRIMARY KEY",
    } as MySqlTableConstraintRow,
  ];

  const keyColumnUsage: MySqlKeyColumnUsageRow[] = [
    {
      tableName: "posts",
      constraintName: "PRIMARY",
      columnName: "id",
      ordinalPosition: 1,
      positionInUniqueConstraint: null,
      referencedTableSchema: null,
      referencedTableName: null,
      referencedColumnName: null,
    } as MySqlKeyColumnUsageRow,
    {
      tableName: "posts",
      constraintName: "fk_posts_users",
      columnName: "author_id",
      ordinalPosition: 1,
      positionInUniqueConstraint: 1,
      referencedTableSchema: "app_db",
      referencedTableName: "users",
      referencedColumnName: "id",
    } as MySqlKeyColumnUsageRow,
    {
      tableName: "users",
      constraintName: "PRIMARY",
      columnName: "id",
      ordinalPosition: 1,
      positionInUniqueConstraint: null,
      referencedTableSchema: null,
      referencedTableName: null,
      referencedColumnName: null,
    } as MySqlKeyColumnUsageRow,
  ];

  const referentialConstraints: MySqlReferentialConstraintRow[] = [
    {
      constraintName: "fk_posts_users",
      tableName: "posts",
      referencedTableName: "users",
      updateRule: "CASCADE",
      deleteRule: "RESTRICT",
    } as MySqlReferentialConstraintRow,
  ];

  const statistics: MySqlStatisticsRow[] = [
    {
      tableName: "posts",
      indexName: "PRIMARY",
      nonUnique: 0,
      seqInIndex: 1,
      columnName: "id",
      collation: "A",
      subPart: null,
      indexType: "BTREE",
    } as MySqlStatisticsRow,
    {
      tableName: "posts",
      indexName: "idx_posts_author_id",
      nonUnique: 1,
      seqInIndex: 1,
      columnName: "author_id",
      collation: "A",
      subPart: null,
      indexType: "BTREE",
    } as MySqlStatisticsRow,
    {
      tableName: "users",
      indexName: "PRIMARY",
      nonUnique: 0,
      seqInIndex: 1,
      columnName: "id",
      collation: "A",
      subPart: null,
      indexType: "BTREE",
    } as MySqlStatisticsRow,
    {
      tableName: "users",
      indexName: "uk_users_email",
      nonUnique: 0,
      seqInIndex: 1,
      columnName: "email",
      collation: "A",
      subPart: null,
      indexType: "BTREE",
    } as MySqlStatisticsRow,
  ];

  return {
    connection: createConnectionRecord(),
    databaseName: "app_db",
    tables,
    columns,
    tableConstraints,
    keyColumnUsage,
    referentialConstraints,
    statistics,
    capturedAt: "2026-03-17T00:00:00.000Z",
  };
}

test("normalizeMySqlSchema emits sorted canonical tables with PK, FK, and index metadata", () => {
  const schema = normalizeMySqlSchema(createPayload());

  assert.equal(schema.dialect, "mysql");
  assert.equal(schema.databaseName, "app_db");
  assert.deepEqual(schema.tables.map((table) => table.name), ["posts", "users"]);

  const posts = schema.tables[0];
  assert.equal(posts.comment, "Blog posts");
  assert.equal(posts.primaryKey?.name, "PRIMARY");
  assert.deepEqual(posts.primaryKey?.columns, ["id"]);
  assert.equal(posts.columns[0].autoIncrement, true);
  assert.equal(posts.columns[2].characterMaxLength, 255);

  assert.equal(posts.foreignKeys.length, 1);
  assert.equal(posts.foreignKeys[0].name, "fk_posts_users");
  assert.equal(posts.foreignKeys[0].referencedTableName, "users");
  assert.equal(posts.foreignKeys[0].updateRule, "CASCADE");
  assert.deepEqual(posts.foreignKeys[0].columnMappings, [
    {
      columnName: "author_id",
      referencedColumnName: "id",
    },
  ]);

  const users = schema.tables[1];
  assert.equal(users.indexes.length, 2);
  assert.equal(users.indexes[0].name, "PRIMARY");
  assert.equal(users.indexes[0].primary, true);
  assert.equal(users.indexes[1].name, "uk_users_email");
  assert.equal(users.indexes[1].unique, true);
});
