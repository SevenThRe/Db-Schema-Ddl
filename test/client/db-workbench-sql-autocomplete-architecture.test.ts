import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("sql autocomplete facade delegates adaptive memory ranking", async () => {
  const autocomplete = await read(
    "client/src/components/extensions/db-workbench/sql-autocomplete.ts",
  );
  const memoryRanking = await read(
    "client/src/components/extensions/db-workbench/sql-autocomplete-memory-ranking.ts",
  );

  assert.match(autocomplete, /sortCompletionItemsWithMemory/);
  assert.doesNotMatch(autocomplete, /buildSqlMemorySuggestionKey/);
  assert.doesNotMatch(autocomplete, /toSqlMemoryColumnKey/);
  assert.doesNotMatch(autocomplete, /function getAdaptiveCompletionScore/);
  assert.doesNotMatch(autocomplete, /function extractSortBucket/);

  assert.match(memoryRanking, /buildSqlMemorySuggestionKey/);
  assert.match(memoryRanking, /toSqlMemoryColumnKey/);
  assert.match(memoryRanking, /export function getAdaptiveCompletionScore/);
  assert.match(memoryRanking, /export function sortCompletionItemsWithMemory/);
});

test("sql autocomplete facade delegates completion item builders", async () => {
  const autocomplete = await read(
    "client/src/components/extensions/db-workbench/sql-autocomplete.ts",
  );
  const itemBuilders = await read(
    "client/src/components/extensions/db-workbench/sql-autocomplete-item-builders.ts",
  );

  assert.match(autocomplete, /from "\.\/sql-autocomplete-item-builders"/);
  assert.match(autocomplete, /buildKeywordItems/);
  assert.match(autocomplete, /buildJoinTemplateItems/);
  assert.doesNotMatch(autocomplete, /function buildKeywordItems/);
  assert.doesNotMatch(autocomplete, /DRIVER_FUNCTION_ITEMS/);
  assert.doesNotMatch(autocomplete, /JOIN \$\{relation\.name\} via FK/);

  assert.match(itemBuilders, /export function buildKeywordItems/);
  assert.match(itemBuilders, /export function buildJoinTemplateItems/);
  assert.match(itemBuilders, /DRIVER_FUNCTION_ITEMS/);
  assert.match(itemBuilders, /JOIN \$\{relation\.name\} via FK/);
});
