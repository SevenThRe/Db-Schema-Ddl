import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("table preview restores remembered selection only once per file-sheet scope", async () => {
  const source = await read("client/src/components/TablePreview.tsx");

  assert.match(source, /const restoredSelectionScopeRef = useRef<string \| null>\(null\);/);
  assert.match(source, /restoredSelectionScopeRef\.current = null;/);
  assert.match(source, /if \(restoredSelectionScopeRef\.current === tableSelectionStorageKey\) \{\s*return;\s*\}/);
  assert.match(source, /restoredSelectionScopeRef\.current = tableSelectionStorageKey;/);
});
