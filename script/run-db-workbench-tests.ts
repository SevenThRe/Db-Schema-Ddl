import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TEST_ROOTS = [
  path.join(ROOT, "test", "client"),
  path.join(ROOT, "test", "server"),
] as const;

const WORKBENCH_TEST_PATTERNS = [
  /^db-workbench-.*\.test\.(ts|tsx)$/,
  /^job-center-phase\d+\.test\.ts$/,
  /^release-verification-live-runner\.test\.ts$/,
] as const;

function collectFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(absolutePath);
    }
    return entry.isFile() ? [absolutePath] : [];
  });
}

function isWorkbenchTest(filePath: string): boolean {
  const fileName = path.basename(filePath);
  return WORKBENCH_TEST_PATTERNS.some((pattern) => pattern.test(fileName));
}

function listWorkbenchTests(): string[] {
  return TEST_ROOTS
    .flatMap((directory) => collectFiles(directory))
    .filter((filePath) => isWorkbenchTest(filePath))
    .map((filePath) => path.relative(ROOT, filePath))
    .sort((left, right) => left.localeCompare(right));
}

function runWorkbenchTest(relativePath: string): number {
  console.log(`\n==> ${relativePath}`);
  const result = spawnSync(
    process.execPath,
    ["--test", "--import", "tsx", relativePath],
    {
      cwd: ROOT,
      stdio: "inherit",
    },
  );

  return result.status ?? 1;
}

const testFiles = listWorkbenchTests();
if (process.argv.includes("--list")) {
  if (testFiles.length === 0) {
    console.error("No DB workbench tests were found.");
    process.exit(1);
  }
  console.log(testFiles.join("\n"));
  process.exit(0);
}

if (testFiles.length === 0) {
  console.error("No DB workbench tests were found.");
  process.exit(1);
}

const failedFiles: string[] = [];
for (const testFile of testFiles) {
  const exitCode = runWorkbenchTest(testFile);
  if (exitCode !== 0) {
    failedFiles.push(testFile);
  }
}

if (failedFiles.length > 0) {
  console.error("\nDB workbench test suite failed:");
  for (const failedFile of failedFiles) {
    console.error(`- ${failedFile}`);
  }
  process.exit(1);
}

console.log(`\nDB workbench test suite passed (${testFiles.length} files).`);
