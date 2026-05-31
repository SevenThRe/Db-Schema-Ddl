import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { liveVerificationFlowIdSchema } from "../../shared/release-verification";
import { runDesktopPreflight } from "../../script/desktop-preflight";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("release gate docs map primary surfaces to real verification assets", async () => {
  const contract = await read(
    ".specify/specs/020-db-workbench-productization/contracts/runtime-reliability-gates.md",
  );
  const releaseDoc = await read("docs/release-candidate-verification.md");
  const journeyDoc = await read("docs/db-workbench-operator-journey.md");

  assert.match(contract, /Connection Center \(`Primary Support`\)/);
  assert.match(contract, /SQL Daily-Driver \(`Primary`\)/);
  assert.match(contract, /Results \/ Inspection \/ Edit Guardrails \(`Primary`\)/);
  assert.match(contract, /operator journey/i);
  assert.match(contract, /test\/client\/db-workbench-runtime-phase26\.test\.ts/);
  assert.match(contract, /npm run verify:desktop:live -- --driver=mysql/);
  assert.match(contract, /### Data Sync/);
  assert.match(releaseDoc, /Connection Center/);
  assert.match(releaseDoc, /SQL Daily Driver/);
  assert.match(releaseDoc, /db-workbench-operator-journey\.md/);
  assert.match(releaseDoc, /Data Sync/);
  assert.match(releaseDoc, /stale-response protection/);
  assert.match(journeyDoc, /Connection Center -> Database Workspace/);
  assert.match(journeyDoc, /guarded edit\/apply -> audit/);

  for (const flowId of liveVerificationFlowIdSchema.options) {
    assert.match(releaseDoc, new RegExp(flowId));
  }
});

test("release gate matrix stays anchored to the current tauri verification seam", () => {
  const preflight = runDesktopPreflight(process.cwd());

  assert.equal(preflight.ok, true);
  assert.ok(preflight.checks.some((check) => check.id === "tauri-verification-scripts" && check.ok));
  assert.ok(preflight.checks.some((check) => check.id === "smoke-checkpoint-command" && check.ok));
  assert.ok(preflight.checks.some((check) => check.id === "frontend-smoke-entry" && check.ok));
});
