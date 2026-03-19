import test from "node:test";
import assert from "node:assert/strict";
import {
  DdlValidationError,
  normalizeDataTypeAndSize,
  validateGenerateDdlRequest,
} from "../../server/lib/ddl-validation";

test("normalizeDataTypeAndSize normalizes inline type/size and fallback inputs", () => {
  assert.deepEqual(
    normalizeDataTypeAndSize(" DECIMAL（ 12， 3 ） ", undefined),
    { type: "decimal", size: "12, 3" },
  );

  assert.deepEqual(
    normalizeDataTypeAndSize(undefined, " 255 "),
    { type: undefined, size: "255" },
  );

  assert.deepEqual(
    normalizeDataTypeAndSize("varchar(20", "30"),
    { type: "varchar(20", size: "30" },
  );
});

test("validateGenerateDdlRequest aggregates identifier and datatype issues", () => {
  const request = {
    dialect: "mysql" as const,
    tables: [
      {
        logicalTableName: "Broken",
        physicalTableName: "bad-name",
        columns: [
          { logicalName: "Id", physicalName: "id", dataType: "bigint", isPk: true },
          { logicalName: "Dup", physicalName: "dup_col", dataType: "varchar", size: "16" },
          { logicalName: "Dup2", physicalName: "DUP_COL", dataType: "varchar", size: "16" },
          { logicalName: "Bad Name", physicalName: "bad column", dataType: "varchar", size: "16" },
          { logicalName: "MissingType", physicalName: "missing_type", dataType: "   " },
          { logicalName: "Unsupported", physicalName: "unsupported_type", dataType: "uuid" },
          { logicalName: "Conflict", physicalName: "size_conflict", dataType: "varchar(20)", size: "30" },
          { logicalName: "InvalidSize", physicalName: "invalid_size", dataType: "varchar", size: "x,y" },
          { logicalName: "NoSizeType", physicalName: "date_with_size", dataType: "date", size: "10" },
          { logicalName: "IntegerOnly", physicalName: "varchar_pair", dataType: "varchar", size: "10,2" },
        ],
      },
      {
        logicalTableName: "DuplicateOne",
        physicalTableName: "users",
        columns: [{ logicalName: "Id", physicalName: "id", dataType: "int", isPk: true }],
      },
      {
        logicalTableName: "DuplicateTwo",
        physicalTableName: "USERS",
        columns: [{ logicalName: "Id", physicalName: "id2", dataType: "int", isPk: true }],
      },
      {
        logicalTableName: "EmptyColumns",
        physicalTableName: "empty_columns",
        columns: [],
      },
    ],
  };

  let captured: DdlValidationError | null = null;
  try {
    validateGenerateDdlRequest(request);
    assert.fail("expected DdlValidationError");
  } catch (error) {
    assert.ok(error instanceof DdlValidationError);
    captured = error;
  }

  assert.ok(captured);
  const issueCodes = new Set(captured.issues.map((issue) => issue.issueCode));
  assert.ok(issueCodes.has("INVALID_TABLE_NAME"));
  assert.ok(issueCodes.has("DUPLICATE_TABLE_NAME"));
  assert.ok(issueCodes.has("EMPTY_COLUMNS"));
  assert.ok(issueCodes.has("INVALID_COLUMN_NAME"));
  assert.ok(issueCodes.has("DUPLICATE_COLUMN_NAME"));
  assert.ok(issueCodes.has("MISSING_DATA_TYPE"));
  assert.ok(issueCodes.has("UNSUPPORTED_DATA_TYPE"));
  assert.ok(issueCodes.has("CONFLICTING_SIZE_DEFINITIONS"));
  assert.ok(issueCodes.has("INVALID_SIZE_FORMAT"));
  assert.ok(issueCodes.has("TYPE_MUST_NOT_INCLUDE_SIZE"));
  assert.ok(issueCodes.has("TYPE_ONLY_ACCEPTS_INTEGER_SIZE"));
  assert.match(captured.message, /DDL validation failed with/);
});

test("DdlValidationError message supports empty and table-only issue payloads", () => {
  const empty = new DdlValidationError([]);
  assert.equal(empty.message, "DDL validation failed.");

  const tableOnly = new DdlValidationError([
    {
      issueCode: "DUPLICATE_TABLE_NAME",
      tableName: "users",
      field: "tableName",
      message: "duplicate table",
    },
  ]);
  assert.match(tableOnly.message, /table "users"/);
  assert.doesNotMatch(tableOnly.message, /column "/);
});

test("validateGenerateDdlRequest accepts a valid request", () => {
  assert.doesNotThrow(() =>
    validateGenerateDdlRequest({
      dialect: "oracle",
      tables: [
        {
          logicalTableName: "User",
          physicalTableName: "user_table",
          columns: [
            { logicalName: "Id", physicalName: "id", dataType: "bigint", isPk: true, notNull: true },
            { logicalName: "Name", physicalName: "name", dataType: "varchar", size: "64" },
            { logicalName: "Price", physicalName: "price", dataType: "decimal", size: "10,2" },
          ],
        },
      ],
    }),
  );
});

test("validateGenerateDdlRequest allows boolean size 1 for MySQL compatibility", () => {
  assert.doesNotThrow(() =>
    validateGenerateDdlRequest({
      dialect: "mysql",
      tables: [
        {
          logicalTableName: "ProcessResults",
          physicalTableName: "process_results",
          columns: [
            { logicalName: "Unread", physicalName: "is_unread", dataType: "boolean", size: "1" },
          ],
        },
      ],
    }),
  );
});

test("validateGenerateDdlRequest still rejects boolean sizes above 1", () => {
  let captured: DdlValidationError | null = null;

  try {
    validateGenerateDdlRequest({
      dialect: "mysql",
      tables: [
        {
          logicalTableName: "ProcessResults",
          physicalTableName: "process_results",
          columns: [
            { logicalName: "Unread", physicalName: "is_unread", dataType: "boolean", size: "2" },
          ],
        },
      ],
    });
    assert.fail("expected DdlValidationError");
  } catch (error) {
    assert.ok(error instanceof DdlValidationError);
    captured = error;
  }

  assert.ok(captured);
  assert.equal(captured.issues[0]?.issueCode, "TYPE_MUST_NOT_INCLUDE_SIZE");
});
