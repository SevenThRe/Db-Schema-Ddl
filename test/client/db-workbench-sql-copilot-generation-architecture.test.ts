import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("sql copilot generation keeps the runtime path separate from the offline eval harness", async () => {
  const generation = await read(
    "client/src/components/extensions/db-workbench/sql-copilot-generation.ts",
  );
  const evaluation = await read(
    "client/src/components/extensions/db-workbench/sql-copilot-generation-evaluation.ts",
  );

  // The runtime generation module owns prompt building and draft parsing only.
  assert.match(generation, /export function buildSqlCopilotGenerationPromptPackage/);
  assert.match(generation, /export function parseSqlCopilotGeneratedDraft/);
  assert.doesNotMatch(generation, /export function evaluateSqlCopilotGenerationCases/);
  assert.doesNotMatch(generation, /export function renderSqlCopilotEvaluationArtifactMarkdown/);
  assert.doesNotMatch(generation, /interface SqlCopilotEvaluationCase/);

  // The eval harness lives in its own module and reuses the runtime parser.
  assert.match(evaluation, /from "\.\/sql-copilot-generation"/);
  assert.match(evaluation, /export function evaluateSqlCopilotGenerationCases/);
  assert.match(evaluation, /export function renderSqlCopilotEvaluationArtifactMarkdown/);
  assert.match(evaluation, /export interface SqlCopilotEvaluationCase/);
  assert.match(evaluation, /parseSqlCopilotGeneratedDraft/);
});
