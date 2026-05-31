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

test("sql semantic relation analysis owns relation and binding helpers", async () => {
  const relationAnalysis = await read(
    "client/src/components/extensions/db-workbench/sql-semantic-relation-analysis.ts",
  );
  const statementAnalysis = await read(
    "client/src/components/extensions/db-workbench/sql-semantic-statement-analysis.ts",
  );

  assert.match(statementAnalysis, /from "\.\/sql-semantic-relation-analysis"/);
  assert.match(relationAnalysis, /export function parseStatementCtes/);
  assert.match(relationAnalysis, /export function inferProjectedColumns/);
  assert.match(relationAnalysis, /export function collectVisibleRelationBindings/);
  assert.match(relationAnalysis, /export function resolveMemberAccess/);
});

test("sql semantic context facade only re-exports statement, diagnostics, and hover modules", async () => {
  const facade = await read(
    "client/src/components/extensions/db-workbench/sql-semantic-context.ts",
  );
  const statementAnalysis = await read(
    "client/src/components/extensions/db-workbench/sql-semantic-statement-analysis.ts",
  );
  const diagnostics = await read(
    "client/src/components/extensions/db-workbench/sql-semantic-diagnostics.ts",
  );
  const hover = await read(
    "client/src/components/extensions/db-workbench/sql-semantic-hover.ts",
  );

  assert.match(facade, /export \{ analyzeSqlContext \} from "\.\/sql-semantic-statement-analysis"/);
  assert.match(facade, /export \{ collectSemanticDiagnostics \} from "\.\/sql-semantic-diagnostics"/);
  assert.match(facade, /export \{ resolveSemanticHoverSymbol \} from "\.\/sql-semantic-hover"/);

  // The facade carries no analyzer implementation of its own.
  assert.doesNotMatch(facade, /function analyzeSqlContext/);
  assert.doesNotMatch(facade, /function collectStatementDiagnostics/);
  assert.doesNotMatch(facade, /function resolveSemanticHoverSymbol/);
  assert.doesNotMatch(facade, /function buildClauseSpans/);

  assert.match(statementAnalysis, /export function analyzeSqlContext/);
  assert.match(statementAnalysis, /export function buildClauseSpans/);
  assert.match(statementAnalysis, /export function detectStatementKind/);
  assert.match(statementAnalysis, /export function resolveStatementRanges/);

  assert.match(diagnostics, /export function collectSemanticDiagnostics/);
  assert.match(diagnostics, /from "\.\/sql-semantic-statement-analysis"/);

  assert.match(hover, /export function resolveSemanticHoverSymbol/);
  assert.match(hover, /from "\.\/sql-semantic-statement-analysis"/);
});
