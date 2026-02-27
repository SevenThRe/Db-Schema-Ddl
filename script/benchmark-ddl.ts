import fs from "fs";
import path from "path";
import { performance } from "node:perf_hooks";
import type { TableInfo } from "@shared/schema";
import { parseWorkbookBundle } from "../server/lib/excel";
import { generateDDL, streamDDL } from "../server/lib/ddl";

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

function parseArgs(): {
  filePath: string;
  rounds: number;
  syntheticScales: number[];
} {
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

  const defaultFile = pickFirstExcelFromUploads();
  const filePath = path.resolve(argMap.get("file") ?? defaultFile ?? "");
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("No benchmark Excel file found. Pass --file <path-to-xlsx>.");
  }

  const rounds = Number(argMap.get("rounds") ?? "300");
  const syntheticScales = String(argMap.get("scales") ?? "100,500,1000")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);

  return {
    filePath,
    rounds: Number.isInteger(rounds) && rounds > 0 ? rounds : 300,
    syntheticScales: syntheticScales.length > 0 ? syntheticScales : [100, 500, 1000],
  };
}

function collectValidUniqueTables(filePath: string): TableInfo[] {
  const bundle = parseWorkbookBundle(filePath, {});
  const allTables = Object.values(bundle.tablesBySheet).flat();
  const result: TableInfo[] = [];
  const seen = new Set<string>();

  for (const table of allTables) {
    const key = (table.physicalTableName || "").toLowerCase().trim();
    if (!key || seen.has(key)) {
      continue;
    }
    try {
      generateDDL({
        tables: [table],
        dialect: "mysql",
      });
      result.push(table);
      seen.add(key);
    } catch {
      // Skip invalid tables for pure performance benchmark.
    }
  }

  return result;
}

function makeSyntheticTable(index: number, colsPerTable: number): TableInfo {
  return {
    logicalTableName: `table_${index}`,
    physicalTableName: `table_${index}`,
    columns: Array.from({ length: colsPerTable }).map((_, colIndex) => ({
      no: colIndex + 1,
      logicalName: `column_${colIndex}`,
      physicalName: `column_${colIndex}`,
      dataType: "varchar",
      size: "100",
      notNull: colIndex % 2 === 0,
      isPk: colIndex === 0,
      comment: "",
    })),
  };
}

async function benchmarkStreamWrite(tables: TableInfo[]) {
  let bytes = 0;
  const startedAt = performance.now();
  await streamDDL(
    {
      tables,
      dialect: "mysql",
    },
    (chunk) => {
      bytes += Buffer.byteLength(chunk, "utf8");
    },
  );
  const endedAt = performance.now();
  return {
    ms: +(endedAt - startedAt).toFixed(3),
    bytes,
  };
}

async function main() {
  const { filePath, rounds, syntheticScales } = parseArgs();
  const validTables = collectValidUniqueTables(filePath);
  const benchmarkTables = validTables.slice(0, Math.min(validTables.length, 120));
  if (benchmarkTables.length === 0) {
    throw new Error("No valid tables available for DDL benchmark.");
  }

  const tMysqlStart = performance.now();
  const mysqlDdl = generateDDL({
    tables: benchmarkTables,
    dialect: "mysql",
  });
  const tMysqlEnd = performance.now();

  const tOracleStart = performance.now();
  const oracleDdl = generateDDL({
    tables: benchmarkTables,
    dialect: "oracle",
  });
  const tOracleEnd = performance.now();

  let mysqlRoundsMs = 0;
  for (let i = 0; i < rounds; i++) {
    const startedAt = performance.now();
    generateDDL({
      tables: benchmarkTables,
      dialect: "mysql",
    });
    mysqlRoundsMs += performance.now() - startedAt;
  }

  const syntheticResults = [];
  for (const tableCount of syntheticScales) {
    const syntheticTables = Array.from({ length: tableCount }).map((_, index) => makeSyntheticTable(index, 30));
    const startedAt = performance.now();
    const ddl = generateDDL({
      tables: syntheticTables,
      dialect: "mysql",
    });
    const endedAt = performance.now();
    const streamed = await benchmarkStreamWrite(syntheticTables);
    syntheticResults.push({
      tableCount,
      colsPerTable: 30,
      stringBuildMs: +(endedAt - startedAt).toFixed(3),
      ddlChars: ddl.length,
      streamWriteMs: streamed.ms,
      streamBytes: streamed.bytes,
    });
  }

  const output = {
    file: filePath,
    validUniqueTables: validTables.length,
    benchmarkTables: benchmarkTables.length,
    mysqlMs: +(tMysqlEnd - tMysqlStart).toFixed(3),
    oracleMs: +(tOracleEnd - tOracleStart).toFixed(3),
    avgMysqlMsPerRound: +(mysqlRoundsMs / rounds).toFixed(3),
    mysqlChars: mysqlDdl.length,
    oracleChars: oracleDdl.length,
    rounds,
    syntheticResults,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error("[benchmark-ddl] failed", error);
  process.exitCode = 1;
});

