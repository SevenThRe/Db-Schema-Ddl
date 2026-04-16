import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCompletedMetadata,
  parseFlowCheckpoints,
} from "../../script/workbench-live-verification";

test("live verification parser reads flow checkpoints and completion metadata from smoke log", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "db-workbench-live-"));
  const logPath = path.join(tempDir, "live.log");
  fs.writeFileSync(
    logPath,
    [
      '[checkpoint:db_workbench_live_flow] {"driver":"mysql","flowId":"connect","status":"passed","note":"connected"}',
      '[checkpoint:db_workbench_live_flow] {"driver":"mysql","flowId":"query","status":"passed","note":"query ok"}',
      '[checkpoint:db_workbench_live_completed] {"driver":"mysql","connectionName":"Local MySQL","database":"app","readonly":false,"status":"passed","note":"done"}',
    ].join("\n"),
    "utf8",
  );

  const flows = parseFlowCheckpoints(logPath, "mysql");
  const completion = parseCompletedMetadata(logPath, "mysql");

  assert.equal(flows.find((flow) => flow.id === "connect")?.status, "passed");
  assert.equal(flows.find((flow) => flow.id === "query")?.note, "query ok");
  assert.equal(flows.find((flow) => flow.id === "export")?.status, "skipped");
  assert.equal(completion.connectionLabel, "Local MySQL");
  assert.equal(completion.database, "app");
  assert.equal(completion.readonly, false);
  assert.equal(completion.completionStatus, "passed");
});
