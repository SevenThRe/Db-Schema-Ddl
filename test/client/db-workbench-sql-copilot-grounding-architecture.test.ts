import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("sql copilot grounding delegates relation assembly and section rendering to focused modules", async () => {
  const grounding = await read(
    "client/src/components/extensions/db-workbench/sql-copilot-grounding.ts",
  );
  const relations = await read(
    "client/src/components/extensions/db-workbench/sql-copilot-grounding-relations.ts",
  );
  const sections = await read(
    "client/src/components/extensions/db-workbench/sql-copilot-prompt-sections.ts",
  );

  // The grounding file is the orchestrator: it owns the public package builder
  // and composes the relation and section modules.
  assert.match(grounding, /export function buildSqlCopilotPromptPackage/);
  assert.match(grounding, /from "\.\/sql-copilot-grounding-relations"/);
  assert.match(grounding, /from "\.\/sql-copilot-prompt-sections"/);
  assert.doesNotMatch(grounding, /function buildGroundingRelations/);
  assert.doesNotMatch(grounding, /function buildSchemaSection/);
  assert.doesNotMatch(grounding, /function buildSystemPrompt/);

  // Relation assembly owns schema snapshot -> grounded relation transforms.
  assert.match(relations, /export function buildGroundingRelations/);
  assert.match(relations, /export function collectPreferredRelationKeys/);
  assert.match(relations, /export function sortRelationsForGrounding/);
  assert.doesNotMatch(relations, /function buildSchemaSection/);

  // Section rendering owns prompt-text formatting and the grounding guardrails.
  assert.match(sections, /export function buildSchemaSection/);
  assert.match(sections, /export function buildMemoryPatternSection/);
  assert.match(sections, /export function buildValueProfileSection/);
  assert.match(sections, /export function buildSystemPrompt/);
  // The value-hint privacy guard (drop emails / long / non-alnum hints) stays here.
  assert.match(sections, /normalized\.includes\("@"\)/);
});
