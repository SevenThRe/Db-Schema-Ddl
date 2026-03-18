import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultDdlSettings } from "../../shared/config";
import {
  collectDdlGenerationWarnings,
  generateDDL,
  streamDDL,
  substituteFilenameSuffix,
} from "../../server/lib/ddl";

function createMysqlSettings(overrides: Partial<ReturnType<typeof createDefaultDdlSettings>> = {}) {
  return {
    ...createDefaultDdlSettings(),
    ...overrides,
  };
}

test("substituteFilenameSuffix handles empty suffix and variable replacement", () => {
  const table = {
    logicalTableName: "User",
    physicalTableName: "user_table",
    columns: [],
  };

  assert.equal(substituteFilenameSuffix("", table, "author"), "");

  const replaced = substituteFilenameSuffix(
    "${logical_name}_${physical_name}_${author}",
    table,
    "",
  );
  assert.equal(replaced, "User_user_table_ISI");
});

test("generateDDL mysql applies custom header/settings and type mappings", () => {
  const settings = createMysqlSettings({
    includeCommentHeader: true,
    useCustomHeader: true,
    customHeaderTemplate: "${logical_name}\n${physical_name}\n${author}\n${date}",
    authorName: "",
    mysqlDataTypeCase: "upper",
    mysqlBooleanMode: "boolean",
    includeSetNames: true,
    includeDropTable: true,
    varcharCharset: "utf8mb4",
    varcharCollate: "utf8mb4_bin",
  });

  const ddl = generateDDL({
    dialect: "mysql",
    settings,
    tables: [
      {
        logicalTableName: "Owner's Table",
        physicalTableName: "owner_table",
        columns: [
          { physicalName: "id", logicalName: "Owner's Id", dataType: "bigint", isPk: true, notNull: true, autoIncrement: true },
          { physicalName: "name", logicalName: "Name", dataType: "varchar" },
          { physicalName: "name_char", logicalName: "NameChar", dataType: "char", size: "5" },
          { physicalName: "tiny_col", logicalName: "Tiny", dataType: "tinyint", size: "2" },
          { physicalName: "small_col", logicalName: "Small", dataType: "smallint" },
          { physicalName: "int_col", logicalName: "Int", dataType: "integer", size: "11" },
          { physicalName: "date_col", logicalName: "Date", dataType: "date" },
          { physicalName: "datetime_col", logicalName: "DateTime", dataType: "datetime", size: "6" },
          { physicalName: "timestamp_col", logicalName: "Timestamp", dataType: "timestamp" },
          { physicalName: "text_col", logicalName: "Text", dataType: "text" },
          { physicalName: "longtext_col", logicalName: "LongText", dataType: "longtext" },
          { physicalName: "mediumtext_col", logicalName: "MediumText", dataType: "mediumtext" },
          { physicalName: "decimal_col", logicalName: "Decimal", dataType: "numeric", size: "12,4" },
          { physicalName: "float_col", logicalName: "Float", dataType: "float", size: "7,2" },
          { physicalName: "double_col", logicalName: "Double", dataType: "double" },
          { physicalName: "bool_col", logicalName: "Boolean", dataType: "boolean" },
          { physicalName: "blob_col", logicalName: "Blob", dataType: "blob" },
          { physicalName: "json_col", logicalName: "Json", dataType: "json" },
        ],
      },
    ],
  });

  assert.match(ddl, /SET NAMES utf8mb4;/);
  assert.match(ddl, /DROP TABLE IF EXISTS `owner_table`;/);
  assert.match(ddl, /Owner's Table/);
  assert.match(ddl, / ISI/);
  assert.match(ddl, /`id`\s+BIGINT\s+NOT NULL\s+AUTO_INCREMENT\s+COMMENT 'Owner''s Id'/);
  assert.match(ddl, /`name`\s+VARCHAR\(255\)\s+CHARACTER SET utf8mb4 COLLATE utf8mb4_bin/);
  assert.match(ddl, /`bool_col`\s+BOOLEAN/);
  assert.match(ddl, /`json_col`\s+JSON/);
  assert.match(ddl, /PRIMARY KEY \(`id`\) USING BTREE/);
  assert.match(ddl, /COMMENT = 'Owner''s Table';/);
});

test("generateDDL oracle applies fallback header skip and oracle-specific mappings", () => {
  const settings = createMysqlSettings({
    includeCommentHeader: false,
    includeSetNames: false,
    includeDropTable: false,
  });

  const ddl = generateDDL({
    dialect: "oracle",
    settings,
    tables: [
      {
        logicalTableName: "Order",
        physicalTableName: "order_table",
        columns: [
          { physicalName: "id", logicalName: "Id", dataType: "bigint", isPk: true, notNull: true },
          { physicalName: "varchar_col", logicalName: "Varchar", dataType: "varchar" },
          { physicalName: "char_col", logicalName: "Char", dataType: "char" },
          { physicalName: "decimal_col", logicalName: "Decimal", dataType: "decimal" },
          { physicalName: "float_col", logicalName: "Float", dataType: "float" },
          { physicalName: "timestamp_col", logicalName: "Timestamp", dataType: "timestamp", size: "3" },
          { physicalName: "double_col", logicalName: "Double", dataType: "double" },
          { physicalName: "bool_col", logicalName: "Boolean", dataType: "bool" },
          { physicalName: "text_col", logicalName: "Text", dataType: "text" },
          { physicalName: "blob_col", logicalName: "Blob", dataType: "blob" },
        ],
      },
    ],
  });

  assert.doesNotMatch(ddl, /TableName:/);
  assert.match(ddl, /CREATE TABLE order_table \(/);
  assert.match(ddl, /id NUMBER NOT NULL,/);
  assert.match(ddl, /varchar_col VARCHAR2\(255\),/);
  assert.match(ddl, /char_col CHAR\(1\),/);
  assert.match(ddl, /decimal_col NUMBER\(10,2\),/);
  assert.match(ddl, /float_col FLOAT,/);
  assert.match(ddl, /timestamp_col TIMESTAMP\(3\),/);
  assert.match(ddl, /double_col BINARY_DOUBLE,/);
  assert.match(ddl, /bool_col NUMBER\(1\),/);
  assert.match(ddl, /text_col CLOB,/);
  assert.match(ddl, /blob_col BLOB/);
  assert.match(ddl, /CONSTRAINT pk_order_table PRIMARY KEY \(id\)/);
  assert.match(ddl, /COMMENT ON TABLE order_table IS 'Order';/);
});

test("streamDDL emits separator chunks between tables and matches generateDDL output", async () => {
  const request = {
    dialect: "mysql" as const,
    settings: createMysqlSettings({
      includeCommentHeader: false,
      includeSetNames: false,
      includeDropTable: false,
    }),
    tables: [
      {
        logicalTableName: "A",
        physicalTableName: "table_a",
        columns: [{ physicalName: "id", logicalName: "Id", dataType: "int", isPk: true, notNull: true }],
      },
      {
        logicalTableName: "B",
        physicalTableName: "table_b",
        columns: [{ physicalName: "id", logicalName: "Id", dataType: "int", isPk: true, notNull: true }],
      },
    ],
  };

  const chunks: string[] = [];
  await streamDDL(request, async (chunk) => {
    chunks.push(chunk);
    await Promise.resolve();
  });

  assert.equal(chunks.filter((chunk) => chunk === "\n\n").length, 1);
  assert.equal(chunks.join(""), generateDDL(request));
});

test("collectDdlGenerationWarnings reports dialect unsupported, fallback names, and ignored reasons", () => {
  const oracleWarnings = collectDdlGenerationWarnings({
    dialect: "oracle",
    tables: [
      {
        logicalTableName: "",
        physicalTableName: "",
        columns: [
          { logicalName: "", physicalName: "", dataType: "int", isPk: true, autoIncrement: true },
        ],
      },
    ],
  });
  assert.equal(oracleWarnings.length, 1);
  assert.equal(oracleWarnings[0].code, "AUTO_INCREMENT_DIALECT_UNSUPPORTED");
  assert.equal(oracleWarnings[0].tableName, "(unknown_table)");
  assert.equal(oracleWarnings[0].columnName, "(unknown_column)");
  assert.equal(oracleWarnings[0].reason, "dialect_unsupported");

  const mysqlWarnings = collectDdlGenerationWarnings({
    dialect: "mysql",
    tables: [
      {
        logicalTableName: "Warnings",
        physicalTableName: "warnings_table",
        columns: [
          { logicalName: "NoPk", physicalName: "no_pk", dataType: "int", autoIncrement: true, isPk: false },
          { logicalName: "NoNumeric", physicalName: "no_numeric", dataType: "varchar", size: "16", autoIncrement: true, isPk: true },
          { logicalName: "Eligible", physicalName: "eligible", dataType: "bigint", autoIncrement: true, isPk: true },
        ],
      },
    ],
  });

  assert.equal(mysqlWarnings.length, 3);
  assert.equal(mysqlWarnings[0].reason, "not_primary_key");
  assert.equal(mysqlWarnings[1].reason, "non_numeric_type");
  assert.equal(mysqlWarnings[2].reason, "pk_order_incompatible");
});
