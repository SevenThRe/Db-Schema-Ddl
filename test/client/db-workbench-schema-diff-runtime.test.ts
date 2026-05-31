import test from "node:test";
import assert from "node:assert/strict";
import type {
  DbSchemaDiffResult,
  DbSchemaSnapshot,
} from "../../shared/schema";
import {
  createEmptySchemaDiffState,
  createSchemaDiffFailureState,
  createSchemaDiffSuccessState,
} from "../../client/src/components/extensions/db-workbench/schema-diff-runtime";

const snapshot: DbSchemaSnapshot = {
  connectionId: "conn-a",
  capturedAt: "2026-05-31T00:00:00.000Z",
  driver: "postgres",
  database: "app",
  schema: "public",
  tables: [],
};

const diffResult: DbSchemaDiffResult = {
  sourceLabel: "source",
  targetLabel: "target",
  addedTables: 0,
  removedTables: 0,
  modifiedTables: 0,
  unchangedTables: 0,
  tableDiffs: [],
};

test("schema diff runtime builds empty and success states", () => {
  assert.deepEqual(createEmptySchemaDiffState("Select a target connection before compare."), {
    sourceSnapshot: null,
    targetSnapshot: null,
    result: null,
    issue: "Select a target connection before compare.",
  });

  assert.deepEqual(
    createSchemaDiffSuccessState({
      sourceSnapshot: snapshot,
      targetSnapshot: { ...snapshot, connectionId: "conn-b" },
      result: diffResult,
    }),
    {
      sourceSnapshot: snapshot,
      targetSnapshot: { ...snapshot, connectionId: "conn-b" },
      result: diffResult,
      issue: null,
    },
  );
});

test("schema diff runtime centralizes failure state and notice", () => {
  const failure = createSchemaDiffFailureState(new Error("target offline"));

  assert.deepEqual(failure.state, {
    sourceSnapshot: null,
    targetSnapshot: null,
    result: null,
    issue: "target offline",
  });
  assert.deepEqual(failure.notice, {
    title: "Schema compare failed",
    description: "target offline",
    variant: "destructive",
  });
});
