import fs from "fs";
import path from "path";
import crypto from "crypto";
import { performance } from "node:perf_hooks";
import { runParseWorkbookBundle, shutdownExcelExecutor } from "../server/lib/excel-executor";
import type { ParseOptions } from "../server/lib/excel";

interface BenchmarkOptions {
  filePath: string;
  concurrencyList: number[];
  parseOptions: ParseOptions;
}

function parseArgs(): BenchmarkOptions {
  const args = process.argv.slice(2);
  const argMap = new Map<string, string>();

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token.startsWith("--")) {
      const key = token.replace(/^--/, "");
      const value = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "true";
      argMap.set(key, value);
    }
  }

  const explicitFilePath = argMap.get("file");
  const fallbackFilePath = pickFirstExcelFromUploads();
  const filePath = explicitFilePath ?? fallbackFilePath;
  if (!filePath) {
    throw new Error("No benchmark file found. Pass --file <path-to-xlsx>.");
  }

  const concurrencyRaw = argMap.get("concurrency") ?? "1,3,5";
  const concurrencyList = concurrencyRaw
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  if (concurrencyList.length === 0) {
    throw new Error("Invalid --concurrency value. Example: --concurrency 1,3,5");
  }

  const maxConsecutiveEmptyRows = Number(argMap.get("max-empty") ?? "10");
  const pkMarkers = (argMap.get("pk-markers") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return {
    filePath,
    concurrencyList,
    parseOptions: {
      maxConsecutiveEmptyRows: Number.isInteger(maxConsecutiveEmptyRows) ? maxConsecutiveEmptyRows : 10,
      pkMarkers,
    },
  };
}

function pickFirstExcelFromUploads(): string | null {
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    return null;
  }
  const candidates = fs
    .readdirSync(uploadsDir)
    .filter((name) => name.toLowerCase().endsWith(".xlsx") || name.toLowerCase().endsWith(".xls"))
    .map((name) => path.join(uploadsDir, name));
  return candidates[0] ?? null;
}

function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function runSingle(
  filePath: string,
  parseOptions: ParseOptions,
  cacheKeySeed: string,
): Promise<{
  wallMs: number;
  cacheHit: boolean;
  stats: {
    parseMode: string;
    readMode: string;
    readFallbackTriggered: boolean;
    totalMs: number;
    xlsxReadMs: number;
    sheetJsonMs: number;
    extractMs: number;
    sheetCount: number;
    fallbackSheetCount: number;
  };
}> {
  const startedAt = performance.now();
  const bundle = await runParseWorkbookBundle(filePath, parseOptions, cacheKeySeed);
  const wallMs = performance.now() - startedAt;
  return {
    wallMs,
    cacheHit: bundle.stats.cacheHit,
    stats: {
      parseMode: bundle.stats.parseMode,
      readMode: bundle.stats.readMode,
      readFallbackTriggered: bundle.stats.readFallbackTriggered,
      totalMs: bundle.stats.totalMs,
      xlsxReadMs: bundle.stats.xlsxReadMs,
      sheetJsonMs: bundle.stats.sheetJsonMs,
      extractMs: bundle.stats.extractMs,
      sheetCount: bundle.stats.sheetCount,
      fallbackSheetCount: bundle.stats.fallbackSheetCount,
    },
  };
}

async function runConcurrencyBatch(
  filePath: string,
  parseOptions: ParseOptions,
  concurrency: number,
  cacheKeyBase: string,
): Promise<{
  concurrency: number;
  wallMs: number;
  avgTaskWallMs: number;
  cacheHitCount: number;
  parseModeSet: string[];
}> {
  const startedAt = performance.now();
  const tasks = await Promise.all(
    Array.from({ length: concurrency }).map((_, idx) =>
      runSingle(filePath, parseOptions, `${cacheKeyBase}-${idx}`),
    ),
  );
  const wallMs = performance.now() - startedAt;
  const avgTaskWallMs = tasks.reduce((acc, item) => acc + item.wallMs, 0) / Math.max(1, tasks.length);
  const cacheHitCount = tasks.filter((item) => item.cacheHit).length;
  const parseModeSet = Array.from(new Set(tasks.map((item) => item.stats.parseMode)));

  return {
    concurrency,
    wallMs,
    avgTaskWallMs,
    cacheHitCount,
    parseModeSet,
  };
}

async function main() {
  const options = parseArgs();
  const resolvedFilePath = path.resolve(options.filePath);
  if (!fs.existsSync(resolvedFilePath)) {
    throw new Error(`File not found: ${resolvedFilePath}`);
  }

  const fileHash = sha256File(resolvedFilePath);
  try {
    const coldKey = `${fileHash}-cold-${Date.now()}`;
    const warmKey = `${fileHash}-warm`;

    const coldRun = await runSingle(resolvedFilePath, options.parseOptions, coldKey);
    const warmPrime = await runSingle(resolvedFilePath, options.parseOptions, warmKey);
    const warmHit = await runSingle(resolvedFilePath, options.parseOptions, warmKey);

    const concurrencyResults = [];
    for (const level of options.concurrencyList) {
      const result = await runConcurrencyBatch(
        resolvedFilePath,
        options.parseOptions,
        level,
        `${fileHash}-concurrency-${level}-${Date.now()}`,
      );
      concurrencyResults.push(result);
    }

    const output = {
      file: resolvedFilePath,
      fileSize: fs.statSync(resolvedFilePath).size,
      coldRun,
      warmPrime,
      warmHit,
      concurrencyResults,
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await shutdownExcelExecutor();
  }
}

main().catch((error) => {
  console.error("[benchmark-excel-parse] failed", error);
  process.exitCode = 1;
});
