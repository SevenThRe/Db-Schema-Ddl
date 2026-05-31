import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("sql semantic contracts live outside the analyzer implementation", async () => {
  const types = await read(
    "client/src/components/extensions/db-workbench/sql-semantic-types.ts",
  );
  const analyzer = await read(
    "client/src/components/extensions/db-workbench/sql-semantic-context.ts",
  );
  const copilotGeneration = await read(
    "client/src/components/extensions/db-workbench/sql-copilot-generation.ts",
  );

  assert.match(types, /export interface SqlSemanticAnalysis/);
  assert.match(types, /export interface SqlSemanticDiagnostic/);
  assert.match(analyzer, /from "\.\/sql-semantic-types"/);
  assert.match(analyzer, /export type \{/);
  assert.match(copilotGeneration, /from "\.\/sql-semantic-types"/);
  assert.doesNotMatch(analyzer, /export interface SqlSemanticAnalysis \{/);
  assert.doesNotMatch(analyzer, /export interface SqlSemanticDiagnostic \{/);
});

test("sql semantic analyzer delegates relation and binding analysis", async () => {
  const analyzer = await read(
    "client/src/components/extensions/db-workbench/sql-semantic-context.ts",
  );
  const relationAnalysis = await read(
    "client/src/components/extensions/db-workbench/sql-semantic-relation-analysis.ts",
  );

  assert.match(analyzer, /from "\.\/sql-semantic-relation-analysis"/);
  assert.doesNotMatch(analyzer, /function parseStatementCtes/);
  assert.doesNotMatch(analyzer, /function inferProjectedColumns/);
  assert.doesNotMatch(analyzer, /function collectVisibleRelationBindings/);
  assert.doesNotMatch(analyzer, /function resolveMemberAccess/);

  assert.match(relationAnalysis, /export function parseStatementCtes/);
  assert.match(relationAnalysis, /export function inferProjectedColumns/);
  assert.match(relationAnalysis, /export function collectVisibleRelationBindings/);
  assert.match(relationAnalysis, /export function resolveMemberAccess/);
});
