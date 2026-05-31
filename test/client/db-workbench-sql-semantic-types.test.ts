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
