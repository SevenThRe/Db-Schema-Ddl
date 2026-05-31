import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import type { DbQueryBatchResult } from "../../shared/schema.ts";
import {
  buildSqlMemorySuggestionKey,
  createEmptySqlWorkbenchMemory,
  extractSqlMemoryValueProfilesFromBatches,
  recordValueProfiles,
  sanitizeSqlWorkbenchMemory,
  updateSqlWorkbenchMemoryRetention,
} from "../../client/src/components/extensions/db-workbench/sql-memory.ts";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("sql memory facade only re-exports the codec, normalization, retention, and recorder modules", async () => {
  const facade = await read(
    "client/src/components/extensions/db-workbench/sql-memory.ts",
  );

  assert.match(facade, /from "\.\/sql-memory-types"/);
  assert.match(facade, /from "\.\/sql-memory-normalization"/);
  assert.match(facade, /from "\.\/sql-memory-codec"/);
  assert.match(facade, /from "\.\/sql-memory-retention"/);
  assert.match(facade, /from "\.\/sql-memory-recorder"/);

  // The facade carries no implementation of its own.
  assert.doesNotMatch(facade, /function sanitizeSqlWorkbenchMemory/);
  assert.doesNotMatch(facade, /function recordAcceptedSuggestion/);
  assert.doesNotMatch(facade, /function clearSqlWorkbenchMemory/);
  assert.doesNotMatch(facade, /function classifyObservedValue/);

  // Internal helpers stay internal — the original public surface is preserved.
  assert.doesNotMatch(facade, /\bnormalizeSqlPattern\b/);
  assert.doesNotMatch(facade, /\bsanitizeStringArray\b/);
});

test("sql memory modules own their respective responsibilities", async () => {
  const types = await read(
    "client/src/components/extensions/db-workbench/sql-memory-types.ts",
  );
  const normalization = await read(
    "client/src/components/extensions/db-workbench/sql-memory-normalization.ts",
  );
  const codec = await read(
    "client/src/components/extensions/db-workbench/sql-memory-codec.ts",
  );
  const retention = await read(
    "client/src/components/extensions/db-workbench/sql-memory-retention.ts",
  );
  const recorder = await read(
    "client/src/components/extensions/db-workbench/sql-memory-recorder.ts",
  );

  assert.match(types, /export interface SqlWorkbenchMemoryState/);
  assert.match(types, /export interface SqlMemoryValueProfile/);

  assert.match(normalization, /export function extractSqlMemoryValueProfilesFromBatches/);
  assert.match(normalization, /export function buildQueryMemoryPatternFromResponse/);
  assert.match(normalization, /function classifyObservedValue/);

  assert.match(codec, /export function sanitizeSqlWorkbenchMemory/);
  assert.match(codec, /export function createEmptySqlWorkbenchMemory/);
  assert.match(codec, /MAX_VALUE_PROFILES/);

  assert.match(retention, /export function clearSqlWorkbenchMemory/);
  assert.match(retention, /export function updateSqlWorkbenchMemoryRetention/);
  assert.match(retention, /export const DEFAULT_RETENTION/);

  assert.match(recorder, /export function recordAcceptedSuggestion/);
  assert.match(recorder, /export function recordQueryPattern/);
  assert.match(recorder, /export function recordValueProfiles/);
});

test("value profile extraction records distribution hints, never raw cell values", () => {
  const batch: DbQueryBatchResult = {
    sql: "SELECT email FROM users;",
    columns: [
      {
        name: "email",
        dataType: "varchar",
        sourceSchema: "public",
        sourceTable: "users",
        sourceColumn: "email",
      },
    ],
    rows: [
      { values: ["secret.person@example.com"] },
      { values: ["another.secret@example.com"] },
    ],
    totalRows: 2,
    returnedRows: 2,
    hasMore: false,
    pagingMode: "none",
    elapsedMs: 5,
    schema: "public",
  };

  const profiles = extractSqlMemoryValueProfilesFromBatches([batch], "public", "users");
  const serialized = JSON.stringify(profiles);
  assert.doesNotMatch(serialized, /secret\.person@example\.com/);
  assert.doesNotMatch(serialized, /another\.secret@example\.com/);
  const emailProfile = profiles.find((entry) => entry.column === "email");
  assert.ok(emailProfile, "expected an email value profile");
  assert.equal((emailProfile.exampleHints ?? []).includes("email-like"), true);

  // Recording into memory preserves the same privacy boundary.
  const memory = recordValueProfiles(createEmptySqlWorkbenchMemory(), profiles);
  const persisted = JSON.stringify(memory.valueProfiles);
  assert.doesNotMatch(persisted, /@example\.com/);
});

test("retention toggles flow through the facade and gate recorder writes", () => {
  const disabled = updateSqlWorkbenchMemoryRetention(createEmptySqlWorkbenchMemory(), {
    captureValueProfiles: false,
  });
  const unchanged = recordValueProfiles(disabled, [
    {
      schema: "public",
      relation: "users",
      column: "email",
      sampleCount: 3,
      observedKinds: ["email-like"],
    },
  ]);
  assert.equal(unchanged.valueProfiles.length, 0);

  const restored = sanitizeSqlWorkbenchMemory(disabled);
  assert.equal(restored.retention.captureValueProfiles, false);
  assert.equal(
    buildSqlMemorySuggestionKey({
      label: "Email",
      kind: "column",
      schema: "Public",
      relation: "Users",
      column: "Email",
    }),
    "column::email::public::users::email",
  );
});
