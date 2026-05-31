import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildSqlMemoryDialogScope,
  normalizeMemoryIdentifier,
} from "../../client/src/components/extensions/db-workbench/sql-memory-dialog-model";
import type { SqlWorkbenchMemoryState } from "../../client/src/components/extensions/db-workbench/sql-memory";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("sql memory dialog delegates scope rules and heavy rendering to focused modules", async () => {
  const dialog = await read(
    "client/src/components/extensions/db-workbench/SqlMemoryDialog.tsx",
  );
  const model = await read(
    "client/src/components/extensions/db-workbench/sql-memory-dialog-model.ts",
  );
  const sections = await read(
    "client/src/components/extensions/db-workbench/sql-memory-dialog-sections.tsx",
  );

  assert.match(dialog, /buildSqlMemoryDialogScope/);
  assert.match(dialog, /<SqlMemoryDialogContent/);
  assert.doesNotMatch(dialog, /Accepted suggestions/);
  assert.doesNotMatch(dialog, /Retention controls/);
  assert.doesNotMatch(dialog, /normalizeMemoryIdentifier/);

  assert.match(model, /normalizeMemoryIdentifier/);
  assert.match(model, /buildSqlMemoryDialogScope/);
  assert.match(model, /patternMatchesSchema/);

  assert.match(sections, /Accepted suggestions/);
  assert.match(sections, /Retention controls/);
  assert.match(sections, /Clear current schema/);
  assert.match(sections, /Clear all memory/);
});

test("sql memory dialog scope model keeps current schema counts deterministic", () => {
  const memory: SqlWorkbenchMemoryState = {
    retention: {
      trackAcceptedSuggestions: true,
      trackQueryPatterns: true,
      captureValueProfiles: true,
    },
    acceptedSuggestions: [
      {
        key: "public.users.email",
        label: "email",
        kind: "column",
        schema: "Public",
        relation: "users",
        column: "email",
        count: 2,
        lastAcceptedAt: "2026-04-18T12:00:00.000Z",
      },
      {
        key: "audit.events.id",
        label: "id",
        kind: "column",
        schema: "audit",
        relation: "events",
        column: "id",
        count: 1,
        lastAcceptedAt: "2026-04-18T12:00:00.000Z",
      },
    ],
    queryPatterns: [
      {
        key: "pattern-public",
        summary: "users query",
        schema: null,
        statementKind: "select",
        patternSql: "SELECT * FROM users",
        relationKeys: ["public.users"],
        columnKeys: ["public.users.email"],
        count: 1,
        lastExecutedAt: "2026-04-18T12:00:00.000Z",
      },
      {
        key: "pattern-audit",
        summary: "events query",
        schema: "audit",
        statementKind: "select",
        patternSql: "SELECT * FROM events",
        relationKeys: ["audit.events"],
        columnKeys: [],
        count: 1,
        lastExecutedAt: "2026-04-18T12:00:00.000Z",
      },
    ],
    valueProfiles: [
      {
        key: "public.users.email",
        schema: "public",
        relation: "users",
        column: "email",
        sampleCount: 10,
        nullCount: 0,
        observedKinds: ["email-like"],
        exampleHints: ["email-like"],
        lastObservedAt: "2026-04-18T12:00:00.000Z",
      },
    ],
  };

  assert.equal(normalizeMemoryIdentifier(" Public "), "public");

  const scope = buildSqlMemoryDialogScope(memory, "public");
  assert.equal(scope.acceptedInScope.length, 1);
  assert.equal(scope.patternsInScope.length, 1);
  assert.equal(scope.valueProfilesInScope.length, 1);
  assert.equal(scope.acceptedInScope[0]?.key, "public.users.email");
  assert.equal(scope.patternsInScope[0]?.key, "pattern-public");
});
