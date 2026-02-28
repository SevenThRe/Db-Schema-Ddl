import test from "node:test";
import assert from "node:assert/strict";
import { collectDdlGenerationWarnings, generateDDL } from "../../server/lib/ddl";

test("generateDDL remains stable when table and columns include sourceRef metadata", () => {
  const ddl = generateDDL({
    dialect: "mysql",
    tables: [
      {
        logicalTableName: "User",
        physicalTableName: "user_table",
        sourceRef: {
          sheetName: "Sheet1",
          physicalName: { sheetName: "Sheet1", row: 2, col: 1, address: "B3" },
        },
        columns: [
          {
            no: 1,
            logicalName: "ID",
            physicalName: "user_id",
            dataType: "varchar",
            size: "36",
            notNull: true,
            isPk: true,
            sourceRef: { sheetName: "Sheet1", row: 5, col: 2, address: "C6" },
          },
          {
            no: 2,
            logicalName: "Name",
            physicalName: "user_name",
            dataType: "varchar",
            size: "255",
            notNull: false,
            isPk: false,
            sourceRef: { sheetName: "Sheet1", row: 6, col: 2, address: "C7" },
          },
        ],
      },
    ],
  });

  assert.match(ddl, /CREATE TABLE\s+`user_table`/i);
  assert.match(ddl, /`user_id`\s+varchar\(36\).+NOT NULL/i);
  assert.match(ddl, /PRIMARY KEY\s+\(`user_id`\)/i);
});

test("generateDDL adds AUTO_INCREMENT when column autoIncrement is true", () => {
  const ddl = generateDDL({
    dialect: "mysql",
    tables: [
      {
        logicalTableName: "Order",
        physicalTableName: "order_table",
        columns: [
          {
            no: 1,
            logicalName: "ID",
            physicalName: "id",
            dataType: "bigint",
            notNull: true,
            isPk: true,
            autoIncrement: true,
          },
          {
            no: 2,
            logicalName: "Code",
            physicalName: "order_code",
            dataType: "varchar",
            size: "32",
            notNull: true,
          },
        ],
      },
    ],
  });

  assert.match(ddl, /`id`\s+bigint\s+NOT NULL\s+AUTO_INCREMENT/i);
  assert.match(ddl, /PRIMARY KEY\s+\(`id`\)/i);
});

test("generateDDL ignores AUTO_INCREMENT for non-PK or non-integer columns and emits warnings", () => {
  const request = {
    dialect: "mysql" as const,
    tables: [
      {
        logicalTableName: "BadAutoIncrement",
        physicalTableName: "bad_auto_increment",
        columns: [
          {
            no: 1,
            logicalName: "Code",
            physicalName: "code",
            dataType: "varchar",
            size: "64",
            notNull: true,
            isPk: true,
            autoIncrement: true,
          },
          {
            no: 2,
            logicalName: "Seq",
            physicalName: "seq_no",
            dataType: "int",
            notNull: true,
            isPk: false,
            autoIncrement: true,
          },
        ],
      },
    ],
  };

  const ddl = generateDDL(request);
  assert.doesNotMatch(ddl, /`code`[\s\S]*AUTO_INCREMENT/i);
  assert.doesNotMatch(ddl, /`seq_no`[\s\S]*AUTO_INCREMENT/i);

  const warnings = collectDdlGenerationWarnings(request);
  assert.equal(warnings.length, 2);
  assert.equal(warnings[0].code, "AUTO_INCREMENT_IGNORED");
  assert.equal(warnings[1].code, "AUTO_INCREMENT_IGNORED");
});
