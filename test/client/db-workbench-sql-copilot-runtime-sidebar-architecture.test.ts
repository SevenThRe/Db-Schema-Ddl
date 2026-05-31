import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("sql copilot runtime sidebar delegates settings and discovery sections", async () => {
  const sidebar = await read(
    "client/src/components/extensions/db-workbench/SqlCopilotRuntimeSidebar.tsx",
  );
  const sections = await read(
    "client/src/components/extensions/db-workbench/sql-copilot-runtime-sidebar-sections.tsx",
  );

  assert.match(sidebar, /<SqlCopilotRuntimeSettingsSection/);
  assert.match(sidebar, /<SqlCopilotDiscoveredRuntimesSection/);
  assert.doesNotMatch(sidebar, /Runtime settings/);
  assert.doesNotMatch(sidebar, /Discovered runtimes/);
  assert.doesNotMatch(sidebar, /Ollama base URL/);
  assert.doesNotMatch(sidebar, /llama\.cpp CLI path/);

  assert.match(sections, /Runtime settings/);
  assert.match(sections, /Discovered runtimes/);
  assert.match(sections, /Ollama base URL/);
  assert.match(sections, /llama\.cpp CLI path/);
  assert.match(sections, /Save runtime settings/);
  assert.match(sections, /RuntimeDetail/);
});
