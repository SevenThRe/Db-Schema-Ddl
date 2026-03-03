import test from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "../../server/lib/logger";

const ENV_KEYS = ["MCP_DEBUG", "DEBUG"] as const;
type EnvSnapshot = Record<(typeof ENV_KEYS)[number], string | undefined>;

function snapshotEnv(): EnvSnapshot {
  return {
    MCP_DEBUG: process.env.MCP_DEBUG,
    DEBUG: process.env.DEBUG,
  };
}

function restoreEnv(snapshot: EnvSnapshot): void {
  ENV_KEYS.forEach((key) => {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
}

function withCapturedStderr(run: () => void): string[] {
  const originalWrite = process.stderr.write.bind(process.stderr);
  const lines: string[] = [];

  process.stderr.write = ((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  try {
    run();
  } finally {
    process.stderr.write = originalWrite;
  }

  return lines;
}

test("createLogger suppresses debug output when debug is disabled", () => {
  const backup = snapshotEnv();
  process.env.MCP_DEBUG = "0";
  process.env.DEBUG = "";

  try {
    const lines = withCapturedStderr(() => {
      const logger = createLogger("logger-test");
      logger.debug("hidden-debug", { step: 1 });
      logger.info("info-line");
      logger.warn("warn-line");
      logger.error("error-line");
    });

    assert.equal(lines.length, 3);
    assert.ok(lines.some((line) => line.includes("[INFO] info-line")));
    assert.ok(lines.some((line) => line.includes("[WARN] warn-line")));
    assert.ok(lines.some((line) => line.includes("[ERROR] error-line")));
    assert.ok(lines.every((line) => !line.includes("hidden-debug")));
  } finally {
    restoreEnv(backup);
  }
});

test("createLogger emits debug output when MCP_DEBUG enables debug mode", () => {
  const backup = snapshotEnv();
  process.env.MCP_DEBUG = "1";
  process.env.DEBUG = "";

  try {
    const lines = withCapturedStderr(() => {
      const logger = createLogger("logger-test");
      logger.debug("debug-line", { enabled: true });
    });

    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes("[DEBUG] debug-line"));
    assert.ok(lines[0].includes('"enabled":true'));
  } finally {
    restoreEnv(backup);
  }
});

test("restoreEnv deletes keys when snapshot value is undefined", () => {
  process.env.MCP_DEBUG = "temporary";
  process.env.DEBUG = "temporary";

  restoreEnv({
    MCP_DEBUG: undefined,
    DEBUG: "mcp",
  });

  assert.equal(process.env.MCP_DEBUG, undefined);
  assert.equal(process.env.DEBUG, "mcp");
});
