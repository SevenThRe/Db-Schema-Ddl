import { spawnSync } from "node:child_process";

const WHITEBOX_TEST_FILES = [
  "test/server/ddl-validation.test.ts",
  "test/server/extensions-catalog.test.ts",
  "test/server/db-diff-phase4.test.ts",
  "test/server/mysql-introspection-normalizer.test.ts",
  "test/server/excel-executor.test.ts",
  "test/server/excel-executor-coverage.test.ts",
  "test/server/excel-parser-whitebox.test.ts",
  "test/server/logger.test.ts",
  "test/server/template-phase2.test.ts",
  "test/electron/db-credential-vault.test.ts",
  "test/electron/extensions-delivery.test.ts",
  "test/client/db-management-ui.test.tsx",
  "test/client/extension-management-ui.test.tsx",
  "test/client/template-phase2-ui.test.tsx",
] as const;

for (const file of WHITEBOX_TEST_FILES) {
  const result = spawnSync(process.execPath, ["--test", "--import", "tsx", file], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
